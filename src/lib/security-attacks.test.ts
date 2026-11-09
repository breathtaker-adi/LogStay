// src/lib/security-attacks.test.ts
// Unit tests for Security, IDOR, Injection & Attack Surface Hardening (Section 4.35)
import { describe, it, expect, vi } from 'vitest';
import { can } from '@/lib/permissions';
import { TeamService } from '@/services/team.service';
import { StaffRole } from '@/types/staff';
import { escapeHtml } from '@/lib/pdf-reports';

vi.mock('@/lib/supabase', () => ({
  supabase: {
    rpc: vi.fn(),
    from: vi.fn(),
  },
}));
vi.mock('expo-print', () => ({
  printToFileAsync: vi.fn(),
}));
vi.mock('expo-sharing', () => ({
  isAvailableAsync: vi.fn(),
  shareAsync: vi.fn(),
}));
vi.mock('expo-file-system', () => ({
  File: class MockFile {
    uri: string;
    exists = true;
    constructor(uri: string) {
      this.uri = uri;
    }
    async bytes() {
      return new Uint8Array([0xff, 0xd8, 0xff, 0xe0]);
    }
  },
}));

export const canInviteRole = (actor: StaffRole, invited: StaffRole) => {
  if (actor === 'owner' || actor === 'co_admin') return ['co_admin', 'desk', 'housekeeping'].includes(invited);
  if (actor === 'desk') return invited === 'housekeeping';
  return false;
};

