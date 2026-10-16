import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { tap, catchError } from 'rxjs/operators';

export interface ProcessingSpecification {
  id: string;
  name: string;
  filePattern: string;
  processingType: 'csv' | 'json' | 'xml' | 'excel';
  delimiter?: string;
  encoding?: string;
  mapping?: Record<string, string>;
  transformations?: Array<{
    type: 'format' | 'validate' | 'transform';
    field: string;
    action: string;
    params?: any;
  }>;
  outputFormat?: 'json' | 'csv' | 'database';
  outputPath?: string;
  autoProcess: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface WatcherStatus {
  watchPath: string;
  isProcessing: boolean;
  queueLength: number;
}

export interface FileProcessingResult {
  success: boolean;
  fileName: string;
  specificationId: string;
  processedAt: Date;
  recordsProcessed?: number;
  errors?: string[];
  outputPath?: string;
}

@Injectable({
  providedIn: 'root'
})
export class FileWatcherService {
  private apiUrl = '/api';

  constructor(private http: HttpClient) { }

  // Surveillance
  startWatching(): Observable<any> {
    return this.http.post(`${this.apiUrl}/file-watcher/start`, {});
  }

  stopWatching(): Observable<any> {
    return this.http.post(`${this.apiUrl}/file-watcher/stop`, {});
  }

  getStatus(): Observable<WatcherStatus> {
    return this.http.get<WatcherStatus>(`${this.apiUrl}/file-watcher/status`);
  }

  // Spécifications
  createSpecification(specification: Partial<ProcessingSpecification>): Observable<any> {
    return this.http.post(`${this.apiUrl}/file-watcher/specifications`, specification);
  }

  getSpecifications(): Observable<ProcessingSpecification[]> {
    return this.http.get<ProcessingSpecification[]>(`${this.apiUrl}/file-watcher/specifications`);
  }

  getSpecification(id: string): Observable<ProcessingSpecification> {
    return this.http.get<ProcessingSpecification>(`${this.apiUrl}/file-watcher/specifications/${id}`);
  }

  updateSpecification(id: string, specification: Partial<ProcessingSpecification>): Observable<any> {
    return this.http.put(`${this.apiUrl}/file-watcher/specifications/${id}`, specification);
  }

  deleteSpecification(id: string): Observable<any> {
    return this.http.delete(`${this.apiUrl}/file-watcher/specifications/${id}`);
  }

  // Traitement manuel
  processFile(fileName: string, specificationId: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/file-watcher/process-file`, {
      fileName,
      specificationId
    });
  }

  // Exemples
  getExamples(): Observable<any[]> {
    return this.http.get<any[]>(`${this.apiUrl}/file-watcher/examples`);
  }

  // Méthodes manquantes pour le composant auto-processing-models
  getAvailableFiles(): Observable<any[]> {
    console.log('🔍 [FileWatcherService] getAvailableFiles() appelé');
    return this.http.get<any[]>(`${this.apiUrl}/file-watcher/available-files`)
      .pipe(
        tap(response => {
          console.log('📊 [FileWatcherService] getAvailableFiles() réponse:', response);
          if (Array.isArray(response)) {
            console.log(`📁 [FileWatcherService] ${response.length} fichiers disponibles`);
            response.forEach(file => {
              console.log(`📄 [FileWatcherService] Fichier: ${file.fileName}, Colonnes: ${file.columns?.length || 0}`);
            });
          }
        }),
        catchError(error => {
          console.error('❌ [FileWatcherService] getAvailableFiles() erreur:', error);
          throw error;
        })
      );
  }

  analyzeFile(fileName: string): Observable<any> {
    console.log('🔍 [FileWatcherService] analyzeFile() appelé pour:', fileName);
    return this.http.post<any>(`${this.apiUrl}/file-watcher/analyze-file`, { filePath: fileName })
      .pipe(
        tap(response => {
          console.log('📊 [FileWatcherService] analyzeFile() réponse:', response);
          if (response && response.columns) {
            console.log(`📋 [FileWatcherService] ${response.columns.length} colonnes détectées pour ${fileName}:`, response.columns);
          }
        }),
        catchError(error => {
          console.error('❌ [FileWatcherService] analyzeFile() erreur:', error);
          throw error;
        })
      );
  }

  /**
   * Importe un fichier modèle (CSV / Excel) qui sera enregistré dans le dossier
   * watch-folder de l'entreprise connectée.
   */
  uploadModelFile(file: File): Observable<any> {
    const formData = new FormData();
    formData.append('file', file);
    console.log('📤 [FileWatcherService] uploadModelFile() pour:', file?.name);
    return this.http.post<any>(`${this.apiUrl}/file-watcher/upload`, formData);
  }
} 