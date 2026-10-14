import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, Subject } from 'rxjs';
import { fixGarbledCharacters } from '../utils/encoding-fixer';
import { 
  ProcessingProgress, 
  DataChunk, 
  ProcessingError, 
  WorkerMessage,
  ProcessingOptions,
  ColumnAnalysis,
  ProcessingRecommendation
} from '../types/data-processing.types';

@Injectable({
  providedIn: 'root'
})
export class DataProcessingService {
  // États principaux des données
  private _rows = new BehaviorSubject<any[]>([]);
  private _originalRows = new BehaviorSubject<any[]>([]);
  private _columns = new BehaviorSubject<string[]>([]);
  private _allColumns = new BehaviorSubject<string[]>([]);
  
  // États de traitement
  private _isProcessing = new BehaviorSubject<boolean>(false);
  private _processingProgress = new BehaviorSubject<ProcessingProgress>({
    current: 0,
    total: 0,
    percentage: 0,
    message: ''
  });
  private _processingMessage = new BehaviorSubject<string>('');
  
  // États d'erreur et de performance
  private _error = new BehaviorSubject<ProcessingError | null>(null);
  private _memoryUsage = new BehaviorSubject<number>(0);
  private _fileStats = new BehaviorSubject<any[]>([]);
  
  // Web Worker
  private worker: Worker | null = null;
  private isWorkerInitialized = false;
  
  // Observables publics
  public readonly rows$ = this._rows.asObservable();
  public readonly originalRows$ = this._originalRows.asObservable();
  public readonly columns$ = this._columns.asObservable();
  public readonly allColumns$ = this._allColumns.asObservable();
  public readonly isProcessing$ = this._isProcessing.asObservable();
  public readonly processingProgress$ = this._processingProgress.asObservable();
  public readonly processingMessage$ = this._processingMessage.asObservable();
  public readonly error$ = this._error.asObservable();
  public readonly memoryUsage$ = this._memoryUsage.asObservable();
  public readonly fileStats$ = this._fileStats.asObservable();
  
  // Getters pour accès direct
  get rows(): any[] { return this._rows.getValue(); }
  get originalRows(): any[] { return this._originalRows.getValue(); }
  get columns(): string[] { return this._columns.getValue(); }
  get allColumns(): string[] { return this._allColumns.getValue(); }
  get isProcessing(): boolean { return this._isProcessing.getValue(); }
  
  constructor() {
    this.initializeWorker();
  }
  
  /**
   * Initialise le Web Worker pour le traitement des données
   */
  private initializeWorker(): void {
    try {
      if (typeof Worker !== 'undefined') {
        this.worker = new Worker(new URL('../traitement/data-processing.worker', import.meta.url));
        this.setupWorkerListeners();
        this.isWorkerInitialized = true;
        console.log('✅ Web Worker initialisé avec succès');
      } else {
        console.warn('⚠️ Web Workers non supportés, utilisation du mode synchrone');
        this.isWorkerInitialized = false;
      }
    } catch (error) {
      console.error('❌ Erreur lors de l\'initialisation du Web Worker:', error);
      this.isWorkerInitialized = false;
    }
  }
  
  /**
   * Configure les listeners pour les messages du Web Worker
   */
  private setupWorkerListeners(): void {
    if (!this.worker) return;
    
    this.worker.onmessage = (event: MessageEvent<WorkerMessage>) => {
      const { type, data } = event.data;
      
      switch (type) {
        case 'progress':
          this.updateProgress(data);
          break;
          
        case 'data-chunk':
          this.processDataChunk(data);
          break;
          
        case 'columns':
          this.updateColumns(data);
          break;
          
        case 'complete':
          this.completeProcessing(data);
          break;
          
        case 'error':
          this.handleError(data);
          break;
          
        case 'memory-warning':
          this.handleMemoryWarning(data);
          break;
          
        default:
          console.warn('⚠️ Type de message inconnu:', type);
      }
    };
    
    this.worker.onerror = (error) => {
      console.error('❌ Erreur Web Worker:', error);
      this.handleError({
        type: 'worker',
        message: 'Erreur dans le Web Worker',
        details: error
      });
    };
  }
  
