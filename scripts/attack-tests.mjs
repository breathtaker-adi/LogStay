// Section 7 attack matrix — automated security suite. Run: node scripts/attack-tests.mjs
// Prereqs: .env with EXPO_PUBLIC_SUPABASE_URL + EXPO_PUBLIC_SUPABASE_ANON_KEY,
//          TEST_A_EMAIL + TEST_A_PASSWORD (property A owner).
// Self-provisions a throwaway Property B. Clean up with: DELETE FROM properties WHERE name='AttackTestB';
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';

// ---- env loading ----
const env = {};
if (existsSync('.env')) {
  try {
    for (const l of readFileSync('.env', 'utf8').split('\n')) {
      const i = l.indexOf('=');
      if (i > 0 && !l.startsWith('#')) env[l.slice(0, i).trim()] = l.slice(i + 1).trim();
    }
  } catch {}
}

const URL_ = process.env.EXPO_PUBLIC_SUPABASE_URL || env.EXPO_PUBLIC_SUPABASE_URL || 'https://cmevtjqnztsisldaoghr.supabase.co';
const KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || env.EXPO_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNtZXZ0anFuenRzaXNsZGFvZ2hyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTExMDQ2MjMsImV4cCI6MjEwNjY4MDYyM30.6zwBUNXPSFK0g8K-byP9HJa4ZpaQB_YFJLnvuLqRoxM';
const A_EMAIL = process.env.TEST_A_EMAIL || env.TEST_A_EMAIL;
const A_PASS = process.env.TEST_A_PASSWORD || env.TEST_A_PASSWORD;

if (!A_EMAIL || !A_PASS) {
  console.error('\n❌ Missing TEST_A_EMAIL or TEST_A_PASSWORD.');
  console.error('Please run with:');
  console.error('$env:TEST_A_EMAIL="your-email"; $env:TEST_A_PASSWORD="your-password"; node scripts/attack-tests.mjs\n');
  process.exit(2);
}

const mk = () => createClient(URL_, KEY, { auth: { persistSession: false, autoRefreshToken: false } });

let pass = 0, fail = 0, skip = 0;
const check = (name, ok, note = '') => {
  ok ? pass++ : fail++;
  console.log(`${ok ? '✅' : '❌'} ${name}${note ? '  [' + note + ']' : ''}`);
};
const expectError = (name, { error }, note = '') => {
  const isErr = !!error;
  check(name, isErr, isErr ? (error.message || note) : 'UNAUTHORIZED WRITE SUCCEEDED — SECURITY LEAK');
};

console.log('=================================================================');
console.log('       LogStay Security Review — Section 7 Attack Matrix');
console.log('=================================================================\n');

// ---- 1. Login as Property A Owner & discover fixtures ----
const A = mk();
{
  const { error } = await A.auth.signInWithPassword({ email: A_EMAIL, password: A_PASS });
  if (error) {
    console.error('❌ Property A owner authentication failed:', error.message);
    process.exit(1);
  }
}

const { data: aMembers, error: aMemErr } = await A.from('members').select('property_id').limit(1);
if (aMemErr || !aMembers?.length) {
  console.error('❌ Could not resolve Property A from members table:', aMemErr?.message);
  process.exit(1);
}
const A_PROP = aMembers[0].property_id;

const { data: aStays } = await A.from('stays').select('id, unit_id').limit(1);
const A_STAY = aStays?.[0]?.id || randomUUID();
const A_UNIT = aStays?.[0]?.unit_id || randomUUID();

const { data: staff } = await A.from('staff_profiles_safe').select('id, role, name').eq('property_id', A_PROP);
const DESK = (staff || []).find(s => s.role === 'desk') || (staff || [])[0];
const HK = (staff || []).find(s => s.role === 'housekeeping');
const OWNER = (staff || []).find(s => s.role === 'owner');

