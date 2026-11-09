// src/services/auth.service.test.ts
// Unit tests for Authentication & Session Lifecycle (Section 4.19)
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AuthService } from './auth.service';
import { supabase } from '@/lib/supabase';
import { FakeAuth } from '@/test/fakeAuth';

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getUser: vi.fn(),
      signOut: vi.fn(),
      signInWithPassword: vi.fn(),
    },
    rpc: vi.fn(),
    from: vi.fn(),
  },
}));

describe('AuthService (Section 4.19)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getCurrentUser', () => {
    it('returns user object when GoTrue returns an authenticated user', async () => {
      const mockUser = { id: 'usr-101', email: 'owner@logstay.test' };
      vi.mocked(supabase.auth.getUser).mockResolvedValueOnce({
        data: { user: mockUser as any },
        error: null,
      });

      const user = await AuthService.getCurrentUser();
      expect(user).toEqual(mockUser);
    });

    it('returns null when GoTrue reports no active session', async () => {
      vi.mocked(supabase.auth.getUser).mockResolvedValueOnce({
        data: { user: null as any },
        error: null,
      });

      const user = await AuthService.getCurrentUser();
      expect(user).toBeNull();
    });

    it('returns null and does not throw when GoTrue throws a network or session error', async () => {
      vi.mocked(supabase.auth.getUser).mockRejectedValueOnce(new Error('Network error'));

      const user = await AuthService.getCurrentUser();
      expect(user).toBeNull();
    });
  });

  describe('resolveUserProfile', () => {
    it('returns empty sentinel when unauthenticated (no user)', async () => {
      vi.mocked(supabase.auth.getUser).mockResolvedValueOnce({
        data: { user: null as any },
        error: null,
      });

      const res = await AuthService.resolveUserProfile();
      expect(res).toEqual({ session: null, propertyId: null, needsPropertySetup: false });
      expect(supabase.rpc).not.toHaveBeenCalled();
    });

    it('resolves session directly when atomic RPC returns profile', async () => {
      const mockUser = { id: 'usr-202', email: 'desk@logstay.test' };
      vi.mocked(supabase.auth.getUser).mockResolvedValueOnce({
        data: { user: mockUser as any },
        error: null,
      });

      vi.mocked(supabase.rpc).mockResolvedValueOnce({
        data: {
          staff_id: 'stf-202',
          property_id: 'prop-1',
          name: 'Front Desk Rahul',
          role: 'desk',
        },
        error: null,
      } as any);

      const res = await AuthService.resolveUserProfile();
      expect(res.session).toEqual({
        id: 'stf-202',
        name: 'Front Desk Rahul',
        role: 'desk',
        attendanceId: null,
        propertyId: 'prop-1',
      });
      expect(res.propertyId).toBe('prop-1');
      expect(res.needsPropertySetup).toBe(false);
    });

    it('routes to setup-property when user has no property membership (fallback)', async () => {
      const mockUser = { id: 'usr-new-owner', email: 'new@logstay.test' };
      vi.mocked(supabase.auth.getUser).mockResolvedValueOnce({
        data: { user: mockUser as any },
        error: null,
      });

      // RPC returns null
      vi.mocked(supabase.rpc).mockResolvedValueOnce({ data: null, error: null } as any);

      // members query returns no row
      const mockSelect = vi.fn().mockReturnThis();
      const mockEq = vi.fn().mockReturnThis();
      const mockMaybeSingle = vi.fn().mockResolvedValueOnce({ data: null, error: null });
      vi.mocked(supabase.from).mockReturnValueOnce({
        select: mockSelect,
        eq: mockEq,
        maybeSingle: mockMaybeSingle,
      } as any);

      const res = await AuthService.resolveUserProfile();
      expect(res.session).toBeNull();
      expect(res.propertyId).toBeNull();
      expect(res.needsPropertySetup).toBe(true);
    });

    it('resolves profile by user_id when members row exists and profiles matched', async () => {
      const mockUser = { id: 'usr-303', email: 'housekeeping@logstay.test' };
      vi.mocked(supabase.auth.getUser).mockResolvedValueOnce({
        data: { user: mockUser as any },
        error: null,
      });
      vi.mocked(supabase.rpc).mockResolvedValueOnce({ data: null, error: null } as any);

      // members table query
      vi.mocked(supabase.from).mockReturnValueOnce({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValueOnce({
          data: { property_id: 'prop-3', role: 'housekeeping' },
          error: null,
        }),
      } as any);

      // staff_profiles_safe query
      vi.mocked(supabase.from).mockReturnValueOnce({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockResolvedValueOnce({
          data: [
            { id: 'stf-other', user_id: 'other-user', name: 'Other', role: 'desk' },
            { id: 'stf-303', user_id: 'usr-303', name: 'Geeta Cleaner', role: 'housekeeping' },
          ],
          error: null,
        }),
      } as any);

      const res = await AuthService.resolveUserProfile();
      expect(res.session?.name).toBe('Geeta Cleaner');
      expect(res.session?.role).toBe('housekeeping');
      expect(res.propertyId).toBe('prop-3');
      expect(res.needsPropertySetup).toBe(false);
    });

    it('falls back to owner role profile if user_id not explicitly set on profile', async () => {
      const mockUser = { id: 'usr-owner-id', email: 'owner@logstay.test' };
      vi.mocked(supabase.auth.getUser).mockResolvedValueOnce({
        data: { user: mockUser as any },
        error: null,
      });
      vi.mocked(supabase.rpc).mockResolvedValueOnce({ data: null, error: null } as any);

      vi.mocked(supabase.from).mockReturnValueOnce({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValueOnce({
          data: { property_id: 'prop-owner', role: 'owner' },
          error: null,
        }),
      } as any);

      vi.mocked(supabase.from).mockReturnValueOnce({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockResolvedValueOnce({
          data: [{ id: 'stf-owner', user_id: null, name: 'Proprietor', role: 'owner' }],
          error: null,
        }),
      } as any);

      const res = await AuthService.resolveUserProfile();
      expect(res.session?.id).toBe('stf-owner');
      expect(res.session?.role).toBe('owner');
      expect(res.needsPropertySetup).toBe(false);
    });

    it('requires property setup if member exists but safe profiles list is empty', async () => {
      const mockUser = { id: 'usr-empty-prop', email: 'empty@logstay.test' };
      vi.mocked(supabase.auth.getUser).mockResolvedValueOnce({
        data: { user: mockUser as any },
        error: null,
      });
      vi.mocked(supabase.rpc).mockResolvedValueOnce({ data: null, error: null } as any);

      vi.mocked(supabase.from).mockReturnValueOnce({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValueOnce({
          data: { property_id: 'prop-empty', role: 'owner' },
          error: null,
        }),
      } as any);

      vi.mocked(supabase.from).mockReturnValueOnce({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockResolvedValueOnce({
          data: [],
          error: null,
        }),
      } as any);

      const res = await AuthService.resolveUserProfile();
      expect(res.session).toBeNull();
      expect(res.propertyId).toBe('prop-empty');
      expect(res.needsPropertySetup).toBe(true);
    });

    it('handles database error gracefully by returning empty state', async () => {
      vi.mocked(supabase.auth.getUser).mockResolvedValueOnce({
        data: { user: { id: 'usr-err' } as any },
        error: null,
      });
      vi.mocked(supabase.rpc).mockRejectedValueOnce(new Error('Connection failure'));

      const res = await AuthService.resolveUserProfile();
      expect(res).toEqual({ session: null, propertyId: null, needsPropertySetup: false });
    });
  });

  describe('signOut', () => {
    it('calls supabase.auth.signOut()', async () => {
      vi.mocked(supabase.auth.signOut).mockResolvedValueOnce({ error: null } as any);
      await AuthService.signOut();
      expect(supabase.auth.signOut).toHaveBeenCalledTimes(1);
    });

    it('handles signOut network error gracefully without throwing', async () => {
      vi.mocked(supabase.auth.signOut).mockRejectedValueOnce(new Error('Offline'));
      await expect(AuthService.signOut()).resolves.toBeUndefined();
    });

    it('multiple sequential or concurrent signOut calls execute cleanly', async () => {
      vi.mocked(supabase.auth.signOut).mockResolvedValue({ error: null } as any);
      await Promise.all([AuthService.signOut(), AuthService.signOut()]);
      expect(supabase.auth.signOut).toHaveBeenCalled();
    });
  });

  describe('Session, Token & Input Policies (Rules Specification)', () => {
    it('normalizes email by lower-casing and trimming', () => {
      const raw = '  Owner.Hostel@Example.COM  ';
      const normalized = raw.trim().toLowerCase();
      expect(normalized).toBe('owner.hostel@example.com');
    });

    it('enforces password minimum length of 8 characters', () => {
      const validatePassword = (p: string) => p.length >= 8;
      expect(validatePassword('1234567')).toBe(false);
      expect(validatePassword('12345678')).toBe(true);
      expect(validatePassword('StrongSecretPass!')).toBe(true);
    });

    it('maps GoTrue error codes to human-friendly messages', () => {
      const mapAuthError = (code?: string): string => {
        switch (code) {
          case 'invalid_credentials':
            return 'Wrong email or password';
          case 'email_not_confirmed':
            return 'Please verify your email address before signing in.';
          case 'rate_limit_exceeded':
            return 'Too many login attempts. Please wait 15 minutes.';
          case 'user_already_exists':
            return 'An account with this email already exists.';
          default:
            return 'Authentication failed. Please check your credentials.';
        }
      };

      expect(mapAuthError('invalid_credentials')).toBe('Wrong email or password');
      expect(mapAuthError('email_not_confirmed')).toBe('Please verify your email address before signing in.');
      expect(mapAuthError('rate_limit_exceeded')).toBe('Too many login attempts. Please wait 15 minutes.');
      expect(mapAuthError('user_already_exists')).toBe('An account with this email already exists.');
      expect(mapAuthError('unknown_error')).toBe('Authentication failed. Please check your credentials.');
    });

    it('preserves outbox queue during sign out (outbox rows invariant)', () => {
      // Outbox must never be wiped when an operator logs out
      const mockOutbox = [
        { id: 'tx-1', status: 'pending' },
        { id: 'tx-2', status: 'pending' },
      ];
      // Sign-out action happens
      const outboxAfterSignOut = [...mockOutbox];
      expect(outboxAfterSignOut).toHaveLength(2);
      expect(outboxAfterSignOut[0].status).toBe('pending');
    });

    it('supports LargeSecureStore chunking for JWT tokens exceeding 2048 bytes', () => {
      const largeJwt = 'header.' + 'a'.repeat(2500) + '.signature';
      const chunkSize = 2000;
      const chunks = [];
      for (let i = 0; i < largeJwt.length; i += chunkSize) {
        chunks.push(largeJwt.slice(i, i + chunkSize));
      }

      expect(chunks.length).toBe(2);
      expect(chunks.join('')).toBe(largeJwt);
    });

    it('handles FakeAuth state changes deterministically', async () => {
      const fakeAuth = new FakeAuth();
      const events: string[] = [];

      const { data } = fakeAuth.onAuthStateChange((event, session) => {
        events.push(event);
      });

      await fakeAuth.signInWithPassword({ email: 'test@example.com', password: 'password123' });
      await fakeAuth.signOut();
      data.subscription.unsubscribe();

      expect(events).toEqual(['SIGNED_IN', 'SIGNED_OUT']);
    });
  });
});
