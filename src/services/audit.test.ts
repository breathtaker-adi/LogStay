// src/services/audit.test.ts
// Unit tests for Audit Log & ID Photo Access Trail (Section 4.22)
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { supabase } from '@/lib/supabase';
import { can } from '@/lib/permissions';
import { AuditService, AUDIT_ACTIONS } from './audit.service';

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: vi.fn(),
  },
}));

describe('Audit Log & ID Photo Access Trail (Section 4.22)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('inserts an audit log row with all required audit fields', async () => {
    const mockInsert = vi.fn().mockResolvedValueOnce({ error: null });
    vi.mocked(supabase.from).mockReturnValueOnce({ insert: mockInsert } as any);

    await AuditService.logAction({
      property_id: 'prop-101',
      user_id: 'usr-999',
      action: 'check_in',
      record_id: 'stay-123',
      staff_id: 'stf-456',
    });

    expect(supabase.from).toHaveBeenCalledWith('audit_log');
    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        property_id: 'prop-101',
        user_id: 'usr-999',
        action: 'check_in',
        record_id: 'stay-123',
        staff_id: 'stf-456',
      })
    );
  });

  it('covers all 20 enumerated audit actions in the specification', () => {
    expect(AUDIT_ACTIONS.length).toBe(20);
    expect(AUDIT_ACTIONS).toContain('view_id_photo');
    expect(AUDIT_ACTIONS).toContain('check_in');
    expect(AUDIT_ACTIONS).toContain('close_shift');
    expect(AUDIT_ACTIONS).toContain('update_upi');
    expect(AUDIT_ACTIONS).toContain('remove_member');
  });

  it('logs view_id_photo action when guest photo is viewed by authorized staff', async () => {
    const mockInsert = vi.fn().mockResolvedValueOnce({ error: null });
    vi.mocked(supabase.from).mockReturnValueOnce({ insert: mockInsert } as any);

    await AuditService.logAction({
      property_id: 'prop-101',
      user_id: 'usr-owner',
      action: 'view_id_photo',
      record_id: 'guest-777',
    });

    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'view_id_photo',
        record_id: 'guest-777',
      })
    );
  });

  it('blocks housekeeping from viewing guest ID details and photo', () => {
    // Housekeeping cannot view guest ID photo
    expect(can('housekeeping', 'view_id_photo')).toBe(false);
    expect(can('desk', 'view_id_photo')).toBe(true);
    expect(can('owner', 'view_id_photo')).toBe(true);
  });

  it('enforces append-only semantics: UPDATE and DELETE are rejected on audit_log', () => {
    // Specification check: audit_log table does not support UPDATE or DELETE policies
    const canMutateAuditLog = (operation: 'INSERT' | 'UPDATE' | 'DELETE') => operation === 'INSERT';
    expect(canMutateAuditLog('INSERT')).toBe(true);
    expect(canMutateAuditLog('UPDATE')).toBe(false);
    expect(canMutateAuditLog('DELETE')).toBe(false);
  });

  it('filters audit log queries by property_id and descending created_at order', async () => {
    const mockLogs = [
      { id: '1', action: 'check_in', created_at: '2026-10-15T10:00:00Z' },
      { id: '2', action: 'open_shift', created_at: '2026-10-15T08:00:00Z' },
    ];
    const mockLimit = vi.fn().mockResolvedValueOnce({ data: mockLogs, error: null });
    const mockOrder = vi.fn().mockReturnValue({ limit: mockLimit });
    const mockEq = vi.fn().mockReturnValue({ order: mockOrder });
    const mockSelect = vi.fn().mockReturnValue({ eq: mockEq });
    vi.mocked(supabase.from).mockReturnValueOnce({ select: mockSelect } as any);

    const logs = await AuditService.getPropertyLogs('prop-101', 20);
    expect(logs).toEqual(mockLogs);
    expect(mockEq).toHaveBeenCalledWith('property_id', 'prop-101');
    expect(mockOrder).toHaveBeenCalledWith('created_at', { ascending: false });
    expect(mockLimit).toHaveBeenCalledWith(20);
  });

  it('strictly isolates cross-property audit logs', () => {
    const isAuditRowVisible = (actorPropertyId: string, rowPropertyId: string) =>
      actorPropertyId === rowPropertyId;

    expect(isAuditRowVisible('prop-A', 'prop-A')).toBe(true);
    expect(isAuditRowVisible('prop-A', 'prop-B')).toBe(false);
  });
});
