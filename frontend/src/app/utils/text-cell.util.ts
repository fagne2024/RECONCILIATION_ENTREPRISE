/**
 * Colonnes et valeurs à conserver en texte (zéros en tête, MSISDN, identifiants).
 */

export function normalizeColumnLabelForMatch(columnName: string): string {
  return (columnName || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .trim();
}

/** Colonne téléphone / MSISDN (zéro initial, ex. To / From MTNCI). */
export function isMsisdnPreserveColumn(columnName: string): boolean {
  const lower = normalizeColumnLabelForMatch(columnName);
  if (!lower) {
    return false;
  }
  if (lower === 'to' || lower === 'from') {
    return true;
  }
  const patterns = [
    'msisdn', 'phone', 'telephone', 'tel', 'mobile', 'portable',
    'sender', 'receiver', 'initiator'
  ];
  return patterns.some(pattern => lower === pattern || lower.includes(pattern));
}

/** Colonne identifiant de transaction (ex. IDTransaction CO260628.2356.D41732 — conserver les points). */
export function isTransactionIdPreserveColumn(columnName: string): boolean {
  const lower = normalizeColumnLabelForMatch(columnName).replace(/\s+/g, '');
  if (!lower) {
    return false;
  }
  const patterns = [
    'idtransaction', 'transactionid', 'idoperation',
    'reference', 'referenceid', 'externalid', 'externaltransactionid',
    'numtransactiongu', 'numerotransgu', 'cleci'
  ];
  return patterns.some(pattern => lower === pattern || lower.includes(pattern));
}

/**
 * @deprecated Préférer isMsisdnPreserveColumn — conservé pour compatibilité interne.
 * Ne couvre plus les colonnes clé (reference, transaction, etc.).
 */
export function isTextPreserveColumn(columnName: string): boolean {
  return isMsisdnPreserveColumn(columnName);
}

/** Convertit une valeur cellule en chaîne sans notation scientifique. */
export function preserveLeadingZeroString(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }
  if (typeof value === 'number') {
    if (!isFinite(value) || isNaN(value)) {
      return '';
    }
    if (Number.isInteger(value) || Math.abs(value - Math.round(value)) < 1e-9) {
      return String(Math.trunc(value));
    }
    return String(value);
  }
  return String(value).trim();
}

/** Valeur numérique commençant par 0 : doit rester du texte (ex. 0501415273). */
export function isLeadingZeroNumericString(value: unknown): boolean {
  const text = preserveLeadingZeroString(value).replace(/\s/g, '');
  return /^0\d+$/.test(text);
}

/** Export Excel/CSV : forcer le format texte (MSISDN ou valeur commençant par 0). */
export function shouldExportCellAsText(columnName: string, value: unknown): boolean {
  if (isMsisdnPreserveColumn(columnName)) {
    return true;
  }
  return isLeadingZeroNumericString(value);
}

/** Colonne pour laquelle l'export CSV doit utiliser une formule Excel (zéro initial). */
export function shouldUseExcelCsvTextFormula(columnName: string | undefined, value: unknown): boolean {
  if (!columnName || !isMsisdnPreserveColumn(columnName)) {
    return false;
  }
  const text = formatValueForTextPreserveExport(columnName, value).replace(/\s/g, '');
  return /^\d+$/.test(text);
}

/** Longueur MSISDN locale (ex. CI : 10 chiffres dont le 0 initial). */
export const DEFAULT_MSISDN_DIGIT_LENGTH = 10;

/** Complète une chaîne numérique avec des zéros à gauche. */
export function padDigitsToLength(value: string, length: number): string {
  if (!/^\d+$/.test(value) || length <= 0 || value.length >= length) {
    return value;
  }
  return value.padStart(length, '0');
}

/**
 * Extrait N caractères (mode conserver) en conservant la valeur en texte.
 */
