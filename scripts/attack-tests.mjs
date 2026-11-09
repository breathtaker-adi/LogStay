// Section 7 attack matrix — comprehensive security verification.
// Run: node scripts/attack-tests.mjs
// Includes Section 6 expanded attack suite:
// - Direct table writes revocation (cash_entries, charges, issues, shifts)
// - Cross-property units isolation
// - Dropped legacy functions verification
// - Owner step-up PIN verification
// - Rate-limited invite code brute-force protection
// - Idempotent clock-in attendance leak prevention
// - Active guest room removal guard

import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';

// ---- env ----
const env = {};
if (existsSync('.env')) {
  try {
    for (const l of readFileSync('.env', 'utf8').split('\n')) {
      const i = l.indexOf('=');
      if (i > 0 && !l.startsWith('#'))
        env[l.slice(0, i).trim()] = l.slice(i + 1).trim();
    }
  } catch {}
}

const URL_ = process.env.EXPO_PUBLIC_SUPABASE_URL || env.EXPO_PUBLIC_SUPABASE_URL;
const KEY  = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const A_EMAIL = process.env.TEST_A_EMAIL || env.TEST_A_EMAIL || 'test@logstay.com';
const A_PASS  = process.env.TEST_A_PASSWORD || env.TEST_A_PASSWORD || 'Test@123';

if (!URL_ || !KEY) {
  console.error('Missing EXPO_PUBLIC_SUPABASE_URL or EXPO_PUBLIC_SUPABASE_ANON_KEY environment variables.');
  process.exit(2);
}

const mk = () => createClient(URL_, KEY,
  { auth: { persistSession: false, autoRefreshToken: false } });

let pass = 0, fail = 0, skip = 0;
const check = (name, ok, note = '') => {
  ok ? pass++ : fail++;
  console.log(`${ok ? '✅' : '❌'} ${name}${note ? '  [' + note + ']' : ''}`);
};

// Rejection-aware assertion: only genuine authorization or permission rejections pass
const REJECTION = /not (a member|authorized|allowed)|permission denied|row-level security|locked|invalid owner pin/i;
const expectRejected = (name, { error }) => {
  const ok = !!error && REJECTION.test(error.message);
  ok ? pass++ : fail++;
  console.log(`${ok ? '✅' : '❌'} ${name}  [${error ? error.message : 'SUCCEEDED — LEAK'}]`);
};

console.log('=================================================================');
console.log('       LogStay Security Review — Section 6 & 7 Attack Matrix');
console.log('=================================================================\n');

// ---- 1. Login as A, discover fixtures ----
const A = mk();
{
  const { error } = await A.auth.signInWithPassword({ email: A_EMAIL, password: A_PASS });
  if (error) { console.error('A login failed:', error.message); process.exit(1); }
}

const aMemRes = await A.from('members').select('property_id').limit(1);
const A_PROP = aMemRes.data?.[0]?.property_id;
if (!A_PROP) { console.error('No property found for A'); process.exit(1); }

const aStaysRes = await A.from('stays').select('id, unit_id').limit(1);
const A_STAY = aStaysRes.data?.[0]?.id || randomUUID();
const A_UNIT = aStaysRes.data?.[0]?.unit_id || randomUUID();

const staffRes = await A.from('staff_profiles_safe').select('id, role, name').limit(20);
const staff = staffRes.data || [];
const DESK = staff.find(s => s.role === 'desk');
const HK   = staff.find(s => s.role === 'housekeeping');
const OWNER = staff.find(s => s.role === 'owner');
console.log(`A: prop=${A_PROP} stay=${A_STAY} desk=${!!DESK} (${DESK?.name}) hk=${!!HK} (${HK?.name}) owner=${!!OWNER}\n`);

// ---- 2. Provision throwaway Property B ----
const B = mk();
const bEmail = process.env.TEST_B_EMAIL || 'attack_b_1791722004259@gmail.com';
const bPass  = process.env.TEST_B_PASSWORD || 'AttackPassword123!';

{
  const { error: inErr } = await B.auth.signInWithPassword({ email: bEmail, password: bPass });
  if (inErr) {
    const { error: upErr } = await B.auth.signUp({ email: bEmail, password: bPass });
    if (upErr) {
      console.error('B auth failed:', upErr.message);
      process.exit(1);
    }
  }
}

const bUser = (await B.auth.getSession()).data.session?.user;
if (!bUser) {
  console.error('Could not get session for user B');
  process.exit(1);
}

