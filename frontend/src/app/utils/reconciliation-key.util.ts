import { fixCellEncoding } from './encoding-fixer';
import { normalizeColumnKey } from './row-column.util';
import { KeySuggestionService } from '../services/key-suggestion.service';

/** Taille d'échantillon pour la vérification de format (rapide, indépendant du volume). */
export const KEY_FORMAT_SAMPLE_SIZE = 300;

/** Seuil minimal de recouvrement sur échantillon pour valider une paire de clés. */
export const KEY_OVERLAP_MIN_RATIO = 0.05;

/** Colonnes BO couramment utilisées comme clé de réconciliation. */
export const BO_RECONCILIATION_KEY_ALIASES = [
  'CLE',
  'Cle',
  'clé',
  'cle',
  'Key',
  'key',
  'Numéro Trans GU',
  'Numero Trans GU',
  'numtransactiongu',
  'NUMTRANSACTIONGU'
];

/** Colonnes partenaire couramment utilisées comme clé de réconciliation. */
export const PARTNER_REFERENCE_KEY_ALIASES = [
  'Reference Number',
  'reference number',
  'reference_number',
  'external_transaction_id',
  'numtransactiongu',
  'NUMTRANSACTIONGU',
  'Numéro Trans GU',
  'Numero Trans GU',
  'numeroTransGU',
  'ID Opération',
  'ID Operation',
  'IDTransaction',
  'Transaction ID',
  'transaction id',
  'CLE',
  'Cle',
  'cle'
];

export interface ReconciliationKeyFormatCheck {
  boResolvedColumn: string;
  partnerResolvedColumn: string;
  needsNormalization: boolean;
  overlapBefore: number;
  overlapAfter: number;
  overlapRatioBefore: number;
  overlapRatioAfter: number;
  boValuesNeedingFix: number;
  partnerValuesNeedingFix: number;
}

export interface AlignReconciliationKeyFormatsOptions {
  yieldEvery?: number;
  yieldFn?: () => Promise<void> | void;
  onProgress?: (message: string) => void;
}

/** Normalise une valeur de clé de réconciliation (format identique BO / partenaire). */
export function normalizeReconciliationKeyValue(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }

  if (typeof value === 'number') {
    if (!isFinite(value)) {
      return '';
    }
    if (Number.isInteger(value) || Math.abs(value - Math.round(value)) < 1e-9) {
      return String(Math.trunc(value));
    }
    return String(value);
  }

  const str = fixCellEncoding(String(value)).trim();
  if (!str) {
    return '';
  }

  const compact = str.replace(/\s/g, '');
  if (/^-?\d+(?:\.\d+)?[eE][+\-]?\d+$/.test(compact)) {
    const asNumber = Number(compact);
    if (Number.isFinite(asNumber) && Math.abs(asNumber - Math.round(asNumber)) < 1e-9) {
      return String(Math.trunc(asNumber));
    }
  }

  if (/^-?\d+(\.\d+)?$/.test(compact)) {
    const asNumber = Number(compact);
    if (Number.isFinite(asNumber) && Math.abs(asNumber - Math.round(asNumber)) < 1e-9) {
      return String(Math.trunc(asNumber));
    }
  }

  return compact;
}

export function isReconciliationKeyColumn(columnName: string): boolean {
  const normalized = normalizeColumnKey(columnName).replace(/\s/g, '');
  if (normalized === 'cle' || normalized === 'key') {
    return true;
  }
  if (
    normalized.includes('numtransaction') ||
    normalized.includes('numerotransgu') ||
    normalized.includes('numtransgu')
  ) {
    return true;
  }
  if (normalized.includes('reference') && normalized.includes('number')) {
    return true;
  }
  if (normalized.includes('externalid') || normalized.includes('externaltransaction')) {
    return true;
  }
  return false;
}

/** Force les colonnes clé en chaînes comparables (sans traitement par lots async). */
export function coerceReconciliationKeyColumnsInPlace(
  boData: Record<string, string>[],
  boKeyColumn: string,
  partnerData: Record<string, string>[],
  partnerKeyColumn: string
): void {
  const boCol = resolveColumnKeyFromData(boData, boKeyColumn);
  const partnerCol = resolveColumnKeyFromData(partnerData, partnerKeyColumn);

  if (boCol && boData.length) {
    for (let i = 0; i < boData.length; i++) {
      const raw = boData[i][boCol];
      if (raw !== null && raw !== undefined && raw !== '') {
        boData[i][boCol] = normalizeReconciliationKeyValue(raw);
      }
    }
  }

  if (partnerCol && partnerData.length) {
    for (let i = 0; i < partnerData.length; i++) {
      const raw = partnerData[i][partnerCol];
      if (raw !== null && raw !== undefined && raw !== '') {
        partnerData[i][partnerCol] = normalizeReconciliationKeyValue(raw);
      }
    }
  }
}

