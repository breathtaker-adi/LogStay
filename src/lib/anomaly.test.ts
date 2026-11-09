// src/lib/anomaly.test.ts
import { describe, it, expect } from 'vitest';
import {
  median,
  mad,
  robustZScore,
  detectShiftAnomalies,
  ShiftRecord,
} from './anomaly';
import {
  calculateCashExpectation,
  calculateFolioBalance,
  parseAmount,
  formatINR,
  rupeesToPaise,
  paiseToRupees,
} from './money';

describe('Cash Maths & Money Helpers', () => {
  describe('calculateCashExpectation()', () => {
    it('computes expected cash: opening + collections - petty - refunds', () => {
      const result = calculateCashExpectation({
        openingCash: 5000,
        cashCollections: 12000,
        pettyCash: 1500,
        refunds: 500,
      });
      expect(result).toBe(15000);
    });

    it('strictly excludes UPI collections from cash drawer calculations', () => {
      const withUpi = calculateCashExpectation({
        openingCash: 5000,
        cashCollections: 10000,
        pettyCash: 1000,
        refunds: 0,
        upiCollections: 25000, // Should NOT affect cash expectation
      });
      expect(withUpi).toBe(14000);
    });

    it('handles zero values without NaN', () => {
      expect(
        calculateCashExpectation({
          openingCash: 0,
          cashCollections: 0,
          pettyCash: 0,
          refunds: 0,
        })
      ).toBe(0);
    });

    it('handles only opening float present', () => {
      expect(
        calculateCashExpectation({
          openingCash: 2500,
          cashCollections: 0,
          pettyCash: 0,
          refunds: 0,
        })
      ).toBe(2500);
    });

    it('handles refunds larger than collections', () => {
      const result = calculateCashExpectation({
        openingCash: 5000,
        cashCollections: 1000,
        pettyCash: 0,
        refunds: 2000,
      });
      expect(result).toBe(4000);
    });

    it('preserves exact decimal cents (paise arithmetic without floating point drift)', () => {
      // 0.1 + 0.2 floating point check
      const result = calculateCashExpectation({
        openingCash: 100.1,
        cashCollections: 200.2,
        pettyCash: 50.0,
        refunds: 0,
      });
      expect(result).toBe(250.3);
    });
  });

  describe('calculateFolioBalance()', () => {
    it('computes balance with single stay amount, charges and payments', () => {
      expect(calculateFolioBalance(1500, 300, 1000)).toBe(800);
    });

    it('computes balance with array of charges and payments', () => {
      const charges = [250, 150, 100];
      const payments = [500, 500];
      expect(calculateFolioBalance(1000, charges, payments)).toBe(500);
    });

    it('handles complimentary or full settlement', () => {
      expect(calculateFolioBalance(1000, 0, 1000)).toBe(0);
    });

    it('handles overpayment (negative balance)', () => {
      expect(calculateFolioBalance(1000, 0, 1200)).toBe(-200);
    });
  });

  describe('formatINR()', () => {
    it('formats numbers with standard Indian Lakhs/Crores grouping', () => {
      expect(formatINR(1234567.5)).toBe('₹12,34,567.50');
      expect(formatINR(100000)).toBe('₹1,00,000.00');
      expect(formatINR(500)).toBe('₹500.00');
      expect(formatINR(0)).toBe('₹0.00');
    });

    it('formats negative amounts correctly', () => {
      expect(formatINR(-500)).toBe('-₹500.00');
    });

    it('omits currency symbol when option is set', () => {
      expect(formatINR(1500, false)).toBe('1,500.00');
    });
  });

  describe('parseAmount()', () => {
    it.each([
      ['1,200', 1200],
      [' 600 ', 600],
      ['₹600', 600],
      ['6 00', 600],
      ['1000.50', 1000.5],
      [1500, 1500],
    ])('parses %s to %s', (input, expected) => {
      expect(parseAmount(input)).toBe(expected);
    });

    it.each(['', 'abc', '-5', null, undefined])(
      'rejects invalid input %s returning null',
      (input) => {
        expect(parseAmount(input as any)).toBeNull();
      }
    );
  });

  describe('rupeesToPaise & paiseToRupees', () => {
    it('converts exact values without loss', () => {
      expect(rupeesToPaise(12.34)).toBe(1234);
      expect(paiseToRupees(1234)).toBe(12.34);
      expect(rupeesToPaise(0.1 + 0.2)).toBe(30);
    });
  });
});

