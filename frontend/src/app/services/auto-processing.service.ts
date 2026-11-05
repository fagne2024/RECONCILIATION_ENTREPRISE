import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { FileWatcherService } from './file-watcher.service';
import { ReconciliationService } from './reconciliation.service';
import { FieldTypeDetectionService } from './field-type-detection.service';
import { ExcelTypeDetectionService } from './excel-type-detection.service';
import { SpecialFileDetectionService } from './special-file-detection.service';
import { AppStateService } from './app-state.service';
import { ColumnProcessingRule } from '../models/column-processing-rule.model';

export type { ColumnProcessingRule } from '../models/column-processing-rule.model';

export interface ModelRowFilter {
  id: string;
  column: string;
  selectedValues: string[];
  enabled: boolean;
}

export type ModelFormatActionType =
  | 'removeSpecialStrings'
  | 'removeCharacters'
  | 'removeNumbers'
  | 'removeIndicatif'
  | 'removeDecimals'
  | 'keepLastDigits'
  | 'removeZeroDecimals'
  | 'removeSpaces';

export interface ModelFormatColumnSettings {
  specialStringToRemove?: string;
  specialStringRemovalMode?: 'all' | 'start' | 'end';
  removeCharMode?: 'remove' | 'keep';
  removeCharPosition?: 'start' | 'end' | 'specific';
  removeCharCount?: number;
  removeCharSpecificPosition?: number;
  /** Gestion du zéro initial pour nombres / téléphones (removeCharacters). */
  leadingZeroMode?: 'none' | 'keep' | 'strip' | 'auto';
  removeSpacesType?: 'all' | 'leading' | 'trailing' | 'multiple';
  keepLastDigitsCount?: number;
  indicatifType?: 'international' | 'national' | 'custom';
  customIndicatif?: string;
  decimalSeparator?: ',' | '.';
  keepTrailingZeros?: boolean;
  /** Si true, la condition spécifique à cette colonne remplace celle de l'action. */
  applyConditionEnabled?: boolean;
  conditionColumn?: string;
  conditionValue?: string;
}

export interface ModelFormatAction {
  id?: string;
  type: ModelFormatActionType;
  enabled: boolean;
  columns: string[];
  /** Ordre d'exécution (1 = en premier). Déduit de la position si absent. */
  order?: number;
  /** Paramètres spécifiques par colonne (prioritaires sur les champs globaux). */
  columnSettings?: Record<string, ModelFormatColumnSettings>;
  specialStringToRemove?: string;
  specialStringRemovalMode?: 'all' | 'start' | 'end';
  removeCharMode?: 'remove' | 'keep';
  removeCharPosition?: 'start' | 'end' | 'specific';
  removeCharCount?: number;
  removeCharSpecificPosition?: number;
  /** Gestion du zéro initial pour nombres / téléphones (removeCharacters). */
  leadingZeroMode?: 'none' | 'keep' | 'strip' | 'auto';
  removeSpacesType?: 'all' | 'leading' | 'trailing' | 'multiple';
  keepLastDigitsCount?: number;
  indicatifType?: 'international' | 'national' | 'custom';
  customIndicatif?: string;
  decimalSeparator?: ',' | '.';
  keepTrailingZeros?: boolean;
  /** Condition optionnelle : n'appliquer l'action que si conditionColumn vaut l'une des conditionValue (séparées par des virgules). */
  applyConditionEnabled?: boolean;
  conditionColumn?: string;
  conditionValue?: string;
}

/** Parse une liste de valeurs de condition séparées par des virgules. */
export function parseConditionValues(conditionValue?: string | null): string[] {
  if (!conditionValue?.trim()) {
    return [];
  }
  return conditionValue
    .split(',')
    .map(value => value.trim())
    .filter(value => value.length > 0);
}

/** Vérifie si une valeur correspond à l'une des valeurs attendues (séparées par des virgules). */
export function matchesConditionValues(actualValue: string, conditionValue?: string | null): boolean {
  const expectedValues = parseConditionValues(conditionValue);
  if (!expectedValues.length) {
    return true;
  }
  const actual = String(actualValue ?? '').trim();
  return expectedValues.some(expected => actual === expected);
}

