/**
 * Détection de la ligne d'en-tête à partir des colonnes attendues
 * (fichier modèle du watch-folder, règles de traitement, etc.).
 */

import { resolveCanonicalColumnId } from './bilingual-column.util';

export function normalizeHeaderLabelForMatch(label: string): string {
  return (label || '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[_\s./\\-]+/g, ' ')
    .replace(/[^\w\sàâäéèêëïîôùûüç]/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function headerLabelsMatch(cell: string, expected: string): boolean {
  if (!cell || !expected) {
    return false;
  }
  if (cell === expected) {
    return true;
  }
  if (cell.length >= 3 && expected.length >= 3) {
    return cell.includes(expected) || expected.includes(cell);
  }
  return false;
}

/**
 * Score une ligne comme en-tête modèle (0 = pas assez de correspondances).
 * Une colonne attendue est trouvée si son libellé correspond, ou si la cellule désigne
 * la même colonne en français ou en anglais (ex. « Numéro de compte » / « Account Number »).
 */
export function scoreHeaderRowMatch(rowCells: string[], expectedColumns: string[]): number {
  const expected = (expectedColumns || [])
    .map(col => ({ norm: normalizeHeaderLabelForMatch(col), id: resolveCanonicalColumnId(col) }))
    .filter(e => !!e.norm);
  if (!expected.length) {
    return 0;
  }

  const rawCells = (rowCells || []).map(cell => String(cell ?? ''));
  const row = rawCells
    .map(cell => normalizeHeaderLabelForMatch(cell))
    .filter(Boolean);
  if (row.length < 2) {
    return 0;
  }
  const rowIds = new Set<string>();
  for (const cell of rawCells) {
    const id = resolveCanonicalColumnId(cell);
    if (id) {
      rowIds.add(id);
    }
  }

  let matches = 0;
  for (const exp of expected) {
    const byLabel = row.some(cell => headerLabelsMatch(cell, exp.norm));
    const byColumn = !!exp.id && rowIds.has(exp.id);
    if (byLabel || byColumn) {
      matches++;
    }
  }

  const minMatches = Math.max(2, Math.ceil(expected.length * 0.35));
  if (matches < minMatches) {
    return 0;
  }

  const ratio = matches / expected.length;
  return matches * 100 + ratio * 50;
}

/** Cherche la meilleure ligne d'en-tête dans une grille (CSV / Excel). */
export function findHeaderRowIndexInGrid(
  grid: unknown[][],
  expectedColumns: string[],
  maxScanRows = 80
): number | null {
  if (!grid?.length || !expectedColumns?.length) {
    return null;
  }

  const limit = Math.min(maxScanRows, grid.length);
  let bestIndex: number | null = null;
  let bestScore = 0;

  for (let i = 0; i < limit; i++) {
    const row = grid[i];
    if (!Array.isArray(row) || !row.length) {
      continue;
    }
    const cells = row.map(cell => String(cell ?? '').trim());
    const score = scoreHeaderRowMatch(cells, expectedColumns);
    if (score > bestScore) {
      bestScore = score;
      bestIndex = i;
    }
  }

  return bestIndex;
}

/** Cherche l'index de la ligne d'en-tête dans des lignes CSV brutes. */
export function findHeaderLineIndexInCsvLines(
  lines: string[],
  delimiter: string,
  expectedColumns: string[],
  maxScanLines = 80
): number | null {
  if (!lines?.length || !expectedColumns?.length) {
    return null;
  }

  const limit = Math.min(maxScanLines, lines.length);
  let bestIndex: number | null = null;
  let bestScore = 0;

  for (let i = 0; i < limit; i++) {
    const line = lines[i];
    if (!line?.trim()) {
      continue;
    }
    const cells = line.split(delimiter).map(cell => cell.trim());
    const score = scoreHeaderRowMatch(cells, expectedColumns);
    if (score > bestScore) {
      bestScore = score;
      bestIndex = i;
    }
  }

  return bestIndex;
}

/** Indique si une ligne ressemble à un préambule Airtel (User ou Customer report). */
export function looksLikeAirtelReportPreamble(cells: string[]): boolean {
  const lower = cells.join(' ').toLowerCase();
  return (
    lower.includes('user_transaction_report') ||
    lower.includes('user transaction report') ||
    lower.includes('customer_transaction_report') ||
    lower.includes('customer transaction report') ||
    (lower.includes('selection criteria') && (lower.includes('from date') || lower.includes('to date')))
  );
}

/** En-tête transactionnel Airtel (User ou Customer report). */
export function looksLikeAirtelTransactionalHeader(cells: string[]): boolean {
  const lower = cells.join(' ').toLowerCase();
  const hasTransactionId = lower.includes('transaction id') || lower.includes('transaction_id');
  const hasSerialOrSender =
    lower.includes('s. no') ||
    lower.includes('s.no') ||
    lower.includes('record no') ||
    lower.includes('record_no') ||
    lower.includes('sender msisdn') ||
    lower.includes('sender_msisdn') ||
    lower.includes('payer mobile number');
  return hasTransactionId && hasSerialOrSender;
}

/**
 * Préambule du relevé GDJ (LA GABONAISE DES JEUX / partenaires mobile money).
 * Ces lignes de métadonnées précèdent l'en-tête transactionnel :
 * Account Holder:, Short Code:, Account:, Time Period:, Operator:, ...
 */
export function looksLikeGdjReportPreamble(cells: string[]): boolean {
  const lower = (cells || []).join(' ').toLowerCase();
  return (
    lower.includes('account holder:') ||
    lower.includes('short code:') ||
    lower.includes('time period:') ||
    (lower.includes('operator:') && lower.includes('organization:')) ||
    lower.includes('date of report:')
  );
}

/** En-tête transactionnel GDJ (Receipt No. + Completion Time + statut / flux financier). */
export function looksLikeGdjTransactionalHeader(cells: string[]): boolean {
  const lower = (cells || []).join(' ').toLowerCase();
  const hasReceipt = lower.includes('receipt no');
  const hasCompletion = lower.includes('completion time');
  const hasFinancial =
    lower.includes('transaction status') ||
    lower.includes('paid in') ||
    lower.includes('withdrawn') ||
    lower.includes('balance') ||
    lower.includes('linked transaction id');
  return hasReceipt && hasCompletion && hasFinancial;
}

/** Cherche la ligne d'en-tête GDJ dans des lignes CSV brutes (préambule ignoré). */
export function findGdjHeaderLineIndexInCsvLines(
  lines: string[],
  delimiter: string,
  maxScanLines = 30
): number | null {
  const limit = Math.min(maxScanLines, (lines || []).length);
  for (let i = 0; i < limit; i++) {
    const line = lines[i];
    if (!line?.trim()) {
      continue;
    }
    const cells = line.split(delimiter).map(cell => cell.trim());
    if (looksLikeGdjTransactionalHeader(cells)) {
      return i;
    }
  }
  return null;
}

/* ------------------------------------------------------------------------------------------
 * Détection générique (sans modèle) : en-tête + lignes parasites entre l'en-tête et les données.
 * Ex. rapports à préambule : « Present Date and Time=… », « File Number=1 », « [STARTDATA] ».
 * Utilisé par le traitement manuel (lecture CSV) et le traitement automatique (grille).
 * ------------------------------------------------------------------------------------------ */

const NUMERIC_LIKE_CELL = /^[\d\s.,:/\-+()%]+$/;

function trimmedCells(cells: unknown[]): string[] {
  return (cells || []).map(cell => String(cell ?? '').trim());
}

/** Nombre de cellules non vides d'une ligne. */
export function countFilledCells(cells: unknown[]): number {
  return trimmedCells(cells).filter(Boolean).length;
}

/**
 * Valeur de type marqueur / métadonnées : « [STARTDATA] », « Date=… », « Account Holder: ».
 * Une valeur simple « 12345 » ou « 05/11/2026 » n'en est pas une.
 */
export function isMarkerCellValue(value: string): boolean {
  const v = (value || '').trim();
  if (!v) {
    return false;
  }
  if (/^\[.*\]$/.test(v)) {
    return true;
  }
  if (v.includes('=') && !NUMERIC_LIKE_CELL.test(v.replace(/=/g, ''))) {
    return true;
  }
  return /:$/.test(v);
}

/** Ligne qui ne porte qu'une seule valeur, de type marqueur ou métadonnées. */
export function isMarkerRow(cells: unknown[]): boolean {
  const filled = trimmedCells(cells).filter(Boolean);
  return filled.length === 1 && isMarkerCellValue(filled[0]);
}

/** Ligne ressemblant à un en-tête : au moins 2 cellules, majoritairement textuelles. */
export function isTextHeaderLikeRow(cells: unknown[]): boolean {
  const filled = trimmedCells(cells).filter(Boolean);
  if (filled.length < 2) {
    return false;
  }
  const textual = filled.filter(
    cell => !NUMERIC_LIKE_CELL.test(cell) && !cell.includes('=') && cell.length <= 80
  ).length;
  return textual / filled.length >= 0.7;
}

/**
 * Index de la ligne d'en-tête dans une grille sans modèle : première ligne textuelle
 * (≥ 2 cellules) suivie, dans les lignes proches, d'une ligne de données bien remplie.
 * Les lignes de titre, de métadonnées ou de marqueur (1 cellule) sont donc ignorées.
 */
export function detectGenericHeaderRowIndex(grid: unknown[][], maxScanRows = 30): number | null {
  if (!grid?.length) {
    return null;
  }
  const limit = Math.min(maxScanRows, grid.length);
  for (let i = 0; i < limit; i++) {
    const cells = grid[i];
    if (!isTextHeaderLikeRow(cells)) {
      continue;
    }
    const minData = Math.max(2, Math.ceil(countFilledCells(cells) * 0.5));
    const end = Math.min(grid.length, i + 1 + 15);
    for (let j = i + 1; j < end; j++) {
      if (countFilledCells(grid[j]) >= minData && !isMarkerRow(grid[j])) {
        return i;
      }
    }
  }
  return null;
}

/**
 * Filtre des lignes après l'en-tête. Écarte les marqueurs ([STARTDATA]…) partout, et les
 * lignes peu remplies tant que la première vraie ligne de données n'est pas atteinte.
 * Retourne un prédicat à appeler pour chaque ligne, dans l'ordre du fichier.
 */
export function createPostHeaderRowFilter(headerWidth: number): (cells: unknown[]) => boolean {
  const minFilled = Math.max(2, Math.ceil(headerWidth * 0.3));
  let dataStarted = false;
  return (cells: unknown[]) => {
    if (isMarkerRow(cells)) {
      return false;
    }
    if (dataStarted) {
      return true;
    }
    if (countFilledCells(cells) >= minFilled) {
      dataStarted = true;
      return true;
    }
    return false;
  };
}
