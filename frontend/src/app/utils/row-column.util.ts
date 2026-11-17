import { fixCellEncoding } from './encoding-fixer';
import { getCanonicalFrenchLabel, resolveCanonicalColumnId, resolveTrxboColumnId } from './bilingual-column.util';

/**
 * Désambiguïse une liste d'en-têtes (y compris les doublons) en noms de colonnes uniques.
 * Quand une feuille a deux colonnes portant le même libellé (ex. « N° de Compte », « Wallet »
 * présents deux fois dans un relevé Orange Money), la 2e occurrence reçoit un suffixe
 * « (2) », la 3e « (3) », etc. Prise en compte de la casse/dos-doubles pour éviter de
 * compter deux fois le même libellé exact ; la comparaison se fait de façon normalisée
 * (accents/casse), mais le nom retourné reste l'original nettoyé.
 */
export function deduplicateHeaderNames(headers: string[]): string[] {
  const seenNormalized = new Map<string, number>(); // normalisé -> compteur
  const result: string[] = [];

  for (const raw of headers) {
    const cleaned = (raw || '').trim();
    if (!cleaned) {
      result.push(cleaned);
      continue;
    }
    const key = normalizeColumnKey(cleaned);
    const count = (seenNormalized.get(key) ?? 0) + 1;
    seenNormalized.set(key, count);
    result.push(count === 1 ? cleaned : `${cleaned} (${count})`);
  }

  return result;
}

/** Colonnes présentes deux fois dans un relevé Orange Money dont on garde la 2e occurrence. */
export const ORANGE_MONEY_KEEP_SECOND_COLUMNS = ['N° de Compte'];

/**
 * Relevé Orange Money : la colonne « N° de Compte » apparaît deux fois (compte du titulaire, puis
 * compte de la contrepartie, renommé « N° de Compte (2) » à la lecture). On garde la 2e : sa valeur
 * remplace la 1re, à la position de la 2e, sous le nom d'origine « N° de Compte ».
 * Sans doublon, les lignes sont renvoyées telles quelles.
 */
export function keepSecondDuplicateColumns(
  rows: Record<string, any>[],
  baseColumns: string[] = ORANGE_MONEY_KEEP_SECOND_COLUMNS
): Record<string, any>[] {
  if (!rows?.length) return rows;
  const keys = Object.keys(rows[0]);
  const renames: { first: string; second: string }[] = [];
  for (const base of baseColumns) {
    const baseKey = normalizeColumnKey(base);
    const first = keys.find(k => normalizeColumnKey(k) === baseKey);
    const second = keys.find(k => normalizeColumnKey(k) === `${baseKey} (2)`);
    if (first && second) renames.push({ first, second });
  }
  if (!renames.length) return rows;

  const firstKeys = new Set(renames.map(r => r.first));
  const secondToName = new Map(renames.map(r => [r.second, r.first] as [string, string]));
  return rows.map(row => {
    const out: Record<string, any> = {};
    for (const key of Object.keys(row)) {
      if (firstKeys.has(key)) continue;
      out[secondToName.get(key) ?? key] = row[key];
    }
    return out;
  });
}

/** Vrai si les colonnes ressemblent à un relevé Orange Money (colonne « N° Pseudo »). */
export function looksLikeOrangeMoneyStatement(columns: string[]): boolean {
  return columns.some(c => normalizeColumnKey(c) === 'n° pseudo');
}

