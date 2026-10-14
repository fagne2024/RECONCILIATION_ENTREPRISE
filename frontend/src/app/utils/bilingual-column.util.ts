import { fixCellEncoding } from './encoding-fixer';
import { normalizeColumnKey, resolveColumnKeyInRow } from './row-column.util';

/**
 * Définition bilingue d'une colonne : libellé FR, libellé EN, identifiant interne stable.
 * Toute variante d'en-tête est résolue vers le même `id`, puis vers le libellé FR canonique.
 */
export interface BilingualColumnDefinition {
  id: string;
  fr: string;
  en: string;
}

/** Rapports marchands Moov / Orange (captures FR et EN). */
export const MERCHANT_REPORT_COLUMNS: BilingualColumnDefinition[] = [
  { id: 'orgShortCode', fr: "Code court de l'organisation", en: 'Organization Short Code' },
  { id: 'orgName', fr: "Nom de l'organisation", en: 'Organization Name' },
  { id: 'profile', fr: 'Profil', en: 'Profile' },
  { id: 'receiptNo', fr: 'N° de reçu', en: 'Receipt No.' },
  { id: 'thirdPartyTxId', fr: 'ID de transaction tiers', en: 'ThirdPartyTransactionId' },
  { id: 'completionTime', fr: 'Heure de fin', en: 'Completion Time' },
  { id: 'initiationTime', fr: "Heure d'initiation", en: 'Initiation Time' },
  { id: 'details', fr: 'Détails', en: 'Details' },
  { id: 'transactionStatus', fr: 'Statut de la transaction', en: 'Transaction Status' },
  { id: 'currency', fr: 'Devise', en: 'Currency' },
  { id: 'paidIn', fr: 'Versé', en: 'Paid In' },
  { id: 'withdrawn', fr: 'Retiré', en: 'Withdrawn' },
  { id: 'balance', fr: 'Solde', en: 'Balance' },
  { id: 'commission', fr: 'Commission', en: 'Commission' },
  { id: 'fee', fr: 'Frais', en: 'Fee' },
  { id: 'tax', fr: 'Impôt', en: 'Tax' },
  { id: 'reasonType', fr: 'Type de motif', en: 'Reason Type' },
  { id: 'remarks', fr: 'REMARKS', en: 'REMARKS' },
  { id: 'initiatorMsisdn', fr: "MSISDN de l'initiateur", en: 'Initiator MSISDN' },
  { id: 'oppositeParty', fr: 'Partie adverse', en: 'Opposite Party' },
  { id: 'linkedTxId', fr: 'ID de transaction liée', en: 'Linked Transaction ID' }
];

/** Alias Orange Money : en-têtes variables des relevés (ex. « Généré le : », « Application : »). */
export const ORANGE_MONEY_COLUMN_DEFINITIONS: BilingualColumnDefinition[] = [
  { id: 'omStatut', fr: 'Statut', en: 'Généré le :' },
  { id: 'omPaiement', fr: 'Paiement', en: 'Application :' }
];

const ORANGE_MONEY_EXTRA_ALIASES: Record<string, string[]> = {
  omStatut: ['Généré le', 'Genere le :', 'Genere le', 'Status', 'État', 'Etat', 'State'],
  omPaiement: ['Application', 'Application:', 'Payment', 'Moyen de Paiement', 'Moyen paiement']
};

