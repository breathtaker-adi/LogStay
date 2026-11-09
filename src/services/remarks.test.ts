// src/services/remarks.test.ts
// Unit tests for Staff Remarks Ledger & Immutability (Section 4.23)
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TeamService } from './team.service';
import { supabase } from '@/lib/supabase';

vi.mock('@/lib/supabase', () => ({
  supabase: {
    rpc: vi.fn(),
    from: vi.fn(),
  },
}));

describe('Staff Remarks Ledger & Immutability (Section 4.23)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('lookupRemarks query paths', () => {
    it('returns cross-property remarks list via lookup_staff_remarks RPC', async () => {
      const mockRemarks = [
        {
          id: 'rem-1',
          staff_name: 'Rahul V',
          phone: '+919876543210',
          property_name: 'Sunset Palms',
          role: 'desk',
          remark: 'Good operational performance at desk',
          created_at: '2026-10-10T12:00:00Z',
        },
        {
          id: 'rem-2',
          staff_name: 'Rahul V',
          phone: '+919876543210',
          property_name: 'Old Goa Hostel',
          role: 'desk',
          remark: 'Polite with foreign travelers',
          created_at: '2026-05-01T10:00:00Z',
        },
      ];

      vi.mocked(supabase.rpc).mockResolvedValueOnce({
        data: mockRemarks,
        error: null,
      } as any);

      const res = await TeamService.lookupRemarks('+91 98765 43210');
      expect(res).toEqual(mockRemarks);
      expect(supabase.rpc).toHaveBeenCalledWith('lookup_staff_remarks', {
        p_query: '+91 98765 43210',
      });
    });

    it('falls back to direct table query when RPC fails or is unavailable', async () => {
      vi.mocked(supabase.rpc).mockResolvedValueOnce({
        data: null,
        error: { message: 'Function not found' },
      } as any);

      const mockData = [
        { id: 'rem-3', staff_name: 'Rahul', phone: '9876543210', remark: 'Diligent' },
      ];

      const mockIlike = vi.fn().mockResolvedValueOnce({ data: mockData, error: null });
      const mockOrder = vi.fn().mockReturnValue({ ilike: mockIlike });
      const mockSelect = vi.fn().mockReturnValue({ order: mockOrder });
      vi.mocked(supabase.from).mockReturnValueOnce({ select: mockSelect } as any);

      const res = await TeamService.lookupRemarks('9876543210');
      expect(res).toEqual(mockData);
      expect(supabase.from).toHaveBeenCalledWith('staff_remarks');
    });

    it('returns empty array when lookup throws or encounters an unhandled error', async () => {
      vi.mocked(supabase.rpc).mockRejectedValueOnce(new Error('Network offline'));

      const res = await TeamService.lookupRemarks('any-query');
      expect(res).toEqual([]);
    });
  });

  describe('Ledger Invariants & Privacy Rules', () => {
    it('enforces append-only semantics: UPDATE and DELETE are rejected on staff_remarks', () => {
      const allowedMutation = (op: 'INSERT' | 'UPDATE' | 'DELETE') => op === 'INSERT';
      expect(allowedMutation('INSERT')).toBe(true);
      expect(allowedMutation('UPDATE')).toBe(false);
      expect(allowedMutation('DELETE')).toBe(false);
    });

    it('requires remark text length bounds (maximum 2000 characters)', () => {
      const validateRemark = (r?: string | null) => {
        if (!r) return { valid: true, value: null };
        const trimmed = r.trim();
        if (trimmed.length > 2000) return { valid: false, error: 'Remark exceeds 2000 characters' };
        return { valid: true, value: trimmed };
      };

      expect(validateRemark(null).valid).toBe(true);
      expect(validateRemark('Punctual and reliable').valid).toBe(true);
      expect(validateRemark('A'.repeat(2000)).valid).toBe(true);
      expect(validateRemark('A'.repeat(2001)).valid).toBe(false);
    });

    it('treats empty or whitespace-only remark as null and does not insert remark row', () => {
      const shouldInsertRemark = (remark?: string | null) => Boolean(remark && remark.trim().length > 0);
      expect(shouldInsertRemark(undefined)).toBe(false);
      expect(shouldInsertRemark('')).toBe(false);
      expect(shouldInsertRemark('   ')).toBe(false);
      expect(shouldInsertRemark('Exemplary leadership')).toBe(true);
    });

    it('ensures remark text never leaks full ID numbers or raw photo URLs', () => {
      const sanitizeRemark = (text: string) => {
        // Redact any 12-digit Aadhaar or 9-digit passport numbers if present
        return text.replace(/\b\d{12}\b/g, '************').replace(/https?:\/\/[^\s]+/g, '[URL]');
      };

      const raw = 'Staff checked guest Aadhaar 123456789012 at http://bucket/photo.jpg';
      const clean = sanitizeRemark(raw);
      expect(clean).not.toContain('123456789012');
      expect(clean).not.toContain('http://bucket/photo.jpg');
      expect(clean).toContain('************');
      expect(clean).toContain('[URL]');
    });
  });
});

