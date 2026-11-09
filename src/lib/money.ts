// src/lib/money.ts
// Pure money, cash drawer calculations, paise-integer arithmetic and INR formatting

export interface CashExpectationParams {
  openingCash: number;
  cashCollections: number;
  pettyCash: number;
  refunds: number;
  upiCollections?: number; // Explicitly excluded from cash drawer
}

/**
 * Computes exact expected physical cash in drawer.
 * UPI collections are never added to drawer cash.
 */
export function calculateCashExpectation(params: CashExpectationParams): number {
  const opening = Number(params.openingCash) || 0;
  const collections = Number(params.cashCollections) || 0;
  const petty = Number(params.pettyCash) || 0;
  const refunds = Number(params.refunds) || 0;

  // Convert to paise to prevent floating-point drift
  const openingP = Math.round(opening * 100);
  const collectionsP = Math.round(collections * 100);
  const pettyP = Math.round(petty * 100);
  const refundsP = Math.round(refunds * 100);

  const totalPaise = openingP + collectionsP - pettyP - refundsP;
  return totalPaise / 100;
}

/**
 * Computes guest folio balance.
 * Balance = stay amount + incidentals/charges - total payments
 */
export function calculateFolioBalance(
  stayAmount: number,
  charges: number[] | number = 0,
  payments: number[] | number = 0
): number {
  const stayP = Math.round((Number(stayAmount) || 0) * 100);
  
  const chargesArr = Array.isArray(charges) ? charges : [charges];
  const chargesP = chargesArr.reduce((sum, c) => sum + Math.round((Number(c) || 0) * 100), 0);

  const paymentsArr = Array.isArray(payments) ? payments : [payments];
  const paymentsP = paymentsArr.reduce((sum, p) => sum + Math.round((Number(p) || 0) * 100), 0);

  return (stayP + chargesP - paymentsP) / 100;
}

/**
 * Parses user numeric input string safely into a valid number or null.
 * Handles commas, rupee signs, spaces, etc.
 */
export function parseAmount(input: string | number | null | undefined): number | null {
  if (input === null || input === undefined) return null;
  if (typeof input === 'number') {
    return isNaN(input) || input < 0 ? null : input;
  }

  const clean = input
    .trim()
    .replace(/[₹,\s]/g, '');

  if (!clean || clean.length === 0) return null;
  const num = parseFloat(clean);
  if (isNaN(num) || num < 0) return null;
  return num;
}

/**
 * Formats a number to Indian currency standard (Lakhs/Crores grouping).
 */
export function formatINR(amount: number | null | undefined, includeSymbol = true): string {
  const num = Number(amount) || 0;
  const prefix = includeSymbol ? '₹' : '';
  const isNegative = num < 0;
  const absNum = Math.abs(num);

  const fixed = absNum.toFixed(2);
  const [whole, decimal] = fixed.split('.');

  // Indian number grouping: last 3 digits, then groups of 2
  let lastThree = whole.substring(whole.length - 3);
  const otherNumbers = whole.substring(0, whole.length - 3);
  if (otherNumbers !== '') {
    lastThree = ',' + lastThree;
  }
  const formattedWhole = otherNumbers.replace(/\B(?=(\d{2})+(?!\d))/g, ',') + lastThree;

  return `${isNegative ? '-' : ''}${prefix}${formattedWhole}.${decimal}`;
}

/**
 * Precise conversion between Rupees and Paise integer representation
 */
export function rupeesToPaise(rupees: number): number {
  return Math.round((Number(rupees) || 0) * 100);
}

export function paiseToRupees(paise: number): number {
  return (Math.round(Number(paise) || 0)) / 100;
}

