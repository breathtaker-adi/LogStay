/**
 * TD3 Machine Readable Zone (MRZ) Parser for ICAO Doc 9303 Passports.
 *
 * TD3 Passports feature two lines of exactly 44 characters at the bottom.
 * Implements standard modulo 10 weighted check digit verification [7, 3, 1].
 */

import { COUNTRIES } from './countries';

const W = [7, 3, 1];

/**
 * Maps MRZ characters to integer values according to ICAO Doc 9303.
 * '<' = 0, '0'-'9' = 0-9, 'A'-'Z' = 10-35.
 */
export const val = (c: string): number => {
  if (c === '<') return 0;
  if (c >= '0' && c <= '9') return Number(c);
  const code = c.charCodeAt(0);
  if (code >= 65 && code <= 90) return code - 55; // 'A' -> 10
  return 0;
};

/**
 * Computes the ICAO Doc 9303 check digit for a string using repeating weights 7, 3, 1.
 */
export const checkDigit = (s: string): number => {
  return (
    s
      .split('')
      .reduce((sum, c, i) => sum + val(c) * W[i % 3], 0) % 10
  );
};

/**
 * Corrects common optical OCR character substitutions on numeric fields.
 */
export const normalizeDigits = (s: string): string =>
  s
    .replace(/O/g, '0')
    .replace(/I/g, '1')
    .replace(/L/g, '1')
    .replace(/B/g, '8')
    .replace(/Z/g, '2')
    .replace(/S/g, '5');

export interface ParsedMRZ {
  ok: boolean;
  passportNo: string;
  issuer: string;
  nationalityCode: string;
  nationalityName: string;
  dobRaw: string;         // YYMMDD
  dobFormatted: string;   // YYYY-MM-DD
  expiryRaw: string;      // YYMMDD
  expiryFormatted: string;// YYYY-MM-DD
  sex: 'M' | 'F' | 'X' | string;
  surname: string;
  givenNames: string;
  fullName: string;
  compositeValid: boolean;
}

/**
 * Matches a 3-letter ICAO country code to our standard country database.
 */
export function resolveCountryFromICAO(code: string): string {
  if (!code) return '';
  const clean = code.trim().toLowerCase();
  
  if (clean === 'ind') return 'India';
  if (clean === 'gbr') return 'United Kingdom';
  if (clean === 'usa') return 'United States';
  if (clean === 'deu') return 'Germany';
  if (clean === 'fra') return 'France';
  if (clean === 'rus') return 'Russia';
  if (clean === 'isr') return 'Israel';
  if (clean === 'aus') return 'Australia';
  if (clean === 'can') return 'Canada';

  const match = COUNTRIES.find(c => 
    c.aliases.includes(clean) || c.name.toLowerCase().startsWith(clean)
  );

  return match ? match.name : code.toUpperCase();
}

/**
 * Converts a 6-digit YYMMDD string into YYYY-MM-DD.
 * For birth dates: years > current 2-digit year are 19xx; else 20xx.
 * For expiry dates: always 20xx.
 */
export function formatMRZDate(yymmdd: string, isExpiry: boolean = false): string {
  if (!yymmdd || yymmdd.length !== 6) return '';
  const yy = parseInt(yymmdd.slice(0, 2), 10);
  const mm = yymmdd.slice(2, 4);
  const dd = yymmdd.slice(4, 6);

  if (isNaN(yy)) return '';

  const currentYear2Digit = new Date().getFullYear() % 100;
  const century = isExpiry ? 2000 : (yy > currentYear2Digit ? 1900 : 2000);
  const fullYear = century + yy;

  return `${fullYear}-${mm}-${dd}`;
}

/**
 * Parses two 44-character lines of a TD3 passport MRZ.
 */
export function parseTD3(line1: string, line2: string): ParsedMRZ | null {
  const a = line1.replace(/\s/g, '').toUpperCase();
  const b = line2.replace(/\s/g, '').toUpperCase();

  // TD3 passport must be 44 chars and begin with 'P'
  if (a.length !== 44 || b.length !== 44 || a[0] !== 'P') {
    return null;
  }

  const issuer = a.slice(2, 5).replace(/</g, '');
  const [surPart, givenPart = ''] = a.slice(5).split('<<');
  const cleanText = (s: string) => s.replace(/</g, ' ').trim();
  const surname = cleanText(surPart);
  const givenNames = cleanText(givenPart);
  const fullName = `${givenNames} ${surname}`.trim();

  // Line 2 data
  const rawPassportNo = normalizeDigits(b.slice(0, 9));
  const passportCheck = Number(normalizeDigits(b[9]));
  const passportValid = checkDigit(rawPassportNo) === passportCheck;

  const nationalityCode = b.slice(10, 13).replace(/</g, '');
  const nationalityName = resolveCountryFromICAO(nationalityCode);

  const rawDob = normalizeDigits(b.slice(13, 19));
  const dobCheck = Number(normalizeDigits(b[19]));
  const dobValid = checkDigit(rawDob) === dobCheck;

  const rawSex = b[20];
  const sex = rawSex === 'M' ? 'M' : rawSex === 'F' ? 'F' : 'X';

  const rawExpiry = normalizeDigits(b.slice(21, 27));
  const expCheck = Number(normalizeDigits(b[27]));
  const expiryValid = checkDigit(rawExpiry) === expCheck;

  // Composite check digit over positions:
  // passportNo (0-9) + checkDigit (9) + dob (13-19) + dobCheck (19) + expiry (21-27) + expCheck (27) + optionalData (28-42) + optCheck (42)
  const compositeString = b.slice(0, 10) + b.slice(13, 20) + b.slice(21, 43);
  const compositeCheck = Number(normalizeDigits(b[43]));
  const compositeValid = checkDigit(compositeString) === compositeCheck;

  const allCheckDigitsValid = passportValid && dobValid && expiryValid;

  return {
    ok: allCheckDigitsValid,
    passportNo: rawPassportNo.replace(/</g, ''),
    issuer,
    nationalityCode,
    nationalityName,
    dobRaw: rawDob,
    dobFormatted: formatMRZDate(rawDob, false),
    expiryRaw: rawExpiry,
    expiryFormatted: formatMRZDate(rawExpiry, true),
    sex,
    surname,
    givenNames,
    fullName,
    compositeValid
  };
}

/**
 * Extracts and parses TD3 MRZ lines from raw OCR text lines.
 * Filters for lines containing '<' and at least 30 characters, then attempts TD3 parsing on the last pair.
 */
export function extractAndParseMRZ(rawLines: string[]): ParsedMRZ | null {
  if (!rawLines || rawLines.length < 2) return null;

  // Find candidate MRZ lines
  const candidates = rawLines
    .map(l => l.trim().replace(/\s+/g, ''))
    .filter(l => l.includes('<') && l.length >= 30);

  if (candidates.length < 2) return null;

  // Test the last 2 candidates
  for (let i = candidates.length - 2; i >= 0; i--) {
    const l1 = candidates[i];
    const l2 = candidates[i + 1];
    
    // Pad or trim if close to 44
    const padLine = (s: string) => {
      if (s.length === 44) return s;
      if (s.length > 44) return s.slice(0, 44);
      return s.padEnd(44, '<');
    };

    const parsed = parseTD3(padLine(l1), padLine(l2));
    if (parsed) return parsed;
  }

  return null;
}
