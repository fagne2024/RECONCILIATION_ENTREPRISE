import { Injectable } from '@angular/core';
import { FieldTypeDetectionService, FieldTypeInfo, ColumnAnalysis } from './field-type-detection.service';
import { I18nService } from './i18n/i18n.service';

export interface ExcelColumnInfo {
  columnName: string;
  originalName: string;
  type: 'text' | 'number' | 'date' | 'amount' | 'boolean' | 'unknown';
  confidence: number;
  format?: string;
  locale?: string;
  currency?: string;
  decimalPlaces?: number;
  dateFormat?: string;
  suggestions?: string[];
  sampleValues: any[];
  nullCount: number;
  uniqueCount: number;
  totalCount: number;
  minValue?: any;
  maxValue?: any;
  averageValue?: number;
  // Propriétés spécifiques Excel
  excelDataType?: 'string' | 'number' | 'date' | 'boolean' | 'error' | 'formula';
  cellFormat?: string;
  hasFormulas?: boolean;
  hasErrors?: boolean;
  precision?: number;
  scale?: number;
}

export interface ExcelFileAnalysis {
  fileName: string;
  fileType: 'xlsx' | 'xls' | 'xlsm' | 'xlsb';
  sheetCount: number;
  activeSheet: string;
  totalRows: number;
  totalColumns: number;
  columns: ExcelColumnInfo[];
  dataQuality: {
    completeness: number;
    consistency: number;
    accuracy: number;
    issues: string[];
  };
  recommendations: ExcelFormattingRecommendation[];
}

export interface ExcelFormattingRecommendation {
  columnName: string;
  priority: 'high' | 'medium' | 'low';
  type: 'format' | 'validate' | 'transform' | 'clean';
  action: string;
  description: string;
  impact: string;
  confidence: number;
  params?: any;
}

@Injectable({
  providedIn: 'root'
})
export class ExcelTypeDetectionService {

  // Patterns spécifiques Excel pour la détection de types
  private readonly excelPatterns = {
    // Patterns pour les dates Excel
    datePatterns: [
      /^\d{1,2}\/\d{1,2}\/\d{2,4}$/, // DD/MM/YYYY
      /^\d{4}-\d{1,2}-\d{1,2}$/, // YYYY-MM-DD
      /^\d{1,2}-\d{1,2}-\d{2,4}$/, // DD-MM-YYYY
      /^\d{1,2}\.\d{1,2}\.\d{2,4}$/, // DD.MM.YYYY
      /^\d{1,2}\s+\w+\s+\d{2,4}$/, // DD Month YYYY
      /^\d{2}\/\d{2}\/\d{4}$/, // MM/DD/YYYY
      /^\d{1,2}:\d{2}:\d{2}$/, // HH:MM:SS
      /^\d{1,2}:\d{2}$/, // HH:MM
      /^\d{1,2}:\d{2}:\d{2}\s+\d{1,2}\/\d{1,2}\/\d{2,4}$/, // HH:MM:SS DD/MM/YYYY
    ],
    
    // Patterns pour les montants Excel
    amountPatterns: [
      /^[\d\s,]+\.?\d*$/, // 1,234.56 ou 1 234,56
      /^[\d\s,]+,\d*$/, // 1,234,56
      /^[\d\s]+\.\d{2}$/, // 1234.56
      /^[\d\s]+,\d{2}$/, // 1234,56
      /^[\d\s,]+\.?\d*\s*[€$£¥₦₩₪₨₴₸₺₼₾₿]$/, // Avec symbole monétaire
      /^[\d\s,]+\.?\d*\s*[A-Z]{3}$/, // Avec code devise (EUR, USD, etc.)
      /^[\d\s,]+\.?\d*\s*\([A-Z]{3}\)$/, // Avec code devise entre parenthèses
    ],
    
    // Patterns pour les nombres Excel
    numberPatterns: [
      /^\d+$/, // Entiers
      /^\d+\.\d+$/, // Décimaux avec point
      /^\d+,\d+$/, // Décimaux avec virgule
      /^[\d\s,]+\.?\d*$/, // Nombres avec espaces et virgules
      /^[\d\s,]+,\d*$/, // Nombres avec espaces et virgules (format européen)
      /^-?\d+\.?\d*$/, // Nombres négatifs
      /^-?[\d\s,]+\.?\d*$/, // Nombres négatifs avec espaces
    ],
    
    // Patterns pour les booléens Excel
    booleanPatterns: [
      /^(true|false|oui|non|yes|no|1|0)$/i,
      /^(vrai|faux|y|n|t|f)$/i,
      /^(v|f|o|n)$/i, // Abréviations françaises
    ],
    
    // Patterns pour les formules Excel
    formulaPatterns: [
      /^=.*$/, // Commence par =
      /^\+.*$/, // Commence par +
      /^-.*$/, // Commence par -
      /^@.*$/, // Commence par @ (formules Excel 365)
    ],
    
    // Patterns pour les erreurs Excel
    errorPatterns: [
      /^#N\/A$/i,
      /^#VALUE!$/i,
      /^#REF!$/i,
      /^#DIV\/0!$/i,
      /^#NUM!$/i,
      /^#NAME\?$/i,
      /^#NULL!$/i,
    ],
  };

