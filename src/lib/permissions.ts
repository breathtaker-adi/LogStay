// src/lib/permissions.ts

export type Role = 'owner' | 'co_admin' | 'desk' | 'housekeeping';
export type Action = 
  | 'check_in' 
  | 'check_out' 
  | 'guests' 
  | 'shift' 
  | 'add_room' 
  | 'add_staff'
  | 'export' 
  | 'form_c' 
  | 'settings' 
  | 'mark_clean' 
  | 'set_maintenance' 
  | 'view_id_photo'
  | 'refund_payment'
  | 'broadcast_guests';

const permissions: Record<Role, Action[]> = {
  owner: [
    'check_in', 'check_out', 'guests', 'shift', 'add_room', 'add_staff', 'export', 'form_c', 
    'settings', 'mark_clean', 'set_maintenance', 'view_id_photo', 'refund_payment', 'broadcast_guests'
  ],
  co_admin: [
    'check_in', 'check_out', 'guests', 'shift', 'add_room', 'add_staff', 'export', 'form_c', 
    'settings', 'mark_clean', 'set_maintenance', 'view_id_photo', 'refund_payment', 'broadcast_guests'
  ],
  desk: [
    'check_in', 'check_out', 'guests', 'shift', 'add_staff', 'export', 'form_c', 
    'settings', 'mark_clean', 'set_maintenance', 'view_id_photo', 'broadcast_guests'
  ],
  housekeeping: [
    'settings', 'mark_clean'
  ]
};

export const can = (role: Role | undefined | null, action: Action): boolean => {
  if (!role) return false;
  return permissions[role]?.includes(action) ?? false;
};