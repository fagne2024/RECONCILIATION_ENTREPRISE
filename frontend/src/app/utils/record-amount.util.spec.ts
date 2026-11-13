import { parseAmountValue, tryParseAmount } from './record-amount.util';

describe('parseAmountValue / tryParseAmount', () => {
  it('conserve les zéros après la virgule des milliers', () => {
    expect(parseAmountValue('-2,531,000')).toBe(-2531000);
    expect(parseAmountValue('-195,000')).toBe(-195000);
    expect(parseAmountValue('-5,000,000')).toBe(-5000000);
    expect(parseAmountValue('-700,000')).toBe(-700000);
  });
  it('garde les décimales françaises et mixtes', () => {
    expect(parseAmountValue('139 474,44')).toBe(139474.44);
    expect(parseAmountValue('1.234,56')).toBe(1234.56);
    expect(parseAmountValue('1,234.56')).toBe(1234.56);
    expect(parseAmountValue('12,5')).toBe(12.5);
  });
  it('0 si vide ou non numérique', () => {
    expect(parseAmountValue('')).toBe(0);
    expect(parseAmountValue('abc')).toBe(0);
  });
  it('groupedThousands : « 12,500 » = 12500', () => {
    expect(tryParseAmount('12,500', { groupedThousands: true })).toBe(12500);
    expect(tryParseAmount('12,500')).toBe(12.5);
    expect(tryParseAmount('texte')).toBeNull();
  });
});
