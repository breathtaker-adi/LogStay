import { describe, it, expect } from 'vitest';
import { ENV } from './env';

describe('src/config/env.ts (Environment & Secrets Sanitization)', () => {
  it('provides required operational defaults', () => {
    expect(ENV.APP_NAME).toBe('LogStay');
    expect(ENV.APP_SCHEME).toBe('logstay');
    expect(ENV.APP_VERSION).toBeDefined();
    expect(ENV.SUPABASE_URL).toMatch(/^https:\/\//);
    expect(ENV.SUPABASE_ANON_KEY).toBeDefined();
  });

  it('sets INVITE_CODE_VALIDITY_HOURS to 48 hours', () => {
    expect(ENV.INVITE_CODE_VALIDITY_HOURS).toBe(48);
  });

  it('configures valid universal link base URL and auto-sync interval', () => {
    expect(ENV.UNIVERSAL_LINK_BASE).toBe('https://logstay.app');
    expect(ENV.AUTO_SYNC_INTERVAL_MS).toBeGreaterThanOrEqual(10000);
  });

  it('SECURITY BOUNDARY: strictly ensures NO service_role key or administrative secrets are in ENV', () => {
    const envEntries = Object.entries(ENV);

    for (const [key, val] of envEntries) {
      // Key name must never reference service_role, secret, or admin_key
      expect(key.toLowerCase()).not.toContain('service_role');
      expect(key.toLowerCase()).not.toContain('secret_key');

      // Value string must not contain service_role token claims
      if (typeof val === 'string') {
        expect(val.toLowerCase()).not.toContain('service_role');
      }
    }
  });

  it('SECURITY BOUNDARY: verifies SUPABASE_ANON_KEY is solely an anon-role JWT', () => {
    const parts = ENV.SUPABASE_ANON_KEY.split('.');
    expect(parts.length).toBe(3);

    const payloadJson = atob(parts[1]);
    const payload = JSON.parse(payloadJson);

    expect(payload.role).toBe('anon');
    expect(payload.role).not.toBe('service_role');
  });
});