export type ModelPreProcessingSectionId =
  | 'rowFilters'
  | 'formatActions'
  | 'columnConcatRules'
  | 'columnMathRules'
  | 'valueMappings'
  | 'columnRenameRules';

export const DEFAULT_PRE_PROCESSING_SECTION_ORDER: ModelPreProcessingSectionId[] = [
  'rowFilters',
  'formatActions',
  'columnConcatRules',
  'columnMathRules',
  'valueMappings',
  'columnRenameRules'
];

export const ENV_COLUMN_NAME = 'ENV';
export const ENV_COLUMN_OPTIONS = ['BET', 'HT', 'TOTAL', 'GU3', 'GU2', 'HUBAO', 'TOP20'] as const;
export type EnvColumnOption = typeof ENV_COLUMN_OPTIONS[number];

export interface ModelEnvColumnConfig {
  enabled: boolean;
  value?: EnvColumnOption | string;
}

/** Colonnes conservées à l'export (section traitement automatique). */
export interface ModelExportColumnFilterConfig {
  enabled: boolean;
  keptColumns?: string[];
}

export interface ModelPreProcessingConfig {
  rowFilters?: ModelRowFilter[];
  formatActions?: ModelFormatAction[];
  columnConcatRules?: ModelColumnConcatRule[];
  columnMathRules?: ModelColumnMathRule[];
  valueMappings?: ModelColumnValueMapping[];
  columnRenameRules?: ModelColumnRenameRule[];
  /** Colonne ENV constante ajoutée sur chaque ligne du fichier final. */
  envColumn?: ModelEnvColumnConfig;
  /** Filtrer les colonnes exportées (liste des colonnes à conserver). */
  exportColumnFilter?: ModelExportColumnFilterConfig;
  /** Ordre d'exécution des sections de pré-traitement. */
  sectionOrder?: ModelPreProcessingSectionId[];
}

export interface ModelColumnRenameRule {
  id: string;
  sourceColumn: string;
  targetColumn: string;
  enabled: boolean;
}

export interface ModelColumnConcatRule {
  id: string;
  sourceColumns: string[];
  targetColumn: string;
  separator: string;
  enabled: boolean;
}

export interface ModelColumnMathRule {
  id: string;
  sourceColumnA: string;
  sourceColumnB: string;
  targetColumn: string;
  operation: 'add' | 'subtract';
  enabled: boolean;
}

export interface ModelColumnValueMapping {
  id: string;
  column: string;
  fromValue: string;
  /** Colonne optionnelle : le renommage ne s'applique que si cette colonne a aussi la valeur attendue. */
  conditionColumn?: string;
  /** 2e valeur actuelle optionnelle (associée à conditionColumn). */
  conditionValue?: string;
  toValue: string;
  enabled: boolean;
}

/** Règle : si la colonne condition a une valeur donnée, utiliser une autre colonne comme clé. */
export interface PartnerConditionalKeyRule {
  whenValue: string;
  keyColumn: string;
  /** Colonne BO associée (optionnel) — ex. CLECI partenaire → CLE BO. */
  boKeyColumn?: string;
}

/** Clés partenaire conditionnelles (optionnel) — ex. Type=api_checkout → colonne session. */
export interface PartnerConditionalKeysConfig {
  enabled: boolean;
  conditionColumn: string;
  rules: PartnerConditionalKeyRule[];
  defaultKeyColumn?: string;
  /** Si renseigné, les règles ne s'appliquent que lorsque la colonne ENV a cette valeur. */
  envConditionValue?: string;
}

/** Clés BO conditionnelles (optionnel) — même principe sur les colonnes du fichier BO. */
export type BoConditionalKeysConfig = PartnerConditionalKeysConfig;

