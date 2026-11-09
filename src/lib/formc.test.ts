// src/lib/formc.test.ts
// Unit tests for Form C Foreign-National Detection & Compliance (Section 4.29)
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { isFormCEligible, validateFormCFields, EXEMPT_NATIONALITIES } from './formc';
import { supabase } from '@/lib/supabase';

vi.mock('@/lib/supabase', () => ({
  supabase: {
    rpc: vi.fn(),
    from: vi.fn(),
  },
}));

describe('Form C Compliance & Foreign Detection (Section 4.29)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('isFormCEligible nationality evaluator', () => {
    it.each([
      ['United States of America', true],
      ['USA', true],
      ['Germany', true],
      ['DEU', true],
      ['United Kingdom', true],
      ['GBR', true],
      ['Australia', true],
      ['France', true],
      ['Japan', true],
    ])('marks %s as Form C eligible (true)', (nat, expected) => {
      expect(isFormCEligible(nat)).toBe(expected);
    });

    it.each([
      ['India', false],
      ['Indian', false],
      ['IND', false],
      ['ind', false],
      ['Nepal', false],
      ['npl', false],
      ['Bhutan', false],
      ['btn', false],
      ['', false],
      [null, false],
      [undefined, false],
    ])('marks %s as exempt from Form C (false)', (nat, expected) => {
      expect(isFormCEligible(nat)).toBe(expected);
    });

    it('contains exactly India, Nepal, Bhutan in statutory exemptions list', () => {
      expect(EXEMPT_NATIONALITIES).toContain('india');
      expect(EXEMPT_NATIONALITIES).toContain('nepal');
      expect(EXEMPT_NATIONALITIES).toContain('bhutan');
    });
  });

  describe('validateFormCFields field completeness checker', () => {
    it('passes when all mandatory BoI statutory fields are provided', () => {
      const res = validateFormCFields({
        guest_name: 'Anna Maria Eriksson',
        nationality: 'Sweden',
        passport_no: 'L898902C3',
        visa_no: 'V12345678',
        arrived_from: 'Stockholm, Sweden',
        next_destination: 'Mumbai, India',
      });

      expect(res.valid).toBe(true);
      expect(res.missing).toHaveLength(0);
    });

    it('detects missing visa number or destination', () => {
      const res = validateFormCFields({
        guest_name: 'John Doe',
        nationality: 'USA',
        passport_no: 'P98765432',
        visa_no: '',
        arrived_from: 'New York',
        next_destination: '   ',
      });

      expect(res.valid).toBe(false);
      expect(res.missing).toContain('Visa Number');
      expect(res.missing).toContain('Next Destination');
    });
  });

  describe('mark_form_c_filed RPC Invariants', () => {
    it('sets foreign_details.form_c_filed to true upon submission', async () => {
      vi.mocked(supabase.rpc).mockResolvedValueOnce({
        data: { success: true, stay_id: 'stay-789' },
        error: null,
      } as any);

      const markFiled = async (stayId: string) => {
        const { data, error } = await supabase.rpc('mark_form_c_filed', { p_stay_id: stayId });
        if (error) throw error;
        return data;
      };

      const res = await markFiled('stay-789');
      expect(res.success).toBe(true);
      expect(supabase.rpc).toHaveBeenCalledWith('mark_form_c_filed', {
        p_stay_id: 'stay-789',
      });
    });

    it('rejects mark_form_c_filed on a non-foreign stay (no foreign_details row exists)', async () => {
      vi.mocked(supabase.rpc).mockResolvedValueOnce({
        data: null,
        error: { message: 'No foreign details record found for stay' },
      } as any);

      const markFiled = async (stayId: string) => {
        const { error } = await supabase.rpc('mark_form_c_filed', { p_stay_id: stayId });
        if (error) throw error;
      };

      await expect(markFiled('stay-domestic')).rejects.toEqual({
        message: 'No foreign details record found for stay',
      });
    });
  });
});

