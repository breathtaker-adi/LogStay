// src/test/factories.ts
// Test helper: Deterministic synthetic data factories (no real PII, seeded defaults)

import { StaffProfile } from '@/types/staff';
import { Property } from '@/types/property';

export function makeProperty(overrides: Partial<Property> = {}): Property {
  return {
    id: overrides.id || '11111111-1111-1111-1111-111111111111',
    name: overrides.name || 'Zostel Demo Backpackers',
    type: overrides.type || 'hostel',
    state: overrides.state || 'Goa',
    owner_id: overrides.owner_id || '00000000-0000-0000-0000-000000000001',
    created_at: overrides.created_at || '2026-10-15T10:00:00Z',
    ...overrides,
  };
}

export function makeStaff(overrides: Partial<StaffProfile> = {}): StaffProfile {
  return {
    id: overrides.id || '22222222-2222-2222-2222-222222222222',
    property_id: overrides.property_id || '11111111-1111-1111-1111-111111111111',
    user_id: overrides.user_id || '00000000-0000-0000-0000-000000000002',
    name: overrides.name || 'Rahul Sharma',
    phone: overrides.phone || '+91 90000 00001',
    role: overrides.role || 'desk',
    active: overrides.active ?? true,
    joined_on: overrides.joined_on || '2026-10-15T10:00:00Z',
    created_at: overrides.created_at || '2026-10-15T10:00:00Z',
    ...overrides,
  };
}

export function makeGuest(overrides: Record<string, any> = {}) {
  return {
    id: overrides.id || '33333333-3333-3333-3333-333333333333',
    property_id: overrides.property_id || '11111111-1111-1111-1111-111111111111',
    name: overrides.name || 'John Doe',
    phone: overrides.phone || '+91 90000 00002',
    nationality: overrides.nationality || 'India',
    gender: overrides.gender || 'male',
    id_type: overrides.id_type || 'Aadhaar',
    id_last4: overrides.id_last4 || '1234',
    ...overrides,
  };
}

export function makeStay(overrides: Record<string, any> = {}) {
  return {
    id: overrides.id || '44444444-4444-4444-4444-444444444444',
    property_id: overrides.property_id || '11111111-1111-1111-1111-111111111111',
    guest_id: overrides.guest_id || '33333333-3333-3333-3333-333333333333',
    unit_id: overrides.unit_id || '55555555-5555-5555-5555-555555555555',
    status: overrides.status || 'checked_in',
    amount: overrides.amount ?? 1000,
    pay_mode: overrides.pay_mode || 'cash',
    nights: overrides.nights ?? 1,
    check_in: overrides.check_in || '2026-10-15T11:00:00Z',
    expected_checkout: overrides.expected_checkout || '2026-10-16T11:00:00Z',
    ...overrides,
  };
}

export function makeRoom(overrides: Record<string, any> = {}) {
  return {
    id: overrides.id || '66666666-6666-6666-6666-666666666666',
    property_id: overrides.property_id || '11111111-1111-1111-1111-111111111111',
    label: overrides.label || '101',
    floor: overrides.floor || 'Ground',
    floor_no: overrides.floor_no ?? 0,
    kind: overrides.kind || 'private',
    ...overrides,
  };
}