/** Colonnes à exclure de la détection automatique de colonnes « service ». */
export function isExcludedFromServiceColumnDetection(columnName: string): boolean {
  if (isReconciliationKeyColumn(columnName)) {
    return true;
  }
  const normalized = normalizeColumnKey(columnName).replace(/\s/g, '');
  const blockedFragments = [
    'idtransaction',
    'transactionid',
    'sendermsisdn',
    'receivermsisdn',
    'msisdn',
    'transactionamount',
    'montant',
    'transactiondate',
    'previousbalance',
    'postbalance',
    'transactionstatus',
    'statut',
    'agence',
    'grx',
    'telephone',
    'externaltransaction',
    'sno'
  ];
  return blockedFragments.some(fragment => normalized.includes(fragment));
}

export function resolveColumnKeyFromData(
  data: Record<string, string>[],
  column: string
): string | null {
  if (!data?.length || !column) {
    return null;
  }
  return resolveColumnKeyInRow(data[0], column);
}

function resolveColumnKeyInRow(row: Record<string, string>, column: string): string | null {
  if (!column) {
    return null;
  }
  if (Object.prototype.hasOwnProperty.call(row, column)) {
    return column;
  }
  const target = normalizeColumnKey(column).replace(/\s/g, '');
  for (const key of Object.keys(row)) {
    if (normalizeColumnKey(key).replace(/\s/g, '') === target) {
      return key;
    }
  }
  return null;
}

export function findColumnByAliases(
  availableColumns: string[],
  aliases: string[]
): string | null {
  if (!availableColumns?.length || !aliases?.length) {
    return null;
  }

  const normAvailable = availableColumns.map(column => ({
    column,
    normalized: normalizeColumnKey(column).replace(/\s/g, '')
  }));

  for (const alias of aliases) {
    const target = normalizeColumnKey(alias).replace(/\s/g, '');
    const exact = normAvailable.find(entry => entry.normalized === target);
    if (exact) {
      return exact.column;
    }
  }

  for (const alias of aliases) {
    const target = normalizeColumnKey(alias).replace(/\s/g, '').toLowerCase();
    const match = normAvailable.find(entry => entry.normalized.toLowerCase() === target);
    if (match) {
      return match.column;
    }
  }

  return null;
}

/** Compte les valeurs d'échantillon nécessitant une normalisation (une passe, O(n)). */
function countSampleValuesNeedingNormalization(
  rows: Record<string, string>[],
  resolvedColumn: string,
  sampleSize = KEY_FORMAT_SAMPLE_SIZE
): number {
  const limit = Math.min(sampleSize, rows.length);
  let count = 0;
  for (let i = 0; i < limit; i++) {
    const raw = rows[i][resolvedColumn];
    if (raw == null || raw === '') {
      continue;
    }
    if (normalizeReconciliationKeyValue(raw) !== raw) {
      count++;
    }
  }
  return count;
}

/** Mesure le recouvrement de clés sur un échantillon (Sets, pas de double passe complète). */
export function measureKeyOverlapOnSample(
  boData: Record<string, string>[],
  partnerData: Record<string, string>[],
  boKeyColumn: string,
  partnerKeyColumn: string,
  normalize: boolean,
  sampleSize = KEY_FORMAT_SAMPLE_SIZE
): { matches: number; boSize: number; partnerSize: number } {
  const boResolved = resolveColumnKeyFromData(boData, boKeyColumn);
  const partnerResolved = resolveColumnKeyFromData(partnerData, partnerKeyColumn);
  if (!boResolved || !partnerResolved) {
    return { matches: 0, boSize: 0, partnerSize: 0 };
  }

  const mapValue = normalize
    ? normalizeReconciliationKeyValue
    : (value: unknown) => String(value ?? '').trim();

  const boLimit = Math.min(sampleSize, boData.length);
  const partnerLimit = Math.min(sampleSize, partnerData.length);

  const boSet = new Set<string>();
  for (let i = 0; i < boLimit; i++) {
    const value = mapValue(boData[i][boResolved]);
    if (value) {
      boSet.add(value);
    }
  }

  const partnerSet = new Set<string>();
  for (let i = 0; i < partnerLimit; i++) {
    const value = mapValue(partnerData[i][partnerResolved]);
    if (value) {
      partnerSet.add(value);
    }
  }

  let matches = 0;
  for (const value of boSet) {
    if (partnerSet.has(value)) {
      matches++;
    }
  }

  return { matches, boSize: boSet.size, partnerSize: partnerSet.size };
}

/**
 * Vérifie la compatibilité de format entre deux colonnes clé (échantillon uniquement).
 */
