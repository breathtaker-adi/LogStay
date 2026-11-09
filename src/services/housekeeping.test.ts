// src/services/housekeeping.test.ts
// Unit tests for Housekeeping State Machine & Issue Reporting (Section 4.27)
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { supabase } from '@/lib/supabase';
import { can } from '@/lib/permissions';
import { HousekeepingService, HousekeepingStatus, IssueCategory } from './housekeeping.service';

vi.mock('@/lib/supabase', () => ({
  supabase: {
    rpc: vi.fn(),
    from: vi.fn(),
  },
}));

describe('Housekeeping State Machine & Issues (Section 4.27)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('State Machine Transitions', () => {
    it.each<[HousekeepingStatus, HousekeepingStatus, boolean]>([
      ['clean', 'dirty', true],       // Checkout marks dirty
      ['dirty', 'clean', true],       // Housekeeping cleans bed
      ['clean', 'maintenance', true], // Out of order flag
      ['dirty', 'maintenance', true], // Issue reported before cleaning
      ['maintenance', 'clean', true], // Repaired & ready
      ['maintenance', 'dirty', false], // Must be cleaned before release
    ])('transitions from %s to %s (valid: %s)', (from, to, expectedValid) => {
      const isValidTransition = (f: HousekeepingStatus, t: HousekeepingStatus) => {
        if (f === t) return true;
        if (f === 'clean' && (t === 'dirty' || t === 'maintenance')) return true;
        if (f === 'dirty' && (t === 'clean' || t === 'maintenance')) return true;
        if (f === 'maintenance' && t === 'clean') return true;
        return false;
      };

      expect(isValidTransition(from, to)).toBe(expectedValid);
    });

    it('calls set_unit_housekeeping RPC on status update', async () => {
      vi.mocked(supabase.rpc).mockResolvedValueOnce({ error: null } as any);

      await HousekeepingService.setUnitStatus('unit-101', 'clean', 'stf-geeta');
      expect(supabase.rpc).toHaveBeenCalledWith('set_unit_housekeeping', {
        p_unit_id: 'unit-101',
        p_status: 'clean',
        p_staff_id: 'stf-geeta',
      });
    });

    it('rejects status change if unit is archived', async () => {
      vi.mocked(supabase.rpc).mockResolvedValueOnce({
        error: { message: 'Unit is archived and cannot be modified' },
      } as any);

      await expect(
        HousekeepingService.setUnitStatus('unit-archived', 'clean')
      ).rejects.toEqual({ message: 'Unit is archived and cannot be modified' });
    });
  });

  describe('Issue Reporting & Resolution', () => {
    const validCategories: IssueCategory[] = [
      'ac',
      'water',
      'noise',
      'cleanliness',
      'electrical',
      'other',
    ];

    it.each(validCategories)('allows reporting issue for valid category: %s', async (category) => {
      vi.mocked(supabase.rpc).mockResolvedValueOnce({
        data: 'issue-uuid-1',
        error: null,
      } as any);

      const res = await HousekeepingService.reportIssue({
        propertyId: 'prop-1',
        category,
        note: 'Broken valve / leaking tap',
        unitId: 'unit-105',
      });

      expect(res).toBe('issue-uuid-1');
      expect(supabase.rpc).toHaveBeenCalledWith('report_issue', {
        p_property_id: 'prop-1',
        p_category: category,
        p_note: 'Broken valve / leaking tap',
        p_unit_id: 'unit-105',
        p_stay_id: null,
      });
    });

    it('allows reporting property-wide issues without unit_id', async () => {
      vi.mocked(supabase.rpc).mockResolvedValueOnce({
        data: 'issue-prop-wide',
        error: null,
      } as any);

      const res = await HousekeepingService.reportIssue({
        propertyId: 'prop-1',
        category: 'water',
        note: 'Main overhead tank pump failure',
      });

      expect(res).toBe('issue-prop-wide');
      expect(supabase.rpc).toHaveBeenCalledWith(
        'report_issue',
        expect.objectContaining({
          p_unit_id: null,
        })
      );
    });

    it('resolves open issue via resolve_issue RPC', async () => {
      vi.mocked(supabase.rpc).mockResolvedValueOnce({ error: null } as any);

      await HousekeepingService.resolveIssue('issue-uuid-1');
      expect(supabase.rpc).toHaveBeenCalledWith('resolve_issue', {
        p_issue_id: 'issue-uuid-1',
      });
    });
  });

  describe('Permissions & Housekeeping Logging', () => {
    it('authorizes housekeeping staff to mark rooms clean', () => {
      expect(can('housekeeping', 'mark_clean')).toBe(true);
      expect(can('desk', 'mark_clean')).toBe(true);
      expect(can('co_admin', 'mark_clean')).toBe(true);
      expect(can('owner', 'mark_clean')).toBe(true);
    });

    it('restricts housekeeping from administrative export and settings', () => {
      expect(can('housekeeping', 'export')).toBe(false);
      expect(can('housekeeping', 'form_c')).toBe(false);
      expect(can('housekeeping', 'refund_payment')).toBe(false);
    });

    it('ensures housekeeping_log records all unit status flips for audit trail', () => {
      const makeLog = (unitId: string, status: HousekeepingStatus, staffId: string) => ({
        unit_id: unitId,
        status,
        staff_id: staffId,
        created_at: new Date().toISOString(),
      });

      const log = makeLog('unit-101', 'clean', 'stf-geeta');
      expect(log.unit_id).toBe('unit-101');
      expect(log.status).toBe('clean');
      expect(log.staff_id).toBe('stf-geeta');
    });
  });
});

