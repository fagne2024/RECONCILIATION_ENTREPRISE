import { removeSpecialStrings } from '../utils/special-string-removal.util';
import { Injectable } from '@angular/core';
import {
  AutoProcessingModel,
  ColumnProcessingRule,
  DEFAULT_PRE_PROCESSING_SECTION_ORDER,
  ModelCrossDedupRule,
  resolvePreProcessingSectionOrder,
  ENV_COLUMN_NAME,
  PAYS_COLUMN_NAME,
  ModelFormatAction,
  ModelPreProcessingConfig,
  ModelPreProcessingSectionId,
  ModelRowFilter,
  ModelRowFilterValueCondition,
  ModelColumnValueMapping,
  ModelColumnConcatRule,
  ModelColumnMathRule,
  COLUMN_MATH_OPERATORS,
  computeColumnMath,
  ModelColumnRenameRule,
  matchesConditionValues,
  parseConditionValues
} from './auto-processing.service';
import { buildConcatenatedValue } from '../utils/concat.util';
import { parseValeursCondition, supprimerDoublonsCroises } from '../utils/cross-dedup.util';
import {
  BO_RECONCILIATION_KEY_ALIASES,
  PARTNER_REFERENCE_KEY_ALIASES
} from '../utils/reconciliation-key.util';
import { getOrangeMoneyAliasHeadersForColumn, dedupeBilingualColumnNames } from '../utils/bilingual-column.util';
import { parseAmountValue, tryParseAmount } from '../utils/record-amount.util';
import {
  ColumnKeyResolver,
  createColumnKeyResolver,
  normalizeColumnKey,
  renameKeyPreservingOrder,
  resolveColumnKeyInRow,
  resolveCanonicalColumnKeysInRow
} from '../utils/row-column.util';
import { fixCellEncoding, fixCellEncodingIfNeeded } from '../utils/encoding-fixer';
import {
  resolveTimezoneShiftHours,
  resolveTimezoneShiftHoursForCountryValue,
  shiftDateTimeValue,
  TIMEZONE_COUNTRY_FROM_COLUMN
} from '../utils/timezone-shift.util';
import {
  finalizeTextPreserveColumnValue,
  preserveLeadingZeroString,
  normalizeLeadingZeroCellsInRows,
  keepCharactersFromString,
  finalizeRemoveCharactersCell,
  applyRemoveCharactersWithLeadingZero,
  unwrapExcelTextFormula,
  isMsisdnPreserveColumn
} from '../utils/text-cell.util';
import { I18nService } from './i18n/i18n.service';

/** Aligné sur COLUMN_RULES_SYNC_THRESHOLD : pas de micro-lots ni yield en dessous. */
const PREPROCESS_INLINE_THRESHOLD = 20000;

/** Colonnes du fichier opérations bancaires (OPBO / OPPART), en français. */
const OPERATION_BANCAIRE_TEMPLATE_COLUMNS: string[] = [
  'ID Opération', 'Type Opération', 'Montant', 'Solde avant', 'Solde après',
  'Code propriétaire', 'Téléphone', 'Statut', 'ID Transaction', 'Num bordereau',
  'Date opération', 'Date de versement', 'Banque appro', 'Login demandeur Appro',
  'Login valideur Appro', 'Motif rejet', 'Frais connexion', 'Numéro Trans GU',
  'Agent', 'Motif régularisation', 'groupe de réseau'
];

interface PrecomputedFormatTarget {
  keys: readonly string[];
  action: ModelFormatAction;
  /** Action et colonne configurées d'origine (suivi de ce qui a réellement modifié des données). */
  source: ModelFormatAction;
  column: string;
  conditionColumnKey: string | null;
  expectedValues: ReadonlySet<string> | null;
}

interface ResolvedColumnRenameRule {
  sourceKey: string;
  targetKey: string;
  rule?: ModelColumnRenameRule;
}

/**
 * Ce que le pré-traitement a réellement fait sur les lignes : éléments de configuration
 * (filtres, formats, règles…) ayant modifié au moins une valeur ou une ligne, et pour les
 * actions de format, les colonnes effectivement modifiées. Sert au résumé affiché après
 * traitement, qui ne doit lister que ce qui a été fait.
 */
export interface PreProcessingUsage {
  used: Set<object>;
  formatColumns: Map<ModelFormatAction, Set<string>>;
}

export function createPreProcessingUsage(): PreProcessingUsage {
  return { used: new Set<object>(), formatColumns: new Map<ModelFormatAction, Set<string>>() };
}

/** Valeurs ENV / PAYS du traitement en cours, lues par les conditions de « Renommer des valeurs ». */
export interface ValueMappingContext {
  env?: string | null;
  pays?: string | null;
}

@Injectable({
  providedIn: 'root'
})
export class ModelPreProcessingService {

  /**
   * Cache de résolution des colonnes, actif pendant un traitement de toutes les lignes
   * (projection, filtrage des colonnes vides). Méthodes synchrones : pas d'entrelacement.
   */
  private bulkKeyResolver: ColumnKeyResolver | null = null;

  private withBulkKeyResolver<T>(fn: () => T): T {
    if (this.bulkKeyResolver) {
      return fn();
    }
    this.bulkKeyResolver = createColumnKeyResolver();
    try {
      return fn();
    } finally {
      this.bulkKeyResolver = null;
    }
  }

  async applyPreProcessingAsync(
    rows: Record<string, string>[],
    config?: ModelPreProcessingConfig | null,
    options?: {
      batchSize?: number;
      onProgress?: (message: string, done: number, total: number) => void | Promise<void>;
      yieldFn?: () => Promise<void>;
      /** Si fourni, reçoit ce qui a réellement modifié les données (résumé après traitement). */
      usage?: PreProcessingUsage;
    }
  ): Promise<Record<string, string>[]> {
    if (!config || !rows?.length) {
      return rows;
    }

    const usage = options?.usage;
    const batchSize = options?.batchSize ?? (rows.length > 100000 ? 10000 : 5000);
    let result = rows;
    const sectionOrder = this.resolveSectionOrder(config.sectionOrder);

    for (const sectionId of sectionOrder) {
      switch (sectionId) {
        case 'rowFilters':
          if (config.rowFilters?.length) {
            await options?.onProgress?.(I18nService.t('MSG.msg.filtresDuModele'), 0, result.length);
            await options?.yieldFn?.();
            result = await this.applyRowFiltersAsync(result, config.rowFilters, batchSize, options, usage);
            if (!result.length) {
              return result;
            }
          }
          break;
        case 'formatActions':
          if (config.formatActions?.length) {
            result = await this.applyFormatActionsAsync(result, config.formatActions, batchSize, options, usage);
          }
          break;
        case 'columnConcatRules':
          if (config.columnConcatRules?.length) {
            result = await this.mapRowsBatched(
              result,
              batchSize,
              row => this.applyColumnConcatRulesToRow(row, config.columnConcatRules!, usage),
              'Concaténation du modèle...',
              options
            );
          }
          break;
        case 'columnMathRules':
          if (config.columnMathRules?.length) {
            result = await this.mapRowsBatched(
              result,
              batchSize,
              row => this.applyColumnMathRulesToRow(row, config.columnMathRules!, usage),
              'Calcul de colonnes...',
              options
            );
          }
          break;
        case 'valueMappings':
          if (config.valueMappings?.length) {
            const valueMappingContext = this.buildValueMappingContext(config);
            result = await this.mapRowsBatched(
              result,
              batchSize,
              row => this.applyValueMappingsToRow(row, config.valueMappings!, usage, valueMappingContext),
              'Renommage des valeurs...',
              options
            );
          }
          break;
        case 'crossDedupRules':
          if (config.crossDedupRules?.length) {
            await options?.onProgress?.('Doublons entre deux colonnes...', 0, result.length);
            await options?.yieldFn?.();
            result = this.applyCrossDedupRules(result, config.crossDedupRules, usage);
            if (!result.length) {
              return result;
            }
          }
          break;
        case 'columnRenameRules':
          if (config.columnRenameRules?.length) {
            result = await this.applyColumnRenameRulesAsync(
              result,
              config.columnRenameRules,
              batchSize,
              options,
              usage
            );
          }
          break;
      }
    }

    result = this.applyEnvColumnToRows(result, config);
    if (usage && result.length && config.envColumn && this.isEnvColumnEnabled(config)) {
      usage.used.add(config.envColumn);
    }
    result = this.applyPaysColumnToRows(result, config);
    if (usage && result.length && config.paysColumn && this.getActivePaysColumnValue(config)) {
      usage.used.add(config.paysColumn);
    }

    // En dernier (les sections suivantes peuvent encore lire les sources) : après une
    // concaténation, seule la colonne concaténée reste dans le résultat.
    result = this.removeConcatSourceColumns(result, config);

    return normalizeLeadingZeroCellsInRows(result);
  }

  /**
   * Retire des lignes les colonnes sources des concaténations actives (sauf option décochée),
   * jamais une colonne produite par le modèle (cible d'une concaténation ou d'un calcul).
   */
  removeConcatSourceColumns(
    rows: Record<string, string>[],
    config?: ModelPreProcessingConfig | null
  ): Record<string, string>[] {
    const rules = this.getActiveColumnConcatRules(config?.columnConcatRules)
      .filter(rule => rule.removeSourceColumns !== false);
    if (!rules.length || !rows?.length) {
      return rows;
    }
    const produced = new Set<string>([
      ...this.getActiveColumnConcatRules(config?.columnConcatRules).map(r => normalizeColumnKey(r.targetColumn)),
      ...this.getActiveColumnMathRules(config?.columnMathRules).map(r => normalizeColumnKey(r.targetColumn))
    ]);
    const sample = rows[0];
    const toRemove = new Set<string>();
    for (const rule of rules) {
      for (const source of rule.sourceColumns) {
        if (produced.has(normalizeColumnKey(source))) {
          continue;
        }
        const key = resolveColumnKeyInRow(sample, source);
        if (key && !produced.has(normalizeColumnKey(key))) {
          toRemove.add(key);
        }
      }
    }
    if (!toRemove.size) {
      return rows;
    }
    for (const row of rows) {
      for (const key of toRemove) {
        delete row[key];
      }
    }
    return rows;
  }

  private applyEnvColumnToRows(
    rows: Record<string, string>[],
    config?: ModelPreProcessingConfig | null
  ): Record<string, string>[] {
    const envValue = this.getActiveEnvColumnValue(config);
    if (!envValue || !rows.length) {
      return rows;
    }

    for (const row of rows) {
      row[ENV_COLUMN_NAME] = envValue;
    }
    return rows;
  }

  getActiveEnvColumnValue(config?: ModelPreProcessingConfig | null): string | null {
    if (!config?.envColumn?.enabled) {
      return null;
    }
    const value = String(config.envColumn.value ?? '').trim();
    return value || null;
  }

  isEnvColumnEnabled(config?: ModelPreProcessingConfig | null): boolean {
    return this.getActiveEnvColumnValue(config) !== null;
  }

  /** Le modèle déclare une colonne ENV (valeur fixée par le modèle ou choisie avant le traitement). */
  isEnvColumnDeclared(config?: ModelPreProcessingConfig | null): boolean {
    return config?.envColumn?.enabled === true;
  }

  /** Colonne PAYS remplie avec le code choisi avant le traitement (toutes les lignes). */
  private applyPaysColumnToRows(
    rows: Record<string, string>[],
    config?: ModelPreProcessingConfig | null
  ): Record<string, string>[] {
    const pays = this.getActivePaysColumnValue(config);
    if (!pays || !rows.length) {
      return rows;
    }
    for (const row of rows) {
      row[PAYS_COLUMN_NAME] = pays;
    }
    return rows;
  }

  /** Code pays à écrire (colonne PAYS activée et code renseigné), sinon null. */
  getActivePaysColumnValue(config?: ModelPreProcessingConfig | null): string | null {
    if (!config?.paysColumn?.enabled) {
      return null;
    }
    const value = String(config.paysColumn.value ?? '').trim().toUpperCase();
    return value || null;
  }

  /** Le modèle déclare une colonne PAYS (le code est choisi avant chaque traitement). */
  isPaysColumnDeclared(config?: ModelPreProcessingConfig | null): boolean {
    return config?.paysColumn?.enabled === true;
  }

  isExportColumnFilterEnabled(config?: ModelPreProcessingConfig | null): boolean {
    return !!config?.exportColumnFilter?.enabled;
  }

