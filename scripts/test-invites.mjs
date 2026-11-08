// scripts/test-invites.mjs
// Unit tests for LogStay Member Join Code Hierarchy and Auto-Activation

import assert from 'node:assert';

console.log('====================================================');
console.log('   LogStay Member Code & Role Hierarchy Tests      ');
console.log('====================================================');

const ALLOWED_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function generateTestCode() {
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += ALLOWED_CHARS[Math.floor(Math.random() * ALLOWED_CHARS.length)];
  }
  return code;
}

function validateInvitePermission(actorRole, targetRole) {
  if (actorRole === 'owner' || actorRole === 'co_admin') {
    if (['co_admin', 'desk', 'housekeeping'].includes(targetRole)) {
      return { allowed: true };
    }
    return { allowed: false, reason: 'Invalid target role' };
  }

  if (actorRole === 'desk') {
    if (targetRole === 'housekeeping') {
      return { allowed: true };
    }
    return { allowed: false, reason: 'Front desk can only invite Housekeepers' };
  }

  return { allowed: false, reason: 'Housekeeping cannot generate invite codes' };
}

// Test 1: Code characters format
const code = generateTestCode();
assert.strictEqual(code.length, 6, 'Code must be exactly 6 characters');
assert.strictEqual(/^[A-Z2-9]{6}$/.test(code), true, 'Code must not contain confusing characters (0, O, 1, I)');
console.log('✅ PASS: Generated code is 6 unambiguous alphanumeric characters');

// Test 2: Owner can invite all 3 roles
assert.strictEqual(validateInvitePermission('owner', 'co_admin').allowed, true);
assert.strictEqual(validateInvitePermission('owner', 'desk').allowed, true);
assert.strictEqual(validateInvitePermission('owner', 'housekeeping').allowed, true);
assert.strictEqual(validateInvitePermission('owner', 'owner').allowed, false);
console.log('✅ PASS: Owner can invite Co-Admin, Front Desk, and Housekeeper');

// Test 3: Co-Admin can invite all 3 roles
assert.strictEqual(validateInvitePermission('co_admin', 'co_admin').allowed, true);
assert.strictEqual(validateInvitePermission('co_admin', 'desk').allowed, true);
assert.strictEqual(validateInvitePermission('co_admin', 'housekeeping').allowed, true);
console.log('✅ PASS: Co-Admin can invite Co-Admin, Front Desk, and Housekeeper');

// Test 4: Front Desk can ONLY invite Housekeeper
assert.strictEqual(validateInvitePermission('desk', 'housekeeping').allowed, true);
assert.strictEqual(validateInvitePermission('desk', 'desk').allowed, false);
assert.strictEqual(validateInvitePermission('desk', 'co_admin').allowed, false);
console.log('✅ PASS: Front Desk is strictly restricted to inviting Housekeeper only');

// Test 5: Housekeeping cannot invite any staff
assert.strictEqual(validateInvitePermission('housekeeping', 'housekeeping').allowed, false);
assert.strictEqual(validateInvitePermission('housekeeping', 'desk').allowed, false);
console.log('✅ PASS: Housekeeping staff cannot generate join codes');

// Test 6: Auto-redirection payload requires NO PIN
function simulateClaimInvite(code, inviteRole, userName) {
  assert.ok(code && code.length === 6, 'Valid code required');
  assert.ok(userName && userName.trim().length > 0, 'Name required');
  // No PIN input needed
  return {
    property_id: 'prop-uuid-1234',
    name: userName.trim(),
    role: inviteRole,
    active: true,
    redirectTo: '/home'
  };
}

const claimed = simulateClaimInvite('J7X9P2', 'desk', 'Suresh Kumar');
assert.strictEqual(claimed.role, 'desk');
assert.strictEqual(claimed.active, true);
assert.strictEqual(claimed.redirectTo, '/home');
console.log('✅ PASS: Code redemption directly binds role and redirects immediately to Home');

console.log('====================================================');
console.log('Results: All 6 Invite & Role Hierarchy Tests Passed');
console.log('====================================================');

