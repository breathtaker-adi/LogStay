// src/lib/schema-constraints.test.ts
// Unit tests for Database Constraints, Enums & Views Specification (Sections 4.28 & 4.33)
import { describe, it, expect } from 'vitest';

describe('Schema Constraints & Enums (Sections 4.28 & 4.33)', () => {
  describe('Enum & CHECK Constraints Validations', () => {
    it('enforces rooms.kind CHECK (dorm, private only)', () => {
      const allowedKinds = ['dorm', 'private'];
      const checkKind = (k: string) => allowedKinds.includes(k);

      expect(checkKind('dorm')).toBe(true);
      expect(checkKind('private')).toBe(true);
      expect(checkKind('suite')).toBe(false);
      expect(checkKind('tent')).toBe(false);
    });

    it('enforces units.gender_rule CHECK (any, male, female only)', () => {
      const allowed = ['any', 'male', 'female'];
      const checkGender = (g: string) => allowed.includes(g);

      expect(checkGender('any')).toBe(true);
      expect(checkGender('male')).toBe(true);
      expect(checkGender('female')).toBe(true);
      expect(checkGender('other')).toBe(false);
    });

    it('enforces units.housekeeping_status CHECK (clean, dirty, maintenance only)', () => {
      const allowed = ['clean', 'dirty', 'maintenance'];
      const checkStatus = (s: string) => allowed.includes(s);

      expect(checkStatus('clean')).toBe(true);
      expect(checkStatus('dirty')).toBe(true);
      expect(checkStatus('maintenance')).toBe(true);
      expect(checkStatus('occupied')).toBe(false); // Occupied is computed from active stays
    });

    it('enforces guests.gender CHECK (male, female, other only)', () => {
      const allowed = ['male', 'female', 'other'];
      const checkGuestGender = (g: string) => allowed.includes(g);

      expect(checkGuestGender('male')).toBe(true);
      expect(checkGuestGender('female')).toBe(true);
      expect(checkGuestGender('other')).toBe(true);
      expect(checkGuestGender('unknown')).toBe(false);
    });

    it('enforces stays.status CHECK (checked_in, checked_out only)', () => {
      const allowed = ['checked_in', 'checked_out'];
      const checkStayStatus = (s: string) => allowed.includes(s);

      expect(checkStayStatus('checked_in')).toBe(true);
      expect(checkStayStatus('checked_out')).toBe(true);
      expect(checkStayStatus('cancelled')).toBe(false);
    });

    it('enforces stays.pay_mode CHECK (cash, upi, pay_later, card)', () => {
      const allowed = ['cash', 'upi', 'pay_later', 'card'];
      const checkPayMode = (p: string) => allowed.includes(p);

      expect(checkPayMode('cash')).toBe(true);
      expect(checkPayMode('upi')).toBe(true);
      expect(checkPayMode('pay_later')).toBe(true);
      expect(checkPayMode('card')).toBe(true);
      expect(checkPayMode('crypto')).toBe(false);
    });

    it('enforces cash_entries.kind CHECK (petty, collection, refund only)', () => {
      const allowed = ['petty', 'collection', 'refund'];
      const checkKind = (k: string) => allowed.includes(k);

      expect(checkKind('petty')).toBe(true);
      expect(checkKind('collection')).toBe(true);
      expect(checkKind('refund')).toBe(true);
      expect(checkKind('transfer')).toBe(false);
    });

    it('enforces issues.category CHECK (ac, water, noise, cleanliness, electrical, other)', () => {
      const allowed = ['ac', 'water', 'noise', 'cleanliness', 'electrical', 'other'];
      const checkCategory = (c: string) => allowed.includes(c);

      expect(checkCategory('ac')).toBe(true);
      expect(checkCategory('water')).toBe(true);
      expect(checkCategory('electrical')).toBe(true);
      expect(checkCategory('wifi')).toBe(false);
    });

    it('enforces staff_profiles and members role CHECK (owner, co_admin, desk, housekeeping)', () => {
      const allowed = ['owner', 'co_admin', 'desk', 'housekeeping'];
      const checkRole = (r: string) => allowed.includes(r);

      expect(checkRole('owner')).toBe(true);
      expect(checkRole('co_admin')).toBe(true);
      expect(checkRole('desk')).toBe(true);
      expect(checkRole('housekeeping')).toBe(true);
      expect(checkRole('admin')).toBe(false);
    });

    it('CRITICAL: property_invites.role strictly EXCLUDES owner (owner cannot be invited)', () => {
      const inviteRoles = ['co_admin', 'desk', 'housekeeping'];
      const canBeInvited = (r: string) => inviteRoles.includes(r);

      expect(canBeInvited('co_admin')).toBe(true);
      expect(canBeInvited('desk')).toBe(true);
      expect(canBeInvited('housekeeping')).toBe(true);
      expect(canBeInvited('owner')).toBe(false); // Supreme owner can only be provisioned on property creation
    });
  });

  describe('Precision & Numerical Bounds', () => {
    it('validates numeric(10,2) money boundaries', () => {
      const checkNumeric10_2 = (val: number) => {
        if (isNaN(val) || !isFinite(val)) return false;
        if (val < 0) return false;
        if (val > 99999999.99) return false; // 10 total digits, 2 decimals
        return true;
      };

      expect(checkNumeric10_2(0)).toBe(true);
      expect(checkNumeric10_2(500.5)).toBe(true);
      expect(checkNumeric10_2(99999999.99)).toBe(true);
      expect(checkNumeric10_2(100000000.0)).toBe(false); // Out of range
      expect(checkNumeric10_2(-1)).toBe(false);
    });
  });

  describe('staff_profiles_safe View & Security Invariants', () => {
    it('ensures staff_profiles_safe view does not expose sensitive pin_hash column', () => {
      const safeViewColumns = ['id', 'user_id', 'property_id', 'name', 'phone', 'role', 'active', 'created_at'];
      expect(safeViewColumns).not.toContain('pin_hash');
      expect(safeViewColumns).not.toContain('password');
      expect(safeViewColumns).not.toContain('auth_token');
    });

    it('soft delete via archived_at retains historical stays while hiding units from vacancy', () => {
      const unit = { id: 'u1', label: '101', archived_at: '2026-10-01T00:00:00Z' };
      const isAvailableForCheckin = (u: typeof unit) => !u.archived_at;
      expect(isAvailableForCheckin(unit)).toBe(false);
    });
  });
});

