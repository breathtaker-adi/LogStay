// src/lib/purge-photos.ts
// Pure business logic for statutory guest ID photo retention and automated purge

export const PHOTO_RETENTION_DAYS = 180; // 6 months, matching privacy policy statutory declaration

export interface ExpiredGuestRecord {
  id: string;
  id_photo_path: string;
  id_photo_expires_at?: string;
  id_deleted_at?: string | null;
}

export interface PurgeDbClient {
  fetchExpiredGuests(nowIso: string, limit: number): Promise<{ data: ExpiredGuestRecord[] | null; error: any }>;
  markGuestsPurged(ids: string[], deletedAtIso: string): Promise<{ error: any }>;
}

export interface PurgeStorageClient {
  deletePhotos(paths: string[]): Promise<{ error: any }>;
}

/**
 * Computes exact expiry date: check-in date + retention days (180 days).
 */
export function calculatePhotoExpiry(checkInDate: Date | string, retentionDays: number = PHOTO_RETENTION_DAYS): Date {
  const d = new Date(checkInDate);
  d.setDate(d.getDate() + retentionDays);
  return d;
}

/**
 * Validates edge function cron secret authorization header.
 */
export function validateCronSecret(
  incomingSecret?: string | null,
  configuredSecret?: string | null
): boolean {
  if (!incomingSecret || !configuredSecret) return false;
  return incomingSecret === configuredSecret;
}

/**
 * Executes statutory photo purge enforcing invariant:
 * STORAGE DELETION HAPPENS BEFORE DATABASE RECORD UPDATE.
 * If storage delete fails, database rows are NEVER marked purged.
 */
export async function executePhotoPurge(
  db: PurgeDbClient,
  storage: PurgeStorageClient,
  now: Date = new Date(),
  limit: number = 200
): Promise<{ success: boolean; purged: number; status: string; error?: string }> {
  const nowIso = now.toISOString();

  // 1. Fetch expired, not-yet-purged guests with photo paths
  const { data: expired, error: fetchErr } = await db.fetchExpiredGuests(nowIso, limit);
  if (fetchErr) {
    return { success: false, purged: 0, status: 'fetch_error', error: fetchErr.message || 'Database fetch error' };
  }

  if (!expired || expired.length === 0) {
    return { success: true, purged: 0, status: 'none' };
  }

  // 2. FILES FIRST — delete from storage bucket. Never update DB first.
  const photoPaths = expired.map((g) => g.id_photo_path).filter(Boolean);
  const { error: storageErr } = await storage.deletePhotos(photoPaths);

  if (storageErr) {
    // ABORT: Database update is NOT called!
    return {
      success: false,
      purged: 0,
      status: 'storage_error',
      error: storageErr.message || 'Storage delete error',
    };
  }

  // 3. Mark rows deleted only after storage delete has confirmed success
  const guestIds = expired.map((g) => g.id);
  const { error: updateErr } = await db.markGuestsPurged(guestIds, nowIso);

  if (updateErr) {
    return {
      success: false,
      purged: 0,
      status: 'db_update_error',
      error: updateErr.message || 'Database update error',
    };
  }

  return { success: true, purged: expired.length, status: 'purged' };
}

