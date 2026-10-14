import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { AutoProcessingModel } from './auto-processing.service';

export interface ModelNormalizationResult {
  success: boolean;
  totalModels: number;
  normalizedModels: number;
  errors: number;
  message: string;
}

export interface ModelImportResult {
  success: boolean;
  totalModels: number;
  importedModels: string[];
  errors: string[];
  timestamp: string;
}

export interface ModelValidationResult {
  success: boolean;
  isValid: boolean;
  normalizedModel: AutoProcessingModel;
  message: string;
}

export interface ModelStatistics {
  success: boolean;
  totalModels: number;
  boModels: number;
  partnerModels: number;
  bothModels: number;
  autoApplyModels: number;
  message: string;
}

@Injectable({
  providedIn: 'root'
})
export class ModelManagementService {

  private apiUrl = '/api';

  constructor(private http: HttpClient) { }

  /**
   * Normalise tous les modèles existants
   */
  normalizeAllModels(): Observable<ModelNormalizationResult> {
    return this.http.post<ModelNormalizationResult>(`${this.apiUrl}/model-management/normalize-all`, {});
  }

  /**
   * Normalise un modèle spécifique
   */
  normalizeModel(modelId: string): Observable<ModelValidationResult> {
    return this.http.post<ModelValidationResult>(`${this.apiUrl}/model-management/normalize/${modelId}`, {});
  }

  /**
   * Importe les modèles depuis le watch-folder
   */
  importModelsFromWatchFolder(): Observable<any> {
    return this.http.post(`${this.apiUrl}/model-management/import-from-watch-folder`, {});
  }

  /**
   * Récupère les fichiers modèles JSON depuis le watch-folder
   */
  getModelFilesFromWatchFolder(): Observable<any[]> {
    return this.http.get<any[]>(`${this.apiUrl}/model-management/model-files`);
  }

  /**
   * Charge les modèles depuis le watch-folder sans les importer
   */
  loadModelsFromWatchFolder(): Observable<{ success: boolean; models: AutoProcessingModel[]; count: number; message: string }> {
    return this.http.get<{ success: boolean; models: AutoProcessingModel[]; count: number; message: string }>(`${this.apiUrl}/model-management/load-from-watch-folder`);
  }

  /**
   * Démarre la surveillance du dossier models
   */
  startWatchFolderMonitoring(): Observable<{ success: boolean; message: string }> {
    return this.http.post<{ success: boolean; message: string }>(`${this.apiUrl}/model-management/start-watch-folder-monitoring`, {});
  }

  /**
   * Crée un modèle d'exemple dans le watch-folder
   */
  createExampleModel(): Observable<{ success: boolean; message: string }> {
    return this.http.post<{ success: boolean; message: string }>(`${this.apiUrl}/model-management/create-example-model`, {});
  }

  /**
   * Valide un modèle
   */
  validateModel(model: AutoProcessingModel): Observable<ModelValidationResult> {
    return this.http.post<ModelValidationResult>(`${this.apiUrl}/model-management/validate`, model);
  }

  /**
   * Génère un ID de modèle basé sur le nom
   */
  generateModelId(name: string): Observable<{ success: boolean; modelId: string; name: string; message: string }> {
    return this.http.post<{ success: boolean; modelId: string; name: string; message: string }>(`${this.apiUrl}/model-management/generate-model-id`, { name });
  }

  /**
   * Obtient les statistiques des modèles
   */
  getModelStatistics(): Observable<ModelStatistics> {
    return this.http.get<ModelStatistics>(`${this.apiUrl}/model-management/statistics`);
  }

