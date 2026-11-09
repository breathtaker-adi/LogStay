// src/lib/exports.ts
// Compliance Exports: Police Register & Form C (Bureau of Immigration)
// Handles sanitization, privacy masking, RFC 4180 CSV compliance, and date filtering.

import { csvCell } from './csv';

export const FORM_C_EXEMPT_NATIONALITIES = ['India', 'Nepal', 'Bhutan'] as const;

/**
 * Checks if a guest's nationality requires Form C reporting to the Foreigners Regional
 * Registration Office (FRRO). Indian, Nepalese, and Bhutanese nationals are exempt.
 */
export function isFormCEligible(nationality?: string | null): boolean {
  if (!nationality) return false;
  const clean = nationality.trim().toLowerCase();
  return !FORM_C_EXEMPT_NATIONALITIES.some((exempt) => exempt.toLowerCase() === clean);
}

export interface StayExportRecord {
  check_in: string;
  check_out?: string | null;
  unit_id?: string | null;
  units?: { label?: string } | { label?: string }[] | null;
  guests?:
    | {
        name?: string;
        nationality?: string;
        id_type?: string;
        id_last4?: string;
        phone?: string;
      }
    | {
        name?: string;
        nationality?: string;
        id_type?: string;
        id_last4?: string;
        phone?: string;
      }[]
    | null;
  foreign_details?:
    | {
        passport_no?: string;
        visa_type?: string;
        visa_no?: string;
        arrived_from?: string;
        next_dest?: string;
      }
    | {
        passport_no?: string;
        visa_type?: string;
        visa_no?: string;
        arrived_from?: string;
        next_dest?: string;
      }[]
    | null;
  property_address?: string;
  passport_no?: string;
  visa_type?: string;
  visa_no?: string;
  arrived_from?: string;
  next_dest?: string;
}

/**
 * Formats stays into standard Indian State Police Register CSV.
 * - Always masks ID to last 4 digits (e.g. ****1234)
 * - Excludes photo URLs, raw tokens, passwords, PINs
 * - RFC 4180 compliant with formula injection protection
 */
export function formatPoliceRegisterCSV(stays: StayExportRecord[]): string {
  const headers = [
    'Serial No',
    'Guest Name',
    'Father/Husband Name',
    'Nationality',
    'ID Type',
    'ID Number (Last 4)',
    'Phone',
    'Date of Arrival',
    'Room/Bed No',
    'Check-Out Date',
  ];

  const headerRow = headers.map((h) => csvCell(h)).join(',');

  if (!stays || stays.length === 0) {
    return headerRow;
  }

  const rows = stays.map((s, index) => {
    const guest = Array.isArray(s.guests) ? s.guests[0] : s.guests;
    const unitLabel = Array.isArray(s.units) ? s.units[0]?.label : (s.units?.label || s.unit_id || '');
    const maskedId = guest?.id_last4 ? `****${guest.id_last4}` : '****';
    const checkInDate = s.check_in ? new Date(s.check_in).toLocaleDateString('en-IN') : '';
    const checkOutDate = s.check_out ? new Date(s.check_out).toLocaleDateString('en-IN') : 'In House';

    return [
      csvCell(index + 1),
      csvCell(guest?.name || ''),
      csvCell(''), // Father/Husband Name placeholder
      csvCell(guest?.nationality || ''),
      csvCell(guest?.id_type || ''),
      csvCell(maskedId),
      csvCell(guest?.phone || '', true),
      csvCell(checkInDate),
      csvCell(unitLabel),
      csvCell(checkOutDate),
    ].join(',');
  });

  return [headerRow, ...rows].join('\n');
}

/**
 * Formats foreign guest stays into standard Form C CSV for Bureau of Immigration / FRRO.
 * Filters out exempt domestic nationalities (India, Nepal, Bhutan).
 */
export function formatFormC(stays: StayExportRecord[]): string {
  const headers = [
    'Sl No',
    'Given Name',
    'Surname',
    'Nationality',
    'Passport No',
    'Visa Type',
    'Visa No',
    'Date of Arrival',
    'Duration of Stay (Days)',
    'Address in India',
    'Purpose of Visit',
    'Port of Embarkation',
    'Port of Disembarkation',
  ];

  const headerRow = headers.map((h) => csvCell(h)).join(',');

  // Filter only foreign guests eligible for Form C
  const foreignStays = (stays || []).filter((s) => {
    const guest = Array.isArray(s.guests) ? s.guests[0] : s.guests;
    return isFormCEligible(guest?.nationality);
  });

  if (foreignStays.length === 0) {
    return headerRow;
  }

  const rows = foreignStays.map((s, index) => {
    const checkIn = new Date(s.check_in);
    const today = new Date();
    const endDate = s.check_out ? new Date(s.check_out) : today;
    const duration = Math.max(1, Math.ceil((endDate.getTime() - checkIn.getTime()) / (1000 * 60 * 60 * 24)));

    const guest = Array.isArray(s.guests) ? s.guests[0] : s.guests;
    const foreignDetails = Array.isArray(s.foreign_details) ? s.foreign_details[0] : s.foreign_details;

    const nameParts = (guest?.name || '').trim().split(/\s+/);
    const givenName = nameParts[0] || '';
    const surname = nameParts.slice(1).join(' ') || '-';

    return [
      csvCell(index + 1),
      csvCell(givenName),
      csvCell(surname),
      csvCell(guest?.nationality || ''),
      csvCell(foreignDetails?.passport_no || s.passport_no || ''),
      csvCell(foreignDetails?.visa_type || s.visa_type || ''),
      csvCell(foreignDetails?.visa_no || s.visa_no || ''),
      csvCell(checkIn.toLocaleDateString('en-IN')),
      csvCell(duration),
      csvCell(s.property_address || ''),
      csvCell('Tourism'),
      csvCell(foreignDetails?.arrived_from || s.arrived_from || ''),
      csvCell(foreignDetails?.next_dest || s.next_dest || ''),
    ].join(',');
  });

  return [headerRow, ...rows].join('\n');
}

/**
 * Filters stay records strictly within date range in IST (inclusive of start 00:00:00 and end 23:59:59).
 */
export function filterStaysByDateRange(
  stays: StayExportRecord[],
  startDate: string,
  endDate: string
): StayExportRecord[] {
  const startTs = new Date(`${startDate}T00:00:00+05:30`).getTime();
  const endTs = new Date(`${endDate}T23:59:59+05:30`).getTime();

  return stays.filter((s) => {
    const t = new Date(s.check_in).getTime();
    return t >= startTs && t <= endTs;
  });
}
