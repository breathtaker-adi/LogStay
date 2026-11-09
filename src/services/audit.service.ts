// src/services/audit.service.ts
// Comprehensive Audit Trail & Statutory Inspection Logging

import { supabase } from '@/lib/supabase';
import { formatFriendlyError } from '@/lib/error-utils';

export const AUDIT_ACTIONS = [
  'check_in',
  'check_out',
  'open_shift',
  'close_shift',
  'add_petty',
  'add_charge',
  'report_issue',
  'resolve_issue',
  'set_maintenance',
  'remove_member',
  'generate_invite',
  'redeem_invite',
  'update_upi',
  'save_concierge',
  'review_concierge',
  'submit_photo',
  'review_photo',
  'view_id_photo',
  'archive_room',
  'add_room',
] as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[number];

export interface AuditEntry {
  id?: string;
  property_id: string;
  user_id: string;
  action: AuditAction;
  record_id?: string | null;
  staff_id?: string | null;
  created_at?: string;
}

export class AuditService {
  /**
   * Logs a high-integrity operational action into the permanent audit ledger.
   */
  static async logAction(entry: AuditEntry): Promise<void> {
    try {
      const { error } = await supabase.from('audit_log').insert({
        property_id: entry.property_id,
        user_id: entry.user_id,
        action: entry.action,
        record_id: entry.record_id || null,
        staff_id: entry.staff_id || null,
        created_at: entry.created_at || new Date().toISOString(),
      });
      if (error) throw error;
    } catch (err: any) {
      console.warn('Audit log write error:', err);
    }
  }

  /**
   * Fetches property audit logs ordered chronologically for owner review.
   */
  static async getPropertyLogs(propertyId: string, limit = 50): Promise<any[]> {
    try {
      const { data, error } = await supabase
        .from('audit_log')
        .select('*')
        .eq('property_id', propertyId)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) throw error;
      return data || [];
    } catch (err: any) {
      throw new Error(formatFriendlyError(err, 'Failed to fetch audit log trail.'));
    }
  }

  /**
   * Logs an access event for sensitive guest ID photos (DPDP Act Statutory compliance).
   */
  static async logIdPhotoAccess(propertyId: string, userId: string, guestId: string): Promise<void> {
    await this.logAction({
      property_id: propertyId,
      user_id: userId,
      action: 'view_id_photo',
      record_id: guestId,
    });
  }
}

