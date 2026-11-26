import { formatCompactDateTime } from './date-format.util';

describe('formatCompactDateTime', () => {
  it('convertit AAAAMMJJHHMMSS en AAAA-MM-JJ HH:MM:SS (texte ou nombre)', () => {
    expect(formatCompactDateTime('20261124220323')).toBe('2026-11-24 22:03:23');
    expect(formatCompactDateTime(20261124220323)).toBe('2026-11-24 22:03:23');
    expect(formatCompactDateTime(' 20261124220323.0 ')).toBe('2026-11-24 22:03:23');
    expect(formatCompactDateTime('="20261124220323"')).toBe('2026-11-24 22:03:23');
  });

  it('gère les variantes sans secondes et sans heure', () => {
    expect(formatCompactDateTime('202611242203')).toBe('2026-11-24 22:03:00');
    expect(formatCompactDateTime('20261124')).toBe('2026-11-24');
  });

  it('laisse inchangées les valeurs non reconnues ou impossibles', () => {
    expect(formatCompactDateTime('20260231120000')).toBe('20260231120000');
    expect(formatCompactDateTime('20261124250000')).toBe('20261124250000');
    expect(formatCompactDateTime('2026-11-24 22:03:23')).toBe('2026-11-24 22:03:23');
    expect(formatCompactDateTime('ABC')).toBe('ABC');
    expect(formatCompactDateTime('')).toBe('');
    expect(formatCompactDateTime(null)).toBeNull();
  });
});
