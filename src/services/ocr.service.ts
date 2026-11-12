// src/services/ocr.service.ts
// On-device Optical Character Recognition service powered by expo-text-extractor
// (Apple Vision on iOS, Google ML Kit on Android). Loaded lazily so Expo Go, web,
// and Vitest test runners never throw at import time.

import { Platform } from 'react-native';
import { IdOcrResult, parseIdScanLines } from '@/lib/id-ocr';

export interface TextExtractorModule {
  isSupported?: boolean;
  extractTextFromImage: (uri: string) => Promise<string[]>;
}

export type OcrScanOutcome =
  | {
      ok: true;
      result: IdOcrResult;
      lines: string[];
    }
  | {
      ok: false;
      reason: 'unsupported_runtime' | 'no_text_found' | 'error';
      message: string;
    };

export function resolveTextExtractor(
  overrideModule?: TextExtractorModule | null
): TextExtractorModule | null {
  if (Platform.OS === 'web') return null;

  if (overrideModule !== undefined) {
    if (!overrideModule || typeof overrideModule.extractTextFromImage !== 'function') {
      return null;
    }
    return {
      isSupported: overrideModule.isSupported,
      extractTextFromImage: async (uri: string) => {
        const cleanUri = uri.replace(/^file:\/\//, '');
        return overrideModule.extractTextFromImage(cleanUri);
      },
    };
  }

  try {
    // Probe native module availability silently via requireOptionalNativeModule BEFORE
    // requiring 'expo-text-extractor' (whose top-level calls requireNativeModule and
    // triggers a LogBox RedBox error inside Expo Go when native OCR isn't linked).
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const expoCore = require('expo-modules-core') as {
      requireOptionalNativeModule?: <T = unknown>(name: string) => T | null;
    };
    const nativeMod =
      typeof expoCore?.requireOptionalNativeModule === 'function'
        ? expoCore.requireOptionalNativeModule<TextExtractorModule>('ExpoTextExtractor')
        : null;

    if (!nativeMod || typeof nativeMod.extractTextFromImage !== 'function') {
      return null;
    }

    return {
      isSupported: nativeMod.isSupported,
      extractTextFromImage: async (uri: string) => {
        const cleanUri = uri.replace(/^file:\/\//, '');
        return nativeMod.extractTextFromImage(cleanUri);
      },
    };
  } catch {
    return null;
  }
}

export function isOnDeviceOcrAvailable(overrideModule?: TextExtractorModule | null): boolean {
  const mod = resolveTextExtractor(overrideModule);
  if (!mod) return false;
  return mod.isSupported !== false;
}

/**
 * Extracts raw text lines on-device and parses them into check-in fields.
 * Processing stays 100% local on the phone (no PII leaves the device).
 */
export async function scanImageForIdDetails(
  imageUri: string,
  preferredDocType?: string,
  overrideModule?: TextExtractorModule | null
): Promise<OcrScanOutcome> {
  if (!imageUri) {
    return {
      ok: false,
      reason: 'error',
      message: 'No image URI was provided for OCR.',
    };
  }

  const extractor = resolveTextExtractor(overrideModule);
  if (!extractor || extractor.isSupported === false) {
    return {
      ok: false,
      reason: 'unsupported_runtime',
      message:
        'Camera OCR requires a custom development or production app build (not Expo Go). You can still capture the ID photo and paste or enter passport details manually.',
    };
  }

  try {
    const lines = await extractor.extractTextFromImage(imageUri);
    if (!Array.isArray(lines) || lines.length === 0) {
      return {
        ok: false,
        reason: 'no_text_found',
        message: 'No readable text was found in this photo. Try steady lighting with the full ID inside the frame.',
      };
    }

    const result = parseIdScanLines(lines, preferredDocType);
    if (!result.detected) {
      return {
        ok: false,
        reason: 'no_text_found',
        message:
          'Text was read, but no clear ID or Passport MRZ pattern matched. Try zooming closer to the bottom two MRZ lines or ID number.',
      };
    }

    return {
      ok: true,
      result,
      lines,
    };
  } catch (err: any) {
    return {
      ok: false,
      reason: 'error',
      message: err?.message || 'Unable to process text recognition on this image.',
    };
  }
}

