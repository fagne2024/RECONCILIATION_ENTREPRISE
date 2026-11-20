/**
 * Configuration > Normalisation modèle : application des en-têtes équivalents.
 *
 * Chaque modèle a des colonnes par défaut (celles de son fichier modèle). Un fichier
 * chargé peut porter d'autres en-têtes pour les mêmes données (export en anglais,
 * nouvelle version du fichier, libellé propre à un partenaire). Si une colonne par
 * défaut est absente, on cherche dans le fichier un de ses en-têtes équivalents
 * configurés et on le renomme avec le nom par défaut : la suite du traitement
 * (règles, clés, export, réconciliation) ne voit que les colonnes par défaut.
 *
 * Si plusieurs équivalents sont présents (ex. A et B pour « Agence »), le premier
 * trouvé (ordre de configuration) est renommé et chaque ligne où il est vide
 * reçoit la valeur du suivant non vide : les deux sources sont prises en compte.
 * Des conditions peuvent fixer, ligne par ligne, l'équivalent repris même si les deux sont
 * renseignés (ex. « Service = CASHIN » → A, « Service = CASHOUT » → B).
 */
import { normalizeColumnKey } from './row-column.util';

/**
 * Condition de choix d'un équivalent : quand la colonne `column` du fichier vaut une des
 * `values` (casse et espaces ignorés), la colonne par défaut reçoit la valeur de `source`.
 */
export interface EquivalenceCondition {
  column: string;
  values: string[];
  source: string;
}

export interface ModelColumnEquivalence {
  id?: number;
  modelId?: string;
  columnName: string;
  equivalents: string[];
  conditions?: EquivalenceCondition[];
}

/** Condition résolue sur les en-têtes réels du fichier (valeurs normalisées). */
export interface ResolvedEquivalenceCondition {
  /** En-tête du fichier lu pour la condition. */
  column: string;
  values: Set<string>;
  /** En-tête équivalent repris quand la condition est vraie. */
  source: string;
}

export interface ColumnRename {
  /** En-tête trouvé dans le fichier. */
  from: string;
  /** Colonne par défaut du modèle : nom que prend la colonne dans le fichier et à l'export. */
  to: string;
  /**
   * Autres équivalents présents dans le fichier, par ordre de priorité : quand `from` est vide
   * sur une ligne, la première valeur non vide de ces colonnes est reprise. Ces colonnes sont
   * ensuite retirées (elles sont fusionnées dans `to`, comme `from`).
   */
  fillFrom?: string[];
  /**
   * Conditions (dans l'ordre) : la première vérifiée fixe l'équivalent repris sur la ligne,
   * même s'il est vide et même si un autre équivalent est renseigné.
   */
  conditions?: ResolvedEquivalenceCondition[];
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

/**
 * Équivalences intégrées des modèles bancaires : en-têtes courts des extraits de compte
 * (ex. PDF « Date ! Libelle operation ! Val. ! Debit ! Credit »). Elles complètent la
 * configuration de l'entreprise, sans jamais la remplacer.
 */
export const BANK_BUILT_IN_EQUIVALENCES: readonly ModelColumnEquivalence[] = [
  { columnName: 'Date comptable', equivalents: ['Date', 'Date opération', 'Date operation', 'Date mouvement'] },
  { columnName: 'Date de valeur', equivalents: ['Val.', 'Val', 'Valeur', 'Date valeur', 'Date val.'] },
  { columnName: 'Référence', equivalents: ['Libelle operation', 'Libellé opération', 'Libellé', 'Libelle'] }
];

/**
 * Ajoute aux équivalences configurées les équivalences intégrées, uniquement pour les colonnes
 * que le modèle possède réellement (`modelColumns`). Les équivalents configurés restent prioritaires.
 */
export function mergeBuiltInEquivalences(
  configured: readonly ModelColumnEquivalence[],
  builtIn: readonly ModelColumnEquivalence[],
  modelColumns: readonly string[]
): ModelColumnEquivalence[] {
  const merged = configured.map(eq => ({ ...eq, equivalents: [...(eq.equivalents || [])] }));
  const modelKeys = new Set(modelColumns.map(normalizeHeaderKey));
  for (const extra of builtIn) {
    const key = normalizeHeaderKey(extra.columnName);
    const existing = merged.find(eq => normalizeHeaderKey(eq.columnName) === key);
    if (!existing && !modelKeys.has(key)) {
      continue;
    }
    const target = existing || { columnName: extra.columnName, equivalents: [] as string[] };
    const known = new Set(target.equivalents.map(normalizeHeaderKey));
    for (const equivalent of extra.equivalents) {
      if (!known.has(normalizeHeaderKey(equivalent))) {
        target.equivalents.push(equivalent);
      }
    }
    if (!existing) {
      merged.push(target);
    }
  }
  return merged;
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
  const pendingConditions: Array<{ rename: ColumnRename; conditions: EquivalenceCondition[]; found: string[] }> = [];

  for (const eq of equivalences) {
    const defaultKey = normalizeHeaderKey(eq.columnName);
    if (!defaultKey || headerByKey.has(defaultKey)) {
      continue;
    }
    // Tous les équivalents présents sont retenus : le premier est renommé, les suivants
    // complètent ses cellules vides (ex. A vide sur les lignes où seule B est renseignée).
    const found: string[] = [];
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
      found.push(header);
      used.add(key);
    }
    if (found.length) {
      const rename: ColumnRename = { from: found[0], to: eq.columnName };
      if (found.length > 1) {
        rename.fillFrom = found.slice(1);
      }
      plan.renames.push(rename);
      if (found.length > 1 && eq.conditions?.length) {
        pendingConditions.push({ rename, conditions: eq.conditions, found });
      }
    } else if ((eq.equivalents || []).length) {
      plan.missing.push(eq.columnName);
    }
  }