console.log(`[Target Setup] Property A: ${A_PROP}`);
console.log(`               Active Stay: ${A_STAY}`);
console.log(`               Staff: Owner=${!!OWNER} Desk=${!!DESK} Housekeeping=${!!HK}\n`);

// ---- 2. Provision throwaway Property B ----
const B = mk();
const bEmail = `attack-b+${Date.now()}@example.com`;
const bPass = randomUUID();
const { data: bSignUpData, error: bSignUpErr } = await B.auth.signUp({ email: bEmail, password: bPass });
if (bSignUpErr) {
  console.error('❌ Property B signUp failed:', bSignUpErr.message);
  console.error('Note: If email confirmations are enabled on Supabase project, disable confirmation for test environments.');
  process.exit(1);
}

const bUser = bSignUpData?.user || (await B.auth.getSession()).data.session?.user;
if (!bUser) {
  console.error('❌ Property B user session unavailable.');
  process.exit(1);
}

let bProp;
{
  const { data, error } = await B.from('properties')
    .insert({ name: 'AttackTestB', owner_id: bUser.id })
    .select()
    .single();
  if (error) {
    console.error('❌ Property B insert failed:', error.message);
    process.exit(1);
  }
  bProp = data.id;
}
await B.from('members').insert({ property_id: bProp, user_id: bUser.id, role: 'owner' });

// Add room with unit in Property B
await B.rpc('add_room_with_units', {
  p_room_id: randomUUID(),
  p_label: 'B-101',
  p_kind: 'private',
  p_floor: null,
  p_unit_ids: [randomUUID()],
  p_unit_labels: null,
  p_gender_rule: 'any'
});

console.log(`[Attacker Setup] Property B created: ${bProp} (User: ${bUser.id})\n`);
console.log('--- Executing Isolation & Privilege Checks ---');

// ---- 3. Cross-property isolation (Section 7 test 1) ----
for (const tbl of ['guests', 'stays', 'shifts', 'cash_entries', 'audit_log']) {
  const { data } = await B.from(tbl).select('id').eq('property_id', A_PROP);
  const count = (data || []).length;
  check(`T1 Cross-property isolation on ${tbl}`, count === 0, count === 0 ? '0 leaked rows' : `LEAK: returned ${count} rows`);
}

// 3f. staff_profiles_safe view security_invoker check
{
  const { data } = await B.from('staff_profiles_safe').select('id').eq('property_id', A_PROP);
  const count = (data || []).length;
  check('T1f B reads A staff_profiles_safe (security_invoker)', count === 0, count === 0 ? '0 leaked rows' : `LEAK: returned ${count} rows`);
}

// ---- 4. Unauthorized direct writes (Tests 2, 3, 4, 8) ----
expectError('T2 Stranger B inserts members row into Property A',
  await B.from('members').insert({ property_id: A_PROP, user_id: bUser.id, role: 'owner' }));

expectError('T3 Direct UPDATE stays.paid_amount',
  await A.from('stays').update({ paid_amount: 999999 }).eq('id', A_STAY));

expectError('T4 Direct UPDATE properties.paid_until',
  await A.from('properties').update({ paid_until: '2099-01-01' }).eq('id', A_PROP));

expectError('T8a Direct audit_log UPDATE',
  await A.from('audit_log').update({ action: 'tampered' }).limit(1));

expectError('T8b Direct audit_log DELETE',
  await A.from('audit_log').delete().limit(1));

// ---- 5. Cross-property RPCs (Test 5) ----
expectError('T5 B attempts checkout on Property A stay',
  await B.rpc('check_out_guest', { p_stay_id: A_STAY, p_staff_id: randomUUID() }));