let bProp;
const existingB = (await B.from('properties').select('id').eq('owner_id', bUser.id).limit(1)).data;
if (existingB && existingB.length > 0) {
  bProp = existingB[0].id;
} else {
  const { data: propId, error } = await B.rpc('create_property', {
    p_name: 'AttackTestB',
    p_type: 'hostel',
    p_state: 'Goa',
    p_pin: '1234'
  });
  if (error) { console.error('B property create failed:', error.message); process.exit(1); }
  bProp = propId;
  await B.rpc('add_room_with_units', {
    p_room_id: randomUUID(),
    p_label: 'B-101',
    p_kind: 'private',
    p_floor: null,
    p_unit_ids: [randomUUID()],
    p_unit_labels: null,
    p_gender_rule: 'any'
  });
}
console.log(`B: prop=${bProp} owner=${bUser.id}\n`);

// ---- 3. Cross-property isolation (Section 7 test 1) ----
for (const tbl of ['guests', 'stays', 'shifts', 'cash_entries', 'audit_log']) {
  const { data } = await B.from(tbl).select('id').eq('property_id', A_PROP);
  check(`T1 B reads A's ${tbl}`, (data || []).length === 0,
    `returned ${(data || []).length}`);
}
{
  const { data } = await B.from('staff_profiles_safe').select('id')
    .eq('property_id', A_PROP);
  check('T1f B reads A staff (view security_invoker!)', (data || []).length === 0,
    (data || []).length + ' rows — if >0 the view needs WITH (security_invoker=true)');
}

// ---- 4. Direct Table Writes Revocation (Section 2 & 6) ----
expectRejected('T2 stranger inserts members row',
  await B.from('members').insert({ property_id: A_PROP, user_id: bUser.id, role: 'owner' }));
expectRejected('T3 direct UPDATE stays.paid_amount',
  await A.from('stays').update({ paid_amount: 999999 }).eq('id', A_STAY));
expectRejected('T4 direct UPDATE properties.paid_until',
  await A.from('properties').update({ paid_until: '2099-01-01' }).eq('id', A_PROP));

expectRejected('T4b direct INSERT cash_entries',
  await A.from('cash_entries').insert({ id: randomUUID(), shift_id: randomUUID(), kind: 'collection', amount: 500 }));
expectRejected('T4c direct INSERT charges',
  await A.from('charges').insert({ id: randomUUID(), stay_id: A_STAY, item: 'Tampered Charge', unit_price: 500, qty: 1 }));
expectRejected('T4d direct INSERT issues',
  await A.from('issues').insert({ id: randomUUID(), unit_id: A_UNIT, category: 'ac', note: 'Direct write attack' }));
expectRejected('T4e direct INSERT shifts',
  await A.from('shifts').insert({ id: randomUUID(), property_id: A_PROP, opening_cash: 500, status: 'open' }));

// Audit log immutability
const auditRows = (await A.from('audit_log').select('id').limit(1)).data;
const auditRow = auditRows?.[0];
if (auditRow) {
  expectRejected('T8a audit_log UPDATE',
    await A.from('audit_log').update({ action: 'tampered' }).eq('id', auditRow.id));
  expectRejected('T8b audit_log DELETE',
    await A.from('audit_log').delete().eq('id', auditRow.id));
} else {
  skip += 2;
  console.log('⏭ T8a/b no audit rows found to target');
}

// ---- 5. Units Isolation (Section 6: User from property A reads or inserts units of B) ----
{
  const { data: bUnits } = await B.from('units').select('id').eq('id', A_UNIT);
  check("T5a B reads A's unit", (bUnits || []).length === 0, `returned ${(bUnits || []).length}`);
  expectRejected("T5b B direct INSERT into units table",
    await B.from('units').insert({ id: randomUUID(), room_id: randomUUID(), label: 'Injected Unit' }));
}

// ---- 6. Retired Functions are Missing (Section 6) ----
{
  const { error: f1Err } = await A.rpc('delete_expired_id_photos');
  check('T6a delete_expired_id_photos missing', !!f1Err && /schema cache|does not exist/i.test(f1Err.message), f1Err?.message);
}
{
  const { error: f2Err } = await A.rpc('set_pin', { p_prop: A_PROP, p_pin: '1234' });
  check('T6b set_pin missing', !!f2Err && /schema cache|does not exist/i.test(f2Err.message), f2Err?.message);
}
{
  const { error: f3Err } = await A.rpc('validate_invite_code', { p_code: 'TEST' });
  check('T6c validate_invite_code missing', !!f3Err && /schema cache|does not exist/i.test(f3Err.message), f3Err?.message);
}

// ---- 7. Cross-property RPCs ----
expectRejected("T7 B closes A's stay",
  await B.rpc('check_out_guest', { p_stay_id: A_STAY, p_staff_id: randomUUID() }));

