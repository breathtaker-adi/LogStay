// src/lib/performance-guards.test.ts
// Unit tests for Performance, Throughput & Scale Guards (Section 4.38)
import { describe, it, expect } from 'vitest';
import { parseTD3 } from './mrz';
import { detectShiftAnomalies, ShiftRecord } from './anomaly';
import { formatPoliceRegisterCSV, StayExportRecord } from './exports';
import { groupByFloor } from './floors';

describe('Performance & Scale Guards (Section 4.38)', () => {
  it('parses 1,000 ICAO MRZ specimens in under 250ms', () => {
    const l1 = 'P<UTOERIKSSON<<ANNA<MARIA<<<<<<<<<<<<<<<<<<<';
    const l2 = 'L898902C36UTO7408122F1204159ZE184226B<<<<<10';

    const start = performance.now();
    for (let i = 0; i < 1000; i++) {
      const res = parseTD3(l1, l2);
      expect(res).not.toBeNull();
    }
    const duration = performance.now() - start;

    expect(duration).toBeLessThan(250);
  });

  it('runs cash anomaly detection on 365 days of shift history in under 50ms', () => {
    const history: ShiftRecord[] = [];
    const baseDate = new Date('2026-01-01T00:00:00Z');

    for (let i = 0; i < 365; i++) {
      const d = new Date(baseDate.getTime() + i * 86400000).toISOString();
      history.push({
        id: `shift-${i}`,
        staff_name: 'Staff Member',
        opened_at: d,
        closed_at: d,
        opening_cash: 2000,
        cash_collected: 4000,
        upi_collected: 2000,
        petty_cash_expenses: 200 + (i % 50),
        actual_cash: 5800,
        expected_cash: 5800,
        variance: (i % 7 === 0) ? -50 : 0,
        refund_count: (i % 10 === 0) ? 1 : 0,
        refund_total: (i % 10 === 0) ? 500 : 0,
        checkin_count: 5,
        pay_later_count: 0,
      });
    }

    const currentShift: ShiftRecord = {
      id: 'current-shift',
      staff_name: 'Current Staff',
      opened_at: new Date().toISOString(),
      closed_at: new Date().toISOString(),
      opening_cash: 2000,
      cash_collected: 5000,
      upi_collected: 3000,
      petty_cash_expenses: 300,
      actual_cash: 6700,
      expected_cash: 6700,
      variance: 0,
      refund_count: 0,
      refund_total: 0,
      checkin_count: 6,
      pay_later_count: 0,
    };

    const start = performance.now();
    const anomalies = detectShiftAnomalies(currentShift, history);
    const duration = performance.now() - start;

    expect(duration).toBeLessThan(50);
    expect(Array.isArray(anomalies)).toBe(true);
  });

  it('formats large 5,000-row police register CSV in under 1,500ms without memory exhaustion', () => {
    const records: StayExportRecord[] = [];
    for (let i = 0; i < 5000; i++) {
      records.push({
        check_in: '2026-10-15T10:00:00Z',
        check_out: '2026-10-16T11:00:00Z',
        guests: {
          name: `Guest Number ${i}`,
          phone: `+91 90000 ${String(i).padStart(5, '0')}`,
          nationality: 'India',
          id_type: 'Aadhaar',
          id_last4: '1234',
        },
        units: {
          label: `Bed ${(i % 50) + 1}`,
        },
      });
    }

    const start = performance.now();
    const csv = formatPoliceRegisterCSV(records);
    const duration = performance.now() - start;

    expect(duration).toBeLessThan(1500);
    // 5000 data rows + 1 header row = 5001 lines
    const lineCount = csv.trim().split('\n').length;
    expect(lineCount).toBe(5001);
  });

  it('sorts and categorizes 1,000 rooms across 10 floors in under 50ms', () => {
    const rooms = [];
    for (let i = 0; i < 1000; i++) {
      const floorNo = (i % 10) - 1; // -1 (Basement) to 8
      rooms.push({
        id: `rm-${i}`,
        label: `Room ${100 * (floorNo + 1) + (i % 20)}`,
        floor_no: floorNo,
      });
    }

    const start = performance.now();
    const groups = groupByFloor(rooms as any);
    const duration = performance.now() - start;

    expect(duration).toBeLessThan(50);
    expect(groups.length).toBe(10);
    // First group should be basement (-1)
    expect(groups[0].floor).toBe(-1);
  });
});
