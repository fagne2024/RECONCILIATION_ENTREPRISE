import { Injectable } from '@angular/core';

export interface SpecialFileConfig {
  fileName: string;
  expectedColumns: string[];
  columnMappings: { [key: string]: string };
  dataFormats: { [key: string]: any };
  separators: string[];
  encoding: string;
  skipRows?: number;
  headerRow?: number;
}

export interface FileAnalysisResult {
  fileName: string;
  detectedFormat: string;
  columns: string[];
  missingColumns: string[];
  extraColumns: string[];
  dataQuality: {
    totalRows: number;
    validRows: number;
    emptyRows: number;
    formatIssues: string[];
  };
  recommendations: string[];
}

@Injectable({
  providedIn: 'root'
})
export class SpecialFileDetectionService {

  private readonly specialFileConfigs: { [key: string]: SpecialFileConfig } = {
    'TRXBO': {
      fileName: 'TRXBO.csv',
      expectedColumns: [
        'ID', 'IDTransaction', 'téléphone client', 'montant', 'Service', 
        'Moyen de Paiement', 'Agence', 'Agent', 'Type agent', 'PIXI', 
        'Date', 'Numéro Trans GU', 'GRX', 'Statut', 'Latitude', 'Longitude', 
        'ID Partenaire DIST', 'Expéditeur', 'Pays provenance', 'Bénéficiaire', 'Canal de distribution'
      ],
      columnMappings: {
        'ID': 'id',
        'IDTransaction': 'idTransaction',
        'téléphone client': 'telephoneClient',
        'montant': 'montant',
        'Service': 'service',
        'Moyen de Paiement': 'moyenPaiement',
        'Agence': 'agence',
        'Agent': 'agent',
        'Type agent': 'typeAgent',
        'PIXI': 'pixi',
        'Date': 'date',
        'Numéro Trans GU': 'numeroTransGU',
        'GRX': 'grx',
        'Statut': 'statut',
        'Latitude': 'latitude',
        'Longitude': 'longitude',
        'ID Partenaire DIST': 'idPartenaireDist',
        'Expéditeur': 'expediteur',
        'Pays provenance': 'paysProvenance',
        'Bénéficiaire': 'beneficiaire',
        'Canal de distribution': 'canalDistribution'
      },
      dataFormats: {
        'ID': { type: 'number', required: true },
        'IDTransaction': { type: 'string', required: true },
        'téléphone client': { type: 'string', required: false },
        'montant': { type: 'number', required: true, format: 'currency' },
        'Service': { type: 'string', required: true },
        'Date': { type: 'datetime', required: true, format: 'yyyy-MM-dd HH:mm:ss.S' },
        'Numéro Trans GU': { type: 'string', required: true },
        'Statut': { type: 'string', required: true }
      },
      separators: [';'],
      encoding: 'UTF-8'
    },
    'OPPART': {
      fileName: 'OPPART.csv',
      expectedColumns: [
        'ID Opération', 'Type Opération', 'Montant', 'Solde avant', 'Solde aprés',
        'Code proprietaire', 'Téléphone', 'Statut', 'ID Transaction', 'Num bordereau',
        'Date opération', 'Date de versement', 'Banque appro', 'Login demandeur Appro',
        'Login valideur Appro', 'Motif rejet', 'Frais connexion', 'Numéro Trans GU',
        'Agent', 'Motif régularisation', 'groupe de réseau'
      ],
      columnMappings: {
        'ID Opération': 'idOperation',
        'Type Opération': 'typeOperation',
        'Montant': 'montant',
        'Solde avant': 'soldeAvant',
        'Solde aprés': 'soldeApres',
        'Code proprietaire': 'codeProprietaire',
        'Téléphone': 'telephone',
        'Statut': 'statut',
        'ID Transaction': 'idTransaction',
        'Num bordereau': 'numBordereau',
        'Date opération': 'dateOperation',
        'Date de versement': 'dateVersement',
        'Banque appro': 'banqueAppro',
        'Login demandeur Appro': 'loginDemandeurAppro',
        'Login valideur Appro': 'loginValideurAppro',
        'Motif rejet': 'motifRejet',
        'Frais connexion': 'fraisConnexion',
        'Numéro Trans GU': 'numeroTransGU',
        'Agent': 'agent',
        'Motif régularisation': 'motifRegularisation',
        'groupe de réseau': 'groupeReseau'
      },
      dataFormats: {
        'ID Opération': { type: 'number', required: true },
        'Type Opération': { type: 'string', required: true },
        'Montant': { type: 'number', required: true, format: 'currency' },
        'Solde avant': { type: 'number', required: true, format: 'currency' },
        'Solde aprés': { type: 'number', required: true, format: 'currency' },
        'Code proprietaire': { type: 'string', required: true },
        'Date opération': { type: 'datetime', required: true, format: 'yyyy-MM-dd HH:mm:ss.S' },
        'Numéro Trans GU': { type: 'string', required: true },
        'Statut': { type: 'string', required: true }
      },
      separators: [';'],
      encoding: 'UTF-8'
    },
    'USSDPART': {
      fileName: 'USSDPART.csv',
      expectedColumns: [
        'ID', 'Groupe Réseaux', 'Code réseau', 'Agence', 'Code PIXI', 'Code de Proxy',
        'Code service', 'Numéro Trans GU', 'Déstinataire', 'Login agent', 'Type agent',
        'date de création', 'Date d\'envoi vers part', 'Etat', 'Type', 'Token', 'SMS',
        'Action faite', 'Statut', 'Utilisateur', 'Montant', 'Latitude', 'Longitude',
        'Partenaire dist ID', 'Agence SC', 'Groupe reseau SC', 'Agent SC', 'PDA SC',
        'Date dernier traitement'
      ],
      columnMappings: {
        'ID': 'id',
        'Groupe Réseaux': 'groupeReseaux',
        'Code réseau': 'codeReseau',
        'Agence': 'agence',
        'Code PIXI': 'codePixi',
        'Code de Proxy': 'codeProxy',
        'Code service': 'codeService',
        'Numéro Trans GU': 'numeroTransGU',
        'Déstinataire': 'destinataire',
        'Login agent': 'loginAgent',
        'Type agent': 'typeAgent',
        'date de création': 'dateCreation',
        'Date d\'envoi vers part': 'dateEnvoiVersPart',
        'Etat': 'etat',
        'Type': 'type',
        'Token': 'token',
        'SMS': 'sms',
        'Action faite': 'actionFaite',
        'Statut': 'statut',
        'Utilisateur': 'utilisateur',
        'Montant': 'montant',
        'Latitude': 'latitude',
        'Longitude': 'longitude',
        'Partenaire dist ID': 'partenaireDistId',
        'Agence SC': 'agenceSC',
        'Groupe reseau SC': 'groupeReseauSC',
        'Agent SC': 'agentSC',
        'PDA SC': 'pdaSC',
        'Date dernier traitement': 'dateDernierTraitement'
      },
      dataFormats: {
        'ID': { type: 'number', required: true },
        'Groupe Réseaux': { type: 'string', required: true },
        'Code réseau': { type: 'string', required: true },
        'Agence': { type: 'string', required: true },
        'Code service': { type: 'string', required: true },
        'Numéro Trans GU': { type: 'string', required: true },
        'Déstinataire': { type: 'string', required: true },
        'date de création': { type: 'datetime', required: true, format: 'yyyy-MM-dd HH:mm:ss.S' },
        'Date d\'envoi vers part': { type: 'datetime', required: true, format: 'yyyy-MM-dd HH:mm:ss.S' },
        'Etat': { type: 'string', required: true },
        'Type': { type: 'string', required: true },
        'Montant': { type: 'number', required: true, format: 'currency' },
        'Statut': { type: 'string', required: true },
        'Date dernier traitement': { type: 'datetime', required: true, format: 'yyyy-MM-dd HH:mm:ss.S' }
      },
      separators: [';'],
      encoding: 'UTF-8'
    }
  };

