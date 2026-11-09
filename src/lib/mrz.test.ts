import { describe, it, expect } from 'vitest';
import {
  val,
  checkDigit,
  normalizeDigits,
  parseTD3,
  extractAndParseMRZ,
  resolveCountryFromICAO,
  formatMRZDate,
} from './mrz';

describe('src/lib/mrz.ts (ICAO Doc 9303 TD3 Passport MRZ Verification)', () => {
  // Official ICAO 9303 TD3 Specimen
  const SPECIMEN_L1 = 'P<UTOERIKSSON<<ANNA<MARIA<<<<<<<<<<<<<<<<<<<';
  const SPECIMEN_L2 = 'L898902C36UTO7408122F1204159ZE184226B<<<<<10';

  describe('ICAO Character Mapping & Modulo-10 Check Digit (Weights 7, 3, 1)', () => {
    it('maps filler character "<" to 0 and digits 0-9 to their values', () => {
      expect(val('<')).toBe(0);
      expect(val('0')).toBe(0);
      expect(val('5')).toBe(5);
      expect(val('9')).toBe(9);
    });

    it('maps uppercase letters A-Z to 10-35', () => {
      expect(val('A')).toBe(10);
      expect(val('B')).toBe(11);
      expect(val('Z')).toBe(35);
    });

    it('computes exact check digits for specimen fields with 7-3-1 weights', () => {
      // Passport "L898902C3" -> check digit is 6
      expect(checkDigit('L898902C3')).toBe(6);

      // Date of birth "740812" -> check digit is 2
      expect(checkDigit('740812')).toBe(2);

      // Expiry date "120415" -> check digit is 9
      expect(checkDigit('120415')).toBe(9);

      // Composite string check digit
      const compositeString =
        SPECIMEN_L2.slice(0, 10) + SPECIMEN_L2.slice(13, 20) + SPECIMEN_L2.slice(21, 43);
      expect(checkDigit(compositeString)).toBe(0);
    });
  });

  describe('Specimen TD3 Parsing', () => {
    it('successfully parses the official ICAO 9303 TD3 specimen without mutating passport number', () => {
      const parsed = parseTD3(SPECIMEN_L1, SPECIMEN_L2);

      expect(parsed).not.toBeNull();
      expect(parsed?.ok).toBe(true);
      expect(parsed?.passportNo).toBe('L898902C3');
      expect(parsed?.surname).toBe('ERIKSSON');
      expect(parsed?.givenNames).toBe('ANNA MARIA');
      expect(parsed?.fullName).toBe('ANNA MARIA ERIKSSON');
      expect(parsed?.sex).toBe('F');
      expect(parsed?.dobRaw).toBe('740812');
      expect(parsed?.dobFormatted).toBe('1974-08-12');
      expect(parsed?.expiryRaw).toBe('120415');
      expect(parsed?.expiryFormatted).toBe('2012-04-15');
      expect(parsed?.compositeValid).toBe(true);
    });

    it('handles lowercase characters and internal whitespace by normalizing', () => {
      const l1Lower = 'p<utoeriksson<<anna<maria<<<<<<<<<<<<<<<<<<<';
      const l2Spaced = 'L898902C36UTO7408122F 1204159ZE184226B<<<<<10';

      const parsed = parseTD3(l1Lower, l2Spaced);
      expect(parsed?.ok).toBe(true);
      expect(parsed?.surname).toBe('ERIKSSON');
    });

    it('returns null if line length is not 44 or first char is not "P"', () => {
      expect(parseTD3('SHORT_LINE', SPECIMEN_L2)).toBeNull();
      expect(parseTD3(SPECIMEN_L1, 'SHORT_LINE')).toBeNull();
      // First character not 'P' (e.g. Identity Card 'I')
      const notPassport = 'I' + SPECIMEN_L1.slice(1);
      expect(parseTD3(notPassport, SPECIMEN_L2)).toBeNull();
    });
  });

  describe('Error Detection & Single-Digit Corruption Property', () => {
    it('fails verification when single digit in passport check digit is corrupted', () => {
      // Correct check digit is 6; alter to 7
      const corruptedL2 = SPECIMEN_L2.slice(0, 9) + '7' + SPECIMEN_L2.slice(10);
      const parsed = parseTD3(SPECIMEN_L1, corruptedL2);
      expect(parsed?.ok).toBe(false);
    });

    it('fails verification when single digit in DOB check digit is corrupted', () => {
      // Correct DOB check digit is 2; alter to 3
      const corruptedL2 = SPECIMEN_L2.slice(0, 19) + '3' + SPECIMEN_L2.slice(20);
      const parsed = parseTD3(SPECIMEN_L1, corruptedL2);
      expect(parsed?.ok).toBe(false);
    });

    it('fails verification when single digit in expiry check digit is corrupted', () => {
      // Correct expiry check digit is 9; alter to 8
      const corruptedL2 = SPECIMEN_L2.slice(0, 27) + '8' + SPECIMEN_L2.slice(28);
      const parsed = parseTD3(SPECIMEN_L1, corruptedL2);
      expect(parsed?.ok).toBe(false);
    });

    it('property test: detects every single-digit substitution in numeric checked fields', () => {
      const digits = '0123456789';
      // Test across DOB: positions 13 to 18
      for (let pos = 13; pos < 19; pos++) {
        const origChar = SPECIMEN_L2[pos];
        for (const d of digits) {
          if (d === origChar) continue;
          const mutated = SPECIMEN_L2.slice(0, pos) + d + SPECIMEN_L2.slice(pos + 1);
          const parsed = parseTD3(SPECIMEN_L1, mutated);
          expect(parsed?.ok).toBe(false);
        }
      }
    });
  });

  describe('OCR Character Error Correction', () => {
    it('corrects optical OCR misreads in numeric fields (O->0, I->1, B->8, Z->2, S->5)', () => {
      expect(normalizeDigits('OIBZS')).toBe('01825');
    });

    it('does NOT alter letters within the alphanumeric passport number', () => {
      // In specimen, position 0 is letter 'L', position 7 is letter 'C'.
      const parsed = parseTD3(SPECIMEN_L1, SPECIMEN_L2);
      expect(parsed?.passportNo).toBe('L898902C3');
    });

    it('auto-recovers from typical camera OCR digit slips in DOB field', () => {
      // Replace '740812' with '74O8I2' (O instead of 0, I instead of 1)
      const ocrFlawedL2 = SPECIMEN_L2.slice(0, 13) + '74O8I2' + SPECIMEN_L2.slice(19);
      const parsed = parseTD3(SPECIMEN_L1, ocrFlawedL2);
      expect(parsed?.ok).toBe(true);
      expect(parsed?.dobRaw).toBe('740812');
    });
  });

  describe('Name Parsing & Edge Cases', () => {
    it('handles single name (no given name)', () => {
      const l1 = 'P<UTOERIKSSON<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<';
      const parsed = parseTD3(l1, SPECIMEN_L2);
      expect(parsed?.surname).toBe('ERIKSSON');
      expect(parsed?.givenNames).toBe('');
      expect(parsed?.fullName).toBe('ERIKSSON');
    });

    it('handles three or more given names', () => {
      const l1 = 'P<UTOSMITH<<JOHN<ROBERT<MICHAEL<<<<<<<<<<<<<';
      const parsed = parseTD3(l1, SPECIMEN_L2);
      expect(parsed?.surname).toBe('SMITH');
      expect(parsed?.givenNames).toBe('JOHN ROBERT MICHAEL');
      expect(parsed?.fullName).toBe('JOHN ROBERT MICHAEL SMITH');
    });
  });

  describe('Century & Date Conversion Rules', () => {
    it('formats birth dates: years > current year (26) are 19xx; years <= 26 are 20xx', () => {
      // 74 -> 1974
      expect(formatMRZDate('740812', false)).toBe('1974-08-12');
      // 98 -> 1998
      expect(formatMRZDate('980515', false)).toBe('1998-05-15');
      // 05 -> 2005
      expect(formatMRZDate('050101', false)).toBe('2005-01-01');
    });

    it('formats expiry dates: always 20xx in modern passports', () => {
      expect(formatMRZDate('300615', true)).toBe('2030-06-15');
      expect(formatMRZDate('120415', true)).toBe('2012-04-15');
    });
  });

  describe('Nationality Resolution', () => {
    it('resolves standard 3-letter ICAO codes to full country names', () => {
      expect(resolveCountryFromICAO('IND')).toBe('India');
      expect(resolveCountryFromICAO('USA')).toBe('United States');
      expect(resolveCountryFromICAO('GBR')).toBe('United Kingdom');
      expect(resolveCountryFromICAO('DEU')).toBe('Germany');
      expect(resolveCountryFromICAO('FRA')).toBe('France');
      expect(resolveCountryFromICAO('AUS')).toBe('Australia');
    });

    it('falls back to uppercase code for unknown or fictitious codes (e.g. Utopia "UTO")', () => {
      expect(resolveCountryFromICAO('UTO')).toBe('UTO');
      expect(resolveCountryFromICAO('')).toBe('');
    });
  });

  describe('Full OCR Line Extractor (extractAndParseMRZ)', () => {
    it('finds and extracts the two 44-character TD3 lines from messy multi-line OCR scanner output', () => {
      const ocrScanOutput = [
        'PASSPORT / PASSEPORT',
        'REPUBLIC OF UTOPIA',
        'Type/Type P Code UTO Passport No. L898902C3',
        'Surname / Nom ERIKSSON',
        'Given Names / Prenoms ANNA MARIA',
        'P<UTOERIKSSON<<ANNA<MARIA<<<<<<<<<<<<<<<<<<<',
        'L898902C36UTO7408122F1204159ZE184226B<<<<<10',
        'Random footer line',
      ];

      const parsed = extractAndParseMRZ(ocrScanOutput);
      expect(parsed).not.toBeNull();
      expect(parsed?.ok).toBe(true);
      expect(parsed?.surname).toBe('ERIKSSON');
      expect(parsed?.passportNo).toBe('L898902C3');
    });

    it('returns null if fewer than 2 valid MRZ candidate lines exist', () => {
      expect(extractAndParseMRZ(['Hello World', 'No angle brackets here'])).toBeNull();
      expect(extractAndParseMRZ([])).toBeNull();
    });
  });

  describe('Seeded Generator Property Test (200 Valid TD3 MRZs)', () => {
    it('generates and parses 200 valid synthetic TD3 MRZs with ok === true', () => {
      let seed = 98765;
      const rnd = () => {
        seed = (seed * 16807) % 2147483647;
        return (seed - 1) / 2147483646;
      };

      const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
      const digits = '0123456789';

      for (let i = 0; i < 200; i++) {
        // Random surname & given name
        const surname = Array.from({ length: 6 }, () => letters[Math.floor(rnd() * 26)]).join('');
        const given = Array.from({ length: 5 }, () => letters[Math.floor(rnd() * 26)]).join('');
        const l1 = `P<UTO${surname}<<${given}`.padEnd(44, '<');

        // Random 9-char passport number
        const pNum =
          letters[Math.floor(rnd() * 26)] +
          Array.from({ length: 8 }, () => digits[Math.floor(rnd() * 10)]).join('');
        const pCheck = checkDigit(pNum);

        // Random DOB & Expiry
        const dob = Array.from({ length: 6 }, () => digits[Math.floor(rnd() * 10)]).join('');
        const dobCheck = checkDigit(dob);

        const exp = Array.from({ length: 6 }, () => digits[Math.floor(rnd() * 10)]).join('');
        const expCheck = checkDigit(exp);

        const sex = rnd() > 0.5 ? 'M' : 'F';
        const opt = '<<<<<<<<<<<<<<';
        const optCheck = '<';

        const line2Base = `${pNum}${pCheck}UTO${dob}${dobCheck}${sex}${exp}${expCheck}${opt}${optCheck}`;
        const compositeString = line2Base.slice(0, 10) + line2Base.slice(13, 20) + line2Base.slice(21, 43);
        const compCheck = checkDigit(compositeString);

        const l2 = line2Base + compCheck;

        const parsed = parseTD3(l1, l2);
        expect(parsed).not.toBeNull();
        expect(parsed?.ok).toBe(true);
        expect(parsed?.surname).toBe(surname);
        expect(parsed?.givenNames).toBe(given);
      }
    });
  });
});