export interface TrxboOppartConfig {
  operationTypes?: {
    impact?: string;
    fees?: string;
    commission?: string;
  };
  comments?: {
    tsop?: string;
    trxsf?: string;
    rgfrais?: string;
    trxsvc?: string;
    fraisSansCommission?: string;
    regcom?: string;
    fraisEtCommission?: string;
    trxsfTrxsvc?: string;
    ecart?: string;
    partnerOnly?: string;
  };
  additionalOperationTypes?: TrxboAdditionalOperationType[];
  regularisationRules?: TrxboRegularisationRule[];
  /**
   * Description des agrégats des écarts : type de commentaire, libellés BO/partenaire et mode
   * de régularisation de chaque côté. Absent → le backend dérive les types des commentaires.
   */
  aggregationTypes?: TrxboAggregationType[];
}

/** Type d'agrégat d'écart (agrégats des écarts en certification de solde). */
export interface TrxboAggregationType {
  /** Clé stable (tsop, trxsf, rgfrais, ecart, partnerOnly, trxsvc, …, additional:<label>). */
  kind?: string;
  /** Commentaire de la ligne BO (détection). */
  commentBo?: string;
  /** Commentaire de la ligne partenaire (détection). */
  commentPartner?: string;
  /** Libellé de l'agrégat BO. */
  boLabel?: string;
  /** Libellé de l'agrégat partenaire. */
  partnerLabel?: string;
  /** MONTANT_FRAIS | MONTANT | FRAIS | SIMPLE | NONE */
  boMode?: string;
  /** MONTANT | FRAIS | ZERO | NONE */
  partnerMode?: string;
}

export interface TrxboAdditionalOperationType {
  label?: string;
  commentBo?: string;
  commentPartner?: string;
}

/** Règle de régularisation d'un cas : composition du montant à régulariser. */
export interface TrxboRegularisationRule {
  /** Libellé du cas (correspond au Commentaire posé par la réconciliation). */
  case?: string;
  components?: TrxboRegularisationComponent[];
}

/** Composant d'une règle : source de montant + signe. */
export interface TrxboRegularisationComponent {
  /** BO_AMOUNT | OPPART_TYPE | CALCULATED_FRAIS */
  source?: string;
  /** Libellé du type OPPART (si source = OPPART_TYPE). */
  type?: string;
  /** POSITIVE | NEGATIVE | SOURCE | SERVICE_BASED */
  sign?: string;
  negativeTokens?: string[];
  /** POSITIVE | NEGATIVE (si sign = SERVICE_BASED). */
  defaultSign?: string;
  coefficient?: number;
}

export interface AutoProcessingModel {
  id?: string; // modelId métier ou id numérique en string
  dbId?: number; // id base de données (Long)
  modelId?: string; // ID retourné par le backend
  name: string;
  filePattern: string;
  fileType: 'bo' | 'partner' | 'both' | 'operation';
  autoApply: boolean;
  createdAt?: Date;
  updatedAt?: Date;
  templateFile?: string;
  reconciliationKeys?: {
    partnerKeys: string[];
    boKeys: string[];
    boModelReferences?: string[];
    boModels?: string[];
    boModelKeys?: any;
    boTreatments?: any;
    partnerConditionalKeys?: PartnerConditionalKeysConfig;
    boConditionalKeys?: BoConditionalKeysConfig;
  };
  boColumnFilters?: BOColumnFilter[]; // Filtres BO appliqués
  columnProcessingRules?: ColumnProcessingRule[]; // Règles de traitement des colonnes
  preProcessingConfig?: ModelPreProcessingConfig; // Filtres lignes + formatage (page /traitement)
  
  // Nouvelles propriétés pour la configuration autonome
  reconciliationLogic?: {
    type: 'STANDARD' | 'SPECIAL_RATIO' | 'CUSTOM';
    parameters?: {
      expectedRatio?: string;
      tolerance?: number;
      description?: string;
      trxboOppart?: TrxboOppartConfig;
    };
  };
  correspondenceRules?: {
    rules: Array<{
      name: string;
      condition: string;
      action: string;
      description?: string;
    }>;
  };
  comparisonColumns?: {
    columns: Array<{
      boColumn: string;
      partnerColumn: string;
      comparisonType: 'AUTO' | 'NUMERIC' | 'DATE' | 'STRING';
      tolerance: number;
    }>;
  };
}