  buildExportColumnKeepMap(
    catalog: string[],
    filter?: { enabled?: boolean; keptColumns?: string[] } | null
  ): Record<string, boolean> {
    const map: Record<string, boolean> = {};
    if (!catalog.length) {
      return map;
    }
    const keptSet = filter?.keptColumns?.length ? new Set(filter.keptColumns) : null;
    for (const col of catalog) {
      map[col] = keptSet ? keptSet.has(col) : true;
    }
    return map;
  }

  getKeptExportColumns(
    catalog: string[],
    keepMap: Record<string, boolean>
  ): string[] {
    return catalog.filter(col => keepMap[col] !== false);
  }

  private async mapRowsBatched(
    rows: Record<string, string>[],
    batchSize: number,
    mapRow: (row: Record<string, string>) => Record<string, string>,
    message: string,
    options?: {
      onProgress?: (message: string, done: number, total: number) => void | Promise<void>;
      yieldFn?: () => Promise<void>;
    }
  ): Promise<Record<string, string>[]> {
    if (!rows.length) {
      return rows;
    }

    const inlineLimit = options?.yieldFn ? 8000 : PREPROCESS_INLINE_THRESHOLD;
    if (rows.length <= inlineLimit) {
      for (let i = 0; i < rows.length; i++) {
        const updated = mapRow(rows[i]);
        if (updated !== rows[i]) {
          rows[i] = updated;
        }
      }
      return rows;
    }

    const effectiveBatch = rows.length > 50000 ? batchSize : Math.min(batchSize, 5000);
    for (let start = 0; start < rows.length; start += effectiveBatch) {
      const end = Math.min(start + effectiveBatch, rows.length);
      for (let i = start; i < end; i++) {
        const updated = mapRow(rows[i]);
        if (updated !== rows[i]) {
          rows[i] = updated;
        }
      }
      if (end < rows.length) {
        await options?.onProgress?.(message, end, rows.length);
        await options?.yieldFn?.();
      }
    }
    return rows;
  }

  private findSampleDataRow(rows: Record<string, string>[]): Record<string, string> | null {
    return rows.find(row => row && Object.keys(row).length > 0) ?? null;
  }

  private async applyFormatActionsAsync(
    rows: Record<string, string>[],
    actions: ModelFormatAction[],
    batchSize: number,
    options?: {
      onProgress?: (message: string, done: number, total: number) => void | Promise<void>;
      yieldFn?: () => Promise<void>;
    },
    usage?: PreProcessingUsage
  ): Promise<Record<string, string>[]> {
    const enabledActions = actions.filter(action => action.enabled && action.columns?.length);
    if (!enabledActions.length || !rows.length) {
      return rows;
    }

    const orderedActions = [...enabledActions].sort(
      (a, b) => (a.order ?? Number.MAX_SAFE_INTEGER) - (b.order ?? Number.MAX_SAFE_INTEGER)
    );

    const sampleRow = this.findSampleDataRow(rows);
    if (!sampleRow) {
      return rows;
    }

    const plan = this.buildFormatActionPlan(sampleRow, orderedActions);
    if (!plan.length) {
      return rows;
    }

    const inlineLimit = options?.yieldFn ? 8000 : PREPROCESS_INLINE_THRESHOLD;
    if (rows.length <= inlineLimit) {
      this.applyFormatPlanToRows(rows, plan, 0, rows.length, usage);
      return rows;
    }

    const macroBatch = rows.length > 50000 ? batchSize : Math.min(batchSize, 2000);
    const progressMessage = I18nService.t('MSG.msg.formatageDuModele');

    for (let start = 0; start < rows.length; start += macroBatch) {
      const macroEnd = Math.min(start + macroBatch, rows.length);
      this.applyFormatPlanToRows(rows, plan, start, macroEnd, usage);
      if (macroEnd < rows.length) {
        await options?.onProgress?.(progressMessage, macroEnd, rows.length);
        await options?.yieldFn?.();
      }
    }

    return rows;
  }

  private buildFormatActionPlan(
    sampleRow: Record<string, string>,
    orderedActions: ModelFormatAction[]
  ): PrecomputedFormatTarget[] {
    const targets: PrecomputedFormatTarget[] = [];

    for (const action of orderedActions) {
      for (const column of action.columns) {
        const keys = this.resolveFormatActionColumnKeys(sampleRow, column);
        if (!keys.length) {
          continue;
        }

        const merged = this.mergeFormatActionForColumn(action, column);
        const columnSettings = this.findFormatColumnSettings(action, column);
        let conditionColumnKey: string | null = null;
        let expectedValues: ReadonlySet<string> | null = null;

        if (columnSettings?.applyConditionEnabled === true) {
          const conditionColumn = (columnSettings.conditionColumn ?? '').trim();
          if (conditionColumn) {
            conditionColumnKey = resolveColumnKeyInRow(sampleRow, conditionColumn);
            const parsed = parseConditionValues(columnSettings.conditionValue);
            expectedValues = parsed.length ? new Set(parsed) : null;
          }
        } else if (action.applyConditionEnabled) {
          const conditionColumn = (action.conditionColumn ?? '').trim();
          if (conditionColumn) {
            conditionColumnKey = resolveColumnKeyInRow(sampleRow, conditionColumn);
            const parsed = parseConditionValues(action.conditionValue);
            expectedValues = parsed.length ? new Set(parsed) : null;
          }
        }

        targets.push({
          keys,
          action: merged,
          source: action,
          column,
          conditionColumnKey,
          expectedValues
        });
      }
    }

    return targets;
  }

  private applyFormatPlanToRows(
    rows: Record<string, string>[],
    plan: PrecomputedFormatTarget[],
    start: number,
    end: number,
    usage?: PreProcessingUsage
  ): void {
    for (let i = start; i < end; i++) {
      const row = rows[i];
      if (!row) {
        continue;
      }
      for (const target of plan) {
        if (target.conditionColumnKey && target.expectedValues?.size) {
          const conditionValue = String(row[target.conditionColumnKey] ?? '').trim();
          if (!target.expectedValues.has(conditionValue)) {
            continue;
          }
        }

        const primaryKey = target.keys[0];
        const rawValue = row[primaryKey];
        if (rawValue === undefined || rawValue === null) {
          continue;
        }

        const inputValue = this.coerceFormatCellValueFast(rawValue);
        const formattedValue = this.applyFormatActionToValue(
          inputValue,
          target.action,
          primaryKey,
          row
        );

        for (const key of target.keys) {
          row[key] = this.finalizeFormatColumnValue(key, target.action, formattedValue);
        }
        // Effet de l'action seule : la normalisation de cellule (coercition / finalisation) ne compte
        // pas, sinon une action sans effet (ex. décalage horaire de 0 h) apparaît dans le résumé.
        if (usage && formattedValue !== inputValue) {
          this.markFormatColumnUsed(usage, target.source, target.column);
        }
      }
    }
  }

  private applyFormatActionsToRow(
    row: Record<string, string>,
    orderedActions: ModelFormatAction[]
  ): Record<string, string> {
    for (const action of orderedActions) {
      for (const column of action.columns) {
        const merged = this.mergeFormatActionForColumn(action, column);
        if (!this.isFormatActionConditionMet(row, action, column)) {
          continue;
        }

        const columnKeys = this.resolveFormatActionColumnKeys(row, column);
        if (!columnKeys.length) {
          continue;
        }

        const rawValue = row[columnKeys[0]];
        if (rawValue === undefined || rawValue === null) {
          continue;
        }

        const formattedValue = this.applyFormatActionToValue(
          this.coerceFormatCellValue(rawValue),
          merged,
          columnKeys[0],
          row
        );
        const storedValue = this.finalizeFormatColumnValue(columnKeys[0], merged, formattedValue);

        for (const aliasKey of columnKeys) {
          row[aliasKey] = storedValue;
        }
      }
    }

    return row;
  }

  private applyColumnConcatRulesToRow(
    row: Record<string, string>,
    rules: ModelColumnConcatRule[],
    usage?: PreProcessingUsage
  ): Record<string, string> {
    const activeRules = this.getActiveColumnConcatRules(rules);
    if (!activeRules.length) {
      return row;
    }

    const newRow = row;
    for (const rule of activeRules) {
      const before = newRow[rule.targetColumn];
      newRow[rule.targetColumn] = buildConcatenatedValue(
        rule.sourceColumns.map(column => {
          const key = resolveColumnKeyInRow(newRow, column) ?? column;
          return newRow[key];
        }),
        rule.separator ?? '',
        rule.sourceColumns
      );
      if (rule.targetColumn) {
        if (isMsisdnPreserveColumn(rule.targetColumn)) {
          newRow[rule.targetColumn] = finalizeTextPreserveColumnValue(
            rule.targetColumn,
            newRow[rule.targetColumn]
          );
        }
      }
      if (usage && newRow[rule.targetColumn] !== before) {
        usage.used.add(rule);
      }
    }
    return newRow;
  }

  private applyColumnMathRulesToRow(
    row: Record<string, string>,
    rules: ModelColumnMathRule[],
    usage?: PreProcessingUsage
  ): Record<string, string> {
    const activeRules = this.getActiveColumnMathRules(rules);
    if (!activeRules.length) {
      return row;
    }

    for (const rule of activeRules) {
      const keyA = resolveColumnKeyInRow(row, rule.sourceColumnA);
      const keyB = resolveColumnKeyInRow(row, rule.sourceColumnB);
      const rawA = keyA ? row[keyA] : undefined;
      const rawB = keyB ? row[keyB] : undefined;
      const valueA = parseAmountValue(rawA);
      const valueB = parseAmountValue(rawB);
      const result = computeColumnMath(rule.operation, valueA, valueB);
      const before = row[rule.targetColumn];
      row[rule.targetColumn] = this.formatMathResult(result, rawA, rawB);
      if (usage && row[rule.targetColumn] !== before) {
        usage.used.add(rule);
      }
    }
    return row;
  }

  private formatMathResult(result: number, rawA: unknown, rawB: unknown): string {
    if (!Number.isFinite(result)) {
      return '';
    }
    const usesComma = [rawA, rawB].some(raw => typeof raw === 'string' && raw.includes(','));
    const formatted = Number.isInteger(result)
      ? String(result)
      : result.toFixed(6).replace(/\.?0+$/, '');
    return usesComma ? formatted.replace('.', ',') : formatted;
  }

  private applyValueMappingsToRow(
    row: Record<string, string>,
    mappings: ModelColumnValueMapping[],
    usage?: PreProcessingUsage,
    context?: ValueMappingContext
  ): Record<string, string> {
    const activeMappings = this.getActiveValueMappings(mappings);
    if (!activeMappings.length) {
      return row;
    }

    for (const mapping of activeMappings) {
      const key = resolveColumnKeyInRow(row, mapping.column);
      if (!key) {
        continue;
      }
      if (mapping.fromEmpty) {
        // Cellule vide (absente, null ou seulement des espaces) : reçoit le nouveau libellé.
        if (row[key] !== undefined && row[key] !== null && String(row[key]).trim() !== '') {
          continue;
        }
      } else if (row[key] === undefined || row[key] === null || String(row[key]) !== mapping.fromValue) {
        continue;
      }
      const currentValue = row[key] === undefined || row[key] === null ? '' : String(row[key]);
      if (!this.valueMappingConditionMatches(row, mapping)
        || !this.valueMappingEnvPaysMatches(row, mapping, context)) {
        continue;
      }
      row[key] = mapping.toValue;
      if (usage && mapping.toValue !== currentValue) {
        usage.used.add(mapping);
      }
    }
    return row;
  }

  private applyColumnRenameRulesToRow(
    row: Record<string, string>,
    rules: ModelColumnRenameRule[],
    resolvedRules?: ResolvedColumnRenameRule[]
  ): Record<string, string> {
    const activeRules = resolvedRules ?? this.resolveColumnRenameRules(row, rules);
    if (!activeRules.length) {
      return row;
    }

    return this.applyResolvedColumnRenamesToRow(row, activeRules);
  }

  private resolveColumnRenameRules(
    sampleRow: Record<string, string>,
    rules: ModelColumnRenameRule[]
  ): ResolvedColumnRenameRule[] {
    const activeRules = this.getActiveColumnRenameRules(rules);
    if (!activeRules.length || !sampleRow) {
      return [];
    }

    let working: Record<string, string> = { ...sampleRow };
    const resolved: ResolvedColumnRenameRule[] = [];

    for (const rule of activeRules) {
      const targetKey = rule.targetColumn!.trim();
      const sourceKey = resolveColumnKeyInRow(working, rule.sourceColumn!);
      if (!sourceKey || sourceKey === targetKey || !Object.prototype.hasOwnProperty.call(working, sourceKey)) {
        continue;
      }
      resolved.push({ sourceKey, targetKey, rule });
      working = renameKeyPreservingOrder(working, sourceKey, targetKey);
    }

    return resolved;
  }

