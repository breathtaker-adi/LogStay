import { describe, it, expect } from 'vitest';
import {
  validatePhone,
  validateIdLast4,
  validateGuestName,
  validateGender,
  validateAmount,
  validatePropertyName,
  validateDateRange,
} from './validation';

describe('src/lib/validation.ts (Input Validation & Boundary Testing)', () => {
  describe('Phone Validation (7 to 15 digits)', () => {
    it('accepts valid phone numbers with symbols and whitespace', () => {
      expect(validatePhone('+91 98765 43210').valid).toBe(true);
      expect(validatePhone('+44 (7123) 456-789').valid).toBe(true);
      expect(validatePhone('1234567').valid).toBe(true); // Lower boundary (7 digits)
      expect(validatePhone('123456789012345').valid).toBe(true); // Upper boundary (15 digits)
    });

    it('rejects numbers with fewer than 7 digits (lower boundary)', () => {
      expect(validatePhone('123456').valid).toBe(false); // 6 digits
      expect(validatePhone('12345').valid).toBe(false);
      expect(validatePhone('').valid).toBe(false);
      expect(validatePhone(null).valid).toBe(false);
    });

    it('rejects numbers with more than 15 digits (upper boundary)', () => {
      expect(validatePhone('1234567890123456').valid).toBe(false); // 16 digits
    });
  });

  describe('ID Last 4 Validation', () => {
    it('accepts exactly 4 characters', () => {
      expect(validateIdLast4('1234').valid).toBe(true);
      expect(validateIdLast4('987A').valid).toBe(true);
      expect(validateIdLast4(' 4321 ').valid).toBe(true);
    });

    it('rejects inputs with length !== 4', () => {
      expect(validateIdLast4('123').valid).toBe(false); // 3 chars
      expect(validateIdLast4('12345').valid).toBe(false); // 5 chars
      expect(validateIdLast4('').valid).toBe(false);
      expect(validateIdLast4(null).valid).toBe(false);
    });
  });

  describe('Guest Name Validation', () => {
    it('accepts non-empty trimmed names between 2 and 100 characters', () => {
      expect(validateGuestName('Al').valid).toBe(true); // Lower boundary (2 chars)
      expect(validateGuestName('Aditya Sharma').valid).toBe(true);
      expect(validateGuestName('A'.repeat(100)).valid).toBe(true); // Upper boundary (100 chars)
    });

    it('rejects empty, single-character, or oversized names', () => {
      expect(validateGuestName('').valid).toBe(false);
      expect(validateGuestName('   ').valid).toBe(false);
      expect(validateGuestName('A').valid).toBe(false); // 1 char
      expect(validateGuestName('A'.repeat(101)).valid).toBe(false); // 101 chars
      expect(validateGuestName(null).valid).toBe(false);
    });
  });

  describe('Gender Enum Validation', () => {
    it('accepts "male", "female", and "other"', () => {
      expect(validateGender('male').valid).toBe(true);
      expect(validateGender('female').valid).toBe(true);
      expect(validateGender('other').valid).toBe(true);
      expect(validateGender(' MALE ').valid).toBe(true);
    });

    it('rejects unsupported strings or empty inputs', () => {
      expect(validateGender('unknown').valid).toBe(false);
      expect(validateGender('robot').valid).toBe(false);
      expect(validateGender('').valid).toBe(false);
      expect(validateGender(null).valid).toBe(false);
    });
  });

  describe('Amount Validation', () => {
    it('accepts positive numbers within configured range', () => {
      expect(validateAmount(0).valid).toBe(true);
      expect(validateAmount(1000).valid).toBe(true);
      expect(validateAmount('₹1,500.50').valid).toBe(true);
      expect(validateAmount('500').value).toBe(500);
    });

    it('rejects negative amounts, non-numeric strings, NaN, Infinity', () => {
      expect(validateAmount(-1).valid).toBe(false);
      expect(validateAmount('abc').valid).toBe(false);
      expect(validateAmount(NaN).valid).toBe(false);
      expect(validateAmount(Infinity).valid).toBe(false);
      expect(validateAmount('').valid).toBe(false);
      expect(validateAmount(null).valid).toBe(false);
    });

    it('rejects amounts exceeding upper threshold', () => {
      expect(validateAmount(10000001, 0, 10000000).valid).toBe(false);
    });
  });

  describe('Property Name Validation', () => {
    it('accepts names between 3 and 100 characters', () => {
      expect(validatePropertyName('Inn').valid).toBe(true); // 3 chars
      expect(validatePropertyName('Sunset Palms Goa').valid).toBe(true);
      expect(validatePropertyName('P'.repeat(100)).valid).toBe(true);
    });

    it('rejects names with fewer than 3 or more than 100 characters', () => {
      expect(validatePropertyName('Go').valid).toBe(false); // 2 chars
      expect(validatePropertyName('').valid).toBe(false);
      expect(validatePropertyName('P'.repeat(101)).valid).toBe(false);
    });
  });

  describe('Date Range Validation', () => {
    it('accepts valid chronological YYYY-MM-DD date ranges', () => {
      expect(validateDateRange('2026-10-01', '2026-10-15').valid).toBe(true);
      expect(validateDateRange('2026-10-15', '2026-10-15').valid).toBe(true); // Same day
    });

    it('rejects inverted date ranges (start > end)', () => {
      expect(validateDateRange('2026-10-20', '2026-10-10').valid).toBe(false);
    });

    it('rejects malformed date formats', () => {
      expect(validateDateRange('15/10/2026', '20/10/2026').valid).toBe(false);
      expect(validateDateRange('', '2026-10-15').valid).toBe(false);
      expect(validateDateRange(null, null).valid).toBe(false);
    });
  });
});

