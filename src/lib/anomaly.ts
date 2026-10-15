/**
 * Offline Cash & Operational Anomaly Detection Engine.
 *
 * Implements robust statistical anomaly detection using Median and
 * Median Absolute Deviation (MAD) — resilient against skew and historical outliers —
 * combined with deterministic business rules for small hotel/hostel operations.
 */

export interface ShiftRecord {
  id: string;
  staff_name: string;
  opened_at: string;
  closed_at: string | null;
  opening_cash: number;
  cash_collected: number;
  upi_collected: number;
  petty_cash_expenses: number;
  actual_cash: number | null;
  expected_cash: number;
  variance: number;
  refund_count: number;
  refund_total: number;
  checkin_count: number;
  pay_later_count: number;
  petty_vouchers?: number[];
  actions_off_hours?: number; // 01:00 to 05:00
}

export interface AnomalyFlag {
  id: string;
  severity: 'critical' | 'warning' | 'info';
  category: 'cash_drawer' | 'petty_cash' | 'refund' | 'credit' | 'audit';
  title: string;
  description: string;
  recommendation: string;
}

/**
 * Calculates the statistical median of a numeric array.
 */
export function median(arr: number[]): number {
  if (!arr || arr.length === 0) return 0;
  const s = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 !== 0 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/**
 * Calculates Median Absolute Deviation (MAD), the robust analog of standard deviation.
 * MAD = median(|x_i - median(X)|)
 */
export function mad(arr: number[], med?: number): number {
  if (!arr || arr.length === 0) return 0;
  const m = med !== undefined ? med : median(arr);
  const deviations = arr.map(x => Math.abs(x - m));
  return median(deviations);
}

/**
 * Computes robust modified z-score: 0.6745 * (x - median) / MAD
 * (0.6745 is the consistency factor for normal distributions)
 */
export function robustZScore(x: number, m: number, mDev: number): number {
  if (mDev === 0) return 0;
  return (0.6745 * (x - m)) / mDev;
}

/**
 * Evaluates a single shift against the property's historical shifts (typically last 15-30 shifts).
 * Produces structured, plain-English flags for property owners.
 */
export function detectShiftAnomalies(
  current: ShiftRecord,
  history: ShiftRecord[] = []
): AnomalyFlag[] {
  const flags: AnomalyFlag[] = [];

  // --- 1. CASH DRAWER DISCREPANCY ---
  const variance = current.variance ?? (current.actual_cash !== null ? current.actual_cash - current.expected_cash : 0);

  if (variance < -200) {
    flags.push({
      id: `cash_short_${current.id}`,
      severity: variance < -1000 ? 'critical' : 'warning',
      category: 'cash_drawer',
      title: 'Cash Drawer Shortage',
      description: `Counted cash at close was ₹${Math.abs(variance).toFixed(0)} lower than expected in drawer.`,
      recommendation: 'Check cash vouchers and verify manual cash collections with front desk staff.'
    });
  } else if (variance > 500) {
    flags.push({
      id: `cash_over_${current.id}`,
      severity: 'info',
      category: 'cash_drawer',
      title: 'Cash Drawer Surplus',
      description: `Counted cash had an excess of ₹${variance.toFixed(0)} above recorded receipts.`,
      recommendation: 'Ensure all guest cash check-ins were registered in the app.'
    });
  }

  // --- 2. PETTY CASH OUTFLOWS (Robust Z-Score vs History) ---
  if (history.length >= 5) {
    const historicalPetty = history.map(s => s.petty_cash_expenses || 0);
    const medPetty = median(historicalPetty);
    const madPetty = mad(historicalPetty, medPetty);

    // If MAD is very small, use fallback baseline (₹200)
    const effectiveMad = Math.max(madPetty, 150);
    const zPetty = robustZScore(current.petty_cash_expenses, medPetty, effectiveMad);

    if (zPetty >= 3.0 && current.petty_cash_expenses > 500) {
      flags.push({
        id: `petty_spike_${current.id}`,
        severity: 'warning',
        category: 'petty_cash',
        title: 'Unusual Petty Cash Outflow',
        description: `Petty expenses of ₹${current.petty_cash_expenses.toFixed(0)} are significantly above the typical shift median of ₹${medPetty.toFixed(0)}.`,
        recommendation: 'Verify physical expense receipts/bills attached to this shift drawer.'
      });
    }
  }

  // --- 3. REPETITIVE ROUND PETTY EXPENSES ---
  if (current.petty_vouchers && current.petty_vouchers.length >= 2) {
    const roundAmounts = current.petty_vouchers.filter(v => v >= 500 && v % 500 === 0);
    if (roundAmounts.length >= 2) {
      flags.push({
        id: `petty_round_${current.id}`,
        severity: 'info',
        category: 'petty_cash',
        title: 'Frequent Round Petty Vouchers',
        description: `${roundAmounts.length} expense vouchers with exact round amounts (₹${roundAmounts.join(', ₹')}) recorded.`,
        recommendation: 'Ensure vendor bills accompany rounded expense withdrawals.'
      });
    }
  }

  // --- 4. HIGH REFUNDS ANOMALY ---
  if (current.refund_count >= 3 || current.refund_total > 2000) {
    flags.push({
      id: `refund_spike_${current.id}`,
      severity: current.refund_total > 4000 ? 'critical' : 'warning',
      category: 'refund',
      title: 'High Refund Activity',
      description: `${current.refund_count} refunds issued totaling ₹${current.refund_total.toFixed(0)}.`,
      recommendation: 'Review guest checkout notes to confirm reasons for deposit returns or stay cancellations.'
    });
  }

  // --- 5. HIGH PAY-LATER / CREDIT RATIO ---
  if (current.checkin_count >= 3) {
    const payLaterRatio = current.pay_later_count / current.checkin_count;
    if (payLaterRatio >= 0.4) {
      flags.push({
        id: `pay_later_high_${current.id}`,
        severity: 'warning',
        category: 'credit',
        title: 'High Uncollected Balances (Pay Later)',
        description: `${(payLaterRatio * 100).toFixed(0)}% of check-ins (${current.pay_later_count}/${current.checkin_count}) were admitted without collecting room tariff.`,
        recommendation: 'Enforce advance payment policy at arrival to avoid unpaid guest checkouts.'
      });
    }
  }

  // --- 6. OFF-HOURS CASH ACTIVITY ---
  if (current.actions_off_hours && current.actions_off_hours >= 3) {
    flags.push({
      id: `off_hours_${current.id}`,
      severity: 'info',
      category: 'audit',
      title: 'Late Night Cash Movements',
      description: `${current.actions_off_hours} cash ledger actions recorded between 01:00 AM and 05:00 AM.`,
      recommendation: 'Confirm whether late-night arrivals or night-shift handovers took place.'
    });
  }

  return flags;
}