  private applyResolvedColumnRenamesToRow(
    row: Record<string, string>,
    resolvedRules: ResolvedColumnRenameRule[]
  ): Record<string, string> {
    if (!resolvedRules.length) {
      return row;
    }

    if (resolvedRules.length === 1) {
      const { sourceKey, targetKey } = resolvedRules[0];
      if (!Object.prototype.hasOwnProperty.call(row, sourceKey)) {
        return row;
      }
      return renameKeyPreservingOrder(row, sourceKey, targetKey);
    }

    let current: Record<string, string> = row;
    let changed = false;
    for (const { sourceKey, targetKey } of resolvedRules) {
      if (!Object.prototype.hasOwnProperty.call(current, sourceKey)) {
        continue;
      }
      const next = renameKeyPreservingOrder(current, sourceKey, targetKey);
      if (next !== current) {
        current = next;
        changed = true;
      }
    }
    return changed ? current : row;
  }

  private async applyColumnRenameRulesAsync(
    rows: Record<string, string>[],
    rules: ModelColumnRenameRule[],
    batchSize: number,
    options?: {
      onProgress?: (message: string, done: number, total: number) => void | Promise<void>;
      yieldFn?: () => Promise<void>;
    },
    usage?: PreProcessingUsage
  ): Promise<Record<string, string>[]> {
    if (!rows.length) {
      return rows;
    }

    const resolvedRules = this.resolveColumnRenameRules(rows[0], rules);
    if (!resolvedRules.length) {
      return rows;
    }
    if (usage) {
      resolvedRules.forEach(resolved => resolved.rule && usage.used.add(resolved.rule));
    }

    const message = I18nService.t('MSG.msg.renommageDesEnTetes');
    const total = rows.length;
    const progressInterval = total > 50000 ? 10000 : total > 10000 ? 5000 : total;
    const processingBatch = total > 50000
      ? Math.max(batchSize, 4000)
      : Math.max(batchSize, 2000);

    await options?.onProgress?.(message, 0, total);
    await options?.yieldFn?.();

    for (let start = 0; start < total; start += processingBatch) {
      const end = Math.min(start + processingBatch, total);
      for (let i = start; i < end; i++) {
        const updated = this.applyResolvedColumnRenamesToRow(rows[i], resolvedRules);
        if (updated !== rows[i]) {
          rows[i] = updated;
        }
      }

      if (end === total || end % progressInterval === 0 || start === 0) {
        await options?.onProgress?.(message, end, total);
        await options?.yieldFn?.();
      }
    }

    return rows;
  }

  applyPreProcessing(
    rows: Record<string, string>[],
    config?: ModelPreProcessingConfig | null
  ): Record<string, string>[] {
    if (!config || !rows?.length) {
      return rows;
    }

    let result = rows.map(row => ({ ...row }));
    const sectionOrder = this.resolveSectionOrder(config.sectionOrder);

    for (const sectionId of sectionOrder) {
      switch (sectionId) {
        case 'rowFilters':
          if (config.rowFilters?.length) {
            result = this.applyRowFilters(result, config.rowFilters);
          }
          break;
        case 'formatActions':
          if (config.formatActions?.length) {
            result = this.applyFormatActions(result, config.formatActions);
          }
          break;
        case 'columnConcatRules':
          if (config.columnConcatRules?.length) {
            result = this.applyColumnConcatRules(result, config.columnConcatRules);
          }
          break;
        case 'columnMathRules':
          if (config.columnMathRules?.length) {
            result = this.applyColumnMathRules(result, config.columnMathRules);
          }
          break;
        case 'valueMappings':
          if (config.valueMappings?.length) {
            result = this.applyValueMappings(result, config.valueMappings, this.buildValueMappingContext(config));
          }
          break;
        case 'crossDedupRules':
          if (config.crossDedupRules?.length) {
            result = this.applyCrossDedupRules(result, config.crossDedupRules);
          }
          break;
        case 'columnRenameRules':
          if (config.columnRenameRules?.length) {
            result = this.applyColumnRenameRules(result, config.columnRenameRules);
          }
          break;
      }
    }

    result = this.applyEnvColumnToRows(result, config);
    result = this.applyPaysColumnToRows(result, config);

    return normalizeLeadingZeroCellsInRows(result);
  }

  applyRowFilters(
    rows: Record<string, string>[],
    filters: ModelRowFilter[],
    usage?: PreProcessingUsage
  ): Record<string, string>[] {
    if (!filters.length) {
      return rows;
    }

    let filtered = [...rows];

    for (const filter of filters) {
      if (!filter.enabled || !filter.column || !filter.selectedValues?.length) {
        continue;
      }

      if (filter.selectedValues.includes('__TOUS__')) {
        continue;
      }

      const countBefore = filtered.length;
      filtered = filtered.filter(row => {
        if (!row) {
          return false;
        }
        return this.rowMatchesRowFilter(row, filter);
      });
      if (usage && filtered.length < countBefore) {
        usage.used.add(filter);
      }
    }

    return filtered;
  }

  /**
   * Ligne conservée par un filtre : valeur de la colonne parmi les valeurs à conserver et,
   * pour cette valeur, toutes ses conditions remplies (ex. finished → actionDone non vide).
   */
  rowMatchesRowFilter(row: Record<string, string>, filter: ModelRowFilter): boolean {
    const key = resolveColumnKeyInRow(row, filter.column);
    if (!key) {
      return false;
    }
    const value = String(row[key] ?? '');
    if (!filter.selectedValues.includes(value)) {
      return false;
    }
    const trimmed = value.trim();
    return (filter.valueConditions || [])
      .filter(condition => condition.column?.trim()
        && (condition.values || []).some(v => v.trim() === trimmed))
      .every(condition => this.rowMatchesValueCondition(row, condition));
  }

  private rowMatchesValueCondition(
    row: Record<string, string>,
    condition: ModelRowFilterValueCondition
  ): boolean {
    const key = resolveColumnKeyInRow(row, condition.column);
    const raw = key ? String(row[key] ?? '').trim() : '';
    // Export d'une requête SQL : NULL peut arriver sous forme de texte « NULL ».
    const isEmpty = raw === '' || raw.toUpperCase() === 'NULL';
    const expected = (condition.value ?? '').trim();
    switch (condition.operator) {
      case 'empty':
        return isEmpty;
      case 'notEmpty':
        return !isEmpty;
      case 'equals':
        return raw === expected;
      case 'notEquals':
        return raw !== expected;
      default:
        return true;
    }
  }

  private async applyRowFiltersAsync(
    rows: Record<string, string>[],
    filters: ModelRowFilter[],
    batchSize: number,
    options?: {
      onProgress?: (message: string, done: number, total: number) => void | Promise<void>;
      yieldFn?: () => Promise<void>;
    },
    usage?: PreProcessingUsage
  ): Promise<Record<string, string>[]> {
    if (!filters.length || !rows.length) {
      return rows;
    }

    const inlineLimit = options?.yieldFn ? 8000 : PREPROCESS_INLINE_THRESHOLD;
    if (rows.length <= inlineLimit) {
      return this.applyRowFilters(rows, filters, usage);
    }

    let filtered = rows;
    for (const filter of filters) {
      if (!filter.enabled || !filter.column || !filter.selectedValues?.length) {
        continue;
      }
      if (filter.selectedValues.includes('__TOUS__')) {
        continue;
      }

      const next: Record<string, string>[] = [];
      for (let start = 0; start < filtered.length; start += batchSize) {
        const end = Math.min(start + batchSize, filtered.length);
        for (let i = start; i < end; i++) {
          const row = filtered[i];
          if (!row) {
            continue;
          }
          if (this.rowMatchesRowFilter(row, filter)) {
            next.push(row);
          }
        }
        await options?.onProgress?.(I18nService.t('MSG.msg.filtresDuModele'), end, filtered.length);
        await options?.yieldFn?.();
      }
      if (usage && next.length < filtered.length) {
        usage.used.add(filter);
      }
      filtered = next;
    }

    return filtered;
  }

  applyFormatActions(
    rows: Record<string, string>[],
    actions: ModelFormatAction[]
  ): Record<string, string>[] {
    const enabledActions = actions.filter(action => action.enabled && action.columns?.length);
    if (!enabledActions.length || !rows.length) {
      return rows;
    }

    const orderedActions = [...enabledActions].sort(
      (a, b) => (a.order ?? Number.MAX_SAFE_INTEGER) - (b.order ?? Number.MAX_SAFE_INTEGER)
    );

    const sampleRow = this.findSampleDataRow(rows);
    if (!sampleRow) {
      return rows;
    }

    const plan = this.buildFormatActionPlan(sampleRow, orderedActions);
    if (!plan.length) {
      return rows;
    }

    for (let i = 0; i < rows.length; i++) {
      this.applyFormatPlanToRows(rows, plan, i, i + 1);
    }

    return rows;
  }

  applyColumnConcatRules(
    rows: Record<string, string>[],
    rules: ModelColumnConcatRule[]
  ): Record<string, string>[] {
    const activeRules = this.getActiveColumnConcatRules(rules);
    if (!activeRules.length) {
      return rows;
    }

    return rows.map(row => this.applyColumnConcatRulesToRow(row, rules));
  }

  applyColumnMathRules(
    rows: Record<string, string>[],
    rules: ModelColumnMathRule[]
  ): Record<string, string>[] {
    const activeRules = this.getActiveColumnMathRules(rules);
    if (!activeRules.length) {
      return rows;
    }

    return rows.map(row => this.applyColumnMathRulesToRow({ ...row }, rules));
  }

  applyColumnRenameRules(
    rows: Record<string, string>[],
    rules: ModelColumnRenameRule[]
  ): Record<string, string>[] {
    if (!rows.length) {
      return rows;
    }

    const resolvedRules = this.resolveColumnRenameRules(rows[0], rules);
    if (!resolvedRules.length) {
      return rows;
    }

    for (let i = 0; i < rows.length; i++) {
      const updated = this.applyResolvedColumnRenamesToRow(rows[i], resolvedRules);
      if (updated !== rows[i]) {
        rows[i] = updated;
      }
    }
    return rows;
  }

  applyValueMappings(
    rows: Record<string, string>[],
    mappings: ModelColumnValueMapping[],
    context?: ValueMappingContext
  ): Record<string, string>[] {
    const activeMappings = this.getActiveValueMappings(mappings);
    if (!activeMappings.length) {
      return rows;
    }

    return rows.map(row => this.applyValueMappingsToRow(row, mappings, undefined, context));
  }

  /**
   * ENV / PAYS du traitement (choisis avant le traitement ou fixés par le modèle). Les colonnes ENV et
   * PAYS ne sont écrites qu'après les sections du modèle : les conditions du renommage lisent donc ces
   * valeurs, et à défaut la colonne ENV / PAYS déjà présente dans le fichier (ex. « Pays » d'un BO).
   */
  private buildValueMappingContext(config?: ModelPreProcessingConfig | null): ValueMappingContext {
    return {
      env: this.getActiveEnvColumnValue(config),
      pays: this.getActivePaysColumnValue(config)
    };
  }

  private resolveFormatActionColumnKeys(
    sampleRow: Record<string, string>,
    column: string
  ): string[] {
    const keys = resolveCanonicalColumnKeysInRow(sampleRow, column);
    if (keys.length) {
      return keys;
    }

    const direct = resolveColumnKeyInRow(sampleRow, column);
    if (direct) {
      return [direct];
    }

    for (const alias of getOrangeMoneyAliasHeadersForColumn(column)) {
      const aliasKey = resolveColumnKeyInRow(sampleRow, alias);
      if (aliasKey) {
        return [aliasKey];
      }
    }

    const normalizedTarget = this.normalizeColumnKey(column);
    for (const key of Object.keys(sampleRow)) {
      if (this.normalizeColumnKey(key) === normalizedTarget) {
        return [key];
      }
    }

    return [];
  }