  // Formats de date Excel courants
  private readonly excelDateFormats = [
    'DD/MM/YYYY',
    'MM/DD/YYYY', 
    'YYYY-MM-DD',
    'DD-MM-YYYY',
    'DD.MM.YYYY',
    'DD MMM YYYY',
    'MM/DD/YY',
    'DD/MM/YY',
    'HH:MM:SS',
    'HH:MM',
    'DD/MM/YYYY HH:MM',
    'DD/MM/YYYY HH:MM:SS'
  ];

  // Devises courantes avec codes Excel
  private readonly excelCurrencies = {
    '€': 'EUR',
    '$': 'USD', 
    '£': 'GBP',
    '¥': 'JPY',
    '₦': 'NGN',
    '₩': 'KRW',
    '₪': 'ILS',
    '₨': 'INR',
    '₴': 'UAH',
    '₸': 'KZT',
    '₺': 'TRY',
    '₼': 'AZN',
    '₾': 'GEL',
    '₿': 'BTC',
    'XAF': 'XAF',
    'XOF': 'XOF',
    'EUR': 'EUR',
    'USD': 'USD',
    'GBP': 'GBP'
  };

  constructor(
    private fieldTypeDetectionService: FieldTypeDetectionService
  ) {}

  /**
   * Analyse complète d'un fichier Excel pour détecter les types et formats
   */
  analyzeExcelFile(data: any[], fileName: string): ExcelFileAnalysis {
    console.log('🔍 Début de l\'analyse Excel pour:', fileName);
    
    if (data.length === 0) {
      return this.createEmptyAnalysis(fileName);
    }

    // Analyser chaque colonne
    const columns = Object.keys(data[0]);
    const excelColumns: ExcelColumnInfo[] = [];

    for (const columnName of columns) {
      const values = data.map(row => row[columnName]);
      const columnInfo = this.analyzeExcelColumn(columnName, values);
      excelColumns.push(columnInfo);
    }

    // Analyser la qualité des données
    const dataQuality = this.analyzeDataQuality(data, excelColumns);

    // Générer les recommandations
    const recommendations = this.generateExcelRecommendations(excelColumns, dataQuality);

    const analysis: ExcelFileAnalysis = {
      fileName,
      fileType: this.detectExcelFileType(fileName),
      sheetCount: 1, // Par défaut, on analyse la première feuille
      activeSheet: 'Sheet1',
      totalRows: data.length,
      totalColumns: columns.length,
      columns: excelColumns,
      dataQuality,
      recommendations
    };

    console.log('✅ Analyse Excel terminée:', analysis);
    return analysis;
  }

