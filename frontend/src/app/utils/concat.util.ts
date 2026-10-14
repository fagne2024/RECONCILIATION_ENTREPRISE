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