  /**
   * Colonnes clé de réconciliation pour la déduplication du fichier final.
   */
  resolveReconciliationDedupColumnKeys(
    model: AutoProcessingModel,
    sampleRow: Record<string, string>,
    allModels?: AutoProcessingModel[]
  ): string[] {
    if (!sampleRow || !Object.keys(sampleRow).length) {
      return [];
    }

    // Modèle banque : les clés de réconciliation ne sont pas prises en compte.
    if (model.bankModel) {
      return [];
    }

    const resolved: string[] = [];
    const addCandidates = (candidates: string[]) => {
      for (const candidate of candidates) {
        const key = resolveColumnKeyInRow(sampleRow, candidate);
        if (key && !resolved.includes(key)) {
          resolved.push(key);
        }
      }
    };

    const rk = model.reconciliationKeys;
    addCandidates(rk?.partnerKeys || []);
    addCandidates(rk?.boKeys || []);

    if (rk?.partnerConditionalKeys?.defaultKeyColumn?.trim()) {
      addCandidates([rk.partnerConditionalKeys.defaultKeyColumn.trim()]);
    }

    if (rk?.boModelKeys) {
      for (const cols of Object.values(rk.boModelKeys)) {
        addCandidates((cols as string[]) || []);
      }
    }

    // Modèle BO sans clé propre : clés que les modèles partenaires déclarent pour lui
    // (ex. TRXGU1 → ID Partenaire + Token GU). Sans cela, le repli générique retenait
    // la colonne calculée CLE (Téléphone + Montant) et supprimait des transactions légitimes.
    if (!resolved.length && allModels?.length) {
      addCandidates(this.collectBoKeysDeclaredByPartners(model, allModels));
    }

    const modelHint = `${model.name || ''} ${model.filePattern || ''} ${model.templateFile || ''}`.toLowerCase();
    if (modelHint.includes('airtel')) {
      addCandidates([
        'Transaction ID',
        'Transaction Id',
        'transaction_id',
        'External Transaction Id',
        'external_transaction_id',
        'Record No',
        'S. No.',
        'S.No',
        'Sender MSISDN',
        'Payer Mobile Number',
        'Receiver MSISDN',
        ...PARTNER_REFERENCE_KEY_ALIASES
      ]);
    }
    if (modelHint.includes('trxbo') || modelHint.includes('orange') || modelHint.includes('oppart')) {
      addCandidates([
        'IDTransaction',
        'Numéro Trans GU',
        'Numero Trans GU',
        'numeroTransGU',
        'CLE',
        ...BO_RECONCILIATION_KEY_ALIASES
      ]);
    }

    if (!resolved.length) {
      // Repli générique : jamais sur une colonne calculée par le modèle (concaténation, calcul),
      // qui n'identifie pas une transaction (ex. CLE = Téléphone client + Montant).
      const computed = new Set([
        ...this.getActiveColumnConcatRules(model.preProcessingConfig?.columnConcatRules).map(r => normalizeColumnKey(r.targetColumn)),
        ...this.getActiveColumnMathRules(model.preProcessingConfig?.columnMathRules).map(r => normalizeColumnKey(r.targetColumn))
      ]);
      addCandidates(
        [...PARTNER_REFERENCE_KEY_ALIASES, ...BO_RECONCILIATION_KEY_ALIASES]
          .filter(alias => !computed.has(normalizeColumnKey(alias)))
      );
    }

    return resolved;
  }

  /** Colonnes BO déclarées comme clé pour `boModel` par les modèles partenaires qui lui sont rattachés. */
  private collectBoKeysDeclaredByPartners(boModel: AutoProcessingModel, allModels: AutoProcessingModel[]): string[] {
    const ids = [boModel.modelId, boModel.id].filter((v): v is string => !!v);
    if (!ids.length) {
      return [];
    }
    const keys: string[] = [];
    const add = (col?: string) => {
      const value = (col || '').trim();
      if (value && !keys.includes(value)) {
        keys.push(value);
      }
    };
    const addConditional = (cfg?: { enabled?: boolean; rules?: Array<{ keyColumn?: string }>; defaultKeyColumn?: string }) => {
      if (!cfg?.enabled) {
        return;
      }
      (cfg.rules || []).forEach(r => add(r.keyColumn));
      add(cfg.defaultKeyColumn);
    };
    for (const pm of allModels) {
      if (pm === boModel || pm.bankModel) {
        continue;
      }
      const rk = pm.reconciliationKeys;
      if (!rk) {
        continue;
      }
      for (const id of ids) {
        const cols = rk.boModelKeys?.[id];
        if (Array.isArray(cols)) {
          cols.forEach(c => add(c));
          addConditional(rk.boConditionalKeys);
          addConditional(rk.boModelConfigs?.[id]?.boConditionalKeys);
        }
      }
    }
    return keys;
  }

  /**
   * Résout les noms de colonnes configurés vers les clés réelles présentes dans les données.
   */
  resolveDedupColumnKeysInRows(
    sampleRow: Record<string, string>,
    configuredColumns: string[]
  ): string[] {
    const resolved: string[] = [];
    for (const column of configuredColumns || []) {
      const trimmed = column?.trim();
      if (!trimmed) {
        continue;
      }
      const key = resolveColumnKeyInRow(sampleRow, trimmed);
      if (key && !resolved.includes(key)) {
        resolved.push(key);
      }
    }
    return resolved;
  }

  /**
   * Supprime les doublons selon les colonnes choisies par l'utilisateur (section Traitement).
   */
  deduplicateRowsByConfiguredColumns(
    rows: Record<string, string>[],
    configuredColumns: string[],
    model?: AutoProcessingModel,
    allModels?: AutoProcessingModel[]
  ): {
    uniqueRows: Record<string, string>[];
    duplicatesRemoved: number;
    dedupColumns: string[];
  } {
    if (!rows.length) {
      return { uniqueRows: [], duplicatesRemoved: 0, dedupColumns: [] };
    }

    const sampleRow = rows.find(r => Object.keys(r).length > 0) || rows[0];
    let dedupColumns = this.resolveDedupColumnKeysInRows(sampleRow, configuredColumns);

    if (!dedupColumns.length && model) {
      dedupColumns = this.resolveReconciliationDedupColumnKeys(model, sampleRow, allModels);
    }

    // Modèle banque sans colonnes de dédoublonnage choisies : aucune ligne n'est supprimée.
    if (!dedupColumns.length && model?.bankModel) {
      return { uniqueRows: rows, duplicatesRemoved: 0, dedupColumns: [] };
    }

    if (!dedupColumns.length) {
      return this.deduplicateRowsByAllColumns(rows);
    }

    return this.deduplicateRowsByResolvedColumns(rows, dedupColumns);
  }

  /**
   * Supprime les doublons du fichier final sur la clé de réconciliation du modèle.
   */
  deduplicateRowsByReconciliationKey(
    model: AutoProcessingModel,
    rows: Record<string, string>[],
    allModels?: AutoProcessingModel[]
  ): {
    uniqueRows: Record<string, string>[];
    duplicatesRemoved: number;
    dedupColumns: string[];
  } {
    if (!rows.length) {
      return { uniqueRows: [], duplicatesRemoved: 0, dedupColumns: [] };
    }

    // Modèle banque : pas de dédoublonnage sur la clé de réconciliation.
    if (model.bankModel) {
      return { uniqueRows: rows, duplicatesRemoved: 0, dedupColumns: [] };
    }

    const sampleRow = rows.find(r => Object.keys(r).length > 0) || rows[0];
    const dedupColumns = this.resolveReconciliationDedupColumnKeys(model, sampleRow, allModels);

    if (!dedupColumns.length) {
      return this.deduplicateRowsByAllColumns(rows);
    }

    return this.deduplicateRowsByResolvedColumns(rows, dedupColumns);
  }

  private deduplicateRowsByResolvedColumns(
    rows: Record<string, string>[],
    dedupColumns: string[]
  ): {
    uniqueRows: Record<string, string>[];
    duplicatesRemoved: number;
    dedupColumns: string[];
  } {
    const seen = new Set<string>();
    const uniqueRows: Record<string, string>[] = [];
    let duplicatesRemoved = 0;

    for (const row of rows) {
      const parts = dedupColumns.map(col => String(row[col] ?? '').trim().toLowerCase());
      // Clé entièrement vide : pas un doublon, la ligne est conservée
      // (ex. Wave api_payout sans identifiant de session API → ID PARTENAIRE PM vide).
      if (parts.every(p => p === '')) {
        uniqueRows.push(row);
        continue;
      }
      const key = parts.join('\u0001');
      if (seen.has(key)) {
        duplicatesRemoved++;
        continue;
      }
      seen.add(key);
      uniqueRows.push(row);
    }

    return { uniqueRows, duplicatesRemoved, dedupColumns };
  }

  private deduplicateRowsByAllColumns(rows: Record<string, string>[]): {
    uniqueRows: Record<string, string>[];
    duplicatesRemoved: number;
    dedupColumns: string[];
  } {
    const seen = new Set<string>();
    const uniqueRows: Record<string, string>[] = [];
    let duplicatesRemoved = 0;
    const orderedKeys = Object.keys(rows[0] || {});

    for (const row of rows) {
      let key = '';
      for (let i = 0; i < orderedKeys.length; i++) {
        const k = orderedKeys[i];
        key += `${row[k] ?? ''}\u0001`;
      }
      if (seen.has(key)) {
        duplicatesRemoved++;
        continue;
      }
      seen.add(key);
      uniqueRows.push(row);
    }

    return { uniqueRows, duplicatesRemoved, dedupColumns: orderedKeys };
  }

  private mergeFormatActionForColumn(action: ModelFormatAction, column: string): ModelFormatAction {
    const overrides = this.findFormatColumnSettings(action, column);
    if (!overrides) {
      return action;
    }
    return {
      ...action,
      ...overrides,
      type: action.type,
      enabled: action.enabled,
      columns: action.columns,
      order: action.order,
      columnSettings: action.columnSettings
    };
  }

  private findFormatColumnSettings(
    action: ModelFormatAction,
    column: string
  ): ModelFormatAction['columnSettings'] extends Record<string, infer S> ? S | undefined : undefined {
    if (!action.columnSettings) {
      return undefined;
    }
    if (action.columnSettings[column]) {
      return action.columnSettings[column];
    }
    const targetKey = this.normalizeColumnKey(column);
    for (const [key, settings] of Object.entries(action.columnSettings)) {
      if (this.normalizeColumnKey(key) === targetKey) {
        return settings;
      }
    }
    return undefined;
  }

  /** Vérifie la condition optionnelle (action ou colonne) avant d'appliquer le formatage. */
  private isFormatActionConditionMet(
    row: Record<string, string>,
    action: ModelFormatAction,
    targetColumn: string
  ): boolean {
    const columnSettings = this.findFormatColumnSettings(action, targetColumn);

    let conditionColumn = '';
    let conditionValue = '';

    if (columnSettings?.applyConditionEnabled === true) {
      conditionColumn = (columnSettings.conditionColumn ?? '').trim();
      conditionValue = String(columnSettings.conditionValue ?? '').trim();
    } else if (action.applyConditionEnabled) {
      conditionColumn = (action.conditionColumn ?? '').trim();
      conditionValue = String(action.conditionValue ?? '').trim();
    } else {
      return true;
    }

    if (!conditionColumn) {
      return true;
    }

    const key = resolveColumnKeyInRow(row, conditionColumn);
    if (!key) {
      return false;
    }

    return matchesConditionValues(String(row[key] ?? ''), conditionValue);
  }

  private coerceFormatCellValueFast(value: unknown): string {
    if (value === null || value === undefined) {
      return '';
    }
    if (typeof value === 'number') {
      if (!Number.isFinite(value)) {
        return '';
      }
      return preserveLeadingZeroString(value);
    }

    const asString = String(value);
    if (!/Ã.|Â.|ï¿½|\uFFFD/.test(asString)) {
      return unwrapExcelTextFormula(asString.trim());
    }

    return unwrapExcelTextFormula(fixCellEncodingIfNeeded(asString).trim());
  }

  private coerceFormatCellValue(value: unknown): string {
    if (value === null || value === undefined) {
      return '';
    }
    if (typeof value === 'number') {
      if (!Number.isFinite(value)) {
        return '';
      }
      return preserveLeadingZeroString(value);
    }
    return unwrapExcelTextFormula(fixCellEncodingIfNeeded(String(value)).trim());
  }

