// src/lib/formc.ts
// Bureau of Immigration (BoI) Form C Compliance Helpers

/**
 * Nationalities exempt from BoI Form C submission under Indian statutory rules.
 * India (domestic), Nepal and Bhutan (bilateral freedom of movement treaties).
 */
export const EXEMPT_NATIONALITIES = ['india', 'indian', 'ind', 'nepal', 'npl', 'bhutan', 'btn'] as const;

/**
 * Determines whether a guest's nationality requires statutory BoI Form C filing.
 */
export function isFormCEligible(nationality?: string | null): boolean {
  if (!nationality || typeof nationality !== 'string') return false;
  const clean = nationality.toLowerCase().trim();
  if (!clean) return false;

  const isExempt = EXEMPT_NATIONALITIES.some(
    (ex) => clean === ex || clean.startsWith('india')
  );

  return !isExempt;
}

export interface FormCRecord {
  stay_id: string;
  guest_name: string;
  nationality: string;
  passport_no: string;
  visa_no?: string | null;
  visa_type?: string | null;
  arrived_from?: string | null;
  next_destination?: string | null;
  form_c_filed: boolean;
  check_in: string;
}

/**
 * Validates mandatory fields required for online BoI Form C submission.
 */
export function validateFormCFields(record: Partial<FormCRecord>): { valid: boolean; missing: string[] } {
  const missing: string[] = [];
  if (!record.guest_name?.trim()) missing.push('Guest Name');
  if (!record.nationality?.trim()) missing.push('Nationality');
  if (!record.passport_no?.trim()) missing.push('Passport Number');
  if (!record.visa_no?.trim()) missing.push('Visa Number');
  if (!record.arrived_from?.trim()) missing.push('Arrived From');
  if (!record.next_destination?.trim()) missing.push('Next Destination');

  return {
    valid: missing.length === 0,
    missing,
  };
}

