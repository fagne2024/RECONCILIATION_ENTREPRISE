import { Injectable } from '@angular/core';

export interface FieldTypeInfo {
  type: 'text' | 'number' | 'date' | 'amount' | 'boolean' | 'unknown';
  confidence: number;
  format?: string;
  locale?: string;
  currency?: string;
  decimalPlaces?: number;
  dateFormat?: string;
  suggestions?: string[];
}

export interface ColumnAnalysis {
  columnName: string;
  typeInfo: FieldTypeInfo;
  sampleValues: any[];
  nullCount: number;
  uniqueCount: number;
  totalCount: number;
  minValue?: any;
  maxValue?: any;
  averageValue?: number;
}

@Injectable({
  providedIn: 'root'
})
export class FieldTypeDetectionService {

  // Patterns pour détecter les types de données
  private readonly patterns = {
    // Patterns pour les dates
    datePatterns: [
      /^\d{1,2}\/\d{1,2}\/\d{2,4}$/, // DD/MM/YYYY ou DD/MM/YY
      /^\d{4}-\d{1,2}-\d{1,2}$/, // YYYY-MM-DD
      /^\d{1,2}-\d{1,2}-\d{2,4}$/, // DD-MM-YYYY
      /^\d{1,2}\.\d{1,2}\.\d{2,4}$/, // DD.MM.YYYY
      /^\d{1,2}\s+\w+\s+\d{2,4}$/, // DD Month YYYY
      /^\d{2}\/\d{2}\/\d{4}$/, // MM/DD/YYYY
    ],
    
    // Patterns pour les montants
    amountPatterns: [
      /^[\d\s,]+\.?\d*$/, // 1,234.56 ou 1 234,56
      /^[\d\s,]+,\d*$/, // 1,234,56
      /^[\d\s]+\.\d{2}$/, // 1234.56
      /^[\d\s]+,\d{2}$/, // 1234,56
      /^[\d\s,]+\.?\d*\s*[€$£¥₦₩₪₨₴₸₺₼₾₿]$/, // Avec symbole monétaire
    ],
    
    // Patterns pour les nombres
    numberPatterns: [
      /^\d+$/, // Entiers
      /^\d+\.\d+$/, // Décimaux avec point
      /^\d+,\d+$/, // Décimaux avec virgule
      /^[\d\s,]+\.?\d*$/, // Nombres avec espaces et virgules
    ],
    
    // Patterns pour les booléens
    booleanPatterns: [
      /^(true|false|oui|non|yes|no|1|0)$/i,
      /^(vrai|faux|y|n|t|f)$/i,
    ],
    
    // Patterns pour les emails
    emailPattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
    
    // Patterns pour les téléphones
    phonePattern: /^[\+]?[0-9\s\-\(\)]{8,}$/,
  };

  // Formats de date courants
  private readonly dateFormats = [
    'DD/MM/YYYY',
    'MM/DD/YYYY', 
    'YYYY-MM-DD',
    'DD-MM-YYYY',
    'DD.MM.YYYY',
    'DD MMM YYYY',
    'MM/DD/YY',
    'DD/MM/YY'
  ];

  // Devises courantes
  private readonly currencies = {
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
    '₿': 'BTC'
  };

  constructor() {}

  /**
   * Analyse complète d'une colonne pour déterminer son type
   */
  analyzeColumn(columnName: string, values: any[]): ColumnAnalysis {
    const nonNullValues = values.filter(v => v !== null && v !== undefined && v !== '');
    const nullCount = values.length - nonNullValues.length;
    const uniqueValues = [...new Set(nonNullValues)];
    
    const typeInfo = this.detectFieldType(columnName, nonNullValues);
    
    const analysis: ColumnAnalysis = {
      columnName,
      typeInfo,
      sampleValues: nonNullValues.slice(0, 10), // 10 premières valeurs
      nullCount,
      uniqueCount: uniqueValues.length,
      totalCount: values.length
    };

    // Calculs supplémentaires selon le type
    if (typeInfo.type === 'number' || typeInfo.type === 'amount') {
      const numbers = nonNullValues.map(v => this.parseNumber(v)).filter(n => !isNaN(n));
      if (numbers.length > 0) {
        analysis.minValue = Math.min(...numbers);
        analysis.maxValue = Math.max(...numbers);
        analysis.averageValue = numbers.reduce((a, b) => a + b, 0) / numbers.length;
      }
    }

    return analysis;
  }

  /**
   * Détecte le type d'un champ basé sur son nom et ses valeurs
   */
  detectFieldType(columnName: string, values: any[]): FieldTypeInfo {
    const columnNameLower = columnName.toLowerCase();
    const stringValues = values.map(v => String(v).trim()).filter(v => v !== '');

    // Détection basée sur le nom de la colonne
    const nameBasedType = this.detectTypeFromColumnName(columnNameLower);
    if (nameBasedType.confidence > 0.8) {
      return nameBasedType;
    }

    // Détection basée sur les valeurs
    const valueBasedType = this.detectTypeFromValues(stringValues);
    
    // Combiner les deux détections
    return this.combineTypeDetections(nameBasedType, valueBasedType);
  }