/** Normalise un nom de colonne pour comparaison (accents, casse, espaces). */
export function normalizeColumnKey(columnName: string): string {
  return fixCellEncoding(columnName || '')
    .trim()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

export type ColumnKeyResolver = (row: Record<string, string>, column: string) => string | null;

/**
 * Version mémorisée de {@link resolveColumnKeyInRow} pour les traitements sur toutes les lignes.
 * Le résultat ne dépend que des noms de colonnes de la ligne : il est calculé une fois par
 * structure de ligne (liste des clés) et par colonne. Sans ce cache, une colonne absente du
 * fichier recompare tous les en-têtes normalisés à chaque cellule (≈ 11 s pour 20 000 lignes
 * TRXBO en prod). À créer pour un traitement donné : les lignes ne doivent pas changer de
 * colonnes pendant son utilisation.
 */
export function createColumnKeyResolver(): ColumnKeyResolver {
  const signatureByRow = new WeakMap<object, string>();
  const keysBySignature = new Map<string, Map<string, string | null>>();
  return (row, column) => {
    if (!column || !row) {
      return null;
    }
    let signature = signatureByRow.get(row);
    if (signature === undefined) {
      signature = Object.keys(row).join('\u0001');
      signatureByRow.set(row, signature);
    }
    let keys = keysBySignature.get(signature);
    if (!keys) {
      keys = new Map();
      keysBySignature.set(signature, keys);
    }
    let key = keys.get(column);
    if (key === undefined) {
      key = resolveColumnKeyInRow(row, column);
      keys.set(column, key);
    }
    return key;
  };
}

/** Trouve la clé réelle dans une ligne à partir du nom configuré. */
export function resolveColumnKeyInRow(row: Record<string, string>, column: string): string | null {
  if (!column || !row) {
    return null;
  }

  const candidates = [column, fixCellEncoding(column)];
  for (const candidate of candidates) {
    if (candidate && Object.prototype.hasOwnProperty.call(row, candidate)) {
      return candidate;
    }
  }

  const targetKey = normalizeColumnKey(column);
  for (const key of Object.keys(row)) {
    if (normalizeColumnKey(key) === targetKey) {
      return key;
    }
  }

  const targetCanonicalId = resolveCanonicalColumnId(column);
  if (targetCanonicalId) {
    for (const key of Object.keys(row)) {
      if (resolveCanonicalColumnId(key) === targetCanonicalId) {
        return key;
      }
    }
  }

  // Colonnes du fichier BO (TRXBO) : modèle configuré en FR, export en EN (ou l'inverse).
  const targetTrxboId = resolveTrxboColumnId(column);
  if (targetTrxboId) {
    for (const key of Object.keys(row)) {
      if (resolveTrxboColumnId(key) === targetTrxboId) {
        return key;
      }
    }
  }

  return null;
}

/** Toutes les clés d'une ligne partageant le même identifiant canonique (FR / EN). */
export function resolveCanonicalColumnKeysInRow(
  row: Record<string, string>,
  column: string
): string[] {
  if (!row) {
    return [];
  }

  const primary = resolveColumnKeyInRow(row, column);
  if (!primary) {
    return [];
  }

  const canonicalId = resolveCanonicalColumnId(column) ?? resolveCanonicalColumnId(primary);
  if (!canonicalId) {
    return [primary];
  }

  const keys = new Set<string>([primary]);
  for (const key of Object.keys(row)) {
    if (resolveCanonicalColumnId(key) === canonicalId) {
      keys.add(key);
    }
  }

  const frenchLabel = getCanonicalFrenchLabel(canonicalId);
  if (frenchLabel && Object.prototype.hasOwnProperty.call(row, frenchLabel)) {
    keys.add(frenchLabel);
  }

  return Array.from(keys);
}

/** Lit la valeur d'une cellule en résolvant le nom de colonne (accents / encodage). */
export function getRowColumnValue(row: Record<string, unknown>, column: string): unknown {
  if (!row || !column) {
    return '';
  }

  const key = resolveColumnKeyInRow(row as Record<string, string>, column);
  if (!key) {
    return '';
  }

  const value = row[key];
  if (value === undefined || value === null) {
    return '';
  }

  return value;
}

/**
 * Renomme une clé de colonne en conservant sa position dans l'ordre des colonnes.
 * (delete + assign déplacerait la colonne à la fin avec Object.keys.)
 */
export function renameKeyPreservingOrder<T extends Record<string, unknown>>(
  row: T,
  sourceColumn: string,
  targetColumn: string
): T {
  if (!sourceColumn || !targetColumn || sourceColumn === targetColumn) {
    return row;
  }

  const sourceKey = resolveColumnKeyInRow(row as Record<string, string>, sourceColumn);
  if (!sourceKey || !Object.prototype.hasOwnProperty.call(row, sourceKey)) {
    return row;
  }

  const result: Record<string, unknown> = {};
  for (const key of Object.keys(row)) {
    if (key === sourceKey) {
      result[targetColumn] = row[sourceKey];
    } else if (key !== targetColumn) {
      result[key] = row[key];
    }
  }

  return result as T;
}

/**
 * Aligne chaque ligne sur les en-têtes fixés (ex. colonnes du fichier modèle).
 * Une colonne du fichier est retrouvée par nom exact, puis par concept (EN ↔ FR).
 * Les lignes de plusieurs fichiers sont ainsi empilées sous les mêmes colonnes.
 */
export function alignRowsToHeaders(
  rows: Record<string, string>[],
  headers: string[]
): Record<string, string>[] {
  const fixed = [...new Set(headers.map(h => (h || '').trim()).filter(Boolean))];
  if (!fixed.length) {
    return rows;
  }
  // Un même jeu de clés (ex. toutes les lignes d'un fichier) ne résout qu'une fois.
  const mappingBySignature = new Map<string, (string | null)[]>();
  return rows.map(row => {
    const keys = Object.keys(row);
    const signature = keys.join('\u0001');
    let mapping = mappingBySignature.get(signature);
    if (!mapping) {
      mapping = mapFixedHeadersToKeys(row, fixed);
      mappingBySignature.set(signature, mapping);
    }
    const aligned: Record<string, string> = {};
    fixed.forEach((h, i) => {
      const key = mapping![i];
      aligned[h] = key ? (row[key] ?? '') : '';
    });
    return aligned;
  });
}

/**
 * Associe chaque colonne fixée à une clé de la ligne : nom exact / concept EN-FR d'abord,
 * puis rapprochement souple (mots communs) pour un en-tête légèrement modifié.
 * Une clé du fichier ne sert qu'à une seule colonne fixée.
 */
function mapFixedHeadersToKeys(row: Record<string, string>, fixed: string[]): (string | null)[] {
  const mapping: (string | null)[] = fixed.map(h => resolveColumnKeyInRow(row, h));
  const claimed = new Set(mapping.filter((k): k is string => !!k));
  const freeKeys = Object.keys(row).filter(k => !claimed.has(k));
  fixed.forEach((h, i) => {
    if (mapping[i] || !freeKeys.length) {
      return;
    }
    const target = headerWords(h);
    let bestKey: string | null = null;
    let bestScore = 0;
    for (const key of freeKeys) {
      const score = wordOverlap(target, headerWords(key));
      if (score > bestScore) {
        bestScore = score;
        bestKey = key;
      }
    }
    if (bestKey && bestScore >= 0.5) {
      mapping[i] = bestKey;
      freeKeys.splice(freeKeys.indexOf(bestKey), 1);
    }
  });
  return mapping;
}

function headerWords(label: string): Set<string> {
  return new Set(
    normalizeColumnKey(label)
      .split(/[^a-z0-9]+/)
      .filter(w => w.length > 1)
  );
}

/** Proportion de mots communs (Jaccard) entre deux libellés. */
function wordOverlap(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) {
    return 0;
  }
  let common = 0;
  a.forEach(w => {
    if (b.has(w)) {
      common++;
    }
  });
  return common / (a.size + b.size - common);
}

/**
 * Ne garde que les lignes de données réelles après alignement sur les colonnes fixées.
 * Une ligne de titre, de séparateur ou de marqueur (ex. « [STARTDATA] ») ne remplit
 * qu'une ou deux cellules : elle est écartée.
 */
export function filterRealDataRows(
  rows: Record<string, string>[],
  headers: string[]
): Record<string, string>[] {
  const fixed = [...new Set(headers.map(h => (h || '').trim()).filter(Boolean))];
  if (!fixed.length) {
    return rows;
  }
  const minFilled = Math.max(2, Math.ceil(fixed.length * 0.3));
  return rows.filter(row => {
    let filled = 0;
    for (const h of fixed) {
      if ((row[h] ?? '').trim() !== '') {
        filled++;
      }
    }
    return filled >= minFilled;
  });
}