// ---- 6. Role enforcement (Owner-only RPCs, actor = desk) ----
if (DESK) {
  expectError('T6a Desk resets PIN (reset_staff_pin)',
    await A.rpc('reset_staff_pin', { p_prop: A_PROP, p_actor: DESK.id, p_target: DESK.id, p_new_pin: '9999' }));

  expectError('T6b Desk refunds payment (refund_payment)',
    await A.rpc('refund_payment', { p_payment_id: randomUUID(), p_staff_id: DESK.id, p_reason: 'Unauthorized desk refund' }));

  expectError('T6c Desk adds staff (owner_add_staff)',
    await A.rpc('owner_add_staff', { p_prop: A_PROP, p_actor: DESK.id, p_name: 'Hacker', p_phone: '9999999999', p_role: 'owner', p_pin: '1234' }));

  expectError('T6e Desk deactivates staff (deactivate_staff)',
    await A.rpc('deactivate_staff', { p_prop: A_PROP, p_actor: DESK.id, p_target: DESK.id, p_reason: 'Desk self-removal' }));
} else {
  skip += 4;
  console.log('⏭ T6a/b/c/e Desk actor tests — SKIP (no desk profile in property)');
}

// T6d: Housekeeping check-in guard
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
  expectError('T6d Housekeeping attempts guest check-in (check_in_guest)', res);
} else {
  skip++;
  console.log('⏭ T6d Housekeeping check-in — SKIP (no housekeeping profile in property)');
}

// ---- 7. Idempotency replay (Test 7) ----
const replayPaymentId = randomUUID();
let replaySuccess = true;
for (let i = 0; i < 5; i++) {
  const { error } = await A.rpc('record_payment', {
    p_payment_id: replayPaymentId,
    p_stay_id: A_STAY,
    p_amount: 100,
    p_pay_mode: 'upi',
    p_staff_id: DESK?.id || OWNER?.id
  });
  if (error && i === 0) {
    replaySuccess = false;
    break;
  }
}
const { data: paymentRows } = await A.from('payments').select('id').eq('id', replayPaymentId);
const paymentCount = paymentRows?.length || 0;
check('T7 Payment idempotency replay ×5', paymentCount === 1, `${paymentCount} payment row inserted`);

// ---- 8. Online brute-force lockout (Test 8a) ----
if (DESK) {
  let lockoutHit = false;
  let lastMsg = '';
  for (let i = 0; i < 6; i++) {
    const { data: success, error } = await A.rpc('staff_login', {
      p_staff: DESK.id,
      p_pin: '000000_wrong_pin'
    });
    if (error) {
      lastMsg = error.message;
      if (/lock/i.test(error.message)) {
        lockoutHit = true;
        break;
      }
    }
  }
  check('T8 Online brute-force PIN lockout after 5 failures', lockoutHit, lastMsg || 'Locked');
} else {
  skip++;
  console.log('⏭ T8 Online lockout test — SKIP (no desk staff)');
}

// ---- 9. Signed URL expiry (Test 10) ----
{
  const { data: gPhotos } = await A.from('guests')
    .select('id_photo_path')
    .not('id_photo_path', 'is', null)
    .limit(1);

  const g = gPhotos?.[0];
  if (!g?.id_photo_path) {
    skip++;
    console.log('⏭ T9 Signed URL expiry — SKIP (no guests with active photo in property)');
  } else {
    const { data: urlData, error: urlErr } = await A.storage
      .from('id_photos')
      .createSignedUrl(g.id_photo_path, 2);

    if (urlErr || !urlData?.signedUrl) {
      check('T9 Storage createSignedUrl', false, urlErr?.message || 'Failed to create URL');
    } else {
      await new Promise(r => setTimeout(r, 4000)); // wait 4 seconds for 2s URL to expire
      const res = await fetch(urlData.signedUrl);
      check('T9 Signed URL expired after TTL', !res.ok, `HTTP ${res.status} (expired)`);
    }
  }
}

// ---- Summary ----
console.log('\n=================================================================');
console.log(`Results: ${pass} passed · ${fail} failed · ${skip} skipped`);
console.log('=================================================================');

if (fail > 0) {
  console.error('\n⚠️ Fix all security findings marked with ❌ before release.\n');
  process.exit(1);
} else {
  console.log('\n🎉 All Section 7 security attack tests PASSED.\n');
  process.exit(0);
}
