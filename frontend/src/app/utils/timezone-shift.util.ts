/**
 * Décalage horaire d'une colonne date + heure (page Traitement).
 *
 * Exemple : fichier du Cameroun (GMT+1) traité à l'heure du Sénégal (GMT) → décalage de −1 h.
 * « 06/11/2026 00:30:00 » devient « 05/11/2026 23:30:00 » : la transaction repasse sur J-1.
 *
 * Le format d'origine est conservé (ordre jour/mois/année, séparateurs, zéros, secondes,
 * fraction « .0 », suffixe). Les valeurs sans heure ou non reconnues ne sont pas modifiées.
 */

/** Pays proposés : `utcOffset` = fuseau du pays (heure normale, pas d'heure d'été en Afrique). */
export interface TimezoneShiftCountry {
  code: string;
  label: string;
  utcOffset: number;
}

/** Heure de référence de l'application : Sénégal (GMT+0). */
export const TIMEZONE_REFERENCE_UTC_OFFSET = 0;

export const TIMEZONE_SHIFT_COUNTRIES: TimezoneShiftCountry[] = [
  { code: 'CM', label: 'Cameroun', utcOffset: 1 },
  { code: 'GA', label: 'Gabon', utcOffset: 1 },
  { code: 'CG', label: 'Congo', utcOffset: 1 },
  { code: 'CD', label: 'RD Congo (Kinshasa)', utcOffset: 1 },
  { code: 'TD', label: 'Tchad', utcOffset: 1 },
  { code: 'CF', label: 'Centrafrique', utcOffset: 1 },
  { code: 'GQ', label: 'Guinée équatoriale', utcOffset: 1 },
  { code: 'BJ', label: 'Bénin', utcOffset: 1 },
  { code: 'NE', label: 'Niger', utcOffset: 1 },
  { code: 'NG', label: 'Nigeria', utcOffset: 1 },
  { code: 'RW', label: 'Rwanda', utcOffset: 2 },
  { code: 'BI', label: 'Burundi', utcOffset: 2 },
  { code: 'ZM', label: 'Zambie', utcOffset: 2 },
  { code: 'MZ', label: 'Mozambique', utcOffset: 2 },
  { code: 'KE', label: 'Kenya', utcOffset: 3 },
  { code: 'UG', label: 'Ouganda', utcOffset: 3 },
  { code: 'TZ', label: 'Tanzanie', utcOffset: 3 },
  { code: 'MG', label: 'Madagascar', utcOffset: 3 },
  { code: 'CI', label: "Côte d'Ivoire", utcOffset: 0 },
  { code: 'ML', label: 'Mali', utcOffset: 0 },
  { code: 'BF', label: 'Burkina Faso', utcOffset: 0 },
  { code: 'GN', label: 'Guinée', utcOffset: 0 },
  { code: 'TG', label: 'Togo', utcOffset: 0 }
];

/**
 * Décalage (en heures) à appliquer pour passer de l'heure du pays à l'heure de référence
 * (`toReference = true`), ou l'inverse.
 */
export function countryShiftHours(utcOffset: number, toReference = true): number {
  const diff = utcOffset - TIMEZONE_REFERENCE_UTC_OFFSET;
  return toReference ? -diff : diff;
}

/** Valeur spéciale de `timezoneCountry` : le pays est lu ligne par ligne dans une colonne. */
export const TIMEZONE_COUNTRY_FROM_COLUMN = 'column';

/** Pays de l'heure de référence (Sénégal) : décalage nul quand il apparaît dans la colonne pays. */
const REFERENCE_COUNTRY: TimezoneShiftCountry = { code: 'SN', label: 'Sénégal', utcOffset: TIMEZONE_REFERENCE_UTC_OFFSET };

function normalizeCountryText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z]/g, '');
}

/**
 * Retrouve un pays à partir d'une valeur de cellule : code ISO (« CM », « ga »)
 * ou libellé (« Cameroun », « Côte d'Ivoire »). Inconnu : null.
 */
export function findTimezoneCountry(value: unknown): TimezoneShiftCountry | null {
  if (value === null || value === undefined) return null;
  const raw = String(value).trim();
  if (!raw) return null;
  const all = [...TIMEZONE_SHIFT_COUNTRIES, REFERENCE_COUNTRY];
  const upper = raw.toUpperCase();
  const byCode = all.find(c => c.code === upper);
  if (byCode) return byCode;
  const norm = normalizeCountryText(raw);
  return all.find(c => normalizeCountryText(c.label) === norm) ?? null;
}

/** Décalage (en heures) pour la valeur pays d'une ligne. Pays inconnu : 0 (ligne non modifiée). */
export function resolveTimezoneShiftHoursForCountryValue(
  countryValue: unknown,
  toReference: boolean | null | undefined
): number {
  const country = findTimezoneCountry(countryValue);
  return country ? countryShiftHours(country.utcOffset, toReference === true) : 0;
}

/**
 * Décalage (en heures) d'une configuration pays / sens / saisie libre.
 * `countryCode = 'custom'` : `customHours` est utilisé tel quel. Pays inconnu, vide ou
 * « colonne » (dépend de la ligne) : 0.
 */
