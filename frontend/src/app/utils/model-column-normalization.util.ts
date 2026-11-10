/**
 * Configuration > Normalisation modèle : application des en-têtes équivalents.
 *
 * Chaque modèle a des colonnes par défaut (celles de son fichier modèle). Un fichier
 * chargé peut porter d'autres en-têtes pour les mêmes données (export en anglais,
 * nouvelle version du fichier, libellé propre à un partenaire). Si une colonne par
 * défaut est absente, on cherche dans le fichier un de ses en-têtes équivalents
 * configurés et on le renomme avec le nom par défaut : la suite du traitement
 * (règles, clés, export, réconciliation) ne voit que les colonnes par défaut.
 */
import { normalizeColumnKey } from './row-column.util';

export interface ModelColumnEquivalence {
  id?: number;
  modelId?: string;
  columnName: string;
  equivalents: string[];
}

export interface ColumnRename {
  /** En-tête trouvé dans le fichier. */
  from: string;
  /** Colonne par défaut du modèle : nom que prend la colonne dans le fichier et à l'export. */
  to: string;
}

export interface ColumnNormalizationPlan {
  renames: ColumnRename[];
  /** Colonnes par défaut configurées, absentes du fichier sous leur nom et sous leurs équivalents. */
  missing: string[];
  /**
   * Équivalents ignorés car ils sont eux-mêmes une colonne du vrai fichier modèle : les renommer
   * ferait disparaître cette colonne. C'est une erreur de configuration, signalée à l'utilisateur.
   */
  ignored: ColumnRename[];
}

/** Clé de comparaison : casse, accents et espaces ignorés (identique au backend). */
export function normalizeHeaderKey(header: string): string {
  return normalizeColumnKey(header || '').replace(/\s+/g, '');
}

/**
 * Calcule les renommages à appliquer à un fichier d'en-têtes `headers`.
 * Tout en-tête équivalent trouvé est renommé avec le nom de la colonne d'origine (pas de copie) :
 * le traitement, la réconciliation et le téléchargement ne voient que la colonne d'origine.
 * Une colonne par défaut déjà présente n'est jamais touchée ; un en-tête du fichier n'est
 * renommé qu'une fois, jamais s'il est lui-même une colonne par défaut configurée ou une
 * colonne du vrai fichier modèle (`templateColumns`, reporté dans `ignored`).
 */
export function planColumnNormalization(
  headers: readonly string[],
  equivalences: readonly ModelColumnEquivalence[],
  templateColumns: readonly string[] = []
): ColumnNormalizationPlan {
  const plan: ColumnNormalizationPlan = { renames: [], missing: [], ignored: [] };
  if (!headers?.length || !equivalences?.length) {
    return plan;
  }

  const headerByKey = new Map<string, string>();
  for (const header of headers) {
    const key = normalizeHeaderKey(header);
    if (key && !headerByKey.has(key)) {
      headerByKey.set(key, header);
    }
  }
  const defaultKeys = new Set(equivalences.map(eq => normalizeHeaderKey(eq.columnName)));
  const templateKeys = new Set(templateColumns.map(normalizeHeaderKey));
  const used = new Set<string>();

  for (const eq of equivalences) {
    const defaultKey = normalizeHeaderKey(eq.columnName);
    if (!defaultKey || headerByKey.has(defaultKey)) {
      continue;
    }
    let found: string | null = null;
    for (const equivalent of eq.equivalents || []) {
      const key = normalizeHeaderKey(equivalent);
      const header = headerByKey.get(key);
      if (!header || used.has(key) || defaultKeys.has(key)) {
        continue;
      }
      if (templateKeys.has(key)) {
        plan.ignored.push({ from: header, to: eq.columnName });
        continue;
      }
      found = header;
      used.add(key);
      break;
    }
    if (found) {
      plan.renames.push({ from: found, to: eq.columnName });
    } else if ((eq.equivalents || []).length) {
      plan.missing.push(eq.columnName);
    }
  }
  return plan;
}

/** Renomme les clés d'une ligne en conservant l'ordre des colonnes. */
export function renameRowColumns(
  row: Record<string, string>,
  renameMap: ReadonlyMap<string, ColumnRename>
): Record<string, string> {
  const next: Record<string, string> = {};
  for (const key of Object.keys(row)) {
    next[renameMap.get(key)?.to ?? key] = row[key];
  }
  return next;
}

/** Applique le plan aux lignes (remplacement dans le tableau, par lots pour ne pas figer l'UI). */
export async function applyColumnNormalizationPlanAsync(
  rows: Record<string, string>[],
  plan: ColumnNormalizationPlan,
  options: { batchSize?: number; yieldFn?: () => Promise<void> | void } = {}
): Promise<Record<string, string>[]> {
  if (!rows?.length || !plan.renames.length) {
    return rows;
  }
  const renameMap = new Map(plan.renames.map(r => [r.from, r]));
  const batchSize = options.batchSize ?? 20000;
  for (let start = 0; start < rows.length; start += batchSize) {
    const end = Math.min(start + batchSize, rows.length);
    for (let i = start; i < end; i++) {
      rows[i] = renameRowColumns(rows[i], renameMap);
    }
    if (options.yieldFn && end < rows.length) {
      await options.yieldFn();
    }
  }
  return rows;
}

/** Remplace les en-têtes dans une liste d'en-têtes (catalogue de colonnes, aperçu). */
export function renameHeaders(headers: readonly string[], plan: ColumnNormalizationPlan): string[] {
  const renameMap = new Map(plan.renames.map(r => [r.from, r]));
  return headers.map(h => renameMap.get(h)?.to ?? h);
}

/** Message lisible pour l'utilisateur (vide si rien à signaler). */
export function describeColumnNormalization(plan: ColumnNormalizationPlan): string {
  const parts: string[] = [];
  if (plan.renames.length) {
    parts.push('Colonnes normalisées : ' + plan.renames
      .map(r => `« ${r.from} » → « ${r.to} »`)
      .join(', '));
  }
  if (plan.ignored?.length) {
    parts.push('Équivalents ignorés (colonnes du fichier modèle, à corriger dans Normalisation modèle) : '
      + plan.ignored.map(r => `« ${r.from} » pour « ${r.to} »`).join(', '));
  }
  if (plan.missing.length) {
    parts.push('Colonnes du modèle introuvables (ni par défaut, ni équivalentes) : '
      + plan.missing.map(c => `« ${c} »`).join(', '));
  }
  return parts.join('. ');
}

/**
 * En-têtes du fichier absents des colonnes du modèle (comparaison sans casse, accents ni
 * espaces) : ils sont ignorés au traitement et à la réconciliation.
 */
export function listColumnsOutsideModel(headers: readonly string[], modelColumns: readonly string[]): string[] {
  const modelKeys = new Set(modelColumns.map(normalizeHeaderKey));
  return headers.filter(h => !!h && !modelKeys.has(normalizeHeaderKey(h)));
}

/** Part des colonnes du fichier modèle présentes dans le fichier chargé (0 à 1). */
export function templateCoverage(headers: readonly string[], templateColumns: readonly string[]): number {
  const keys = new Set(templateColumns.map(normalizeHeaderKey).filter(Boolean));
  if (!keys.size) {
    return 0;
  }
  const present = new Set(headers.map(normalizeHeaderKey));
  let found = 0;
  keys.forEach(k => {
    if (present.has(k)) {
      found++;
    }
  });
  return found / keys.size;
}
