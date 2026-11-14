import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom, Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import {
  mergeBuiltInEquivalences,
  applyColumnNormalizationPlanAsync,
  ColumnNormalizationPlan,
  ModelColumnEquivalence,
  planColumnNormalization
} from '../utils/model-column-normalization.util';

/**
 * Configuration > Normalisation modèle : en-têtes équivalents des colonnes par défaut.
 * Sert à l'écran de configuration et, au chargement des fichiers (traitement,
 * réconciliation), à renommer les en-têtes équivalents avec les noms par défaut.
 */
@Injectable({ providedIn: 'root' })
export class ModelNormalizationService {

  private readonly apiUrl = '/api/configuration/normalisation';

  /** Toutes les équivalences de l'entreprise, chargées une fois (invalidées à l'enregistrement). */
  private allCache: Promise<ModelColumnEquivalence[]> | null = null;

  constructor(private http: HttpClient) {}

  list(modelId?: string): Observable<ModelColumnEquivalence[]> {
    const url = modelId ? `${this.apiUrl}?modelId=${encodeURIComponent(modelId)}` : this.apiUrl;
    return this.http.get<ModelColumnEquivalence[]>(url);
  }

  /** Remplace les équivalences d'un modèle (les colonnes sans équivalent sont supprimées). */
  replaceForModel(modelId: string, items: ModelColumnEquivalence[]): Observable<ModelColumnEquivalence[]> {
    const body = items.map(i => ({ columnName: i.columnName, equivalents: i.equivalents }));
    return this.http
      .put<ModelColumnEquivalence[]>(`${this.apiUrl}/models/${encodeURIComponent(modelId)}`, body)
      .pipe(tap(() => this.invalidate()));
  }

  invalidate(): void {
    this.allCache = null;
  }

  /**
   * Équivalences des modèles demandés (dans l'ordre des modèles). Ne bloque jamais un
   * traitement : en cas d'erreur réseau ou de droits, renvoie une liste vide.
   */
  async getForModels(modelIds: ReadonlyArray<string | null | undefined>): Promise<ModelColumnEquivalence[]> {
    const ids = modelIds.filter((id): id is string => !!id);
    if (!ids.length) {
      return [];
    }
    if (!this.allCache) {
      this.allCache = firstValueFrom(this.list()).catch(() => {
        this.allCache = null;
        return [];
      });
    }
    const all = await this.allCache;
    const result: ModelColumnEquivalence[] = [];
    const seen = new Set<string>();
    for (const id of ids) {
      for (const eq of all.filter(e => e.modelId === id)) {
        if (!seen.has(eq.columnName)) {
          seen.add(eq.columnName);
          result.push(eq);
        }
      }
    }
    return result;
  }

  /**
   * Contrôle les colonnes d'un fichier chargé : si une colonne par défaut des modèles est
   * absente, l'en-tête équivalent configuré est renommé avec le nom par défaut (jamais copié).
   * `templateColumns` : colonnes du vrai fichier modèle ; un équivalent qui en fait partie est
   * une erreur de configuration, ignorée et signalée (sinon la colonne disparaîtrait).
   */
  async normalizeRows(
    rows: Record<string, string>[],
    modelIds: ReadonlyArray<string | null | undefined>,
    yieldFn?: () => Promise<void> | void,
    templateColumns: readonly string[] = [],
    builtIn?: { equivalences: readonly ModelColumnEquivalence[]; modelColumns: readonly string[] }
  ): Promise<{ rows: Record<string, string>[]; plan: ColumnNormalizationPlan }> {
    const empty: ColumnNormalizationPlan = { renames: [], missing: [], ignored: [] };
    if (!rows?.length) {
      return { rows, plan: empty };
    }
    let equivalences = await this.getForModels(modelIds);
    if (builtIn?.equivalences?.length) {
      equivalences = mergeBuiltInEquivalences(equivalences, builtIn.equivalences, builtIn.modelColumns);
    }
    if (!equivalences.length) {
      return { rows, plan: empty };
    }
    const plan = planColumnNormalization(Object.keys(rows[0]), equivalences, templateColumns);
    const normalized = await applyColumnNormalizationPlanAsync(rows, plan, { yieldFn });
    return { rows: normalized, plan };
  }
}
