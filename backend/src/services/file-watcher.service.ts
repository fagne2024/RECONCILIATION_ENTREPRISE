import * as fs from 'fs';
import * as path from 'path';
import * as chokidar from 'chokidar';
import { EventEmitter } from 'events';

export interface ProcessingSpecification {
  id: string;
  name: string;
  filePattern: string; // Pattern pour identifier le type de fichier
  processingType: 'csv' | 'json' | 'xml' | 'excel';
  delimiter?: string; // Pour les fichiers CSV
  encoding?: string;
  mapping?: Record<string, string>; // Mapping des colonnes
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

export interface FileProcessingResult {
  success: boolean;
  fileName: string;
  specificationId: string;
  processedAt: Date;
  recordsProcessed?: number;
  errors?: string[];
  outputPath?: string;
}

export class FileWatcherService extends EventEmitter {
  private watcher: chokidar.FSWatcher | null = null;
  private watchPath: string;
  private specifications: Map<string, ProcessingSpecification> = new Map();
  private processingQueue: string[] = [];
  private isProcessing = false;

  constructor(watchPath: string = './watch-folder') {
    super();
    this.watchPath = watchPath;
    this.ensureWatchDirectory();
  }

  private ensureWatchDirectory(): void {
    if (!fs.existsSync(this.watchPath)) {
      fs.mkdirSync(this.watchPath, { recursive: true });
      console.log(`Dossier de surveillance créé: ${this.watchPath}`);
    }
  }

  public startWatching(): void {
    if (this.watcher) {
      console.log('La surveillance est déjà active');
      return;
    }

    this.watcher = chokidar.watch(this.watchPath, {
      ignored: /(^|[\/\\])\../, // Ignore les fichiers cachés
      persistent: true,
      awaitWriteFinish: {
        stabilityThreshold: 2000,
        pollInterval: 100
      }
    });

    this.watcher
      .on('add', (filePath) => {
        console.log(`Nouveau fichier détecté: ${filePath}`);
        this.handleNewFile(filePath);
      })
      .on('change', (filePath) => {
        console.log(`Fichier modifié: ${filePath}`);
        this.handleNewFile(filePath);
      })
      .on('error', (error) => {
        console.error('Erreur de surveillance:', error);
      });

    console.log(`Surveillance démarrée sur: ${this.watchPath}`);
  }

  public stopWatching(): void {
    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
      console.log('Surveillance arrêtée');
    }
  }

  private async handleNewFile(filePath: string): Promise<void> {
    const fileName = path.basename(filePath);
    
    // Vérifier si le fichier est en cours de traitement
    if (this.processingQueue.includes(filePath)) {
      console.log(`Fichier déjà en cours de traitement: ${fileName}`);
      return;
    }

    // Trouver la spécification correspondante
    const specification = this.findMatchingSpecification(fileName);
    if (!specification) {
      console.log(`Aucune spécification trouvée pour: ${fileName}`);
      return;
    }

    if (!specification.autoProcess) {
      console.log(`Traitement automatique désactivé pour: ${fileName}`);
      return;
    }

    // Ajouter à la queue de traitement
    this.processingQueue.push(filePath);
    this.processQueue();
  }

  private findMatchingSpecification(fileName: string): ProcessingSpecification | null {
    for (const spec of this.specifications.values()) {
      if (this.matchesPattern(fileName, spec.filePattern)) {
        return spec;
      }
    }
    return null;
  }

  private matchesPattern(fileName: string, pattern: string): boolean {
    // Support pour les patterns simples et regex
    if (pattern.startsWith('/') && pattern.endsWith('/')) {
      const regex = new RegExp(pattern.slice(1, -1));
      return regex.test(fileName);
    }
    
    // Support pour les wildcards
    const regexPattern = pattern
      .replace(/\./g, '\\.')
      .replace(/\*/g, '.*')
      .replace(/\?/g, '.');
    
    const regex = new RegExp(`^${regexPattern}$`);
    return regex.test(fileName);
  }

