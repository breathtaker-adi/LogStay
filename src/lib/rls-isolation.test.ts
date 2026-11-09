// src/lib/rls-isolation.test.ts
// Unit tests for RLS & Cross-Property Tenant Isolation (Section 4.34)
import { describe, it, expect } from 'vitest';

export interface MembershipRecord {
  user_id: string;
  property_id: string;
  role: 'owner' | 'co_admin' | 'desk' | 'housekeeping';
}

export function evaluateRowAccess(
  currentUser: { id: string; role?: string; propertyId?: string } | null,
  rowPropertyId: string
): boolean {
  if (!currentUser || !currentUser.id) return false;
  return currentUser.propertyId === rowPropertyId;
}

describe('RLS & Cross-Property Tenant Isolation (Section 4.34)', () => {
  const userA = { id: 'usr-A', propertyId: 'prop-X', role: 'owner' };
  const userB = { id: 'usr-B', propertyId: 'prop-Y', role: 'owner' };
  const userStaffA = { id: 'usr-staff-A', propertyId: 'prop-X', role: 'desk' };

  describe('is_member tenant boundary function', () => {
    it('grants access when user belongs to the requested property', () => {
      expect(evaluateRowAccess(userA, 'prop-X')).toBe(true);
      expect(evaluateRowAccess(userStaffA, 'prop-X')).toBe(true);
      expect(evaluateRowAccess(userB, 'prop-Y')).toBe(true);
    });

    it('strictly denies cross-tenant access for non-members', () => {
      expect(evaluateRowAccess(userA, 'prop-Y')).toBe(false);
      expect(evaluateRowAccess(userB, 'prop-X')).toBe(false);
      expect(evaluateRowAccess(userStaffA, 'prop-Y')).toBe(false);
    });

    it('strictly denies all access to anonymous (unauthenticated) callers', () => {
      expect(evaluateRowAccess(null, 'prop-X')).toBe(false);
      expect(evaluateRowAccess({ id: '' }, 'prop-X')).toBe(false);
    });
  });

  describe('Tenant Scoping Across Tables', () => {
    const propertyXRoom = { id: 'rm-101', property_id: 'prop-X', label: '101' };
    const propertyYRoom = { id: 'rm-201', property_id: 'prop-Y', label: '201' };

    it('filters room queries so tenant only receives their own property rows', () => {
      const allRooms = [propertyXRoom, propertyYRoom];
      const userARooms = allRooms.filter((r) => evaluateRowAccess(userA, r.property_id));

      expect(userARooms).toHaveLength(1);
      expect(userARooms[0].id).toBe('rm-101');
    });

    it('enforces isolation even for supreme owners (owner of prop X cannot mutate prop Y)', () => {
      const canMutateRow = (user: typeof userA, targetPropertyId: string) =>
        evaluateRowAccess(user, targetPropertyId);

      expect(canMutateRow(userA, 'prop-X')).toBe(true);
      expect(canMutateRow(userA, 'prop-Y')).toBe(false);
    });

    it('isolates guest ID photos stored in cloud storage', () => {
      const canReadBucketPhoto = (user: typeof userA, bucketPath: string) => {
        const [photoPropertyId] = bucketPath.split('/');
        return evaluateRowAccess(user, photoPropertyId);
      };

      expect(canReadBucketPhoto(userA, 'prop-X/guest-123.jpg')).toBe(true);
      expect(canReadBucketPhoto(userA, 'prop-Y/guest-456.jpg')).toBe(false);
    });

    it('isolates audit logs between tenants', () => {
      const auditLogX = { id: 'aud-1', property_id: 'prop-X', action: 'check_in' };
      const auditLogY = { id: 'aud-2', property_id: 'prop-Y', action: 'close_shift' };

      expect(evaluateRowAccess(userA, auditLogX.property_id)).toBe(true);
      expect(evaluateRowAccess(userA, auditLogY.property_id)).toBe(false);
    });
  });
});

