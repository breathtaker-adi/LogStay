// src/services/stay.service.ts
// Business Logic for Stay Operations: Extensions, Bed Moves, Due Out / Overdue Tracking, and UPI Reconciliation

import { supabase } from '@/lib/supabase';

export interface StayExtensionResult {
  new_expected_checkout: string;
}

export interface StayOperationRecord {
  id: string;
  property_id: string;
  guest_id: string;
  unit_id: string;
  status: 'checked_in' | 'checked_out';
  amount: number;
  pay_mode: string;
  nights?: number;
  expected_checkout?: string | null;
  check_in: string;
  check_out?: string | null;
  upi_verified?: boolean;
  upi_verified_at?: string | null;
  guest?: {
    name: string;
    phone: string;
  };
  unit?: {
    name: string;
    floor_id?: string | null;
  };
}

export class StayService {
  /**
   * Extends an active stay by N nights, updating checkout timestamp and charges
   */
  static async extendStay(
    stayId: string,
    additionalNights: number,
    additionalAmount: number,
    payMode: 'cash' | 'upi' | 'pay_later' = 'pay_later'
  ): Promise<string> {
    const { data, error } = await supabase.rpc('extend_stay', {
      p_stay_id: stayId,
      p_additional_nights: additionalNights,
      p_additional_amount: additionalAmount,
      p_pay_mode: payMode,
    });

    if (error) throw error;
    return data as string;
  }

  /**
   * Atomically moves a guest stay to a new bed/room
   */
  static async moveStay(stayId: string, newUnitId: string): Promise<void> {
    const { error } = await supabase.rpc('move_stay', {
      p_stay_id: stayId,
      p_new_unit_id: newUnitId,
    });

    if (error) throw error;
  }

  /**
   * Checks out a stay and settles any outstanding folio closing payment
   */
  static async checkoutGuest(
    stayId: string,
    closingPayment?: { amount: number; payMode: 'cash' | 'upi' }
  ): Promise<any> {
    const { data, error } = await supabase.rpc('check_out_guest', {
      p_stay_id: stayId,
      p_payment_amount: closingPayment?.amount || 0,
      p_pay_mode: closingPayment?.payMode || 'cash',
    });
    if (error) throw error;
    return data;
  }

  /**
   * Marks a UPI payment as reconciled/verified against bank statement (Owner/Co-Admin only)
   */
  static async verifyUpiPayment(stayId: string, verified: boolean): Promise<void> {
    const { error } = await supabase.rpc('verify_upi_payment', {
      p_stay_id: stayId,
      p_verified: verified,
    });

    if (error) throw error;
  }

  /**
   * Fetches stays that are due out today or overdue
   */
  static async getDueAndOverdueStays(propertyId: string): Promise<{
    dueOut: StayOperationRecord[];
    overdue: StayOperationRecord[];
  }> {
    try {
      const now = new Date();
      const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
      const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999).toISOString();

      const { data, error } = await supabase
        .from('stays')
        .select(`
          id, property_id, guest_id, unit_id, status, amount, pay_mode, nights, expected_checkout, check_in, check_out, upi_verified,
          guests(name, phone),
          units(name, floor_id)
        `)
        .eq('property_id', propertyId)
        .eq('status', 'checked_in')
        .order('expected_checkout', { ascending: true });

      if (error) throw error;

      const stays = (data || []).map((s: any) => ({
        ...s,
        guest: s.guests,
        unit: s.units,
      })) as StayOperationRecord[];

      const nowIso = now.toISOString();

      const dueOut: StayOperationRecord[] = [];
      const overdue: StayOperationRecord[] = [];

      for (const stay of stays) {
        if (!stay.expected_checkout) continue;
        if (stay.expected_checkout < nowIso) {
          overdue.push(stay);
        } else if (stay.expected_checkout >= startOfDay && stay.expected_checkout <= endOfDay) {
          dueOut.push(stay);
        }
      }

      return { dueOut, overdue };
    } catch (err) {
      console.warn('[StayService.getDueAndOverdueStays] error:', err);
      return { dueOut: [], overdue: [] };
    }
  }

  /**
   * Fetches recent stays with UPI payment for reconciliation
   */
  static async getUpiStaysForReconciliation(propertyId: string): Promise<StayOperationRecord[]> {
    try {
      const { data, error } = await supabase
        .from('stays')
        .select(`
          id, property_id, guest_id, unit_id, status, amount, pay_mode, nights, expected_checkout, check_in, check_out, upi_verified, upi_verified_at,
          guests(name, phone),
          units(name, floor_id)
        `)
        .eq('property_id', propertyId)
        .eq('pay_mode', 'upi')
        .order('check_in', { ascending: false })
        .limit(50);

      if (error) throw error;

      return (data || []).map((s: any) => ({
        ...s,
        guest: s.guests,
        unit: s.units,
      })) as StayOperationRecord[];
    } catch (err) {
      console.warn('[StayService.getUpiStaysForReconciliation] error:', err);
      return [];
    }
  }
}

export const CheckoutService = StayService;
