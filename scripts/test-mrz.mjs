// scripts/test-mrz.mjs
// Unit tests for TD3 MRZ parser, modulo-10 check digits, OCR error correction, and specimen tests

import assert from 'node:assert';

const W = [7, 3, 1];

const val = (c) => {
  if (c === '<') return 0;
  if (c >= '0' && c <= '9') return Number(c);
  const code = c.charCodeAt(0);
  if (code >= 65 && code <= 90) return code - 55;
  return 0;
};

const checkDigit = (s) => {
  return s.split('').reduce((sum, c, i) => sum + val(c) * W[i % 3], 0) % 10;
};

const normalizeDigits = (s) =>
  s.replace(/O/g, '0').replace(/I/g, '1').replace(/L/g, '1').replace(/B/g, '8').replace(/Z/g, '2').replace(/S/g, '5');

function resolveCountry(code) {
  const c = (code || '').toUpperCase();
  if (c === 'GBR') return 'United Kingdom';
  if (c === 'IND') return 'India';
  if (c === 'DEU') return 'Germany';
  if (c === 'USA') return 'United States';
  if (c === 'FRA') return 'France';
  return c;
}

function parseTD3(line1, line2) {
  const a = line1.replace(/\s/g, '').toUpperCase();
  const b = line2.replace(/\s/g, '').toUpperCase();

  if (a.length !== 44 || b.length !== 44 || a[0] !== 'P') return null;

  const issuer = a.slice(2, 5).replace(/</g, '');
  const [surPart, givenPart = ''] = a.slice(5).split('<<');
  const cleanText = (s) => s.replace(/</g, ' ').trim();
  const surname = cleanText(surPart);
  const givenNames = cleanText(givenPart);
  const fullName = `${givenNames} ${surname}`.trim();

  const rawPassportNo = normalizeDigits(b.slice(0, 9));
  const passportCheck = Number(normalizeDigits(b[9]));
  const passportValid = checkDigit(rawPassportNo) === passportCheck;

  const nationalityCode = b.slice(10, 13).replace(/</g, '');
  const nationalityName = resolveCountry(nationalityCode);

  const rawDob = normalizeDigits(b.slice(13, 19));
  const dobCheck = Number(normalizeDigits(b[19]));
  const dobValid = checkDigit(rawDob) === dobCheck;

  const rawSex = b[20];
  const sex = rawSex === 'M' ? 'M' : rawSex === 'F' ? 'F' : 'X';

  const rawExpiry = normalizeDigits(b.slice(21, 27));
  const expCheck = Number(normalizeDigits(b[27]));
  const expiryValid = checkDigit(rawExpiry) === expCheck;

  const compositeString = b.slice(0, 10) + b.slice(13, 20) + b.slice(21, 43);
  const compositeCheck = Number(normalizeDigits(b[43]));
  const compositeValid = checkDigit(compositeString) === compositeCheck;

  const allCheckDigitsValid = passportValid && dobValid && expiryValid;

  const yy = parseInt(rawDob.slice(0, 2), 10);
  const dobFormatted = `${yy > 26 ? 1900 + yy : 2000 + yy}-${rawDob.slice(2, 4)}-${rawDob.slice(4, 6)}`;
  const expYy = parseInt(rawExpiry.slice(0, 2), 10);
  const expiryFormatted = `20${expYy}-${rawExpiry.slice(2, 4)}-${rawExpiry.slice(4, 6)}`;

  return {
    ok: allCheckDigitsValid,
    passportNo: rawPassportNo.replace(/</g, ''),
    issuer,
    nationalityCode,
    nationalityName,
    dobRaw: rawDob,
    dobFormatted,
    expiryRaw: rawExpiry,
    expiryFormatted,
    sex,
    surname,
    givenNames,
    fullName,
    compositeValid
  };
}

function extractAndParseMRZ(rawLines) {
  const candidates = rawLines
    .map(l => l.trim().replace(/\s+/g, ''))
    .filter(l => l.includes('<') && l.length >= 30);

  if (candidates.length < 2) return null;

  const padLine = (s) => (s.length >= 44 ? s.slice(0, 44) : s.padEnd(44, '<'));
  return parseTD3(padLine(candidates[candidates.length - 2]), padLine(candidates[candidates.length - 1]));
}

console.log('====================================================');
console.log('        LogStay MRZ Parser Unit Test Suite           ');
console.log('====================================================\n');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`✅ PASS: ${name}`);
    passed++;
  } catch (err) {
    console.error(`❌ FAIL: ${name}`);
    console.error(`   ${err.message}`);
    failed++;
  }
}

