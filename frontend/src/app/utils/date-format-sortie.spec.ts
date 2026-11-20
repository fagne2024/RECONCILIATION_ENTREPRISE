import { formatOutputDateTime } from './date-format.util';

describe('Format de date du fichier produit : AAAA-MM-JJ HH:MM:SS', () => {
  it.each([
    ['2026-11-19 23:59:59', '2026-11-19 23:59:59'],
    ['2026-11-19 23:59:59.123', '2026-11-19 23:59:59'],
    ['2026-11-19T23:59:59+01:00', '2026-11-19 23:59:59'],
    ['2026-11-19 23:59:59 UTC extra', '2026-11-19 23:59:59'],
    ['19/11/2026 23:53', '2026-11-19 23:53:00'],
    ['19/11/2026 23:53:12 AM', '2026-11-19 23:53:12'],
    ['19/11/2026', '2026-11-19 00:00:00'],
    ['46345.99513888889', '2026-11-19 23:53:00'],
    ['Thu Nov 19 2026 23:53:00 GMT+0000 (heure)', '2026-11-19 23:53:00'],
  ])('%s → %s', (input, expected) => {
    expect(formatOutputDateTime(input)).toBe(expected);
  });

  it('objet Date et heure seule', () => {
    expect(formatOutputDateTime(new Date(2026, 10, 19, 23, 59, 59, 500))).toBe('2026-11-19 23:59:59');
    expect(formatOutputDateTime(new Date(1899, 11, 30, 23, 53, 0))).toBe('23:53:00');
  });

  it('valeur non date inchangée', () => {
    expect(formatOutputDateTime('23:53')).toBe('23:53');
    expect(formatOutputDateTime('CASHIN_OM')).toBe('CASHIN_OM');
    expect(formatOutputDateTime('15,000.00')).toBe('15,000.00');
    expect(formatOutputDateTime('32/13/2026')).toBe('32/13/2026');
  });
});