  /**
   * Analyse une colonne Excel spécifique
   */
  private analyzeExcelColumn(columnName: string, values: any[]): ExcelColumnInfo {
    const nonNullValues = values.filter(v => v !== null && v !== undefined && v !== '');
    const nullCount = values.length - nonNullValues.length;
    const uniqueValues = [...new Set(nonNullValues)];
    
    // Détection basique des types
    const basicTypeInfo = this.fieldTypeDetectionService.detectFieldType(columnName, nonNullValues);
    
    // Détection spécifique Excel
    const excelTypeInfo = this.detectExcelSpecificTypes(columnName, nonNullValues);
    
    // Combiner les détections
    const finalTypeInfo = this.combineExcelTypeDetections(basicTypeInfo, excelTypeInfo);
    
    // Analyser les propriétés Excel spécifiques
    const excelProperties = this.analyzeExcelProperties(nonNullValues);
    
    // Calculs statistiques
    const statistics = this.calculateColumnStatistics(nonNullValues, finalTypeInfo.type);
    
    const columnInfo: ExcelColumnInfo = {
      columnName,
      originalName: columnName,
      type: finalTypeInfo.type,
      confidence: finalTypeInfo.confidence,
      format: finalTypeInfo.format,
      locale: finalTypeInfo.locale,
      currency: finalTypeInfo.currency,
      decimalPlaces: finalTypeInfo.decimalPlaces,
      dateFormat: finalTypeInfo.dateFormat,
      suggestions: finalTypeInfo.suggestions,
      sampleValues: nonNullValues.slice(0, 10),
      nullCount,
      uniqueCount: uniqueValues.length,
      totalCount: values.length,
      minValue: statistics.minValue,
      maxValue: statistics.maxValue,
      averageValue: statistics.averageValue,
      excelDataType: excelProperties.dataType,
      cellFormat: excelProperties.cellFormat,
      hasFormulas: excelProperties.hasFormulas,
      hasErrors: excelProperties.hasErrors,
      precision: excelProperties.precision,
      scale: excelProperties.scale
    };

    return columnInfo;
  }

  /**
   * Détecte les types spécifiques Excel
   */
  private detectExcelSpecificTypes(columnName: string, values: any[]): FieldTypeInfo {
    if (values.length === 0) {
      return { type: 'unknown', confidence: 0 };
    }

    const typeCounts = {
      date: 0,
      amount: 0,
      number: 0,
      boolean: 0,
      text: 0,
      formula: 0,
      error: 0
    };

    let totalValidValues = 0;

    for (const value of values) {
      const stringValue = String(value).trim();
      
      if (this.isExcelDate(stringValue)) {
        typeCounts.date++;
        totalValidValues++;
      } else if (this.isExcelAmount(stringValue)) {
        typeCounts.amount++;
        totalValidValues++;
      } else if (this.isExcelNumber(stringValue)) {
        typeCounts.number++;
        totalValidValues++;
      } else if (this.isExcelBoolean(stringValue)) {
        typeCounts.boolean++;
        totalValidValues++;
      } else if (this.isExcelFormula(stringValue)) {
        typeCounts.formula++;
        totalValidValues++;
      } else if (this.isExcelError(stringValue)) {
        typeCounts.error++;
        totalValidValues++;
      } else {
        typeCounts.text++;
        totalValidValues++;
      }
    }

    // Déterminer le type dominant
    let dominantType = 'text';
    let maxCount = typeCounts.text;

    for (const [type, count] of Object.entries(typeCounts)) {
      if (count > maxCount) {
        dominantType = type;
        maxCount = count;
      }
    }

    const confidence = totalValidValues > 0 ? maxCount / totalValidValues : 0;

    return {
      type: dominantType as any,
      confidence,
      format: this.getExcelDefaultFormat(dominantType),
      suggestions: this.getExcelSuggestions(dominantType)
    };
  }

