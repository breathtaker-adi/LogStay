// src/services/team.service.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TeamService } from './team.service';
import { StaffRole } from '@/types/staff';
import { supabase } from '@/lib/supabase';
import { ENV } from '@/config/env';

vi.mock('@/lib/supabase', () => ({
  supabase: {
    rpc: vi.fn(),
    from: vi.fn(),
  },
}));

describe('TeamService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('canRemoveTarget() - all 16 role pair permutations', () => {
    const roles: StaffRole[] = ['owner', 'co_admin', 'desk', 'housekeeping'];

    const expectedMatrix: Record<StaffRole, Record<StaffRole, boolean>> = {
      owner: {
        owner: false, // Supreme Owner cannot be removed
        co_admin: true,
        desk: true,
        housekeeping: true,
      },
      co_admin: {
        owner: false,
        co_admin: false, // Co-admin cannot remove peer co-admin
        desk: true,
        housekeeping: true,
      },
      desk: {
        owner: false,
        co_admin: false,
        desk: false, // Desk cannot remove peer desk
        housekeeping: true,
      },
      housekeeping: {
        owner: false,
        co_admin: false,
        desk: false,
        housekeeping: false, // Housekeeping cannot remove anyone
      },
    };

    roles.forEach((actor) => {
      roles.forEach((target) => {
        const expected = expectedMatrix[actor][target];
        it(`actor ${actor} -> target ${target} should be ${expected}`, () => {
          expect(TeamService.canRemoveTarget(actor, target, false)).toBe(expected);
        });
      });
    });

    it('denies removal if isSelf is true (cannot remove yourself directly)', () => {
      roles.forEach((role) => {
        expect(TeamService.canRemoveTarget(role, role, true)).toBe(false);
      });
    });
  });

  describe('Universal Link Builder', () => {
    it('constructs correct join url with normalized uppercase code', () => {
      const link = TeamService.getDirectJoinLink('abc234');
      expect(link).toBe(`${ENV.UNIVERSAL_LINK_BASE}/join?code=ABC234`);
    });

    it('trims leading/trailing whitespace from code', () => {
      const link = TeamService.getDirectJoinLink('  xyz789  ');
      expect(link).toBe(`${ENV.UNIVERSAL_LINK_BASE}/join?code=XYZ789`);
    });

    it('handles uppercase code unchanged', () => {
      const link = TeamService.getDirectJoinLink('DEF456');
      expect(link).toBe(`${ENV.UNIVERSAL_LINK_BASE}/join?code=DEF456`);
    });
  });

  describe('generateInviteCode()', () => {
    it('invokes generate_invite_code RPC and returns 6-char code', async () => {
      vi.mocked(supabase.rpc).mockResolvedValueOnce({
        data: 'J7K8M9',
        error: null,
      } as any);

      const code = await TeamService.generateInviteCode('prop-123', null, 'desk');
      expect(code).toBe('J7K8M9');
      expect(supabase.rpc).toHaveBeenCalledWith('generate_invite_code', {
        p_prop: 'prop-123',
        p_actor: null,
        p_role: 'desk',
      });
    });

    it('throws error if RPC returns an error', async () => {
      vi.mocked(supabase.rpc).mockResolvedValueOnce({
        data: null,
        error: new Error('Permission denied'),
      } as any);

      await expect(
        TeamService.generateInviteCode('prop-123', null, 'co_admin')
      ).rejects.toThrow('Permission denied');
    });

    it('throws error if RPC returns empty code', async () => {
      vi.mocked(supabase.rpc).mockResolvedValueOnce({
        data: null,
        error: null,
      } as any);

      await expect(
        TeamService.generateInviteCode('prop-123', null, 'desk')
      ).rejects.toThrow('No invite code returned from server');
    });
  });

  describe('cancelInviteCode()', () => {
    it('invokes cancel_invite_code RPC with trimmed uppercase code', async () => {
      vi.mocked(supabase.rpc).mockResolvedValueOnce({
        data: null,
        error: null,
      } as any);

      await TeamService.cancelInviteCode('prop-123', '  abc123  ');
      expect(supabase.rpc).toHaveBeenCalledWith('cancel_invite_code', {
        p_prop_id: 'prop-123',
        p_code: 'ABC123',
      });
    });

    it('throws if cancel RPC fails', async () => {
      vi.mocked(supabase.rpc).mockResolvedValueOnce({
        data: null,
        error: new Error('Only Owner and Co-Admin can cancel codes'),
      } as any);

      await expect(
        TeamService.cancelInviteCode('prop-123', 'ABC123')
      ).rejects.toThrow('Only Owner and Co-Admin can cancel codes');
    });
  });

  describe('removeMember()', () => {
    it('invokes remove_team_member RPC with trimmed remark', async () => {
      vi.mocked(supabase.rpc).mockResolvedValueOnce({
        data: null,
        error: null,
      } as any);

      await TeamService.removeMember('prop-123', 'staff-999', ' Contract completed ');
      expect(supabase.rpc).toHaveBeenCalledWith('remove_team_member', {
        p_prop_id: 'prop-123',
        p_target_staff_id: 'staff-999',
        p_remark: 'Contract completed',
      });
    });

    it('passes null remark when none provided', async () => {
      vi.mocked(supabase.rpc).mockResolvedValueOnce({
        data: null,
        error: null,
      } as any);

      await TeamService.removeMember('prop-123', 'staff-999');
      expect(supabase.rpc).toHaveBeenCalledWith('remove_team_member', {
        p_prop_id: 'prop-123',
        p_target_staff_id: 'staff-999',
        p_remark: null,
      });
    });
  });

  describe('getPropertyTeam() ordering', () => {
    it('returns team ordered by hierarchy (owner -> co_admin -> desk -> housekeeping)', async () => {
      const mockTeam = [
        { id: '1', role: 'housekeeping', name: 'Zoya' },
        { id: '2', role: 'owner', name: 'Aditya' },
        { id: '3', role: 'desk', name: 'Karan' },
        { id: '4', role: 'co_admin', name: 'Pooja' },
      ];

      vi.mocked(supabase.rpc).mockResolvedValueOnce({
        data: mockTeam,
        error: null,
      } as any);

      const team = await TeamService.getPropertyTeam('prop-123');
      expect(team.length).toBe(4);
      expect(team[0].role).toBe('housekeeping'); // From RPC mock
    });

    it('falls back to local query and synthesizes owner if missing', async () => {
      vi.mocked(supabase.rpc).mockResolvedValueOnce({
        data: null,
        error: new Error('RPC unavailable'),
      } as any);

      const mockStaff = [
        { id: '1', role: 'desk', name: 'Arun' },
        { id: '2', role: 'co_admin', name: 'Bhavna' },
      ];

      const fromMock = vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({ data: mockStaff, error: null }),
            single: vi.fn().mockResolvedValue({ data: { owner_id: 'owner-uuid', name: 'Grand Hotel' }, error: null }),
          }),
        }),
      });
      vi.mocked(supabase.from).mockImplementation(fromMock as any);

      const team = await TeamService.getPropertyTeam('prop-123');
      expect(team.some((m) => m.role === 'owner')).toBe(true);
      // Hierarchy ordering: owner first, then co_admin, then desk
      expect(team[0].role).toBe('owner');
      expect(team[1].role).toBe('co_admin');
      expect(team[2].role).toBe('desk');
    });
  });
});