export interface ProcessingResult {
  success: boolean;
  fileName: string;
  modelId: string;
  originalData: any[];
  processedData: any[];
  errors: string[];
  warnings: string[];
  processingTime: number;
}

export interface AutoReconciliationResult {
  success: boolean;
  fileName: string;
  modelId: string;
  originalData: any[];
  processedData: any[];
  reconciliationResult: any;
  errors: string[];
  warnings: string[];
  processingTime: number;
  reconciliationTime: number;
}

export interface BOColumnFilter {
  column: string;
  operator: 'equals' | 'contains' | 'startsWith' | 'endsWith' | 'regex';
  value: string;
  caseSensitive?: boolean;
}

@Injectable({
  providedIn: 'root'
})
export class AutoProcessingService {
  private processingModels: AutoProcessingModel[] = [];
  private apiUrl = '/api';
  /** Contexte permission pour les appels liés à la réconciliation (header ASCII) */
  static readonly RECONCILIATION_MODULE = 'Reconciliation';
  /** Contexte permission pour la gestion des modèles */
  static readonly MODELES_MODULE = 'Modeles';
  
  // Cache pour optimiser les performances
  private modelsCache: AutoProcessingModel[] = [];
  private cacheTimestamp: number = 0;
  private readonly CACHE_DURATION = 5 * 60 * 1000; // 5 minutes
  private isLoading = false;

  private buildContextHeaders(moduleContext?: string): HttpHeaders | undefined {
    const resolved = this.resolveModuleContext(moduleContext);
    return resolved ? new HttpHeaders({ 'X-Permission-Module': resolved }) : undefined;
  }

  private resolveModuleContext(moduleContext?: string): string | undefined {
    if (moduleContext === AutoProcessingService.MODELES_MODULE) {
      return moduleContext;
    }
    return this.appState.resolvePermissionModuleContext(
      moduleContext ?? AutoProcessingService.RECONCILIATION_MODULE
    );
  }

  constructor(
    private fileWatcherService: FileWatcherService,
    private reconciliationService: ReconciliationService,
    private fieldTypeDetectionService: FieldTypeDetectionService,
    private excelTypeDetectionService: ExcelTypeDetectionService,
    private specialFileDetectionService: SpecialFileDetectionService,
    private http: HttpClient,
    private appState: AppStateService
  ) {
    this.loadDefaultModels();
  }

  // Modèles de traitement prédéfinis
  private loadDefaultModels(): void {
    this.processingModels = [
      {
        id: 'bo-standard',
        name: 'BO Standard - Traitement automatique',
        filePattern: '*bo*.csv',
        fileType: 'bo',
        autoApply: true,
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        id: 'partner-standard',
        name: 'Partenaire Standard - Traitement automatique',
        filePattern: '*partner*.csv',
        fileType: 'partner',
        autoApply: true,
        createdAt: new Date(),
        updatedAt: new Date()
      }
    ];
  }

  // Méthodes CRUD pour les modèles avec cache
  async getAllModels(moduleContext?: string): Promise<AutoProcessingModel[]> {
    // Vérifier si le cache est valide
    if (this.isCacheValid()) {
      console.log('📋 Utilisation du cache pour getAllModels');
      return this.modelsCache;
    }

    // Éviter les requêtes multiples simultanées
    if (this.isLoading) {
      console.log('⏳ Requête en cours, attente...');
      return new Promise((resolve) => {
        const checkCache = () => {
          if (this.isCacheValid()) {
            resolve(this.modelsCache);
          } else {
            setTimeout(checkCache, 100);
          }
        };
        checkCache();
      });
    }

    this.isLoading = true;
    console.log('🔄 Chargement des modèles depuis l\'API...');

    try {
      const response = await this.http.get<any>(`${this.apiUrl}/auto-processing/models`, {
        headers: this.buildContextHeaders(moduleContext)
      }).toPromise();
      
      let models: AutoProcessingModel[] = [];
      
      if (response && response.success && response.models) {
        models = this.normalizeModels(response.models);
      } else if (Array.isArray(response)) {
        models = this.normalizeModels(response);
      } else {
        console.warn('Réponse inattendue de l\'API getAllModels:', response);
        models = [];
      }

      // Mettre à jour le cache
      this.updateCache(models);
      
      console.log(`✅ ${models.length} modèles chargés avec succès`);
      return models;
      
    } catch (error) {
      console.error('❌ Erreur lors de la récupération des modèles:', error);
      // Retourner les modèles par défaut en cas d'erreur
      return this.processingModels;
    } finally {
      this.isLoading = false;
    }
  }

