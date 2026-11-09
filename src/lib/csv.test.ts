import { describe, it, expect } from 'vitest';
import { csvCell } from './csv';
import {
  formatPoliceRegisterCSV,
  formatFormC,
  isFormCEligible,
  filterStaysByDateRange,
  StayExportRecord,
} from './exports';

describe('src/lib/csv.ts & src/lib/exports.ts (Statutory Exports & CSV Injection)', () => {
  describe('OWASP M4 / CSV Injection Defense (csvCell)', () => {
    it('neutralizes formula injection characters (=, +, -, @, tab, CR)', () => {
      expect(csvCell('=SUM(A1:A10)')).toBe('"\'=SUM(A1:A10)"');
      expect(csvCell('+cmd|/c calc')).toBe('"\' +cmd|/c calc"'.replace(' ', '')); // '+cmd|/c calc' -> "'+cmd|/c calc"
      expect(csvCell('-2+3*cmd')).toBe('"\' -2+3*cmd"'.replace(' ', ''));
      expect(csvCell('@IMPORTXML("http://evil.com")')).toBe('"\'@IMPORTXML(""http://evil.com"")"');
      expect(csvCell('\tTAB_PREFIX')).toBe('"\'\tTAB_PREFIX"');
      expect(csvCell('\rCR_PREFIX')).toBe('"\'\rCR_PREFIX"');
    });

    it('preserves international phone numbers with leading "+" without prepending single-quote', () => {
      expect(csvCell('+91 90000 00001', true)).toBe('"+91 90000 00001"');
      expect(csvCell('+44 7123 456789', true)).toBe('"+44 7123 456789"');
      expect(csvCell('+1 (415) 555-2671', true)).toBe('"+1 (415) 555-2671"');
    });

    it('escapes embedded quotes and wraps strings with commas or newlines (RFC 4180)', () => {
      expect(csvCell('Smith, John')).toBe('"Smith, John"');
      expect(csvCell('He said "Hello"')).toBe('"He said ""Hello"""');
      expect(csvCell('Line 1\nLine 2')).toBe('"Line 1\nLine 2"');
    });

    it('safely handles null, undefined, numbers, and booleans', () => {
      expect(csvCell(null)).toBe('""');
      expect(csvCell(undefined)).toBe('""');
      expect(csvCell(123)).toBe('"123"');
      expect(csvCell(0)).toBe('"0"');
      expect(csvCell(false)).toBe('"false"');
    });
  });

  describe('Form C Eligibility Rules', () => {
    it('exempts India, Nepal, and Bhutan from Form C statutory filing', () => {
      expect(isFormCEligible('India')).toBe(false);
      expect(isFormCEligible('india')).toBe(false);
      expect(isFormCEligible('Nepal')).toBe(false);
      expect(isFormCEligible('Bhutan')).toBe(false);
      expect(isFormCEligible(' Bhutan ')).toBe(false);
    });

    it('requires Form C reporting for foreign guests', () => {
      expect(isFormCEligible('United States')).toBe(true);
      expect(isFormCEligible('United Kingdom')).toBe(true);
      expect(isFormCEligible('Germany')).toBe(true);
      expect(isFormCEligible('France')).toBe(true);
      expect(isFormCEligible('Russia')).toBe(true);
      expect(isFormCEligible('Israel')).toBe(true);
      expect(isFormCEligible('Australia')).toBe(true);
      expect(isFormCEligible(null)).toBe(false);
      expect(isFormCEligible('')).toBe(false);
    });
  });

  describe('Police Register CSV Export', () => {
    const sampleStays: StayExportRecord[] = [
      {
        check_in: '2026-10-15T14:30:00+05:30',
        check_out: '2026-10-18T10:00:00+05:30',
        units: { label: 'Room 101' },
        guests: {
          name: 'Aditya Sharma',
          nationality: 'India',
          id_type: 'Aadhaar',
          id_last4: '1234',
          phone: '+91 98765 43210',
        },
      },
      {
        check_in: '2026-10-15T16:00:00+05:30',
        check_out: null, // Still in-house
        units: { label: 'Dorm 201 - Bed 2' },
        guests: {
          name: 'Sarah Connor',
          nationality: 'United States',
          id_type: 'Passport',
          id_last4: '9876',
          phone: '+1 415 555 0199',
        },
      },
    ];

    it('formats police register with sequential serial numbers and correct header columns', () => {
      const csv = formatPoliceRegisterCSV(sampleStays);
      const lines = csv.split('\n');

      expect(lines[0]).toBe(
        '"Serial No","Guest Name","Father/Husband Name","Nationality","ID Type","ID Number (Last 4)","Phone","Date of Arrival","Room/Bed No","Check-Out Date"'
      );
      expect(lines.length).toBe(3);

      expect(lines[1]).toContain('"1"');
      expect(lines[1]).toContain('"Aditya Sharma"');
      expect(lines[1]).toContain('"India"');
      expect(lines[1]).toContain('"****1234"');

      expect(lines[2]).toContain('"2"');
      expect(lines[2]).toContain('"Sarah Connor"');
      expect(lines[2]).toContain('"****9876"');
      expect(lines[2]).toContain('"In House"');
    });

    it('returns only header row when stays array is empty', () => {
      const csv = formatPoliceRegisterCSV([]);
      const lines = csv.split('\n');
      expect(lines.length).toBe(1);
      expect(lines[0]).toContain('"Serial No"');
    });

    it('masks ID numbers and never includes full ID numbers, photo paths, or PINs', () => {
      const csv = formatPoliceRegisterCSV(sampleStays);
      expect(csv).toContain('****1234');
      expect(csv).toContain('****9876');
      expect(csv).not.toContain('pin');
      expect(csv).not.toContain('password');
      expect(csv).not.toContain('.jpg');
      expect(csv).not.toContain('.png');
    });
  });

  describe('Form C Statutory Foreign Guest Export', () => {
    const staysWithMixedNationalities: StayExportRecord[] = [
      {
        check_in: '2026-10-10T12:00:00+05:30',
        check_out: '2026-10-15T10:00:00+05:30',
        guests: { name: 'Rahul Verma', nationality: 'India' },
      },
      {
        check_in: '2026-10-12T10:00:00+05:30',
        check_out: '2026-10-16T11:00:00+05:30',
        guests: { name: 'John Doe', nationality: 'United States' },
        foreign_details: {
          passport_no: 'A12345678',
          visa_type: 'Tourist',
          visa_no: 'V987654',
          arrived_from: 'New York',
          next_dest: 'Mumbai',
        },
        property_address: 'Sunset Beach Road, Anjuna, Goa',
      },
      {
        check_in: '2026-10-14T10:00:00+05:30',
        guests: { name: 'Tenzing Dorji', nationality: 'Bhutan' },
      },
    ];

    it('filters out domestic/exempt guests and exports only foreign nationals', () => {
      const csv = formatFormC(staysWithMixedNationalities);
      const lines = csv.split('\n');

      expect(lines.length).toBe(2); // Header + 1 foreign guest (John Doe)
      expect(lines[0]).toContain('"Sl No","Given Name","Surname","Nationality"');
      expect(lines[1]).toContain('"John"');
      expect(lines[1]).toContain('"Doe"');
      expect(lines[1]).toContain('"United States"');
      expect(lines[1]).toContain('"A12345678"');
      expect(lines[1]).toContain('"V987654"');

      // Exempt guests must NOT appear in Form C
      expect(csv).not.toContain('Rahul Verma');
      expect(csv).not.toContain('Tenzing Dorji');
    });

    it('returns header row only when there are no foreign guests', () => {
      const domesticOnly: StayExportRecord[] = [
        { check_in: '2026-10-10', guests: { name: 'Amit Kumar', nationality: 'India' } },
        { check_in: '2026-10-10', guests: { name: 'Suman Thapa', nationality: 'Nepal' } },
      ];

      const csv = formatFormC(domesticOnly);
      const lines = csv.split('\n');
      expect(lines.length).toBe(1);
      expect(lines[0]).toContain('"Sl No"');
    });
  });

  describe('Date Range Filtering in IST', () => {
    const stays: StayExportRecord[] = [
      { check_in: '2026-10-10T08:00:00+05:30', guests: { name: 'Guest Oct 10' } },
      { check_in: '2026-10-15T00:00:01+05:30', guests: { name: 'Guest Oct 15 Start' } },
      { check_in: '2026-10-15T23:30:00+05:30', guests: { name: 'Guest Oct 15 Late Night' } },
      { check_in: '2026-10-16T00:05:00+05:30', guests: { name: 'Guest Oct 16 Outside' } },
    ];

    it('includes both start and end dates inclusively in IST (e.g. 23:30 IST is included)', () => {
      const filtered = filterStaysByDateRange(stays, '2026-10-15', '2026-10-15');
      expect(filtered.length).toBe(2);
      const g0 = Array.isArray(filtered[0].guests) ? filtered[0].guests[0] : filtered[0].guests;
      const g1 = Array.isArray(filtered[1].guests) ? filtered[1].guests[0] : filtered[1].guests;
      expect(g0?.name).toBe('Guest Oct 15 Start');
      expect(g1?.name).toBe('Guest Oct 15 Late Night');
    });
  });

  describe('Scalability Performance Guard', () => {
    it('formats a large export of 5,000 rows quickly without data loss or stack overflow', () => {
      const largeDataset: StayExportRecord[] = Array.from({ length: 5000 }, (_, i) => ({
        check_in: '2026-10-15T12:00:00+05:30',
        check_out: '2026-10-18T11:00:00+05:30',
        units: { label: `Bed ${i + 1}` },
        guests: {
          name: `Guest ${i + 1}`,
          nationality: i % 2 === 0 ? 'India' : 'United Kingdom',
          id_type: 'Passport',
          id_last4: String(1000 + (i % 9000)),
          phone: `+91 90000 ${String(i).padStart(5, '0')}`,
        },
      }));

      const startTime = Date.now();
      const csv = formatPoliceRegisterCSV(largeDataset);
      const elapsed = Date.now() - startTime;

      const lines = csv.split('\n');
      expect(lines.length).toBe(5001); // 1 header + 5000 data rows
      expect(elapsed).toBeLessThan(1000); // Must format in < 1 second
    });
  });
});
