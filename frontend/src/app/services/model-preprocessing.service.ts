import { Injectable } from '@angular/core';
import {
  AutoProcessingModel,
  ColumnProcessingRule,
  DEFAULT_PRE_PROCESSING_SECTION_ORDER,
  ENV_COLUMN_NAME,
  ModelFormatAction,
  ModelPreProcessingConfig,
  ModelPreProcessingSectionId,
  ModelRowFilter,
  ModelColumnValueMapping,
  ModelColumnConcatRule,
  ModelColumnMathRule,
  ModelColumnRenameRule,
  matchesConditionValues,
  parseConditionValues
} from './auto-processing.service';
import { buildConcatenatedValue } from '../utils/concat.util';
import {
  BO_RECONCILIATION_KEY_ALIASES,
  PARTNER_REFERENCE_KEY_ALIASES
} from '../utils/reconciliation-key.util';
import { getOrangeMoneyAliasHeadersForColumn, dedupeBilingualColumnNames } from '../utils/bilingual-column.util';
import { parseAmountValue } from '../utils/record-amount.util';
import {
  normalizeColumnKey,
  renameKeyPreservingOrder,
  resolveColumnKeyInRow,
  resolveCanonicalColumnKeysInRow
} from '../utils/row-column.util';
import { fixCellEncoding, fixCellEncodingIfNeeded } from '../utils/encoding-fixer';
import {
  finalizeTextPreserveColumnValue,
  preserveLeadingZeroString,
  normalizeLeadingZeroCellsInRows,
  keepCharactersFromString,
  finalizeRemoveCharactersCell,
  isMsisdnPreserveColumn
} from '../utils/text-cell.util';

/** Aligné sur COLUMN_RULES_SYNC_THRESHOLD : pas de micro-lots ni yield en dessous. */
const PREPROCESS_INLINE_THRESHOLD = 20000;

interface PrecomputedFormatTarget {
  keys: readonly string[];
  action: ModelFormatAction;
  conditionColumnKey: string | null;
  expectedValues: ReadonlySet<string> | null;
}

interface ResolvedColumnRenameRule {
  sourceKey: string;
  targetKey: string;
}

@Injectable({
  providedIn: 'root'
})
export class ModelPreProcessingService {

