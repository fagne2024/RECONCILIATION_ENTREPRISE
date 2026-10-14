import { ColumnProcessingRule } from '../models/column-processing-rule.model';
import { getOrangeMoneyAliasHeadersForColumn } from './bilingual-column.util';
import { resolveColumnKeyInRow } from './row-column.util';
import {
  preserveLeadingZeroString,
  isLeadingZeroNumericString,
  isMsisdnPreserveColumn,
  isTransactionIdPreserveColumn,
  finalizeTextPreserveColumnValue,
  DEFAULT_MSISDN_DIGIT_LENGTH
} from './text-cell.util';

/** Seuil : en dessous, traitement synchrone sans yield (petits fichiers). */
export const COLUMN_RULES_SYNC_THRESHOLD = 8000;

/** Taille de lot adaptée au volume pour garder l'UI réactive. */
export function resolveColumnRulesBatchSize(totalRows: number): number {
  if (totalRows > 100000) {
    return 350;
  }
  if (totalRows > 50000) {
    return 500;
  }
  if (totalRows > 20000) {
    return 800;
  }
  if (totalRows > 8000) {
    return 1200;
  }
  return totalRows;
}

interface CompiledColumnRule {
  sourceKey: string;
  targetKey: string | null;
  apply: (value: unknown) => string;
}

interface ColumnKeyIndex {
  normalized: Map<string, string>;
  keys: string[];
}

function buildColumnKeyIndex(row: Record<string, string>): ColumnKeyIndex {
  const normalized = new Map<string, string>();
  const keys = Object.keys(row);
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    const norm = normalizeColumnName(key);
    if (!normalized.has(norm)) {
      normalized.set(norm, key);
    }
  }
  return { normalized, keys };
}

function findColumnKey(data: Record<string, unknown>, sourceColumn: string, index?: ColumnKeyIndex): string | null {
  if (data[sourceColumn] !== undefined) {
    return sourceColumn;
  }

  const resolved = resolveColumnKeyInRow(data as Record<string, string>, sourceColumn);
  if (resolved) {
    return resolved;
  }

  for (const alias of getOrangeMoneyAliasHeadersForColumn(sourceColumn)) {
    if (data[alias] !== undefined) {
      return alias;
    }
    const aliasKey = resolveColumnKeyInRow(data as Record<string, string>, alias);
    if (aliasKey) {
      return aliasKey;
    }
  }

  const normalizedSource = normalizeColumnName(sourceColumn);
  if (index) {
    const fromIndex = index.normalized.get(normalizedSource);
    if (fromIndex) {
      return fromIndex;
    }
    for (let i = 0; i < index.keys.length; i++) {
      const key = index.keys[i];
      if (key.includes(normalizedSource) || normalizedSource.includes(normalizeColumnName(key))) {
        return key;
      }
    }
    return null;
  }

  for (const key of Object.keys(data)) {
    if (normalizeColumnName(key) === normalizedSource) {
      return key;
    }
  }

  for (const key of Object.keys(data)) {
    if (key.includes(normalizedSource) || normalizedSource.includes(normalizeColumnName(key))) {
      return key;
    }
  }

  return null;
}

function normalizeColumnName(columnName: string): string {
  if (!columnName) {
    return '';
  }
  let normalized = columnName
    .replace(/Num\?\?ro/g, 'Numéro')
    .replace(/\?\?/g, 'é')
    .replace(/\?/g, '');
  normalized = normalized.normalize('NFD').replace(/\p{M}/gu, '');
  return normalized.trim().toLowerCase().replace(/\s+/g, ' ');
}

function applyFormatType(value: string, formatType?: string): string {
  if (!formatType) {
    return value;
  }
  switch (formatType.toLowerCase()) {
    case 'numeric':
      return value.replace(/[^0-9.-]/g, '');
    case 'boolean':
      return value.toLowerCase() === 'true' ? 'true' : 'false';
    default:
      return value;
  }
}