  /**
   * Charge les modèles dans le contexte réconciliation (permissions module Réconciliation).
   */
  async getAllModelsUnrestricted(forceRefresh: boolean = false): Promise<AutoProcessingModel[]> {
    if (forceRefresh) {
      this.modelsCache = [];
      this.cacheTimestamp = 0;
    }
    return this.getAllModels(AutoProcessingService.RECONCILIATION_MODULE);
  }

  // Normaliser les modèles reçus du backend
  private normalizeModels(models: any[]): AutoProcessingModel[] {
    return models.map(model => this.normalizeModel(model));
  }

  // Normaliser un modèle individuel
  private normalizeModel(model: any): AutoProcessingModel {
    const rawId = model?.id;
    const modelId = model?.modelId
      ?? (typeof rawId === 'string' && !/^\d+$/.test(rawId) ? rawId : undefined);
    const dbId = typeof rawId === 'number'
      ? rawId
      : (/^\d+$/.test(String(rawId ?? '')) ? Number(rawId) : undefined);

    return {
      ...model,
      modelId: modelId ?? model?.modelId,
      id: modelId ?? (dbId != null ? String(dbId) : (rawId != null ? String(rawId) : undefined)),
      dbId,
      createdAt: model.createdAt ? new Date(model.createdAt) : undefined,
      updatedAt: model.updatedAt ? new Date(model.updatedAt) : undefined
    };
  }

  getModels(): Promise<AutoProcessingModel[]> {
    return this.getAllModels(AutoProcessingService.RECONCILIATION_MODULE);
  }

  getModelById(id: string, moduleContext: string = AutoProcessingService.RECONCILIATION_MODULE): Promise<AutoProcessingModel> {
    return this.http.get<any>(`${this.apiUrl}/auto-processing/models/${id}`, {
      headers: this.buildContextHeaders(moduleContext)
    }).toPromise()
      .then(response => {
        if (response && response.success && response.model) {
          return this.normalizeModel(response.model);
        } else {
          throw new Error('Modèle non trouvé');
        }
      });
  }

  createModel(model: AutoProcessingModel): Promise<AutoProcessingModel> {
    return this.http.post<any>(`${this.apiUrl}/auto-processing/models`, model, {
      headers: this.buildContextHeaders(AutoProcessingService.MODELES_MODULE)
    }).toPromise()
      .then(response => {
        if (response && response.success && response.model) {
          // Invalider le cache après création
          this.invalidateCache();
          console.log('✅ Cache invalidé après création');
          return this.normalizeModel(response.model);
        } else {
          throw new Error('Erreur lors de la création du modèle');
        }
      });
  }

  updateModel(id: string, model: AutoProcessingModel): Promise<AutoProcessingModel> {
    return this.http.put<any>(`${this.apiUrl}/auto-processing/models/${encodeURIComponent(id)}`, model, {
      headers: this.buildContextHeaders(AutoProcessingService.MODELES_MODULE)
    }).toPromise()
      .then(response => {
        if (response && response.success && response.model) {
          // Invalider le cache après mise à jour
          this.invalidateCache();
          console.log('✅ Cache invalidé après mise à jour');
          return this.normalizeModel(response.model);
        } else {
          throw new Error('Erreur lors de la mise à jour du modèle');
        }
      });
  }

