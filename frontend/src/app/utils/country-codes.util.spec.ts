import {
  countryNameFromCode,
  countryDisplayLabel,
  countryNamesFromCodes,
  normalizeCountryFilterOptions,
  matchesCountryFilter,
  countriesMatch
} from './country-codes.util';

describe('country-codes.util', () => {
  describe('countryNameFromCode', () => {
    it('should return null for null/undefined input', () => {
      expect(countryNameFromCode(null)).toBeNull();
      expect(countryNameFromCode(undefined)).toBeNull();
      expect(countryNameFromCode('')).toBeNull();
    });

    it('should return country name for valid ISO code', () => {
      expect(countryNameFromCode('CI')).toBe("Côte d'Ivoire");
      expect(countryNameFromCode('SN')).toBe('Sénégal');
      expect(countryNameFromCode('CM')).toBe('Cameroun');
      expect(countryNameFromCode('BF')).toBe('Burkina Faso');
    });

    it('should be case insensitive', () => {
      expect(countryNameFromCode('ci')).toBe("Côte d'Ivoire");
      expect(countryNameFromCode('sn')).toBe('Sénégal');
      expect(countryNameFromCode('Cm')).toBe('Cameroun');
    });

    it('should handle alias CITCH', () => {
      expect(countryNameFromCode('CITCH')).toBe("Côte d'Ivoire");
      expect(countryNameFromCode('citch')).toBe("Côte d'Ivoire");
    });

    it('should return null for unknown code', () => {
      expect(countryNameFromCode('XX')).toBeNull();
      expect(countryNameFromCode('ZZ')).toBeNull();
    });
  });

  describe('countryDisplayLabel', () => {
    it('should return empty string for null/undefined', () => {
      expect(countryDisplayLabel(null)).toBe('');
      expect(countryDisplayLabel(undefined)).toBe('');
      expect(countryDisplayLabel('')).toBe('');
    });

    it('should return full country name for ISO code', () => {
      expect(countryDisplayLabel('CI')).toBe("Côte d'Ivoire");
      expect(countryDisplayLabel('SN')).toBe('Sénégal');
    });

    it('should return alias name for CITCH', () => {
      expect(countryDisplayLabel('CITCH')).toBe("Côte d'Ivoire");
    });

    it('should return original value for unknown code', () => {
      expect(countryDisplayLabel('XX')).toBe('XX');
      expect(countryDisplayLabel('Unknown')).toBe('Unknown');
    });

    it('should trim whitespace', () => {
      expect(countryDisplayLabel('  CI  ')).toBe("Côte d'Ivoire");
    });
  });

  describe('countryNamesFromCodes', () => {
    it('should return empty array for null/undefined/empty', () => {
      expect(countryNamesFromCodes(null)).toEqual([]);
      expect(countryNamesFromCodes(undefined)).toEqual([]);
      expect(countryNamesFromCodes([])).toEqual([]);
    });

    it('should return unique country names', () => {
      const codes = ['CI', 'SN', 'CI', 'BF'];
      const result = countryNamesFromCodes(codes);
      expect(result).toHaveLength(3);
      expect(result).toContain("Côte d'Ivoire");
      expect(result).toContain('Sénégal');
      expect(result).toContain('Burkina Faso');
    });

    it('should skip unknown codes', () => {
      const codes = ['CI', 'XX', 'SN'];
      const result = countryNamesFromCodes(codes);
      expect(result).toHaveLength(2);
      expect(result).not.toContain('XX');
    });
  });

  describe('normalizeCountryFilterOptions', () => {
    it('should return sorted unique labels', () => {
      const countries = ['SN', 'CI', 'CI', 'BF', 'ML'];
      const result = normalizeCountryFilterOptions(countries);
      expect(result).toEqual([
        'Burkina Faso',
        "Côte d'Ivoire",
        'Mali',
        'Sénégal'
      ]);
    });

    it('should handle mixed codes and names', () => {
      const countries = ['CI', "Côte d'Ivoire", 'SN', 'Sénégal'];
      const result = normalizeCountryFilterOptions(countries);
      expect(result).toHaveLength(2);
    });

    it('should handle CITCH alias', () => {
      const countries = ['CITCH', 'CI'];
      const result = normalizeCountryFilterOptions(countries);
      expect(result).toHaveLength(1);
      expect(result[0]).toBe("Côte d'Ivoire");
    });

    it('should filter out null/undefined', () => {
      const countries = ['CI', null, 'SN', undefined, 'BF'];
      const result = normalizeCountryFilterOptions(countries);
      expect(result).toHaveLength(3);
    });
  });

  describe('matchesCountryFilter', () => {
    it('should return true when no filter selected', () => {
      expect(matchesCountryFilter('CI', null)).toBe(true);
      expect(matchesCountryFilter('CI', undefined)).toBe(true);
      expect(matchesCountryFilter('CI', [])).toBe(true);
    });

    it('should return true when row country matches filter', () => {
      expect(matchesCountryFilter('CI', ['CI'])).toBe(true);
      expect(matchesCountryFilter('SN', ['SN', 'BF'])).toBe(true);
      expect(matchesCountryFilter("Côte d'Ivoire", ["Côte d'Ivoire"])).toBe(true);
    });

    it('should return false when row country does not match filter', () => {
      expect(matchesCountryFilter('CI', ['SN'])).toBe(false);
      expect(matchesCountryFilter('SN', ['BF'])).toBe(false);
    });

    it('should handle CITCH alias in filter', () => {
      expect(matchesCountryFilter('CI', ['CITCH'])).toBe(true);
      expect(matchesCountryFilter('CITCH', ['CI'])).toBe(true);
    });
  });

  describe('countriesMatch', () => {
    it('should return true for same country', () => {
      expect(countriesMatch('CI', 'CI')).toBe(true);
      expect(countriesMatch('SN', 'SN')).toBe(true);
    });

    it('should return true for code vs name', () => {
      expect(countriesMatch('CI', "Côte d'Ivoire")).toBe(true);
      expect(countriesMatch("Côte d'Ivoire", 'CI')).toBe(true);
    });

    it('should return true for CITCH alias', () => {
      expect(countriesMatch('CI', 'CITCH')).toBe(true);
      expect(countriesMatch('CITCH', 'CI')).toBe(true);
      expect(countriesMatch('CITCH', "Côte d'Ivoire")).toBe(true);
    });

    it('should return false for different countries', () => {
      expect(countriesMatch('CI', 'SN')).toBe(false);
      expect(countriesMatch('BF', 'ML')).toBe(false);
    });

    it('should handle null/undefined', () => {
      expect(countriesMatch(null, null)).toBe(true);
      expect(countriesMatch(undefined, undefined)).toBe(true);
      expect(countriesMatch('CI', null)).toBe(false);
      expect(countriesMatch(null, 'CI')).toBe(false);
    });

    it('should be case insensitive', () => {
      expect(countriesMatch('ci', 'CI')).toBe(true);
      expect(countriesMatch('sn', 'SN')).toBe(true);
      expect(countriesMatch("côte d'ivoire", "Côte d'Ivoire")).toBe(true);
    });
  });
});