function ruleHasTransformations(rule: ColumnProcessingRule): boolean {
  return !!(
    rule.formatType
    || rule.trimSpaces
    || rule.toUpperCase
    || rule.toLowerCase
    || rule.removeAccents
    || rule.removeSpecialChars
    || rule.padZeros
    || rule.stringToRemove?.trim()
    || rule.regexReplace?.trim()
    || (rule.specialCharReplacementMap && Object.keys(rule.specialCharReplacementMap).length)
  );
}

function createRuleApplier(rule: ColumnProcessingRule): (value: unknown) => string {
  const outColumn = rule.targetColumn?.trim() || rule.sourceColumn;
  const preserveTransactionId = isTransactionIdPreserveColumn(outColumn)
    || isTransactionIdPreserveColumn(rule.sourceColumn);
  const trimSpaces = !!rule.trimSpaces;
  const toUpperCase = !!rule.toUpperCase;
  const toLowerCase = !!rule.toLowerCase;
  const removeAccents = !!rule.removeAccents;
  const removeSpecialChars = !!rule.removeSpecialChars;
  const padZeros = !!rule.padZeros;
  const padLen = rule.padZeroLength
    ?? (isMsisdnPreserveColumn(outColumn) ? DEFAULT_MSISDN_DIGIT_LENGTH : 8);
  const formatType = rule.formatType;
  const msisdnOut = isMsisdnPreserveColumn(outColumn);
  const hasTransformations = ruleHasTransformations(rule);

  const stringToRemoveRe = rule.stringToRemove?.trim()
    ? new RegExp(rule.stringToRemove.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')
    : null;

  let regexReplaceRe: RegExp | null = null;
  let regexReplaceValue = '';
  if (rule.regexReplace?.includes('|')) {
    const [pattern, replacement] = rule.regexReplace.split('|', 2);
    try {
      regexReplaceRe = new RegExp(pattern, 'g');
      regexReplaceValue = replacement;
    } catch {
      regexReplaceRe = null;
    }
  }

  const replacementEntries = rule.specialCharReplacementMap
    ? Object.entries(rule.specialCharReplacementMap)
    : [];

  return (value: unknown): string => {
    if (value === null || value === undefined) {
      return '';
    }

    if (!hasTransformations) {
      return preserveLeadingZeroString(value);
    }

    let stringValue = preserveLeadingZeroString(value);

    if (preserveTransactionId) {
      if (trimSpaces) {
        stringValue = stringValue.trim();
      }
      if (toUpperCase) {
        stringValue = stringValue.toUpperCase();
      }
      if (toLowerCase) {
        stringValue = stringValue.toLowerCase();
      }
      if (stringToRemoveRe) {
        stringValue = stringValue.replace(stringToRemoveRe, '');
      }
      return stringValue;
    }

    stringValue = applyFormatType(stringValue, formatType);

    if (removeAccents) {
      stringValue = stringValue.normalize('NFD').replace(/\p{M}/gu, '');
    }

    if (stringToRemoveRe) {
      stringValue = stringValue.replace(stringToRemoveRe, '');
    }

    for (let i = 0; i < replacementEntries.length; i++) {
      const [from, to] = replacementEntries[i];
      stringValue = stringValue.split(from).join(to);
    }

    if (removeSpecialChars) {
      stringValue = stringValue.replace(/[^a-zA-Z0-9\s]/g, '');
    }

    if (toUpperCase) {
      stringValue = stringValue.toUpperCase();
    }
    if (toLowerCase) {
      stringValue = stringValue.toLowerCase();
    }
    if (padZeros && /^\d+$/.test(stringValue)) {
      stringValue = stringValue.padStart(padLen, '0');
    }

    if (regexReplaceRe) {
      stringValue = stringValue.replace(regexReplaceRe, regexReplaceValue);
    }

    if (trimSpaces) {
      stringValue = stringValue.trim();
    }

    if (isLeadingZeroNumericString(stringValue)) {
      return preserveLeadingZeroString(stringValue);
    }

    if (msisdnOut && /^\d+$/.test(stringValue)) {
      return finalizeTextPreserveColumnValue(outColumn, stringValue);
    }

    return stringValue;
  };
}

function findSampleRow(data: Record<string, string>[]): Record<string, string> {
  const limit = Math.min(data.length, 20);
  for (let i = 0; i < limit; i++) {
    if (Object.keys(data[i]).length > 0) {
      return data[i];
    }
  }
  return data[0] || {};
}

export function compileColumnProcessingPlan(
  data: Record<string, string>[],
  rules: ColumnProcessingRule[]
): CompiledColumnRule[] {
  if (!data.length || !rules.length) {
    return [];
  }

  const sampleRow = findSampleRow(data);
  const keyIndex = buildColumnKeyIndex(sampleRow);
  const sortedRules = [...rules].sort((a, b) => (a.ruleOrder ?? 0) - (b.ruleOrder ?? 0));
  const plan: CompiledColumnRule[] = [];

  for (let i = 0; i < sortedRules.length; i++) {
    const rule = sortedRules[i];
    const sourceKey = findColumnKey(sampleRow, rule.sourceColumn, keyIndex);
    if (!sourceKey) {
      continue;
    }
    const targetColumn = rule.targetColumn?.trim();
    plan.push({
      sourceKey,
      targetKey: targetColumn && targetColumn !== sourceKey ? targetColumn : null,
      apply: createRuleApplier(rule)
    });
  }

  return plan;
}

export function applyColumnProcessingPlanToRow(
  row: Record<string, string>,
  plan: CompiledColumnRule[]
): Record<string, string> {
  for (let r = 0; r < plan.length; r++) {
    const { sourceKey, targetKey, apply } = plan[r];
    const processedValue = apply(row[sourceKey]);
    if (targetKey) {
      row[targetKey] = processedValue;
    } else {
      row[sourceKey] = processedValue;
    }
  }
  return row;
}

/** Traitement synchrone optimisé (plan précompilé, sans yield). */
export function applyColumnProcessingRulesSync(
  data: Record<string, string>[],
  rules: ColumnProcessingRule[]
): Record<string, string>[] {
  if (!data.length || !rules.length) {
    return data;
  }

  const plan = compileColumnProcessingPlan(data, rules);
  if (!plan.length) {
    return data;
  }

  for (let i = 0; i < data.length; i++) {
    applyColumnProcessingPlanToRow(data[i], plan);
  }

  return data;
}

export function applyColumnProcessingRulesToRow(
  row: Record<string, string>,
  rules: ColumnProcessingRule[]
): Record<string, string> {
  const plan = compileColumnProcessingPlan([row], rules);
  if (!plan.length) {
    return row;
  }
  return applyColumnProcessingPlanToRow(row, plan);
}

export async function applyColumnProcessingRulesAsync(
  data: Record<string, string>[],
  rules: ColumnProcessingRule[],
  batchSize?: number,
  onProgress?: (processed: number, total: number) => void | Promise<void>,
  yieldFn?: () => Promise<void>
): Promise<Record<string, string>[]> {
  if (!data.length || !rules.length) {
    return data;
  }

  if (data.length <= COLUMN_RULES_SYNC_THRESHOLD) {
    applyColumnProcessingRulesSync(data, rules);
    await onProgress?.(data.length, data.length);
    return data;
  }

  const plan = compileColumnProcessingPlan(data, rules);
  if (!plan.length) {
    return data;
  }

  const effectiveBatch = batchSize ?? resolveColumnRulesBatchSize(data.length);

  for (let start = 0; start < data.length; start += effectiveBatch) {
    const end = Math.min(start + effectiveBatch, data.length);
    for (let i = start; i < end; i++) {
      applyColumnProcessingPlanToRow(data[i], plan);
    }
    await onProgress?.(end, data.length);
    if (end < data.length) {
      await yieldFn?.();
    }
  }

  return data;
}
