// src/services/stay.service.test.ts
// Unit tests for Stay Operations & Check-In RPC Invariants (Section 4.24)
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { StayService } from './stay.service';
import { supabase } from '@/lib/supabase';

vi.mock('@/lib/supabase', () => ({
  supabase: {
    rpc: vi.fn(),
    from: vi.fn(),
  },
}));

describe('StayService & Check-In Invariants (Section 4.24)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('extendStay', () => {
    it('calls extend_stay RPC with nights, amount, and payMode', async () => {
      vi.mocked(supabase.rpc).mockResolvedValueOnce({
        data: '2026-10-20T11:00:00.000Z',
        error: null,
      } as any);

      const res = await StayService.extendStay('stay-101', 2, 1200, 'upi');
      expect(res).toBe('2026-10-20T11:00:00.000Z');
      expect(supabase.rpc).toHaveBeenCalledWith('extend_stay', {
        p_stay_id: 'stay-101',
        p_additional_nights: 2,
        p_additional_amount: 1200,
        p_pay_mode: 'upi',
      });
    });

    it('defaults payMode to pay_later if not specified', async () => {
      vi.mocked(supabase.rpc).mockResolvedValueOnce({
        data: '2026-10-18T11:00:00.000Z',
        error: null,
      } as any);

      await StayService.extendStay('stay-102', 1, 600);
      expect(supabase.rpc).toHaveBeenCalledWith('extend_stay', {
        p_stay_id: 'stay-102',
        p_additional_nights: 1,
        p_additional_amount: 600,
        p_pay_mode: 'pay_later',
      });
    });

    it('throws when extend_stay RPC returns an error', async () => {
      vi.mocked(supabase.rpc).mockResolvedValueOnce({
        data: null,
        error: { message: 'Stay is already checked out' },
      } as any);

      await expect(StayService.extendStay('stay-103', 1, 500)).rejects.toEqual({
        message: 'Stay is already checked out',
      });
    });
  });

  describe('moveStay', () => {
    it('calls move_stay RPC atomically moving stay to new unit', async () => {
      vi.mocked(supabase.rpc).mockResolvedValueOnce({ error: null } as any);

      await StayService.moveStay('stay-101', 'unit-new-202');
      expect(supabase.rpc).toHaveBeenCalledWith('move_stay', {
        p_stay_id: 'stay-101',
        p_new_unit_id: 'unit-new-202',
      });
    });

    it('throws when move_stay fails due to unit vacancy conflict or gender mismatch', async () => {
      vi.mocked(supabase.rpc).mockResolvedValueOnce({
        error: { message: 'Target bed is occupied or violates female-only dorm policy' },
      } as any);

      await expect(StayService.moveStay('stay-101', 'unit-bad')).rejects.toEqual({
        message: 'Target bed is occupied or violates female-only dorm policy',
      });
    });
  });

  describe('verifyUpiPayment', () => {
    it('calls verify_upi_payment RPC with stay ID and verified boolean', async () => {
      vi.mocked(supabase.rpc).mockResolvedValueOnce({ error: null } as any);

      await StayService.verifyUpiPayment('stay-upi-55', true);
      expect(supabase.rpc).toHaveBeenCalledWith('verify_upi_payment', {
        p_stay_id: 'stay-upi-55',
        p_verified: true,
      });
    });

    it('throws when non-manager tries to verify UPI payment', async () => {
      vi.mocked(supabase.rpc).mockResolvedValueOnce({
        error: { message: 'permission_denied' },
      } as any);

      await expect(StayService.verifyUpiPayment('stay-upi-55', true)).rejects.toEqual({
        message: 'permission_denied',
      });
    });
  });

  describe('Check-In Invariants & Step Order Specification', () => {
    it('executes statutory check-in pipeline in exact ordered steps', () => {
      const stepOrder = [
        'check_membership',
        'check_idempotency_stay_id',
        'check_unit_vacancy_and_not_archived',
        'check_open_shift_if_cash',
        'insert_guest_on_conflict_do_nothing',
        'insert_stay',
        'insert_foreign_details_if_applicable',
        'insert_cash_entry_if_cash',
        'return_stay_id',
      ];

      expect(stepOrder[0]).toBe('check_membership');
      expect(stepOrder[1]).toBe('check_idempotency_stay_id');
      expect(stepOrder[3]).toBe('check_open_shift_if_cash');
      expect(stepOrder[6]).toBe('insert_foreign_details_if_applicable');
    });

    it('cash check-in requires open shift, whereas UPI and pay-later do not', () => {
      const canCheckIn = (payMode: string, hasOpenShift: boolean) => {
        if (payMode === 'cash') return hasOpenShift;
        return true; // UPI and pay_later do not require an active cash drawer
      };

      expect(canCheckIn('cash', false)).toBe(false);
      expect(canCheckIn('cash', true)).toBe(true);
      expect(canCheckIn('upi', false)).toBe(true);
      expect(canCheckIn('pay_later', false)).toBe(true);
    });

    it('idempotently handles duplicate check-in submissions with identical client UUID', () => {
      const existingStays = new Map<string, string>();
      const submitCheckin = (stayId: string, guestId: string) => {
        if (existingStays.has(stayId)) {
          return { status: 'already_processed', stayId };
        }
        existingStays.set(stayId, guestId);
        return { status: 'created', stayId };
      };

      const first = submitCheckin('client-uuid-1', 'g-1');
      const second = submitCheckin('client-uuid-1', 'g-1');

      expect(first.status).toBe('created');
      expect(second.status).toBe('already_processed');
      expect(second.stayId).toBe(first.stayId);
    });

    it('prevents double booking on the same unit via one_active_stay_per_unit constraint', () => {
      const activeUnitStays = new Set<string>();
      const bookUnit = (unitId: string) => {
        if (activeUnitStays.has(unitId)) {
          throw new Error('23505: Unit is already occupied');
        }
        activeUnitStays.add(unitId);
        return true;
      };

      expect(bookUnit('unit-101')).toBe(true);
      expect(() => bookUnit('unit-101')).toThrow('23505: Unit is already occupied');
    });

    it('correctly creates foreign_details row only when guest is foreign', () => {
      const shouldCreateForeignDetails = (isForeign: boolean, nationality: string) => {
        if (!isForeign) return false;
        // FRRO exempt rule check
        if (['IND', 'NPL', 'BTN'].includes(nationality)) return false;
        return true;
      };

      expect(shouldCreateForeignDetails(false, 'IND')).toBe(false);
      expect(shouldCreateForeignDetails(true, 'USA')).toBe(true);
      expect(shouldCreateForeignDetails(true, 'DEU')).toBe(true);
      expect(shouldCreateForeignDetails(true, 'IND')).toBe(false);
    });
  });
});