export function verifyReconciliationKeyFormats(
  boData: Record<string, string>[],
  partnerData: Record<string, string>[],
  boKeyColumn: string,
  partnerKeyColumn: string
): ReconciliationKeyFormatCheck {
  const boResolved = resolveColumnKeyFromData(boData, boKeyColumn) || boKeyColumn;
  const partnerResolved = resolveColumnKeyFromData(partnerData, partnerKeyColumn) || partnerKeyColumn;

  const before = measureKeyOverlapOnSample(boData, partnerData, boKeyColumn, partnerKeyColumn, false);
  const after = measureKeyOverlapOnSample(boData, partnerData, boKeyColumn, partnerKeyColumn, true);

  const boValuesNeedingFix = countSampleValuesNeedingNormalization(boData, boResolved);
  const partnerValuesNeedingFix = countSampleValuesNeedingNormalization(partnerData, partnerResolved);

  const overlapRatioBefore = before.matches / Math.max(before.boSize, before.partnerSize, 1);
  const overlapRatioAfter = after.matches / Math.max(after.boSize, after.partnerSize, 1);

  const needsNormalization =
    boValuesNeedingFix > 0 ||
    partnerValuesNeedingFix > 0 ||
    after.matches > before.matches;

  return {
    boResolvedColumn: boResolved,
    partnerResolvedColumn: partnerResolved,
    needsNormalization,
    overlapBefore: before.matches,
    overlapAfter: after.matches,
    overlapRatioBefore,
    overlapRatioAfter,
    boValuesNeedingFix,
    partnerValuesNeedingFix
  };
}

/** Valide qu'une paire de colonnes clé est exploitable (recouvrement sur échantillon normalisé). */
export function areReconciliationKeysCompatible(
  boData: Record<string, string>[],
  partnerData: Record<string, string>[],
  boKeyColumn: string,
  partnerKeyColumn: string,
  minRatio = KEY_OVERLAP_MIN_RATIO
): boolean {
  if (!resolveColumnKeyFromData(boData, boKeyColumn) || !resolveColumnKeyFromData(partnerData, partnerKeyColumn)) {
    return false;
  }

  const check = verifyReconciliationKeyFormats(boData, partnerData, boKeyColumn, partnerKeyColumn);
  return check.overlapRatioAfter >= minRatio || check.overlapAfter >= 2;
}

/** Normalise une colonne clé en place ; ne modifie que les cellules qui changent. */
export function normalizeReconciliationKeyColumnInPlace(
  rows: Record<string, string>[],
  resolvedColumn: string
): number {
  if (!rows.length || !resolvedColumn) {
    return 0;
  }

  let changed = 0;
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const raw = row[resolvedColumn];
    if (raw == null || raw === '') {
      continue;
    }
    const normalized = normalizeReconciliationKeyValue(raw);
    if (normalized !== raw) {
      row[resolvedColumn] = normalized;
      changed++;
    }
  }
  return changed;
}

export function normalizeReconciliationKeyColumnsInRows(
  rows: Record<string, string>[],
  keyColumns: string[]
): Record<string, string>[] {
  const columns = [...new Set(keyColumns.filter(Boolean))];
  if (!rows.length || !columns.length) {
    return rows;
  }

  for (const column of columns) {
    const resolved = resolveColumnKeyFromData(rows, column);
    if (resolved) {
      normalizeReconciliationKeyColumnInPlace(rows, resolved);
    }
  }

  return rows;
}

/**
 * Vérifie le format sur échantillon puis corrige uniquement les colonnes clé si nécessaire.
 * Traitement par lots pour les gros fichiers afin de ne pas bloquer l'UI.
 */
export async function alignReconciliationKeyFormatsAsync(
  boData: Record<string, string>[],
  partnerData: Record<string, string>[],
  boKeyColumn: string,
  partnerKeyColumn: string,
  options?: AlignReconciliationKeyFormatsOptions
): Promise<ReconciliationKeyFormatCheck> {
  const check = verifyReconciliationKeyFormats(boData, partnerData, boKeyColumn, partnerKeyColumn);

  if (!check.needsNormalization) {
    return check;
  }

  const yieldEvery = options?.yieldEvery ?? 10000;
  const yieldFn = options?.yieldFn;
  options?.onProgress?.('Alignement du format des clés de réconciliation...');

  await normalizeKeyColumnBatched(boData, check.boResolvedColumn, yieldEvery, yieldFn);
  await normalizeKeyColumnBatched(partnerData, check.partnerResolvedColumn, yieldEvery, yieldFn);

  return verifyReconciliationKeyFormats(boData, partnerData, boKeyColumn, partnerKeyColumn);
}