// ---- 8. Role enforcement & Owner Step-Up PIN (Section 5 & 6) ----
const PID = randomUUID();
if (DESK) {
  const { error: payErr } = await A.rpc('record_payment', {
    p_payment_id: PID,
    p_stay_id: A_STAY,
    p_amount: 100,
    p_pay_mode: 'upi',
    p_staff_id: DESK.id
  });
  if (payErr) console.warn('Payment setup warning:', payErr.message);

  // Desk tries to call owner RPCs directly
  expectRejected('T8a desk resets PIN', await A.rpc('reset_staff_pin',
    { p_prop: A_PROP, p_actor: DESK.id, p_target: DESK.id, p_new_pin: '9999' }));

  expectRejected('T8b desk refunds payment', await A.rpc('refund_payment',
    { p_payment_id: PID, p_staff_id: DESK.id, p_reason: 'attack test' }));

  expectRejected('T8c desk adds staff', await A.rpc('owner_add_staff',
    { p_prop: A_PROP, p_actor: DESK.id, p_name: 'Attacker Staff', p_phone: '9999999999', p_role: 'owner', p_pin: '1234' }));

  expectRejected('T8d desk deactivates staff', await A.rpc('deactivate_staff',
    { p_prop: A_PROP, p_actor: DESK.id, p_target: DESK.id, p_reason: 'Desk self-removal' }));

  expectRejected('T8i desk updates staff role', await A.rpc('update_staff_role',
    { p_prop: A_PROP, p_actor: DESK.id, p_target: DESK.id, p_new_role: 'owner' }));

  // Desk impersonates owner by passing owner's staff ID without valid owner PIN
  if (OWNER) {
    expectRejected('T8e desk impersonates owner refund without PIN',
      await A.rpc('refund_payment', { p_payment_id: PID, p_staff_id: OWNER.id, p_reason: 'fraud', p_owner_pin: null }));
    expectRejected('T8f desk impersonates owner add-staff without PIN',
      await A.rpc('owner_add_staff', { p_prop: A_PROP, p_actor: OWNER.id, p_name: 'Fraud', p_phone: '9999999999', p_role: 'owner', p_pin: '1234', p_owner_pin: null }));
    expectRejected('T8g desk impersonates owner reset-pin without PIN',
      await A.rpc('reset_staff_pin', { p_prop: A_PROP, p_actor: OWNER.id, p_target: DESK.id, p_new_pin: '9999', p_owner_pin: null }));
    expectRejected('T8j desk impersonates owner update-staff-role without PIN',
      await A.rpc('update_staff_role', { p_prop: A_PROP, p_actor: OWNER.id, p_target: DESK.id, p_new_role: 'owner', p_owner_pin: null }));
  }
} else {
  skip += 9;
  console.log('⏭ T8a-j desk/owner tests — SKIP (no desk/owner staff profile)');
}

if (HK) {
  const stayId = randomUUID();
  const guestId = randomUUID();
  const res = await A.rpc('check_in_guest', {
    p_stay_id: stayId,
    p_guest_id: guestId,
    p_property_id: A_PROP,
    p_name: 'Attacker Guest',
    p_phone: '9876543210',
    p_nationality: 'India',
    p_gender: 'male',
    p_id_type: 'Aadhaar',
    p_id_last4: '1234',
    p_id_photo_path: null,
    p_unit_id: A_UNIT,
    p_amount: 1000,
    p_pay_mode: 'upi',
    p_is_foreign: false,
    p_passport_no: null,
    p_visa_no: null,
    p_visa_type: null,
    p_arrived_from: null,
    p_next_dest: null,
    p_staff_id: HK.id
  });
  expectRejected('T8h housekeeping check-in guard', res);
} else {
  skip++;
  console.log('⏭ T8h housekeeping check-in — SKIP (no housekeeping staff profile)');
}

// ---- 9. Idempotency replay (test 9) ----
const PID_REPLAY = randomUUID();
for (let i = 0; i < 5; i++) {
  await A.rpc('record_payment', {
    p_payment_id: PID_REPLAY,
    p_stay_id: A_STAY,
    p_amount: 100,
    p_pay_mode: 'upi',
    p_staff_id: DESK?.id || OWNER?.id
  });
}
const paymentRows = (await A.from('payments').select('id').eq('id', PID_REPLAY)).data;
const n = (paymentRows || []).length;
check('T9 payment replay ×5', n === 1, `${n} rows`);

// ---- 10. Online brute-force lockout (test 10) ----
if (DESK) {
  let r;
  for (let i = 0; i < 6; i++) {
    r = await A.rpc('staff_login', { p_staff: DESK.id, p_pin: '0000_wrong' });
  }
  const isLocked = !!r?.error && REJECTION.test(r.error.message);
  check('T10 PIN lockout after 6', isLocked, r?.error?.message || 'Lockout triggered');
} else {
  skip++;
  console.log('⏭ T10 PIN lockout — SKIP (no desk staff)');
}