  deleteModel(id: string): Promise<void> {
    return this.http.delete<any>(`${this.apiUrl}/auto-processing/models/${id}`).toPromise()
      .then(response => {
        console.log('🔍 [DEBUG] Delete response:', response);
        // Vérifier si la suppression a réussi
        if (response && (response.success === true || response.success === false)) {
          if (response.success === true) {
            // Invalider le cache après suppression réussie
            this.invalidateCache();
            console.log('✅ Cache invalidé après suppression');
            return;
          } else {
            throw new Error('Erreur lors de la suppression du modèle');
          }
        } else {
          // Si pas de réponse ou réponse invalide, considérer comme succès (compatibilité)
          console.warn('⚠️ Réponse de suppression invalide, considéré comme succès:', response);
          // Invalider le cache quand même
          this.invalidateCache();
          console.log('✅ Cache invalidé après suppression (réponse invalide)');
          return;
        }
      })
      .catch(error => {
        console.error('❌ Erreur HTTP lors de la suppression:', error);
        throw new Error('Erreur lors de la suppression du modèle');
      });
  }

  // Méthodes de traitement automatique
  async processFile(file: File): Promise<ProcessingResult> {
    const startTime = Date.now();
    const fileName = file.name;
    
    try {
      // Détecter le type de fichier
      const fileType = this.detectFileType(fileName);
      
      // Trouver le modèle approprié
      const matchingModel = this.findMatchingModel(fileName, fileType);
      
        if (!matchingModel) {
        return {
            success: false,
          fileName,
            modelId: '',
            originalData: [],
            processedData: [],
          errors: ['Aucun modèle de traitement trouvé pour ce fichier'],
            warnings: [],
          processingTime: Date.now() - startTime
        };
      }

      // Lire le fichier
      const data = await this.readFile(file);
      
      // Traiter les données
      const processedData = this.processData(data, matchingModel);
                
                return {
                  success: true,
        fileName,
                  modelId: matchingModel.id,
                  originalData: data,
        processedData,
        errors: [],
        warnings: [],
        processingTime: Date.now() - startTime
      };
      
        } catch (error) {
      return {
        success: false,
        fileName,
        modelId: '',
        originalData: [],
        processedData: [],
        errors: [error.message],
        warnings: [],
        processingTime: Date.now() - startTime
      };
    }
  }

  private detectFileType(fileName: string): 'bo' | 'partner' | 'both' | 'operation' {
    const lowerFileName = fileName.toLowerCase();
    
    if (lowerFileName.includes('bo') || lowerFileName.includes('backoffice')) {
      return 'bo';
    } else if (lowerFileName.includes('partner') || lowerFileName.includes('partenaire')) {
      return 'partner';
    } else if (lowerFileName.includes('operation') || lowerFileName.includes('operationbancaire')) {
      return 'operation';
    } else {
      return 'both';
    }
  }

  private findMatchingModel(fileName: string, fileType: 'bo' | 'partner' | 'both' | 'operation'): AutoProcessingModel | null {
    return this.processingModels.find(model => {
      const matches = this.matchesFilePattern(fileName, model.filePattern);
      const typeOk = model.fileType === fileType || model.fileType === 'both';
      return matches && typeOk;
    }) || null;
  }

