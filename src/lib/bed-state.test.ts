import { describe, it, expect } from 'vitest';
import {
  bedState,
  aggregateDormStatus,
  shouldShowFloorFirst,
  isGenderAllowed,
  calculateStayNights,
  calculateDigestMetrics,
  BED_COLOR,
} from './bed-state';

describe('src/lib/bed-state.ts (Bed Priority Hierarchy, Dorm Aggregates & Hospitality KPIs)', () => {
  describe('bedState Priority Hierarchy', () => {
    it('maintenance always overrides active stay (occupied), dirty, and clean', () => {
      const activeStays = new Set(['unit_1']);

      // Unit is marked maintenance AND has an active stay
      const state = bedState({ id: 'unit_1', housekeeping_status: 'maintenance' }, activeStays);
      expect(state).toBe('maintenance');

      // Unit is marked maintenance and dirty
      const stateDirty = bedState({ id: 'unit_2', housekeeping_status: 'maintenance' }, new Set());
      expect(stateDirty).toBe('maintenance');
    });

    it('active stay (occupied) overrides dirty and clean', () => {
      const activeStays = new Set(['unit_1']);

      // Unit is in active stays AND marked dirty
      const state = bedState({ id: 'unit_1', housekeeping_status: 'dirty' }, activeStays);
      expect(state).toBe('occupied');

      // Unit is in active stays AND clean
      const stateClean = bedState({ id: 'unit_1', housekeeping_status: 'clean' }, activeStays);
      expect(stateClean).toBe('occupied');
    });

    it('dirty overrides clean when there is no active stay', () => {
      const emptyStays = new Set<string>();
      const state = bedState({ id: 'unit_1', housekeeping_status: 'dirty' }, emptyStays);
      expect(state).toBe('dirty');
    });

    it('clean is the default state when not in maintenance, occupied, or dirty', () => {
      const emptyStays = new Set<string>();
      expect(bedState({ id: 'unit_1', housekeeping_status: 'clean' }, emptyStays)).toBe('clean');
      expect(bedState({ id: 'unit_1', housekeeping_status: null }, emptyStays)).toBe('clean');
      expect(bedState({ id: 'unit_1', housekeeping_status: undefined }, emptyStays)).toBe('clean');
    });
  });

  describe('Dorm Tile Aggregates', () => {
    it('aggregates when all beds are occupied (Full)', () => {
      const agg = aggregateDormStatus(['occupied', 'occupied', 'occupied', 'occupied']);
      expect(agg.status).toBe('full');
      expect(agg.freeCount).toBe(0);
      expect(agg.totalCount).toBe(4);
      expect(agg.badgeColor).toBe(BED_COLOR.occupied);
      expect(agg.badgeText).toBe('Full');
    });

    it('aggregates when all beds are clean (All Free)', () => {
      const agg = aggregateDormStatus(['clean', 'clean', 'clean', 'clean']);
      expect(agg.status).toBe('all_free');
      expect(agg.freeCount).toBe(4);
      expect(agg.badgeColor).toBe(BED_COLOR.clean);
      expect(agg.badgeText).toBe('All Free');
    });

    it('aggregates when some beds are occupied and some are free', () => {
      const agg = aggregateDormStatus(['clean', 'occupied', 'clean', 'dirty']);
      expect(agg.status).toBe('some_free');
      expect(agg.freeCount).toBe(2);
      expect(agg.totalCount).toBe(4);
      expect(agg.badgeText).toBe('2 available');
      expect(agg.badgeColor).toBe(BED_COLOR.clean);
    });

    it('aggregates when no beds are clean and dirty beds remain', () => {
      const agg = aggregateDormStatus(['occupied', 'occupied', 'dirty', 'maintenance']);
      expect(agg.status).toBe('dirty');
      expect(agg.freeCount).toBe(0);
      expect(agg.badgeText).toBe('1 Dirty');
    });

    it('handles empty dorm (0 beds)', () => {
      const agg = aggregateDormStatus([]);
      expect(agg.totalCount).toBe(0);
      expect(agg.freeCount).toBe(0);
      expect(agg.badgeText).toBe('0 Beds');
    });
  });

  describe('Progressive Bed Selection Threshold (20 Beds Boundary)', () => {
    it('presents beds directly when inventory is 20 or fewer', () => {
      expect(shouldShowFloorFirst(1)).toBe(false);
      expect(shouldShowFloorFirst(10)).toBe(false);
      expect(shouldShowFloorFirst(19)).toBe(false);
      expect(shouldShowFloorFirst(20)).toBe(false); // Exact boundary
    });

    it('presents floors first when inventory exceeds 20 beds', () => {
      expect(shouldShowFloorFirst(21)).toBe(true);  // Exact boundary
      expect(shouldShowFloorFirst(50)).toBe(true);
      expect(shouldShowFloorFirst(200)).toBe(true);
    });
  });

  describe('Dorm Gender Rules', () => {
    it('female-only dorm strictly allows female and rejects male', () => {
      expect(isGenderAllowed('female', 'female')).toBe(true);
      expect(isGenderAllowed('female-only', 'female')).toBe(true);
      expect(isGenderAllowed('female', 'male')).toBe(false);
      expect(isGenderAllowed('female-only', 'male')).toBe(false);
    });

    it('male-only dorm allows male and rejects female', () => {
      expect(isGenderAllowed('male', 'male')).toBe(true);
      expect(isGenderAllowed('male-only', 'male')).toBe(true);
      expect(isGenderAllowed('male', 'female')).toBe(false);
    });

    it('mixed dorm allows any gender', () => {
      expect(isGenderAllowed('mixed', 'male')).toBe(true);
      expect(isGenderAllowed('mixed', 'female')).toBe(true);
      expect(isGenderAllowed('mixed', 'other')).toBe(true);
      expect(isGenderAllowed(null, 'male')).toBe(true);
    });
  });

  describe('Billable Nights Calculation across IST Day Boundaries', () => {
    it('calculates minimum 1 night for same-day check-in/check-out', () => {
      expect(calculateStayNights('2026-10-15T14:00:00+05:30', '2026-10-15T18:00:00+05:30')).toBe(1);
    });

    it('calculates 1 night when checking in late (23:00) and checking out next morning (11:00)', () => {
      expect(calculateStayNights('2026-10-15T23:00:00+05:30', '2026-10-16T11:00:00+05:30')).toBe(1);
    });

    it('calculates 1 night when checking in past midnight (02:00) and checking out noon', () => {
      expect(calculateStayNights('2026-10-15T02:00:00+05:30', '2026-10-15T12:00:00+05:30')).toBe(1);
    });

    it('calculates 3 nights across date boundaries', () => {
      expect(calculateStayNights('2026-10-15', '2026-10-18')).toBe(3);
    });
  });

  describe('Hospitality Daily Digest Metrics (Occupancy %, ADR, RevPAR)', () => {
    it('calculates metrics accurately on standard day, deducting maintenance from available units', () => {
      // 20 total beds, 2 in maintenance = 18 available beds
      // 9 occupied beds = 50% occupancy
      // ₹9,000 revenue -> ADR = ₹1,000, RevPAR = ₹500
      const metrics = calculateDigestMetrics({
        totalUnits: 20,
        maintenanceUnits: 2,
        occupiedUnits: 9,
        totalRoomRevenue: 9000,
      });

      expect(metrics.availableUnits).toBe(18);
      expect(metrics.occupancyRate).toBe(50);
      expect(metrics.adr).toBe(1000);
      expect(metrics.revpar).toBe(500);
    });

    it('safely handles zero available rooms (all in maintenance) without NaN or divide-by-zero', () => {
      const metrics = calculateDigestMetrics({
        totalUnits: 5,
        maintenanceUnits: 5,
        occupiedUnits: 0,
        totalRoomRevenue: 0,
      });

      expect(metrics.availableUnits).toBe(0);
      expect(metrics.occupancyRate).toBe(0);
      expect(metrics.adr).toBe(0);
      expect(metrics.revpar).toBe(0);
    });

    it('safely handles zero sold rooms (0% occupancy)', () => {
      const metrics = calculateDigestMetrics({
        totalUnits: 10,
        maintenanceUnits: 0,
        occupiedUnits: 0,
        totalRoomRevenue: 0,
      });

      expect(metrics.availableUnits).toBe(10);
      expect(metrics.occupancyRate).toBe(0);
      expect(metrics.adr).toBe(0);
      expect(metrics.revpar).toBe(0);
    });
  });
});