export function keepCharactersFromString(
  value: unknown,
  position: 'start' | 'end' | 'specific',
  count: number,
  specificPosition = 1
): string {
  const text = preserveLeadingZeroString(value);
  const n = Math.max(1, count || 1);
  const pos = Math.max(1, specificPosition || 1) - 1;

  switch (position) {
    case 'start':
      return text.substring(0, n);
    case 'end':
      return text.substring(Math.max(0, text.length - n));
    case 'specific':
      if (pos >= 0 && pos < text.length) {
        return text.substring(pos, pos + n);
      }
      return text;
    default:
      return text;
  }
}

/** Mode de gestion du zéro initial pour nombres / téléphones après « supprimer / conserver des caractères ». */
export type LeadingZeroMode = 'none' | 'keep' | 'strip';

export function isNumericLikeString(value: unknown): boolean {
  const text = preserveLeadingZeroString(value).replace(/\s/g, '');
  return /^\d+$/.test(text);
}

/** Retire un seul zéro en tête pour les chaînes numériques (ex. 0501415273 → 501415273). */
export function stripSingleLeadingZero(value: unknown): string {
  const text = preserveLeadingZeroString(value).replace(/\s/g, '');
  if (/^0\d+$/.test(text)) {
    return text.substring(1);
  }
  return text;
}

function applyLeadingZeroKeep(value: string, keepCount: number): string {
  const digits = preserveLeadingZeroString(value).replace(/\s/g, '');
  if (/^\d+$/.test(digits)) {
    return padDigitsToLength(digits, Math.max(1, keepCount || 1));
  }
  return preserveLeadingZeroString(value);
}

/**
 * Finalise une cellule après l'action « supprimer / conserver des caractères ».
 * Le zéro initial n'est modifié que si leadingZeroMode est explicitement configuré.
 */
export function finalizeRemoveCharactersCell(
  _columnName: string,
  value: unknown,
  options: {
    removeCharMode: 'remove' | 'keep';
    removeCharCount?: number;
    leadingZeroMode?: LeadingZeroMode | 'auto';
  }
): string {
  const rawMode = options.leadingZeroMode;
  const leadingZeroMode: LeadingZeroMode =
    rawMode === 'keep' || rawMode === 'strip' ? rawMode : 'none';
  const keepCount = Math.max(1, Number(options.removeCharCount) || 1);
  const text = preserveLeadingZeroString(value);

  if (leadingZeroMode === 'keep') {
    return applyLeadingZeroKeep(text, keepCount);
  }
  if (leadingZeroMode === 'strip' && isNumericLikeString(text)) {
    return stripSingleLeadingZero(text);
  }
  return text;
}

/**
 * @deprecated Utiliser finalizeRemoveCharactersCell avec leadingZeroMode explicite.
 */
export function finalizeAfterKeepCharacters(
  columnName: string,
  value: unknown,
  keepCount: number
): string {
  return applyLeadingZeroKeep(preserveLeadingZeroString(value), keepCount);
}

/**
 * Finalise une valeur de colonne téléphone / MSISDN :
 * conserve le 0 initial s'il est déjà présent, sans en ajouter automatiquement.
 */
export function finalizeTextPreserveColumnValue(
  columnName: string,
  value: unknown,
  _padLength = DEFAULT_MSISDN_DIGIT_LENGTH
): string {
  const text = preserveLeadingZeroString(value).replace(/\s/g, '');
  if (!text) {
    return '';
  }
  if (isLeadingZeroNumericString(text)) {
    return text;
  }
  if (isMsisdnPreserveColumn(columnName) && /^\d+$/.test(text)) {
    return text;
  }
  return preserveLeadingZeroString(value);
}

/** Supprime les N premiers caractères en conservant le résultat en texte. */
export function removeCharsFromStart(value: unknown, count: number): string {
  const text = preserveLeadingZeroString(value);
  const n = Math.max(1, count || 1);
  return text.length >= n ? text.substring(n) : text;
}

