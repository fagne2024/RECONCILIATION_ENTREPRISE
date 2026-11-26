import { computeColumnMath, COLUMN_MATH_OPERATORS } from './auto-processing.service';

describe('computeColumnMath', () => {
  it('applique les quatre opérations', () => {
    expect(computeColumnMath('add', 10, 4)).toBe(14);
    expect(computeColumnMath('subtract', 10, 4)).toBe(6);
    expect(computeColumnMath('multiply', 10, 4)).toBe(40);
    expect(computeColumnMath('divide', 10, 4)).toBe(2.5);
  });

  it('division par zéro : NaN (cellule vide une fois formatée)', () => {
    expect(computeColumnMath('divide', 10, 0)).toBeNaN();
  });

  it('expose un symbole par opération', () => {
    expect(COLUMN_MATH_OPERATORS.multiply).toBe('×');
    expect(COLUMN_MATH_OPERATORS.divide).toBe('÷');
  });
});