// ---- 11. Signed URL expiry (test 11) ----
{
  const g = (await A.from('guests').select('id_photo_path')
    .not('id_photo_path', 'is', null).limit(1)).data?.[0];
  if (!g?.id_photo_path) {
    skip++;
    console.log('⏭ T11 no photo guest — SKIP (purge ate them all)');
  } else {
    const { data: url, error: urlErr } = await A.storage.from('id_photos')
      .createSignedUrl(g.id_photo_path, 2);
    if (urlErr || !url?.signedUrl) {
      check('T11 signed URL creation', false, urlErr?.message || 'Storage error');
    } else {
      await new Promise(r => setTimeout(r, 5000));
      const res = await fetch(url.signedUrl);
      check('T11 signed URL expired', !res.ok, `HTTP ${res.status}`);
    }
  }
}

// ---- 12. Rate-limited invite code guessing (Section 6) ----
{
  let throttled = false;
  for (let i = 0; i < 7; i++) {
    const { error } = await B.rpc('join_property', { p_code: 'WRONG' + i });
    if (error && /too many failed join attempts/i.test(error.message)) {
      throttled = true;
      break;
    }
  }
  check('T12 invite code guessing rate-limited', throttled, throttled ? 'Throttled after 5 tries' : 'Not throttled');
}

// ---- 13. Idempotent Attendance Leak Guard (Section 6) ----
if (DESK) {
  await A.rpc('clock_in_staff', { p_staff_id: DESK.id });
  await A.rpc('clock_in_staff', { p_staff_id: DESK.id });
  const { data: openRows } = await A.from('staff_attendance').select('id')
    .eq('staff_id', DESK.id)
    .is('clock_out', null);
  check('T13 double clock-in auto-closes previous row', (openRows || []).length === 1, `open rows: ${(openRows || []).length}`);
} else {
  skip++;
}

// ---- 14. Active guest room removal guard (Section 6) ----
{
  const { data: unitRow } = await A.from('units').select('room_id').eq('id', A_UNIT).single();
  if (unitRow?.room_id) {
    const res = await A.rpc('remove_room', { p_room_id: unitRow.room_id, p_staff_id: OWNER?.id || DESK?.id });
    const isProtected = !!res.error && /guest is checked in|invalid owner pin|not allowed/i.test(res.error.message);
    check('T14 remove room with active guest blocked', isProtected, res.error?.message);
  }
}

// ---- 15. Floor change / edit room RBAC guard (Section 4) ----
if (DESK) {
  const { data: unitRow } = await A.from('units').select('room_id').eq('id', A_UNIT).single();
  if (unitRow?.room_id) {
    const res = await A.rpc('update_room', {
      p_room_id: unitRow.room_id,
      p_label: 'Attacker Floor Room',
      p_floor: 'Floor 99',
      p_gender_rule: 'any',
      p_staff_id: DESK.id,
      p_owner_pin: null,
      p_floor_no: 99
    });
    const isBlocked = !!res.error && REJECTION.test(res.error.message);
    check('T15 desk user cannot change room floor', isBlocked, res.error?.message || 'Rejected');
  }
} else {
  skip++;
  console.log('⏭ T15 desk room edit — SKIP (no desk staff)');
}

// ---- 16. Self-service and Owner Forgot PIN guards ----
if (DESK) {
  // Desk attacker tries to reset their PIN or owner PIN via owner_reset_forgotten_pin
  const res = await A.rpc('owner_reset_forgotten_pin', { p_owner_id: DESK.id, p_new_pin: '0000' });
  const isBlocked = !!res.error && /not an owner profile|only the verified property owner/i.test(res.error.message);
  check('T16 desk cannot call owner_reset_forgotten_pin', isBlocked, res.error?.message || 'Blocked');

  // Change my pin with wrong current PIN
  const wrongPinRes = await A.rpc('change_my_pin', { p_staff_id: DESK.id, p_current_pin: 'wrong_pin_9999', p_new_pin: '1234' });
  const isWrongBlocked = !!wrongPinRes.error && /current pin is incorrect/i.test(wrongPinRes.error.message);
  check('T17 change_my_pin enforces current PIN', isWrongBlocked, wrongPinRes.error?.message || 'Blocked');
} else {
  skip += 2;
  console.log('⏭ T16-T17 PIN recovery tests — SKIP (no desk staff)');
}

// ---- summary ----
console.log('\n=================================================================');
console.log(`${pass} pass · ${fail} fail · ${skip} skip`);
console.log('=================================================================\n');

if (fail > 0) {
  console.error('❌ Attack matrix suite FAILED. Fix findings before release.');
  process.exit(1);
} else {
  console.log('🎉 Attack matrix suite PASSED cleanly.');
  process.exit(0);
}