  private async processQueue(): Promise<void> {
    if (this.isProcessing || this.processingQueue.length === 0) {
      return;
    }

    this.isProcessing = true;

    while (this.processingQueue.length > 0) {
      const filePath = this.processingQueue.shift()!;
      await this.processFile(filePath);
    }

    this.isProcessing = false;
  }

  private async processFile(filePath: string): Promise<void> {
    const fileName = path.basename(filePath);
    const specification = this.findMatchingSpecification(fileName);
    
    if (!specification) {
      console.log(`Spécification non trouvée pour: ${fileName}`);
      return;
    }

    try {
      console.log(`Traitement de: ${fileName} avec la spécification: ${specification.name}`);
      
      const result: FileProcessingResult = {
        success: false,
        fileName,
        specificationId: specification.id,
        processedAt: new Date(),
        errors: []
      };

      // Lire le fichier selon le type
      const fileContent = await this.readFile(filePath, specification);
      
      // Appliquer les transformations
      const processedData = await this.applyTransformations(fileContent, specification);
      
      // Générer la sortie
      const outputPath = await this.generateOutput(processedData, specification, fileName);
      
      result.success = true;
      result.recordsProcessed = Array.isArray(processedData) ? processedData.length : 1;
      result.outputPath = outputPath;

      // Émettre l'événement de traitement réussi
      this.emit('fileProcessed', result);
      
      console.log(`Traitement réussi: ${fileName} -> ${outputPath}`);

    } catch (error) {
      console.error(`Erreur lors du traitement de ${fileName}:`, error);
      
      const result: FileProcessingResult = {
        success: false,
        fileName,
        specificationId: specification.id,
        processedAt: new Date(),
        errors: [error instanceof Error ? error.message : String(error)]
      };

      this.emit('fileProcessed', result);
    }
  }

  private async readFile(filePath: string, specification: ProcessingSpecification): Promise<any> {
    const encoding = specification.encoding || 'utf8';
    const content = fs.readFileSync(filePath, encoding);

    switch (specification.processingType) {
      case 'csv':
        return this.parseCSV(content, specification);
      case 'json':
        return JSON.parse(content);
      case 'xml':
        // Implémentation simple pour XML
        return content;
      case 'excel':
        // Nécessiterait une bibliothèque comme xlsx
        throw new Error('Support Excel non encore implémenté');
      default:
        return content;
    }
  }

  private parseCSV(content: string, specification: ProcessingSpecification): any[] {
    const delimiter = specification.delimiter || ';';
    const lines = content.split('\n').filter(line => line.trim());
    
    if (lines.length === 0) return [];

    const headers = lines[0].split(delimiter).map(h => h.trim());
    const data = [];

    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(delimiter);
      const row: any = {};
      
      headers.forEach((header, index) => {
        row[header] = values[index]?.trim() || '';
      });
      
      data.push(row);
    }

