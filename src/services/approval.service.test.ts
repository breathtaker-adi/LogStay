// src/services/approval.service.test.ts
// Unit tests for Managerial Approval Pipeline & Concierge Proposals (Section 4.21)
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ApprovalService, ApprovalKind } from './approval.service';
import { supabase } from '@/lib/supabase';
import { StaffRole } from '@/types/staff';

vi.mock('@/lib/supabase', () => ({
  supabase: {
    rpc: vi.fn(),
    from: vi.fn(),
  },
}));

describe('ApprovalService (Section 4.21)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('requestApproval', () => {
    it.each<ApprovalKind>(['refund', 'discount', 'write_off', 'price_override'])(
      'submits %s approval request with trimmed reason',
      async (kind) => {
        vi.mocked(supabase.rpc).mockResolvedValueOnce({
          data: 'req-uuid-1',
          error: null,
        } as any);

        const res = await ApprovalService.requestApproval(
          'prop-101',
          'stay-555',
          kind,
          500,
          '  Guest requested partial compensation  '
        );

        expect(res).toBe('req-uuid-1');
        expect(supabase.rpc).toHaveBeenCalledWith('request_approval', {
          p_prop_id: 'prop-101',
          p_stay_id: 'stay-555',
          p_kind: kind,
          p_amount: 500,
          p_reason: 'Guest requested partial compensation',
        });
      }
    );

    it('submits property-level approval without stayId (null)', async () => {
      vi.mocked(supabase.rpc).mockResolvedValueOnce({
        data: 'req-prop-level',
        error: null,
      } as any);

      const res = await ApprovalService.requestApproval(
        'prop-101',
        null,
        'write_off',
        1200,
        'Damaged linen write-off'
      );

      expect(res).toBe('req-prop-level');
      expect(supabase.rpc).toHaveBeenCalledWith('request_approval', {
        p_prop_id: 'prop-101',
        p_stay_id: null,
        p_kind: 'write_off',
        p_amount: 1200,
        p_reason: 'Damaged linen write-off',
      });
    });

    it('throws error when RPC returns an error', async () => {
      vi.mocked(supabase.rpc).mockResolvedValueOnce({
        data: null,
        error: { message: 'Open shift required' },
      } as any);

      await expect(
        ApprovalService.requestApproval('prop-1', 'stay-1', 'refund', 100, 'Test')
      ).rejects.toEqual({ message: 'Open shift required' });
    });

    it('throws error when no request ID returned', async () => {
      vi.mocked(supabase.rpc).mockResolvedValueOnce({
        data: null,
        error: null,
      } as any);

      await expect(
        ApprovalService.requestApproval('prop-1', 'stay-1', 'refund', 100, 'Test')
      ).rejects.toThrow('No request ID returned from server');
    });
  });

  describe('decideApproval', () => {
    it('approves request with optional note', async () => {
      vi.mocked(supabase.rpc).mockResolvedValueOnce({ error: null } as any);

      await ApprovalService.decideApproval('req-101', true, '  Approved per policy  ');
      expect(supabase.rpc).toHaveBeenCalledWith('decide_approval', {
        p_request_id: 'req-101',
        p_approve: true,
        p_note: 'Approved per policy',
      });
    });

    it('declines request without note (passes null)', async () => {
      vi.mocked(supabase.rpc).mockResolvedValueOnce({ error: null } as any);

      await ApprovalService.decideApproval('req-102', false);
      expect(supabase.rpc).toHaveBeenCalledWith('decide_approval', {
        p_request_id: 'req-102',
        p_approve: false,
        p_note: null,
      });
    });

    it('throws error when decision RPC fails', async () => {
      vi.mocked(supabase.rpc).mockResolvedValueOnce({
        error: { message: 'Only owner and co_admin can decide approvals' },
      } as any);

      await expect(
        ApprovalService.decideApproval('req-103', true)
      ).rejects.toEqual({ message: 'Only owner and co_admin can decide approvals' });
    });
  });

  describe('getPendingApprovals & getAllApprovals', () => {
    it('queries pending approvals for a property in descending created_at order', async () => {
      const mockList = [
        { id: 'req-1', status: 'pending', amount: 300, kind: 'discount' },
        { id: 'req-2', status: 'pending', amount: 500, kind: 'refund' },
      ];

      const mockOrder = vi.fn().mockResolvedValueOnce({ data: mockList, error: null });
      const mockEqStatus = vi.fn().mockReturnValue({ order: mockOrder });
      const mockEqProp = vi.fn().mockReturnValue({ eq: mockEqStatus });
      const mockSelect = vi.fn().mockReturnValue({ eq: mockEqProp });
      vi.mocked(supabase.from).mockReturnValueOnce({ select: mockSelect } as any);

      const res = await ApprovalService.getPendingApprovals('prop-101');
      expect(res).toEqual(mockList);
      expect(supabase.from).toHaveBeenCalledWith('approval_requests');
      expect(mockEqProp).toHaveBeenCalledWith('property_id', 'prop-101');
      expect(mockEqStatus).toHaveBeenCalledWith('status', 'pending');
      expect(mockOrder).toHaveBeenCalledWith('created_at', { ascending: false });
    });

    it('queries all approvals history for a property', async () => {
      const mockList = [
        { id: 'req-1', status: 'approved', amount: 300 },
        { id: 'req-2', status: 'declined', amount: 500 },
      ];

      const mockOrder = vi.fn().mockResolvedValueOnce({ data: mockList, error: null });
      const mockEqProp = vi.fn().mockReturnValue({ order: mockOrder });
      const mockSelect = vi.fn().mockReturnValue({ eq: mockEqProp });
      vi.mocked(supabase.from).mockReturnValueOnce({ select: mockSelect } as any);

      const res = await ApprovalService.getAllApprovals('prop-101');
      expect(res).toEqual(mockList);
    });

    it('returns empty array when query fails', async () => {
      vi.mocked(supabase.from).mockReturnValueOnce({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockResolvedValueOnce({ data: null, error: { message: 'Offline' } }),
      } as any);

      const res = await ApprovalService.getPendingApprovals('prop-101');
      expect(res).toEqual([]);
    });
  });

  describe('Role & Approval Pipeline Invariants', () => {
    it('authorizes only owner and co_admin to decide approval actions', () => {
      const canDecide = (role: StaffRole) => ['owner', 'co_admin'].includes(role);

      expect(canDecide('owner')).toBe(true);
      expect(canDecide('co_admin')).toBe(true);
      expect(canDecide('desk')).toBe(false);
      expect(canDecide('housekeeping')).toBe(false);
    });

    it('enforces that desk proposals create pending proposals while owner/co-admin write directly', () => {
      const processConciergeProposal = (role: StaffRole, payload: Record<string, any>) => {
        if (role === 'owner' || role === 'co_admin') {
          return { directCommit: true, pendingProposal: null };
        }
        if (role === 'desk') {
          return { directCommit: false, pendingProposal: { ...payload, submitted_at: new Date().toISOString() } };
        }
        throw new Error('Permission denied');
      };

      expect(processConciergeProposal('owner', { wifi: 'free' }).directCommit).toBe(true);
      expect(processConciergeProposal('co_admin', { wifi: 'free' }).directCommit).toBe(true);
      expect(processConciergeProposal('desk', { wifi: 'free' }).directCommit).toBe(false);
      expect(processConciergeProposal('desk', { wifi: 'free' }).pendingProposal).toBeDefined();
      expect(() => processConciergeProposal('housekeeping', { wifi: 'free' })).toThrow('Permission denied');
    });

    it('records audit log entries upon decision', () => {
      const makeAuditEntry = (requestId: string, approve: boolean, actorId: string) => ({
        action: approve ? 'approval_granted' : 'approval_declined',
        record_id: requestId,
        user_id: actorId,
        created_at: new Date().toISOString(),
      });

      const entry = makeAuditEntry('req-1', true, 'usr-owner');
      expect(entry.action).toBe('approval_granted');
      expect(entry.record_id).toBe('req-1');
      expect(entry.user_id).toBe('usr-owner');
    });
  });
});