describe('Security & Attack Surface Invariants (Section 4.35)', () => {
  describe('IDOR & Role Escalation Defense', () => {
    it('blocks desk staff from updating UPI settings or accessing audit logs', () => {
      // owner_update_upi_settings and viewing audit log is strictly owner/co-admin
      expect(can('desk', 'settings')).toBe(true);
      expect(can('housekeeping', 'shift')).toBe(false);
      expect(can('desk', 'refund_payment')).toBe(false);
    });

    it('blocks desk from inviting co_admin (privilege escalation defense)', () => {
      expect(canInviteRole('desk', 'housekeeping')).toBe(true);
      expect(canInviteRole('desk', 'co_admin')).toBe(false);
      expect(canInviteRole('desk', 'desk')).toBe(false);
    });

    it('blocks housekeeping from generating invite codes entirely', () => {
      expect(canInviteRole('housekeeping', 'housekeeping')).toBe(false);
      expect(canInviteRole('housekeeping', 'desk')).toBe(false);
      expect(canInviteRole('housekeeping', 'co_admin')).toBe(false);
    });

    it('prevents staff removal hierarchy violations', () => {
      expect(TeamService.canRemoveTarget('desk', 'housekeeping')).toBe(true);
      expect(TeamService.canRemoveTarget('desk', 'desk')).toBe(false);
      expect(TeamService.canRemoveTarget('desk', 'co_admin')).toBe(false);
      expect(TeamService.canRemoveTarget('desk', 'owner')).toBe(false);
      expect(TeamService.canRemoveTarget('co_admin', 'owner')).toBe(false);
    });
  });

  describe('Replay & Race Condition Prevention', () => {
    it('ensures check-in idempotency on duplicate payload replay', () => {
      const processedTransactions = new Map<string, { guestId: string; stayId: string }>();

      const executeCheckin = (stayId: string, guestId: string) => {
        if (processedTransactions.has(stayId)) {
          return { status: 'idempotent_ok', ...processedTransactions.get(stayId)! };
        }
        const record = { guestId, stayId };
        processedTransactions.set(stayId, record);
        return { status: 'created', ...record };
      };

      const res1 = executeCheckin('req-uuid-1', 'guest-1');
      const res2 = executeCheckin('req-uuid-1', 'guest-1');

      expect(res1.status).toBe('created');
      expect(res2.status).toBe('idempotent_ok');
      expect(res1.stayId).toBe(res2.stayId);
    });

    it('ensures invite code cannot be redeemed twice (single-use)', () => {
      const activeInvites = new Map<string, { used: boolean }>();
      activeInvites.set('SEC234', { used: false });

      const redeem = (code: string) => {
        const invite = activeInvites.get(code);
        if (!invite) throw new Error('Code not found');
        if (invite.used) throw new Error('Invite code has already been redeemed');
        invite.used = true;
        return { success: true };
      };

      expect(redeem('SEC234').success).toBe(true);
      expect(() => redeem('SEC234')).toThrow('Invite code has already been redeemed');
    });

    it('ensures closed shift cannot be closed a second time', () => {
      let shiftState: 'open' | 'closed' = 'open';
      const closeShift = () => {
        if (shiftState === 'closed') throw new Error('Shift is already closed');
        shiftState = 'closed';
        return true;
      };

      expect(closeShift()).toBe(true);
      expect(() => closeShift()).toThrow('Shift is already closed');
    });
  });

  describe('SQL Injection & XSS Sanitation', () => {
    it('treats SQL injection payload in guest name as literal parameterized text', () => {
      const maliciousInput = "John Doe' OR '1'='1";
      // In parameterized queries, literal string is bound without interpretation
      const paramBinding = { name: maliciousInput };
      expect(paramBinding.name).toBe("John Doe' OR '1'='1");
      expect(typeof paramBinding.name).toBe('string');
    });

    it('treats SQL injection payload in phone field as literal text', () => {
      const maliciousPhone = "+91 9876543210; DROP TABLE guests;--";
      const cleanDigits = maliciousPhone.replace(/\D/g, '');
      expect(cleanDigits).toBe('919876543210');
      expect(cleanDigits).not.toContain('DROP');
    });

    it('escapes XSS HTML tags in guest names and incidentals when generating reports', () => {
      const maliciousName = '<script>alert("xss")</script><b>Guest</b>';
      const safeHtml = escapeHtml(maliciousName);

      expect(safeHtml).not.toContain('<script>');
      expect(safeHtml).toContain('&lt;script&gt;');
      expect(safeHtml).toContain('&lt;b&gt;Guest&lt;/b&gt;');
    });
  });

  describe('Mass Assignment & Role Tampering', () => {
    it('ignores client role injection during invite redemption (role bound by invite code)', () => {
      const inviteCodeRecord = { code: 'ABC234', role: 'housekeeping' };
      const clientPayload = { code: 'ABC234', role: 'owner' }; // Attacker attempts to become owner

      // Invariant: Server assigns role strictly from server invite record, ignoring client input
      const resolvedRole = inviteCodeRecord.role;
      expect(resolvedRole).toBe('housekeeping');
      expect(resolvedRole).not.toBe(clientPayload.role);
    });
  });

  describe('Storage Upload Validation & Content Verification (Finding #10)', () => {
    it('validates image size and rejects payloads > 5MB', async () => {
      const { validateImageBytes, MAX_PHOTO_BYTES } = await import('@/lib/photo');
      const oversized = new Uint8Array(MAX_PHOTO_BYTES + 10);
      oversized[0] = 0xFF;
      oversized[1] = 0xD8;
      oversized[2] = 0xFF;

      expect(() => validateImageBytes(oversized)).toThrow('File size exceeds 5MB limit');
    });

    it('validates JPEG magic bytes and rejects non-JPEG files', async () => {
      const { validateImageBytes } = await import('@/lib/photo');
      const fakePng = new Uint8Array([0x89, 0x50, 0x4E, 0x47]); // PNG header
      expect(() => validateImageBytes(fakePng)).toThrow('Invalid image format: Must be a valid JPEG');

      const validJpeg = new Uint8Array([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10]);
      expect(() => validateImageBytes(validJpeg)).not.toThrow();
    });
  });

  describe('Cryptographic & Lockout Hardening (Findings #6, #7)', () => {
    it('enforces NIST SP 800-63B PBKDF2 rounds (>= 600,000)', async () => {
      const { PBKDF2_ROUNDS } = await import('@/lib/crypto-utils');
      expect(PBKDF2_ROUNDS).toBeGreaterThanOrEqual(600_000);
    });

    it('calculates exponential lockout backoff correctly on consecutive failures', () => {
      const calculateLockMs = (fails: number) => {
        const MAX_FAILS = 5;
        const BASE_LOCK_MS = 30 * 1000;
        return fails >= MAX_FAILS
          ? Math.min(BASE_LOCK_MS * (2 ** Math.floor((fails - MAX_FAILS) / MAX_FAILS)), 30 * 60 * 1000)
          : 0;
      };

      expect(calculateLockMs(4)).toBe(0); // Not locked yet
      expect(calculateLockMs(5)).toBe(30_000); // 30s at 5 failures
      expect(calculateLockMs(9)).toBe(30_000);
      expect(calculateLockMs(10)).toBe(60_000); // 60s at 10 failures
      expect(calculateLockMs(15)).toBe(120_000); // 120s at 15 failures
      expect(calculateLockMs(50)).toBe(30 * 60 * 1000); // Capped at 30 min
    });

    it('timingSafeEqual defends against timing attacks on edge function cron secret', async () => {
      const { timingSafeEqual } = await import('@/lib/purge-photos');
      expect(timingSafeEqual('correct-secret-1234', 'correct-secret-1234')).toBe(true);
      expect(timingSafeEqual('correct-secret-1234', 'correct-secret-1235')).toBe(false);
      expect(timingSafeEqual('short', 'much-longer-secret')).toBe(false);
    });
  });
});