  /**
   * Combine les détections de types Excel
   */
  private combineExcelTypeDetections(basic: FieldTypeInfo, excel: FieldTypeInfo): FieldTypeInfo {
    // Si la détection Excel a une forte confiance, l'utiliser
    if (excel.confidence > 0.8) {
      return excel;
    }

    // Si la détection basique a une forte confiance, l'utiliser
    if (basic.confidence > 0.7) {
      return basic;
    }

    // Sinon, utiliser une moyenne pondérée
    const combinedConfidence = (basic.confidence + excel.confidence) / 2;
    const finalType = combinedConfidence > 0.5 ? excel.type : 'text';

    return {
      type: finalType,
      confidence: combinedConfidence,
      format: this.getExcelDefaultFormat(finalType),
      suggestions: this.getExcelSuggestions(finalType)
    };
  }

  /**
   * Analyse les propriétés spécifiques Excel
   */
  private analyzeExcelProperties(values: any[]): {
    dataType: 'string' | 'number' | 'date' | 'boolean' | 'error' | 'formula';
    cellFormat: string;
    hasFormulas: boolean;
    hasErrors: boolean;
    precision: number;
    scale: number;
  } {
    let hasFormulas = false;
    let hasErrors = false;
    let precision = 0;
    let scale = 0;
    let dataType: 'string' | 'number' | 'date' | 'boolean' | 'error' | 'formula' = 'string';

    for (const value of values) {
      const stringValue = String(value);
      
      if (this.isExcelFormula(stringValue)) {
        hasFormulas = true;
        dataType = 'formula';
      } else if (this.isExcelError(stringValue)) {
        hasErrors = true;
        dataType = 'error';
      } else if (this.isExcelNumber(stringValue)) {
        const num = parseFloat(stringValue.replace(/[,\s]/g, ''));
        if (!isNaN(num)) {
          const decimalPlaces = this.countDecimalPlaces(num);
          precision = Math.max(precision, stringValue.replace(/[,\s]/g, '').length);
          scale = Math.max(scale, decimalPlaces);
        }
      }
    }

    return {
      dataType,
      cellFormat: this.detectCellFormat(values),
      hasFormulas,
      hasErrors,
      precision,
      scale
    };
  }

  /**
   * Calcule les statistiques d'une colonne
   */
  private calculateColumnStatistics(values: any[], type: string): {
    minValue?: any;
    maxValue?: any;
    averageValue?: number;
  } {
    if (type === 'number' || type === 'amount') {
      const numbers = values.map(v => this.parseExcelNumber(v)).filter(n => !isNaN(n));
      if (numbers.length > 0) {
        return {
          minValue: Math.min(...numbers),
          maxValue: Math.max(...numbers),
          averageValue: numbers.reduce((a, b) => a + b, 0) / numbers.length
        };
      }
    } else if (type === 'date') {
      const dates = values.map(v => new Date(v)).filter(d => !isNaN(d.getTime()));
      if (dates.length > 0) {
        return {
          minValue: new Date(Math.min(...dates.map(d => d.getTime()))),
          maxValue: new Date(Math.max(...dates.map(d => d.getTime()))),
          averageValue: undefined
        };
      }
    }

    return {};
  }

  /**
   * Analyse la qualité des données Excel
   */
  private analyzeDataQuality(data: any[], columns: ExcelColumnInfo[]): {
    completeness: number;
    consistency: number;
    accuracy: number;
    issues: string[];
  } {
    const issues: string[] = [];
    let totalCells = 0;
    let nullCells = 0;
    let inconsistentCells = 0;
    let errorCells = 0;

    for (const column of columns) {
      totalCells += column.totalCount;
      nullCells += column.nullCount;
      
      if (column.hasErrors) {
        errorCells += column.totalCount;
        issues.push(`Colonne "${column.columnName}" contient des erreurs Excel`);
      }
      
      if (column.hasFormulas) {
        issues.push(`Colonne "${column.columnName}" contient des formules Excel`);
      }
    }

    const completeness = totalCells > 0 ? (totalCells - nullCells) / totalCells : 0;
    const consistency = totalCells > 0 ? (totalCells - inconsistentCells) / totalCells : 0;
    const accuracy = totalCells > 0 ? (totalCells - errorCells) / totalCells : 0;

    return {
      completeness,
      consistency,
      accuracy,
      issues
    };
  }