  /**
   * Normalise un nom de modèle côté client
   */
  normalizeModelName(name: string): string {
    if (!name || name.trim() === '') {
      return 'Modèle sans nom';
    }

    let normalized = name.trim();

    // Mapping des noms de modèles courants
    const modelNameMapping: { [key: string]: string } = {
      'TRXBO': 'Transaction Back Office',
      'TRXBO_CM': 'Transaction Back Office Cameroun',
      'TRXBO_CI': 'Transaction Back Office Côte d\'Ivoire',
      'OM_CM': 'Orange Money Cameroun',
      'OM_CI': 'Orange Money Côte d\'Ivoire',
      'MTN_CM': 'MTN Mobile Money Cameroun',
      'MTN_CI': 'MTN Mobile Money Côte d\'Ivoire',
      'MOOV_CI': 'Moov Money Côte d\'Ivoire',
      'MOMO_CM': 'MTN Mobile Money Cameroun',
      'MOMO_CI': 'MTN Mobile Money Côte d\'Ivoire'
    };

    // Vérifier d'abord dans le mapping
    if (modelNameMapping[normalized.toUpperCase()]) {
      return modelNameMapping[normalized.toUpperCase()];
    }

    // Normaliser les caractères spéciaux
    normalized = normalized.replace(/[^a-zA-Z0-9\s\-_]/g, ' ');
    
    // Normaliser les espaces multiples
    normalized = normalized.replace(/\s+/g, ' ');
    
    // Normaliser les tirets multiples
    normalized = normalized.replace(/-+/g, '-');
    
    // Normaliser les underscores multiples
    normalized = normalized.replace(/_+/g, '_');

    // Capitaliser les mots
    normalized = this.capitalizeWords(normalized);

    return normalized.trim();
  }

  /**
   * Méthode simple qui retourne le pattern sans modification
   */
  normalizeFilePattern(pattern: string): string {
    return pattern;
  }

  /**
   * Méthode simple qui retourne la valeur de la colonne sans modification
   */
  normalizeColumnName(columnName: string): string {
    return columnName;
  }

  /**
   * Génère un ID de modèle côté client
   */
  generateModelIdClient(name: string): string {
    if (!name || name.trim() === '') {
      return 'model_' + this.generateRandomId(8);
    }

    let normalized = name.toLowerCase()
      .replace(/[^a-z0-9]/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '');

    if (normalized === '') {
      normalized = 'model';
    }

    return normalized + '_' + this.generateRandomId(8);
  }

  /**
   * Capitalise les mots d'une chaîne
   */
  private capitalizeWords(text: string): string {
    if (!text || text.trim() === '') {
      return text;
    }

    const words = text.split(/\s+/);
    const result: string[] = [];

    for (let i = 0; i < words.length; i++) {
      if (words[i].length > 0) {
        result.push(words[i].charAt(0).toUpperCase() + words[i].slice(1).toLowerCase());
      }
    }

    return result.join(' ');
  }

  /**
   * Génère un ID aléatoire
   */
  private generateRandomId(length: number): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }

  /**
   * Normalise un modèle complet côté client
   */
  normalizeModelClient(model: AutoProcessingModel): AutoProcessingModel {
    if (!model) {
      return model;
    }

    const normalizedModel = { ...model };

    // Normaliser le nom
    normalizedModel.name = this.normalizeModelName(model.name);

    // Normaliser le pattern de fichier
    normalizedModel.filePattern = this.normalizeFilePattern(model.filePattern);

    // Normaliser les clés de réconciliation
    if (model.reconciliationKeys) {
      const normalizedKeys = { ...model.reconciliationKeys };
      
      if (normalizedKeys.boKeys && Array.isArray(normalizedKeys.boKeys)) {
        normalizedKeys.boKeys = normalizedKeys.boKeys.map(key => this.normalizeColumnName(key));
      }
      
      if (normalizedKeys.partnerKeys && Array.isArray(normalizedKeys.partnerKeys)) {
        normalizedKeys.partnerKeys = normalizedKeys.partnerKeys.map(key => this.normalizeColumnName(key));
      }
      
      normalizedModel.reconciliationKeys = normalizedKeys;
    }

    // Normaliser les règles de traitement des colonnes
    if (model.columnProcessingRules && Array.isArray(model.columnProcessingRules)) {
      normalizedModel.columnProcessingRules = model.columnProcessingRules.map(rule => ({
        ...rule,
        sourceColumn: this.normalizeColumnName(rule.sourceColumn),
        targetColumn: this.normalizeColumnName(rule.targetColumn)
      }));
    }

    return normalizedModel;
  }
}
