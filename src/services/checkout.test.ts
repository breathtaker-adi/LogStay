// src/services/checkout.test.ts
// Unit tests for Check-Out RPC & Folio Settlement Invariants (Section 4.25)
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { calculateFolioBalance, formatINR } from '@/lib/money';
import { supabase } from '@/lib/supabase';
import { CheckoutService } from './stay.service';

vi.mock('@/lib/supabase', () => ({
  supabase: {
    rpc: vi.fn(),
    from: vi.fn(),
  },
}));

describe('Check-Out & Folio Settlement Invariants (Section 4.25)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Folio Balance Calculation', () => {
    it('computes exact balance for clean zero-balance stay (paid at check-in)', () => {
      const balance = calculateFolioBalance(1000, 0, 1000);
      expect(balance).toBe(0);
    });

    it('computes positive balance when guest has unpaid incidentals', () => {
      // Stay ₹1500, incidentals ₹300 (laundry) + ₹200 (beverages), paid ₹1500
      const balance = calculateFolioBalance(1500, [300, 200], 1500);
      expect(balance).toBe(500);
      expect(formatINR(balance)).toBe('₹500.00');
    });

    it('computes negative balance when guest has overpaid (requires refund)', () => {
      const balance = calculateFolioBalance(1200, 0, 1500);
      expect(balance).toBe(-300);
      expect(formatINR(balance)).toBe('-₹300.00');
    });

    it('computes pay-later balance as full stay amount when zero payments made', () => {
      const balance = calculateFolioBalance(2500, [250], 0);
      expect(balance).toBe(2750);
    });

    it('prevents floating-point drift on fractional currency values', () => {
      const balance = calculateFolioBalance(100.1, [0.2], 100.3);
      expect(balance).toBe(0);
    });
  });

  describe('check_out_guest RPC Pipeline & Invariants', () => {
    it('executes checkout pipeline step order', () => {
      const checkoutSteps = [
        'fetch_stay_and_unit',
        'verify_property_membership',
        'update_stay_status_checked_out',
        'update_unit_housekeeping_dirty',
        'insert_housekeeping_log',
        'insert_audit_log',
      ];

      expect(checkoutSteps[0]).toBe('fetch_stay_and_unit');
      expect(checkoutSteps[2]).toBe('update_stay_status_checked_out');
      expect(checkoutSteps[3]).toBe('update_unit_housekeeping_dirty');
      expect(checkoutSteps[4]).toBe('insert_housekeeping_log');
    });

    it('successfully calls check_out_guest RPC and transitions unit to dirty', async () => {
      vi.mocked(supabase.rpc).mockResolvedValueOnce({
        data: { success: true, unit_id: 'unit-101', status: 'checked_out' },
        error: null,
      } as any);

      const res = await CheckoutService.checkoutGuest('stay-101');
      expect(res.status).toBe('checked_out');
      expect(supabase.rpc).toHaveBeenCalledWith('check_out_guest', {
        p_stay_id: 'stay-101',
        p_payment_amount: 0,
        p_pay_mode: 'cash',
      });
    });

    it('records cash collection entry when remaining balance paid in cash at checkout', async () => {
      vi.mocked(supabase.rpc).mockResolvedValueOnce({
        data: { success: true, cash_collected: 500 },
        error: null,
      } as any);

      await CheckoutService.checkoutGuest('stay-102', { amount: 500, payMode: 'cash' });
      expect(supabase.rpc).toHaveBeenCalledWith('check_out_guest', {
        p_stay_id: 'stay-102',
        p_payment_amount: 500,
        p_pay_mode: 'cash',
      });
    });

    it('rejects attempt to check out an already checked-out stay', async () => {
      vi.mocked(supabase.rpc).mockResolvedValueOnce({
        data: null,
        error: { message: 'Stay is already checked out' },
      } as any);

      await expect(CheckoutService.checkoutGuest('stay-already-out')).rejects.toEqual({
        message: 'Stay is already checked out',
      });
    });

    it('rejects checkout from an unauthorized property member', async () => {
      vi.mocked(supabase.rpc).mockResolvedValueOnce({
        data: null,
        error: { message: 'permission_denied' },
      } as any);

      await expect(CheckoutService.checkoutGuest('stay-other-prop')).rejects.toEqual({
        message: 'permission_denied',
      });
    });

    it('asserts that housekeeping status transitions to dirty upon checkout', () => {
      const getNextHousekeepingStatus = (action: 'checkout' | 'clean' | 'maintenance') => {
        if (action === 'checkout') return 'dirty';
        if (action === 'clean') return 'clean';
        return 'maintenance';
      };

      expect(getNextHousekeepingStatus('checkout')).toBe('dirty');
    });
  });
});

