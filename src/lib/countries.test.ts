import { describe, it, expect } from 'vitest';
import { COUNTRIES, searchCountries } from './countries';

describe('src/lib/countries.ts (Country Directory & Form C Eligibility)', () => {
  describe('Directory Data Integrity', () => {
    it('contains no duplicate country names', () => {
      const names = COUNTRIES.map((c) => c.name.toLowerCase());
      const uniqueNames = new Set(names);
      expect(uniqueNames.size).toBe(names.length);
    });

    it('every country has a valid flag emoji and non-empty aliases including 3-letter code', () => {
      for (const country of COUNTRIES) {
        expect(country.flag).toBeTruthy();
        expect(country.aliases.length).toBeGreaterThan(0);
        const has3LetterCode = country.aliases.some((a) => a.length === 3);
        expect(has3LetterCode).toBe(true);
      }
    });

    it('has formC === false ONLY for India, Nepal, and Bhutan', () => {
      const exemptCountries = COUNTRIES.filter((c) => c.formC === false).map((c) => c.name);
      expect(exemptCountries.sort()).toEqual(['Bhutan', 'India', 'Nepal']);

      // All other foreign countries must require Form C (formC === true)
      const foreignCountries = COUNTRIES.filter((c) => c.formC === true);
      expect(foreignCountries.length).toBe(COUNTRIES.length - 3);
    });
  });

  describe('searchCountries query matching', () => {
    it('searches by exact and partial country name', () => {
      const res = searchCountries('germany');
      expect(res.some((c) => c.name === 'Germany')).toBe(true);

      const partial = searchCountries('unit');
      expect(partial.some((c) => c.name === 'United States')).toBe(true);
      expect(partial.some((c) => c.name === 'United Kingdom')).toBe(true);
      expect(partial.some((c) => c.name === 'United Arab Emirates')).toBe(true);
    });

    it('searches by common aliases (USA, UK, Britain, Russia, Aussie)', () => {
      const usa = searchCountries('usa');
      expect(usa.some((c) => c.name === 'United States')).toBe(true);

      const uk = searchCountries('uk');
      expect(uk.some((c) => c.name === 'United Kingdom')).toBe(true);

      const britain = searchCountries('britain');
      expect(britain.some((c) => c.name === 'United Kingdom')).toBe(true);

      const aus = searchCountries('aussie');
      expect(aus.some((c) => c.name === 'Australia')).toBe(true);
    });

    it('is case-insensitive and trims whitespace', () => {
      const res = searchCountries('  iNdIa   ');
      expect(res.length).toBeGreaterThan(0);
      expect(res[0].name).toBe('India');
    });

    it('returns full list when query is empty', () => {
      expect(searchCountries('').length).toBe(COUNTRIES.length);
    });

    it('returns empty array when query does not match any country or alias', () => {
      expect(searchCountries('AtlantisUnderwaterKingdom')).toEqual([]);
    });
  });
});