// 1. Check Digit tests
test('checkDigit calculation matches ICAO Doc 9303 standard', () => {
  assert.strictEqual(checkDigit('L898902C<'), 3);
  assert.strictEqual(checkDigit('690806'), 1);
  assert.strictEqual(checkDigit('940623'), 6);
});

// 2. Full TD3 Parsing - Specimen 1 (UK Specimen)
test('parseTD3 parses valid TD3 passport lines correctly', () => {
  const line1 = 'P<GBRSTEVENS<<SARAH<<<<<<<<<<<<<<<<<<<<<<<<<';
  const line2 = '9902468307GBR8501019F2501017<<<<<<<<<<<<<<<0';

  const res = parseTD3(line1, line2);
  assert(res !== null, 'Should parse valid TD3');
  assert.strictEqual(res.ok, true, 'Check digits should be valid');
  assert.strictEqual(res.passportNo, '990246830');
  assert.strictEqual(res.issuer, 'GBR');
  assert.strictEqual(res.nationalityCode, 'GBR');
  assert.strictEqual(res.nationalityName, 'United Kingdom');
  assert.strictEqual(res.surname, 'STEVENS');
  assert.strictEqual(res.givenNames, 'SARAH');
  assert.strictEqual(res.fullName, 'SARAH STEVENS');
  assert.strictEqual(res.sex, 'F');
  assert.strictEqual(res.dobFormatted, '1985-01-01');
  assert.strictEqual(res.expiryFormatted, '2025-01-01');
});

// 3. Indian Passport Specimen
test('parseTD3 parses Indian passport specimen', () => {
  const line1 = 'P<INDSHARMA<<ADITYA<<<<<<<<<<<<<<<<<<<<<<<<<';
  const line2 = 'Z123456748IND9805152M3005158<<<<<<<<<<<<<<<4';

  const res = parseTD3(line1, line2);
  assert(res !== null);
  assert.strictEqual(res.surname, 'SHARMA');
  assert.strictEqual(res.givenNames, 'ADITYA');
  assert.strictEqual(res.nationalityName, 'India');
  assert.strictEqual(res.sex, 'M');
  assert.strictEqual(res.dobFormatted, '1998-05-15');
});

// 4. Tampered Check Digit Rejection
test('parseTD3 detects and rejects corrupted check digits', () => {
  const line1 = 'P<GBRSTEVENS<<SARAH<<<<<<<<<<<<<<<<<<<<<<<<<';
  const line2Tampered = '9902468317GBR8501019F2501017<<<<<<<<<<<<<<<0';

  const res = parseTD3(line1, line2Tampered);
  assert(res !== null);
  assert.strictEqual(res.ok, false, 'Tampered passport number must invalidate check digit');
});

// 5. OCR Character Normalization
test('normalizeDigits fixes optical misreads (O->0, I->1, B->8)', () => {
  const line1 = 'P<GBRSTEVENS<<SARAH<<<<<<<<<<<<<<<<<<<<<<<<<';
  const line2OCR = '99O24683O7GBR85O1O19F25O1O17<<<<<<<<<<<<<<<O';

  const res = parseTD3(line1, line2OCR);
  assert(res !== null);
  assert.strictEqual(res.ok, true, 'Normalized OCR characters should satisfy check digits');
  assert.strictEqual(res.dobRaw, '850101');
  assert.strictEqual(res.dobFormatted, '1985-01-01');
});

// 6. extractAndParseMRZ from noisy camera text
test('extractAndParseMRZ ignores noisy header lines and extracts MRZ', () => {
  const noisyOCR = [
    'PASSPORT',
    'UNITED KINGDOM OF GREAT BRITAIN',
    'AND NORTHERN IRELAND',
    'Type/Type Code / Code P / GBR',
    'Surname STEVENS',
    'Given Names SARAH',
    'P<GBRSTEVENS<<SARAH<<<<<<<<<<<<<<<<<<<<<<<<<',
    '9902468307GBR8501019F2501017<<<<<<<<<<<<<<<0',
    'Some random footer text'
  ];

  const res = extractAndParseMRZ(noisyOCR);
  assert(res !== null, 'Should extract MRZ from noisy text');
  assert.strictEqual(res.fullName, 'SARAH STEVENS');
  assert.strictEqual(res.passportNo, '990246830');
});

console.log(`\n====================================================`);
console.log(`Results: ${passed} Passed, ${failed} Failed`);
console.log(`====================================================`);

if (failed > 0) process.exit(1);