  /**
   * Génère les recommandations de formatage Excel
   */
  private generateExcelRecommendations(columns: ExcelColumnInfo[], dataQuality: any): ExcelFormattingRecommendation[] {
    const recommendations: ExcelFormattingRecommendation[] = [];

    for (const column of columns) {
      if (column.confidence > 0.6) {
        const recommendation = this.createExcelRecommendation(column, dataQuality);
        if (recommendation) {
          recommendations.push(recommendation);
        }
      }
    }

    return recommendations.sort((a, b) => {
      const priorityOrder = { high: 3, medium: 2, low: 1 };
      return priorityOrder[b.priority] - priorityOrder[a.priority];
    });
  }

  /**
   * Crée une recommandation pour une colonne Excel
   */
  private createExcelRecommendation(column: ExcelColumnInfo, dataQuality: any): ExcelFormattingRecommendation | null {
    const recommendations: ExcelFormattingRecommendation[] = [];

    switch (column.type) {
      case 'date':
        recommendations.push({
          columnName: column.columnName,
          priority: 'high',
          type: 'format',
          action: 'normalizeDates',
          description: I18nService.t('MSG.msg.normaliserLesDatesAuFormat', { p0: column.dateFormat || 'DD/MM/YYYY' }),
          impact: 'Améliore la cohérence des dates',
          confidence: column.confidence,
          params: { format: column.dateFormat || 'DD/MM/YYYY' }
        });
        break;

      case 'amount':
        recommendations.push({
          columnName: column.columnName,
          priority: 'high',
          type: 'format',
          action: 'formatCurrency',
          description: I18nService.t('MSG.msg.formaterLesMontantsEnDevise', { p0: column.currency || 'XAF' }),
          impact: 'Améliore la lisibilité des montants',
          confidence: column.confidence,
          params: { currency: column.currency || 'XAF', locale: column.locale || 'fr-FR' }
        });
        break;

      case 'number':
        recommendations.push({
          columnName: column.columnName,
          priority: 'medium',
          type: 'format',
          action: 'normalizeNumbers',
          description: I18nService.t('MSG.msg.normaliserLesNombresAvecSeparateursAppro'),
          impact: 'Améliore la cohérence des nombres',
          confidence: column.confidence,
          params: { decimalPlaces: column.decimalPlaces || 2 }
        });
        break;

      case 'text':
        if (column.nullCount > 0) {
          recommendations.push({
            columnName: column.columnName,
            priority: 'medium',
            type: 'clean',
            action: 'trimSpaces',
            description: I18nService.t('MSG.msg.nettoyerLesEspacesEtCaracteresSpeciaux'),
            impact: 'Améliore la qualité des données textuelles',
            confidence: column.confidence
          });
        }
        break;
    }

    // Recommandations spécifiques Excel
    if (column.hasErrors) {
      recommendations.push({
        columnName: column.columnName,
        priority: 'high',
        type: 'validate',
        action: 'fixExcelErrors',
        description: I18nService.t('MSG.msg.corrigerLesErreursExcelNA'),
        impact: 'Élimine les erreurs de calcul',
        confidence: 0.9
      });
    }

    if (column.hasFormulas) {
      recommendations.push({
        columnName: column.columnName,
        priority: 'medium',
        type: 'transform',
        action: 'evaluateFormulas',
        description: I18nService.t('MSG.msg.evaluerLesFormulesExcelPourObtenir'),
        impact: 'Convertit les formules en valeurs',
        confidence: 0.8
      });
    }

    return recommendations.length > 0 ? recommendations[0] : null;
  }

  // Méthodes utilitaires pour la détection Excel

  private isExcelDate(value: string): boolean {
    for (const pattern of this.excelPatterns.datePatterns) {
      if (pattern.test(value)) {
        return true;
      }
    }
    
    const date = new Date(value);
    return !isNaN(date.getTime()) && date.toString() !== 'Invalid Date';
  }

  private isExcelAmount(value: string): boolean {
    for (const pattern of this.excelPatterns.amountPatterns) {
      if (pattern.test(value)) {
        return true;
      }
    }

    for (const symbol of Object.keys(this.excelCurrencies)) {
      if (value.includes(symbol)) {
        return true;
      }
    }

    return false;
  }

