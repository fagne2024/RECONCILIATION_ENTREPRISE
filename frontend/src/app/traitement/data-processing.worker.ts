/// <reference lib="webworker" />

// Déclarations globales pour éviter les conflits
declare const XLSX: any;
declare const self: any;
declare const postMessage: any;
declare const addEventListener: any;
declare const removeEventListener: any;

// Fonction de réparation des caractères spéciaux
const characterMap: { [key: string]: string } = {
  'Ã©': 'é',
  'Ã¨': 'è',
  'Ãª': 'ê',
  'Ã«': 'ë',
  'Ã ': 'à',
  'Ã¢': 'â',
  'Ã¤': 'ä',
  'Ã§': 'ç',
  'Ã´': 'ô',
  'Ã¶': 'ö',
  'Ã¹': 'ù',
  'Ã»': 'û',
  'Ã¼': 'ü',
  'Ã®': 'î',
  'Ã¯': 'ï',
  // Majuscules : second octet dans la plage 0x80–0x9F de Windows-1252
  'Ã‰': 'É',
  'Ãˆ': 'È',
  'ÃŠ': 'Ê',
  'Ã€': 'À',
  'Ã‡': 'Ç',
  'Ã”': 'Ô',
  'Ã›': 'Û',
  'Ãœ': 'Ü',
  'tï¿½lï¿½phone': 'téléphone',
  'Numï¿½ro': 'Numéro',
  'Opï¿½ration': 'Opération',
  'aprï¿½s': 'après',
  'rï¿½fï¿½rence': 'référence',
  'crï¿½dit': 'crédit',
  'dï¿½bit': 'débit'
};

function fixGarbledCharacters(text: string | null | undefined): string {
  if (!text) {
    return '';
  }

  let fixedText = text;
  for (const [garbled, correct] of Object.entries(characterMap)) {
    const regex = new RegExp(garbled, 'g');
    fixedText = fixedText.replace(regex, correct);
  }

  return fixedText;
}

import { 
  WorkerMessage, 
  ProcessingProgress, 
  DataChunk, 
  ProcessingError,
  WorkerRequest,
  ProcessingOptions,
  FileProcessingContext
} from '../types/data-processing.types';

// Configuration par défaut

// Variables globales du worker
let currentContext: FileProcessingContext | null = null;
let accumulatedRows: any[] = [];
let allColumns: Set<string> = new Set();
let totalProcessedRows = 0;
let currentChunkIndex = 0;

// Configuration par défaut - Optimisé pour 700k lignes
const DEFAULT_OPTIONS: ProcessingOptions = {
  chunkSize: 50000, // Augmenté de 25k à 50k pour 700k lignes
  maxMemoryUsage: 1024 * 1024 * 1024, // 1GB au lieu de 500MB
  enableStreaming: true,
  enableCompression: true
};

/**
 * Gestionnaire principal des messages
 */
self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const { type, data } = event.data;
  
  try {
    switch (type) {
      case 'process-files':
        await processFiles(data.files, data.options || DEFAULT_OPTIONS);
        break;
        
      case 'apply-formatting':
        await applyFormatting(data.rows, data.formatOptions);
        break;
        
      case 'export-csv':
        await exportCSV(data.rows, data.columns, data.fileName);
        break;
        
      default:
        throw new Error(`Type de message inconnu: ${type}`);
    }
  } catch (error) {
    console.error('❌ Erreur dans le Web Worker:', error);
    sendError({
      type: 'worker',
      message: error instanceof Error ? error.message : 'Erreur inconnue',
      details: error
    });
  }
};

/**
 * Traite les fichiers avec streaming
 */