    return data;
  }

  private async applyTransformations(data: any, specification: ProcessingSpecification): Promise<any> {
    if (!specification.transformations) {
      return data;
    }

    let processedData = data;

    for (const transformation of specification.transformations) {
      processedData = await this.applyTransformation(processedData, transformation);
    }

    return processedData;
  }

  private async applyTransformation(data: any, transformation: any): Promise<any> {
    switch (transformation.type) {
      case 'format':
        return this.formatData(data, transformation);
      case 'validate':
        return this.validateData(data, transformation);
      case 'transform':
        return this.transformData(data, transformation);
      default:
        return data;
    }
  }

  private formatData(data: any, transformation: any): any {
    // Implémentation basique du formatage
    if (Array.isArray(data)) {
      return data.map(item => {
        if (transformation.field && item[transformation.field]) {
          // Appliquer le formatage selon l'action
          switch (transformation.action) {
            case 'uppercase':
              item[transformation.field] = item[transformation.field].toUpperCase();
              break;
            case 'lowercase':
              item[transformation.field] = item[transformation.field].toLowerCase();
              break;
            case 'trim':
              item[transformation.field] = item[transformation.field].trim();
              break;
          }
        }
        return item;
      });
    }
    return data;
  }

  private validateData(data: any, transformation: any): any {
    // Implémentation basique de validation
    if (Array.isArray(data)) {
      return data.filter(item => {
        if (transformation.field && item[transformation.field]) {
          switch (transformation.action) {
            case 'notEmpty':
              return item[transformation.field].trim() !== '';
            case 'isNumber':
              return !isNaN(Number(item[transformation.field]));
            case 'isEmail':
              const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
              return emailRegex.test(item[transformation.field]);
          }
        }
        return true;
      });
    }
    return data;
  }

  private transformData(data: any, transformation: any): any {
    // Implémentation basique de transformation
    if (Array.isArray(data)) {
      return data.map(item => {
        if (transformation.field && item[transformation.field]) {
          switch (transformation.action) {
            case 'replace':
              const { search, replace } = transformation.params || {};
              if (search && replace) {
                item[transformation.field] = item[transformation.field].replace(new RegExp(search, 'g'), replace);
              }
              break;
            case 'extract':
              const { regex, group } = transformation.params || {};
              if (regex) {
                const match = item[transformation.field].match(new RegExp(regex));
                if (match && match[group || 1]) {
                  item[transformation.field] = match[group || 1];
                }
              }
              break;
          }
        }
        return item;
      });
    }
    return data;
  }

  private async generateOutput(data: any, specification: ProcessingSpecification, originalFileName: string): Promise<string> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const baseName = path.parse(originalFileName).name;
    
    let outputPath = specification.outputPath || path.join(this.watchPath, 'processed');
    
    // Créer le dossier de sortie s'il n'existe pas
    if (!fs.existsSync(outputPath)) {
      fs.mkdirSync(outputPath, { recursive: true });
    }

    switch (specification.outputFormat) {
      case 'json':
        const jsonPath = path.join(outputPath, `${baseName}_processed_${timestamp}.json`);
        fs.writeFileSync(jsonPath, JSON.stringify(data, null, 2));
        return jsonPath;
      
      case 'csv':
        const csvPath = path.join(outputPath, `${baseName}_processed_${timestamp}.csv`);
        const csvContent = this.convertToCSV(data, specification.delimiter || ';');
        fs.writeFileSync(csvPath, csvContent);
        return csvPath;
      
      case 'database':
        // Ici on pourrait insérer dans la base de données
        console.log('Insertion en base de données non encore implémentée');
        return '';
      
      default:
        const defaultPath = path.join(outputPath, `${baseName}_processed_${timestamp}.txt`);
        fs.writeFileSync(defaultPath, JSON.stringify(data, null, 2));
        return defaultPath;
    }
  }

  private convertToCSV(data: any[], delimiter: string = ';'): string {
    if (!Array.isArray(data) || data.length === 0) {
      return '';
    }

    const headers = Object.keys(data[0]);
    const csvLines = [headers.join(delimiter)];

    for (const row of data) {
      const values = headers.map(header => {
        const value = row[header] || '';
        // Échapper les valeurs contenant le délimiteur
        return value.toString().includes(delimiter) ? `"${value}"` : value;
      });
      csvLines.push(values.join(delimiter));
    }

    return csvLines.join('\n');
  }

  // Méthodes publiques pour gérer les spécifications
  public addSpecification(specification: ProcessingSpecification): void {
    this.specifications.set(specification.id, specification);
    console.log(`Spécification ajoutée: ${specification.name}`);
  }

  public updateSpecification(id: string, specification: Partial<ProcessingSpecification>): boolean {
    const existing = this.specifications.get(id);
    if (!existing) {
      return false;
    }

    const updated = { ...existing, ...specification, updatedAt: new Date() };
    this.specifications.set(id, updated);
    console.log(`Spécification mise à jour: ${updated.name}`);
    return true;
  }

  public removeSpecification(id: string): boolean {
    const removed = this.specifications.delete(id);
    if (removed) {
      console.log(`Spécification supprimée: ${id}`);
    }
    return removed;
  }

  public getSpecifications(): ProcessingSpecification[] {
    return Array.from(this.specifications.values());
  }

  public getSpecification(id: string): ProcessingSpecification | undefined {
    return this.specifications.get(id);
  }

  public getWatchPath(): string {
    return this.watchPath;
  }

  public getProcessingStatus(): { isProcessing: boolean; queueLength: number } {
    return {
      isProcessing: this.isProcessing,
      queueLength: this.processingQueue.length
    };
  }

  // Analyser un fichier pour obtenir ses colonnes et données d'exemple
  public async analyzeFile(filePath: string): Promise<{
    fileName: string;
    filePath: string;
    columns: string[];
    sampleData: any[];
    fileType: 'csv' | 'excel' | 'json';
    recordCount: number;
  }> {
    try {
      console.log(`🔍 Analyse du fichier: ${filePath}`);
      
      if (!fs.existsSync(filePath)) {
        throw new Error(`Fichier non trouvé: ${filePath}`);
      }

      const fileName = path.basename(filePath);
      const fileExtension = path.extname(fileName).toLowerCase();
      let columns: string[] = [];
      let sampleData: any[] = [];
      let recordCount = 0;

      if (fileExtension === '.csv') {
        const content = fs.readFileSync(filePath, 'utf-8');
        const lines = content.split('\n').filter(line => line.trim());
        
        if (lines.length > 0) {
          // Détecter le délimiteur
          const delimiter = content.includes(';') ? ';' : ',';
          
          // Détecter si c'est un fichier Orange Money
          const orangeMoneyDetection = this.detectOrangeMoneyFile(content, delimiter);
          
          if (orangeMoneyDetection.isOrangeMoney) {
            console.log('🟠 Fichier Orange Money détecté dans l\'analyse');
            const dataRows = lines.slice(orangeMoneyDetection.headerRowIndex + 1);
            const headerRow = lines[orangeMoneyDetection.headerRowIndex];
            columns = headerRow.split(delimiter).map(col => col.trim());
            sampleData = dataRows.slice(0, 2).map(line => {
              const values = line.split(delimiter);
              const obj: any = {};
              columns.forEach((col, idx) => {
                obj[col] = values[idx] || '';
              });
              return obj;
            });
            recordCount = dataRows.length;
          } else {
            // Traitement normal pour les autres fichiers CSV
            const headerLine = lines[0];
            columns = headerLine.split(delimiter).map(col => col.trim());
            sampleData = lines.slice(1, 3).map(line => {
              const values = line.split(delimiter);
              const obj: any = {};
              columns.forEach((col, idx) => {
                obj[col] = values[idx] || '';
              });
              return obj;
            });
            recordCount = lines.length - 1;
          }
        }
             } else if (fileExtension === '.xls' || fileExtension === '.xlsx') {
         // Traitement Excel avec détection d'en-têtes
         console.log('🔄 Analyse fichier Excel avec détection d\'en-têtes');
         console.log(`📁 Chemin du fichier: ${filePath}`);
         
         const XLSX = require('xlsx');
         const workbook = XLSX.readFile(filePath);
         const sheetName = workbook.SheetNames[0];
         const worksheet = workbook.Sheets[sheetName];
         
         console.log(`📋 Nom de la feuille: ${sheetName}`);
         
         // Conversion en tableau de tableaux pour analyse
         const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
         if (jsonData.length === 0) {
           throw new Error('Fichier Excel vide');
         }
         
         console.log(`📊 Données Excel brutes: ${jsonData.length} lignes`);
         console.log(`🔍 Premières 5 lignes:`, jsonData.slice(0, 5));
         
         // Détecter les en-têtes
         const headerDetection = this.detectExcelHeaders(jsonData);
         const headers = headerDetection.headerRow;
         const headerRowIndex = headerDetection.headerRowIndex;
         
         console.log(`✅ En-têtes détectés à la ligne ${headerRowIndex}:`, headers);
        
        // Vérifier si des en-têtes valides ont été trouvés
        if (!headers || headers.length === 0 || headers.every(h => !h || h.trim() === '')) {
          console.log('⚠️ Aucun en-tête valide détecté, utilisation de la première ligne');
          const fallbackHeaders = jsonData[0]?.map((h, idx) => h || `Col${idx + 1}`) || [];
          const correctedHeaders = this.fixExcelColumnNames(fallbackHeaders);
          
          // Créer les lignes de données
          const rows: any[] = [];
          for (let i = 1; i < jsonData.length; i++) {
            const rowData = jsonData[i];
            if (!rowData || rowData.length === 0) continue;
            
            const row: any = {};
            correctedHeaders.forEach((header: string, index: number) => {
              const value = rowData[index];
              row[header] = value !== undefined && value !== null ? value : '';
            });
            rows.push(row);
          }
          
          columns = correctedHeaders;
          sampleData = rows.slice(0, 2);
          recordCount = rows.length;
        } else {
          // Corriger les caractères spéciaux dans les en-têtes
          const correctedHeaders = this.fixExcelColumnNames(headers);
          console.log(`🔧 En-têtes Excel corrigés:`, correctedHeaders);
          
          // Créer les lignes de données en commençant après la ligne d'en-tête
          const rows: any[] = [];
          for (let i = headerRowIndex + 1; i < jsonData.length; i++) {
            const rowData = jsonData[i];
            if (!rowData || rowData.length === 0) continue;
            
            const row: any = {};
            correctedHeaders.forEach((header: string, index: number) => {
              const value = rowData[index];
              row[header] = value !== undefined && value !== null ? value : '';
            });
            rows.push(row);
          }
          
          console.log(`📊 Lignes de données créées: ${rows.length}`);
          
          columns = correctedHeaders;
          sampleData = rows.slice(0, 2);
          recordCount = rows.length;
        }
      } else {
        throw new Error(`Type de fichier non supporté: ${fileExtension}`);
      }

      const fileType = fileExtension === '.csv' ? 'csv' : 
                      (fileExtension === '.xls' || fileExtension === '.xlsx') ? 'excel' : 'json';

      console.log(`✅ Analyse terminée: ${fileName} - ${columns.length} colonnes, ${recordCount} lignes`);
      
      return {
        fileName,
        filePath,
        columns,
        sampleData,
        fileType,
        recordCount
      };
    } catch (error) {
      console.error(`❌ Erreur lors de l'analyse du fichier ${filePath}:`, error);
      throw error;
    }
  }

  // Méthode pour détecter les fichiers Orange Money
  private detectOrangeMoneyFile(csvContent: string, delimiter: string): { isOrangeMoney: boolean; headerRowIndex: number; headerRow: string[] } {
    const lines = csvContent.split('\n').filter((line: string) => line.trim());
    let headerRowIndex = -1;
    let headerRow: string[] = [];

    // Parcourir les lignes pour trouver la première colonne commençant par "N°"
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const columns = line.split(delimiter).map((col: string) => col.trim());
      
      // Vérifier si la première colonne commence par "N°"
      if (columns.length > 0 && columns[0].startsWith('N°')) {
        headerRowIndex = i;
        headerRow = columns;
        console.log(`🔍 Fichier Orange Money détecté - Ligne d'en-tête trouvée à l'index ${i}:`, columns);
        break;
      }
    }

    const isOrangeMoney = headerRowIndex !== -1;
    
    if (isOrangeMoney) {
      console.log(`📊 Fichier Orange Money détecté - Ignorer les lignes 0 à ${headerRowIndex - 1}`);
    }

    return { isOrangeMoney, headerRowIndex, headerRow };
  }

     // Méthode pour détecter les en-têtes dans les fichiers Excel
   private detectExcelHeaders(jsonData: any[][]): { headerRowIndex: number; headerRow: string[] } {
     console.log('🔄 DÉTECTION DES EN-TÊTES EXCEL - MÉTHODE APPELÉE');
    
    // Mots-clés pour identifier les en-têtes
    const headerKeywords = [
      'N°', 'Date', 'Heure', 'Référence', 'Service', 'Paiement', 'Statut', 'Mode',
      'Compte', 'Wallet', 'Pseudo', 'Débit', 'Crédit', 'Montant', 'Commissions',
      'Opération', 'Agent', 'Correspondant', 'Sous-réseau', 'Transaction'
    ];
    
    let bestHeaderRowIndex = 0;
    let bestScore = 0;
    let bestHeaderRow: string[] = [];
    
    // Analyser plus de lignes pour trouver le meilleur candidat (jusqu'à 200 lignes)
    const maxRowsToCheck = Math.min(200, jsonData.length);
    
    console.log(`🔍 Analyse de ${maxRowsToCheck} lignes sur ${jsonData.length} lignes totales`);
    
    let emptyRowCount = 0;
    let consecutiveEmptyRows = 0;
    
    for (let i = 0; i < maxRowsToCheck; i++) {
      try {
        console.log(`🔍 === DÉBUT ANALYSE LIGNE ${i} ===`);
        const row = jsonData[i];
        if (!row || row.length === 0) {
          emptyRowCount++;
          consecutiveEmptyRows++;
          console.log(`🔍 Ligne ${i}: ligne vide ou null, ignorée (total vide: ${emptyRowCount}, consécutives: ${consecutiveEmptyRows})`);
          continue;
        }
        
        // Réinitialiser le compteur de lignes vides consécutives
        consecutiveEmptyRows = 0;
        
        // Convertir la ligne en chaînes et nettoyer
        const rowStrings = row.map((cell: any) => {
          if (cell === null || cell === undefined) return '';
          return String(cell).trim();
        });
        
        console.log(`🔍 Ligne ${i} - Nombre de cellules: ${rowStrings.length}, Cellules non vides: ${rowStrings.filter(cell => cell !== '').length}`);
        
                 // Ignorer les lignes qui sont clairement des en-têtes de document
         const documentHeaders = [
           'Relevé de vos opérations', 'Application :', 'Compte Orange Money :', 'Début de Période :', 
           'Fin de Période :', 'Réseau :', 'Cameroon', 'Transactions réussies',
           'Wallet commission', 'Total', 'Total activités', 'Orange Money'
         ];
        const isDocumentHeader = documentHeaders.some(header => 
          rowStrings.some(cell => cell.includes(header))
        );
        
        if (isDocumentHeader) {
          console.log(`🔍 Ligne ${i} ignorée (en-tête de document):`, rowStrings.filter(cell => cell !== ''));
          continue;
        }
        
        // Ignorer les lignes qui contiennent principalement des données numériques (pas des en-têtes)
        const numericCells = rowStrings.filter(cell => {
          if (cell === '') return false;
          return !isNaN(Number(cell)) && cell.length > 0;
        });
        
        if (numericCells.length > rowStrings.filter(cell => cell !== '').length * 0.7) {
          console.log(`🔍 Ligne ${i} ignorée (données numériques):`, rowStrings.filter(cell => cell !== ''));
          continue;
        }
        
        // Log pour voir toutes les lignes analysées
        console.log(`🔍 Analyse ligne ${i}:`, rowStrings.filter(cell => cell !== ''));
        
        // Afficher aussi les lignes suivantes pour voir la structure
        if (i < maxRowsToCheck - 1) {
          const nextRow = jsonData[i + 1];
          if (nextRow && nextRow.length > 0) {
            const nextRowStrings = nextRow.map((cell: any) => {
              if (cell === null || cell === undefined) return '';
              return String(cell).trim();
            });
            console.log(`🔍 Ligne suivante ${i + 1}:`, nextRowStrings.filter(cell => cell !== ''));
          }
        }
        
        // Calculer le score pour cette ligne
        let score = 0;
        let hasNumberColumn = false;
        let nonEmptyColumns = 0;
        let hasHeaderKeywords = false;
        let keywordMatches = 0;
        
        for (let j = 0; j < rowStrings.length; j++) {
          const cell = rowStrings[j];
          if (cell === '') continue;
          
          nonEmptyColumns++;
          
                     // Vérifier si c'est une colonne "N°"
           if (cell.startsWith('N°') || cell === 'N' || cell.includes('N°')) {
             hasNumberColumn = true;
             score += 30; // Bonus important pour "N°"
           }
          
          // Vérifier les mots-clés d'en-tête
          for (const keyword of headerKeywords) {
            if (cell.toLowerCase().includes(keyword.toLowerCase())) {
              score += 8;
              hasHeaderKeywords = true;
              keywordMatches++;
            }
          }
          
          // Bonus spécial pour les lignes avec plusieurs colonnes "N°"
          if (cell.includes('N°')) {
            score += 5; // Bonus supplémentaire pour chaque colonne "N°"
          }
          
          // Bonus pour les colonnes qui ressemblent à des en-têtes
          if (cell.length > 0 && cell.length < 50 && 
              (cell.includes(' ') || cell.includes('(') || cell.includes(')') || 
               cell.includes(':') || cell.includes('-') || cell.includes('_'))) {
            score += 3;
          }
          
          // Bonus pour les colonnes avec des caractères spéciaux (typiques des en-têtes)
          if (cell.includes('é') || cell.includes('è') || cell.includes('à') || 
              cell.includes('ç') || cell.includes('ù') || cell.includes('ô')) {
            score += 4;
          }
        }
        
        // Bonus pour avoir une colonne "N°" et plusieurs colonnes non vides
        if (hasNumberColumn && nonEmptyColumns >= 3) {
          score += 30;
        }
        
        // Bonus pour avoir des mots-clés d'en-tête
        if (hasHeaderKeywords && nonEmptyColumns >= 2) {
          score += 15;
        }
        
                 // Bonus pour avoir plusieurs mots-clés
         if (keywordMatches >= 3) {
           score += 20;
         }
         
         // Bonus spécial pour les lignes qui ressemblent exactement aux en-têtes Orange Money
         const orangeMoneyHeaders = ['N°', 'Date', 'Heure', 'Référence', 'Service', 'Paiement', 'Statut', 'Mode', 'N° de Compte', 'Wallet', 'N° Pseudo', 'Débit', 'Crédit', 'Compte:', 'Sous-réseau'];
         const matchingHeaders = orangeMoneyHeaders.filter(header => 
           rowStrings.some(cell => cell.includes(header))
         );
         if (matchingHeaders.length >= 8) {
           score += 50; // Bonus très important pour les vraies en-têtes Orange Money
           console.log(`🔍 LIGNE ORANGE MONEY DÉTECTÉE ${i}: ${matchingHeaders.length} en-têtes correspondants`);
         }
        
        // Score de base pour les lignes avec plusieurs colonnes non vides
        if (nonEmptyColumns >= 3) {
          score += 8;
        }
        
        // Pénalité réduite pour les lignes avec peu de colonnes non vides
        if (nonEmptyColumns < 2) {
          score -= 3; // Réduit encore plus
        }
        
                 console.log(`🔍 LIGNE ${i}: score=${score}, colonnes=${nonEmptyColumns}, hasNumberColumn=${hasNumberColumn}, hasHeaderKeywords=${hasHeaderKeywords}, keywordMatches=${keywordMatches}`);
        
        // Log spécial pour les lignes avec beaucoup de colonnes non vides
        if (nonEmptyColumns >= 5) {
          console.log(`🔍 LIGNE INTÉRESSANTE ${i}: ${nonEmptyColumns} colonnes non vides:`, rowStrings.filter(cell => cell !== ''));
        }
        
        if (score > bestScore) {
          bestScore = score;
          bestHeaderRowIndex = i;
          bestHeaderRow = [...rowStrings];
          console.log(`🔍 ⭐ Nouveau meilleur en-tête trouvé à la ligne ${i} avec score ${score}`);
        }
        
        // Continuer l'analyse même après avoir trouvé un en-tête valide
        if (score > 0) {
          console.log(`🔍 En-tête potentiel à la ligne ${i} avec score ${score}`);
        }
        
        console.log(`🔍 === FIN ANALYSE LIGNE ${i} ===`);
      } catch (error) {
        console.error(`❌ Erreur lors de l'analyse de la ligne ${i}:`, error);
        continue;
      }
    }
    
    console.log(`🔍 Meilleur en-tête trouvé à la ligne ${bestHeaderRowIndex} avec score ${bestScore}`);
    console.log(`🔍 En-tête détecté:`, bestHeaderRow);
    
    // Fallback : si aucun en-tête valide n'est trouvé, utiliser la première ligne non vide
    if (bestScore <= 0) {
      console.log('⚠️ Aucun en-tête valide détecté, utilisation de la première ligne non vide');
      for (let i = 0; i < jsonData.length; i++) {
        const row = jsonData[i];
        if (row && row.length > 0) {
          const rowStrings = row.map((cell: any) => {
            if (cell === null || cell === undefined) return '';
            return String(cell).trim();
          });
          
          const nonEmptyCount = rowStrings.filter(cell => cell !== '').length;
          if (nonEmptyCount >= 2) {
            console.log(`🔍 Fallback: utilisation de la ligne ${i} avec ${nonEmptyCount} colonnes non vides`);
            return {
              headerRowIndex: i,
              headerRow: rowStrings
            };
          }
        }
      }
    }
    
    return {
      headerRowIndex: bestHeaderRowIndex,
      headerRow: bestHeaderRow
    };
  }

  // Méthode pour corriger les caractères spéciaux dans les en-têtes Excel
  private fixExcelColumnNames(columns: string[]): string[] {
    return columns.map((col: string) => {
      if (!col) return col;
      
      // Corrections spécifiques pour les fichiers Excel
      let corrected = col;
      
      // Corriger "Opration" -> "Opération"
      if (corrected.includes('Opration')) {
        corrected = corrected.replace(/Opration/g, 'Opération');
      }
      
      // Corriger "Montant (XAF)" -> "Montant (XAF)"
      if (corrected.includes('Montant') && corrected.includes('XAF')) {
        corrected = corrected.replace(/Montant\s*\(XAF\)/g, 'Montant (XAF)');
      }
      
      // Corriger "Commissions (XAF)" -> "Commissions (XAF)"
      if (corrected.includes('Commissions') && corrected.includes('XAF')) {
        corrected = corrected.replace(/Commissions\s*\(XAF\)/g, 'Commissions (XAF)');
      }
      
      // Corriger "N° de Compte" -> "N° de Compte"
      if (corrected.includes('N°') && corrected.includes('Compte')) {
        corrected = corrected.replace(/N°\s*de\s*Compte/g, 'N° de Compte');
      }
      
      // Corriger "N° Pseudo" -> "N° Pseudo"
      if (corrected.includes('N°') && corrected.includes('Pseudo')) {
        corrected = corrected.replace(/N°\s*Pseudo/g, 'N° Pseudo');
      }
      
      return corrected;
    });
  }

  // Obtenir la liste des fichiers disponibles avec leurs colonnes
  public async getAvailableFiles(): Promise<{
    fileName: string;
    filePath: string;
    columns: string[];
    sampleData: any[];
    fileType: 'csv' | 'excel' | 'json';
    recordCount: number;
  }[]> {
    try {
      console.log('🔍 Récupération des fichiers disponibles');
      
      if (!fs.existsSync(this.watchPath)) {
        console.log('⚠️ Dossier de surveillance non trouvé:', this.watchPath);
        return [];
      }

      const files = fs.readdirSync(this.watchPath);
      const availableFiles = [];

      for (const fileName of files) {
        // Ignorer les fichiers cachés et les dossiers
        if (fileName.startsWith('.') || fileName === 'processed') {
          continue;
        }

        const filePath = path.join(this.watchPath, fileName);
        const stats = fs.statSync(filePath);
        
        // Ignorer les dossiers
        if (stats.isDirectory()) {
          continue;
        }

        try {
          console.log(`🔍 Analyse du fichier: ${fileName}`);
          const fileModel = await this.analyzeFile(filePath);
          availableFiles.push(fileModel);
        } catch (error) {
          console.error(`❌ Erreur lors de l'analyse de ${fileName}:`, error);
          // Ajouter le fichier avec des colonnes par défaut en cas d'erreur
          availableFiles.push({
            fileName,
            filePath,
            columns: ['date', 'montant', 'description', 'reference'],
            sampleData: [],
            fileType: 'csv',
            recordCount: 0
          });
        }
      }

      console.log(`✅ ${availableFiles.length} fichiers analysés avec succès`);
      return availableFiles;
    } catch (error) {
      console.error('❌ Erreur lors de la récupération des fichiers disponibles:', error);
      return [];
    }
  }
} 