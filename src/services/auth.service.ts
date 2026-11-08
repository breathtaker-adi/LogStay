// src/services/auth.service.ts
// Business Logic for Authentication, Session Resolution and Profile Binding

import { supabase } from '@/lib/supabase';
import { ActiveStaffSession, StaffRole } from '@/types/staff';

export interface ResolveProfileResult {
  session: ActiveStaffSession | null;
  propertyId: string | null;
  needsPropertySetup: boolean;
}

export class AuthService {
  /**
   * Retrieves the current Supabase auth user
   */
  static async getCurrentUser() {
    try {
      const { data, error } = await supabase.auth.getUser();
      if (error) throw error;
      return data.user;
    } catch {
      return null;
    }
  }

  /**
   * Resolves the active user's staff profile and property membership.
   * Directs user to home, setup-property, or null.
   */
  static async resolveUserProfile(): Promise<ResolveProfileResult> {
    const user = await this.getCurrentUser();
    if (!user) {
      return { session: null, propertyId: null, needsPropertySetup: false };
    }

    try {
      // 1. Fast atomic RPC resolution
      const { data: rpcProfile } = await supabase.rpc('resolve_user_profile');
      if (rpcProfile?.property_id && rpcProfile?.staff_id) {
        return {
          session: {
            id: rpcProfile.staff_id,
            name: rpcProfile.name,
            role: rpcProfile.role as StaffRole,
            attendanceId: null,
            propertyId: rpcProfile.property_id,
          },
          propertyId: rpcProfile.property_id,
          needsPropertySetup: false,
        };
      }

      // 2. Fallback: check members table
      const { data: member } = await supabase
        .from('members')
        .select('property_id, role')
        .eq('user_id', user.id)
        .maybeSingle();

      if (!member?.property_id) {
        return { session: null, propertyId: null, needsPropertySetup: true };
      }

      // 3. Match staff profile for this property
      const { data: profiles } = await supabase
        .from('staff_profiles_safe')
        .select('*')
        .eq('property_id', member.property_id);

      const matchedProfile =
        profiles?.find((p) => p.user_id === user.id) ||
        (member.role === 'owner' ? profiles?.find((p) => p.role === 'owner') : null) ||
        profiles?.[0];

      if (matchedProfile) {
        return {
          session: {
            id: matchedProfile.id,
            name: matchedProfile.name,
            role: matchedProfile.role as StaffRole,
            attendanceId: null,
            propertyId: member.property_id,
          },
          propertyId: member.property_id,
          needsPropertySetup: false,
        };
      }

      return { session: null, propertyId: member.property_id, needsPropertySetup: true };
    } catch (err) {
      console.error('[AuthService.resolveUserProfile] error:', err);
      return { session: null, propertyId: null, needsPropertySetup: false };
    }
  }

  /**
   * Signs out the user and cleans up the active session
   */
  static async signOut(): Promise<void> {
    try {
      await supabase.auth.signOut();
    } catch (err) {
      console.warn('[AuthService.signOut] error:', err);
    }
  }
}