  /**
   * Traite les fichiers avec le Web Worker
   */
  public async processFiles(files: File[]): Promise<void> {
    if (files.length === 0) return;
    
    // Réinitialiser les états
    this.resetStates();
    this._isProcessing.next(true);
    this._processingMessage.next('🚀 Initialisation du traitement ultra-rapide...');
    
    try {
      if (this.isWorkerInitialized && this.worker) {
        // Traitement avec Web Worker
        await this.processFilesWithWorker(files);
      } else {
        // Fallback: traitement synchrone
        await this.processFilesSynchronously(files);
      }
    } catch (error) {
      console.error('❌ Erreur lors du traitement des fichiers:', error);
      this.handleError({
        type: 'file',
        message: 'Erreur lors du traitement des fichiers',
        details: error
      });
    }
  }
  
  /**
   * Traitement avec Web Worker
   */
  private async processFilesWithWorker(files: File[]): Promise<void> {
    if (!this.worker) throw new Error('Web Worker non disponible');
    
    return new Promise((resolve, reject) => {
      // Écouter la completion
      const completeHandler = (event: MessageEvent<WorkerMessage>) => {
        if (event.data.type === 'complete') {
          this.worker?.removeEventListener('message', completeHandler);
          resolve();
        } else if (event.data.type === 'error') {
          this.worker?.removeEventListener('message', completeHandler);
          reject(new Error(event.data.data.message));
        }
      };
      
      this.worker?.addEventListener('message', completeHandler);
      
      // Envoyer les fichiers au worker
      this.worker?.postMessage({
        type: 'process-files',
        data: {
          files: files,
          options: {
            chunkSize: 25000,
            maxMemoryUsage: 500 * 1024 * 1024, // 500MB
            enableStreaming: true,
            enableCompression: true
          }
        }
      });
    });
  }
  
  /**
   * Traitement synchrone (fallback)
   */
  private async processFilesSynchronously(files: File[]): Promise<void> {
    console.log('🔄 Traitement synchrone (fallback)');
    
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      this._processingMessage.next(`📁 Traitement du fichier ${i + 1}/${files.length}: ${file.name}`);
      
      try {
        await this.processSingleFileSynchronously(file, i, files.length);
      } catch (error) {
        console.error(`❌ Erreur lors du traitement de ${file.name}:`, error);
        this.handleError({
          type: 'file',
          message: `Erreur lors du traitement de ${file.name}`,
          file: file.name,
          details: error
        });
      }
    }
    
