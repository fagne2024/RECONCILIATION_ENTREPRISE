import { buildConcatenatedValue, joinSideBySide } from './concat.util';

describe('Fusion côte à côte (Traitement : Date + Heure dans Date)', () => {
  it('garde le séparateur et les espaces, ignore les parties vides', () => {
    expect(joinSideBySide(['19/11/2026', '23:53'])).toBe('19/11/2026 23:53');
    expect(joinSideBySide([' 19/11/2026 ', '', '23:53'], ' ')).toBe('19/11/2026 23:53');
    expect(joinSideBySide(['19/11/2026', null], ' ')).toBe('19/11/2026');
    expect(joinSideBySide(['A', 'B'], ' - ')).toBe('A - B');
    // La concaténation classique, elle, retire tous les espaces.
    expect(buildConcatenatedValue(['19/11/2026', '23:53'], ' ')).toBe('19/11/202623:53');
  });

  it('formate les cellules date et heure Excel', () => {
    expect(joinSideBySide([new Date(2026, 10, 19), new Date(1899, 11, 30, 23, 53)])).toBe('19/11/2026 23:53');
    expect(joinSideBySide([new Date(2026, 10, 19, 8, 5, 9)])).toBe('19/11/2026 08:05:09');
  });
});
