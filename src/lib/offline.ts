import * as SQLite from 'expo-sqlite';
import NetInfo from '@react-native-community/netinfo';

const db = SQLite.openDatabaseSync('logstay.db');

// Initialize ALL local tables (Outbox + Cache)
db.execSync(`
  CREATE TABLE IF NOT EXISTS outbox (
    id TEXT PRIMARY KEY NOT NULL,
    entity TEXT NOT NULL,
    payload TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS cache_rooms (id TEXT PRIMARY KEY, property_id TEXT, label TEXT, kind TEXT);
  CREATE TABLE IF NOT EXISTS cache_units (id TEXT PRIMARY KEY, room_id TEXT, label TEXT, gender_rule TEXT, housekeeping_status TEXT);
  CREATE TABLE IF NOT EXISTS cache_stays (id TEXT PRIMARY KEY, property_id TEXT, unit_id TEXT, status TEXT);
`);

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
    'INSERT INTO outbox (id, entity, payload, created_at) VALUES (?, ?, ?, ?)',
    [id, type, payloadString, now]
  );
  console.log('Saved to outbox:', id, type);
}

// Optimistic UI Cache Helpers
export async function updateLocalUnitStatus(unitId: string, status: string) {
  db.runSync(`UPDATE cache_units SET housekeeping_status = ? WHERE id = ?`, [status, unitId]);
}

export async function removeStayFromCache(stayId: string) {
  db.runSync(`DELETE FROM cache_stays WHERE id = ?`, [stayId]);
}

export async function isOnline() {
  const netInfo = await NetInfo.fetch();
  return netInfo.isConnected && Boolean(netInfo.isInternetReachable);
}

export function getPendingCount() {
  const result = db.getFirstSync<{ count: number }>('SELECT COUNT(*) as count FROM outbox');
  return result?.count || 0;
}

export async function processOutbox() {
  const online = await isOnline();
  if (!online) return;

  const rows = db.getAllSync<any>('SELECT * FROM outbox ORDER BY created_at ASC');
  
  for (const item of rows) {
    const payload = JSON.parse(item.payload);
    let error: any = null;
    const actionType = item.entity || item.type;

    try {
      switch (actionType) {
        case 'guest_checkin': {
          let photoPath = '';
          if (payload.photoUri) {
            const response = await fetch(payload.photoUri);
            const blob = await response.blob();
            photoPath = `${payload.property_id}/id_${Date.now()}.jpg`;
            await (await import('./supabase')).supabase.storage.from('id_photos').upload(photoPath, blob);
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
            p_pay_mode: payload.payMode,
            p_is_foreign: payload.isForeign,
            p_passport_no: payload.passportNo,
            p_visa_no: payload.visaNo,
            p_visa_type: '',
            p_arrived_from: payload.arrivedFrom,
            p_next_dest: payload.nextDest,
            p_staff_id: payload.staff_id
          });
          
          error = rpcError;

          // Idempotency fix from Phase 0
          if (error && (error.message.includes('Bed is already occupied') || (error as any).code === '23505')) {
            error = null; // Treat as success
          }
          break;
        }

        case 'guest_checkout': {
          const { error: rpcError } = await (await import('./supabase')).supabase.rpc('check_out_guest', {
            p_stay_id: payload.stay_id
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
          const { error: insertError } = await (await import('./supabase')).supabase
            .from('shifts')
            .insert({
              id: payload.shift_id,
              property_id: payload.property_id,
              opened_by: payload.user_id,
              opening_cash: payload.opening_cash,
              status: 'open'
            });
          error = insertError;
          break;
        }

        case 'petty_cash': {
          const { error: insertError } = await (await import('./supabase')).supabase
            .from('cash_entries')
            .insert({
              id: payload.entry_id,
              shift_id: payload.shift_id,
              kind: 'petty',
              amount: payload.amount,
              note: payload.note,
              staff_id: payload.staff_id
            });
          error = insertError;
          break;
        }

        case 'set_maintenance': {
          const { error: updateError } = await (await import('./supabase')).supabase
            .from('units')
            .update({ housekeeping_status: 'maintenance' })
            .eq('id', payload.unit_id);
          error = updateError;
          break;
        }

        case 'report_issue': {
          const { error: insertError } = await (await import('./supabase')).supabase
            .from('issues')
            .insert({
              property_id: payload.property_id,
              unit_id: payload.unit_id,
              stay_id: payload.stay_id,
              category: payload.category,
              note: payload.note,
              reported_by: payload.reported_by,
              status: 'open'
            });
          error = insertError;
          break;
        }

        case 'add_charge': {
          const { error: insertError } = await (await import('./supabase')).supabase
            .from('charges')
            .insert({
              id: payload.charge_id,
              property_id: payload.property_id,
              stay_id: payload.stay_id,
              item: payload.item,
              qty: payload.qty,
              unit_price: payload.unit_price,
              paid: payload.paid || false,
              pay_mode: payload.pay_mode || null,
              staff_id: payload.staff_id
            });
          error = insertError;
          break;
        }

        case 'record_payment': {
          const { error: rpcError } = await (await import('./supabase')).supabase.rpc('record_payment', {
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
        break; // Stop the queue on unhandled errors
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
  rooms.forEach(r => {
    db.runSync('INSERT INTO cache_rooms (id, property_id, label, kind) VALUES (?, ?, ?, ?)', [r.id, r.property_id, r.label, r.kind]);
  });
}

export function cacheUnits(units: any[]) {
  db.runSync('DELETE FROM cache_units');
  units.forEach(u => {
    db.runSync('INSERT INTO cache_units (id, room_id, label, gender_rule, housekeeping_status) VALUES (?, ?, ?, ?, ?)', 
    [u.id, u.room_id, u.label, u.gender_rule, u.housekeeping_status]);
  });
}

export function cacheStays(stays: any[]) {
  db.runSync('DELETE FROM cache_stays');
  stays.forEach(s => {
    db.runSync('INSERT INTO cache_stays (id, property_id, unit_id, status) VALUES (?, ?, ?, ?)', 
    [s.id, s.property_id, s.unit_id, s.status]);
  });
}

export function getRoomsCache() { return db.getAllSync<any>('SELECT * FROM cache_rooms'); }
export function getUnitsCache() { return db.getAllSync<any>('SELECT * FROM cache_units'); }
export function getStaysCache() { return db.getAllSync<any>("SELECT * FROM cache_stays WHERE status = 'checked_in'"); }

// --- AUTOMATIC SYNC LISTENER ---
// This runs in the background. When internet returns, it pushes the outbox automatically!
NetInfo.addEventListener((state) => {
  if (state.isConnected) {
    processOutbox();
  }
});