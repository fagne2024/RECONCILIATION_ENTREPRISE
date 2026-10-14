/// <reference lib="webworker" />

import {
  applyColumnProcessingPlanToRow,
  compileColumnProcessingPlan,
  resolveColumnRulesBatchSize
} from '../utils/column-processing.util';
import { ColumnProcessingRule } from '../models/column-processing-rule.model';

interface ColumnRulesWorkerRequest {
  data: Record<string, string>[];
  rules: ColumnProcessingRule[];
}

type ColumnRulesWorkerResponse =
  | { type: 'progress'; done: number; total: number }
  | { type: 'complete'; data: Record<string, string>[] }
  | { type: 'error'; message: string };

addEventListener('message', (event: MessageEvent<ColumnRulesWorkerRequest>) => {
  try {
    const { data, rules } = event.data;
    if (!data?.length || !rules?.length) {
      const response: ColumnRulesWorkerResponse = { type: 'complete', data: data ?? [] };
      postMessage(response);
      return;
    }

    const plan = compileColumnProcessingPlan(data, rules);
    if (!plan.length) {
      const response: ColumnRulesWorkerResponse = { type: 'complete', data };
      postMessage(response);
      return;
    }

    const batchSize = resolveColumnRulesBatchSize(data.length);
    for (let start = 0; start < data.length; start += batchSize) {
      const end = Math.min(start + batchSize, data.length);
      for (let i = start; i < end; i++) {
        applyColumnProcessingPlanToRow(data[i], plan);
      }
      const progress: ColumnRulesWorkerResponse = { type: 'progress', done: end, total: data.length };
      postMessage(progress);
    }

    const complete: ColumnRulesWorkerResponse = { type: 'complete', data };
    postMessage(complete);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erreur inconnue dans le worker des règles';
    const response: ColumnRulesWorkerResponse = { type: 'error', message };
    postMessage(response);
  }
});