  constructor() { }

  /**
   * Détecte le type de fichier spécial basé sur le nom
   */
  detectSpecialFile(fileName: string): string | null {
    const upperFileName = fileName.toUpperCase();
    
    if (upperFileName.includes('TRXBO')) {
      return 'TRXBO';
    } else if (upperFileName.includes('OPPART')) {
      return 'OPPART';
    } else if (upperFileName.includes('USSDPART')) {
      return 'USSDPART';
    }
    
    return null;
  }

  /**
   * Analyse un fichier spécial et retourne les résultats
   */
  analyzeSpecialFile(fileName: string, data: any[]): FileAnalysisResult {
    const fileType = this.detectSpecialFile(fileName);
    
    if (!fileType || !this.specialFileConfigs[fileType]) {
      return {
        fileName,
        detectedFormat: 'unknown',
        columns: [],
        missingColumns: [],
        extraColumns: [],
        dataQuality: {
          totalRows: data.length,
          validRows: 0,
          emptyRows: 0,
          formatIssues: ['Format de fichier non reconnu']
        },
        recommendations: ['Vérifiez le nom du fichier et son format']
      };
    }

    const config = this.specialFileConfigs[fileType];
    const actualColumns = data.length > 0 ? Object.keys(data[0]) : [];
    
    const missingColumns = config.expectedColumns.filter(col => 
      !actualColumns.some(actualCol => 
        this.normalizeColumnName(actualCol) === this.normalizeColumnName(col)
      )
    );
    
    const extraColumns = actualColumns.filter(col => 
      !config.expectedColumns.some(expectedCol => 
        this.normalizeColumnName(expectedCol) === this.normalizeColumnName(col)
      )
    );

    const dataQuality = this.analyzeDataQuality(data, config);
    const recommendations = this.generateRecommendations(fileType, missingColumns, extraColumns, dataQuality);

    return {
      fileName,
      detectedFormat: fileType,
      columns: actualColumns,
      missingColumns,
      extraColumns,
      dataQuality,
      recommendations
    };
  }

