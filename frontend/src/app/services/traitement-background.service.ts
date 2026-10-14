import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { ExportOptimizationService } from './export-optimization.service';

export interface TraitementBackgroundJobResult {
  outputName: string;
  lineCount: number;
  duplicatesRemoved: number;
  exportRows: Record<string, string>[];
  exportColumns: string[];
}

export type TraitementBackgroundJobStatus = 'running' | 'done' | 'error';

export interface TraitementBackgroundJob {
  id: string;
  status: TraitementBackgroundJobStatus;
  modelName: string;
  fileNames: string[];
  startedAt: number;
  progressMessage: string;
  finishedAt?: number;
  error?: string;
  results: TraitementBackgroundJobResult[];
}

/**
 * Stocke l'état du « traitement automatique de fichiers » hors du composant,
 * afin qu'il continue en arrière-plan quand l'utilisateur quitte la page
 * (navigation intra-SPA). Le pipeline s'exécute toujours côté navigateur,
 * mais sa progression et son résultat sont publiés ici — le composant est
 * rendu indépendant de son cycle de vie et un bandeau global peut relancer
 * le téléchargement du/des fichier(s) produit(s) depuis n'importe quelle route.
 */
@Injectable({
  providedIn: 'root'
})
export class TraitementBackgroundService {
  private _job$ = new BehaviorSubject<TraitementBackgroundJob | null>(null);
  private _isDownloading = new BehaviorSubject<boolean>(false);

  readonly job$ = this._job$.asObservable();
  readonly isDownloading$ = this._isDownloading.asObservable();

  constructor(private exportOptimizationService: ExportOptimizationService) {}

  get currentJob(): TraitementBackgroundJob | null {
    return this._job$.getValue();
  }

  get isDownloading(): boolean {
    return this._isDownloading.getValue();
  }

  /** Démarre (ou réutilise) le job de fond pour un traitement de fichiers. */
  beginTraitement(modelName: string, fileNames: string[]): string {
    const job: TraitementBackgroundJob = {
      id: `trt-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
      status: 'running',
      modelName,
      fileNames,
      startedAt: Date.now(),
      progressMessage: '',
      results: []
    };
    this._job$.next(job);
    return job.id;
  }

  /** Publie la progression (message) du traitement en cours. */
  updateProgress(message: string): void {
    const job = this._job$.getValue();
    if (!job || job.status !== 'running' || job.progressMessage === message) {
      return;
    }
    job.progressMessage = message;
    this._job$.next({ ...job });
  }

  /** Ajoute un fichier produit au job en cours (mode multi-modèle : 1 résultat par modèle). */
  addResult(result: TraitementBackgroundJobResult): void {
    const job = this._job$.getValue();
    if (!job) {
      return;
    }
    job.results = [...job.results, result];
    job.progressMessage = '';
    job.status = 'done';
    job.finishedAt = Date.now();
    this._job$.next({ ...job });
  }

  /** Marque le job en échec (message affiché par le bandeau global). */
  failTraitement(message: string): void {
    const job = this._job$.getValue();
    if (!job || job.status !== 'running') {
      return;
    }
    job.status = 'error';
    job.error = message;
    job.finishedAt = Date.now();
    this._job$.next({ ...job });
  }

  /** Masque le bandeau et oublie le job courant. */
  clear(): void {
    this._job$.next(null);
  }

  /** Re-télécharge le/les fichier(s) produit(s) par le job (lignes déjà normalisées). */
  async downloadResults(): Promise<void> {
    const job = this._job$.getValue();
    if (!job || job.status !== 'done' || !job.results.length || this._isDownloading.getValue()) {
      return;
    }
    this._isDownloading.next(true);
    try {
      for (let i = 0; i < job.results.length; i++) {
        const result = job.results[i];
        const lowerName = result.outputName.toLowerCase();
        const isExcel = this.isExcelFileName(lowerName);
        const exportOptions = {
          chunkSize: result.exportRows.length > 100000
            ? 5000
            : result.exportRows.length > 20000
              ? 2000
              : 1000,
          onProgress: (progress: { current: number; total: number }) => {
            const current = this._job$.getValue();
            if (current) {
              current.progressMessage =
                `Téléchargement (${i + 1}/${job.results.length}) : ` +
                `${progress.current.toLocaleString('fr-FR')} / ${progress.total.toLocaleString('fr-FR')} ligne(s)...`;
              this._job$.next({ ...current });
            }
          },
          yieldFn: () => new Promise<void>(resolve => requestAnimationFrame(() => setTimeout(resolve, 0)))
        };

        if (isExcel) {
          const format = lowerName.endsWith('.xls') ? 'xls' : 'xlsx';
          await this.exportOptimizationService.exportExcelOptimized(
            result.exportRows,
            result.exportColumns,
            result.outputName,
            { format, ...exportOptions }
          );
        } else {
          await this.exportOptimizationService.exportCSVOptimized(
            result.exportRows,
            result.exportColumns,
            result.outputName,
            exportOptions
          );
        }

        if (i < job.results.length - 1) {
          await new Promise<void>(resolve => setTimeout(resolve, 900));
        }
      }
    } catch (error) {
      console.error('❌ Erreur lors du téléchargement du traitement de fond:', error);
    } finally {
      this._isDownloading.next(false);
      const current = this._job$.getValue();
      if (current && current.status === 'done') {
        current.progressMessage = '';
        this._job$.next({ ...current });
      }
    }
  }

  private isExcelFileName(fileName: string): boolean {
    const excelExtensions = [
      '.xls',
      '.xlsx',
      '.xlsm',
      '.xlsb',
      '.xlt',
      '.xltx',
      '.xltm'
    ];
    return excelExtensions.some(ext => fileName.endsWith(ext));
  }
}