/** Champs métier ReconciliApp (écarts BO, TRX, etc.) — alias FR / EN. */
export const BILINGUAL_COLUMN_ALIASES = {
  date: [
    'Date', 'date', 'DATE', 'jour', 'Jour', 'JOUR', 'dateTransaction', 'DateTransaction',
    'Initiation Time', "Heure d'initiation", 'Heure d initiation', 'Completion Time', 'Heure de fin',
    'Date opération', 'Date operation', 'Transaction Date'
  ],
  agence: [
    'Agence', 'agence', 'AGENCE', 'agency', 'Agency', 'Agent', 'agent',
    'Organization Short Code', "Code court de l'organisation", 'Code court de l organisation',
    'Code proprietaire', 'Code propriétaire', 'Code reseau', 'Code réseau'
  ],
  service: [
    'Service', 'service', 'SERVICE', 'serv', 'Serv', 'Service Name', 'Nom du service',
    'Code service', 'Details', 'Détails', 'Type Opération', 'Type Operation',
    "Type d'opération", 'Operation Type', 'Reason Type', 'Type de motif'
  ],
  pays: [
    'Pays', 'pays', 'PAYS', 'country', 'Country', 'GRX', 'grx', 'Pays provenance', 'Country of origin',
    'Currency', 'Devise'
  ],
  montant: [
    'montant', 'Montant', 'MONTANT', 'amount', 'Amount', 'volume', 'Volume', 'VOLUME',
    'Paid In', 'Versé', 'Verse', 'Withdrawn', 'Retiré', 'Retire', 'Balance', 'Solde'
  ],
  statut: [
    'Statut', 'statut', 'STATUT', 'status', 'Status', 'Transaction Status', 'Statut de la transaction',
    'Etat', 'State', 'Généré le :', 'Généré le', 'Genere le :', 'Genere le'
  ],
  paiement: [
    'Paiement', 'paiement', 'PAIEMENT', 'payment', 'Payment',
    'Application :', 'Application:', 'Application', 'Moyen de Paiement', 'Moyen paiement'
  ],
  receipt: [
    'Receipt No.', 'Receipt No', 'N° de reçu', 'N de recu', 'Numero de recu', 'Numéro de reçu',
    'ID Transaction', 'Transaction ID', 'ThirdPartyTransactionId', 'ID de transaction tiers',
    'Linked Transaction ID', 'ID de transaction liée'
  ]
} as const;

/** Index normalisé → définition (FR, EN, id). - Lazy initialization to avoid circular dependency */
let NORMALIZED_HEADER_INDEX: Map<string, BilingualColumnDefinition> | null = null;

