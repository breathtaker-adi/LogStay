// src/lib/validation.ts
// Standardized input validation utilities for guest registration, cash, and settings

export interface ValidationResult<T = any> {
  valid: boolean;
  error?: string;
  value?: T;
}

/**
 * Validates international and domestic mobile numbers:
 * Must have between 7 and 15 digits after removing formatting characters.
 */
export function validatePhone(phone?: string | null): ValidationResult<string> {
  if (!phone || typeof phone !== 'string') {
    return { valid: false, error: 'Phone number is required' };
  }
  const cleanDigits = phone.replace(/\D/g, '');
  if (cleanDigits.length < 7) {
    return { valid: false, error: 'Phone number must have at least 7 digits', value: cleanDigits };
  }
  if (cleanDigits.length > 15) {
    return { valid: false, error: 'Phone number cannot exceed 15 digits', value: cleanDigits };
  }
  return { valid: true, value: cleanDigits };
}

/**
 * Validates last 4 digits of statutory ID document.
 */
export function validateIdLast4(idLast4?: string | null): ValidationResult<string> {
  if (!idLast4 || typeof idLast4 !== 'string') {
    return { valid: false, error: 'ID last 4 digits are required' };
  }
  const trimmed = idLast4.trim();
  if (trimmed.length !== 4) {
    return { valid: false, error: 'ID last 4 must be exactly 4 characters', value: trimmed };
  }
  return { valid: true, value: trimmed };
}

/**
 * Validates non-empty trimmed guest name.
 */
export function validateGuestName(name?: string | null): ValidationResult<string> {
  if (!name || typeof name !== 'string') {
    return { valid: false, error: 'Full name is required' };
  }
  const trimmed = name.trim();
  if (trimmed.length < 2) {
    return { valid: false, error: 'Full name must be at least 2 characters', value: trimmed };
  }
  if (trimmed.length > 100) {
    return { valid: false, error: 'Full name cannot exceed 100 characters', value: trimmed };
  }
  return { valid: true, value: trimmed };
}

/**
 * Validates gender enum.
 */
export function validateGender(gender?: string | null): ValidationResult<'male' | 'female' | 'other'> {
  if (!gender || typeof gender !== 'string') {
    return { valid: false, error: 'Gender is required' };
  }
  const clean = gender.trim().toLowerCase();
  if (clean !== 'male' && clean !== 'female' && clean !== 'other') {
    return { valid: false, error: 'Gender must be male, female, or other' };
  }
  return { valid: true, value: clean as 'male' | 'female' | 'other' };
}

/**
 * Validates monetary amounts (positive, finite, within configured limits).
 */
export function validateAmount(
  amount: unknown,
  min: number = 0,
  max: number = 10000000
): ValidationResult<number> {
  if (amount === null || amount === undefined || amount === '') {
    return { valid: false, error: 'Amount is required' };
  }

  let num: number;
  if (typeof amount === 'number') {
    num = amount;
  } else if (typeof amount === 'string') {
    const cleaned = amount.replace(/[₹,\s]/g, '');
    num = parseFloat(cleaned);
  } else {
    return { valid: false, error: 'Invalid amount format' };
  }

  if (isNaN(num) || !isFinite(num)) {
    return { valid: false, error: 'Amount must be a valid number' };
  }
  if (num < min) {
    return { valid: false, error: `Amount cannot be less than ₹${min}`, value: num };
  }
  if (num > max) {
    return { valid: false, error: `Amount cannot exceed ₹${max}`, value: num };
  }

  return { valid: true, value: num };
}

/**
 * Validates property name length (3 to 100 characters).
 */
export function validatePropertyName(name?: string | null): ValidationResult<string> {
  if (!name || typeof name !== 'string') {
    return { valid: false, error: 'Property name is required' };
  }
  const trimmed = name.trim();
  if (trimmed.length < 3) {
    return { valid: false, error: 'Property name must be at least 3 characters', value: trimmed };
  }
  if (trimmed.length > 100) {
    return { valid: false, error: 'Property name cannot exceed 100 characters', value: trimmed };
  }
  return { valid: true, value: trimmed };
}

/**
 * Validates date range (YYYY-MM-DD format, startDate <= endDate).
 */
export function validateDateRange(
  startDate?: string | null,
  endDate?: string | null
): ValidationResult<{ start: string; end: string }> {
  if (!startDate || !endDate) {
    return { valid: false, error: 'Both start and end dates are required' };
  }
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRegex.test(startDate) || !dateRegex.test(endDate)) {
    return { valid: false, error: 'Dates must be in YYYY-MM-DD format' };
  }
  if (startDate > endDate) {
    return { valid: false, error: 'Start date cannot be after end date' };
  }
  return { valid: true, value: { start: startDate, end: endDate } };
}

/**
 * 28 States + 8 Union Territories of India (36 statutory jurisdictions)
 */
export const INDIAN_STATES_AND_UTS: readonly string[] = [
  'Andhra Pradesh',
  'Arunachal Pradesh',
  'Assam',
  'Bihar',
  'Chhattisgarh',
  'Goa',
  'Gujarat',
  'Haryana',
  'Himachal Pradesh',
  'Jharkhand',
  'Karnataka',
  'Kerala',
  'Madhya Pradesh',
  'Maharashtra',
  'Manipur',
  'Meghalaya',
  'Mizoram',
  'Nagaland',
  'Odisha',
  'Punjab',
  'Rajasthan',
  'Sikkim',
  'Tamil Nadu',
  'Telangana',
  'Tripura',
  'Uttar Pradesh',
  'Uttarakhand',
  'West Bengal',
  // 8 Union Territories
  'Andaman and Nicobar Islands',
  'Chandigarh',
  'Dadra and Nagar Haveli and Daman and Diu',
  'Delhi',
  'Jammu and Kashmir',
  'Ladakh',
  'Lakshadweep',
  'Puducherry',
] as const;

/**
 * Validates Indian State / UT for police and tax compliance.
 */
export function validateIndianState(state?: string | null): ValidationResult<string> {
  if (!state || typeof state !== 'string') {
    return { valid: false, error: 'State / Union Territory is required' };
  }
  const trimmed = state.trim();
  const matched = INDIAN_STATES_AND_UTS.find(
    (s) => s.toLowerCase() === trimmed.toLowerCase()
  );
  if (!matched) {
    return { valid: false, error: `'${trimmed}' is not a recognised Indian State or UT`, value: trimmed };
  }
  return { valid: true, value: matched };
}