/** Formate une cellule lue (Excel/CSV) en chaîne, en préservant les zéros en tête. */
export function formatGridCellAsString(columnName: string, value: unknown): string {
  if (value === undefined || value === null) {
    return '';
  }
  if (isTransactionIdPreserveColumn(columnName)) {
    return preserveLeadingZeroString(value);
  }
  if (isMsisdnPreserveColumn(columnName) || isLeadingZeroNumericString(value)) {
    return finalizeTextPreserveColumnValue(columnName, value);
  }
  if (typeof value === 'number') {
    return preserveLeadingZeroString(value);
  }
  return String(value).trim();
}

/** Normalise une ligne : seules les valeurs déjà commençant par 0 sont préservées en texte. */
export function normalizeLeadingZeroCellsInRow<T extends Record<string, unknown>>(row: T): T {
  for (const key of Object.keys(row)) {
    const val = row[key];
    if (val === null || val === undefined || val === '') {
      continue;
    }
    if (isLeadingZeroNumericString(val)) {
      (row as Record<string, unknown>)[key] = preserveLeadingZeroString(val);
    }
  }
  return row;
}

export function normalizeLeadingZeroCellsInRows(rows: Record<string, string>[]): Record<string, string>[] {
  for (let i = 0; i < rows.length; i++) {
    if (rows[i]) {
      normalizeLeadingZeroCellsInRow(rows[i]);
    }
  }
  return rows;
}

/** Valeur prête pour export (complète MSISDN à 10 chiffres si besoin). */
export function formatValueForTextPreserveExport(columnName: string, value: unknown): string {
  return finalizeTextPreserveColumnValue(columnName, value);
}

/** Échappe une cellule CSV ; force les guillemets pour préserver les zéros en tête dans Excel. */
export function escapeCsvCellValue(val: string, forceQuote = false): string {
  let text = val ?? '';
  if (text.includes('"')) {
    text = text.replace(/"/g, '""');
  }
  if (
    forceQuote ||
    text.includes(';') ||
    text.includes('"') ||
    text.includes('\n') ||
    text.includes('\r')
  ) {
    return `"${text}"`;
  }
  return text;
}

/**
 * Formule CSV reconnue par Excel à l'ouverture directe du fichier :
 * affiche la valeur en texte et conserve les zéros en tête (ex. ="0501415273").
 */
export function excelCsvTextPreserveFormula(text: string): string {
  return `="${text}"`;
}

/** Formate une cellule pour export CSV (texte téléphone / MSISDN toujours entre guillemets). */
export function formatCellForCsvExport(columnName: string | undefined, raw: unknown): string {
  if (raw === undefined || raw === null) {
    return '';
  }

  if (columnName && shouldExportCellAsText(columnName, raw)) {
    const text = formatValueForTextPreserveExport(columnName, raw);
    if (shouldUseExcelCsvTextFormula(columnName, raw)) {
      return escapeCsvCellValue(excelCsvTextPreserveFormula(text), true);
    }
    if (isMsisdnPreserveColumn(columnName) || isLeadingZeroNumericString(raw)) {
      return escapeCsvCellValue(text, true);
    }
    return escapeCsvCellValue(text);
  }

  if (columnName && isTransactionIdPreserveColumn(columnName)) {
    return escapeCsvCellValue(preserveLeadingZeroString(raw), true);
  }

  let val: string;
  if (typeof raw === 'object') {
    try {
      val = JSON.stringify(raw);
    } catch {
      val = String(raw);
    }
  } else {
    val = String(raw);
  }

  return escapeCsvCellValue(val);
}

/** Valeur texte pour export Excel / CSV (complète MSISDN, force chaîne). */
export function exportTextCellValue(columnName: string, value: unknown): string {
  if (!shouldExportCellAsText(columnName, value)) {
    return preserveLeadingZeroString(value).replace(/[\s\u00A0\u202F\u2007\u2060]+/g, '');
  }
  return formatValueForTextPreserveExport(columnName, value);
}