  private applyFormatActionToValue(
    value: string,
    action: ModelFormatAction,
    columnName?: string,
    row?: Record<string, string>
  ): string {
    if (!value.length) {
      return value;
    }

    let result: string;
    switch (action.type) {
      case 'removeSpecialStrings':
        result = this.applyRemoveSpecialString(value, action);
        break;
      case 'removeCharacters':
        result = this.applyRemoveCharacters(value, action);
        break;
      case 'removeNumbers':
        result = value.replace(/\d/g, '');
        break;
      case 'removeIndicatif':
        result = this.applyRemoveIndicatif(value, action);
        break;
      case 'removeDecimals':
        result = this.applyRemoveDecimals(value, action);
        break;
      case 'keepLastDigits':
        result = this.applyKeepLastDigits(value, action);
        break;
      case 'removeZeroDecimals':
        result = value.endsWith('.0') ? value.slice(0, -2) : value;
        break;
      case 'removeSpaces':
        result = this.applyRemoveSpaces(value, action);
        break;
      case 'timezoneShift': {
        const hours = this.resolveRowTimezoneShiftHours(action, row);
        result = String(shiftDateTimeValue(value, hours).value);
        break;
      }
      default:
        result = value;
    }

    // La finalisation « supprimer / conserver des caractères » (zéro initial) est faite une seule
    // fois par l'appelant (finalizeFormatColumnValue) : l'appliquer ici aussi retirait deux zéros.
    return result;
  }

  /**
   * Décalage horaire d'une ligne : fixe (pays / saisie) ou lu dans la colonne pays de la ligne
   * (ex. « Pays » = CM → +1 h, GA → +1 h, KE → +3 h). Pays inconnu : 0, la date n'est pas modifiée.
   */
  private resolveRowTimezoneShiftHours(action: ModelFormatAction, row?: Record<string, string>): number {
    if (action.timezoneCountry !== TIMEZONE_COUNTRY_FROM_COLUMN) {
      return resolveTimezoneShiftHours(action.timezoneCountry, action.timezoneToReference, action.timezoneCustomHours);
    }
    const countryColumn = (action.timezoneCountryColumn ?? '').trim();
    if (!row || !countryColumn) {
      return 0;
    }
    const key = resolveColumnKeyInRow(row, countryColumn) ?? countryColumn;
    return resolveTimezoneShiftHoursForCountryValue(row[key], action.timezoneToReference);
  }

  private finalizeFormatColumnValue(
    columnName: string,
    action: ModelFormatAction,
    value: string
  ): string {
    if (action.type === 'removeCharacters') {
      return finalizeRemoveCharactersCell(columnName, value, {
        removeCharMode: action.removeCharMode ?? 'remove',
        removeCharCount: action.removeCharCount,
        leadingZeroMode: action.leadingZeroMode
      });
    }
    return value;
  }

  /** Chaînes à supprimer séparées par des virgules (ex. « _CM, _CI, _BF »). */
  private applyRemoveSpecialString(value: string, action: ModelFormatAction): string {
    return removeSpecialStrings(value, action.specialStringToRemove, action.specialStringRemovalMode);
  }

  private applyRemoveCharacters(value: string, action: ModelFormatAction): string {
    return applyRemoveCharactersWithLeadingZero(
      value,
      action.leadingZeroMode,
      text => this.cutCharacters(text, action)
    );
  }

  private cutCharacters(text: string, action: ModelFormatAction): string {
    const mode = action.removeCharMode ?? 'remove';
    const position = action.removeCharPosition ?? 'start';
    const count = Math.max(1, Number(action.removeCharCount) || 1);
    const specificPosition = Math.max(1, Number(action.removeCharSpecificPosition) || 1);

    if (mode === 'keep') {
      return keepCharactersFromString(text, position, count, specificPosition);
    }

    switch (position) {
      case 'start':
        return text.length >= count ? text.substring(count) : text;
      case 'end':
        return text.length >= count ? text.substring(0, text.length - count) : text;
      case 'specific': {
        const pos = specificPosition - 1;
        if (pos >= 0 && pos < text.length && pos + count <= text.length) {
          return text.substring(0, pos) + text.substring(pos + count);
        }
        return text;
      }
      default:
        return text;
    }
  }

  private applyRemoveIndicatif(value: string, action: ModelFormatAction): string {
    const trimmed = value.trim();
    const type = action.indicatifType ?? 'international';

    switch (type) {
      case 'international': {
        const internationalPattern = /^\+(\d{1,4})\s*/;
        return internationalPattern.test(trimmed)
          ? trimmed.replace(internationalPattern, '')
          : trimmed;
      }
      case 'national': {
        const nationalPattern = /^0\d\s*\d{2}\s*\d{2}\s*\d{2}\s*\d{2}$/;
        if (nationalPattern.test(trimmed.replace(/\s/g, ''))) {
          const cleanNumber = trimmed.replace(/\s/g, '').substring(1);
          return cleanNumber.replace(/(\d{2})(?=\d)/g, '$1 ');
        }
        return trimmed;
      }
      case 'custom': {
        const custom = action.customIndicatif ?? '';
        return custom && trimmed.startsWith(custom)
          ? trimmed.substring(custom.length).trim()
          : trimmed;
      }
      default:
        return trimmed;
    }
  }

  private applyRemoveDecimals(value: string, action: ModelFormatAction): string {
    const trimmed = value.trim();
    if (!trimmed) {
      return value;
    }

    const keepTrailingZeros = action.keepTrailingZeros ?? false;
    const preferredSeparator = action.decimalSeparator ?? ',';
    const sign = trimmed.startsWith('-') ? '-' : trimmed.startsWith('+') ? '+' : '';
    const unsigned = sign ? trimmed.slice(1).trim() : trimmed;

    const stripDecimalPart = (integerPart: string, decimalPart: string): string | null => {
      if (keepTrailingZeros && !/^0+$/.test(decimalPart)) {
        return null;
      }
      return integerPart;
    };

    const tryFrench = (input: string): string | null => {
      const match = input.match(/^([\d\s]+)\s*,\s*(\d+)\s*$/);
      if (!match) {
        return null;
      }
      const result = stripDecimalPart(match[1].replace(/\s/g, ''), match[2]);
      return result;
    };

    const tryEnglish = (input: string): string | null => {
      const match = input.match(/^([\d,]+)\s*\.\s*(\d+)\s*$/);
      if (!match) {
        return null;
      }
      const result = stripDecimalPart(match[1].replace(/,/g, ''), match[2]);
      return result;
    };

    const tryPlainDot = (input: string): string | null => {
      const match = input.match(/^(\d+)\.(\d+)$/);
      if (!match) {
        return null;
      }
      return stripDecimalPart(match[1], match[2]);
    };

    const tryPlainComma = (input: string): string | null => {
      const match = input.match(/^(\d+),(\d+)$/);
      if (!match) {
        return null;
      }
      return stripDecimalPart(match[1], match[2]);
    };

    const attempts = preferredSeparator === '.'
      ? [tryEnglish, tryPlainDot, tryFrench, tryPlainComma]
      : [tryFrench, tryPlainComma, tryEnglish, tryPlainDot];

    for (const attempt of attempts) {
      const result = attempt(unsigned);
      if (result !== null) {
        return `${sign}${result}`;
      }
    }

    return trimmed;
  }

  private applyKeepLastDigits(value: string, action: ModelFormatAction): string {
    const count = action.keepLastDigitsCount ?? 3;
    const trimmed = value.trim();
    const digitsOnly = trimmed.replace(/\D/g, '');

    if (!digitsOnly.length) {
      return trimmed;
    }

    if (digitsOnly.length >= count) {
      return digitsOnly.slice(-count);
    }

    return digitsOnly;
  }

  private applyRemoveSpaces(value: string, action: ModelFormatAction): string {
    switch (action.removeSpacesType ?? 'all') {
      case 'leading':
        return value.replace(/^\s+/, '');
      case 'trailing':
        return value.replace(/\s+$/, '');
      case 'multiple':
        return value.replace(/\s+/g, ' ');
      case 'all':
      default:
        return value.replace(/\s/g, '');
    }
  }

  hasPreProcessing(config?: ModelPreProcessingConfig | null): boolean {
    if (!config) {
      return false;
    }

    return this.getActiveFilters(config).length > 0
      || this.getActiveFormatActions(config).length > 0
      || this.getActiveColumnConcatRules(config?.columnConcatRules).length > 0
      || this.getActiveColumnMathRules(config?.columnMathRules).length > 0
      || this.getActiveValueMappings(config?.valueMappings).length > 0
      || this.getActiveColumnRenameRules(config?.columnRenameRules).length > 0
      || this.getActiveCrossDedupRules(config?.crossDedupRules).length > 0
      || this.isEnvColumnEnabled(config)
      || this.getActivePaysColumnValue(config) !== null;
  }

  /** Colonnes référencées par la config pré-traitement (filtres, formatage, etc.). */
  collectReferencedColumns(config?: ModelPreProcessingConfig | null): string[] {
    const columns = new Set<string>();

    for (const filter of this.getActiveFilters(config)) {
      if (filter.column) {
        columns.add(filter.column);
      }
    }

    for (const action of this.getActiveFormatActions(config)) {
      action.columns?.forEach(column => columns.add(column));
      if (action.conditionColumn) {
        columns.add(action.conditionColumn);
      }
      Object.values(action.columnSettings ?? {}).forEach(settings => {
        if (settings.conditionColumn) {
          columns.add(settings.conditionColumn);
        }
      });
    }

    for (const rule of this.getActiveColumnConcatRules(config?.columnConcatRules)) {
      rule.sourceColumns?.forEach(column => columns.add(column));
      if (rule.targetColumn) {
        columns.add(rule.targetColumn);
      }
    }

    for (const rule of this.getActiveColumnMathRules(config?.columnMathRules)) {
      columns.add(rule.sourceColumnA);
      columns.add(rule.sourceColumnB);
      if (rule.targetColumn) {
        columns.add(rule.targetColumn);
      }
    }

    for (const mapping of this.getActiveValueMappings(config?.valueMappings)) {
      if (mapping.column) {
        columns.add(mapping.column);
      }
      if (mapping.conditionColumn?.trim()) {
        columns.add(mapping.conditionColumn.trim());
      }
    }

    for (const rule of this.getActiveCrossDedupRules(config?.crossDedupRules)) {
      columns.add(rule.columnA);
      columns.add(rule.columnB);
      if (rule.conditionColumn?.trim()) {
        columns.add(rule.conditionColumn.trim());
      }
    }

    for (const rule of this.getActiveColumnRenameRules(config?.columnRenameRules)) {
      if (rule.sourceColumn) {
        columns.add(rule.sourceColumn);
      }
      if (rule.targetColumn) {
        columns.add(rule.targetColumn);
      }
    }

    return Array.from(columns);
  }

  /**
   * Colonnes sources requises avant traitement (exclut les cibles créées par renommage / concaténation).
   */
  collectInputColumns(config?: ModelPreProcessingConfig | null): string[] {
    const columns = new Set<string>();

    for (const filter of this.getActiveFilters(config)) {
      if (filter.column) {
        columns.add(filter.column);
      }
    }

    for (const action of this.getActiveFormatActions(config)) {
      action.columns?.forEach(column => columns.add(column));
      if (action.conditionColumn) {
        columns.add(action.conditionColumn);
      }
      Object.values(action.columnSettings ?? {}).forEach(settings => {
        if (settings.conditionColumn) {
          columns.add(settings.conditionColumn);
        }
      });
    }

    for (const rule of this.getActiveColumnConcatRules(config?.columnConcatRules)) {
      rule.sourceColumns?.forEach(column => columns.add(column));
    }

    for (const rule of this.getActiveColumnMathRules(config?.columnMathRules)) {
      columns.add(rule.sourceColumnA);
      columns.add(rule.sourceColumnB);
    }

    for (const mapping of this.getActiveValueMappings(config?.valueMappings)) {
      if (mapping.column) {
        columns.add(mapping.column);
      }
      if (mapping.conditionColumn?.trim()) {
        columns.add(mapping.conditionColumn.trim());
      }
    }

    for (const rule of this.getActiveCrossDedupRules(config?.crossDedupRules)) {
      columns.add(rule.columnA);
      columns.add(rule.columnB);
      if (rule.conditionColumn?.trim()) {
        columns.add(rule.conditionColumn.trim());
      }
    }

    for (const rule of this.getActiveColumnRenameRules(config?.columnRenameRules)) {
      if (rule.sourceColumn) {
        columns.add(rule.sourceColumn);
      }
    }

    return Array.from(columns);
  }

