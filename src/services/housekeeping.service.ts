// src/services/housekeeping.service.ts
// Business Logic for Housekeeping Status, Maintenance & Issue Reporting

import { supabase } from '@/lib/supabase';

export type HousekeepingStatus = 'clean' | 'dirty' | 'maintenance';
export type IssueCategory = 'ac' | 'water' | 'noise' | 'cleanliness' | 'electrical' | 'other';

export interface ReportIssueParams {
  propertyId: string;
  category: IssueCategory;
  note: string;
  unitId?: string | null;
  stayId?: string | null;
}

export class HousekeepingService {
  /**
   * Sets the housekeeping status of a room unit/bed (clean, dirty, maintenance).
   */
  static async setUnitStatus(unitId: string, status: HousekeepingStatus, staffId?: string): Promise<void> {
    const { error } = await supabase.rpc('set_unit_housekeeping', {
      p_unit_id: unitId,
      p_status: status,
      p_staff_id: staffId || null,
    });
    if (error) throw error;
  }

  /**
   * Reports an issue (maintenance, defect, cleanliness) against a property unit or stay.
   */
  static async reportIssue(params: ReportIssueParams): Promise<any> {
    const { data, error } = await supabase.rpc('report_issue', {
      p_property_id: params.propertyId,
      p_category: params.category,
      p_note: params.note.trim(),
      p_unit_id: params.unitId || null,
      p_stay_id: params.stayId || null,
    });
    if (error) throw error;
    return data;
  }

  /**
   * Resolves an open issue.
   */
  static async resolveIssue(issueId: string): Promise<void> {
    const { error } = await supabase.rpc('resolve_issue', {
      p_issue_id: issueId,
    });
    if (error) throw error;
  }

  /**
   * Fetches all active open issues for a property.
   */
  static async getOpenIssues(propertyId: string): Promise<any[]> {
    try {
      const { data, error } = await supabase
        .from('issues')
        .select('*')
        .eq('property_id', propertyId)
        .eq('status', 'open')
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data || [];
    } catch (err: any) {
      console.warn('[HousekeepingService.getOpenIssues] error:', err);
      return [];
    }
  }
}