async function processFiles(files: File[], options: ProcessingOptions): Promise<void> {
  console.log('🚀 Début du traitement des fichiers avec Web Worker');
  console.log(`📊 Options: chunkSize=${options.chunkSize}, streaming=${options.enableStreaming}`);
  
  // Réinitialiser les variables globales
  resetWorkerState();
  
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    currentContext = {
      file,
      fileName: file.name,
      fileIndex: i,
      totalFiles: files.length,
      options
    };
    
    console.log(`📁 Traitement du fichier ${i + 1}/${files.length}: ${file.name}`);
    
    try {
      await processSingleFile(file, options);
    } catch (error) {
      console.error(`❌ Erreur lors du traitement de ${file.name}:`, error);
      sendError({
        type: 'file',
        message: `Erreur lors du traitement de ${file.name}`,
        file: file.name,
        details: error
      });
      throw error;
    }
  }
  
  // Finaliser le traitement
  sendComplete({
    totalRows: totalProcessedRows,
    totalFiles: files.length,
    totalColumns: allColumns.size
  });
}

/**
 * Traite un seul fichier
 */
async function processSingleFile(file: File, options: ProcessingOptions): Promise<void> {
  const fileName = file.name.toLowerCase();
  
  if (fileName.endsWith('.csv')) {
    await processCsvFile(file, options);
  } else if (fileName.endsWith('.xls') || fileName.endsWith('.xlsx')) {
    await processExcelFile(file, options);
  } else {
    throw new Error(`Format de fichier non supporté: ${file.name}`);
  }
}

/**
 * Traite un fichier CSV avec streaming
 */
