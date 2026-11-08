// src/types/staff.ts
// Domain Types for Staff, Team Roles, Permissions and Remarks

export type StaffRole = 'owner' | 'co_admin' | 'desk' | 'housekeeping';

export interface StaffProfile {
  id: string;
  user_id?: string | null;
  property_id: string;
  name: string;
  phone?: string | null;
  role: StaffRole;
  active: boolean;
  joined_on?: string | null;
  created_at?: string;
  deactivated_at?: string | null;
}

export interface ActiveStaffSession {
  id: string;
  name: string;
  role: StaffRole;
  attendanceId: string | null;
  propertyId?: string;
}

export interface TeamMember extends StaffProfile {
  remarks_count?: number;
}

export interface StaffRemark {
  id: string;
  property_name: string;
  staff_name?: string;
  role: string;
  remark: string;
  removed_by_name: string;
  removed_by_role: string;
  created_at: string;
}

