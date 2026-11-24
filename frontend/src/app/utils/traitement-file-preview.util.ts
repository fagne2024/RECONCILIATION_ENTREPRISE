import * as Papa from 'papaparse';
import { detectGenericHeaderRowIndex, findHeaderRowIndexInGrid } from './model-header-detection.util';
import { deduplicateHeaderNames } from './row-column.util';

/**
 * Prévisualisation des fichiers du traitement automatique (comme le traitement manuel) :
 * lignes brutes, en-tête détecté, paramétrage manuel de l'en-tête et des données,
 * et liens « colonne du modèle ← colonne du fichier » confirmés par l'utilisateur.
 *
 * Numérotation des lignes (1 = première ligne) :
 *  - CSV : lignes physiques du fichier (lignes vides comprises) ;
 *  - Excel : lignes non vides de la feuille (même grille que la lecture du traitement).
 */

/** Lien vers « aucune colonne » : la colonne du modèle reste vide pour ce fichier. */
export const PREVIEW_LINK_NONE = '__none__';

/** Plage choisie à la main (numéros 1-based, voir la numérotation ci-dessus). */
export interface ManualRowRange {
  headerLine: number;
  dataStartLine: number;
}

/** Réglages d'un fichier confirmés à la prévisualisation, utilisés au traitement. */
export interface TraitementFileSettings {
  /** Plage manuelle ; absente = détection automatique. */
  range?: ManualRowRange;
  /** colonne du modèle → colonne du fichier (ou PREVIEW_LINK_NONE). Seuls les choix manuels. */
  links: Record<string, string>;
}

/**
 * Origine du lien d'une colonne du modèle : nom identique, équivalent configuré
 * (Normalisation modèle), rapprochement approximatif, choix manuel ou aucun.
 */
export type TraitementPreviewLinkStatus = 'exact' | 'equivalent' | 'approx' | 'manual' | 'none';

/** Aperçu d'un fichier du traitement automatique. */
export interface TraitementFilePreview {
  file: File;
  kind: 'csv' | 'excel';
  delimiter?: string;
  sheetName?: string;
  grid: unknown[][];
  rawLines: Array<{ n: number; text: string }>;
  autoRange: PreviewRangeDetection;
  manualRange?: ManualRowRange;
  manualEnabled: boolean;
  headerLineInput: number | null;
  dataLineInput: number | null;
  rangeError: string;
  /** En-têtes du fichier selon la plage utilisée. */
  fileColumns: string[];
  /** Choix manuels : colonne du modèle → colonne du fichier (ou PREVIEW_LINK_NONE). */
  links: Record<string, string>;
  mapping: Array<{ column: string; fileColumn: string; status: TraitementPreviewLinkStatus }>;
  /** Premières lignes telles qu'elles seront traitées (colonnes du modèle). */
  sampleRows: Record<string, string>[];
  /** Lignes de l'aperçu lues / retenues (une ligne trop vide pour le modèle est écartée). */
  sampleTotal?: number;
  keptSampleCount: number;
  unlinkedFileColumns: string[];
  normalizationMessage: string;
  error: string;
}

/** Contexte du modèle commun à tous les aperçus. */
export interface TraitementPreviewContext {
  model: { id?: string; modelId?: string; bankModel?: boolean; preProcessingConfig?: { valueMappings?: any } };
  modelIds: Array<string | undefined>;
  expected: string[];
  templateColumns: string[];
  bankModelColumns: string[];
  alternatives?: Map<string, string[]>;
  /** Colonnes du modèle proposées dans le tableau des liens. */
  modelColumns: string[];
}

/** Détection automatique sur la grille d'aperçu. */
export interface PreviewRangeDetection {
  headerLine: number;
  dataStartLine: number;
  source: 'model' | 'generic' | 'none';
}

const isFilled = (cells: readonly unknown[] | undefined): boolean =>
  !!cells && cells.some(c => String(c ?? '').trim() !== '');

/** Grille d'aperçu d'un texte CSV (lignes physiques ; dernière ligne tronquée écartée). */
export function csvPreviewGrid(text: string, delimiter: string, truncated: boolean, maxLines = 60): string[][] {
  const lines = text.split(/\r?\n/);
  if (truncated && lines.length > 1) {
    lines.pop();
  }
  return lines.slice(0, maxLines).map(line => {
    if (!line.trim()) {
      return [];
    }
    const parsed = Papa.parse<string[]>(line, { delimiter });
    return ((parsed.data?.[0] as string[]) || []).map(c => String(c ?? ''));
  });
}