  /**
   * Méthode simple qui retourne la valeur de la colonne sans modification
   */
  private normalizeColumnName(columnName: string): string {
    return columnName;
  }

  /**
   * Échappe les caractères spéciaux regex dans une chaîne
   * 
   * @param string La chaîne à échapper
   * @return La chaîne avec les caractères spéciaux échappés
   */
  private escapeRegExp(string: string): string {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /**
   * Analyse la qualité des données
   */
  private analyzeDataQuality(data: any[], config: SpecialFileConfig): any {
    let validRows = 0;
    let emptyRows = 0;
    const formatIssues: string[] = [];

    for (const row of data) {
      let rowValid = true;
      let rowEmpty = true;

      for (const [columnName, format] of Object.entries(config.dataFormats)) {
        const value = row[columnName];
        
        if (value !== null && value !== undefined && value !== '') {
          rowEmpty = false;
          
          // Vérification du format
          if (format.required && !this.validateFormat(value, format)) {
            formatIssues.push(`Format invalide pour ${columnName}: ${value}`);
            rowValid = false;
          }
        } else if (format.required) {
          formatIssues.push(`Colonne requise manquante: ${columnName}`);
          rowValid = false;
        }
      }

      if (rowValid) validRows++;
      if (rowEmpty) emptyRows++;
    }

    return {
      totalRows: data.length,
      validRows,
      emptyRows,
      formatIssues
    };
  }

  /**
   * Valide le format d'une valeur selon les spécifications
   */
  private validateFormat(value: any, format: any): boolean {
    switch (format.type) {
      case 'number':
        return !isNaN(Number(value));
      case 'string':
        return typeof value === 'string';
      case 'datetime':
        return this.isValidDateTime(value, format.format);
      case 'currency':
        return this.isValidCurrency(value);
      default:
        return true;
    }
  }

  /**
   * Valide un format de date/heure
   */
  private isValidDateTime(value: any, format: string): boolean {
    if (!value) return false;
    
    const date = new Date(value);
    return !isNaN(date.getTime());
  }

  /**
   * Valide un format de montant
   */
  private isValidCurrency(value: any): boolean {
    if (!value) return false;
    
    // Supprime les caractères non numériques sauf le point et la virgule
    const cleanValue = String(value).replace(/[^\d.,-]/g, '');
    return !isNaN(Number(cleanValue));
  }

  /**
   * Génère des recommandations basées sur l'analyse
   */
  private generateRecommendations(
    fileType: string, 
    missingColumns: string[], 
    extraColumns: string[], 
    dataQuality: any
  ): string[] {
    const recommendations: string[] = [];

    if (missingColumns.length > 0) {
      recommendations.push(`Colonnes manquantes: ${missingColumns.join(', ')}`);
    }

    if (extraColumns.length > 0) {
      recommendations.push(`Colonnes supplémentaires détectées: ${extraColumns.join(', ')}`);
    }

    if (dataQuality.validRows < dataQuality.totalRows * 0.9) {
      recommendations.push('Plus de 10% des lignes ont des problèmes de format');
    }

    if (dataQuality.emptyRows > 0) {
      recommendations.push(`${dataQuality.emptyRows} lignes vides détectées`);
    }

    if (dataQuality.formatIssues.length > 0) {
      recommendations.push(`Problèmes de format détectés: ${dataQuality.formatIssues.length} erreurs`);
    }

    return recommendations;
  }

  // Appliquer le formatage spécial en préservant toutes les colonnes
  applySpecialFormatting(data: any[], fileType: string): any[] {
    const config = this.specialFileConfigs[fileType];
    if (!config) {
      console.log(`⚠️ Configuration non trouvée pour ${fileType}`);
      return data;
    }

    console.log(`🔧 Application du formatage spécial pour ${fileType}`);
    console.log(`📊 Données avant formatage: ${data.length} lignes`);
    console.log(`📋 Colonnes avant formatage:`, Object.keys(data[0] || {}));

    return data.map(row => {
      const formattedRow: any = {};
      
      // Préserver toutes les colonnes originales
      Object.keys(row).forEach(columnName => {
        const normalizedColumnName = this.normalizeColumnName(columnName);
        const value = row[columnName];
        
        // Appliquer le formatage selon le type de colonne
        if (config.dataFormats[normalizedColumnName]) {
          const format = config.dataFormats[normalizedColumnName];
          formattedRow[normalizedColumnName] = this.formatValue(value, format);
        } else {
          // Garder la valeur originale si pas de format spécifique
          formattedRow[normalizedColumnName] = value;
        }
      });

      return formattedRow;
    });
  }

  /**
   * Formate une valeur selon les spécifications
   */
  private formatValue(value: any, format: any): any {
    if (!format || value === null || value === undefined) {
      return value;
    }

    switch (format.type) {
      case 'number':
        return this.formatNumber(value);
      case 'currency':
        return this.formatCurrency(value);
      case 'datetime':
        return this.formatDateTime(value, format.format);
      case 'string':
        return this.formatString(value);
      default:
        return value;
    }
  }

  /**
   * Formate un nombre
   */
  private formatNumber(value: any): number {
    const num = Number(value);
    return isNaN(num) ? 0 : num;
  }

  /**
   * Formate un montant
   */
  private formatCurrency(value: any): number {
    if (!value) return 0;
    
    // Supprime tous les caractères non numériques sauf le point et la virgule
    const cleanValue = String(value).replace(/[^\d.,-]/g, '');
    const num = Number(cleanValue);
    return isNaN(num) ? 0 : num;
  }

  /**
   * Formate une date/heure
   */
  private formatDateTime(value: any, format: string): string {
    if (!value) return '';
    
    try {
      const date = new Date(value);
      if (isNaN(date.getTime())) return '';
      
      // Format standard ISO
      return date.toISOString();
    } catch {
      return '';
    }
  }

  /**
   * Formate une chaîne
   */
  private formatString(value: any): string {
    if (!value) return '';
    return String(value).trim();
  }

  /**
   * Obtient la configuration pour un type de fichier
   */
  getFileConfig(fileType: string): SpecialFileConfig | null {
    return this.specialFileConfigs[fileType] || null;
  }

  /**
   * Liste tous les types de fichiers spéciaux supportés
   */
  getSupportedFileTypes(): string[] {
    return Object.keys(this.specialFileConfigs);
  }

  // Récupérer la configuration d'un fichier spécial
  getSpecialFileConfig(fileType: string): SpecialFileConfig | null {
    return this.specialFileConfigs[fileType] || null;
  }
} 