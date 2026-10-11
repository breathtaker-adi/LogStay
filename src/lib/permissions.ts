// src/lib/permissions.ts

export type Role = 'owner' | 'desk' | 'housekeeping';
export type Action = 
  | 'check_in' 
  | 'check_out' 
  | 'guests' 
  | 'shift' 
  | 'add_room' 
  | 'export' 
  | 'form_c' 
  | 'settings' 
  | 'mark_clean' 
  | 'set_maintenance' 
  | 'view_id_photo'
  | 'refund_payment';

const permissions: Record<Role, Action[]> = {
  owner: [
    'check_in', 'check_out', 'guests', 'shift', 'add_room', 'export', 'form_c', 
    'settings', 'mark_clean', 'set_maintenance', 'view_id_photo', 'refund_payment'
  ],
  desk: [
    'check_in', 'check_out', 'guests', 'shift', 'export', 'form_c', 
    'mark_clean', 'set_maintenance', 'view_id_photo'
  ],
  housekeeping: [
    'mark_clean'
  ]
};

export const can = (role: Role | undefined | null, action: Action): boolean => {
  if (!role) return false;
  return permissions[role]?.includes(action) ?? false;
};