  /**
   * Vérifie si un nom de fichier correspond à un pattern de modèle, de manière robuste
   * - Supporte wildcards (* et ?)
   * - Si le pattern contient une extension, on accepte aussi les variantes (.csv, .xls, .xlsx)
   * - Détection par inclusion sans extension (ex: "TRXBO" détecte "TRXBO_202501.xlsx")
   */
  private matchesFilePattern(fileName: string, pattern: string): boolean {
    if (!pattern || !fileName) return false;

    const lowerName = fileName.toLowerCase();
    const lowerPattern = pattern.toLowerCase();

    // Extensions acceptées comme équivalentes
    const acceptedExtensions = ['.csv', '.xls', '.xlsx'];
    
    // Extraire les extensions
    const getExtension = (name: string): string => {
      const match = name.match(/\.[^/.]+$/);
      return match ? match[0] : '';
    };
    
    const fileNameExt = getExtension(lowerName);
    const patternExt = getExtension(lowerPattern);
    
    // Noms sans extension
    const nameNoExt = lowerName.replace(/\.[^/.]+$/, '');
    const patternNoExt = lowerPattern.replace(/\.[^/.]+$/, '');

    // 1) Wildcards explicites
    if (patternNoExt.includes('*') || patternNoExt.includes('?')) {
      const regexPattern = patternNoExt
        .replace(/\./g, '\\.')
        .replace(/\*/g, '.*')
        .replace(/\?/g, '.');
      try {
        const regex = new RegExp(`^${regexPattern}$`, 'i');
        const matches = regex.test(nameNoExt);
        
        if (matches) {
          // Si le pattern a une extension acceptée, vérifier que l'extension du fichier est aussi acceptée
          if (patternExt && acceptedExtensions.includes(patternExt)) {
            return acceptedExtensions.includes(fileNameExt);
          }
          // Le pattern n'a pas d'extension spécifique ou extension non standard, accepter
          return true;
        }
      } catch {
        // ignorer pattern invalide
      }
    }

    // 2) Pattern avec extension: accepter mêmes bases avec .csv/.xls/.xlsx
    if (patternExt && acceptedExtensions.includes(patternExt)) {
      // Si le pattern a une extension acceptée, tester sans extension puis vérifier l'extension
      if (nameNoExt === patternNoExt) {
        // Correspondance exacte du nom, vérifier que l'extension est acceptée
        return acceptedExtensions.includes(fileNameExt);
      }
      
      // autoriser variantes d'extension usuelles
      if (nameNoExt.endsWith(patternNoExt) || nameNoExt.includes(patternNoExt)) {
        return acceptedExtensions.includes(fileNameExt);
      }
    } else if (patternExt) {
      // Extension non standard, correspondance exacte stricte
      if (lowerName === lowerPattern) return true;
    }

    // 3) Inclusion sans extension (fallback généreux)
    const cleanFileName = nameNoExt;
    const cleanPattern = patternNoExt;
    if (!cleanPattern) return false;
    
    const containsPattern = cleanFileName.includes(cleanPattern);
    const startsWithPattern = cleanFileName.startsWith(cleanPattern);
    
    if (containsPattern || startsWithPattern) {
      // Si le pattern avait une extension acceptée, vérifier que l'extension du fichier est aussi acceptée
      if (patternExt && acceptedExtensions.includes(patternExt)) {
        return acceptedExtensions.includes(fileNameExt);
      }
      return true;
    }
    
    return false;
  }