  getActiveCrossDedupRules(rules?: ModelCrossDedupRule[] | null): ModelCrossDedupRule[] {
    return (rules ?? []).filter(
      rule => rule.enabled !== false && !!rule.columnA && !!rule.columnB && rule.columnA !== rule.columnB
    );
  }

  getActiveFilters(config?: ModelPreProcessingConfig | null): ModelRowFilter[] {
    return (config?.rowFilters ?? []).filter(
      filter => filter.enabled && filter.column && filter.selectedValues?.length
    );
  }

  getActiveFormatActions(config?: ModelPreProcessingConfig | null): ModelFormatAction[] {
    return (config?.formatActions ?? []).filter(
      action => action.enabled && action.columns?.length
    );
  }

  getActiveValueMappings(mappings?: ModelColumnValueMapping[] | null): ModelColumnValueMapping[] {
    return (mappings ?? []).filter(
      mapping => mapping.enabled
        && !!mapping.column
        && (mapping.fromEmpty === true || (
          mapping.fromValue !== undefined
          && mapping.fromValue !== null
          && String(mapping.fromValue).length > 0
        ))
    );
  }

  private valueMappingConditionMatches(
    row: Record<string, string>,
    mapping: ModelColumnValueMapping
  ): boolean {
    const conditionColumn = (mapping.conditionColumn ?? '').trim();
    const conditionValue = (mapping.conditionValue ?? '').trim();
    if (!conditionColumn || !conditionValue) {
      return true;
    }
    const conditionKey = resolveColumnKeyInRow(row, conditionColumn);
    if (!conditionKey) {
      return false;
    }
    return String(row[conditionKey] ?? '') === conditionValue;
  }

  /** Conditions ENV et pays du renommage (vides = toujours vraies ; sans valeur connue = non remplies). */
  private valueMappingEnvPaysMatches(
    row: Record<string, string>,
    mapping: ModelColumnValueMapping,
    context?: ValueMappingContext
  ): boolean {
    const matches = (expected: string | undefined, fromContext: string | null | undefined, column: string): boolean => {
      const wanted = (expected ?? '').trim().toUpperCase();
      if (!wanted) {
        return true;
      }
      let actual = (fromContext ?? '').trim();
      if (!actual) {
        const key = resolveColumnKeyInRow(row, column);
        actual = key ? String(row[key] ?? '').trim() : '';
      }
      return actual.toUpperCase() === wanted;
    };
    return matches(mapping.envConditionValue, context?.env, ENV_COLUMN_NAME)
      && matches(mapping.paysConditionValue, context?.pays, PAYS_COLUMN_NAME);
  }

  getActiveColumnConcatRules(rules?: ModelColumnConcatRule[] | null): ModelColumnConcatRule[] {
    return (rules ?? []).filter(
      rule => rule.enabled
        && !!rule.targetColumn?.trim()
        && rule.sourceColumns?.length >= 2
    );
  }

  getActiveColumnMathRules(rules?: ModelColumnMathRule[] | null): ModelColumnMathRule[] {
    return (rules ?? []).filter(
      rule => rule.enabled
        && !!rule.sourceColumnA
        && !!rule.sourceColumnB
        && !!rule.targetColumn?.trim()
        && rule.sourceColumnA !== rule.sourceColumnB
    );
  }

  resolveSectionOrder(order?: ModelPreProcessingSectionId[] | null): ModelPreProcessingSectionId[] {
    return resolvePreProcessingSectionOrder(order);
  }

  /** Doublons entre deux colonnes : règles actives appliquées dans l'ordre. */
  applyCrossDedupRules(
    rows: Record<string, string>[],
    rules: ModelCrossDedupRule[],
    usage?: PreProcessingUsage
  ): Record<string, string>[] {
    let result = rows;
    for (const rule of this.getActiveCrossDedupRules(rules)) {
      const condition = rule.conditionColumn
        ? {
          colonne: rule.conditionColumn,
          operateur: rule.conditionOperator || 'EGAL',
          valeurs: parseValeursCondition(rule.conditionValue)
        }
        : null;
      const sortie = supprimerDoublonsCroises(result, rule.columnA, rule.columnB, rule.deleteSide === 'B' ? 'B' : 'A', condition);
      if (sortie.supprimees) {
        usage?.used.add(rule);
        console.log(`[Pré-traitement] Doublons entre « ${rule.columnA} » et « ${rule.columnB} » : ${sortie.supprimees} ligne(s) supprimée(s) côté ${rule.deleteSide === 'B' ? 'B' : 'A'}`);
      }
      result = sortie.rows;
    }
    return result;
  }

  getActiveColumnRenameRules(rules?: ModelColumnRenameRule[] | null): ModelColumnRenameRule[] {
    return (rules ?? []).filter(
      rule => rule.enabled
        && !!rule.sourceColumn
        && !!rule.targetColumn?.trim()
        && rule.sourceColumn !== rule.targetColumn.trim()
    );
  }

  private markFormatColumnUsed(usage: PreProcessingUsage, action: ModelFormatAction, column: string): void {
    usage.used.add(action);
    let columns = usage.formatColumns.get(action);
    if (!columns) {
      columns = new Set<string>();
      usage.formatColumns.set(action, columns);
    }
    columns.add(column);
  }

  /**
   * Résumé du pré-traitement. Sans `usage` : toute la configuration active (aperçu avant traitement).
   * Avec `usage` : uniquement ce qui a réellement modifié les données lors du traitement.
   */
  getPreProcessingSummary(config?: ModelPreProcessingConfig | null, usage?: PreProcessingUsage | null): {
    activeFilterCount: number;
    activeFormatCount: number;
    activeConcatCount: number;
    activeMathCount: number;
    activeValueMappingCount: number;
    activeColumnRenameCount: number;
    summaryText: string;
    detailText: string;
  } {
    const wasUsed = (item: object): boolean => !usage || usage.used.has(item);
    const filters = this.getActiveFilters(config).filter(wasUsed);
    const formats = this.getActiveFormatActions(config).filter(wasUsed);
    const concatRules = this.getActiveColumnConcatRules(config?.columnConcatRules).filter(wasUsed);
    const mathRules = this.getActiveColumnMathRules(config?.columnMathRules).filter(wasUsed);
    const valueMappings = this.getActiveValueMappings(config?.valueMappings).filter(wasUsed);
    const columnRenameRules = this.getActiveColumnRenameRules(config?.columnRenameRules).filter(wasUsed);
    const envUsed = this.isEnvColumnEnabled(config) && (!usage || (!!config?.envColumn && usage.used.has(config.envColumn)));
    const parts: string[] = [];

    if (filters.length) {
      parts.push(I18nService.t('MSG.msg.filtreSDeLignes', { p0: filters.length }));
    }
    if (formats.length) {
      parts.push(I18nService.t('MSG.msg.actionSDeFormatage', { p0: formats.length }));
    }
    if (concatRules.length) {
      parts.push(I18nService.t('MSG.msg.concatenationSDeColonnes', { p0: concatRules.length }));
    }
    if (mathRules.length) {
      parts.push(I18nService.t('MSG.msg.calculSDeColonnes', { p0: mathRules.length }));
    }
    if (valueMappings.length) {
      parts.push(I18nService.t('MSG.msg.renommageSDeValeurs', { p0: valueMappings.length }));
    }
    if (columnRenameRules.length) {
      parts.push(I18nService.t('MSG.msg.renommageSDEnTetes', { p0: columnRenameRules.length }));
    }
    const crossDedupRules = this.getActiveCrossDedupRules(config?.crossDedupRules).filter(wasUsed);
    if (crossDedupRules.length) {
      parts.push(`${crossDedupRules.length} règle(s) de doublons entre deux colonnes`);
    }
    if (envUsed) {
      parts.push(I18nService.t('MSG.pp.envColumn', { name: ENV_COLUMN_NAME }));
    }
    const paysValue = this.getActivePaysColumnValue(config);
    const paysUsed = !!paysValue && (!usage || (!!config?.paysColumn && usage.used.has(config.paysColumn)));
    if (paysUsed) {
      parts.push(I18nService.t('MSG.pp.envColumn', { name: PAYS_COLUMN_NAME }));
    }
    if (this.isExportColumnFilterEnabled(config)) {
      const kept = config?.exportColumnFilter?.keptColumns?.length ?? 0;
      parts.push(kept > 0
        ? I18nService.t('MSG.msg.exportColonneSConserveeS', { p0: kept })
        : I18nService.t('MSG.msg.filtrageColonnesExport'));
    }

    const detailLines: string[] = [];
    filters.forEach(filter => {
      const conditions = (filter.valueConditions || [])
        .filter(c => c.column?.trim() && c.values?.length)
        .map(c => I18nService.t('APM.rowFilterCondSummary', {
          values: c.values.join(', '),
          condition: describeRowFilterCondition(c)
        }));
      detailLines.push(I18nService.t('MSG.msg.filtre', {
        p0: filter.column,
        p1: [filter.selectedValues.join(', '), ...conditions].join(' ; ')
      }));
    });
    crossDedupRules.forEach(rule => {
      const cote = rule.deleteSide === 'B' ? rule.columnB : rule.columnA;
      const condition = rule.conditionColumn
        ? ` si ${rule.conditionColumn} ${rule.conditionOperator || 'EGAL'} ${rule.conditionValue ?? ''}`.trimEnd()
        : '';
      detailLines.push(`• Doublons : ${rule.columnA} / ${rule.columnB}, suppression côté ${cote}${condition}`);
    });
    formats.forEach(action => {
      const changedColumns = usage?.formatColumns.get(action);
      detailLines.push(I18nService.t('MSG.msg.format', {
        p0: this.describeFormatAction(action, changedColumns ? Array.from(changedColumns) : undefined)
      }));
    });
    concatRules.forEach(rule => {
      const separatorLabel = rule.separator === ' '
        ? I18nService.t('MSG.pp.space')
        : `« ${rule.separator} »`;
      detailLines.push(
        I18nService.t('MSG.msg.concatenationSeparateur', { p0: rule.sourceColumns.join(' + '), p1: rule.targetColumn, p2: separatorLabel })
      );
    });
    mathRules.forEach(rule => {
      const operator = COLUMN_MATH_OPERATORS[rule.operation] ?? '+';
      detailLines.push(
        I18nService.t('MSG.msg.calcul', { p0: rule.sourceColumnA, p1: operator, p2: rule.sourceColumnB, p3: rule.targetColumn })
      );
    });
    valueMappings.forEach(mapping => {
      const conditionColumn = (mapping.conditionColumn ?? '').trim();
      const conditionValue = (mapping.conditionValue ?? '').trim();
      const conditionSuffix = conditionColumn && conditionValue
        ? I18nService.t('MSG.pp.condEquals', { column: conditionColumn, value: conditionValue })
        : '';
      detailLines.push(
        I18nService.t('MSG.msg.renommage', {
          p0: mapping.column,
          p1: mapping.fromEmpty ? I18nService.t('APM.valeurVideLibelle') : mapping.fromValue,
          p2: mapping.toValue,
          p3: conditionSuffix
        })
      );
    });
    columnRenameRules.forEach(rule => {
      detailLines.push(I18nService.t('MSG.msg.enTete', { p0: rule.sourceColumn, p1: rule.targetColumn }));
    });
    const envValue = envUsed ? this.getActiveEnvColumnValue(config) : null;
    if (envValue) {
      detailLines.push(`• ${ENV_COLUMN_NAME} : ${envValue}`);
    }
    if (paysUsed) {
      detailLines.push(`• ${PAYS_COLUMN_NAME} : ${paysValue}`);
    }
    if (this.isExportColumnFilterEnabled(config)) {
      const kept = config?.exportColumnFilter?.keptColumns || [];
      detailLines.push(
        kept.length
          ? I18nService.t('MSG.msg.exportColonneS', { p0: kept.length, p1: kept.join(', ') })
          : I18nService.t('MSG.msg.exportToutesLesColonnesDuCatalogue')
      );
    }

    return {
      activeFilterCount: filters.length,
      activeFormatCount: formats.length,
      activeConcatCount: concatRules.length,
      activeMathCount: mathRules.length,
      activeValueMappingCount: valueMappings.length,
      activeColumnRenameCount: columnRenameRules.length,
      summaryText: parts.length ? parts.join(' + ') : '',
      detailText: detailLines.join('\n')
    };
  }