/** En-tête et première ligne de données détectés sur la grille d'aperçu. */
export function detectPreviewRange(
  grid: unknown[][],
  expectedColumns: string[],
  alternatives?: ReadonlyMap<string, readonly string[]>
): PreviewRangeDetection {
  const modelIndex = expectedColumns.length
    ? findHeaderRowIndexInGrid(grid, expectedColumns, Math.min(80, grid.length), alternatives)
    : null;
  let headerIndex = modelIndex;
  let source: PreviewRangeDetection['source'] = 'model';
  if (headerIndex === null || headerIndex === undefined) {
    headerIndex = detectGenericHeaderRowIndex(grid, 30);
    source = 'generic';
  }
  if (headerIndex === null || headerIndex === undefined) {
    headerIndex = grid.findIndex(isFilled);
    source = 'none';
    if (headerIndex < 0) {
      headerIndex = 0;
    }
  }
  let dataIndex = headerIndex + 1;
  while (dataIndex < grid.length && !isFilled(grid[dataIndex])) {
    dataIndex++;
  }
  return { headerLine: headerIndex + 1, dataStartLine: dataIndex + 1, source };
}

/** Contrôle d'une plage saisie à la main ; renvoie un message d'erreur ou null. */
export function validateRowRange(range: ManualRowRange, lineCount: number): string | null {
  const { headerLine, dataStartLine } = range;
  if (!Number.isInteger(headerLine) || !Number.isInteger(dataStartLine) || headerLine < 1 || dataStartLine < 1) {
    return 'Les numéros de ligne doivent être des entiers supérieurs ou égaux à 1.';
  }
  if (dataStartLine <= headerLine) {
    return 'La première ligne de données doit être après la ligne d\'en-tête.';
  }
  if (lineCount > 0 && headerLine > lineCount) {
    return `La ligne d'en-tête dépasse l'aperçu (${lineCount} ligne(s)).`;
  }
  return null;
}

/**
 * Lignes d'une grille selon une plage : en-têtes de la ligne `headerLine` (noms nettoyés,
 * doublons suffixés), données à partir de `dataStartLine`, lignes vides ignorées.
 */
export function rowsFromGrid(
  grid: unknown[][],
  range: ManualRowRange,
  normalizeHeader: (header: string) => string = h => h.trim(),
  maxRows = Number.POSITIVE_INFINITY
): { headers: string[]; rows: Record<string, string>[] } {
  const headerCells = (grid[range.headerLine - 1] || []).map(c => String(c ?? ''));
  const headers = deduplicateHeaderNames(
    headerCells.map((h, i) => normalizeHeader(h) || `Col${i + 1}`)
  );
  const rows: Record<string, string>[] = [];
  for (let i = range.dataStartLine - 1; i < grid.length && rows.length < maxRows; i++) {
    const cells = grid[i];
    if (!isFilled(cells)) {
      continue;
    }
    const row: Record<string, string> = {};
    headers.forEach((h, j) => {
      const value = cells[j];
      row[h] = value === null || value === undefined ? '' : String(value).trim();
    });
    rows.push(row);
  }
  return { headers, rows };
}

/**
 * Applique les liens confirmés : la colonne du fichier prend le nom de la colonne du modèle ;
 * « aucune colonne » vide la colonne du modèle. Modifie les lignes en place.
 */
export function applyColumnLinks(rows: Record<string, string>[], links: Record<string, string> | undefined): Record<string, string>[] {
  const entries = Object.entries(links || {}).filter(([model, file]) => !!model && !!file && model !== file);
  if (!entries.length || !rows.length) {
    return rows;
  }
  const renames = entries.filter(([, file]) => file !== PREVIEW_LINK_NONE);
  const empties = entries.filter(([, file]) => file === PREVIEW_LINK_NONE).map(([model]) => model);
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    // Valeurs lues avant toute réécriture : deux liens peuvent s'échanger des colonnes.
    const values = renames.map(([, file]) => row[file]);
    for (const [, file] of renames) {
      delete row[file];
    }
    renames.forEach(([model], j) => {
      row[model] = values[j] ?? '';
    });
    for (const model of empties) {
      row[model] = '';
    }
  }
  return rows;
}
