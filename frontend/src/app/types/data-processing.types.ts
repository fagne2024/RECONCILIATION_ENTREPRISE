// Types partagés pour le traitement des données

export interface ProcessingProgress {
  current: number;
  total: number;
  percentage: number;
  message: string;
  currentFile?: string;
  totalFiles?: number;
}

export interface DataChunk {
  rows: any[];
  startIndex: number;
  endIndex: number;
  isLast: boolean;
}

export interface ProcessingError {
  type: 'file' | 'parsing' | 'memory' | 'worker';
  message: string;
  file?: string;
  details?: any;
}

export interface WorkerMessage {
  type: 'progress' | 'data-chunk' | 'columns' | 'complete' | 'error' | 'memory-warning' | 'export-complete';
  data: any;
}

export interface WorkerRequest {
  type: 'process-files' | 'apply-formatting' | 'export-csv';
  data: any;
}

export interface ProcessingOptions {
  chunkSize: number;
  maxMemoryUsage: number;
  enableStreaming: boolean;
  enableCompression: boolean;
}

export interface FileProcessingContext {
  file: File;
  fileName: string;
  fileIndex: number;
  totalFiles: number;
  options: ProcessingOptions;
}

export interface ColumnAnalysis {
  columnName: string;
  uniqueValues: number;
  nullValues: number;
  sampleValues: any[];
}

export interface ProcessingRecommendation {
  type: 'warning' | 'info' | 'error';
  message: string;
  suggestion: string;
}
