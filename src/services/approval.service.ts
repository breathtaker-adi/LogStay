// src/services/approval.service.ts
// Business Logic for Managerial Approvals (Refunds, Discounts, Write-Offs, Price Overrides)

import { supabase } from '@/lib/supabase';

export type ApprovalKind = 'refund' | 'discount' | 'write_off' | 'price_override';
export type ApprovalStatus = 'pending' | 'approved' | 'declined';

export interface ApprovalRequest {
  id: string;
  property_id: string;
  stay_id?: string | null;
  kind: ApprovalKind;
  amount: number;
  reason: string;
  status: ApprovalStatus;
  requested_by: string;
  requested_by_name: string;
  decided_by?: string | null;
  decided_by_name?: string | null;
  decided_at?: string | null;
  decision_note?: string | null;
  created_at: string;
}

export class ApprovalService {
  /**
   * Submits an approval request for manager review
   */
  static async requestApproval(
    propertyId: string,
    stayId: string | null,
    kind: ApprovalKind,
    amount: number,
    reason: string
  ): Promise<string> {
    const { data, error } = await supabase.rpc('request_approval', {
      p_prop_id: propertyId,
      p_stay_id: stayId,
      p_kind: kind,
      p_amount: amount,
      p_reason: reason.trim(),
    });

    if (error) throw error;
    if (!data) throw new Error('No request ID returned from server');
    return data;
  }

  /**
   * Approves or declines an approval request (Owner/Co-Admin only)
   */
  static async decideApproval(
    requestId: string,
    approve: boolean,
    note?: string
  ): Promise<void> {
    const { error } = await supabase.rpc('decide_approval', {
      p_request_id: requestId,
      p_approve: approve,
      p_note: note?.trim() || null,
    });

    if (error) throw error;
  }

  /**
   * Fetches pending approval requests for a property
   */
  static async getPendingApprovals(propertyId: string): Promise<ApprovalRequest[]> {
    try {
      const { data, error } = await supabase
        .from('approval_requests')
        .select('*')
        .eq('property_id', propertyId)
        .eq('status', 'pending')
        .order('created_at', { ascending: false });

      if (error) throw error;
      return (data as ApprovalRequest[]) || [];
    } catch (err) {
      console.warn('[ApprovalService.getPendingApprovals] error:', err);
      return [];
    }
  }

  /**
   * Fetches all approval requests history for a property
   */
  static async getAllApprovals(propertyId: string): Promise<ApprovalRequest[]> {
    try {
      const { data, error } = await supabase
        .from('approval_requests')
        .select('*')
        .eq('property_id', propertyId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return (data as ApprovalRequest[]) || [];
    } catch (err) {
      console.warn('[ApprovalService.getAllApprovals] error:', err);
      return [];
    }
  }
}