  private async readFile(file: File): Promise<any[]> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const csv = e.target.result as string;
          const lines = csv.split('\n');
          const headers = lines[0].split(',').map(h => h.trim());
          const data = lines.slice(1).map(line => {
            const values = line.split(',').map(v => v.trim());
            const row: any = {};
            headers.forEach((header, index) => {
              row[header] = values[index] || '';
            });
      return row;
    });
          resolve(data);
    } catch (error) {
          reject(error);
        }
      };
      reader.onerror = reject;
      reader.readAsText(file);
    });
  }

  private processData(data: any[], model: AutoProcessingModel): any[] {
    // Traitement de base - retourner les données telles quelles
    // La logique de traitement spécifique a été supprimée
    return data;
  }

  // Méthodes utilitaires
  getModelsCount(): number {
    return this.processingModels.length;
  }

  getModelsByType(type: 'bo' | 'partner' | 'both'): AutoProcessingModel[] {
    return this.processingModels.filter(model => model.fileType === type);
  }

  // ===== MÉTHODES POUR LES RÈGLES DE TRAITEMENT DES COLONNES =====

  // Récupérer les règles de traitement des colonnes pour un modèle
  getColumnProcessingRules(
    modelId: string,
    moduleContext: string = AutoProcessingService.RECONCILIATION_MODULE
  ): Promise<ColumnProcessingRule[]> {
    return this.http.get<{success: boolean, rules: ColumnProcessingRule[]}>(`${this.apiUrl}/auto-processing/models/${modelId}/column-rules`, {
      headers: this.buildContextHeaders(moduleContext)
    })
      .toPromise()
      .then(response => response?.rules || []);
  }

  // Créer une nouvelle règle de traitement
  createColumnProcessingRule(modelId: string, rule: ColumnProcessingRule): Promise<ColumnProcessingRule> {
    return this.http.post<{success: boolean, rule: ColumnProcessingRule}>(`${this.apiUrl}/auto-processing/models/${modelId}/column-rules`, rule)
      .toPromise()
      .then(response => response?.rule);
  }

  // Mettre à jour une règle de traitement
  updateColumnProcessingRule(ruleId: number, rule: ColumnProcessingRule): Promise<ColumnProcessingRule> {
    return this.http.put<{success: boolean, rule: ColumnProcessingRule}>(`${this.apiUrl}/auto-processing/column-rules/${ruleId}`, rule)
      .toPromise()
      .then(response => response?.rule);
  }

  // Supprimer une règle de traitement
  deleteColumnProcessingRule(ruleId: number): Promise<boolean> {
    return this.http.delete<{success: boolean}>(`${this.apiUrl}/auto-processing/column-rules/${ruleId}`)
      .toPromise()
      .then(response => response?.success || false);
  }

  // Sauvegarder toutes les règles d'un modèle en batch
  saveColumnProcessingRulesBatch(modelId: string, rules: ColumnProcessingRule[]): Promise<ColumnProcessingRule[]> {
    return this.http.post<{success: boolean, rules: ColumnProcessingRule[]}>(`${this.apiUrl}/auto-processing/models/${modelId}/column-rules/batch`, rules)
      .toPromise()
      .then(response => response?.rules || []);
  }

  // Traiter des données avec les règles d'un modèle
  processDataWithRules(modelId: string, data: any[], moduleContext: string = AutoProcessingService.RECONCILIATION_MODULE): Promise<any[]> {
    return this.http.post<{success: boolean, processedData: any[]}>(`${this.apiUrl}/auto-processing/process-data/${modelId}`, data, {
      headers: this.buildContextHeaders(moduleContext)
    })
      .toPromise()
      .then(response => response?.processedData || []);
  }

  // Traiter une ligne unique avec les règles d'un modèle
  processSingleRowWithRules(modelId: string, row: any, moduleContext: string = AutoProcessingService.RECONCILIATION_MODULE): Promise<any> {
    return this.http.post<{success: boolean, processedData: any}>(`${this.apiUrl}/auto-processing/process-single-row/${modelId}`, row, {
      headers: this.buildContextHeaders(moduleContext)
    })
      .toPromise()
      .then(response => response?.processedData);
  }

  // Obtenir les colonnes cibles d'un modèle
  getTargetColumns(modelId: string, moduleContext: string = AutoProcessingService.RECONCILIATION_MODULE): Promise<string[]> {
    return this.http.get<{success: boolean, targetColumns: string[]}>(`${this.apiUrl}/auto-processing/models/${modelId}/target-columns`, {
      headers: this.buildContextHeaders(moduleContext)
    })
      .toPromise()
      .then(response => response?.targetColumns || []);
  }

  // Valider les règles d'un modèle
  validateRules(
    modelId: string,
    moduleContext: string = AutoProcessingService.RECONCILIATION_MODULE
  ): Promise<boolean> {
    return this.http.get<{success: boolean, isValid: boolean}>(`${this.apiUrl}/auto-processing/models/${modelId}/validate-rules`, {
      headers: this.buildContextHeaders(moduleContext)
    })
      .toPromise()
      .then(response => response?.isValid || false);
  }

  /**
   * Vérifie si le cache est valide
   */
  private isCacheValid(): boolean {
    return this.modelsCache.length > 0 && 
           (Date.now() - this.cacheTimestamp) < this.CACHE_DURATION;
  }

  /**
   * Met à jour le cache
   */
  private updateCache(models: AutoProcessingModel[]): void {
    this.modelsCache = models;
    this.cacheTimestamp = Date.now();
    console.log('💾 Cache mis à jour');
  }

  /**
   * Invalide le cache (appelé après modifications)
   */
  private invalidateCache(): void {
    this.modelsCache = [];
    this.cacheTimestamp = 0;
    console.log('🗑️ Cache invalidé');
  }
} 