import * as SQLite from 'expo-sqlite';
import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import NetInfo from '@react-native-community/netinfo';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { hashPinWithSalt, PBKDF2_ROUNDS } from './crypto-utils';

const db = SQLite.openDatabaseSync('logstay.db');

// SQLCipher: set encryption key from hardware-backed SecureStore before any database operation
try {
  let dbKey = SecureStore.getItem('db_key');
  if (!dbKey) {
    dbKey = Crypto.randomUUID().replace(/-/g, '');
    SecureStore.setItem('db_key', dbKey);
  }
  db.execSync(`PRAGMA key = "x'${dbKey}'";`);
  const v = db.getFirstSync<{ cipher_version?: string }>('PRAGMA cipher_version;');
  if (v?.cipher_version) {
    console.log(`[SQLCipher] Local database encrypted (cipher_version: ${v.cipher_version})`);
  }
} catch (e) {
  console.warn('[SQLCipher] Key setup warning:', e);
}

export async function getCachedPropertyId(): Promise<string | null> {
  try {
    const cached = await AsyncStorage.getItem('cached_property_id');
    if (cached) return cached;
    const res = db.getFirstSync<{ property_id: string }>('SELECT property_id FROM cache_rooms WHERE property_id IS NOT NULL LIMIT 1');
    if (res?.property_id) {
      await AsyncStorage.setItem('cached_property_id', res.property_id);
      return res.property_id;
    }
  } catch (e) {
    console.error('Error getting cached property ID:', e);
  }
  return null;
}

export async function setCachedPropertyId(propId: string | null | undefined): Promise<void> {
  if (propId) {
    try {
      await AsyncStorage.setItem('cached_property_id', propId);
    } catch {}
  }
}

export const getDb = async () => db;

