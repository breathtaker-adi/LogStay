// Section 7 attack matrix — scriptable subset. Run: node scripts/attack-tests.mjs
// Prereqs: .env with EXPO_PUBLIC_SUPABASE_URL + EXPO_PUBLIC_SUPABASE_ANON_KEY,
//          TEST_A_EMAIL + TEST_A_PASSWORD (your property A owner).
// Self-provisions a throwaway Property B. Clean up with the SQL at the end.
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';

// ---- Discovered RPC Signatures (Step 0) ----
const RPC = {
  deactivate_staff: { p_prop: 'uuid', p_actor: 'uuid', p_target: 'uuid', p_reason: 'text' },
  owner_add_staff:  { p_prop: 'uuid', p_actor: 'uuid', p_name: 'text', p_phone: 'text', p_role: 'text', p_pin: 'text' },
  record_payment:   { p_payment_id: 'uuid', p_stay_id: 'uuid', p_amount: 'numeric', p_pay_mode: 'text', p_staff_id: 'uuid' },
  refund_payment:   { p_payment_id: 'uuid', p_staff_id: 'uuid', p_reason: 'text' },
  reset_staff_pin:  { p_prop: 'uuid', p_actor: 'uuid', p_target: 'uuid', p_new_pin: 'text' },
  staff_login:      { p_staff: 'uuid', p_pin: 'text' },
};

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

const URL_ = process.env.EXPO_PUBLIC_SUPABASE_URL || env.EXPO_PUBLIC_SUPABASE_URL || 'https://cmevtjqnztsisldaoghr.supabase.co';
const KEY  = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || env.EXPO_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNtZXZ0anFuenRzaXNsZGFvZ2hyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTExMDQ2MjMsImV4cCI6MjEwNjY4MDYyM30.6zwBUNXPSFK0g8K-byP9HJa4ZpaQB_YFJLnvuLqRoxM';
const A_EMAIL = process.env.TEST_A_EMAIL || env.TEST_A_EMAIL || 'test@logstay.com';
const A_PASS  = process.env.TEST_A_PASSWORD || env.TEST_A_PASSWORD || 'Test@123';

if (!URL_ || !KEY || !A_EMAIL || !A_PASS) {
  console.error('Missing env vars (see header).');
  process.exit(2);
}

const mk = () => createClient(URL_, KEY,
  { auth: { persistSession: false, autoRefreshToken: false } });

let pass = 0, fail = 0, skip = 0;
const check = (name, ok, note = '') => {
  ok ? pass++ : fail++;
  console.log(`${ok ? '✅' : '❌'} ${name}${note ? '  [' + note + ']' : ''}`);
};
const expectError = (name, { error }, note) =>
  check(name, !!error, error ? error.message : 'SUCCEEDED — LEAK');

console.log('=================================================================');
console.log('       LogStay Security Review — Section 7 Attack Matrix');
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
      console.error('B auth failed:', upErr.message,
        '— if email confirmation is enabled, confirm the address or disable it for the test');
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
  const { data, error } = await B.from('properties')
    .insert({ name: 'AttackTestB', type: 'hostel', state: 'Goa', owner_id: bUser.id }).select().single();
  if (error) { console.error('B property insert failed:', error.message); process.exit(1); }
  bProp = data.id;
  await B.from('members').insert({ property_id: bProp, user_id: bUser.id, role: 'owner' });
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

// ---- 4. Unauthorized writes (tests 2, 3, 4, 8) ----
expectError('T2 stranger inserts members row',
  await B.from('members').insert({ property_id: A_PROP, user_id: bUser.id, role: 'owner' }));
expectError('T3 direct UPDATE stays.paid_amount',
  await A.from('stays').update({ paid_amount: 999999 }).eq('id', A_STAY));
expectError('T4 direct UPDATE properties.paid_until',
  await A.from('properties').update({ paid_until: '2099-01-01' }).eq('id', A_PROP));
expectError('T8a audit_log UPDATE',
  await A.from('audit_log').update({ action: 'tampered' }).limit(1));
expectError('T8b audit_log DELETE',
  await A.from('audit_log').delete().limit(1));

// ---- 5. Cross-property RPCs (tests 4/6) ----
expectError('T5 B closes A\'s stay',
  await B.rpc('check_out_guest', { p_stay_id: A_STAY }));

// ---- 6. Role enforcement (owner-only RPCs, actor = desk) ----
// Uses the shared-tablet reality: signed in as the account, p_actor/p_staff_id = desk staff.
// ⚠ T6d: if this PASSES, check_in_guest lacks a role check — that's a finding, not a script bug.
if (DESK) {
  expectError('T6a desk resets PIN', await A.rpc('reset_staff_pin',
    { p_prop: A_PROP, p_actor: DESK.id, p_target: DESK.id, p_new_pin: '9999' }));

  expectError('T6b desk refunds payment', await A.rpc('refund_payment',
    { p_payment_id: randomUUID(), p_staff_id: DESK.id, p_reason: 'Unauthorized refund attempt' }));

  expectError('T6c desk adds staff', await A.rpc('owner_add_staff',
    { p_prop: A_PROP, p_actor: DESK.id, p_name: 'Attacker Staff', p_phone: '9999999999', p_role: 'owner', p_pin: '1234' }));

  expectError('T6e desk deactivates staff', await A.rpc('deactivate_staff',
    { p_prop: A_PROP, p_actor: DESK.id, p_target: DESK.id, p_reason: 'Desk self-removal' }));
} else {
  skip += 4;
  console.log('⏭ T6a/b/c/e desk actor tests — SKIP (no desk staff profile)');
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
  expectError('T6d housekeeping check-in guard', res);
} else {
  skip++;
  console.log('⏭ T6d housekeeping check-in — SKIP (no housekeeping staff profile)');
}

// ---- 7. Idempotency replay (test 7) ----
const PID = randomUUID();
for (let i = 0; i < 5; i++) {
  await A.rpc('record_payment', {
    p_payment_id: PID,
    p_stay_id: A_STAY,
    p_amount: 100,
    p_pay_mode: 'upi',
    p_staff_id: DESK?.id || OWNER?.id
  });
}
const paymentRows = (await A.from('payments').select('id').eq('id', PID)).data;
const n = (paymentRows || []).length;
check('T9 payment replay ×5', n === 1, `${n} rows`);

// ---- 8. Online brute-force lockout (test 8a) ----
if (DESK) {
  let r;
  for (let i = 0; i < 6; i++) {
    r = await A.rpc('staff_login', { p_staff: DESK.id, p_pin: '0000_wrong' });
  }
  const isLocked = /lock/i.test(r?.error?.message || '');
  check('T10 PIN lockout after 6', isLocked, r?.error?.message || 'Lockout triggered');
} else {
  skip++;
  console.log('⏭ T10 PIN lockout — SKIP (no desk staff)');
}

// ---- 9. Signed URL expiry (test 10) ----
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
