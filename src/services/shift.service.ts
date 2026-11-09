// src/services/shift.service.ts
// Business Logic for Cash Shifts, Two-Person Handover, and Petty Cash

import { supabase } from '@/lib/supabase';

export interface ShiftRecord {
  id: string;
  property_id: string;
  opened_by: string;
  opened_at: string;
  opening_cash: number;
  closing_cash?: number | null;
  closed_by?: string | null;
  closed_at?: string | null;
  handover_by?: string | null;
  handover_name?: string | null;
  handover_cash?: number | null;
  handover_at?: string | null;
  handover_variance?: number | null;
  status: 'open' | 'pending_handover' | 'closed';
}

export class ShiftService {
  /**
   * Fetches the current active open shift
   */
  static async getActiveShift(propertyId: string): Promise<ShiftRecord | null> {
    try {
      const { data, error } = await supabase
        .from('shifts')
        .select('*')
        .eq('property_id', propertyId)
        .eq('status', 'open')
        .order('opened_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw error;
      return data as ShiftRecord | null;
    } catch (err) {
      console.warn('[ShiftService.getActiveShift] error:', err);
      return null;
    }
  }

  /**
   * Fetches any shift currently waiting for handover acceptance
   */
  static async getPendingHandoverShift(propertyId: string): Promise<ShiftRecord | null> {
    try {
      const { data, error } = await supabase
        .from('shifts')
        .select('*')
        .eq('property_id', propertyId)
        .eq('status', 'pending_handover')
        .order('closed_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw error;
      return data as ShiftRecord | null;
    } catch (err) {
      console.warn('[ShiftService.getPendingHandoverShift] error:', err);
      return null;
    }
  }

  /**
   * Opens a new cash drawer shift
   */
  static async openShift(propertyId: string, openingCash: number): Promise<string> {
    const shiftId = crypto.randomUUID();
    const { error } = await supabase.rpc('open_shift', {
      p_shift_id: shiftId,
      p_opening_cash: openingCash,
    });

    if (error) throw error;
    return shiftId;
  }

  /**
   * Step 1: Outgoing staff submits blind count closing drawer
   */
  static async submitShiftHandover(shiftId: string, closingCash: number): Promise<void> {
    const { error } = await supabase.rpc('submit_shift_handover', {
      p_shift_id: shiftId,
      p_closing_cash: closingCash,
    });

    if (error) throw error;
  }

  /**
   * Step 2: Incoming staff counts drawer blind and accepts handover, automatically opening new shift
   */
  static async acceptShiftHandover(shiftId: string, handoverCash: number): Promise<string> {
    const newShiftId = crypto.randomUUID();
    const { data, error } = await supabase.rpc('accept_shift_handover', {
      p_shift_id: shiftId,
      p_handover_cash: handoverCash,
      p_new_shift_id: newShiftId,
    });

    if (error) throw error;
    return (data as string) || newShiftId;
  }

  /**
   * Direct close shift (solo operator / owner override fallback)
   */
  static async closeShift(shiftId: string, countedCash: number): Promise<void> {
    const { error } = await supabase.rpc('close_shift', {
      p_shift_id: shiftId,
      p_counted_cash: countedCash,
    });

    if (error) throw error;
  }
}

