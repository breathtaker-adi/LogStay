// src/services/team.service.ts
// Business Logic for Team Management, Invites, Removal Hierarchy and Remarks Ledger

import { supabase } from '@/lib/supabase';
import { ENV } from '@/config/env';
import { TeamMember, StaffRemark, StaffRole } from '@/types/staff';

export class TeamService {
  /**
   * Generates a direct universal link for connecting
   */
  static getDirectJoinLink(code: string): string {
    return `${ENV.UNIVERSAL_LINK_BASE}/join?code=${code.trim().toUpperCase()}`;
  }

  /**
   * Enforces strict removal permissions hierarchy
   */
  static canRemoveTarget(actorRole: StaffRole, targetRole: StaffRole, isSelf = false): boolean {
    if (isSelf) return false;
    if (targetRole === 'owner') return false; // Supreme Owner
    if (targetRole === 'co_admin') return actorRole === 'owner';
    if (targetRole === 'desk') return actorRole === 'owner' || actorRole === 'co_admin';
    if (targetRole === 'housekeeping') return actorRole === 'owner' || actorRole === 'co_admin' || actorRole === 'desk';
    return false;
  }

  /**
   * Fetches all members of a property ordered by hierarchy
   */
  static async getPropertyTeam(propertyId: string): Promise<TeamMember[]> {
    try {
      const { data: rpcTeam, error: rpcError } = await supabase.rpc('get_property_team', {
        p_prop_id: propertyId,
      });

      if (!rpcError && rpcTeam && Array.isArray(rpcTeam) && rpcTeam.length > 0) {
        return rpcTeam as TeamMember[];
      }

      // Fallback: Query staff_profiles_safe and synthesize owner if missing
      const { data: staffData } = await supabase
        .from('staff_profiles_safe')
        .select('*')
        .eq('property_id', propertyId)
        .order('name', { ascending: true });

      let list: TeamMember[] = (staffData as any) || [];

      if (!list.some((s) => s.role === 'owner')) {
        const { data: prop } = await supabase
          .from('properties')
          .select('owner_id, name')
          .eq('id', propertyId)
          .single();

        if (prop?.owner_id) {
          list.unshift({
            id: prop.owner_id,
            user_id: prop.owner_id,
            property_id: propertyId,
            name: 'Property Owner',
            phone: null,
            role: 'owner',
            active: true,
            created_at: new Date().toISOString(),
          });
        }
      }

      const roleRank: Record<string, number> = { owner: 1, co_admin: 2, desk: 3, housekeeping: 4 };
      list.sort((a, b) => (roleRank[a.role] || 5) - (roleRank[b.role] || 5));
      return list;
    } catch (err) {
      console.error('[TeamService.getPropertyTeam] error:', err);
      return [];
    }
  }

  /**
   * Generates a 48h pass code for a chosen position
   */
  static async generateInviteCode(propertyId: string, actorId: string | null, role: StaffRole): Promise<string> {
    const { data, error } = await supabase.rpc('generate_invite_code', {
      p_prop: propertyId,
      p_actor: actorId,
      p_role: role,
    });
    if (error) throw error;
    if (!data) throw new Error('No invite code returned from server');
    return data;
  }

  /**
   * Removes a member following strict hierarchy, with optional ledger remark
   */
  static async removeMember(propertyId: string, targetStaffId: string, remark?: string | null): Promise<void> {
    const cleanRemark = remark?.trim() || null;
    const { error } = await supabase.rpc('remove_team_member', {
      p_prop_id: propertyId,
      p_target_staff_id: targetStaffId,
      p_remark: cleanRemark,
    });

    if (error) {
      // Fallback manual update
      await supabase
        .from('staff_profiles')
        .update({ active: false, deactivated_at: new Date().toISOString() })
        .eq('id', targetStaffId);
    }
  }

  /**
   * Looks up historical remarks across properties by phone or code
   */
  static async lookupRemarks(query: string): Promise<StaffRemark[]> {
    try {
      const { data, error } = await supabase.rpc('lookup_staff_remarks', {
        p_query: query.trim() || null,
      });

      if (!error && data && Array.isArray(data)) {
        return data as StaffRemark[];
      }

      // Fallback direct table query
      const cleaned = query.trim();
      const digits = cleaned.replace(/[^0-9]/g, '');

      let q = supabase.from('staff_remarks').select('*').order('created_at', { ascending: false });
      if (digits.length >= 6) {
        q = q.ilike('phone', `%${digits}%`);
      } else if (cleaned) {
        q = q.or(`staff_name.ilike.%${cleaned}%,role.ilike.%${cleaned}%`);
      }

      const { data: directData } = await q;
      return (directData as any) || [];
    } catch (err) {
      console.warn('[TeamService.lookupRemarks] error:', err);
      return [];
    }
  }
}

