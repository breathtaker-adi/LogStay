// src/lib/permissions.test.ts
import { describe, it, expect } from 'vitest';
import { can, Role, Action } from './permissions';

describe('permissions > can()', () => {
  const allRoles: Role[] = ['owner', 'co_admin', 'desk', 'housekeeping'];
  const allActions: Action[] = [
    'check_in',
    'check_out',
    'guests',
    'shift',
    'add_room',
    'add_staff',
    'export',
    'form_c',
    'settings',
    'mark_clean',
    'set_maintenance',
    'view_id_photo',
    'refund_payment',
    'broadcast_guests',
  ];

  const expectedMatrix: Record<Role, Record<Action, boolean>> = {
    owner: {
      check_in: true,
      check_out: true,
      guests: true,
      shift: true,
      add_room: true,
      add_staff: true,
      export: true,
      form_c: true,
      settings: true,
      mark_clean: true,
      set_maintenance: true,
      view_id_photo: true,
      refund_payment: true,
      broadcast_guests: true,
    },
    co_admin: {
      check_in: true,
      check_out: true,
      guests: true,
      shift: true,
      add_room: true,
      add_staff: true,
      export: true,
      form_c: true,
      settings: true,
      mark_clean: true,
      set_maintenance: true,
      view_id_photo: true,
      refund_payment: true,
      broadcast_guests: true,
    },
    desk: {
      check_in: true,
      check_out: true,
      guests: true,
      shift: true,
      add_room: false,
      add_staff: true,
      export: true,
      form_c: true,
      settings: true,
      mark_clean: true,
      set_maintenance: true,
      view_id_photo: true,
      refund_payment: false,
      broadcast_guests: true,
    },
    housekeeping: {
      check_in: false,
      check_out: false,
      guests: false,
      shift: false,
      add_room: false,
      add_staff: false,
      export: false,
      form_c: false,
      settings: true,
      mark_clean: true,
      set_maintenance: false,
      view_id_photo: false,
      refund_payment: false,
      broadcast_guests: false,
    },
  };

  it.each(allRoles)('verifies complete permission matrix for role %s', (role) => {
    for (const action of allActions) {
      const expected = expectedMatrix[role][action];
      expect(can(role, action)).toBe(expected);
    }
  });

  describe('Deny by default & boundary checks', () => {
    it('returns false for undefined role', () => {
      expect(can(undefined, 'check_in')).toBe(false);
    });

    it('returns false for null role', () => {
      expect(can(null, 'check_in')).toBe(false);
    });

    it('returns false for invalid/unknown role string', () => {
      expect(can('guest' as any, 'check_in')).toBe(false);
      expect(can('' as any, 'check_in')).toBe(false);
      expect(can('admin' as any, 'check_in')).toBe(false);
    });

    it('returns false for unknown action', () => {
      expect(can('owner', 'delete_database' as any)).toBe(false);
      expect(can('desk', '' as any)).toBe(false);
    });
  });

  describe('Housekeeping strict privacy & operations boundary', () => {
    it('prevents housekeeping from guest check-in and check-out', () => {
      expect(can('housekeeping', 'check_in')).toBe(false);
      expect(can('housekeeping', 'check_out')).toBe(false);
    });

    it('prevents housekeeping from seeing guest IDs and billing', () => {
      expect(can('housekeeping', 'view_id_photo')).toBe(false);
      expect(can('housekeeping', 'guests')).toBe(false);
      expect(can('housekeeping', 'export')).toBe(false);
    });

    it('prevents housekeeping from handling cash shifts and refunds', () => {
      expect(can('housekeeping', 'shift')).toBe(false);
      expect(can('housekeeping', 'refund_payment')).toBe(false);
    });

    it('allows housekeeping to mark rooms clean and access app settings', () => {
      expect(can('housekeeping', 'mark_clean')).toBe(true);
      expect(can('housekeeping', 'settings')).toBe(true);
    });
  });

  describe('Front Desk authority boundaries', () => {
    it('allows front desk check-in, check-out, shift, and guest handling', () => {
      expect(can('desk', 'check_in')).toBe(true);
      expect(can('desk', 'check_out')).toBe(true);
      expect(can('desk', 'shift')).toBe(true);
      expect(can('desk', 'guests')).toBe(true);
    });

    it('denies front desk direct refunds without managerial approval', () => {
      expect(can('desk', 'refund_payment')).toBe(false);
    });

    it('denies front desk creating or removing rooms', () => {
      expect(can('desk', 'add_room')).toBe(false);
    });
  });

  describe('Role containment hierarchy', () => {
    it('ensures owner permissions strictly supersede desk permissions', () => {
      for (const action of allActions) {
        if (can('desk', action)) {
          expect(can('owner', action)).toBe(true);
        }
      }
    });

    it('ensures co_admin permissions strictly supersede desk permissions', () => {
      for (const action of allActions) {
        if (can('desk', action)) {
          expect(can('co_admin', action)).toBe(true);
        }
      }
    });

    it('ensures desk permissions strictly supersede housekeeping permissions', () => {
      for (const action of allActions) {
        if (can('housekeeping', action)) {
          expect(can('desk', action)).toBe(true);
        }
      }
    });
  });
});