  async applyPreProcessingAsync(
    rows: Record<string, string>[],
    config?: ModelPreProcessingConfig | null,
    options?: {
      batchSize?: number;
      onProgress?: (message: string, done: number, total: number) => void | Promise<void>;
      yieldFn?: () => Promise<void>;
    }
  ): Promise<Record<string, string>[]> {
    if (!config || !rows?.length) {
      return rows;
    }

    const batchSize = options?.batchSize ?? (rows.length > 100000 ? 10000 : 5000);
    let result = rows;
    const sectionOrder = this.resolveSectionOrder(config.sectionOrder);

    for (const sectionId of sectionOrder) {
      switch (sectionId) {
        case 'rowFilters':
          if (config.rowFilters?.length) {
            await options?.onProgress?.('Filtres du modèle...', 0, result.length);
            await options?.yieldFn?.();
            result = await this.applyRowFiltersAsync(result, config.rowFilters, batchSize, options);
            if (!result.length) {
              return result;
            }
          }
          break;
        case 'formatActions':
          if (config.formatActions?.length) {
            result = await this.applyFormatActionsAsync(result, config.formatActions, batchSize, options);
          }
          break;
        case 'columnConcatRules':
          if (config.columnConcatRules?.length) {
            result = await this.mapRowsBatched(
              result,
              batchSize,
              row => this.applyColumnConcatRulesToRow(row, config.columnConcatRules!),
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
              row => this.applyColumnMathRulesToRow(row, config.columnMathRules!),
              'Calcul de colonnes...',
              options
            );
          }
          break;
        case 'valueMappings':
          if (config.valueMappings?.length) {
            result = await this.mapRowsBatched(
              result,
              batchSize,
              row => this.applyValueMappingsToRow(row, config.valueMappings!),
              'Renommage des valeurs...',
              options
            );
          }
          break;
        case 'columnRenameRules':
          if (config.columnRenameRules?.length) {
            result = await this.applyColumnRenameRulesAsync(
              result,
              config.columnRenameRules,
              batchSize,
              options
            );
          }
          break;
      }
    }

    result = this.applyEnvColumnToRows(result, config);

    return normalizeLeadingZeroCellsInRows(result);
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
    }
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
      this.applyFormatPlanToRows(rows, plan, 0, rows.length);
      return rows;
    }

    const macroBatch = rows.length > 50000 ? batchSize : Math.min(batchSize, 2000);
    const progressMessage = 'Formatage du modèle...';

    for (let start = 0; start < rows.length; start += macroBatch) {
      const macroEnd = Math.min(start + macroBatch, rows.length);
      this.applyFormatPlanToRows(rows, plan, start, macroEnd);
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
    end: number
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

        const formattedValue = this.applyFormatActionToValue(
          this.coerceFormatCellValueFast(rawValue),
          target.action,
          primaryKey
        );

        for (const key of target.keys) {
          row[key] = this.finalizeFormatColumnValue(key, target.action, formattedValue);
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
          columnKeys[0]
        );
        const storedValue = this.finalizeFormatColumnValue(columnKeys[0], merged, formattedValue);

        for (const aliasKey of columnKeys) {
          row[aliasKey] = this.finalizeFormatColumnValue(aliasKey, merged, storedValue);
        }
      }
    }

    return row;
  }

  private applyColumnConcatRulesToRow(
    row: Record<string, string>,
    rules: ModelColumnConcatRule[]
  ): Record<string, string> {
    const activeRules = this.getActiveColumnConcatRules(rules);
    if (!activeRules.length) {
      return row;
    }

    const newRow = row;
    for (const rule of activeRules) {
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
    }
    return newRow;
  }

  private applyColumnMathRulesToRow(
    row: Record<string, string>,
    rules: ModelColumnMathRule[]
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
      const result = rule.operation === 'subtract' ? valueA - valueB : valueA + valueB;
      row[rule.targetColumn] = this.formatMathResult(result, rawA, rawB);
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
    mappings: ModelColumnValueMapping[]
  ): Record<string, string> {
    const activeMappings = this.getActiveValueMappings(mappings);
    if (!activeMappings.length) {
      return row;
    }

    for (const mapping of activeMappings) {
      const key = resolveColumnKeyInRow(row, mapping.column);
      if (!key || row[key] === undefined || row[key] === null) {
        continue;
      }
      const currentValue = String(row[key]);
      if (currentValue !== mapping.fromValue) {
        continue;
      }
      if (!this.valueMappingConditionMatches(row, mapping)) {
        continue;
      }
      row[key] = mapping.toValue;
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
      resolved.push({ sourceKey, targetKey });
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
    }
  ): Promise<Record<string, string>[]> {
    if (!rows.length) {
      return rows;
    }

    const resolvedRules = this.resolveColumnRenameRules(rows[0], rules);
    if (!resolvedRules.length) {
      return rows;
    }

    const message = 'Renommage des en-têtes...';
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
            result = this.applyValueMappings(result, config.valueMappings);
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

    return normalizeLeadingZeroCellsInRows(result);
  }

  applyRowFilters(
    rows: Record<string, string>[],
    filters: ModelRowFilter[]
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

      filtered = filtered.filter(row => {
        if (!row) {
          return false;
        }
        const key = resolveColumnKeyInRow(row, filter.column);
        if (!key) {
          return false;
        }
        return filter.selectedValues.includes(String(row[key] ?? ''));
      });
    }

    return filtered;
  }

  private async applyRowFiltersAsync(
    rows: Record<string, string>[],
    filters: ModelRowFilter[],
    batchSize: number,
    options?: {
      onProgress?: (message: string, done: number, total: number) => void | Promise<void>;
      yieldFn?: () => Promise<void>;
    }
  ): Promise<Record<string, string>[]> {
    if (!filters.length || !rows.length) {
      return rows;
    }

    const inlineLimit = options?.yieldFn ? 8000 : PREPROCESS_INLINE_THRESHOLD;
    if (rows.length <= inlineLimit) {
      return this.applyRowFilters(rows, filters);
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
          const key = resolveColumnKeyInRow(row, filter.column);
          if (key && filter.selectedValues.includes(String(row[key] ?? ''))) {
            next.push(row);
          }
        }
        await options?.onProgress?.('Filtres du modèle...', end, filtered.length);
        await options?.yieldFn?.();
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
    mappings: ModelColumnValueMapping[]
  ): Record<string, string>[] {
    const activeMappings = this.getActiveValueMappings(mappings);
    if (!activeMappings.length) {
      return rows;
    }

    return rows.map(row => this.applyValueMappingsToRow(row, mappings));
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
    sampleRow: Record<string, string>
  ): string[] {
    if (!sampleRow || !Object.keys(sampleRow).length) {
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
      addCandidates([...PARTNER_REFERENCE_KEY_ALIASES, ...BO_RECONCILIATION_KEY_ALIASES]);
    }

    return resolved;
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
    model?: AutoProcessingModel
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
      dedupColumns = this.resolveReconciliationDedupColumnKeys(model, sampleRow);
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
    rows: Record<string, string>[]
  ): {
    uniqueRows: Record<string, string>[];
    duplicatesRemoved: number;
    dedupColumns: string[];
  } {
    if (!rows.length) {
      return { uniqueRows: [], duplicatesRemoved: 0, dedupColumns: [] };
    }

    const sampleRow = rows.find(r => Object.keys(r).length > 0) || rows[0];
    const dedupColumns = this.resolveReconciliationDedupColumnKeys(model, sampleRow);

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
      const key = dedupColumns
        .map(col => String(row[col] ?? '').trim().toLowerCase())
        .join('\u0001');
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
      return asString.trim();
    }

    return fixCellEncodingIfNeeded(asString).trim();
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
    return fixCellEncodingIfNeeded(String(value)).trim();
  }

  private applyFormatActionToValue(
    value: string,
    action: ModelFormatAction,
    columnName?: string
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
      default:
        result = value;
    }

    if (columnName && action.type === 'removeCharacters') {
      return finalizeRemoveCharactersCell(columnName, result, {
        removeCharMode: action.removeCharMode ?? 'remove',
        removeCharCount: action.removeCharCount,
        leadingZeroMode: action.leadingZeroMode
      });
    }

    return result;
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

  private applyRemoveSpecialString(value: string, action: ModelFormatAction): string {
    const target = action.specialStringToRemove ?? '';
    if (!target) {
      return value;
    }

    switch (action.specialStringRemovalMode ?? 'all') {
      case 'start':
        return value.startsWith(target) ? value.substring(target.length) : value;
      case 'end':
        return value.endsWith(target) ? value.substring(0, value.length - target.length) : value;
      case 'all':
      default:
        return value.split(target).join('');
    }
  }

  private applyRemoveCharacters(value: string, action: ModelFormatAction): string {
    const mode = action.removeCharMode ?? 'remove';
    const position = action.removeCharPosition ?? 'start';
    const count = Math.max(1, Number(action.removeCharCount) || 1);
    const specificPosition = Math.max(1, Number(action.removeCharSpecificPosition) || 1);
    const text = preserveLeadingZeroString(value);

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
      || this.isEnvColumnEnabled(config);
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

    for (const rule of this.getActiveColumnRenameRules(config?.columnRenameRules)) {
      if (rule.sourceColumn) {
        columns.add(rule.sourceColumn);
      }
    }

    return Array.from(columns);
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
        && mapping.fromValue !== undefined
        && mapping.fromValue !== null
        && String(mapping.fromValue).length > 0
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
    const base = [...DEFAULT_PRE_PROCESSING_SECTION_ORDER];
    if (!order?.length) {
      return base;
    }

    const resolved: ModelPreProcessingSectionId[] = [];
    for (const sectionId of order) {
      if (base.includes(sectionId) && !resolved.includes(sectionId)) {
        resolved.push(sectionId);
      }
    }
    for (const sectionId of base) {
      if (!resolved.includes(sectionId)) {
        resolved.push(sectionId);
      }
    }
    return resolved;
  }

  getActiveColumnRenameRules(rules?: ModelColumnRenameRule[] | null): ModelColumnRenameRule[] {
    return (rules ?? []).filter(
      rule => rule.enabled
        && !!rule.sourceColumn
        && !!rule.targetColumn?.trim()
        && rule.sourceColumn !== rule.targetColumn.trim()
    );
  }

  getPreProcessingSummary(config?: ModelPreProcessingConfig | null): {
    activeFilterCount: number;
    activeFormatCount: number;
    activeConcatCount: number;
    activeMathCount: number;
    activeValueMappingCount: number;
    activeColumnRenameCount: number;
    summaryText: string;
    detailText: string;
  } {
    const filters = this.getActiveFilters(config);
    const formats = this.getActiveFormatActions(config);
    const concatRules = this.getActiveColumnConcatRules(config?.columnConcatRules);
    const mathRules = this.getActiveColumnMathRules(config?.columnMathRules);
    const valueMappings = this.getActiveValueMappings(config?.valueMappings);
    const columnRenameRules = this.getActiveColumnRenameRules(config?.columnRenameRules);
    const parts: string[] = [];

    if (filters.length) {
      parts.push(`${filters.length} filtre(s) de lignes`);
    }
    if (formats.length) {
      parts.push(`${formats.length} action(s) de formatage`);
    }
    if (concatRules.length) {
      parts.push(`${concatRules.length} concaténation(s) de colonnes`);
    }
    if (mathRules.length) {
      parts.push(`${mathRules.length} calcul(s) de colonnes`);
    }
    if (valueMappings.length) {
      parts.push(`${valueMappings.length} renommage(s) de valeurs`);
    }
    if (columnRenameRules.length) {
      parts.push(`${columnRenameRules.length} renommage(s) d'en-têtes`);
    }
    if (this.isEnvColumnEnabled(config)) {
      parts.push(`colonne ${ENV_COLUMN_NAME}`);
    }
    if (this.isExportColumnFilterEnabled(config)) {
      const kept = config?.exportColumnFilter?.keptColumns?.length ?? 0;
      parts.push(kept > 0
        ? `export : ${kept} colonne(s) conservée(s)`
        : 'filtrage colonnes export');
    }

    const detailLines: string[] = [];
    filters.forEach(filter => {
      detailLines.push(`• Filtre : ${filter.column} → ${filter.selectedValues.join(', ')}`);
    });
    formats.forEach(action => {
      detailLines.push(`• Format : ${this.describeFormatAction(action)}`);
    });
    concatRules.forEach(rule => {
      const separatorLabel = rule.separator === ' '
        ? 'espace'
        : `« ${rule.separator} »`;
      detailLines.push(
        `• Concaténation : ${rule.sourceColumns.join(' + ')} → ${rule.targetColumn} (séparateur ${separatorLabel})`
      );
    });
    mathRules.forEach(rule => {
      const operator = rule.operation === 'subtract' ? '−' : '+';
      detailLines.push(
        `• Calcul : ${rule.sourceColumnA} ${operator} ${rule.sourceColumnB} → ${rule.targetColumn}`
      );
    });
    valueMappings.forEach(mapping => {
      const conditionColumn = (mapping.conditionColumn ?? '').trim();
      const conditionValue = (mapping.conditionValue ?? '').trim();
      const conditionSuffix = conditionColumn && conditionValue
        ? ` [si ${conditionColumn} = « ${conditionValue} »]`
        : '';
      detailLines.push(
        `• Renommage : ${mapping.column} — « ${mapping.fromValue} » → « ${mapping.toValue} »${conditionSuffix}`
      );
    });
    columnRenameRules.forEach(rule => {
      detailLines.push(`• En-tête : ${rule.sourceColumn} → ${rule.targetColumn}`);
    });
    const envValue = this.getActiveEnvColumnValue(config);
    if (envValue) {
      detailLines.push(`• ${ENV_COLUMN_NAME} : ${envValue}`);
    }
    if (this.isExportColumnFilterEnabled(config)) {
      const kept = config?.exportColumnFilter?.keptColumns || [];
      detailLines.push(
        kept.length
          ? `• Export : ${kept.length} colonne(s) — ${kept.join(', ')}`
          : `• Export : toutes les colonnes du catalogue`
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

  buildApplicationResult(
    rowsBefore: number,
    rowsAfter: number,
    config?: ModelPreProcessingConfig | null
  ): string {
    const summary = this.getPreProcessingSummary(config);
    if (!summary.summaryText) {
      return '';
    }

    const removed = rowsBefore - rowsAfter;
    const filterInfo = removed > 0
      ? `${removed} ligne(s) exclue(s) par les filtres`
      : 'aucune ligne exclue par les filtres';

    return `${summary.summaryText} appliqués (${filterInfo}).\n${summary.detailText}`;
  }

  private describeFormatAction(action: ModelFormatAction): string {
    const columns = action.columns.join(', ');
    const conditionSuffix = this.describeFormatActionCondition(action);

    switch (action.type) {
      case 'removeSpecialStrings':
        return `${columns} — supprimer « ${action.specialStringToRemove ?? ''} » (${action.specialStringRemovalMode ?? 'all'})${conditionSuffix}`;
      case 'removeCharacters': {
        const mode = action.removeCharMode === 'keep' ? 'conserver' : 'supprimer';
        const position = action.removeCharPosition === 'end'
          ? 'fin'
          : action.removeCharPosition === 'specific'
            ? `position ${action.removeCharSpecificPosition ?? 1}`
            : 'début';
        const leadingZeroSuffix = action.leadingZeroMode === 'keep'
          ? ', zéro initial conservé'
          : action.leadingZeroMode === 'strip'
            ? ', zéro initial supprimé'
            : '';
        return `${columns} — ${mode} ${action.removeCharCount ?? 1} caractère(s) depuis la ${position}${leadingZeroSuffix}${conditionSuffix}`;
      }
      case 'removeNumbers':
        return `${columns} — supprimer les chiffres${conditionSuffix}`;
      case 'removeIndicatif':
        return `${columns} — supprimer indicatif (${action.indicatifType ?? 'international'})${conditionSuffix}`;
      case 'removeDecimals':
        return `${columns} — supprimer décimales (séparateur ${action.decimalSeparator ?? ','})${conditionSuffix}`;
      case 'keepLastDigits':
        return `${columns} — garder ${action.keepLastDigitsCount ?? 3} derniers chiffres${conditionSuffix}`;
      case 'removeZeroDecimals':
        return `${columns} — supprimer .0 en fin de valeur${conditionSuffix}`;
      case 'removeSpaces':
        return `${columns} — supprimer espaces (${action.removeSpacesType ?? 'all'})${conditionSuffix}`;
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
      ? ` [si ${action.conditionColumn} ∈ { ${values} }]`
      : ` [si ${action.conditionColumn} = « ${values} »]`;
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

    if (this.isEnvColumnEnabled(cfg)) {
      if (!outputColumns.includes(ENV_COLUMN_NAME)) {
        outputColumns.push(ENV_COLUMN_NAME);
      }
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

    if (key.includes('oppart')) {
      return [
        'ID Opération', 'Type Opération', 'Montant', 'Solde avant', 'Solde après',
        'Code propriétaire', 'Téléphone', 'Statut', 'ID Transaction', 'Num bordereau',
        'Date opération', 'Date de versement', 'Banque appro', 'Login demandeur Appro',
        'Login valideur Appro', 'Motif rejet', 'Frais connexion', 'Numéro Trans GU',
        'Agent', 'Motif régularisation', 'groupe de réseau'
      ];
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

    if (this.isEnvColumnEnabled(cfg)) {
      add(ENV_COLUMN_NAME);
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
    const key = resolveColumnKeyInRow(row, column);
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

  /** Projette les lignes vers les colonnes finales du modèle (avec repli sur colonnes sources). */
  projectRowsToExportColumns(
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
