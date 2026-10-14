import { Injectable } from '@angular/core';
import { ColumnProcessingRule } from '../models/column-processing-rule.model';
import {
  applyColumnProcessingRulesAsync,
  resolveColumnRulesBatchSize
} from '../utils/column-processing.util';

/** Au-delà de ce seuil, les règles s'exécutent dans un Web Worker pour ne pas bloquer l'UI. */
const WORKER_THRESHOLD = 15000;

@Injectable({ providedIn: 'root' })
export class ColumnRulesProcessorService {

  async applyRulesAsync(
    data: Record<string, string>[],
    rules: ColumnProcessingRule[],
    onProgress?: (done: number, total: number) => void | Promise<void>,
    yieldFn?: () => Promise<void>
  ): Promise<Record<string, string>[]> {
    if (!data?.length || !rules?.length) {
      return data;
    }

    if (typeof Worker !== 'undefined' && data.length >= WORKER_THRESHOLD) {
      try {
        return await this.applyWithWorker(data, rules, onProgress);
      } catch {
        // Repli thread principal si le worker échoue (build, navigateur, etc.)
      }
    }

    return applyColumnProcessingRulesAsync(
      data,
      rules,
      resolveColumnRulesBatchSize(data.length),
      onProgress,
      yieldFn
    );
  }

  private applyWithWorker(
    data: Record<string, string>[],
    rules: ColumnProcessingRule[],
    onProgress?: (done: number, total: number) => void | Promise<void>
  ): Promise<Record<string, string>[]> {
    return new Promise((resolve, reject) => {
      const worker = new Worker(new URL('../workers/column-rules.worker', import.meta.url));
      let settled = false;

      const finish = (handler: () => void) => {
        if (settled) {
          return;
        }
        settled = true;
        worker.terminate();
        handler();
      };

      worker.onmessage = async (event: MessageEvent) => {
        const payload = event.data;
        if (payload?.type === 'progress') {
          await onProgress?.(payload.done, payload.total);
          return;
        }
        if (payload?.type === 'complete') {
          finish(() => resolve(payload.data ?? data));
          return;
        }
        if (payload?.type === 'error') {
          finish(() => reject(new Error(payload.message || 'Erreur worker règles')));
        }
      };

      worker.onerror = (error) => {
        finish(() => reject(error));
      };

      worker.postMessage({ data, rules });
    });
  }
}