  /**
   * Détecte le type basé sur le nom de la colonne
   */
  private detectTypeFromColumnName(columnName: string): FieldTypeInfo {
    const patterns = {
      // Patterns pour les dates
      date: [
        /date/i, /jour/i, /time/i, /heure/i, /timestamp/i, /created/i, /updated/i,
        /naissance/i, /naissance/i, /expiration/i, /validité/i
      ],
      
      // Patterns pour les montants
      amount: [
        /montant/i, /amount/i, /prix/i, /price/i, /coût/i, /cost/i, /tarif/i,
        /somme/i, /sum/i, /total/i, /reste/i, /balance/i, /solde/i,
        /débit/i, /crédit/i, /debit/i, /credit/i, /commission/i, /frais/i
      ],
      
      // Patterns pour les nombres
      number: [
        /nombre/i, /number/i, /quantité/i, /quantity/i, /compteur/i, /count/i,
        /numéro/i, /numero/i, /n°/i, /id/i, /code/i, /référence/i, /reference/i
      ],
      
      // Patterns pour les booléens
      boolean: [
        /actif/i, /active/i, /enabled/i, /disabled/i, /validé/i, /validated/i,
        /confirmé/i, /confirmed/i, /payé/i, /paid/i, /terminé/i, /completed/i
      ]
    };

    for (const [type, typePatterns] of Object.entries(patterns)) {
      for (const pattern of typePatterns) {
        if (pattern.test(columnName)) {
          return {
            type: type as any,
            confidence: 0.9,
            format: this.getDefaultFormat(type as any),
            suggestions: this.getSuggestions(type as any)
          };
        }
      }
    }

    return { type: 'unknown', confidence: 0 };
  }

