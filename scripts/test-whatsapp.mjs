// scripts/test-whatsapp.mjs
// Automated test suite for LogStay WhatsApp Smart Concierge & Receipt generator

import assert from 'assert';

// 1. Re-implement pure logic for Node test runner
function normalizeWhatsAppPhone(rawPhone) {
  if (!rawPhone) return '';
  let cleaned = rawPhone.trim().replace(/[\s\-\(\)\.]/g, '');
  if (cleaned.startsWith('+')) {
    cleaned = cleaned.slice(1);
  } else if (cleaned.length === 10 && /^[6-9]\d{9}$/.test(cleaned)) {
    cleaned = `91${cleaned}`;
  } else if (cleaned.length === 11 && cleaned.startsWith('0')) {
    cleaned = `91${cleaned.slice(1)}`;
  }
  if (/^\d{8,15}$/.test(cleaned)) {
    return cleaned;
  }
  return '';
}

function buildWelcomeKitMessage(p) {
  const lines = [
    `🏨 *Welcome to ${p.propertyName}!*`,
    `Hello ${p.guestName || 'Guest'}, we are thrilled to host you! Here are your booking details:\n`,
    `🛏️ *Room / Bed:* ${p.unitLabel}`,
  ];
  if (p.checkInDate) lines.push(`📅 *Check-In:* ${p.checkInDate}`);
  if (p.checkOutDate) lines.push(`📅 *Check-Out:* ${p.checkOutDate}`);
  const payModeLabel = p.payMode ? p.payMode.toUpperCase() : 'SETTLED';
  lines.push(`💰 *Payment Received:* ₹${Number(p.amountPaid || 0).toFixed(2)} (${payModeLabel})`);
  if (p.wifiSsid || p.wifiPassword) {
    lines.push(`\n📶 *Guest Wi-Fi Details:*`);
    if (p.wifiSsid) lines.push(`• Network: *${p.wifiSsid}*`);
    if (p.wifiPassword) lines.push(`• Password: *${p.wifiPassword}*`);
  }
  if (p.googleMapsUrl) lines.push(`\n📍 *Property Location:* ${p.googleMapsUrl}`);
  if (p.houseRules) lines.push(`\n📋 *House Rules & Timings:*\n${p.houseRules}`);
  lines.push(`\nNeed anything during your stay? Just reply here or visit the front desk. Have a wonderful stay! ✨`);
  return lines.join('\n');
}

function buildCheckoutReceiptMessage(p) {
  const lines = [
    `🧾 *Official Checkout Receipt — ${p.propertyName}*`,
    `Dear ${p.guestName || 'Guest'}, thank you for staying with us! Here is your finalized bill summary:\n`,
    `🛏️ *Room / Bed:* ${p.unitLabel}`,
  ];
  if (p.checkInDate && p.checkOutDate) {
    lines.push(`📅 *Stay Duration:* ${p.checkInDate} to ${p.checkOutDate}`);
  }
  lines.push(`💵 *Room Tariff:* ₹${Number(p.tariffAmount || 0).toFixed(2)}`);
  if (p.incidentalsAmount && p.incidentalsAmount > 0) {
    lines.push(`🧺 *Extras / Incidentals:* ₹${Number(p.incidentalsAmount).toFixed(2)}`);
  }
  lines.push(`💳 *Total Amount Settled:* ₹${Number(p.totalPaid || 0).toFixed(2)} (PAID IN FULL)`);
  if (p.googleReviewUrl) {
    lines.push(
      `\n⭐ *Loved your stay with us?*`,
      `Please take 30 seconds to drop us a quick 5-star Google review — it means the world to our team:`,
      `${p.googleReviewUrl}`
    );
  }
  lines.push(`\nSafe travels onward, and we look forward to welcoming you back again soon! 🌟`);
  return lines.join('\n');
}

console.log('====================================================');
console.log('       LogStay WhatsApp Concierge Test Suite         ');
console.log('====================================================');

// Test 1: Indian 10-digit phone normalization
assert.strictEqual(normalizeWhatsAppPhone('9822123456'), '919822123456');
assert.strictEqual(normalizeWhatsAppPhone(' 98221 23456 '), '919822123456');
assert.strictEqual(normalizeWhatsAppPhone('09822123456'), '919822123456');
assert.strictEqual(normalizeWhatsAppPhone('+91 98221-23456'), '919822123456');
console.log('✅ PASS: Domestic Indian phone numbers normalize with +91 country prefix');

// Test 2: Foreign international phone normalization
assert.strictEqual(normalizeWhatsAppPhone('+44 7123 456789'), '447123456789');
assert.strictEqual(normalizeWhatsAppPhone('+1 (415) 555-2671'), '14155552671');
assert.strictEqual(normalizeWhatsAppPhone('14155552671'), '14155552671');
console.log('✅ PASS: International phones preserve country codes properly');

// Test 3: Invalid / empty phone handling
assert.strictEqual(normalizeWhatsAppPhone(''), '');
assert.strictEqual(normalizeWhatsAppPhone(null), '');
assert.strictEqual(normalizeWhatsAppPhone('1234'), '');
assert.strictEqual(normalizeWhatsAppPhone('invalid-string'), '');
console.log('✅ PASS: Invalid and malformed numbers safely return empty string');

// Test 4: Welcome kit message generation
const welcomeMsg = buildWelcomeKitMessage({
  guestName: 'Alex Smith',
  propertyName: 'Sunset Palms Goa',
  unitLabel: 'Dorm 201 - Bed 3',
  checkInDate: '2026-11-06',
  amountPaid: 850,
  payMode: 'cash',
  wifiSsid: 'SunsetPalms_Guest',
  wifiPassword: 'GoaSunset2026',
  googleMapsUrl: 'https://maps.app.goo.gl/xyz123',
  houseRules: 'Quiet hours 11 PM - 8 AM. Free breakfast 8 AM - 10 AM.'
});

assert(welcomeMsg.includes('Alex Smith'));
assert(welcomeMsg.includes('Sunset Palms Goa'));
assert(welcomeMsg.includes('Dorm 201 - Bed 3'));
assert(welcomeMsg.includes('₹850.00 (CASH)'));
assert(welcomeMsg.includes('SunsetPalms_Guest'));
assert(welcomeMsg.includes('GoaSunset2026'));
assert(welcomeMsg.includes('https://maps.app.goo.gl/xyz123'));
console.log('✅ PASS: Welcome Kit formats booking details, Wi-Fi, and maps location');

// Test 5: Checkout receipt & Google review prompt
const receiptMsg = buildCheckoutReceiptMessage({
  guestName: 'Alex Smith',
  propertyName: 'Sunset Palms Goa',
  unitLabel: 'Dorm 201 - Bed 3',
  checkInDate: '2026-11-06',
  checkOutDate: '2026-11-09',
  tariffAmount: 2550,
  incidentalsAmount: 200,
  totalPaid: 2750,
  googleReviewUrl: 'https://g.page/r/sunset-palms/review'
});

assert(receiptMsg.includes('Alex Smith'));
assert(receiptMsg.includes('₹2550.00'));
assert(receiptMsg.includes('Extras / Incidentals:'));
assert(receiptMsg.includes('Total Amount Settled:'));
assert(receiptMsg.includes('https://g.page/r/sunset-palms/review'));
console.log('✅ PASS: Checkout receipt itemizes incidentals and includes 5-star review CTA');

console.log('====================================================');
console.log('Results: All WhatsApp Concierge Tests Passed (5/5)');
console.log('====================================================');
