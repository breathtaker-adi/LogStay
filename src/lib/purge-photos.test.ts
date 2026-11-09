import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  PHOTO_RETENTION_DAYS,
  calculatePhotoExpiry,
  validateCronSecret,
  executePhotoPurge,
  PurgeDbClient,
  PurgeStorageClient,
  ExpiredGuestRecord,
} from './purge-photos';

describe('src/lib/purge-photos.ts & Edge Function (Statutory Photo Purge)', () => {
  let mockGuestsTable: ExpiredGuestRecord[];
  let deletedStoragePaths: string[];
  let dbClient: PurgeDbClient;
  let storageClient: PurgeStorageClient;

  beforeEach(() => {
    mockGuestsTable = [
      {
        id: 'g1',
        id_photo_path: 'prop1/g1_photo.jpg',
        id_photo_expires_at: '2026-04-01T00:00:00Z', // Expired
        id_deleted_at: null,
      },
      {
        id: 'g2',
        id_photo_path: 'prop1/g2_photo.jpg',
        id_photo_expires_at: '2026-04-10T00:00:00Z', // Expired
        id_deleted_at: null,
      },
      {
        id: 'g3',
        id_photo_path: 'prop1/g3_photo.jpg',
        id_photo_expires_at: '2026-12-01T00:00:00Z', // Active (not expired)
        id_deleted_at: null,
      },
    ];

    deletedStoragePaths = [];

    dbClient = {
      fetchExpiredGuests: vi.fn(async (nowIso: string, limit: number) => {
        const expired = mockGuestsTable
          .filter(
            (g) =>
              g.id_photo_expires_at &&
              g.id_photo_expires_at <= nowIso &&
              g.id_deleted_at === null &&
              Boolean(g.id_photo_path)
          )
          .slice(0, limit);
        return { data: expired, error: null };
      }),
      markGuestsPurged: vi.fn(async (ids: string[], deletedAtIso: string) => {
        for (const id of ids) {
          const row = mockGuestsTable.find((g) => g.id === id);
          if (row) {
            row.id_deleted_at = deletedAtIso;
            row.id_photo_path = '';
          }
        }
        return { error: null };
      }),
    };

    storageClient = {
      deletePhotos: vi.fn(async (paths: string[]) => {
        deletedStoragePaths.push(...paths);
        return { error: null };
      }),
    };
  });

  describe('Retention Period & Expiration Calculation', () => {
    it('defines photo retention as 180 days (6 months)', () => {
      expect(PHOTO_RETENTION_DAYS).toBe(180);
    });

    it('calculates exact expiry 180 days from check-in', () => {
      const checkIn = new Date('2026-01-01T00:00:00Z');
      const expiry = calculatePhotoExpiry(checkIn);
      const diffDays = Math.round((expiry.getTime() - checkIn.getTime()) / (1000 * 60 * 60 * 24));
      expect(diffDays).toBe(180);
    });
  });

  describe('Cron Secret Header Authentication', () => {
    it('accepts matching secret header', () => {
      expect(validateCronSecret('super-secret-cron-key-123', 'super-secret-cron-key-123')).toBe(true);
    });

    it('rejects missing or mismatched header secrets (yielding 401)', () => {
      expect(validateCronSecret(null, 'secret')).toBe(false);
      expect(validateCronSecret(undefined, 'secret')).toBe(false);
      expect(validateCronSecret('', 'secret')).toBe(false);
      expect(validateCronSecret('wrong-secret', 'secret')).toBe(false);
      expect(validateCronSecret('secret', null)).toBe(false);
    });
  });

  describe('Storage First Invariant & Execution Flow', () => {
    const fixedNow = new Date('2026-10-15T10:00:00Z');

    it('deletes files from storage FIRST before updating database rows', async () => {
      const callOrder: string[] = [];

      storageClient.deletePhotos = vi.fn(async (paths: string[]) => {
        callOrder.push('storage_delete');
        deletedStoragePaths.push(...paths);
        return { error: null };
      });

      const origMark = dbClient.markGuestsPurged;
      dbClient.markGuestsPurged = vi.fn(async (ids: string[], iso: string) => {
        callOrder.push('db_update');
        return origMark(ids, iso);
      });

      const res = await executePhotoPurge(dbClient, storageClient, fixedNow);

      expect(res.success).toBe(true);
      expect(res.purged).toBe(2);
      expect(callOrder).toEqual(['storage_delete', 'db_update']); // Invariant verified: storage first!

      // Files removed from bucket
      expect(deletedStoragePaths).toEqual(['prop1/g1_photo.jpg', 'prop1/g2_photo.jpg']);

      // Database marked deleted
      expect(mockGuestsTable[0].id_deleted_at).toBe(fixedNow.toISOString());
      expect(mockGuestsTable[1].id_deleted_at).toBe(fixedNow.toISOString());
      expect(mockGuestsTable[2].id_deleted_at).toBeNull(); // Active guest not touched
    });

    it('ABORTS and does NOT update database if storage deletion returns an error', async () => {
      storageClient.deletePhotos = vi.fn(async () => ({
        error: { message: 'Cloud storage timeout' },
      }));

      const res = await executePhotoPurge(dbClient, storageClient, fixedNow);

      expect(res.success).toBe(false);
      expect(res.status).toBe('storage_error');
      expect(dbClient.markGuestsPurged).not.toHaveBeenCalled(); // DB NEVER UPDATED!

      // Database records preserved so future cron can retry
      expect(mockGuestsTable[0].id_deleted_at).toBeNull();
      expect(mockGuestsTable[1].id_deleted_at).toBeNull();
    });

    it('second consecutive run is an idempotent no-op returning status "none"', async () => {
      // First run purges expired guests
      await executePhotoPurge(dbClient, storageClient, fixedNow);

      // Second run immediately after
      const secondRun = await executePhotoPurge(dbClient, storageClient, fixedNow);
      expect(secondRun.success).toBe(true);
      expect(secondRun.purged).toBe(0);
      expect(secondRun.status).toBe('none');
    });

    it('respects batch limit per execution', async () => {
      await executePhotoPurge(dbClient, storageClient, fixedNow, 1);
      expect(dbClient.fetchExpiredGuests).toHaveBeenCalledWith(fixedNow.toISOString(), 1);
    });
  });
});