  /**
   * Détecte le type basé sur les valeurs
   */
  private detectTypeFromValues(values: string[]): FieldTypeInfo {
    if (values.length === 0) {
      return { type: 'unknown', confidence: 0 };
    }

    const typeCounts = {
      date: 0,
      amount: 0,
      number: 0,
      boolean: 0,
      text: 0
    };

    let totalValidValues = 0;

    for (const value of values) {
      if (this.isDate(value)) {
        typeCounts.date++;
        totalValidValues++;
      } else if (this.isAmount(value)) {
        typeCounts.amount++;
        totalValidValues++;
      } else if (this.isNumber(value)) {
        typeCounts.number++;
        totalValidValues++;
      } else if (this.isBoolean(value)) {
        typeCounts.boolean++;
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
      format: this.getDefaultFormat(dominantType as any),
      suggestions: this.getSuggestions(dominantType as any)
    };
  }

  /**
   * Combine les détections basées sur le nom et les valeurs
   */
  private combineTypeDetections(nameBased: FieldTypeInfo, valueBased: FieldTypeInfo): FieldTypeInfo {
    // Si la détection basée sur le nom a une forte confiance, l'utiliser
    if (nameBased.confidence > 0.8) {
      return nameBased;
    }

    // Si la détection basée sur les valeurs a une forte confiance, l'utiliser
    if (valueBased.confidence > 0.7) {
      return valueBased;
    }

    // Sinon, utiliser une moyenne pondérée
    const combinedConfidence = (nameBased.confidence + valueBased.confidence) / 2;
    const finalType = combinedConfidence > 0.5 ? valueBased.type : 'text';

    return {
      type: finalType,
      confidence: combinedConfidence,
      format: this.getDefaultFormat(finalType),
      suggestions: this.getSuggestions(finalType)
    };
  }

  /**
   * Vérifie si une valeur est une date
   */
  private isDate(value: string): boolean {
    // Vérifier les patterns de date
    for (const pattern of this.patterns.datePatterns) {
      if (pattern.test(value)) {
        return true;
      }
    }

    // Vérifier si c'est une date valide
    const date = new Date(value);
    return !isNaN(date.getTime()) && date.toString() !== 'Invalid Date';
  }

  /**
   * Vérifie si une valeur est un montant
   */
  private isAmount(value: string): boolean {
    // Vérifier les patterns de montant
    for (const pattern of this.patterns.amountPatterns) {
      if (pattern.test(value)) {
        return true;
      }
    }

    // Vérifier la présence de symboles monétaires
    for (const symbol of Object.keys(this.currencies)) {
      if (value.includes(symbol)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Vérifie si une valeur est un nombre
   */
  private isNumber(value: string): boolean {
    // Vérifier les patterns de nombre
    for (const pattern of this.patterns.numberPatterns) {
      if (pattern.test(value)) {
        return true;
      }
    }

    // Vérifier si c'est un nombre valide
    const num = parseFloat(value.replace(/[,\s]/g, ''));
    return !isNaN(num);
  }

  /**
   * Vérifie si une valeur est un booléen
   */
  private isBoolean(value: string): boolean {
    for (const pattern of this.patterns.booleanPatterns) {
      if (pattern.test(value)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Parse un nombre en tenant compte des formats internationaux
   */
  private parseNumber(value: string): number {
    // Nettoyer la valeur
    let cleanValue = value.replace(/[^\d.,\-\s]/g, '');
    
    // Détecter le format (point ou virgule comme séparateur décimal)
    const hasComma = cleanValue.includes(',');
    const hasDot = cleanValue.includes('.');
    
    if (hasComma && hasDot) {
      // Format européen: 1.234,56
      cleanValue = cleanValue.replace(/\./g, '').replace(',', '.');
    } else if (hasComma && !hasDot) {
      // Format avec virgule: 1234,56
      cleanValue = cleanValue.replace(',', '.');
    }
    
    return parseFloat(cleanValue);
  }

  /**
   * Obtient le format par défaut pour un type
   */
  private getDefaultFormat(type: string): string | undefined {
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

  /**
   * Obtient les suggestions pour un type
   */
  private getSuggestions(type: string): string[] {
    switch (type) {
      case 'date':
        return [
          'Formater en DD/MM/YYYY',
          'Formater en YYYY-MM-DD',
          'Normaliser les dates',
          'Valider le format de date'
        ];
      case 'amount':
        return [
          'Nettoyer les montants',
          'Formater en devise locale',
          'Supprimer les espaces',
          'Normaliser les décimales'
        ];
      case 'number':
        return [
          'Normaliser les nombres',
          'Formater avec séparateurs',
          'Arrondir les décimales',
          'Valider les valeurs numériques'
        ];
      case 'text':
        return [
          'Supprimer les espaces',
          'Convertir en majuscules',
          'Convertir en minuscules',
          'Nettoyer les caractères spéciaux'
        ];
      default:
        return [];
    }
  }

  /**
   * Analyse toutes les colonnes d'un dataset
   */
  analyzeDataset(data: any[]): ColumnAnalysis[] {
    if (data.length === 0) return [];
    // Limiter l'échantillon pour éviter une surcharge mémoire / stack sur les très gros fichiers
    const MAX_SAMPLE_ROWS = 5000;
    const sample = data.length > MAX_SAMPLE_ROWS ? data.slice(0, MAX_SAMPLE_ROWS) : data;

    const columns = Object.keys(sample[0]);
    const analyses: ColumnAnalysis[] = [];

    for (const column of columns) {
      const values = sample.map(row => row[column]);
      const analysis = this.analyzeColumn(column, values);
      analyses.push(analysis);
    }

    return analyses.sort((a, b) => b.typeInfo.confidence - a.typeInfo.confidence);
  }

  /**
   * Génère des recommandations de formatage basées sur l'analyse
   */
  generateFormattingRecommendations(analyses: ColumnAnalysis[]): any[] {
    const recommendations: any[] = [];

    for (const analysis of analyses) {
      if (analysis.typeInfo.confidence > 0.6) {
        const recommendation = {
          column: analysis.columnName,
          type: analysis.typeInfo.type,
          confidence: analysis.typeInfo.confidence,
          actions: this.getRecommendedActions(analysis),
          priority: this.getPriority(analysis)
        };
        recommendations.push(recommendation);
      }
    }

    return recommendations.sort((a, b) => b.priority - a.priority);
  }

  /**
   * Obtient les actions recommandées pour une colonne
   */
  private getRecommendedActions(analysis: ColumnAnalysis): string[] {
    const actions: string[] = [];

    switch (analysis.typeInfo.type) {
      case 'date':
        actions.push('normalizeDates');
        if (analysis.nullCount > 0) {
          actions.push('validateDates');
        }
        break;
      case 'amount':
        actions.push('cleanAmounts');
        actions.push('normalizeNumbers');
        if (analysis.nullCount > 0) {
          actions.push('validateAmounts');
        }
        break;
      case 'number':
        actions.push('normalizeNumbers');
        if (analysis.nullCount > 0) {
          actions.push('validateNumbers');
        }
        break;
      case 'text':
        actions.push('trimSpaces');
        if (analysis.uniqueCount / analysis.totalCount < 0.1) {
          actions.push('toUpperCase');
        }
        break;
    }

    return actions;
  }

  /**
   * Calcule la priorité d'une recommandation
   */
  private getPriority(analysis: ColumnAnalysis): number {
    let priority = analysis.typeInfo.confidence;

    // Bonus pour les colonnes avec beaucoup de valeurs nulles
    if (analysis.nullCount > 0) {
      priority += 0.1;
    }

    // Bonus pour les colonnes avec des types critiques
    if (analysis.typeInfo.type === 'amount' || analysis.typeInfo.type === 'date') {
      priority += 0.2;
    }

    return priority;
  }
} 