    this.completeProcessing({ totalRows: this.rows.length });
  }
  
  /**
   * Traitement synchrone d'un seul fichier
   */
  private async processSingleFileSynchronously(file: File, fileIndex: number, totalFiles: number): Promise<void> {
    const fileName = file.name.toLowerCase();
    
    if (fileName.endsWith('.csv')) {
      await this.processCsvFileSynchronously(file);
    } else if (fileName.endsWith('.xls') || fileName.endsWith('.xlsx')) {
      await this.processExcelFileSynchronously(file);
    } else {
      throw new Error('Format de fichier non supporté');
    }
  }
  
  /**
   * Traitement CSV synchrone
   */
  private async processCsvFileSynchronously(file: File): Promise<void> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      
      reader.onload = (e: any) => {
        try {
          const csv = e.target.result;
          const lines = csv.split('\n');
          const headers = lines[0].split(';').map((h: string) => h.trim());
          
          // Traitement par chunks
          const chunkSize = 10000;
          let processedRows = 0;
          
          for (let i = 1; i < lines.length; i += chunkSize) {
            const chunk = lines.slice(i, i + chunkSize);
            const chunkRows: any[] = [];
            
            for (const line of chunk) {
              if (line.trim()) {
                const values = line.split(';');
                const row: any = {};
                headers.forEach((header: string, index: number) => {
                  row[header] = values[index] || '';
                });
                chunkRows.push(row);
              }
            }
            
            // Ajouter le chunk aux données
            const currentRows = this._rows.getValue();
            this._rows.next([...currentRows, ...chunkRows]);
            
            processedRows += chunkRows.length;
            this.updateProgress({
              current: processedRows,
              total: lines.length - 1,
              percentage: (processedRows / (lines.length - 1)) * 100,
              message: `Traitement CSV: ${processedRows.toLocaleString()} lignes`
            });
          }
          
          // Mettre à jour les colonnes
          this.updateColumns(headers);
          resolve();
          
        } catch (error) {
          reject(error);
        }
      };
      
      reader.onerror = reject;
      reader.readAsText(file, 'UTF-8');
    });
  }
  
  /**
   * Traitement Excel synchrone
   */
  private async processExcelFileSynchronously(file: File): Promise<void> {
    // Import dynamique de XLSX
    const XLSX = await import('xlsx');
    
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      
      reader.onload = (e: any) => {
        try {
          const data = new Uint8Array(e.target.result);
          const workbook = XLSX.read(data, { type: 'array', cellDates: true });
          const sheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[sheetName];
          
          // Conversion en tableau
          const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[][];
          
          if (jsonData.length === 0) {
            resolve();
            return;
          }
          
          // Détecter les en-têtes (simplifié)
          const headers = jsonData[0].map((h: any) => h?.toString() || '');
          const dataRows = jsonData.slice(1);
          
          // Traitement par chunks optimisé pour 700k lignes
          const chunkSize = dataRows.length > 500000 ? 25000 : dataRows.length > 100000 ? 15000 : 10000;
          let processedRows = 0;
          
          for (let i = 0; i < dataRows.length; i += chunkSize) {
            const chunk = dataRows.slice(i, i + chunkSize);
            const chunkRows: any[] = [];
            
            for (const rowData of chunk) {
              if (rowData && rowData.length > 0) {
                const row: any = {};
                headers.forEach((header: string, index: number) => {
                  row[header] = rowData[index] !== undefined ? rowData[index] : '';
                });
                chunkRows.push(row);
              }
            }
            
            // Ajouter le chunk aux données
            const currentRows = this._rows.getValue();
            this._rows.next([...currentRows, ...chunkRows]);
            
            processedRows += chunkRows.length;
            this.updateProgress({
              current: processedRows,
              total: dataRows.length,
              percentage: (processedRows / dataRows.length) * 100,
              message: `Traitement Excel: ${processedRows.toLocaleString()} lignes`
            });
          }
          
          // Mettre à jour les colonnes
          this.updateColumns(headers);
          resolve();
          
        } catch (error) {
          reject(error);
        }
      };
      
      reader.onerror = reject;
      reader.readAsArrayBuffer(file);
    });
  }
  
  /**
   * Met à jour la progression du traitement
   */
  private updateProgress(progress: ProcessingProgress): void {
    this._processingProgress.next(progress);
    this._processingMessage.next(progress.message);
  }
  
  /**
   * Traite un chunk de données reçu du worker
   */
  private processDataChunk(chunk: DataChunk): void {
    const currentRows = this._rows.getValue();
    const newRows = [...currentRows, ...chunk.rows];
    this._rows.next(newRows);
    
    // Si c'est le dernier chunk, mettre à jour originalRows
    if (chunk.isLast) {
      this._originalRows.next([...newRows]);
    }
  }
  
  /**
   * Met à jour les colonnes
   */
  private updateColumns(columns: string[]): void {
    this._columns.next([...columns]);
    this._allColumns.next([...columns]);
  }
  
  /**
   * Finalise le traitement
   */
  private completeProcessing(data: any): void {
    this._isProcessing.next(false);
    this._processingProgress.next({
      current: data.totalRows || 0,
      total: data.totalRows || 0,
      percentage: 100,
      message: `✅ Traitement terminé: ${(data.totalRows || 0).toLocaleString()} lignes`
    });
    
    console.log('✅ Traitement terminé avec succès');
  }
  
  /**
   * Gère les erreurs
   */
  private handleError(error: ProcessingError): void {
    this._error.next(error);
    this._isProcessing.next(false);
    console.error('❌ Erreur de traitement:', error);
  }
  
  /**
   * Gère les avertissements de mémoire
   */
  private handleMemoryWarning(data: any): void {
    this._memoryUsage.next(data.usage);
    console.warn('⚠️ Utilisation mémoire élevée:', data.usage);
  }
  
  /**
   * Réinitialise tous les états
   */
  private resetStates(): void {
    this._rows.next([]);
    this._originalRows.next([]);
    this._columns.next([]);
    this._allColumns.next([]);
    this._error.next(null);
    this._memoryUsage.next(0);
    this._fileStats.next([]);
    this._processingProgress.next({
      current: 0,
      total: 0,
      percentage: 0,
      message: ''
    });
  }
  
  /**
   * Applique un formatage aux données
   */
  public async applyFormatting(formatOptions: any = {}): Promise<void> {
    if (!this.isWorkerInitialized || !this.worker) {
      // Formatage synchrone
      this.applyFormattingSynchronously(formatOptions);
      return;
    }
    
    // Formatage avec Web Worker
    return new Promise((resolve, reject) => {
      const completeHandler = (event: MessageEvent<WorkerMessage>) => {
        if (event.data.type === 'complete') {
          this.worker?.removeEventListener('message', completeHandler);
          resolve();
        } else if (event.data.type === 'error') {
          this.worker?.removeEventListener('message', completeHandler);
          reject(new Error(event.data.data.message));
        }
      };
      
      this.worker?.addEventListener('message', completeHandler);
      
      this.worker?.postMessage({
        type: 'apply-formatting',
        data: {
          rows: this.rows,
          formatOptions: formatOptions
        }
      });
    });
  }
  
  /**
   * Formatage synchrone (fallback)
   */
  private applyFormattingSynchronously(formatOptions: any): void {
    const currentRows = this._rows.getValue();
    const formattedRows = currentRows.map(row => {
      const newRow: any = {};
      for (const col of this.columns) {
        let value = row[col];
        
        if (typeof value === 'string') {
          if (formatOptions.trimSpaces) {
            value = value.replace(/\s+/g, ' ').trim();
          }
          if (formatOptions.toLowerCase) {
            value = value.toLowerCase();
          }
          if (formatOptions.toUpperCase) {
            value = value.toUpperCase();
          }
          // Ajouter d'autres options de formatage...
        }
        
        newRow[col] = value;
      }
      return newRow;
    });
    
    this._rows.next(formattedRows);
    this._originalRows.next([...formattedRows]);
  }
  
  /**
   * Exporte les données en CSV
   */
  public async exportCSV(fileName: string = 'resultat.csv'): Promise<void> {
    const rows = this.rows;
    const columns = this.columns;
    
    if (rows.length === 0) return;
    
    // Créer le contenu CSV
    const csvContent = [
      columns.join(';'),
      ...rows.map(row => 
        columns.map(col => {
          let val = row[col] !== undefined && row[col] !== null ? row[col].toString() : '';
          if (val.includes('"')) val = val.replace(/"/g, '""');
          if (val.includes(';') || val.includes('"') || val.includes('\n')) val = '"' + val + '"';
          return val;
        }).join(';')
      )
    ].join('\r\n');
    
    // Créer et télécharger le fichier
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName.endsWith('.csv') ? fileName : fileName + '.csv';
    a.click();
    URL.revokeObjectURL(url);
  }
  
  /**
   * Nettoie les ressources
   */
  public destroy(): void {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
    this.isWorkerInitialized = false;
  }

  /**
   * Analyse les colonnes pour des recommandations
   */
  public analyzeColumns(): any[] {
    const rows = this.rows;
    const columns = this.columns;
    
    if (rows.length === 0 || columns.length === 0) {
      return [];
    }

    const analysis = columns.map(columnName => {
      const values = rows.map(row => row[columnName]).filter(val => val !== undefined && val !== null);
      const uniqueValues = new Set(values);
      const nullValues = rows.length - values.length;
      
      return {
        columnName,
        uniqueValues: uniqueValues.size,
        nullValues,
        sampleValues: Array.from(uniqueValues).slice(0, 5)
      };
    });

    const recommendations = [];
    
    for (const column of analysis) {
      if (column.uniqueValues < 10 && column.columnName.toLowerCase().includes('montant')) {
        recommendations.push({
          type: 'warning',
          message: `Colonne "${column.columnName}" a peu de valeurs uniques (${column.uniqueValues})`,
          suggestion: 'Vérifiez si cette colonne contient des données numériques'
        });
      } else if (column.uniqueValues === 1) {
        recommendations.push({
          type: 'info',
          message: `Colonne "${column.columnName}" a une seule valeur unique`,
          suggestion: 'Cette colonne pourrait être supprimée'
        });
      } else if (column.nullValues > rows.length * 0.5) {
        recommendations.push({
          type: 'warning',
          message: `Colonne "${column.columnName}" a beaucoup de valeurs nulles (${column.nullValues}/${rows.length})`,
          suggestion: 'Vérifiez la qualité des données'
        });
      }
    }

    return recommendations;
  }
}