  /**
   * Explique pourquoi les filtres de lignes ont tout supprimé : premier filtre actif qui
   * ne laisse aucune ligne, avec la colonne absente ou les valeurs réellement présentes.
   * Les filtres sont rejoués dans l'ordre sur les lignes d'entrée du pré-traitement.
   */
  describeEmptyRowFilterResult(
    rows: Record<string, string>[],
    config?: ModelPreProcessingConfig | null
  ): string {
    if (!rows?.length) {
      return '';
    }
    let remaining = rows;
    for (const filter of this.getActiveFilters(config)) {
      if (filter.selectedValues.includes('__TOUS__')) {
        continue;
      }
      const filtered = this.applyRowFilters(remaining, [filter]);
      if (filtered.length) {
        remaining = filtered;
        continue;
      }
      const expected = filter.selectedValues.join(', ');
      if (!resolveColumnKeyInRow(remaining[0], filter.column)) {
        return I18nService.t('FU.msg.filtreColonneAbsente', { p0: filter.column, p1: expected });
      }
      const found = new Set<string>();
      for (const row of remaining) {
        const key = resolveColumnKeyInRow(row, filter.column);
        found.add(key ? String(row[key] ?? '') : '');
        if (found.size >= 5) {
          break;
        }
      }
      const foundText = Array.from(found).map(v => v === '' ? I18nService.t('FU.msg.valeurVide') : v).join(', ');
      return I18nService.t('FU.msg.filtreAucuneValeur', { p0: filter.column, p1: expected, p2: foundText });
    }
    return '';
  }

  buildApplicationResult(
    rowsBefore: number,
    rowsAfter: number,
    config?: ModelPreProcessingConfig | null,
    usage?: PreProcessingUsage | null
  ): string {
    const summary = this.getPreProcessingSummary(config, usage);
    if (!summary.summaryText) {
      return '';
    }

    const removed = rowsBefore - rowsAfter;
    if (removed <= 0 && usage) {
      // Résumé de ce qui a été fait : pas de mention des filtres quand aucune ligne n'a été exclue.
      return I18nService.t('MSG.msg.appliquesSansExclusion', { p0: summary.summaryText, p1: summary.detailText });
    }
    const filterInfo = removed > 0
      ? I18nService.t('MSG.msg.ligneSExclueSParLes', { p0: removed })
      : I18nService.t('MSG.msg.aucuneLigneExclueParLesFiltres');

    return I18nService.t('MSG.msg.appliques', { p0: summary.summaryText, p1: filterInfo, p2: summary.detailText });
  }

  private describeFormatAction(action: ModelFormatAction, onlyColumns?: string[]): string {
    const columns = (onlyColumns?.length ? onlyColumns : action.columns).join(', ');
    const conditionSuffix = this.describeFormatActionCondition(action);

    switch (action.type) {
      case 'removeSpecialStrings':
        return I18nService.t('MSG.msg.supprimer', { p0: columns, p1: action.specialStringToRemove ?? '', p2: action.specialStringRemovalMode ?? 'all', p3: conditionSuffix });
      case 'removeCharacters': {
        const mode = action.removeCharMode === 'keep' ? I18nService.t('MSG.pp.keep') : I18nService.t('MSG.msg.supprimer2');
        const position = action.removeCharPosition === 'end'
          ? I18nService.t('MSG.pp.end')
          : action.removeCharPosition === 'specific'
            ? I18nService.t('MSG.pp.position', { n: action.removeCharSpecificPosition ?? 1 })
            : I18nService.t('MSG.msg.debut');
        const leadingZeroSuffix = action.leadingZeroMode === 'keep'
          ? I18nService.t('MSG.msg.zeroInitialConserve')
          : action.leadingZeroMode === 'strip'
            ? I18nService.t('MSG.msg.zeroInitialSupprime')
            : '';
        return I18nService.t('MSG.msg.caractereSDepuisLa', { p0: columns, p1: mode, p2: action.removeCharCount ?? 1, p3: position, p4: leadingZeroSuffix, p5: conditionSuffix });
      }
      case 'removeNumbers':
        return I18nService.t('MSG.msg.supprimerLesChiffres', { p0: columns, p1: conditionSuffix });
      case 'removeIndicatif':
        return I18nService.t('MSG.msg.supprimerIndicatif', { p0: columns, p1: action.indicatifType ?? 'international', p2: conditionSuffix });
      case 'removeDecimals':
        return I18nService.t('MSG.msg.supprimerDecimalesSeparateur', { p0: columns, p1: action.decimalSeparator ?? ',', p2: conditionSuffix });
      case 'keepLastDigits':
        return I18nService.t('MSG.msg.garderDerniersChiffres', { p0: columns, p1: action.keepLastDigitsCount ?? 3, p2: conditionSuffix });
      case 'removeZeroDecimals':
        return I18nService.t('MSG.msg.supprimer0EnFinDeValeur', { p0: columns, p1: conditionSuffix });
      case 'removeSpaces':
        return I18nService.t('MSG.msg.supprimerEspaces', { p0: columns, p1: action.removeSpacesType ?? 'all', p2: conditionSuffix });
      case 'timezoneShift': {
        const hours = resolveTimezoneShiftHours(
          action.timezoneCountry,
          action.timezoneToReference,
          action.timezoneCustomHours
        );
        if (action.timezoneCountry === TIMEZONE_COUNTRY_FROM_COLUMN) {
          return I18nService.t('MSG.msg.decalageHorairePaysColonne', { p0: columns, p1: action.timezoneCountryColumn ?? '', p2: conditionSuffix });
        }
        return I18nService.t('MSG.msg.decalageHoraire', { p0: columns, p1: `${hours > 0 ? '+' : ''}${hours}`, p2: conditionSuffix });
      }
      default:
        return `${columns}${conditionSuffix}`;
    }
  }

  private describeFormatActionCondition(action: ModelFormatAction): string {
    if (!action.applyConditionEnabled || !action.conditionColumn?.trim()) {
      return '';
    }
    const values = (action.conditionValue ?? '').trim();
    return values.includes(',')
      ? I18nService.t('MSG.pp.condIn', { column: action.conditionColumn, values })
      : I18nService.t('MSG.pp.condEquals', { column: action.conditionColumn, value: values });
  }

  /** Colonnes nécessaires en entrée / conservées en sortie pour le mode assisté. */
  buildAssistedColumnPlan(
    model: AutoProcessingModel,
    columnRules: ColumnProcessingRule[]
  ): { inputColumns: string[]; outputColumns: string[] } {
    const input = new Set<string>();
    const output: string[] = [];
    const outputSeen = new Set<string>();

    const addInput = (col?: string | null) => {
      const trimmed = (col || '').trim();
      if (trimmed) {
        input.add(trimmed);
      }
    };

    const addOutput = (col?: string | null) => {
      const trimmed = (col || '').trim();
      if (trimmed && !outputSeen.has(trimmed)) {
        outputSeen.add(trimmed);
        output.push(trimmed);
      }
    };

    const sortedRules = [...(columnRules || [])].sort(
      (a, b) => (a.ruleOrder ?? 0) - (b.ruleOrder ?? 0)
    );

    for (const rule of sortedRules) {
      addInput(rule.sourceColumn);
      if (rule.targetColumn?.trim()) {
        addOutput(rule.targetColumn.trim());
      } else {
        addOutput(rule.sourceColumn);
      }
    }

    const cfg = model.preProcessingConfig;
    if (cfg) {
      for (const filter of this.getActiveFilters(cfg)) {
        addInput(filter.column);
        addOutput(filter.column);
      }
      for (const action of this.getActiveFormatActions(cfg)) {
        for (const column of action.columns || []) {
          addInput(column);
          addOutput(column);
        }
        if (action.applyConditionEnabled && action.conditionColumn?.trim()) {
          addInput(action.conditionColumn.trim());
        }
        if (action.columnSettings) {
          for (const settings of Object.values(action.columnSettings)) {
            if (settings.applyConditionEnabled && settings.conditionColumn?.trim()) {
              addInput(settings.conditionColumn.trim());
            }
          }
        }
      }
      for (const rule of this.getActiveColumnConcatRules(cfg.columnConcatRules)) {
        for (const column of rule.sourceColumns || []) {
          addInput(column);
        }
        addOutput(rule.targetColumn);
      }
      for (const rule of this.getActiveColumnMathRules(cfg.columnMathRules)) {
        addInput(rule.sourceColumnA);
        addInput(rule.sourceColumnB);
        addOutput(rule.targetColumn);
      }
      for (const mapping of this.getActiveValueMappings(cfg.valueMappings)) {
        addInput(mapping.column);
        if (mapping.conditionColumn?.trim()) {
          addInput(mapping.conditionColumn.trim());
        }
        addOutput(mapping.column);
      }
    }

    const outputColumns = this.applyRenameRulesToOutputColumns(
      output,
      this.getActiveColumnRenameRules(cfg?.columnRenameRules)
    );

    if (this.isEnvColumnDeclared(cfg)) {
      if (!outputColumns.includes(ENV_COLUMN_NAME)) {
        outputColumns.push(ENV_COLUMN_NAME);
      }
    }
    if (this.isPaysColumnDeclared(cfg) && !outputColumns.includes(PAYS_COLUMN_NAME)) {
      outputColumns.push(PAYS_COLUMN_NAME);
    }

    return {
      inputColumns: [...input],
      outputColumns
    };
  }

  mergeOutputColumns(primary: string[], secondary: string[] = []): string[] {
    const merged: string[] = [];
    const seen = new Set<string>();
    for (const col of [...primary, ...secondary]) {
      const trimmed = (col || '').trim();
      if (trimmed && !seen.has(trimmed)) {
        seen.add(trimmed);
        merged.push(trimmed);
      }
    }
    return merged;
  }

  /** Colonnes connues pour les fichiers modèles standards (TRXBO, OPPART, USSDPART). */
  getDefaultTemplateColumns(
    templateFile?: string | null,
    filePattern?: string | null
  ): string[] {
    const key = `${templateFile || ''} ${filePattern || ''}`.toLowerCase();

    if (key.includes('trxbo')) {
      return [
        'ID', 'IDTransaction', 'téléphone client', 'montant', 'Service',
        'Moyen de Paiement', 'Agence', 'Agent', 'Type agent', 'PIXI',
        'Date', 'Numéro Trans GU', 'GRX', 'Statut', 'Latitude',
        'Longitude', 'ID Partenaire DIST', 'Expéditeur', 'Pays provenance',
        'Bénéficiaire', 'Canal de distribution'
      ];
    }

    if (key.includes('oppart') || key.includes('opbo')) {
      return [...OPERATION_BANCAIRE_TEMPLATE_COLUMNS];
    }

    if (key.includes('ussdpart')) {
      return [
        'ID', 'Groupe Réseaux', 'Code réseau', 'Agence', 'Code PIXI',
        'Code de Proxy', 'Code service', 'Numéro Trans GU', 'Destinataire',
        'Login agent', 'Type agent', 'date de création', 'Date d\'envoi vers part',
        'Etat', 'Type', 'Token', 'SMS', 'Action faite', 'Statut',
        'Utilisateur', 'Montant', 'Date dernier traitement', 'Latitude',
        'Longitude', 'Partenaire dist ID', 'Agence SC', 'Groupe reseau SC',
        'Agent SC', 'PDA SC'
      ];
    }

    if (key.includes('airtel')) {
      return [
        'Transaction ID', 'S. No.', 'Record No', 'Sender MSISDN', 'Payer Mobile Number',
        'Receiver MSISDN', 'Transaction Amount', 'Transaction Date', 'Transaction Type',
        'External Transaction Id', 'Service Charge', 'Previous Balance', 'Post Balance',
        'Status', 'Reference Number'
      ];
    }

    if (String(filePattern || '').toUpperCase().includes('OM')) {
      return [
        'N°', 'Date', 'Heure', 'Référence', 'Service', 'Paiement', 'Application :',
        'Statut', 'Généré le :', 'Mode', 'N° de Compte', 'Wallet', 'N° Pseudo',
        'Débit', 'Crédit', 'Montant', 'Commissions', 'Opération', 'Agent',
        'Correspondant', 'Sous-réseau'
      ];
    }

    return [];
  }

  resolveExportColumnName(
    column: string,
    renameRules: ModelColumnRenameRule[]
  ): string {
    const trimmed = (column || '').trim();
    if (!trimmed || !renameRules.length) {
      return trimmed;
    }

    const renameMap = new Map<string, string>();
    for (const rule of renameRules) {
      if (rule.sourceColumn && rule.targetColumn?.trim()) {
        renameMap.set(rule.sourceColumn, rule.targetColumn.trim());
      }
    }

    let current = trimmed;
    let guard = 0;
    while (renameMap.has(current) && guard < 10) {
      current = renameMap.get(current)!;
      guard++;
    }
    return current;
  }