describe('Statistical Anomaly Engine (Median, MAD, Z-Score)', () => {
  it('computes exact median for odd and even arrays', () => {
    expect(median([1, 5, 2, 8, 7])).toBe(5);
    expect(median([1, 2, 3, 4])).toBe(2.5);
    expect(median([])).toBe(0);
    expect(median([42])).toBe(42);
  });

  it('computes exact Median Absolute Deviation (MAD)', () => {
    // dataset: [1, 2, 3, 4, 5, 6, 7, 8, 9] -> median is 5
    // deviations: [4, 3, 2, 1, 0, 1, 2, 3, 4] -> median is 2
    expect(mad([1, 2, 3, 4, 5, 6, 7, 8, 9])).toBe(2);
    expect(mad([])).toBe(0);
  });

  it('computes robust modified z-score', () => {
    const score = robustZScore(9, 5, 2);
    // 0.6745 * (9 - 5) / 2 = 0.6745 * 2 = 1.349
    expect(score).toBeCloseTo(1.349, 3);
  });

  it('handles identical history where MAD = 0 without divide-by-zero', () => {
    expect(robustZScore(500, 500, 0)).toBe(0);
  });

  it('is resilient against massive single outliers', () => {
    const normalHistory = [100, 120, 110, 105, 115];
    expect(mad(normalHistory)).toBe(5);
    const contaminatedHistory = [100, 120, 110, 105, 115, 1000000]; // huge outlier
    expect(median(contaminatedHistory)).toBe(112.5); // Median shifts slightly, not blown away like mean
    expect(mad(contaminatedHistory)).toBe(7.5); // MAD stays small (7.5) while StdDev would be >300,000
  });
});

describe('detectShiftAnomalies()', () => {
  const baseShift: ShiftRecord = {
    id: 'shift-1',
    staff_name: 'Staff Demo',
    opened_at: '2026-10-15T08:00:00Z',
    closed_at: '2026-10-15T16:00:00Z',
    opening_cash: 5000,
    cash_collected: 10000,
    upi_collected: 5000,
    petty_cash_expenses: 500,
    actual_cash: 14500,
    expected_cash: 14500,
    variance: 0,
    refund_count: 0,
    refund_total: 0,
    checkin_count: 5,
    pay_later_count: 0,
  };

  it('returns no flags for a normal balanced shift', () => {
    const flags = detectShiftAnomalies(baseShift, []);
    expect(flags.length).toBe(0);
  });

  it('flags warning when cash drawer shortage is between ₹200 and ₹1000', () => {
    const shortShift = { ...baseShift, variance: -300 };
    const flags = detectShiftAnomalies(shortShift);
    expect(flags.some((f) => f.id.startsWith('cash_short') && f.severity === 'warning')).toBe(true);
  });

  it('flags critical alert when cash drawer shortage exceeds ₹1000', () => {
    const severeShort = { ...baseShift, variance: -1500 };
    const flags = detectShiftAnomalies(severeShort);
    expect(flags.some((f) => f.id.startsWith('cash_short') && f.severity === 'critical')).toBe(true);
  });

  it('flags cash drawer surplus info when excess > ₹500', () => {
    const overShift = { ...baseShift, variance: 750 };
    const flags = detectShiftAnomalies(overShift);
    expect(flags.some((f) => f.id.startsWith('cash_over') && f.severity === 'info')).toBe(true);
  });

  it('does not trigger statistical petty cash flags if history < 5 shifts', () => {
    const highPetty = { ...baseShift, petty_cash_expenses: 4000 };
    const shortHistory = [baseShift, baseShift];
    const flags = detectShiftAnomalies(highPetty, shortHistory);
    expect(flags.some((f) => f.id.startsWith('petty_spike'))).toBe(false);
  });

  it('triggers statistical petty cash spike warning when history >= 5 shifts', () => {
    const highPetty = { ...baseShift, petty_cash_expenses: 3000 };
    const history = Array(10).fill({ ...baseShift, petty_cash_expenses: 200 });
    const flags = detectShiftAnomalies(highPetty, history);
    expect(flags.some((f) => f.id.startsWith('petty_spike') && f.severity === 'warning')).toBe(true);
  });

  it('detects repeated round-number petty expenses (₹500 multiples)', () => {
    const roundPettyShift = {
      ...baseShift,
      petty_vouchers: [500, 1000, 200],
    };
    const flags = detectShiftAnomalies(roundPettyShift);
    expect(flags.some((f) => f.id.startsWith('petty_round'))).toBe(true);
  });

  it('flags high refund activity when refund count >= 3 or total > ₹2000', () => {
    const refundShift = {
      ...baseShift,
      refund_count: 3,
      refund_total: 2500,
    };
    const flags = detectShiftAnomalies(refundShift);
    expect(flags.some((f) => f.id.startsWith('refund_spike'))).toBe(true);
  });

  it('flags high uncollected pay-later ratio (>= 40% of checkins)', () => {
    const creditShift = {
      ...baseShift,
      checkin_count: 10,
      pay_later_count: 5, // 50%
    };
    const flags = detectShiftAnomalies(creditShift);
    expect(flags.some((f) => f.id.startsWith('pay_later_high'))).toBe(true);
  });

  it('flags late night cash movements (01:00 AM to 05:00 AM)', () => {
    const nightShift = {
      ...baseShift,
      actions_off_hours: 4,
    };
    const flags = detectShiftAnomalies(nightShift);
    expect(flags.some((f) => f.id.startsWith('off_hours'))).toBe(true);
  });

  it('is completely deterministic (same input produces identical flags, without mutating input)', () => {
    const testShift = { ...baseShift, variance: -600, refund_count: 3, refund_total: 2200 };
    const frozen = Object.freeze({ ...testShift });
    const run1 = detectShiftAnomalies(frozen);
    const run2 = detectShiftAnomalies(frozen);
    expect(run1).toEqual(run2);
  });
});