  private isExcelNumber(value: string): boolean {
    for (const pattern of this.excelPatterns.numberPatterns) {
      if (pattern.test(value)) {
        return true;
      }
    }

    const num = parseFloat(value.replace(/[,\s]/g, ''));
    return !isNaN(num);
  }

  private isExcelBoolean(value: string): boolean {
    for (const pattern of this.excelPatterns.booleanPatterns) {
      if (pattern.test(value)) {
        return true;
      }
    }
    return false;
  }

  private isExcelFormula(value: string): boolean {
    for (const pattern of this.excelPatterns.formulaPatterns) {
      if (pattern.test(value)) {
        return true;
      }
    }
    return false;
  }

  private isExcelError(value: string): boolean {
    for (const pattern of this.excelPatterns.errorPatterns) {
      if (pattern.test(value)) {
        return true;
      }
    }
    return false;
  }

  private parseExcelNumber(value: string): number {
    let cleanValue = value.replace(/[^\d.,\-\s]/g, '');
    
    const hasComma = cleanValue.includes(',');
    const hasDot = cleanValue.includes('.');
    
    if (hasComma && hasDot) {
      cleanValue = cleanValue.replace(/\./g, '').replace(',', '.');
    } else if (hasComma && !hasDot) {
      cleanValue = cleanValue.replace(',', '.');
    }
    
    return parseFloat(cleanValue);
  }

  private countDecimalPlaces(num: number): number {
    const str = num.toString();
    const decimalIndex = str.indexOf('.');
    return decimalIndex === -1 ? 0 : str.length - decimalIndex - 1;
  }

  private detectCellFormat(values: any[]): string {
    // Logique pour détecter le format de cellule Excel
    // Pour l'instant, retourner un format par défaut
    return 'General';
  }

  private getExcelDefaultFormat(type: string): string | undefined {
    switch (type) {
      case 'date':
        return 'DD/MM/YYYY';
      case 'amount':
        return 'currency';
      case 'number':
        return 'number';
      case 'boolean':
        return 'boolean';
      default:
        return undefined;
    }
  }

  private getExcelSuggestions(type: string): string[] {
    switch (type) {
      case 'date':
        return [
          'Formater en DD/MM/YYYY',
          'Normaliser les dates Excel',
          'Valider le format de date',
          'Gérer les fuseaux horaires'
        ];
      case 'amount':
        return [
          'Formater en devise locale',
          'Nettoyer les montants Excel',
          'Normaliser les décimales',
          'Gérer les symboles monétaires'
        ];
      case 'number':
        return [
          'Normaliser les nombres Excel',
          'Formater avec séparateurs',
          'Arrondir les décimales',
          'Gérer les formats scientifiques'
        ];
      case 'text':
        return [
          'Nettoyer les caractères Excel',
          'Supprimer les espaces',
          'Normaliser l\'encodage',
          'Gérer les caractères spéciaux'
        ];
      default:
        return [];
    }
  }

  private detectExcelFileType(fileName: string): 'xlsx' | 'xls' | 'xlsm' | 'xlsb' {
    const lowerName = fileName.toLowerCase();
    if (lowerName.endsWith('.xlsx')) return 'xlsx';
    if (lowerName.endsWith('.xls')) return 'xls';
    if (lowerName.endsWith('.xlsm')) return 'xlsm';
    if (lowerName.endsWith('.xlsb')) return 'xlsb';
    return 'xlsx'; // Par défaut
  }

  private createEmptyAnalysis(fileName: string): ExcelFileAnalysis {
    return {
      fileName,
      fileType: this.detectExcelFileType(fileName),
      sheetCount: 0,
      activeSheet: '',
      totalRows: 0,
      totalColumns: 0,
      columns: [],
      dataQuality: {
        completeness: 0,
        consistency: 0,
        accuracy: 0,
        issues: ['Fichier vide']
      },
      recommendations: []
    };
  }
} 