  /**
   * Catalogue complet des colonnes exportables : template + règles du modèle,
   * avec les noms finaux après renommage d'en-têtes.
   */
  buildAssistedExportColumnCatalog(
    model: AutoProcessingModel,
    columnRules: ColumnProcessingRule[],
    templateColumns: string[] = []
  ): string[] {
    const cfg = model.preProcessingConfig;
    const renameRules = this.getActiveColumnRenameRules(cfg?.columnRenameRules);
    const catalog: string[] = [];
    const seen = new Set<string>();

    const add = (col?: string | null) => {
      const exportName = this.resolveExportColumnName((col || '').trim(), renameRules);
      if (exportName && !seen.has(exportName)) {
        seen.add(exportName);
        catalog.push(exportName);
      }
    };

    const defaults = templateColumns.length
      ? templateColumns
      : this.getDefaultTemplateColumns(model.templateFile, model.filePattern);
    for (const col of defaults) {
      add(col);
    }

    for (const rule of this.getActiveColumnConcatRules(cfg?.columnConcatRules)) {
      add(rule.targetColumn);
    }

    const sortedRules = [...(columnRules || [])].sort(
      (a, b) => (a.ruleOrder ?? 0) - (b.ruleOrder ?? 0)
    );
    for (const rule of sortedRules) {
      add(rule.targetColumn || rule.sourceColumn);
      add(rule.sourceColumn);
    }

    for (const col of this.collectReferencedColumns(cfg)) {
      add(col);
    }

    if (this.isEnvColumnDeclared(cfg)) {
      add(ENV_COLUMN_NAME);
    }
    if (this.isPaysColumnDeclared(cfg)) {
      add(PAYS_COLUMN_NAME);
    }

    return dedupeBilingualColumnNames(catalog, defaults);
  }

  private applyRenameRulesToOutputColumns(
    columns: string[],
    renameRules: ModelColumnRenameRule[]
  ): string[] {
    if (!renameRules.length) {
      return [...columns];
    }

    const renameMap = new Map<string, string>();
    for (const rule of renameRules) {
      if (rule.sourceColumn && rule.targetColumn?.trim()) {
        renameMap.set(rule.sourceColumn, rule.targetColumn.trim());
      }
    }

    const seen = new Set<string>();
    const result: string[] = [];
    for (const col of columns) {
      let current = col;
      let guard = 0;
      while (renameMap.has(current) && guard < 10) {
        current = renameMap.get(current)!;
        guard++;
      }
      if (current && !seen.has(current)) {
        seen.add(current);
        result.push(current);
      }
    }
    return result;
  }

  private normalizeColumnKey(columnName: string): string {
    return normalizeColumnKey(columnName);
  }

  private resolveRowColumnValue(row: Record<string, string>, column: string): string {
    const key = this.bulkKeyResolver
      ? this.bulkKeyResolver(row, column)
      : resolveColumnKeyInRow(row, column);
    if (key) {
      return row[key] ?? '';
    }
    return '';
  }

  isBlankColumnName(column?: string | null): boolean {
    const name = String(column ?? '').trim();
    return !name || name.toLowerCase() === 'undefined';
  }

  private isEmptyCellValue(value?: string | null): boolean {
    return !String(value ?? '').trim();
  }

  /** True si toutes les lignes ont une valeur vide pour cette colonne. */
  isColumnEmptyInAllRows(rows: Record<string, string>[], column: string): boolean {
    return this.withBulkKeyResolver(() => this.isColumnEmptyInAllRowsImpl(rows, column));
  }

  private isColumnEmptyInAllRowsImpl(rows: Record<string, string>[], column: string): boolean {
    if (!rows.length || this.isBlankColumnName(column)) {
      return true;
    }
    for (const row of rows) {
      if (!this.isEmptyCellValue(this.resolveRowColumnValue(row, column))) {
        return false;
      }
    }
    return true;
  }

  private collectColumnNamesFromRows(rows: Record<string, string>[]): string[] {
    const seen = new Set<string>();
    const result: string[] = [];
    for (const row of rows) {
      for (const key of Object.keys(row)) {
        if (!this.isBlankColumnName(key) && !seen.has(key)) {
          seen.add(key);
          result.push(key);
        }
      }
    }
    return result;
  }

  /**
   * Colonnes utiles pour export / déduplication : nom non vide et au moins une valeur renseignée.
   */
  getNonemptyExportColumns(
    rows: Record<string, string>[],
    candidateColumns?: string[]
  ): string[] {
    return this.withBulkKeyResolver(() => this.getNonemptyExportColumnsImpl(rows, candidateColumns));
  }

  private getNonemptyExportColumnsImpl(
    rows: Record<string, string>[],
    candidateColumns?: string[]
  ): string[] {
    if (!rows.length) {
      return [];
    }
    const columns = candidateColumns?.length
      ? candidateColumns.map(col => col.trim()).filter(col => !this.isBlankColumnName(col))
      : this.collectColumnNamesFromRows(rows);
    return columns.filter(col => !this.isColumnEmptyInAllRows(rows, col));
  }

  /**
   * Retire du fichier final les colonnes sans nom ou sans aucune valeur sur l'ensemble des lignes.
   */
  dropEmptyColumnsFromRows(
    rows: Record<string, string>[],
    candidateColumns?: string[]
  ): { rows: Record<string, string>[]; columns: string[] } {
    return this.withBulkKeyResolver(() => this.dropEmptyColumnsFromRowsImpl(rows, candidateColumns));
  }

  private dropEmptyColumnsFromRowsImpl(
    rows: Record<string, string>[],
    candidateColumns?: string[]
  ): { rows: Record<string, string>[]; columns: string[] } {
    if (!rows.length) {
      return { rows: [], columns: [] };
    }

    const keptColumns = this.getNonemptyExportColumns(rows, candidateColumns);
    if (!keptColumns.length) {
      return { rows: [], columns: [] };
    }

    const filteredRows = rows.map(row => {
      const filtered: Record<string, string> = {};
      for (const col of keptColumns) {
        filtered[col] = this.resolveRowColumnValue(row, col);
      }
      return filtered;
    });

    return { rows: filteredRows, columns: keptColumns };
  }

  /**
   * Modèles banque : convertit les colonnes montant (texte « -2,531,000 », « 139 474,44 »…)
   * en nombres (« -2531000 », « 139474.44 ») avant le résultat. Les valeurs non numériques sont conservées.
   */
  normalizeBankAmountColumns(rows: Record<string, string>[]): Record<string, string>[] {
    if (!rows.length) {
      return rows;
    }
    const amountColumns = Object.keys(rows[0]).filter(col =>
      /^(montant|debit|credit|solde.*|depottotal|totaldesretraits|totalretraits)$/.test(
        col.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '')
      )
    );
    if (!amountColumns.length) {
      return rows;
    }
    return rows.map(row => {
      const next = { ...row };
      for (const col of amountColumns) {
        const raw = next[col];
        if (raw === undefined || raw === null || String(raw).trim() === '') {
          continue;
        }
        const parsed = tryParseAmount(raw, { groupedThousands: true });
        if (parsed !== null) {
          next[col] = String(parsed);
        }
      }
      return next;
    });
  }

  /** Projette les lignes vers les colonnes finales du modèle (avec repli sur colonnes sources). */
  projectRowsToExportColumns(
    rows: Record<string, string>[],
    outputColumns: string[],
    columnRules: ColumnProcessingRule[],
    model?: AutoProcessingModel
  ): Record<string, string>[] {
    return this.withBulkKeyResolver(() =>
      this.projectRowsToExportColumnsImpl(rows, outputColumns, columnRules, model)
    );
  }

  private projectRowsToExportColumnsImpl(
    rows: Record<string, string>[],
    outputColumns: string[],
    columnRules: ColumnProcessingRule[],
    model?: AutoProcessingModel
  ): Record<string, string>[] {
    if (!rows.length || !outputColumns.length) {
      return rows;
    }

    const aliasesByOutput = this.buildOutputColumnAliases(columnRules, model?.preProcessingConfig);
    const orderedColumns = outputColumns
      .map(col => col.trim())
      .filter(col => !this.isBlankColumnName(col));

    const projectedRows = rows.map(row => {
      const projected: Record<string, string> = {};
      for (const col of orderedColumns) {
        projected[col] = this.resolveRowColumnValueWithAliases(
          row,
          col,
          aliasesByOutput.get(col) || []
        );
      }
      return projected;
    });

    return this.filterRowsToColumns(projectedRows, orderedColumns);
  }

  private buildOutputColumnAliases(
    columnRules: ColumnProcessingRule[],
    config?: ModelPreProcessingConfig | null
  ): Map<string, string[]> {
    const map = new Map<string, string[]>();
    const renameRules = this.getActiveColumnRenameRules(config?.columnRenameRules);

    for (const rule of columnRules || []) {
      const source = (rule.sourceColumn || '').trim();
      const target = (rule.targetColumn || '').trim() || source;
      if (!target) {
        continue;
      }

      const aliases = new Set<string>();
      if (source && source !== target) {
        aliases.add(source);
      }

      for (const rename of renameRules) {
        const renameSource = (rename.sourceColumn || '').trim();
        const renameTarget = (rename.targetColumn || '').trim();
        if (!renameSource || !renameTarget) {
          continue;
        }
        if (renameTarget === target) {
          aliases.add(renameSource);
        }
        if (renameSource === target) {
          aliases.add(renameTarget);
        }
        if (renameSource === source) {
          aliases.add(renameTarget);
        }
      }

      if (aliases.size) {
        map.set(target, [...aliases]);
      }
    }

    const aliasTargets = new Set<string>([
      ...map.keys(),
      ...columnRules.map(rule => (rule.targetColumn || rule.sourceColumn || '').trim()).filter(Boolean)
    ]);
    for (const target of aliasTargets) {
      const omAliases = getOrangeMoneyAliasHeadersForColumn(target);
      if (!omAliases.length) {
        continue;
      }
      const existing = new Set(map.get(target) || []);
      for (const alias of omAliases) {
        existing.add(alias);
      }
      map.set(target, [...existing]);
    }

    for (const rename of renameRules) {
      const renameSource = (rename.sourceColumn || '').trim();
      const renameTarget = (rename.targetColumn || '').trim();
      if (!renameSource || !renameTarget || renameSource === renameTarget) {
        continue;
      }
      const existing = new Set(map.get(renameTarget) || []);
      existing.add(renameSource);
      map.set(renameTarget, [...existing]);
    }

    return map;
  }

  private resolveRowColumnValueWithAliases(
    row: Record<string, string>,
    column: string,
    aliases: string[]
  ): string {
    const direct = this.resolveRowColumnValue(row, column);
    if (direct) {
      return direct;
    }

    for (const alias of aliases) {
      const value = this.resolveRowColumnValue(row, alias);
      if (value) {
        return value;
      }
    }

    return '';
  }

  /** Ne conserve que les colonnes attendues dans le fichier final (hors colonnes vides). */
  filterRowsToColumns(
    rows: Record<string, string>[],
    columns: string[]
  ): Record<string, string>[] {
    return this.withBulkKeyResolver(() => this.filterRowsToColumnsImpl(rows, columns));
  }

  private filterRowsToColumnsImpl(
    rows: Record<string, string>[],
    columns: string[]
  ): Record<string, string>[] {
    if (!rows.length || !columns.length) {
      return rows;
    }

    const orderedColumns = this.getNonemptyExportColumns(rows, columns);
    if (!orderedColumns.length) {
      return [];
    }

    return rows.map(row => {
      const filtered: Record<string, string> = {};
      for (const col of orderedColumns) {
        filtered[col] = this.resolveRowColumnValue(row, col);
      }
      return filtered;
    });
  }
}

/** Libellé d'une condition de filtre (ex. « actionDone n'est pas vide »). */
export function describeRowFilterCondition(condition: ModelRowFilterValueCondition): string {
  switch (condition.operator) {
    case 'empty':
      return I18nService.t('APM.rowFilterCondEmptyText', { column: condition.column });
    case 'notEmpty':
      return I18nService.t('APM.rowFilterCondNotEmptyText', { column: condition.column });
    case 'equals':
      return `${condition.column} = ${condition.value ?? ''}`;
    case 'notEquals':
      return `${condition.column} ≠ ${condition.value ?? ''}`;
    default:
      return condition.column;
  }
}