async function processCsvFile(file: File, options: ProcessingOptions): Promise<void> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    
    reader.onload = async (e: any) => {
      try {
        const csv = e.target.result;
        await processCsvContent(csv, options);
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
 * Traite le contenu CSV avec streaming
 */
async function processCsvContent(csv: string, options: ProcessingOptions): Promise<void> {
  const lines = csv.split('\n');
  const totalLines = lines.length;
  
  if (totalLines === 0) {
    sendProgress({
      current: 0,
      total: 0,
      percentage: 100,
      message: 'Fichier CSV vide'
    });
    return;
  }
  
  // Détecter les en-têtes
  const headerLine = lines[0];
  const headers = detectCsvHeaders(headerLine);
  
  // Envoyer les colonnes détectées
  sendColumns(Array.from(headers));
  
  // Traitement par streaming des lignes de données
  const dataLines = lines.slice(1);
  let processedLines = 0;
  let currentChunk: any[] = [];
  
  for (let i = 0; i < dataLines.length; i++) {
    const line = dataLines[i];
    
    if (line.trim()) {
      const row = parseCsvLine(line, headers);
      currentChunk.push(row);
      
      // Vérifier si on doit envoyer le chunk
      if (currentChunk.length >= options.chunkSize) {
        await sendDataChunk(currentChunk, processedLines, false);
        currentChunk = [];
        
        // Vérifier l'utilisation mémoire
        checkMemoryUsage(options.maxMemoryUsage);
      }
    }
    
    processedLines++;
    
    // Mettre à jour la progression
    if (i % 1000 === 0 || i === dataLines.length - 1) {
      const percentage = (processedLines / dataLines.length) * 100;
      sendProgress({
        current: processedLines,
        total: dataLines.length,
        percentage,
        message: `Traitement CSV: ${processedLines.toLocaleString()}/${dataLines.length.toLocaleString()} lignes`
      });
    }
  }
  
  // Envoyer le dernier chunk s'il y en a un
  if (currentChunk.length > 0) {
    await sendDataChunk(currentChunk, processedLines, true);
  }
  
  totalProcessedRows += processedLines;
}

/**
 * Traite un fichier Excel avec streaming
 */
async function processExcelFile(file: File, options: ProcessingOptions): Promise<void> {
  // Import dynamique de XLSX
  const XLSXModule = await import('xlsx');
  const XLSX = XLSXModule as any;
  
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    
    reader.onload = async (e: any) => {
      try {
        const data = new Uint8Array(e.target.result);
        await processExcelContent(data, XLSX, options);
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
 * Traite le contenu Excel avec streaming
 */
async function processExcelContent(data: Uint8Array, XLSX: any, options: ProcessingOptions): Promise<void> {
  const workbook = (XLSX as any).read(data, { type: 'array', cellDates: true });
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  
  // Obtenir la plage de données
  const range = (XLSX as any).utils.decode_range(worksheet['!ref'] || 'A1');
  const totalRows = range.e.r - range.s.r;
  
  if (totalRows === 0) {
    sendProgress({
      current: 0,
      total: 0,
      percentage: 100,
      message: 'Fichier Excel vide'
    });
    return;
  }
  
  // Détecter les en-têtes
  const headers = detectExcelHeaders(worksheet, range);
  sendColumns(headers);
  
  // Traitement par streaming optimisé pour 700k lignes
  let processedRows = 0;
  let currentChunk: any[] = [];
  const isVeryLargeFile = totalRows > 500000;
  
  console.log(`🔄 Début traitement streaming Excel: ${totalRows.toLocaleString()} lignes (${isVeryLargeFile ? 'très gros fichier' : 'fichier normal'})`);
  
  for (let rowIndex = range.s.r + 1; rowIndex <= range.e.r; rowIndex++) {
    const row = parseExcelRow(worksheet, rowIndex, headers, range);
    
    if (row && Object.keys(row).length > 0) {
      currentChunk.push(row);
      
      // Vérifier si on doit envoyer le chunk
      if (currentChunk.length >= options.chunkSize) {
        await sendDataChunk(currentChunk, processedRows, false);
        currentChunk = [];
        
        // Vérifier l'utilisation mémoire
        checkMemoryUsage(options.maxMemoryUsage);
      }
    }
    
    processedRows++;
    
    // Mettre à jour la progression moins fréquemment pour les très gros fichiers
    const progressInterval = isVeryLargeFile ? 5000 : 1000;
    if (rowIndex % progressInterval === 0 || rowIndex === range.e.r) {
      const percentage = (processedRows / totalRows) * 100;
      sendProgress({
        current: processedRows,
        total: totalRows,
        percentage,
        message: `Traitement Excel: ${processedRows.toLocaleString()}/${totalRows.toLocaleString()} lignes`
      });
    }
  }
  
  // Envoyer le dernier chunk s'il y en a un
  if (currentChunk.length > 0) {
    await sendDataChunk(currentChunk, processedRows, true);
  }
  
  totalProcessedRows += processedRows;
}

/**
 * Détecte les en-têtes CSV
 */
function detectCsvHeaders(headerLine: string): string[] {
  const headers = headerLine.split(';').map((h: string) => fixGarbledCharacters(h.trim()));
  
  // Nettoyer et valider les en-têtes
  return headers.map((header, index) => {
    if (!header || header === '') {
      return `Col${index + 1}`;
    }
    return header;
  });
}

/**
 * Détecte les en-têtes Excel
 */
function detectExcelHeaders(worksheet: any, range: any): string[] {
  const headers: string[] = [];
  
  for (let colIndex = range.s.c; colIndex <= range.e.c; colIndex++) {
    const cellAddress = (XLSX as any).utils.encode_cell({ r: range.s.r, c: colIndex });
    const cell = worksheet[cellAddress];
    
    let header = '';
    if (cell && cell.v !== undefined) {
      header = cell.v.toString().trim();
    }
    
    if (!header || header === '') {
      header = `Col${colIndex + 1}`;
    }
    
    headers.push(header);
  }
  
  return headers;
}

/**
 * Parse une ligne CSV
 */
function parseCsvLine(line: string, headers: string[]): any {
  const values = line.split(';');
  const row: any = {};
  
  headers.forEach((header, index) => {
    row[header] = fixGarbledCharacters(values[index] || '');
  });
  
  return row;
}

/**
 * Parse une ligne Excel
 */
function parseExcelRow(worksheet: any, rowIndex: number, headers: string[], range: any): any {
  const row: any = {};
  let hasData = false;
  
  for (let colIndex = range.s.c; colIndex <= range.e.c; colIndex++) {
    const cellAddress = (XLSX as any).utils.encode_cell({ r: rowIndex, c: colIndex });
    const cell = worksheet[cellAddress];
    
    const header = headers[colIndex];
    const value = cell && cell.v !== undefined ? cell.v : '';
    
    row[header] = value;
    
    if (value !== '' && value !== null && value !== undefined) {
      hasData = true;
    }
  }
  
  return hasData ? row : null;
}

/**
 * Envoie un chunk de données au thread principal
 */
async function sendDataChunk(chunk: any[], startIndex: number, isLast: boolean): Promise<void> {
  // Ajouter les colonnes au set global
  chunk.forEach(row => {
    Object.keys(row).forEach(col => allColumns.add(col));
  });
  
  const dataChunk: DataChunk = {
    rows: chunk,
    startIndex,
    endIndex: startIndex + chunk.length,
    isLast
  };
  
  sendMessage('data-chunk', dataChunk);
  
  // Libérer la mémoire
  if (isLast) {
    accumulatedRows = [];
  }
  
  // Céder le contrôle pour éviter le blocage
  await yieldControl();
}

/**
 * Applique un formatage aux données
 */
async function applyFormatting(rows: any[], formatOptions: any): Promise<void> {
  console.log('🔧 Application du formatage dans le Web Worker');
  
  const totalRows = rows.length;
  const chunkSize = 10000;
  let processedRows = 0;
  
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    const formattedChunk = chunk.map(row => {
      const newRow: any = {};
      
      Object.keys(row).forEach(col => {
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
          if (formatOptions.removeSeparators) {
            value = value.replace(/,/g, '');
          }
          if (formatOptions.dotToComma) {
            value = value.replace(/\./g, ',');
          }
          if (formatOptions.removeDashesAndCommas) {
            value = value.replace(/[-,]/g, '');
          }
        }
        
        newRow[col] = value;
      });
      
      return newRow;
    });
    
    // Envoyer le chunk formaté
    sendMessage('data-chunk', {
      rows: formattedChunk,
      startIndex: i,
      endIndex: i + formattedChunk.length,
      isLast: i + chunkSize >= rows.length
    });
    
    processedRows += chunk.length;
    
    // Mettre à jour la progression
    const percentage = (processedRows / totalRows) * 100;
    sendProgress({
      current: processedRows,
      total: totalRows,
      percentage,
      message: `Formatage: ${processedRows.toLocaleString()}/${totalRows.toLocaleString()} lignes`
    });
    
    // Céder le contrôle
    await yieldControl();
  }
  
  sendComplete({ totalRows: rows.length });
}

/**
 * Exporte les données en CSV
 */
async function exportCSV(rows: any[], columns: string[], fileName: string): Promise<void> {
  console.log('📤 Export CSV dans le Web Worker');
  
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
  
  // Créer le blob et l'envoyer
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  
  sendMessage('export-complete', {
    blob,
    fileName: fileName.endsWith('.csv') ? fileName : fileName + '.csv'
  });
}

/**
 * Vérifie l'utilisation mémoire
 */
function checkMemoryUsage(maxUsage: number): void {
  if ('memory' in performance) {
    const memory = (performance as any).memory;
    const usage = memory.usedJSHeapSize;
    
    if (usage > maxUsage * 0.8) {
      sendMessage('memory-warning', {
        usage,
        maxUsage,
        percentage: (usage / maxUsage) * 100
      });
    }
  }
}

/**
 * Cède le contrôle pour éviter le blocage
 */
function yieldControl(): Promise<void> {
  return new Promise(resolve => {
    setTimeout(resolve, 0);
  });
}

/**
 * Réinitialise l'état du worker
 */
function resetWorkerState(): void {
  accumulatedRows = [];
  allColumns.clear();
  totalProcessedRows = 0;
  currentChunkIndex = 0;
  currentContext = null;
}

/**
 * Envoie un message au thread principal
 */
function sendMessage(type: WorkerMessage['type'], data: any): void {
  self.postMessage({ type, data });
}

/**
 * Envoie la progression
 */
function sendProgress(progress: ProcessingProgress): void {
  sendMessage('progress', progress);
}

/**
 * Envoie les colonnes
 */
function sendColumns(columns: string[]): void {
  sendMessage('columns', columns);
}

/**
 * Envoie la completion
 */
function sendComplete(data: any): void {
  sendMessage('complete', data);
}

/**
 * Envoie une erreur
 */
function sendError(error: ProcessingError): void {
  sendMessage('error', error);
}

// Configuration du worker
console.log('🚀 Web Worker de traitement des données initialisé');
