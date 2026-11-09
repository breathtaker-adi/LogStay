// src/lib/deeplink.test.ts
// Unit tests for Deep Link & Universal Link Routing (Section 4.32)
import { describe, it, expect, beforeEach } from 'vitest';
import { FakeLinking } from '@/test/fakeLinking';

/**
 * Universal & deep link parser for staff invitation join codes
 */
export function parseJoinDeepLink(urlStr: string): { valid: boolean; code?: string; error?: string } {
  try {
    // Handle custom schemes like logstay://
    let normalized = urlStr.trim();
    if (normalized.startsWith('logstay://')) {
      normalized = normalized.replace('logstay://', 'https://logstay.app/');
    }

    const url = new URL(normalized);
    if (!['logstay.app', 'localhost'].includes(url.hostname)) {
      return { valid: false, error: 'Invalid URL host' };
    }

    const codeParam = url.searchParams.get('code');
    if (!codeParam || !codeParam.trim()) {
      return { valid: false, error: 'Missing join code parameter' };
    }

    const cleaned = decodeURIComponent(codeParam).trim().toUpperCase();
    // Validate against unambiguous invite alphabet: [A-HJ-NP-Z2-9]{6}
    const inviteRegex = /^[A-HJ-NP-Z2-9]{6}$/;
    if (!inviteRegex.test(cleaned)) {
      return { valid: false, error: 'Invalid join code format', code: cleaned };
    }

    return { valid: true, code: cleaned };
  } catch (err: any) {
    return { valid: false, error: err.message || 'Malformed URL' };
  }
}

describe('Deep Link & Universal Link Routing (Section 4.32)', () => {
  let fakeLinking: FakeLinking;

  beforeEach(() => {
    fakeLinking = new FakeLinking();
  });

  describe('URL Parsing & Normalization', () => {
    it('parses valid custom scheme link: logstay://join?code=ABC234', () => {
      const res = parseJoinDeepLink('logstay://join?code=ABC234');
      expect(res.valid).toBe(true);
      expect(res.code).toBe('ABC234');
    });

    it('parses valid universal HTTPS link: https://logstay.app/join?code=ABC234', () => {
      const res = parseJoinDeepLink('https://logstay.app/join?code=ABC234');
      expect(res.valid).toBe(true);
      expect(res.code).toBe('ABC234');
    });

    it('decodes URL-encoded parameters', () => {
      const res = parseJoinDeepLink('https://logstay.app/join?code=%41%42%43%32%33%34');
      expect(res.valid).toBe(true);
      expect(res.code).toBe('ABC234');
    });

    it('normalizes lowercase code to uppercase', () => {
      const res = parseJoinDeepLink('https://logstay.app/join?code=abc234');
      expect(res.valid).toBe(true);
      expect(res.code).toBe('ABC234');
    });

    it('rejects foreign scheme or domain', () => {
      const res = parseJoinDeepLink('whatsapp://join?code=ABC234');
      expect(res.valid).toBe(false);
      expect(res.error).toBe('Invalid URL host');
    });

    it('rejects missing or empty code param', () => {
      expect(parseJoinDeepLink('logstay://join').valid).toBe(false);
      expect(parseJoinDeepLink('logstay://join?code=').valid).toBe(false);
      expect(parseJoinDeepLink('logstay://join?code=   ').valid).toBe(false);
    });

    it('rejects ambiguous characters 0, O, 1, I in code', () => {
      // '1' and 'I' are strictly forbidden in unambiguous invite alphabet
      const resWith1 = parseJoinDeepLink('logstay://join?code=ABC134');
      expect(resWith1.valid).toBe(false);
      expect(resWith1.error).toBe('Invalid join code format');

      const resWithO = parseJoinDeepLink('logstay://join?code=ABCO34');
      expect(resWithO.valid).toBe(false);
    });

    it('rejects code of length != 6', () => {
      expect(parseJoinDeepLink('logstay://join?code=ABC23').valid).toBe(false);
      expect(parseJoinDeepLink('logstay://join?code=ABC2345').valid).toBe(false);
    });
  });

  describe('FakeLinking Event Queue Integration', () => {
    it('retrieves queued initial URL from FakeLinking', async () => {
      fakeLinking.enqueueUrl('https://logstay.app/join?code=XYZ789');
      const initialUrl = await fakeLinking.getInitialURL();
      expect(initialUrl).toBe('https://logstay.app/join?code=XYZ789');

      const parsed = parseJoinDeepLink(initialUrl!);
      expect(parsed.valid).toBe(true);
      expect(parsed.code).toBe('XYZ789');
    });

    it('dispatches URL event to registered listener', () => {
      const receivedUrls: string[] = [];
      const sub = fakeLinking.addEventListener('url', (event) => {
        receivedUrls.push(event.url);
      });

      fakeLinking.enqueueUrl('logstay://join?code=DEF456');
      sub.remove();

      expect(receivedUrls).toEqual(['logstay://join?code=DEF456']);
    });
  });
});
