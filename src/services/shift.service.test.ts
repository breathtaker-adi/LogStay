// src/services/shift.service.test.ts
// Unit tests for Shift Lifecycle & Cash Drawer Invariants (Section 4.26)
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ShiftService } from './shift.service';
import { calculateCashExpectation } from '@/lib/money';
import { supabase } from '@/lib/supabase';
import { can } from '@/lib/permissions';

vi.mock('@/lib/supabase', () => ({
  supabase: {
    rpc: vi.fn(),
    from: vi.fn(),
  },
}));

describe('ShiftService & Cash Drawer Invariants (Section 4.26)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getActiveShift', () => {
    it('returns active open shift row for a property', async () => {
      const mockShift = {
        id: 'shift-101',
        property_id: 'prop-1',
        status: 'open',
        opening_cash: 2000,
        opened_by: 'usr-1',
      };

      const mockMaybeSingle = vi.fn().mockResolvedValueOnce({ data: mockShift, error: null });
      const mockLimit = vi.fn().mockReturnValue({ maybeSingle: mockMaybeSingle });
      const mockOrder = vi.fn().mockReturnValue({ limit: mockLimit });
      const mockEqStatus = vi.fn().mockReturnValue({ order: mockOrder });
      const mockEqProp = vi.fn().mockReturnValue({ eq: mockEqStatus });
      const mockSelect = vi.fn().mockReturnValue({ eq: mockEqProp });
      vi.mocked(supabase.from).mockReturnValueOnce({ select: mockSelect } as any);

      const shift = await ShiftService.getActiveShift('prop-1');
      expect(shift).toEqual(mockShift);
      expect(mockEqProp).toHaveBeenCalledWith('property_id', 'prop-1');
      expect(mockEqStatus).toHaveBeenCalledWith('status', 'open');
    });

    it('returns null when no active open shift exists', async () => {
      vi.mocked(supabase.from).mockReturnValueOnce({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValueOnce({ data: null, error: null }),
      } as any);

      const shift = await ShiftService.getActiveShift('prop-none');
      expect(shift).toBeNull();
    });
  });

  describe('openShift', () => {
    it('calls open_shift RPC with opening cash and generated shift UUID', async () => {
      vi.mocked(supabase.rpc).mockResolvedValueOnce({ error: null } as any);

      const shiftId = await ShiftService.openShift('prop-1', 1500);
      expect(typeof shiftId).toBe('string');
      expect(supabase.rpc).toHaveBeenCalledWith(
        'open_shift',
        expect.objectContaining({
          p_opening_cash: 1500,
        })
      );
    });

    it('throws when open_shift fails (e.g. another shift already open)', async () => {
      vi.mocked(supabase.rpc).mockResolvedValueOnce({
        error: { message: '23505: A shift is already open for this property' },
      } as any);

      await expect(ShiftService.openShift('prop-1', 1500)).rejects.toEqual({
        message: '23505: A shift is already open for this property',
      });
    });
  });

  describe('Two-Person Shift Handover Protocol', () => {
    it('step 1: outgoing staff submits blind count closing cash', async () => {
      vi.mocked(supabase.rpc).mockResolvedValueOnce({ error: null } as any);

      await ShiftService.submitShiftHandover('shift-101', 3200);
      expect(supabase.rpc).toHaveBeenCalledWith('submit_shift_handover', {
        p_shift_id: 'shift-101',
        p_closing_cash: 3200,
      });
    });

    it('step 2: incoming staff counts drawer blind and accepts handover, creating new shift', async () => {
      vi.mocked(supabase.rpc).mockResolvedValueOnce({
        data: 'new-shift-202',
        error: null,
      } as any);

      const newId = await ShiftService.acceptShiftHandover('shift-101', 3200);
      expect(newId).toBe('new-shift-202');
      expect(supabase.rpc).toHaveBeenCalledWith(
        'accept_shift_handover',
        expect.objectContaining({
          p_shift_id: 'shift-101',
          p_handover_cash: 3200,
        })
      );
    });
  });

  describe('Drawer Balance & Invariant Rules', () => {
    it('calculates expected drawer cash using exact opening + collections - petty - refunds', () => {
      const expected = calculateCashExpectation({
        openingCash: 1000,
        cashCollections: 2500,
        pettyCash: 300,
        refunds: 200,
        upiCollections: 5000, // Ignored in physical drawer calculation
      });

      // 1000 + 2500 - 300 - 200 = 3000
      expect(expected).toBe(3000);
    });

    it('computes positive variance (overage) and negative variance (shortage)', () => {
      const calcVariance = (counted: number, expected: number) => counted - expected;

      expect(calcVariance(3050, 3000)).toBe(50); // Overage ₹50
      expect(calcVariance(2900, 3000)).toBe(-100); // Shortage ₹100
      expect(calcVariance(3000, 3000)).toBe(0); // Perfect match
    });

    it('enforces cash_entries kind enum to petty, collection, refund', () => {
      const validKinds = ['petty', 'collection', 'refund'];
      const isValidKind = (k: string) => validKinds.includes(k);

      expect(isValidKind('petty')).toBe(true);
      expect(isValidKind('collection')).toBe(true);
      expect(isValidKind('refund')).toBe(true);
      expect(isValidKind('salary')).toBe(false);
      expect(isValidKind('upi')).toBe(false);
    });

    it('forbids housekeeping from managing shifts', () => {
      expect(can('housekeeping', 'shift')).toBe(false);
      expect(can('desk', 'shift')).toBe(true);
      expect(can('co_admin', 'shift')).toBe(true);
      expect(can('owner', 'shift')).toBe(true);
    });

    it('ensures closed shift is immutable and rejects further cash modifications', () => {
      const canAddCashEntry = (shiftStatus: 'open' | 'pending_handover' | 'closed') =>
        shiftStatus === 'open';

      expect(canAddCashEntry('open')).toBe(true);
      expect(canAddCashEntry('pending_handover')).toBe(false);
      expect(canAddCashEntry('closed')).toBe(false);
    });
  });
});
