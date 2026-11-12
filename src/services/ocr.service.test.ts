// src/services/ocr.service.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  isOnDeviceOcrAvailable,
  resolveTextExtractor,
  scanImageForIdDetails,
  TextExtractorModule,
} from './ocr.service';

let mockPlatformOs: string = 'ios';

vi.mock('react-native', () => ({
  Platform: {
    get OS() {
      return mockPlatformOs;
    },
  },
}));

describe('src/services/ocr.service.ts (Expo Go Safe Native Guard & MRZ OCR)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPlatformOs = 'ios';
  });

  it('returns null without throwing when ExpoTextExtractor native module is absent (Expo Go)', async () => {
    expect(() => resolveTextExtractor()).not.toThrow();
    expect(resolveTextExtractor()).toBeNull();
    expect(isOnDeviceOcrAvailable()).toBe(false);

    const outcome = await scanImageForIdDetails('file:///tmp/passport.jpg', 'Passport');
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.reason).toBe('unsupported_runtime');
      expect(outcome.message).toContain('Expo Go');
    }
  });

  it('returns null immediately on web platform', () => {
    mockPlatformOs = 'web';
    const mockMod: TextExtractorModule = {
      isSupported: true,
      extractTextFromImage: vi.fn(),
    };
    expect(resolveTextExtractor(mockMod)).toBeNull();
    expect(isOnDeviceOcrAvailable(mockMod)).toBe(false);
  });

  it('parses passport MRZ lines and strips file:// scheme when native module is linked', async () => {
    const mockExtract = vi.fn().mockResolvedValueOnce([
      'P<INDKUMAR<<AARAV<<<<<<<<<<<<<<<<<<<<<<<<<<<',
      'Z9988776<4IND9405128M3012315<<<<<<<<<<<<<<02',
    ]);
    const mockMod: TextExtractorModule = {
      isSupported: true,
      extractTextFromImage: mockExtract,
    };

    expect(isOnDeviceOcrAvailable(mockMod)).toBe(true);

    const outcome = await scanImageForIdDetails('file:///var/mobile/passport.jpg', 'Passport', mockMod);
    expect(mockExtract).toHaveBeenCalledWith('/var/mobile/passport.jpg');
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.result.idType).toBe('Passport');
      expect(outcome.result.passportNo).toBe('Z9988776');
      expect(outcome.result.fullName).toBe('AARAV KUMAR');
      expect(outcome.result.nationality).toBe('India');
    }
  });

  it('returns error reason when image URI is empty', async () => {
    const outcome = await scanImageForIdDetails('');
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.reason).toBe('error');
    }
  });
});
