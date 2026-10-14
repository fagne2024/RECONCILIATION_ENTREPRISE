import { normalizeReconciliationKeyValue } from './reconciliation-key.util';

describe('reconciliation-key.util - normalizeReconciliationKeyValue', () => {
  describe('null/undefined handling', () => {
    it('should return empty string for null', () => {
      expect(normalizeReconciliationKeyValue(null)).toBe('');
    });

    it('should return empty string for undefined', () => {
      expect(normalizeReconciliationKeyValue(undefined)).toBe('');
    });
  });

  describe('number handling', () => {
    it('should convert integer numbers to string without decimal', () => {
      expect(normalizeReconciliationKeyValue(123)).toBe('123');
      expect(normalizeReconciliationKeyValue(0)).toBe('0');
      expect(normalizeReconciliationKeyValue(-456)).toBe('-456');
    });

    it('should convert float numbers with .0 to integer string', () => {
      expect(normalizeReconciliationKeyValue(123.0)).toBe('123');
      expect(normalizeReconciliationKeyValue(-456.0)).toBe('-456');
    });

    it('should keep decimal for non-integer floats', () => {
      expect(normalizeReconciliationKeyValue(123.45)).toBe('123.45');
      expect(normalizeReconciliationKeyValue(-67.89)).toBe('-67.89');
    });

    it('should handle scientific notation integers', () => {
      expect(normalizeReconciliationKeyValue(1e5)).toBe('100000');
      expect(normalizeReconciliationKeyValue(1E10)).toBe('10000000000');
    });

    it('should handle scientific notation floats', () => {
      expect(normalizeReconciliationKeyValue(1.5e2)).toBe('150');
      expect(normalizeReconciliationKeyValue(2.5e1)).toBe('25');
    });

    it('should return empty string for NaN/Infinity', () => {
      expect(normalizeReconciliationKeyValue(NaN)).toBe('');
      expect(normalizeReconciliationKeyValue(Infinity)).toBe('');
      expect(normalizeReconciliationKeyValue(-Infinity)).toBe('');
    });
  });

  describe('string handling', () => {
    it('should trim whitespace', () => {
      expect(normalizeReconciliationKeyValue('  ABC  ')).toBe('ABC');
      expect(normalizeReconciliationKeyValue('\tXYZ\n')).toBe('XYZ');
    });

    it('should remove all whitespace', () => {
      expect(normalizeReconciliationKeyValue('A B C')).toBe('ABC');
      expect(normalizeReconciliationKeyValue('1 2 3')).toBe('123');
    });

    it('should return empty string for empty/whitespace only', () => {
      expect(normalizeReconciliationKeyValue('')).toBe('');
      expect(normalizeReconciliationKeyValue('   ')).toBe('');
      expect(normalizeReconciliationKeyValue('\t\n')).toBe('');
    });

    it('should handle numeric strings as numbers', () => {
      expect(normalizeReconciliationKeyValue('123')).toBe('123');
      expect(normalizeReconciliationKeyValue('123.0')).toBe('123');
      expect(normalizeReconciliationKeyValue('123.45')).toBe('123.45');
      expect(normalizeReconciliationKeyValue('-456')).toBe('-456');
      expect(normalizeReconciliationKeyValue('-456.0')).toBe('-456');
    });

    it('should handle scientific notation strings', () => {
      expect(normalizeReconciliationKeyValue('1e5')).toBe('100000');
      expect(normalizeReconciliationKeyValue('1.5e2')).toBe('150');
    });

    it('should preserve non-numeric strings', () => {
      expect(normalizeReconciliationKeyValue('ABC123')).toBe('ABC123');
      expect(normalizeReconciliationKeyValue('REF-001')).toBe('REF-001');
      expect(normalizeReconciliationKeyValue('TRX/2024/001')).toBe('TRX/2024/001');
    });

    it('should handle strings with special characters', () => {
      expect(normalizeReconciliationKeyValue('TRX@#$%')).toBe('TRX@#$%');
      expect(normalizeReconciliationKeyValue('ABC_DEF')).toBe('ABC_DEF');
    });
  });

  describe('boolean handling', () => {
    it('should convert true to "true"', () => {
      expect(normalizeReconciliationKeyValue(true)).toBe('true');
    });

    it('should convert false to "false"', () => {
      expect(normalizeReconciliationKeyValue(false)).toBe('false');
    });
  });

  describe('object handling', () => {
    it('should convert object to string (whitespace removed)', () => {
      expect(normalizeReconciliationKeyValue({ a: 1 })).toBe('[objectObject]');
      expect(normalizeReconciliationKeyValue([1, 2, 3])).toBe('1,2,3');
    });
  });

  describe('edge cases', () => {
    it('should handle very large integers', () => {
      expect(normalizeReconciliationKeyValue(Number.MAX_SAFE_INTEGER)).toBe(String(Number.MAX_SAFE_INTEGER));
    });

    it('should handle very small numbers', () => {
      expect(normalizeReconciliationKeyValue(Number.MIN_SAFE_INTEGER)).toBe(String(Number.MIN_SAFE_INTEGER));
    });

    it('should handle strings with leading zeros (treated as numbers)', () => {
      expect(normalizeReconciliationKeyValue('00123')).toBe('123');
      expect(normalizeReconciliationKeyValue('000')).toBe('0');
    });

    it('should handle strings that look like floats but are integers', () => {
      expect(normalizeReconciliationKeyValue('123.000')).toBe('123');
      expect(normalizeReconciliationKeyValue('123.00')).toBe('123');
    });

    it('should not convert strings with non-numeric chars to numbers', () => {
      expect(normalizeReconciliationKeyValue('123abc')).toBe('123abc');
      expect(normalizeReconciliationKeyValue('123.45.67')).toBe('123.45.67');
    });
  });
});