  // Conditions résolues une fois tous les renommages connus : la colonne de condition peut être
  // un en-tête du fichier ou une colonne par défaut obtenue par équivalence (ex. « Service »).
  for (const { rename, conditions, found } of pendingConditions) {
    const resolved = resolveEquivalenceConditions(conditions, found, headerByKey, plan.renames);
    if (resolved.length) {
      rename.conditions = resolved;
    }
  }
  return plan;
}

/** Valeurs de condition séparées par « ; », « , » ou un retour à la ligne. */
export function parseConditionValues(text: string): string[] {
  const values: string[] = [];
  for (const part of (text || '').split(/[;,\n]/)) {
    const value = part.trim();
    if (value && !values.includes(value)) {
      values.push(value);
    }
  }
  return values;
}

function normalizeConditionValue(value: unknown): string {
  return value === undefined || value === null ? '' : String(value).trim().toLowerCase();
}

function resolveEquivalenceConditions(
  conditions: readonly EquivalenceCondition[],
  found: readonly string[],
  headerByKey: ReadonlyMap<string, string>,
  renames: readonly ColumnRename[]
): ResolvedEquivalenceCondition[] {
  const foundByKey = new Map(found.map(h => [normalizeHeaderKey(h), h]));
  const resolved: ResolvedEquivalenceCondition[] = [];
  for (const condition of conditions) {
    const source = foundByKey.get(normalizeHeaderKey(condition.source));
    const columnKey = normalizeHeaderKey(condition.column);
    const column = headerByKey.get(columnKey)
      ?? renames.find(r => normalizeHeaderKey(r.to) === columnKey)?.from;
    const values = new Set((condition.values || []).map(normalizeConditionValue).filter(v => v));
    if (source && column && values.size) {
      resolved.push({ column, values, source });
    }
  }
  return resolved;
}

/** Cellule vide : absente, nulle ou faite uniquement d'espaces. */
function isBlankCell(value: unknown): boolean {
  return value === undefined || value === null || String(value).trim() === '';
}

/** En-têtes fusionnés dans une autre colonne (`fillFrom`) : retirés des lignes et des listes. */
export function mergedSourceHeaders(renames: readonly ColumnRename[]): Set<string> {
  const merged = new Set<string>();
  for (const rename of renames) {
    (rename.fillFrom || []).forEach(h => merged.add(h));
  }
  return merged;
}

/**
 * Renomme les clés d'une ligne en conservant l'ordre des colonnes. Pour un renommage avec
 * `fillFrom`, une valeur vide est complétée par le premier équivalent non vide de la ligne,
 * et les colonnes `fillFrom` disparaissent.
 */
export function renameRowColumns(
  row: Record<string, string>,
  renameMap: ReadonlyMap<string, ColumnRename>,
  mergedSources: ReadonlySet<string> = new Set()
): Record<string, string> {
  const next: Record<string, string> = {};
  for (const key of Object.keys(row)) {
    if (mergedSources.has(key)) {
      continue;
    }
    const rename = renameMap.get(key);
    let value = row[key];
    const fixed = rename?.conditions?.find(c => c.values.has(normalizeConditionValue(row[c.column])));
    if (fixed) {
      // Condition vérifiée : l'équivalent choisi est repris tel quel (même si l'autre est renseigné).
      value = row[fixed.source] ?? '';
    } else if (rename?.fillFrom?.length && isBlankCell(value)) {
      const fallback = rename.fillFrom.find(source => !isBlankCell(row[source]));
      if (fallback !== undefined) {
        value = row[fallback];
      }
    }
    next[rename?.to ?? key] = value;
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
  const mergedSources = mergedSourceHeaders(plan.renames);
  const batchSize = options.batchSize ?? 20000;
  for (let start = 0; start < rows.length; start += batchSize) {
    const end = Math.min(start + batchSize, rows.length);
    for (let i = start; i < end; i++) {
      rows[i] = renameRowColumns(rows[i], renameMap, mergedSources);
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
  const mergedSources = mergedSourceHeaders(plan.renames);
  return headers.filter(h => !mergedSources.has(h)).map(h => renameMap.get(h)?.to ?? h);
}

/** Message lisible pour l'utilisateur (vide si rien à signaler). */
export function describeColumnNormalization(plan: ColumnNormalizationPlan): string {
  const parts: string[] = [];
  if (plan.renames.length) {
    parts.push('Colonnes normalisées : ' + plan.renames
      .map(r => [r.from, ...(r.fillFrom || [])].map(h => `« ${h} »`).join(' + ') + ` → « ${r.to} »`)
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
