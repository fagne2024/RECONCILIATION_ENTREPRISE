import {
  finalizeTextPreserveColumnValue,
  isMsisdnPreserveColumn,
  preserveLeadingZeroString
} from './text-cell.util';

const WHITESPACE_RE = /[\s\u00A0\u202F\u2007\u2060]+/g;

/**
 * Normalise une valeur avant concaténation : supprime espaces et séparateurs de milliers.
 */
export function normalizeConcatSourceValue(value: unknown, columnName?: string): string {
  if (value === null || value === undefined) {
    return '';
  }

  if (columnName && isMsisdnPreserveColumn(columnName)) {
    return finalizeTextPreserveColumnValue(columnName, value);
  }

  if (typeof value === 'number' && isFinite(value)) {
    return preserveLeadingZeroString(value);
  }

  return String(value).replace(WHITESPACE_RE, '');
}

/**
 * Concatène des parties sans aucun espace dans le résultat final.
 */
export function buildConcatenatedValue(
  parts: unknown[],
  separator = '',
  sourceColumns?: string[]
): string {
  const joined = parts
    .map((part, index) => {
      const columnName = sourceColumns?.[index];
      return normalizeConcatSourceValue(part, columnName);
    })
    .join(separator ?? '');
  return joined.replace(WHITESPACE_RE, '');
}

/**
 * Supprime tous les espaces d'une valeur (utile pour les colonnes clé après traitement).
 */
export function stripAllWhitespace(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }
  return String(value).replace(WHITESPACE_RE, '');
}

const pad2 = (n: number) => String(n).padStart(2, '0');

/** Cellule Date Excel : heure seule (jour 30/12/1899) → hh:mm[:ss], sinon jj/mm/aaaa [hh:mm[:ss]]. */
function formatDateCellForJoin(d: Date): string {
  const h = d.getHours();
  const m = d.getMinutes();
  const s = d.getSeconds();
  const time = s ? `${pad2(h)}:${pad2(m)}:${pad2(s)}` : `${pad2(h)}:${pad2(m)}`;
  if (d.getFullYear() <= 1900 && d.getMonth() === 11 && d.getDate() >= 30) {
    return time;
  }
  const date = `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()}`;
  return h || m || s ? `${date} ${time}` : date;
}

/**
 * Valeurs mises côte à côte dans une même colonne (ex. Date + Heure → « 19/11/2026 23:53 ») :
 * contrairement à buildConcatenatedValue, les espaces internes et le séparateur sont conservés ;
 * les parties vides sont ignorées (pas de séparateur en trop).
 */
export function joinSideBySide(parts: unknown[], separator = ' '): string {
  return parts
    .map(part => {
      if (part === null || part === undefined) {
        return '';
      }
      if (part instanceof Date) {
        return isNaN(part.getTime()) ? '' : formatDateCellForJoin(part);
      }
      if (typeof part === 'number' && isFinite(part)) {
        return preserveLeadingZeroString(part);
      }
      return String(part).trim();
    })
    .filter(part => part !== '')
    .join(separator ?? ' ');
}
