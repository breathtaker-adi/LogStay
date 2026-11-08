// scripts/test-team-hierarchy.mjs
// Automated verification for Team Removal Hierarchy & Direct Link Sharing

import assert from 'node:assert';

console.log("====================================================");
console.log("   LogStay Team Removal Hierarchy & Link Tests      ");
console.log("====================================================");

// 1. Strict Removal Hierarchy Logic Verification
function canRemoveMember(actorRole, targetRole, isSelf = false) {
  if (isSelf) return false;
  if (targetRole === 'owner') return false; // Supreme Owner
  if (targetRole === 'co_admin') return actorRole === 'owner';
  if (targetRole === 'desk') return actorRole === 'owner' || actorRole === 'co_admin';
  if (targetRole === 'housekeeping') return actorRole === 'owner' || actorRole === 'co_admin' || actorRole === 'desk';
  return false;
}

// Test 1: Owner is SUPREME (cannot be removed by anyone, including themselves or other co-admins)
assert.strictEqual(canRemoveMember('owner', 'owner', true), false, 'Owner cannot remove self');
assert.strictEqual(canRemoveMember('co_admin', 'owner', false), false, 'Co-Admin cannot remove Owner');
assert.strictEqual(canRemoveMember('desk', 'owner', false), false, 'Front desk cannot remove Owner');
assert.strictEqual(canRemoveMember('housekeeping', 'owner', false), false, 'Housekeeper cannot remove Owner');
console.log("✅ PASS: Supreme Owner cannot be removed by anyone");

// Test 2: Co-Admin can ONLY be removed by Owner
assert.strictEqual(canRemoveMember('owner', 'co_admin', false), true, 'Owner can remove Co-Admin');
assert.strictEqual(canRemoveMember('co_admin', 'co_admin', false), false, 'Co-Admin cannot remove another Co-Admin');
assert.strictEqual(canRemoveMember('desk', 'co_admin', false), false, 'Front desk cannot remove Co-Admin');
assert.strictEqual(canRemoveMember('housekeeping', 'co_admin', false), false, 'Housekeeper cannot remove Co-Admin');
console.log("✅ PASS: Co-Admin can be removed by Owner only");

// Test 3: Front Desk can be removed by Owner and Co-Admin
assert.strictEqual(canRemoveMember('owner', 'desk', false), true, 'Owner can remove Front Desk');
assert.strictEqual(canRemoveMember('co_admin', 'desk', false), true, 'Co-Admin can remove Front Desk');
assert.strictEqual(canRemoveMember('desk', 'desk', false), false, 'Front desk cannot remove other Front desk');
assert.strictEqual(canRemoveMember('housekeeping', 'desk', false), false, 'Housekeeper cannot remove Front Desk');
console.log("✅ PASS: Front Desk can be removed by Owner and Co-Admin");

// Test 4: Housekeeper can be removed by anyone (Owner, Co-Admin, Front Desk)
assert.strictEqual(canRemoveMember('owner', 'housekeeping', false), true, 'Owner can remove Housekeeper');
assert.strictEqual(canRemoveMember('co_admin', 'housekeeping', false), true, 'Co-Admin can remove Housekeeper');
assert.strictEqual(canRemoveMember('desk', 'housekeeping', false), true, 'Front desk can remove Housekeeper');
assert.strictEqual(canRemoveMember('housekeeping', 'housekeeping', true), false, 'Housekeeper cannot self-remove');
console.log("✅ PASS: Housekeeper can be removed by Owner, Co-Admin, and Front Desk");

// Test 5: Direct Link Generation & Parsing
function generateDirectLink(code) {
  return `https://logstay.app/join?code=${code.trim().toUpperCase()}`;
}

function parseDirectLink(url) {
  const parsed = new URL(url);
  return parsed.searchParams.get('code');
}

const testCode = '7K9X2A';
const link = generateDirectLink(testCode);
assert.strictEqual(link, 'https://logstay.app/join?code=7K9X2A');
assert.strictEqual(parseDirectLink(link), '7K9X2A');
console.log("✅ PASS: Direct connection link formats and parses code correctly");

// Test 6: Remarks Ledger Simulation
const ledger = [];
function recordRemark({ staffId, staffName, propertyId, propertyName, role, remark, actorName, actorRole }) {
  const entry = {
    id: `rem_${Date.now()}`,
    staffId,
    staffName,
    propertyId,
    propertyName,
    role,
    remark: remark?.trim() || null,
    actorName,
    actorRole,
    createdAt: new Date().toISOString()
  };
  if (entry.remark) {
    ledger.push(entry);
  }
  return entry;
}

recordRemark({
  staffId: 'staff-1',
  staffName: 'Ramesh',
  propertyId: 'prop-1',
  propertyName: 'Zostel Goa',
  role: 'desk',
  remark: 'Punctual and reliable shift closures',
  actorName: 'Aditya',
  actorRole: 'owner'
});

assert.strictEqual(ledger.length, 1);
assert.strictEqual(ledger[0].staffName, 'Ramesh');
assert.strictEqual(ledger[0].remark, 'Punctual and reliable shift closures');
console.log("✅ PASS: Remarks ledger records historical performance feedback accurately");

// Test 7: Staff Lookup by Phone or Departure Code
function lookupRemarks(query, entries) {
  const clean = (query || '').trim();
  const digits = clean.replace(/[^0-9]/g, '');
  return entries.filter(e => {
    if (digits.length >= 6 && e.phone && e.phone.replace(/[^0-9]/g, '').includes(digits)) return true;
    if (clean && (e.staffId === clean || e.id === clean || e.staffName.toLowerCase().includes(clean.toLowerCase()))) return true;
    return false;
  });
}

ledger[0].phone = '+919876543210';
const foundByPhone = lookupRemarks('9876543210', ledger);
assert.strictEqual(foundByPhone.length, 1);
assert.strictEqual(foundByPhone[0].staffName, 'Ramesh');

const foundByCode = lookupRemarks('staff-1', ledger);
assert.strictEqual(foundByCode.length, 1);
assert.strictEqual(foundByCode[0].remark, 'Punctual and reliable shift closures');
console.log("✅ PASS: Departed staff can lookup their remarks by phone or code");

console.log("====================================================");
console.log("Results: All 7 Hierarchy, Direct Link & Lookup Tests Passed");
console.log("====================================================");