// Initialize ALL local tables (Outbox + Cache)
export const initOfflineDB = async () => {
  try {
    let dbKey = await SecureStore.getItemAsync('db_key');
    if (!dbKey) {
      dbKey = Crypto.randomUUID().replace(/-/g, '');
      await SecureStore.setItemAsync('db_key', dbKey);
    }
    db.execSync(`PRAGMA key = "x'${dbKey}'";`);
  } catch {}

  await db.execAsync(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS outbox (id TEXT PRIMARY KEY NOT NULL, entity TEXT, type TEXT, payload TEXT NOT NULL, created_at INTEGER NOT NULL, status TEXT DEFAULT 'pending', attempts INTEGER DEFAULT 0, last_error TEXT);
    CREATE TABLE IF NOT EXISTS cache_rooms (id TEXT PRIMARY KEY, property_id TEXT, label TEXT, kind TEXT, floor TEXT, floor_no INTEGER, description TEXT);
    CREATE TABLE IF NOT EXISTS cache_units (id TEXT PRIMARY KEY, room_id TEXT, label TEXT, gender_rule TEXT, housekeeping_status TEXT);
    CREATE TABLE IF NOT EXISTS cache_stays (id TEXT PRIMARY KEY, property_id TEXT, unit_id TEXT, guest_name TEXT, status TEXT);
    CREATE TABLE IF NOT EXISTS cache_guests (id TEXT PRIMARY KEY, name TEXT, phone TEXT, nationality TEXT);
    CREATE TABLE IF NOT EXISTS cache_staff (
      id TEXT PRIMARY KEY, name TEXT, role TEXT, active INTEGER,
      pin_hash_local TEXT, salt TEXT, local_failed_tries INTEGER DEFAULT 0, local_locked_until INTEGER DEFAULT 0
    );
  `);
  try { db.execSync("ALTER TABLE outbox ADD COLUMN status TEXT DEFAULT 'pending'"); } catch {}
  try { db.execSync("ALTER TABLE outbox ADD COLUMN attempts INTEGER DEFAULT 0"); } catch {}
  try { db.execSync("ALTER TABLE outbox ADD COLUMN last_error TEXT"); } catch {}
  try { db.execSync("ALTER TABLE outbox ADD COLUMN type TEXT"); } catch {}
  try { db.execSync("ALTER TABLE cache_rooms ADD COLUMN floor TEXT"); } catch {}
  try { db.execSync("ALTER TABLE cache_rooms ADD COLUMN floor_no INTEGER"); } catch {}
  try { db.execSync("ALTER TABLE cache_stays ADD COLUMN guest_name TEXT"); } catch {}
  try { db.execSync("ALTER TABLE cache_staff ADD COLUMN pin_hash_local TEXT"); } catch {}
  try { db.execSync("ALTER TABLE cache_staff ADD COLUMN salt TEXT"); } catch {}
  try { db.execSync("ALTER TABLE cache_staff ADD COLUMN local_failed_tries INTEGER DEFAULT 0"); } catch {}
  try { db.execSync("ALTER TABLE cache_staff ADD COLUMN local_locked_until INTEGER DEFAULT 0"); } catch {}
};

db.execSync(`
  CREATE TABLE IF NOT EXISTS outbox (
    id TEXT PRIMARY KEY NOT NULL,
    entity TEXT NOT NULL,
    type TEXT,
    payload TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    status TEXT DEFAULT 'pending',
    attempts INTEGER DEFAULT 0,
    last_error TEXT
  );
  CREATE TABLE IF NOT EXISTS cache_rooms (id TEXT PRIMARY KEY, property_id TEXT, label TEXT, kind TEXT, floor TEXT, floor_no INTEGER, description TEXT);
  CREATE TABLE IF NOT EXISTS cache_units (id TEXT PRIMARY KEY, room_id TEXT, label TEXT, gender_rule TEXT, housekeeping_status TEXT);
  CREATE TABLE IF NOT EXISTS cache_stays (id TEXT PRIMARY KEY, property_id TEXT, unit_id TEXT, guest_name TEXT, status TEXT);
  CREATE TABLE IF NOT EXISTS cache_guests (id TEXT PRIMARY KEY, name TEXT, phone TEXT, nationality TEXT);
  CREATE TABLE IF NOT EXISTS cache_staff (
    id TEXT PRIMARY KEY, name TEXT, role TEXT, active INTEGER,
    pin_hash_local TEXT, salt TEXT, local_failed_tries INTEGER DEFAULT 0, local_locked_until INTEGER DEFAULT 0
  );
`);
try { db.execSync("ALTER TABLE outbox ADD COLUMN status TEXT DEFAULT 'pending'"); } catch {}
try { db.execSync("ALTER TABLE outbox ADD COLUMN attempts INTEGER DEFAULT 0"); } catch {}
try { db.execSync("ALTER TABLE outbox ADD COLUMN last_error TEXT"); } catch {}
try { db.execSync("ALTER TABLE outbox ADD COLUMN type TEXT"); } catch {}
try { db.execSync("ALTER TABLE cache_rooms ADD COLUMN floor TEXT"); } catch {}
try { db.execSync("ALTER TABLE cache_rooms ADD COLUMN floor_no INTEGER"); } catch {}
try { db.execSync("ALTER TABLE cache_rooms ADD COLUMN description TEXT"); } catch {}
try { db.execSync("ALTER TABLE cache_stays ADD COLUMN guest_name TEXT"); } catch {}
try { db.execSync("ALTER TABLE cache_staff ADD COLUMN pin_hash_local TEXT"); } catch {}
try { db.execSync("ALTER TABLE cache_staff ADD COLUMN salt TEXT"); } catch {}
try { db.execSync("ALTER TABLE cache_staff ADD COLUMN local_failed_tries INTEGER DEFAULT 0"); } catch {}
try { db.execSync("ALTER TABLE cache_staff ADD COLUMN local_locked_until INTEGER DEFAULT 0"); } catch {}

// --- OUTBOX FUNCTIONS ---
export async function saveToOutbox(typeOrObj: string | { type: string; payload: any }, payloadObj?: any) {
  let type: string;
  let payload: any;

  if (typeof typeOrObj === 'string') {
    type = typeOrObj;
    payload = payloadObj;
  } else {
    type = typeOrObj.type;
    payload = typeOrObj.payload;
  }

  const id = payload?.id || Math.random().toString(36).substring(2);
  const payloadString = JSON.stringify(payload);
  const now = Date.now();

  db.runSync(
    "INSERT INTO outbox (id, entity, type, payload, created_at, status, attempts) VALUES (?, ?, ?, ?, ?, 'pending', 0)",
    [id, type, type, payloadString, now]
  );
  console.log('Saved to outbox:', id, type);
}

// Optimistic UI Cache Helpers
export async function updateLocalUnitStatus(unitId: string, status: string) {
  db.runSync(`UPDATE cache_units SET housekeeping_status = ? WHERE id = ?`, [status, unitId]);
}

export async function removeStayFromCache(stayId: string) {
  db.runSync(`DELETE FROM cache_stays WHERE id = ? OR unit_id = ?`, [stayId, stayId]);
}

export async function isOnline() {
  const netInfo = await NetInfo.fetch();
  return netInfo.isConnected && Boolean(netInfo.isInternetReachable);
}

export async function getPendingCount(): Promise<number> {
  const result = db.getFirstSync<{ count: number }>("SELECT COUNT(*) as count FROM outbox WHERE status = 'pending' OR status IS NULL");
  return result?.count || 0;
}

export { hashPinWithSalt };

export const saveLocalPinHash = async (staffId: string, pin: string) => {
  const database = await getDb();
  const salt = Crypto.randomUUID();
  const hash = hashPinWithSalt(pin, salt, PBKDF2_ROUNDS);
  // OWASP M10/M1: Store sensitive PIN hash in hardware-backed SecureStore, not unencrypted SQLite
  await SecureStore.setItemAsync(`staff_pin_hash_${staffId}`, hash);
  await database.runAsync(
    'UPDATE cache_staff SET salt = ?, pin_hash_local = NULL, local_failed_tries = 0, local_locked_until = 0 WHERE id = ?',
    [salt, staffId]
  );
};

export const verifyLocalPin = async (staffId: string, pin: string): Promise<boolean> => {
  const database = await getDb();
  const staff = await database.getFirstAsync<any>('SELECT * FROM cache_staff WHERE id = ?', [staffId]);
  if (!staff || !staff.salt) return false;

  // Check local lockout (5 failed attempts = 30 second lock, user-friendly timeout)
  if (staff.local_locked_until && staff.local_locked_until > Date.now()) {
    // Clamp any legacy 5-minute locks down to max 30 seconds from now
    if (staff.local_locked_until > Date.now() + (30 * 1000)) {
      await database.runAsync('UPDATE cache_staff SET local_locked_until = ? WHERE id = ?', [Date.now() + (30 * 1000), staffId]);
      staff.local_locked_until = Date.now() + (30 * 1000);
    }
    const remainingSeconds = Math.max(1, Math.ceil((staff.local_locked_until - Date.now()) / 1000));
    throw new Error(`PIN locked due to failed attempts. Please wait ${remainingSeconds}s.`);
  }

  // Retrieve hash from hardware-backed SecureStore (with fallback migration for legacy SQLite rows)
  let expectedHash = await SecureStore.getItemAsync(`staff_pin_hash_${staffId}`);
  if (!expectedHash && staff.pin_hash_local) {
    const legacyHash = staff.pin_hash_local as string;
    expectedHash = legacyHash;
    await SecureStore.setItemAsync(`staff_pin_hash_${staffId}`, legacyHash);
    await database.runAsync('UPDATE cache_staff SET pin_hash_local = NULL WHERE id = ?', [staffId]);
  }
  if (!expectedHash) return false;

  let matches = false;
  if (expectedHash.startsWith('pbkdf2$')) {
    const parts = expectedHash.split('$');
    const rounds = parseInt(parts[1], 10) || PBKDF2_ROUNDS;
    const computed = hashPinWithSalt(pin, staff.salt, rounds);
    matches = computed === expectedHash;
  } else {
    // Legacy single-round SHA-256 fallback
    const legacyComputed = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, pin + staff.salt);
    if (legacyComputed === expectedHash) {
      matches = true;
      // Auto-upgrade to PBKDF2 in SecureStore
      const upgraded = hashPinWithSalt(pin, staff.salt, PBKDF2_ROUNDS);
      await SecureStore.setItemAsync(`staff_pin_hash_${staffId}`, upgraded);
    }
  }

  if (matches) {
    await database.runAsync('UPDATE cache_staff SET local_failed_tries = 0, local_locked_until = 0 WHERE id = ?', [staffId]);
    return true;
  } else {
    const newTries = (staff.local_failed_tries || 0) + 1;
    // 5 failed attempts locks for 30 seconds (down from 5 minutes)
    const lockUntil = newTries >= 5 ? Date.now() + (30 * 1000) : 0;
    await database.runAsync('UPDATE cache_staff SET local_failed_tries = ?, local_locked_until = ? WHERE id = ?', [newTries, lockUntil, staffId]);
    return false;
  }
};

export async function processOutbox() {
  const online = await isOnline();
  if (!online) return;

  const rows = db.getAllSync<any>("SELECT * FROM outbox WHERE status = 'pending' OR status IS NULL ORDER BY created_at ASC");
  
  for (const item of rows) {
    const payload = JSON.parse(item.payload);
    let error: any = null;
    const actionType = item.entity || item.type;

    try {
      switch (actionType) {
        case 'guest_checkin': {
          let photoPath = '';
          if (payload.photoUri) {
            const { uploadIdPhoto } = await import('./photo');
            photoPath = await uploadIdPhoto(
              payload.property_id,
              payload.guest_id || payload.id,
              payload.photoUri
            );
          }

          const { error: rpcError } = await (await import('./supabase')).supabase.rpc('check_in_guest', {
            p_stay_id: payload.stay_id || payload.id,
            p_guest_id: payload.guest_id || payload.id,
            p_property_id: payload.property_id,
            p_name: payload.name,
            p_phone: payload.phone,
            p_nationality: payload.nationality,
            p_gender: payload.gender,
            p_id_type: payload.idType,
            p_id_last4: payload.idLast4,
            p_id_photo_path: photoPath,
            p_unit_id: payload.selectedUnit,
            p_amount: parseFloat(payload.amount),
            p_pay_mode: payload.pay_mode !== undefined ? payload.pay_mode : (payload.payMode !== undefined ? payload.payMode : null),
            p_is_foreign: payload.isForeign,
            p_passport_no: payload.passportNo,
            p_visa_no: payload.visaNo,
            p_visa_type: '',
            p_arrived_from: payload.arrivedFrom,
            p_next_dest: payload.nextDest,
            p_staff_id: payload.staff_id,
            p_nights: payload.nights || 1,
            p_expected_checkout: payload.expected_checkout || null
          });
          
          error = rpcError;

          // Idempotency fix from Phase 0
          if (error && (error.message.includes('Bed is already occupied') || (error as any).code === '23505')) {
            error = null; // Treat as success
          }

          // Cleanup local photo ONLY after upload AND RPC both succeed
          if (!error && payload.photoUri) {
            try {
              const { File } = await import('expo-file-system');
              const f = new File(payload.photoUri);
              if (f.exists) f.delete();
            } catch {
              // Best-effort cleanup
            }
          }
          break;
        }

        case 'guest_checkout': {
          const { error: rpcError } = await (await import('./supabase')).supabase.rpc('check_out_guest', {
            p_stay_id: payload.stay_id,
            p_staff_id: payload.staff_id
          });
          error = rpcError;
          break;
        }

        case 'mark_clean': {
          const { error: rpcError } = await (await import('./supabase')).supabase.rpc('mark_unit_clean', {
            p_unit_id: payload.unit_id,
            p_staff_id: payload.staff_id
          });
          error = rpcError;
          break;
        }

        case 'shift_open': {
          const { error: rpcError } = await (await import('./supabase')).supabase.rpc('open_shift', {
            p_shift_id: payload.shift_id || payload.id,
            p_opening_cash: payload.opening_cash,
            p_staff_id: payload.staff_id || null,
          });
          error = rpcError;
          break;
        }

        case 'petty_cash': {
          const { error: rpcError } = await (await import('./supabase')).supabase.rpc('add_petty_cash', {
            p_entry_id: payload.entry_id || payload.id,
            p_shift_id: payload.shift_id,
            p_amount: payload.amount,
            p_note: payload.note || null,
            p_staff_id: payload.staff_id || null,
          });
          error = rpcError;
          break;
        }

        case 'set_maintenance': {
          const { error: rpcError } = await (await import('./supabase')).supabase.rpc('set_unit_maintenance', {
            p_unit_id: payload.unit_id,
            p_staff_id: payload.staff_id || null,
          });
          error = rpcError;
          break;
        }

        case 'report_issue': {
          const { error: rpcError } = await (await import('./supabase')).supabase.rpc('report_issue', {
            p_issue_id: payload.issue_id || payload.id,
            p_unit_id: payload.unit_id || null,
            p_stay_id: payload.stay_id || null,
            p_category: payload.category || 'other',
            p_note: payload.note || null,
            p_staff_id: payload.staff_id || payload.reported_by || null,
          });
          error = rpcError;
          break;
        }

        case 'add_charge': {
          const { error: rpcError } = await (await import('./supabase')).supabase.rpc('add_stay_charge', {
            p_charge_id: payload.charge_id || payload.id,
            p_stay_id: payload.stay_id,
            p_item: payload.item,
            p_qty: payload.qty || 1,
            p_unit_price: payload.unit_price,
            p_paid: payload.paid || false,
            p_pay_mode: payload.pay_mode || null,
            p_staff_id: payload.staff_id || null,
          });
          error = rpcError;
          break;
        }

        case 'record_payment': {
          const { error: rpcError } = await (await import('./supabase')).supabase.rpc('record_payment', {
            p_payment_id: payload.payment_id,
            p_stay_id: payload.stay_id,
            p_amount: payload.amount,
            p_pay_mode: payload.pay_mode,
            p_staff_id: payload.staff_id
          });
          error = rpcError;
          break;
        }
      }

      if (error) {
        console.error(`Sync error [${actionType}]:`, error.message);
        const newAttempts = (item.attempts || 0) + 1;
        if (newAttempts >= 5) {
          db.runSync('UPDATE outbox SET status = ?, attempts = ?, last_error = ? WHERE id = ?', ['failed', newAttempts, error.message, item.id]);
        } else {
          db.runSync('UPDATE outbox SET attempts = ?, last_error = ? WHERE id = ?', [newAttempts, error.message, item.id]);
          break; // Stop queue for now on error
        }
      } else {
        // Success, remove from outbox
        db.runSync('DELETE FROM outbox WHERE id = ?', [item.id]);
        console.log(`Synced & deleted from outbox [${actionType}]:`, item.id);
      }
    } catch (e) {
      console.error('Outbox processing exception:', e);
      break;
    }
  }
}

// --- CACHE FUNCTIONS ---
export function cacheRooms(rooms: any[]) {
  db.runSync('DELETE FROM cache_rooms');
  rooms.filter(r => !r.archived_at).forEach(r => {
    db.runSync(
      'INSERT INTO cache_rooms (id, property_id, label, kind, floor, floor_no, description) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [r.id, r.property_id, r.label, r.kind, r.floor || null, r.floor_no !== undefined ? r.floor_no : null, r.description || null]
    );
  });
}

export function cacheUnits(units: any[]) {
  db.runSync('DELETE FROM cache_units');
  units.filter(u => !u.archived_at).forEach(u => {
    db.runSync('INSERT INTO cache_units (id, room_id, label, gender_rule, housekeeping_status) VALUES (?, ?, ?, ?, ?)', 
    [u.id, u.room_id, u.label, u.gender_rule, u.housekeeping_status]);
  });
}

export function cacheStays(stays: any[]) {
  db.runSync('DELETE FROM cache_stays');
  stays.forEach(s => {
    db.runSync('INSERT INTO cache_stays (id, property_id, unit_id, status) VALUES (?, ?, ?, ?)', 
    [s.id || s.unit_id || '', s.property_id || '', s.unit_id, s.status || 'checked_in']);
  });
}

export function getRoomsCache() { return db.getAllSync<any>('SELECT * FROM cache_rooms'); }
export function getUnitsCache() { return db.getAllSync<any>('SELECT * FROM cache_units'); }
export function getStaysCache() { return db.getAllSync<any>("SELECT * FROM cache_stays WHERE status = 'checked_in'"); }

export const cacheGuests = async (guests: any[]) => {
  const database = await getDb();
  await database.runAsync('DELETE FROM cache_guests');
  for (const g of guests) {
    if (!g) continue;
    await database.runAsync(
      'INSERT INTO cache_guests (id, name, phone, nationality) VALUES (?, ?, ?, ?)',
      [g.id, g.name || '', g.phone || '', g.nationality || '']
    );
  }
};

export const getGuestsCache = async (): Promise<any[]> => {
  const database = await getDb();
  return await database.getAllAsync('SELECT * FROM cache_guests');
};

export const cacheStaff = async (staff: any[]) => {
  const database = await getDb();
  for (const s of staff) {
    if (!s) continue;
    await database.runAsync(
      `INSERT INTO cache_staff (id, name, role, active) VALUES (?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET name = excluded.name, role = excluded.role, active = excluded.active`,
      [s.id, s.name || '', s.role || '', s.active ? 1 : 0]
    );
  }
};

export const getStaffCache = async (): Promise<any[]> => {
  const database = await getDb();
  return await database.getAllAsync('SELECT * FROM cache_staff WHERE active = 1');
};

export const addStayToCache = async (stayId: string, unitId: string, guestName: string) => {
  const database = await getDb();
  await database.runAsync(
    'INSERT OR REPLACE INTO cache_stays (id, unit_id, guest_name, status) VALUES (?, ?, ?, ?)',
    [stayId, unitId, guestName, 'checked_in']
  );
};

// --- AUTOMATIC SYNC LISTENER ---
// This runs in the background. When internet returns, it pushes the outbox automatically!
NetInfo.addEventListener((state) => {
  if (state.isConnected) {
    processOutbox();
  }
});