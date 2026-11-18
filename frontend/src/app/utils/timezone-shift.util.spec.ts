import { countryShiftHours, resolveTimezoneShiftHours, shiftDateTimeValue, TIMEZONE_SHIFT_COUNTRIES } from './timezone-shift.util';

describe('shiftDateTimeValue', () => {
  it('recule d’une heure et repasse sur la veille (Cameroun → Sénégal)', () => {
    expect(shiftDateTimeValue('06/11/2026 00:30:00', -1)).toEqual({ value: '05/11/2026 23:30:00', changed: true });
  });

  it('conserve le format AAAA-MM-JJ et la fraction .0', () => {
    expect(shiftDateTimeValue('2026-11-06 02:15:09.0', -3).value).toBe('2026-11-05 23:15:09.0');
  });

  it('gère le changement de mois et d’année', () => {
    expect(shiftDateTimeValue('2026-01-01 00:10', -1).value).toBe('2025-12-31 23:10');
    expect(shiftDateTimeValue('31/03/2026 23:30:00', 1).value).toBe('01/04/2026 00:30:00');
  });

  it('gère les années bissextiles', () => {
    expect(shiftDateTimeValue('01/03/2028 01:00:00', -2).value).toBe('29/02/2028 23:00:00');
  });

  it('conserve l’absence de zéros et le séparateur T', () => {
    expect(shiftDateTimeValue('6/11/2026 9:05', -1).value).toBe('6/11/2026 8:05');
    expect(shiftDateTimeValue('2026-11-06T00:00:00Z', -1).value).toBe('2026-11-05T23:00:00Z');
  });

  it('ne modifie pas une date sans heure, une valeur invalide ou un AM/PM', () => {
    expect(shiftDateTimeValue('06/11/2026', -1).changed).toBe(false);
    expect(shiftDateTimeValue('31/02/2026 10:00', -1).changed).toBe(false);
    expect(shiftDateTimeValue('abc', -1).changed).toBe(false);
    expect(shiftDateTimeValue('06/11/2026 10:00 PM', -1).changed).toBe(false);
    expect(shiftDateTimeValue('', -1).changed).toBe(false);
    expect(shiftDateTimeValue(null, -1).changed).toBe(false);
  });

  it('décale un numéro de série Excel', () => {
    const r = shiftDateTimeValue(46000.5, -3);
    expect(r.changed).toBe(true);
    expect(r.value).toBeCloseTo(46000.375, 6);
    expect(shiftDateTimeValue(1500, -1).changed).toBe(false);
  });

  it('ne fait rien avec un décalage nul', () => {
    expect(shiftDateTimeValue('06/11/2026 00:30:00', 0).changed).toBe(false);
  });
});

describe('countryShiftHours', () => {
  it('Cameroun → −1 h, Kenya → −3 h (vers l’heure du Sénégal)', () => {
    const cm = TIMEZONE_SHIFT_COUNTRIES.find(c => c.code === 'CM')!;
    const ke = TIMEZONE_SHIFT_COUNTRIES.find(c => c.code === 'KE')!;
    expect(countryShiftHours(cm.utcOffset)).toBe(-1);
    expect(countryShiftHours(ke.utcOffset)).toBe(-3);
    expect(countryShiftHours(ke.utcOffset, false)).toBe(3);
  });
});

describe('resolveTimezoneShiftHours', () => {
  it('par défaut, heure du Sénégal → heure du pays (Cameroun +1 h, Kenya +3 h)', () => {
    expect(resolveTimezoneShiftHours('CM', false)).toBe(1);
    expect(resolveTimezoneShiftHours('KE', undefined)).toBe(3);
    expect(resolveTimezoneShiftHours('CM', true)).toBe(-1);
  });

  it('saisie personnalisée et pays inconnu', () => {
    expect(resolveTimezoneShiftHours('custom', false, '2')).toBe(2);
    expect(resolveTimezoneShiftHours('', false)).toBe(0);
    expect(resolveTimezoneShiftHours('XX', false)).toBe(0);
  });

  it('fichier du 16 à l’heure du Sénégal ramené à l’heure du Cameroun', () => {
    const h = resolveTimezoneShiftHours('CM', false);
    expect(shiftDateTimeValue('15/11/2026 23:00:00', h).value).toBe('16/11/2026 00:00:00');
    expect(shiftDateTimeValue('15/11/2026 23:59:59', h).value).toBe('16/11/2026 00:59:59');
    expect(shiftDateTimeValue('16/11/2026 00:00:00', h).value).toBe('16/11/2026 01:00:00');
    expect(shiftDateTimeValue('16/11/2026 22:59:59', h).value).toBe('16/11/2026 23:59:59');
  });
});
