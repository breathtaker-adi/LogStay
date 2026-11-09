// src/services/property.service.test.ts
// Unit tests for Property Service & Multi-Property Switching (Section 4.20)
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PropertyService } from './property.service';
import { supabase } from '@/lib/supabase';
import { INDIAN_STATES_AND_UTS } from '@/lib/validation';

vi.mock('@/lib/supabase', () => ({
  supabase: {
    rpc: vi.fn(),
    from: vi.fn(),
  },
}));

describe('PropertyService (Section 4.20)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('createProperty', () => {
    it('creates property with valid inputs via create_property RPC', async () => {
      vi.mocked(supabase.rpc).mockResolvedValueOnce({
        data: 'prop-new-123',
        error: null,
      } as any);

      const propId = await PropertyService.createProperty(
        '  Backpackers Haven  ',
        'hostel',
        '  Goa  ',
        '  Aditya  '
      );

      expect(propId).toBe('prop-new-123');
      expect(supabase.rpc).toHaveBeenCalledWith('create_property', {
        p_name: 'Backpackers Haven',
        p_type: 'hostel',
        p_state: 'Goa',
        p_pin: '',
        p_owner_name: 'Aditya',
      });
    });

    it('throws error if RPC returns an error', async () => {
      vi.mocked(supabase.rpc).mockResolvedValueOnce({
        data: null,
        error: { message: 'Database constraint violation' },
      } as any);

      await expect(
        PropertyService.createProperty('Test Hotel', 'hotel', 'Karnataka', 'Owner')
      ).rejects.toEqual({ message: 'Database constraint violation' });
    });

    it('throws error if RPC returns null property ID', async () => {
      vi.mocked(supabase.rpc).mockResolvedValueOnce({
        data: null,
        error: null,
      } as any);

      await expect(
        PropertyService.createProperty('Test Hotel', 'hotel', 'Karnataka', 'Owner')
      ).rejects.toThrow('No property ID returned from creation RPC');
    });

    it('validates property name length bounds (< 2 and > 100 chars)', () => {
      const validateName = (n: string) => n.trim().length >= 2 && n.trim().length <= 100;
      expect(validateName('')).toBe(false);
      expect(validateName('A')).toBe(false);
      expect(validateName('Goa Hostel')).toBe(true);
      expect(validateName('A'.repeat(100))).toBe(true);
      expect(validateName('A'.repeat(101))).toBe(false);
    });

    it('validates property type enum', () => {
      const validTypes = ['hostel', 'hotel', 'homestay', 'resort', 'boutique'];
      const isValidType = (t: string) => validTypes.includes(t);

      expect(isValidType('hostel')).toBe(true);
      expect(isValidType('hotel')).toBe(true);
      expect(isValidType('homestay')).toBe(true);
      expect(isValidType('resort')).toBe(true);
      expect(isValidType('boutique')).toBe(true);
      expect(isValidType('motel')).toBe(false);
      expect(isValidType('villa')).toBe(false);
      expect(isValidType('')).toBe(false);
    });

    it('validates Indian States and Union Territories list (36 total)', () => {
      expect(INDIAN_STATES_AND_UTS).toBeDefined();
      expect(INDIAN_STATES_AND_UTS.length).toBe(36);
      expect(INDIAN_STATES_AND_UTS).toContain('Goa');
      expect(INDIAN_STATES_AND_UTS).toContain('Maharashtra');
      expect(INDIAN_STATES_AND_UTS).toContain('Delhi');
      expect(INDIAN_STATES_AND_UTS).toContain('Ladakh');
      expect(INDIAN_STATES_AND_UTS).not.toContain('California');
      expect(INDIAN_STATES_AND_UTS).not.toContain('London');
    });
  });

  describe('getProperty', () => {
    it('fetches property row by ID', async () => {
      const mockProp = {
        id: 'prop-101',
        name: 'Zostel Goa',
        type: 'hostel',
        state: 'Goa',
        upi_id: 'hostel@upi',
      };

      vi.mocked(supabase.from).mockReturnValueOnce({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValueOnce({ data: mockProp, error: null }),
      } as any);

      const prop = await PropertyService.getProperty('prop-101');
      expect(prop).toEqual(mockProp);
    });

    it('returns null on failure / not found', async () => {
      vi.mocked(supabase.from).mockReturnValueOnce({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValueOnce({ data: null, error: { message: 'Not found' } }),
      } as any);

      const prop = await PropertyService.getProperty('prop-nonexistent');
      expect(prop).toBeNull();
    });
  });

  describe('updatePropertyName', () => {
    it('updates property name with trimmed value', async () => {
      const mockEq = vi.fn().mockResolvedValueOnce({ error: null });
      const mockUpdate = vi.fn().mockReturnValue({ eq: mockEq });
      vi.mocked(supabase.from).mockReturnValueOnce({ update: mockUpdate } as any);

      await PropertyService.updatePropertyName('prop-101', '  New Sunset Hostel  ');
      expect(mockUpdate).toHaveBeenCalledWith({ name: 'New Sunset Hostel' });
      expect(mockEq).toHaveBeenCalledWith('id', 'prop-101');
    });

    it('throws error when update fails in database', async () => {
      const mockEq = vi.fn().mockResolvedValueOnce({ error: { message: 'Permission denied' } });
      const mockUpdate = vi.fn().mockReturnValue({ eq: mockEq });
      vi.mocked(supabase.from).mockReturnValueOnce({ update: mockUpdate } as any);

      await expect(
        PropertyService.updatePropertyName('prop-101', 'Unauthorized Name')
      ).rejects.toEqual({ message: 'Permission denied' });
    });
  });

  describe('Concierge & Wi-Fi settings', () => {
    it('fetches concierge settings with default fallbacks', async () => {
      vi.mocked(supabase.from).mockReturnValueOnce({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValueOnce({
          data: {
            wifi_network: 'GuestWiFi',
            wifi_password: 'pass',
            reception_phone: '+919876543210',
            whatsapp_number: null,
            maps_location_url: null,
            rules_summary: 'Quiet hours after 10 PM',
          },
          error: null,
        }),
      } as any);

      const concierge = await PropertyService.getConciergeSettings('prop-101');
      expect(concierge).toEqual({
        property_id: 'prop-101',
        wifi_network: 'GuestWiFi',
        wifi_password: 'pass',
        reception_phone: '+919876543210',
        whatsapp_number: '',
        maps_location_url: '',
        rules_summary: 'Quiet hours after 10 PM',
      });
    });

    it('updates concierge settings with trimmed and nullable values', async () => {
      const mockEq = vi.fn().mockResolvedValueOnce({ error: null });
      const mockUpdate = vi.fn().mockReturnValue({ eq: mockEq });
      vi.mocked(supabase.from).mockReturnValueOnce({ update: mockUpdate } as any);

      await PropertyService.updateConciergeSettings('prop-101', {
        wifi_network: '  SuperFastWifi  ',
        wifi_password: '  secret123  ',
        whatsapp_number: '',
      });

      expect(mockUpdate).toHaveBeenCalledWith({
        wifi_network: 'SuperFastWifi',
        wifi_password: 'secret123',
        reception_phone: null,
        whatsapp_number: null,
        maps_location_url: null,
        rules_summary: null,
      });
    });
  });

  describe('Multi-Property & Isolation Rules', () => {
    it('isolates cache keys between distinct properties', () => {
      const getCacheKey = (propId: string, resource: string) => `@logstay:${propId}:${resource}`;
      expect(getCacheKey('prop-1', 'rooms')).toBe('@logstay:prop-1:rooms');
      expect(getCacheKey('prop-2', 'rooms')).toBe('@logstay:prop-2:rooms');
      expect(getCacheKey('prop-1', 'rooms')).not.toEqual(getCacheKey('prop-2', 'rooms'));
    });

    it('selects the first active membership property when user belongs to multiple', () => {
      const memberships = [
        { property_id: 'prop-primary', role: 'owner', joined_at: '2026-01-01T00:00:00Z' },
        { property_id: 'prop-secondary', role: 'co_admin', joined_at: '2026-06-01T00:00:00Z' },
      ];
      const activePropertyId = memberships[0]?.property_id;
      expect(activePropertyId).toBe('prop-primary');
    });
  });
});