function getNormalizedHeaderIndex(): Map<string, BilingualColumnDefinition> {
  if (NORMALIZED_HEADER_INDEX) {
    return NORMALIZED_HEADER_INDEX;
  }
  const index = new Map<string, BilingualColumnDefinition>();
  const register = (label: string, def: BilingualColumnDefinition) => {
    const key = normalizeColumnKey(fixCellEncoding(label));
    if (key && !index.has(key)) {
      index.set(key, def);
    }
  };

  for (const def of MERCHANT_REPORT_COLUMNS) {
    register(def.fr, def);
    register(def.en, def);
    register(def.fr.replace(/'/g, ''), def);
    register(def.en.replace(/\./g, ''), def);
  }

  for (const def of ORANGE_MONEY_COLUMN_DEFINITIONS) {
    register(def.fr, def);
    register(def.en, def);
    register(def.en.replace(/\s*:\s*$/, ''), def);
    const extras = ORANGE_MONEY_EXTRA_ALIASES[def.id] || [];
    for (const extra of extras) {
      register(extra, def);
    }
  }

  for (const aliases of Object.values(BILINGUAL_COLUMN_ALIASES)) {
    for (const alias of aliases) {
      register(alias, { id: alias, fr: alias, en: alias });
    }
  }

  NORMALIZED_HEADER_INDEX = index;
  return index;
}

/** Motifs d'en-tête pour rapports marchands Moov / Orange (FR ou EN). - Lazy to avoid circular dep */
let _merchantReportHeaderMarkers: string[] | null = null;
export function getMerchantReportHeaderMarkers(): string[] {
  if (_merchantReportHeaderMarkers) {
    return _merchantReportHeaderMarkers;
  }
  _merchantReportHeaderMarkers = MERCHANT_REPORT_COLUMNS.flatMap(def => [
    normalizeHeaderForMatch(def.en),
    normalizeHeaderForMatch(def.fr)
  ]).filter(Boolean);
  return _merchantReportHeaderMarkers;
}

export function normalizeHeaderForMatch(header: string): string {
  return normalizeColumnKey(fixCellEncoding(header || ''));
}

/**
 * Résout un en-tête (FR, EN ou variante) vers son identifiant canonique.
 * Ex. "Receipt No." et "N° de reçu" → "receiptNo"
 */
export function resolveCanonicalColumnId(header: string): string | null {
  const normalized = normalizeHeaderForMatch(header);
  if (!normalized) {
    return null;
  }

  const exact = getNormalizedHeaderIndex().get(normalized);
  if (exact) {
    return exact.id;
  }

  for (const def of MERCHANT_REPORT_COLUMNS) {
    const frNorm = normalizeHeaderForMatch(def.fr);
    const enNorm = normalizeHeaderForMatch(def.en);
    if (normalized.includes(frNorm) || frNorm.includes(normalized)) {
      return def.id;
    }
    if (normalized.includes(enNorm) || enNorm.includes(normalized)) {
      return def.id;
    }
  }

  for (const def of ORANGE_MONEY_COLUMN_DEFINITIONS) {
    const frNorm = normalizeHeaderForMatch(def.fr);
    const enNorm = normalizeHeaderForMatch(def.en);
    if (normalized === frNorm || normalized === enNorm) {
      return def.id;
    }
    if (def.id === 'omStatut' && normalized.includes('genere le')) {
      return def.id;
    }
    if (def.id === 'omPaiement' && normalized.startsWith('application')) {
      return def.id;
    }
  }

  return null;
}

/** Libellé FR canonique pour un id (utilisé après normalisation des fichiers EN). */
export function getCanonicalFrenchLabel(columnId: string): string | null {
  const merchantDef = MERCHANT_REPORT_COLUMNS.find(d => d.id === columnId);
  if (merchantDef) {
    return merchantDef.fr;
  }
  const orangeMoneyDef = ORANGE_MONEY_COLUMN_DEFINITIONS.find(d => d.id === columnId);
  return orangeMoneyDef?.fr ?? null;
}

/** Alias Orange Money supplémentaires pour une colonne configurée dans un modèle. */
export function getOrangeMoneyAliasHeadersForColumn(column: string): string[] {
  const columnId = resolveCanonicalColumnId(column);
  if (!columnId) {
    return [];
  }
  const def = ORANGE_MONEY_COLUMN_DEFINITIONS.find(d => d.id === columnId);
  if (!def) {
    return [];
  }
  const aliases = new Set<string>([def.fr, def.en, def.en.replace(/\s*:\s*$/, '')]);
  for (const extra of ORANGE_MONEY_EXTRA_ALIASES[columnId] || []) {
    aliases.add(extra);
  }
  return Array.from(aliases).filter(alias => alias && alias !== column);
}

/**
 * Transforme une liste d'en-têtes bruts en libellés FR canoniques quand une correspondance existe.
 * Colonnes inconnues : conservées telles quelles.
 */
export function normalizeHeadersToFrench(headers: string[]): string[] {
  return headers.map(header => {
    const id = resolveCanonicalColumnId(header);
    if (!id) {
      return header;
    }
    return getCanonicalFrenchLabel(id) || header;
  });
}

/**
 * Enrichit une ligne : pour chaque colonne reconnue, ajoute la clé FR canonique
 * (sans supprimer l'en-tête d'origine). Permet aux modèles configurés en FR de fonctionner
 * avec des fichiers EN.
 */
export function enrichRowWithCanonicalFrenchColumns(row: Record<string, string>): Record<string, string> {
  const aliases = buildFrenchAliasEntries(Object.keys(row));
  if (!aliases.length) {
    return row;
  }
  return applyFrenchAliasesToRow(row, aliases);
}

export interface FrenchAliasEntry {
  frenchKey: string;
  sourceKey: string;
}

/** Alias FR à ajouter une seule fois (calculé sur les en-têtes, pas par ligne). */
export function buildFrenchAliasEntries(headers: string[]): FrenchAliasEntry[] {
  const entries: FrenchAliasEntry[] = [];
  const seen = new Set<string>();

  for (const key of headers) {
    const id = resolveCanonicalColumnId(key);
    if (!id) {
      continue;
    }
    const fr = getCanonicalFrenchLabel(id);
    if (!fr || fr === key || seen.has(fr)) {
      continue;
    }
    seen.add(fr);
    entries.push({ frenchKey: fr, sourceKey: key });
  }

  return entries;
}

/** Ajoute les clés FR manquantes sans recopier toute la ligne si inutile. */
export function applyFrenchAliasesToRow(
  row: Record<string, string>,
  aliases: readonly FrenchAliasEntry[]
): Record<string, string> {
  if (!aliases.length) {
    return row;
  }

  for (const { frenchKey, sourceKey } of aliases) {
    const value = row[sourceKey];
    if (value == null || String(value).trim() === '') {
      continue;
    }
    if (!row[frenchKey] || String(row[frenchKey]).trim() === '') {
      row[frenchKey] = String(value).trim();
    }
  }

  return row;
}

/** Lit une valeur dans un enregistrement en testant plusieurs alias (FR / EN). */
export function getRecordValueByAliases(
  record: Record<string, string>,
  aliasKeys: readonly string[]
): string {
  for (const key of aliasKeys) {
    const resolved = resolveColumnKeyInRow(record, key);
    if (resolved && record[resolved] != null && String(record[resolved]).trim() !== '') {
      return String(record[resolved]).trim();
    }
    if (record[key] != null && String(record[key]).trim() !== '') {
      return String(record[key]).trim();
    }
  }

  const targetKeys = new Set(aliasKeys.map(k => normalizeHeaderForMatch(k)));
  for (const [rawKey, rawValue] of Object.entries(record)) {
    if (rawValue == null || String(rawValue).trim() === '') {
      continue;
    }
    if (targetKeys.has(normalizeHeaderForMatch(rawKey))) {
      return String(rawValue).trim();
    }
    const canonicalId = resolveCanonicalColumnId(rawKey);
    if (canonicalId) {
      for (const alias of aliasKeys) {
        if (resolveCanonicalColumnId(alias) === canonicalId) {
          return String(rawValue).trim();
        }
      }
    }
  }

  return '';
}

/** Lit une valeur via l'id canonique (ex. 'receiptNo', 'initiationTime'). */
export function getRecordValueByCanonicalId(
  record: Record<string, string>,
  columnId: string
): string {
  const def = MERCHANT_REPORT_COLUMNS.find(d => d.id === columnId);
  if (!def) {
    return '';
  }
  return getRecordValueByAliases(record, [def.fr, def.en]);
}

/** Score une ligne de grille pour détecter un en-tête de rapport marchand (FR / EN). */
export function scoreMerchantReportHeaderRow(cells: string[]): number {
  if (!cells?.length) {
    return 0;
  }

  const normalized = cells
    .map(c => normalizeHeaderForMatch(c || ''))
    .filter(Boolean);

  if (normalized.length < 6) {
    return 0;
  }

  let score = 0;
  let matchedCanonical = 0;

  for (const cell of normalized) {
    for (const marker of getMerchantReportHeaderMarkers()) {
      if (cell.includes(marker) || marker.includes(cell)) {
        score += 6;
        break;
      }
    }
    if (resolveCanonicalColumnId(cell)) {
      matchedCanonical += 1;
    }
  }

  score += matchedCanonical * 4;

  const hasOrg = normalized.some(c =>
    c.includes('organization short code') || c.includes('code court de l organisation')
  );
  const hasReceipt = normalized.some(c =>
    c.includes('receipt no') || c.includes('n de recu') || c.includes('recu')
  );
  const hasTime = normalized.some(c =>
    c.includes('initiation time') || c.includes('heure d initiation') || c.includes('heure de fin')
  );
  const hasStatus = normalized.some(c =>
    c.includes('transaction status') || c.includes('statut de la transaction')
  );

  if (hasOrg && hasReceipt) score += 25;
  if (hasTime && hasStatus) score += 20;
  if (hasOrg && hasReceipt && hasTime && hasStatus) score += 40;

  return score;
}

/** Détecte l'index de la ligne d'en-tête d'un rapport marchand (Moov / Orange, FR ou EN). */
export function detectMerchantReportHeaderIndex(jsonData: any[][]): number | null {
  const scanLimit = Math.min(40, jsonData.length);
  let bestIndex: number | null = null;
  let bestScore = 0;

  for (let i = 0; i < scanLimit; i++) {
    const row = jsonData[i];
    if (!Array.isArray(row)) {
      continue;
    }
    const cells = row.map(cell =>
      fixCellEncoding(cell !== null && cell !== undefined ? String(cell).trim() : '')
    );
    const score = scoreMerchantReportHeaderRow(cells);
    if (score > bestScore) {
      bestScore = score;
      bestIndex = i;
    }
  }

  return bestScore >= 40 ? bestIndex : null;
}

function pickPreferredBilingualColumn(
  candidates: string[],
  preferredHeaders: string[] = []
): string {
  if (!candidates.length) {
    return '';
  }
  if (candidates.length === 1) {
    return candidates[0];
  }

  const preferredSet = new Set(preferredHeaders);
  const preferredNorm = new Set(preferredHeaders.map(h => normalizeHeaderForMatch(h)));

  for (const col of candidates) {
    if (preferredSet.has(col)) {
      return col;
    }
  }
  for (const col of candidates) {
    if (preferredNorm.has(normalizeHeaderForMatch(col))) {
      return col;
    }
  }

  const canonicalId = resolveCanonicalColumnId(candidates[0]);
  if (canonicalId) {
    const fr = getCanonicalFrenchLabel(canonicalId);
    if (fr) {
      const frMatch = candidates.find(
        col => normalizeHeaderForMatch(col) === normalizeHeaderForMatch(fr)
      );
      if (frMatch) {
        return frMatch;
      }
      return fr;
    }
  }

  return candidates[0];
}

function groupHeadersByCanonicalId(headers: string[]): Map<string, string[]> {
  const groups = new Map<string, string[]>();
  for (const key of headers) {
    const id = resolveCanonicalColumnId(key) || `__raw__:${normalizeHeaderForMatch(key)}`;
    const group = groups.get(id) || [];
    group.push(key);
    groups.set(id, group);
  }
  return groups;
}

/**
 * Retire les doublons FR/EN dans une liste de colonnes (une seule colonne par concept).
 */
export function dedupeBilingualColumnNames(
  columns: string[],
  preferredHeaders: string[] = []
): string[] {
  if (!columns.length) {
    return [];
  }

  const groups = groupHeadersByCanonicalId(columns);
  const orderSource = preferredHeaders.length
    ? [...preferredHeaders, ...columns.filter(col => !preferredHeaders.includes(col))]
    : columns;

  const orderedIds: string[] = [];
  const seenIds = new Set<string>();
  for (const col of orderSource) {
    const id = resolveCanonicalColumnId(col) || `__raw__:${normalizeHeaderForMatch(col)}`;
    if (!seenIds.has(id)) {
      seenIds.add(id);
      orderedIds.push(id);
    }
  }
  for (const id of groups.keys()) {
    if (!seenIds.has(id)) {
      seenIds.add(id);
      orderedIds.push(id);
    }
  }

  const result: string[] = [];
  const seenNames = new Set<string>();
  for (const id of orderedIds) {
    const picked = pickPreferredBilingualColumn(groups.get(id) || [], preferredHeaders);
    if (picked && !seenNames.has(picked)) {
      seenNames.add(picked);
      result.push(picked);
    }
  }
  return result;
}

/**
 * Fusionne les colonnes FR/EN jumelées : une valeur et un libellé par concept canonique.
 */
export function mergeBilingualColumnsInRows(
  rows: Record<string, string>[],
  preferredHeaders: string[] = []
): { rows: Record<string, string>[]; columns: string[] } {
  if (!rows.length) {
    return { rows: [], columns: [] };
  }

  const allHeaders = new Set<string>();
  for (const row of rows) {
    for (const key of Object.keys(row)) {
      allHeaders.add(key);
    }
  }

  const groups = groupHeadersByCanonicalId([...allHeaders]);
  const columns = dedupeBilingualColumnNames([...allHeaders], preferredHeaders);

  const mergedRows = rows.map(row => {
    const merged: Record<string, string> = {};
    for (const [id, keys] of groups) {
      const outputKey = pickPreferredBilingualColumn(keys, preferredHeaders);
      if (!outputKey) {
        continue;
      }
      let value = '';
      for (const key of keys) {
        const cell = row[key];
        if (cell != null && String(cell).trim() !== '') {
          value = String(cell).trim();
          break;
        }
      }
      merged[outputKey] = value;
    }
    return merged;
  });

  const orderedColumns = columns.length
    ? columns
    : Object.keys(mergedRows[0] || {});

  const orderedRows = mergedRows.map(row => {
    const ordered: Record<string, string> = {};
    for (const col of orderedColumns) {
      ordered[col] = row[col] ?? '';
    }
    return ordered;
  });

  return { rows: orderedRows, columns: orderedColumns };
}