async function normalizeKeyColumnBatched(
  rows: Record<string, string>[],
  resolvedColumn: string,
  yieldEvery: number,
  yieldFn?: () => Promise<void> | void
): Promise<number> {
  if (!rows.length || !resolvedColumn) {
    return 0;
  }

  let changed = 0;
  for (let start = 0; start < rows.length; start += yieldEvery) {
    const end = Math.min(start + yieldEvery, rows.length);
    for (let i = start; i < end; i++) {
      const row = rows[i];
      const raw = row[resolvedColumn];
      if (raw == null || raw === '') {
        continue;
      }
      const normalized = normalizeReconciliationKeyValue(raw);
      if (normalized !== raw) {
        row[resolvedColumn] = normalized;
        changed++;
      }
    }
    if (yieldFn && end < rows.length) {
      await yieldFn();
    }
  }
  return changed;
}

function isCompatibleKeyPair(
  boData: Record<string, string>[],
  partnerData: Record<string, string>[],
  boKeyColumn: string,
  partnerKeyColumn: string
): boolean {
  return areReconciliationKeysCompatible(boData, partnerData, boKeyColumn, partnerKeyColumn);
}

export function bruteForceReconciliationKeyMatch(
  boData: Record<string, string>[],
  partnerData: Record<string, string>[]
): { boKeyColumn: string; partnerKeyColumn: string } | null {
  const boCols = Object.keys(boData[0] || {});
  const partnerCols = Object.keys(partnerData[0] || {});
  let best: { bo: string; partner: string; score: number } | null = null;

  for (const boCol of boCols) {
    const boValues = new Set(
      boData
        .slice(0, KEY_FORMAT_SAMPLE_SIZE)
        .map(row => normalizeReconciliationKeyValue(row[boCol]))
        .filter(Boolean)
    );
    if (boValues.size < 2) {
      continue;
    }

    for (const partnerCol of partnerCols) {
      const partnerValues = new Set(
        partnerData
          .slice(0, KEY_FORMAT_SAMPLE_SIZE)
          .map(row => normalizeReconciliationKeyValue(row[partnerCol]))
          .filter(Boolean)
      );
      if (partnerValues.size < 2) {
        continue;
      }

      let overlap = 0;
      for (const value of boValues) {
        if (partnerValues.has(value)) {
          overlap++;
        }
      }

      const score = overlap / Math.max(boValues.size, partnerValues.size);
      if (!best || score > best.score) {
        best = { bo: boCol, partner: partnerCol, score };
      }
    }
  }

  if (best && best.score >= KEY_OVERLAP_MIN_RATIO) {
    return { boKeyColumn: best.bo, partnerKeyColumn: best.partner };
  }

  return null;
}

function tryAliasKeyPair(
  boData: Record<string, string>[],
  partnerData: Record<string, string>[],
  boKeyColumn: string,
  partnerKeyColumn: string
): { boKeyColumn: string; partnerKeyColumn: string } | null {
  if (!isCompatibleKeyPair(boData, partnerData, boKeyColumn, partnerKeyColumn)) {
    return null;
  }
  return { boKeyColumn, partnerKeyColumn };
}

export function discoverReconciliationKeyColumns(
  boData: Record<string, string>[],
  partnerData: Record<string, string>[],
  keySuggestionService?: KeySuggestionService
): { boKeyColumn: string; partnerKeyColumn: string } | null {
  if (!boData?.length || !partnerData?.length) {
    return null;
  }

  const boCols = Object.keys(boData[0] || {});
  const partnerCols = Object.keys(partnerData[0] || {});

  const cleBo = findColumnByAliases(boCols, BO_RECONCILIATION_KEY_ALIASES);
  const clePartner = findColumnByAliases(partnerCols, BO_RECONCILIATION_KEY_ALIASES);
  if (cleBo && clePartner) {
    const pair = tryAliasKeyPair(boData, partnerData, cleBo, clePartner);
    if (pair) {
      return pair;
    }
  }

  if (cleBo) {
    const refPartner = findColumnByAliases(partnerCols, PARTNER_REFERENCE_KEY_ALIASES);
    if (refPartner) {
      const pair = tryAliasKeyPair(boData, partnerData, cleBo, refPartner);
      if (pair) {
        return pair;
      }
    }
  }

  const numBo = findColumnByAliases(boCols, ['Numéro Trans GU', 'Numero Trans GU', 'numtransactiongu']);
  const refPartner = findColumnByAliases(partnerCols, PARTNER_REFERENCE_KEY_ALIASES);
  if (numBo && refPartner) {
    const pair = tryAliasKeyPair(boData, partnerData, numBo, refPartner);
    if (pair) {
      return pair;
    }
  }

  if (keySuggestionService) {
    const analysis = keySuggestionService.analyzeAndSuggestKeys(boData, partnerData);
    const best = analysis.suggestions?.[0];
    if (best && best.confidence >= 0.5) {
      const pair = tryAliasKeyPair(boData, partnerData, best.boColumn, best.partnerColumn);
      if (pair) {
        return pair;
      }
    }
  }

  return bruteForceReconciliationKeyMatch(boData, partnerData);
}
