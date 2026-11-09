// src/lib/timezones.test.ts
// Unit tests for Time, Timezone & DPDP Retention (Section 4.36)
import { describe, it, expect } from 'vitest';
import { parseTD3, formatMRZDate } from './mrz';
import { PHOTO_RETENTION_DAYS, calculatePhotoExpiry } from './purge-photos';

/**
 * Formats a UTC timestamp into IST date string (YYYY-MM-DD)
 */
export function formatToISTDate(utcIsoString: string): string {
  const date = new Date(utcIsoString);
  // IST is UTC + 5:30 (330 minutes)
  const istOffsetMs = 330 * 60 * 1000;
  const istDate = new Date(date.getTime() + istOffsetMs);
  return istDate.toISOString().slice(0, 10);
}

describe('Time, Timezone & DPDP Retention (Section 4.36)', () => {
  describe('IST Day Boundaries for Reports & Shifts', () => {
    it('accurately resolves late night 23:30 IST check-in to Oct 15 (even though UTC is 18:00)', () => {
      // 23:30:00 IST is 18:00:00 UTC on the same day
      const checkinUtc = '2026-10-15T18:00:00.000Z';
      const istDay = formatToISTDate(checkinUtc);
      expect(istDay).toBe('2026-10-15');
    });

    it('accurately resolves early morning 01:00 IST check-in to Oct 16 (even though UTC was 19:30 on Oct 15)', () => {
      // 01:00:00 IST on Oct 16 is 19:30:00 UTC on Oct 15
      const earlyMorningUtc = '2026-10-15T19:30:00.000Z';
      const istDay = formatToISTDate(earlyMorningUtc);
      expect(istDay).toBe('2026-10-16');
    });

    it('formats shift close time in Indian Standard Time regardless of local clock', () => {
      const shiftClosedAt = '2026-10-15T14:30:00.000Z'; // 20:00 IST (8:00 PM)
      const date = new Date(shiftClosedAt);
      const istTime = date.toLocaleTimeString('en-IN', {
        timeZone: 'Asia/Kolkata',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
      });

      // 14:30 UTC + 5:30 = 20:00 = 8:00 pm
      expect(istTime.toLowerCase()).toContain('8:00');
    });
  });

  describe('DPDP Act 2023 Statutory Retention', () => {
    it('defines photo retention period (180 days statutory declaration)', () => {
      expect(PHOTO_RETENTION_DAYS).toBe(180);
    });

    it('calculates photo expiry date by adding retention days to check-in', () => {
      const checkIn = new Date('2026-01-01T00:00:00.000Z');
      const expiry = calculatePhotoExpiry(checkIn, 180);
      const diffDays = Math.round((expiry.getTime() - checkIn.getTime()) / (24 * 60 * 60 * 1000));
      expect(diffDays).toBe(180);
    });
  });

  describe('MRZ Century Rule Determinism', () => {
    it('resolves birth century (yy > current yy -> 19yy, yy <= current yy -> 20yy)', () => {
      // Using ICAO 9303 TD3 standard specimen
      const specimen = {
        line1: 'P<UTOERIKSSON<<ANNA<MARIA<<<<<<<<<<<<<<<<<<<',
        line2: 'L898902C36UTO7408122F1204159ZE184226B<<<<<10',
      };

      const parsed = parseTD3(specimen.line1, specimen.line2);
      expect(parsed).not.toBeNull();
      // '740812' -> 1974-08-12
      expect(parsed?.dobFormatted).toBe('1974-08-12');
      // '120415' -> 2012-04-15
      expect(parsed?.expiryFormatted).toBe('2012-04-15');
    });

    it('formats 6-digit MRZ date with explicit century assignment', () => {
      expect(formatMRZDate('740812', false)).toBe('1974-08-12');
      expect(formatMRZDate('120415', true)).toBe('2012-04-15');
      expect(formatMRZDate('050607', false)).toBe('2005-06-07');
    });
  });
});