export function resolveTimezoneShiftHours(
  countryCode: string | null | undefined,
  toReference: boolean | null | undefined,
  customHours?: number | string | null
): number {
  if (countryCode === 'custom') {
    const h = Number(customHours);
    return isFinite(h) ? h : 0;
  }
  const country = TIMEZONE_SHIFT_COUNTRIES.find(c => c.code === countryCode);
  return country ? countryShiftHours(country.utcOffset, toReference === true) : 0;
}

export interface TimezoneShiftResult {
  value: any;
  changed: boolean;
}

// AAAA-MM-JJ HH:mm[:ss[.fff]]  (séparateur de date - / ou .)
const YMD_RE = /^(\d{4})([-/.])(\d{1,2})\2(\d{1,2})([ T]+)(\d{1,2}):(\d{2})(?::(\d{2}))?(\.\d+)?(.*)$/;
// JJ/MM/AAAA HH:mm[:ss[.fff]]  (convention jour/mois, séparateur - / ou .)
const DMY_RE = /^(\d{1,2})([-/.])(\d{1,2})\2(\d{4})([ T]+)(\d{1,2}):(\d{2})(?::(\d{2}))?(\.\d+)?(.*)$/;

/** Bornes des numéros de série Excel date + heure (≈ 1954 → 2637). */
const EXCEL_SERIAL_MIN = 20000;
const EXCEL_SERIAL_MAX = 270000;

function pad(n: number, width: number): string {
  return String(n).padStart(width, '0');
}

/** Suffixe accepté après l'heure : vide, « Z » ou fuseau explicite. AM/PM non géré. */
function isSafeSuffix(suffix: string): boolean {
  const s = suffix.trim();
  return s === '' || /^(Z|[+-]\d{2}:?\d{2})$/i.test(s);
}

/**
 * Décale une valeur date + heure de `hours` heures (négatif = recul). Le nombre d'heures peut être
 * décimal (ex. 5.5) ; il est arrondi à la minute.
 */
export function shiftDateTimeValue(value: any, hours: number): TimezoneShiftResult {
  const unchanged: TimezoneShiftResult = { value, changed: false };
  if (value === null || value === undefined || !hours || !isFinite(hours)) {
    return unchanged;
  }
  const deltaMinutes = Math.round(hours * 60);
  if (deltaMinutes === 0) {
    return unchanged;
  }

  // Numéro de série Excel avec partie horaire
  if (typeof value === 'number') {
    if (value >= EXCEL_SERIAL_MIN && value < EXCEL_SERIAL_MAX) {
      return { value: value + deltaMinutes / 1440, changed: true };
    }
    return unchanged;
  }

  if (value instanceof Date) {
    if (isNaN(value.getTime())) return unchanged;
    return { value: new Date(value.getTime() + deltaMinutes * 60000), changed: true };
  }

  const raw = String(value);
  const leading = raw.match(/^\s*/)![0];
  const trailing = raw.match(/\s*$/)![0];
  const text = raw.trim();
  if (!text) return unchanged;

  let m = text.match(YMD_RE);
  let order: 'ymd' | 'dmy';
  if (m) {
    order = 'ymd';
  } else {
    m = text.match(DMY_RE);
    if (!m) return unchanged;
    order = 'dmy';
  }

  const [, a, sep, b, c, dtSep, hh, mi, ss, frac, suffix] = m;
  if (!isSafeSuffix(suffix)) return unchanged;

  const yearStr = order === 'ymd' ? a : c;
  const monthStr = b;
  const dayStr = order === 'ymd' ? c : a;
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10);
  const day = parseInt(dayStr, 10);
  const hour = parseInt(hh, 10);
  const minute = parseInt(mi, 10);
  const second = ss !== undefined ? parseInt(ss, 10) : 0;
  if (month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59 || second > 59) {
    return unchanged;
  }
  const base = Date.UTC(year, month - 1, day, hour, minute, second);
  const check = new Date(base);
  if (check.getUTCDate() !== day || check.getUTCMonth() !== month - 1) {
    return unchanged; // ex. 31/02
  }

  const d = new Date(base + deltaMinutes * 60000);
  const outDay = pad(d.getUTCDate(), dayStr.length);
  const outMonth = pad(d.getUTCMonth() + 1, monthStr.length);
  const outYear = String(d.getUTCFullYear());
  const outHour = pad(d.getUTCHours(), hh.length);
  const outMin = pad(d.getUTCMinutes(), 2);
  const outSec = ss !== undefined ? ':' + pad(d.getUTCSeconds(), 2) : '';

  const datePart = order === 'ymd'
    ? `${outYear}${sep}${outMonth}${sep}${outDay}`
    : `${outDay}${sep}${outMonth}${sep}${outYear}`;
  const result = `${leading}${datePart}${dtSep}${outHour}:${outMin}${outSec}${frac ?? ''}${suffix}${trailing}`;
  return { value: result, changed: result !== raw };
}
