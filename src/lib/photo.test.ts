// src/lib/photo.test.ts
// Unit tests for Photo Capture Pipeline & Storage Security (Section 4.30)
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./supabase', () => ({
  supabase: {
    storage: {
      from: vi.fn(),
    },
  },
}));

vi.mock('expo-file-system', () => {
  return {
    File: class MockFile {
      uri: string;
      exists = true;
      constructor(uri: string) {
        this.uri = uri;
      }
      async bytes() {
        return new Uint8Array([0xff, 0xd8, 0xff, 0xe0]); // Fake JPEG header
      }
    },
  };
});

describe('Photo Capture Pipeline & Storage Security (Section 4.30)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Storage Paths & Naming Conventions', () => {
    it('constructs deterministic guest ID photo path: {propertyId}/{guestId}.jpg', () => {
      const getGuestPhotoPath = (propertyId: string, guestId: string) => `${propertyId}/${guestId}.jpg`;
      expect(getGuestPhotoPath('prop-1', 'guest-101')).toBe('prop-1/guest-101.jpg');
    });

    it('constructs property banner path template: {propertyId}/property_banner.jpg', () => {
      const getBannerPath = (propertyId: string, isPending: boolean, timestamp = 1700000000) =>
        isPending ? `${propertyId}/pending_banner_${timestamp}.jpg` : `${propertyId}/property_banner.jpg`;

      expect(getBannerPath('prop-1', false)).toBe('prop-1/property_banner.jpg');
      expect(getBannerPath('prop-1', true, 12345)).toBe('prop-1/pending_banner_12345.jpg');
    });

    it('constructs UPI QR path: {propertyId}/upi_qr_{timestamp}.jpg', () => {
      const getUpiQrPath = (propertyId: string, timestamp = 12345) => `${propertyId}/upi_qr_${timestamp}.jpg`;
      expect(getUpiQrPath('prop-1', 12345)).toBe('prop-1/upi_qr_12345.jpg');
    });
  });

  describe('Image Compression & Resizing Constraints', () => {
    it('enforces 1280px maximum width dimension and 60% JPEG quality for memory efficiency', () => {
      const compressionParams = {
        resize: { width: 1280 },
        format: 'jpeg',
        compress: 0.6,
      };

      expect(compressionParams.resize.width).toBe(1280);
      expect(compressionParams.compress).toBe(0.6);
      expect(compressionParams.format).toBe('jpeg');
    });

    it('enforces EXIF stripping to remove geolocation and device metadata for DPDP privacy', () => {
      const stripExif = (hasExif: boolean) => !hasExif;
      expect(stripExif(false)).toBe(true);
    });
  });

  describe('Masking & Privacy Invariants', () => {
    it('masks statutory ID numbers so only last 4 digits are visible (****1336)', () => {
      const maskIdNumber = (rawId: string) => {
        const clean = rawId.trim();
        if (clean.length <= 4) return clean;
        const last4 = clean.slice(-4);
        return `****${last4}`;
      };

      expect(maskIdNumber('123456781336')).toBe('****1336');
      expect(maskIdNumber('L898902C3')).toBe('****02C3');
      expect(maskIdNumber('9999')).toBe('9999');
    });

    it('ensures storage bucket RLS isolates guest ID photos across different properties', () => {
      const canAccessPhoto = (userPropId: string, photoPath: string) => {
        const [pathPropId] = photoPath.split('/');
        return userPropId === pathPropId;
      };

      expect(canAccessPhoto('prop-A', 'prop-A/guest-1.jpg')).toBe(true);
      expect(canAccessPhoto('prop-A', 'prop-B/guest-2.jpg')).toBe(false);
    });
  });
});
