import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { SharedUiModule } from '../../shared/shared-ui.module';
import { CdkDragDrop, moveItemInArray } from '@angular/cdk/drag-drop';
import { FormBuilder, FormGroup, Validators, FormArray, FormControl } from '@angular/forms';
import { AutoProcessingService, AutoProcessingModel, DEFAULT_PRE_PROCESSING_SECTION_ORDER, ENV_COLUMN_NAME, ENV_COLUMN_OPTIONS, EnvColumnOption, ModelColumnMathRule, ModelFormatAction, ModelFormatActionType, ModelFormatColumnSettings, ModelPreProcessingConfig, ModelPreProcessingSectionId, ModelRowFilter, ModelColumnValueMapping, ModelColumnConcatRule, ModelColumnRenameRule, ModelEnvColumnConfig, ModelExportColumnFilterConfig, PartnerConditionalKeyRule, PartnerConditionalKeysConfig, BoConditionalKeysConfig, TrxboOppartConfig, TrxboRegularisationRule, TrxboRegularisationComponent, TrxboAggregationType } from '../../services/auto-processing.service';
import { FileWatcherService } from '../../services/file-watcher.service';
import { AppStateService } from '../../services/app-state.service';
import { ModelManagementService } from '../../services/model-management.service';
import { PopupService } from '../../services/popup.service';
import { ConfigurationCalculService } from '../../services/configuration-calcul.service';
import { ModelPreProcessingService } from '../../services/model-preprocessing.service';
import { TranslateModule } from '@ngx-translate/core';
import { I18nService } from '../../services/i18n/i18n.service';

/** Identifiants internes des catégories de modèles (clés de regroupement, jamais traduits). */
const CATEGORY_CASHIN = 'Partenaire CASHIN';
const CATEGORY_PAIEMENT = 'Partenaire PAIEMENT';
const CATEGORY_BACK_OFFICE = 'Back Office';

/** Clés i18n des libellés de catégorie, utilisées uniquement pour l'affichage. */
const CATEGORY_LABEL_KEYS: Record<string, string> = {
  [CATEGORY_CASHIN]: 'APM.categoryCashin',
  [CATEGORY_PAIEMENT]: 'APM.categoryPaiement',
  [CATEGORY_BACK_OFFICE]: 'APM.categoryBackOffice'
};

/** Clés i18n des descriptions de catégorie, utilisées uniquement pour l'affichage. */
const CATEGORY_DESCRIPTION_KEYS: Record<string, string> = {
  [CATEGORY_CASHIN]: 'APM.categoryCashinDesc',
  [CATEGORY_PAIEMENT]: 'APM.categoryPaiementDesc',
  [CATEGORY_BACK_OFFICE]: 'APM.categoryBackOfficeDesc'
};

/**
 * Règle de la bibliothèque de logique de réconciliation.
 * `id` et `description` sont persistés tels quels dans le modèle : ils ne sont
 * jamais traduits, seule l'affichage passe par `labelKey` / `descriptionKey`.
 */
interface ReconciliationLogicRulePreset {
  id: string;
  condition: string;
  action: string;
  description: string;
  labelKey: string;
  descriptionKey: string;
}

const RECONCILIATION_LOGIC_LIBRARY: Record<string, ReconciliationLogicRulePreset[]> = {
  STANDARD: [
    {
      id: 'Correspondance Parfaite Standard',
      condition: 'partnerMatches == 1',
      action: 'MARK_AS_MATCH',
      description: 'Une correspondance exacte entre BO et Partenaire',
      labelKey: 'APM.logicStandardMatch',
      descriptionKey: 'APM.logicStandardMatchDesc'
    },
    {
      id: 'Écart Standard',
      condition: 'partnerMatches != 1',
      action: 'MARK_AS_MISMATCH',
      description: 'Nombre de correspondances différent de 1',
      labelKey: 'APM.logicStandardGap',
      descriptionKey: 'APM.logicStandardGapDesc'
    }
  ],
  SPECIAL_RATIO: [
    {
      id: 'Correspondance Parfaite TRXBO/OPPART',
      condition: 'partnerMatches == 2',
      action: 'MARK_AS_MATCH',
      description: 'Une ligne TRXBO correspond exactement à 2 lignes OPPART',
      labelKey: 'APM.logicTrxboOppartMatch',
      descriptionKey: 'APM.logicTrxboOppartMatchDesc'
    },
    {
      id: 'Écart Insuffisant',
      condition: 'partnerMatches < 2',
      action: 'MARK_AS_MISMATCH',
      description: 'Moins de 2 correspondances OPPART pour une ligne TRXBO',
      labelKey: 'APM.logicInsufficientGap',
      descriptionKey: 'APM.logicInsufficientGapDesc'
    },
    {
      id: 'Écart Excessif',
      condition: 'partnerMatches > 2',
      action: 'MARK_AS_MISMATCH',
      description: 'Plus de 2 correspondances OPPART pour une ligne TRXBO',
      labelKey: 'APM.logicExcessiveGap',
      descriptionKey: 'APM.logicExcessiveGapDesc'
    }
  ]
};

// Interface pour les règles de traitement des colonnes
interface ColumnProcessingRule {
  id?: number;
  sourceColumn: string;
  sourceColumns?: string[]; // Support pour les colonnes multiples
  targetColumn: string;
  formatType?: string;
  toUpperCase?: boolean;
  toLowerCase?: boolean;
  trimSpaces?: boolean;
  removeSpecialChars?: boolean;
  removeAccents?: boolean;
  stringToRemove?: string;
  padZeros?: boolean;
  regexReplace?: string;
  specialCharReplacementMap?: { [key: string]: string };
  ruleOrder?: number;
}

/**
 * Libellés d'opérations OPPART et commentaires TRXBO/OPPART par défaut.
 * Ils doivent rester alignés sur TrxboOppartConfig (backend) : toute valeur saisie dans
 * l'écran de configuration est prioritaire sur ces valeurs.
 */
interface TrxboOppartDefaults {
  operationTypes: { impact: string; fees: string; commission: string };
  comments: {
    tsop: string;
    trxsf: string;
    rgfrais: string;
    trxsvc: string;
    fraisSansCommission: string;
    regcom: string;
    fraisEtCommission: string;
    trxsfTrxsvc: string;
    ecart: string;
    partnerOnly: string;
  };
  additionalOperationTypes: TrxboAdditionalOperationType[];
  regularisationRules: TrxboRegularisationRule[];
  aggregationTypes: TrxboAggregationType[];
}

/**
 * Type d'opération supplémentaire déclaré pour le modèle, avec son commentaire associé.
 * Aligne sur TrxboOppartConfig.AdditionalOperationType (backend).
 */
interface TrxboAdditionalOperationType {
  label?: string;
  commentBo?: string;
  commentPartner?: string;
}

const DEFAULT_TRXBO_OPPART_CONFIG: TrxboOppartDefaults = {
  operationTypes: {
    impact: 'IMPACT_COMPTE_GENERAL',
    fees: 'FRAIS_TRANSACTION',
    commission: 'VERSEMENT_COMMISSION'
  },
  comments: {
    tsop: 'TSOP',
    trxsf: 'TRXSF',
    rgfrais: 'RGFRAIS',
    trxsvc: 'TRXSVC',
    fraisSansCommission: 'TRXSC',
    regcom: 'REGCOM',
    fraisEtCommission: 'RGFRAIS & REGCOM',
    trxsfTrxsvc: 'TRXSF & TRXSVC',
    ecart: 'Ecart',
    partnerOnly: 'Ecart'
  },
  additionalOperationTypes: [],
  regularisationRules: [],
  aggregationTypes: []
};

@Component({
  selector: 'app-auto-processing-models',
  standalone: true,
  imports: [TranslateModule, SharedUiModule],
  templateUrl: './auto-processing-models.component.html',
  styleUrls: ['./auto-processing-models.component.css']
})
export class AutoProcessingModelsComponent implements OnInit {
  models: AutoProcessingModel[] = [];
  modelForm: FormGroup;
  availableFiles: any[] = [];
  availableColumns: string[] = [];
  availableColumnsForTemplate: string[] = [];
  availableBOModels: AutoProcessingModel[] = [];
  availableBOColumns: string[] = [];
  loading = false;
  errorMessage = '';
  successMessage = '';
  editingModel: AutoProcessingModel | null = null;
  showCreateForm = false;
  isDuplicatingModel = false;
  
  // Propriétés pour forcer la mise à jour des classes CSS
  forceUpdate = false;
  
  // Nouvelles propriétés pour les règles de traitement des colonnes (ancien)
  columnProcessingRules: ColumnProcessingRule[] = [];
  showColumnRulesSection = false;
  editingRule: ColumnProcessingRule | null = null;
  ruleForm: FormGroup;

  // OPTIMISATION: regroupement des modèles par catégorie précalculé une seule fois
  // par filtrage (au lieu de le recalculer à chaque cycle de détection de changement).
  modelsByCategory: { [category: string]: AutoProcessingModel[] } = {
    [CATEGORY_CASHIN]: [],
    [CATEGORY_PAIEMENT]: [],
    [CATEGORY_BACK_OFFICE]: []
  };
  filteredCategories: string[] = [];

  // OPTIMISATION: cache des colonnes pré-traitées (getPreProcessingColumns est appelé
  // ~15 fois par cycle de CD). Invalidé automatiquement car les tableaux sources sont
  // réassignés (jamais mutés en place) : la comparaison de références suffit.
  private preProcessingColumnsCache?: {
    templateRef: string[];
    forTemplateRef: string[];
    availableRef: string[];
    columns: string[];
  };
  
  // Propriétés pour la configuration des modèles autonomes
  showReconciliationLogicSection = false;
  showCorrespondenceRulesSection = false;
  showComparisonColumnsSection = false;
  showColumnProcessingSection = false;
  showRowFiltersSection = false;
  showFormatActionsSection = false;
  showColumnConcatSection = false;
  showColumnMathSection = false;
  showValueMappingsSection = false;
  showColumnRenameSection = false;
  showEnvColumnSection = false;
  showExportColumnFilterSection = false;
  modelEnvColumnEnabled = false;
  modelEnvColumnValue: EnvColumnOption | '' = '';
  modelExportColumnFilterEnabled = false;
  modelExportColumns: string[] = [];
  modelExportColumnKeepMap: Record<string, boolean> = {};
  readonly envColumnName = ENV_COLUMN_NAME;
  readonly envColumnOptions = ENV_COLUMN_OPTIONS;
  modelRowFilters: ModelRowFilter[] = [];
  modelFormatActions: ModelFormatAction[] = [];
  modelColumnConcatRules: ModelColumnConcatRule[] = [];
  modelColumnMathRules: ModelColumnMathRule[] = [];
  modelValueMappings: ModelColumnValueMapping[] = [];
  modelColumnRenameRules: ModelColumnRenameRule[] = [];
  preProcessingSectionOrder: ModelPreProcessingSectionId[] = [...DEFAULT_PRE_PROCESSING_SECTION_ORDER];
  readonly preProcessingSectionLabelKeys: Record<ModelPreProcessingSectionId, string> = {
    rowFilters: 'APM.Filtrerleslignes',
    formatActions: 'APM.Formatageautomatique',
    columnConcatRules: 'APM.Concaténerplusieurscolonnes',
    columnMathRules: 'APM.Additionsoustractiondecolonnes',
    valueMappings: 'APM.Renommerlesvaleursdecolonnes',
    columnRenameRules: 'APM.Renommerunentêtedecolonne'
  };
  nextModelFilterId = 1;
  nextModelConcatRuleId = 1;
  nextModelMathRuleId = 1;
  nextModelValueMappingId = 1;
  nextModelColumnRenameId = 1;
  nextModelFormatActionId = 1;
  newFormatActionType: ModelFormatActionType = 'removeCharacters';
  readonly formatActionTypes: Array<{ type: ModelFormatActionType; labelKey: string }> = [
    { type: 'removeSpecialStrings', labelKey: 'APM.actionRemoveSpecialStrings' },
    { type: 'removeCharacters', labelKey: 'APM.actionRemoveCharacters' },
    { type: 'removeNumbers', labelKey: 'APM.actionRemoveNumbers' },
    { type: 'removeIndicatif', labelKey: 'APM.actionRemoveIndicatif' },
    { type: 'removeDecimals', labelKey: 'APM.actionRemoveDecimals' },
    { type: 'keepLastDigits', labelKey: 'APM.actionKeepLastDigits' },
    { type: 'removeZeroDecimals', labelKey: 'APM.actionRemoveZeroDecimals' },
    { type: 'removeSpaces', labelKey: 'APM.actionRemoveSpaces' }
  ];
  
  // États d'édition
  editingReconciliationLogic = false;
  
  // Règles de correspondance
  correspondenceRules: any[] = [];
  editingCorrespondenceRule: any = null;
  correspondenceRuleForm: FormGroup;
  
  // Colonnes de comparaison
  comparisonColumns: any[] = [];
  editingComparisonColumn: any = null;
  comparisonColumnForm: FormGroup;
  
  // Règles de traitement des colonnes (nouvelle structure)
  editingColumnProcessingRule: any = null;
  columnProcessingRuleForm: FormGroup;
  
  // Clés sélectionnées
  selectedPartnerKeys: string[] = [];
  selectedBOModels: string[] = [];
  selectedBOKeys: string[] = [];
  /** Colonnes du fichier modèle de chaque modèle BO sélectionné (une liste par modèle). */
  boModelFileColumns: Record<string, string[]> = {};
  /** Clés BO choisies pour chaque modèle BO sélectionné. */
  boModelKeySelection: Record<string, string[]> = {};
  /** Colonnes réellement présentes dans le fichier modèle (sans colonnes ajoutées par la configuration). */
  templateFileColumns: string[] = [];

  /** Clés partenaire conditionnelles (optionnel). */
  partnerConditionalKeysEnabled = false;
  partnerConditionColumn = '';
  partnerConditionalDefaultKeyColumn = '';
  partnerConditionalEnvEnabled = false;
  partnerConditionalEnvValue: EnvColumnOption | '' = '';
  partnerConditionalKeyRules: PartnerConditionalKeyRule[] = [];

  /** Clés BO conditionnelles (optionnel). */
  boConditionalKeysEnabled = false;
  boConditionColumn = '';
  boConditionalDefaultKeyColumn = '';
  boConditionalKeyRules: PartnerConditionalKeyRule[] = [];
  
  // Colonnes disponibles pour le fichier modèle
  availableTemplateColumns: string[] = [];

  /** Évite les réinitialisations lors du chargement programmatique d'un modèle en édition. */
  private isRestoringModelState = false;
  
  // Sélection multiple de colonnes
  selectedColumns: string[] = [];
  
  // États de chargement
  isLoadingTemplateColumns = false;
  isLoadingBOColumns = false;

  // Import du fichier modèle (CSV / Excel) depuis le poste de travail
  isUploadingTemplateFile = false;
  templateUploadError = '';
  private readonly allowedModelExtensions = ['.csv', '.xls', '.xlsx', '.xlsm', '.xlsb', '.xlt', '.xltx', '.xltm'];
  readonly modelFileAccept = '.csv,.xls,.xlsx,.xlsm,.xlsb,.xlt,.xltx,.xltm';
  readonly modelFileFormatsLabel = '.csv, .xls, .xlsx';
  
  // Options pour les types de format
  formatTypes = [
    { value: 'string', labelKey: 'APM.dataTypeText' },
    { value: 'numeric', labelKey: 'APM.dataTypeNumeric' },
    { value: 'date', labelKey: 'TBL.date' },
    { value: 'boolean', labelKey: 'APM.dataTypeBoolean' }
  ];

  // Nouvelles propriétés pour le filtrage
  filterGroup: string = '';
  filterCountry: string = '';
  filterName: string = '';
  filteredModels: AutoProcessingModel[] = [];
  availableGroups: string[] = [];
  availableCountries: string[] = [];

  constructor(
    private fb: FormBuilder,
    private autoProcessingService: AutoProcessingService,
    private fileWatcherService: FileWatcherService,
    private cdr: ChangeDetectorRef,
    private appStateService: AppStateService,
    private modelManagementService: ModelManagementService,
    private popupService: PopupService,
    private modelPreProcessingService: ModelPreProcessingService,
    private calculService: ConfigurationCalculService
  ) {
    this.modelForm = this.fb.group({
      name: ['', Validators.required],
      filePattern: ['', Validators.required],
      fileType: ['bo', Validators.required],
      autoApply: [true],
      bankModel: [false],
      templateFile: [''],
      reconciliationKeys: this.fb.group({
        partnerKeys: [[]],
        boKeys: [[]],
        boModels: [[]],
        boModelKeys: this.fb.group({}),
        boTreatments: this.fb.group({})
      }),
      // Nouveaux champs pour la configuration autonome
      logicType: ['STANDARD'],
      expectedRatio: ['1:1'],
      logicDescription: [''],
      tolerance: [0.0],
      // Libellés d'opérations et commentaires de la logique TRXBO/OPPART (SPECIAL_RATIO)
      trxboOppart: this.fb.group({
        impactType: [DEFAULT_TRXBO_OPPART_CONFIG.operationTypes.impact],
        feesType: [DEFAULT_TRXBO_OPPART_CONFIG.operationTypes.fees],
        commissionType: [DEFAULT_TRXBO_OPPART_CONFIG.operationTypes.commission],
        commentTsop: [DEFAULT_TRXBO_OPPART_CONFIG.comments.tsop],
        commentTrxsf: [DEFAULT_TRXBO_OPPART_CONFIG.comments.trxsf],
        commentRgfrais: [DEFAULT_TRXBO_OPPART_CONFIG.comments.rgfrais],
        commentTrxsvc: [DEFAULT_TRXBO_OPPART_CONFIG.comments.trxsvc],
        commentFraisSansCommission: [DEFAULT_TRXBO_OPPART_CONFIG.comments.fraisSansCommission],
        commentRegcom: [DEFAULT_TRXBO_OPPART_CONFIG.comments.regcom],
        commentFraisEtCommission: [DEFAULT_TRXBO_OPPART_CONFIG.comments.fraisEtCommission],
        commentTrxsfTrxsvc: [DEFAULT_TRXBO_OPPART_CONFIG.comments.trxsfTrxsvc],
        commentEcart: [DEFAULT_TRXBO_OPPART_CONFIG.comments.ecart],
        commentPartnerOnly: [DEFAULT_TRXBO_OPPART_CONFIG.comments.partnerOnly],
        additionalTypes: this.fb.array<FormGroup>([]),
        regularisationRules: this.fb.array<FormGroup>([]),
        aggregationTypes: this.fb.array<FormGroup>([])
      })
    });

    // Initialiser le formulaire pour les règles de traitement des colonnes (ancien)
    this.ruleForm = this.fb.group({
      sourceColumn: ['', Validators.required],
      targetColumn: ['', Validators.required],
      formatType: ['string'],
      toUpperCase: [false],
      toLowerCase: [false],
      trimSpaces: [false],
      removeSpecialChars: [false],
      stringToRemove: [''],
      padZeros: [false],
      regexReplace: [''],
      specialCharReplacementMap: this.fb.group({})
    });

    // Initialiser le formulaire pour les règles de correspondance
    this.correspondenceRuleForm = this.fb.group({
      name: ['', Validators.required],
      condition: ['', Validators.required],
      action: ['', Validators.required],
      description: ['']
    });

    // Initialiser le formulaire pour les colonnes de comparaison
    this.comparisonColumnForm = this.fb.group({
      boColumn: ['', Validators.required],
      partnerColumn: ['', Validators.required],
      comparisonType: ['AUTO', Validators.required],
      tolerance: [0.01]
    });

    // Initialiser le formulaire pour les règles de traitement des colonnes (nouveau)
    this.columnProcessingRuleForm = this.fb.group({
      sourceColumn: [''], // Plus requis car on utilise la sélection multiple
      targetColumn: [''], // Plus requis car on utilise la sélection multiple
      formatType: [''],
      toUpperCase: [false],
      toLowerCase: [false],
      trimSpaces: [false],
      removeSpecialChars: [true],
      removeAccents: [false],
      stringToRemove: [''],
      padZeros: [false],
      regexReplace: [''],
      specialCharReplacementMap: this.fb.group({})
    });

    this.modelForm.get('fileType')?.valueChanges.subscribe(fileType => {
      this.updateReconciliationKeysValidation(fileType);
      
      // Réinitialiser les clés de réconciliation si le type est BO
      if (fileType === 'bo') {
        this.resetReconciliationKeysForBO();
        this.resetReconciliationLogicForBO();
      }
      
      // Réinitialiser le pattern seulement si on n'est pas en mode édition
      if (!this.editingModel && this.modelForm.get('filePattern')?.value) {
        this.modelForm.patchValue({ filePattern: '' });
      }
      
      if (fileType === 'partner') {
        // Pour les modèles partenaires, charger les colonnes TRXBO pour les clés BO
        this.loadColumnsForBOType();
        // Et aussi les colonnes partenaires si nécessaire
        if (this.availableColumnsForTemplate.length === 0) {
          this.loadColumnsForPartnerType();
        }
      } else if (fileType === 'bo' && this.availableColumnsForTemplate.length === 0) {
        this.loadColumnsForBOType();
      } else if (fileType === 'operation' && this.availableColumnsForTemplate.length === 0) {
        this.loadColumnsForOperationType();
      }
    });

    // Écouter les changements du fichier modèle pour charger les colonnes
    this.modelForm.get('templateFile')?.valueChanges.subscribe(templateFile => {
      if (templateFile) {
        this.loadTemplateColumns();
        // Charger automatiquement les colonnes pour les règles de traitement
        this.ensureModelColumnsLoaded();
      } else {
        // Réinitialiser les colonnes si aucun fichier n'est sélectionné
        this.availableTemplateColumns = [];
        this.selectedPartnerKeys = [];
        this.availableColumnsForTemplate = [];
      }
    });

    this.modelForm.get('reconciliationKeys.boModels')?.valueChanges.subscribe(() => {
      this.onBOModelsChange();
    });

    // Écouter les changements du type de fichier
    this.modelForm.get('fileType')?.valueChanges.subscribe(fileType => {
      console.log('🔄 Changement de type de fichier détecté:', fileType);
      
      if (fileType === 'bo') {
        // Réinitialiser les clés de réconciliation pour les fichiers BO
        this.selectedPartnerKeys = [];
        this.selectedBOModels = [];
        this.availableTemplateColumns = [];
      } else if (fileType === 'operation') {
        // Réinitialiser pour les fichiers Operation
        this.selectedPartnerKeys = [];
        this.selectedBOModels = [];
        this.availableTemplateColumns = [];
      }
      
      // Charger automatiquement les colonnes appropriées pour le nouveau type
      this.ensureModelColumnsLoaded();
    });
  }

  ngOnInit(): void {
    this.calculService.loadRules().subscribe();
    this.loadAvailableFiles().then(() => {
      this.loadModels();
      
      if (this.availableFiles.length > 0 && this.availableColumns.length === 0) {
        const firstFile = this.availableFiles[0];
        
        if (firstFile.columns && firstFile.columns.length > 0) {
          this.availableColumns = firstFile.columns;
          this.modelForm.updateValueAndValidity();
        }
      }
    });
  }

  loadModels(): void {
    this.autoProcessingService.getAllModels(AutoProcessingService.MODELES_MODULE).then(models => {
        if (Array.isArray(models)) {
          this.models = models;
          
          // Filtrer les modèles BO disponibles
          this.availableBOModels = models.filter(model => model.fileType === 'bo');
          console.log('📋 Modèles BO disponibles:', this.availableBOModels);
          
          this.preloadBOModelColumns();
          // Les règles de colonnes sont chargées à l'édition du modèle, pas ici (évite les courses async)
          
          // Initialiser les filtres et appliquer le filtrage
          this.initializeFilters();
          this.applyFilters();
        } else {
          console.warn('La réponse getAllModels n\'est pas un tableau:', models);
          this.models = [];
          this.filteredModels = [];
          this.recomputeModelGroups();
          this.errorMessage = I18nService.t('APM.errorInvalidModelsResponse');
        }
    }).catch(error => {
        console.error('Erreur lors du chargement des modèles:', error);
        this.errorMessage = I18nService.t('APM.errorLoadModels');
        this.models = [];
        this.filteredModels = [];
        this.recomputeModelGroups();
    });
  }

  /**
   * Initialise les options de filtrage disponibles
   */
  private initializeFilters(): void {
    // Extraire les groupes uniques
    const groups = new Set<string>();
    const countries = new Set<string>();
    
    this.models.forEach(model => {
      // Ajouter le groupe (catégorie)
      const category = this.getModelCategory(model);
      groups.add(category);
      
      // Extraire le pays du nom du modèle
      const country = this.extractCountryFromModelName(model.name);
      if (country) {
        countries.add(country);
      }
    });
    
    this.availableGroups = Array.from(groups).sort();
    this.availableCountries = Array.from(countries).sort();
    
    console.log('🔍 Options de filtrage initialisées:', {
      groups: this.availableGroups,
      countries: this.availableCountries
    });

    // Définir par défaut l'affichage des modèles Back Office si disponible
    if (!this.hasActiveFilters() && this.availableGroups.includes(CATEGORY_BACK_OFFICE)) {
      this.filterGroup = CATEGORY_BACK_OFFICE;
    }
  }

  /**
   * Extrait le pays du nom du modèle selon la règle spécifiée
   * Exemple: "Modèle basé sur CIMTNCM" -> "CM"
   */
  private extractCountryFromModelName(modelName: string): string | null {
    // Chercher le pattern "Modèle basé sur" suivi du nom
    const match = modelName.match(/Modèle basé sur\s+([A-Z]+)/i);
    if (match && match[1]) {
      const baseName = match[1];
      // Prendre les deux dernières lettres comme code pays
      if (baseName.length >= 2) {
        return baseName.slice(-2).toUpperCase();
      }
    }
    
    // Fallback: chercher directement dans le nom du modèle
    const countryMatch = modelName.match(/([A-Z]{2})$/);
    if (countryMatch) {
      return countryMatch[1];
    }
    
    return null;
  }

  /**
   * Extrait le nom du modèle après "Modèle basé sur"
   */
  private extractModelBaseName(modelName: string): string {
    const match = modelName.match(/Modèle basé sur\s+(.+)/i);
    if (match && match[1]) {
      return match[1].trim();
    }
    return modelName;
  }

  /**
   * Applique les filtres sur les modèles
   */
  applyFilters(): void {
    console.log('🔍 Application des filtres:', {
      group: this.filterGroup,
      country: this.filterCountry,
      name: this.filterName
    });
    
    this.filteredModels = this.models.filter(model => {
      // Filtre par groupe (catégorie)
      if (this.filterGroup && this.getModelCategory(model) !== this.filterGroup) {
        return false;
      }
      
      // Filtre par pays
      if (this.filterCountry) {
        const modelCountry = this.extractCountryFromModelName(model.name);
        if (!modelCountry || modelCountry !== this.filterCountry) {
          return false;
        }
      }
      
      // Filtre par nom (recherche dans le nom après "Modèle basé sur")
      if (this.filterName) {
        const baseName = this.extractModelBaseName(model.name);
        if (!baseName.toLowerCase().includes(this.filterName.toLowerCase())) {
          return false;
        }
      }
      
      return true;
    });
    
    // OPTIMISATION: précalculer le regroupement par catégorie une seule fois
    this.recomputeModelGroups();
    
    console.log('✅ Filtrage appliqué:', {
      totalModels: this.models.length,
      filteredModels: this.filteredModels.length,
      filters: {
        group: this.filterGroup,
        country: this.filterCountry,
        name: this.filterName
      }
    });
  }

  /**
   * Réinitialise tous les filtres
   */
  resetFilters(): void {
    this.filterGroup = '';
    this.filterCountry = '';
    this.filterName = '';
    this.applyFilters();
  }

  /**
   * Vérifie si des filtres sont actifs
   */
  hasActiveFilters(): boolean {
    return !!(this.filterGroup || this.filterCountry || this.filterName);
  }

  /**
   * Obtient le nombre de modèles filtrés
   */
  getFilteredModelsCount(): number {
    return this.filteredModels.length;
  }

  /**
   * Obtient les modèles filtrés par catégorie (précalculé dans recomputeModelGroups)
   */
  getFilteredModelsByCategory(): { [category: string]: AutoProcessingModel[] } {
    return this.modelsByCategory;
  }

  /**
   * Obtient les catégories actives parmi les modèles filtrés (précalculé)
   */
  getActiveFilteredCategories(): string[] {
    return this.filteredCategories;
  }

  /**
   * Obtient le nombre de modèles filtrés par catégorie (précalculé)
   */
  getFilteredCategoryCount(category: string): number {
    return this.modelsByCategory[category]?.length || 0;
  }

  /**
   * OPTIMISATION: précalcule le regroupement des modèles par catégorie.
   * À appeler après chaque modification de filteredModels.
   */
  private recomputeModelGroups(): void {
    const groupedModels: { [category: string]: AutoProcessingModel[] } = {
      [CATEGORY_CASHIN]: [],
      [CATEGORY_PAIEMENT]: [],
      [CATEGORY_BACK_OFFICE]: []
    };

    this.filteredModels.forEach(model => {
      const category = this.getModelCategory(model);
      if (groupedModels[category]) {
        groupedModels[category].push(model);
      }
    });

    this.modelsByCategory = groupedModels;
    this.filteredCategories = Object.keys(groupedModels).filter(category => groupedModels[category].length > 0);
  }

  /**
   * trackBy pour les listes de règles (évite de re-rendre toutes les règles à chaque appui)
   */
  trackByRule(index: number, rule: ColumnProcessingRule): any {
    return rule?.id ?? `${rule?.sourceColumn}_${rule?.targetColumn}_${rule?.ruleOrder}`;
  }

  /**
   * trackBy pour les listes de chaînes (colonnes, catégories)
   */
  trackByString(index: number, value: string): string {
    return value;
  }

  /**
   * trackBy pour la liste des modèles
   */
  trackByModel(index: number, model: AutoProcessingModel): any {
    return model?.modelId ?? model?.id;
  }

  // Charger les règles de traitement des colonnes pour un modèle
  loadColumnProcessingRules(modelId: string, embeddedRules?: ColumnProcessingRule[]): void {
    // OPTIMISATION: si les règles sont déjà embarquées dans la liste /models (avec
    // findAllWithRules), on évite un aller-retour /models/{id}/column-rules redondant.
    if (Array.isArray(embeddedRules)) {
      this.applyLoadedRules(embeddedRules, false);
      return;
    }
    this.autoProcessingService.getColumnProcessingRules(modelId, AutoProcessingService.MODELES_MODULE)
      .then(rules => this.applyLoadedRules(rules, true))
      .catch(error => {
        console.error('Erreur lors du chargement des règles:', error);
        this.columnProcessingRules = [];
      });
  }

  private applyLoadedRules(rules: ColumnProcessingRule[], fromDb: boolean): void {
    // Trier les règles par ruleOrder pour garantir l'ordre d'application
    this.columnProcessingRules = rules.sort((a, b) => {
      const orderA = a.ruleOrder !== undefined ? a.ruleOrder : 0;
      const orderB = b.ruleOrder !== undefined ? b.ruleOrder : 0;
      return orderA - orderB;
    });
    
    const source = fromDb ? 'base de données' : 'liste des modèles (embarquées)';
    console.log(`🔍 [DEBUG] Règles chargées depuis la ${source} (triées par ruleOrder):`);
    this.columnProcessingRules.forEach((rule, index) => {
      console.log(`  Règle ${index} (ruleOrder: ${rule.ruleOrder}):`, {
        sourceColumn: rule.sourceColumn,
        stringToRemove: rule.stringToRemove || '(aucun)',
        removeSpecialChars: rule.removeSpecialChars,
        removeAccents: rule.removeAccents,
        id: rule.id
      });
    });
  }

  private preloadBOModelColumns(): void {
    const boModels = this.getAvailableBOModels();
    
    boModels.forEach(model => {
      if (model.templateFile) {
        const existingFile = this.availableFiles.find(f => f.fileName === model.templateFile);
        if (!existingFile || !existingFile.columns || existingFile.columns.length === 0) {
          this.loadBOModelColumns(model);
        }
      }
    });
  }

  loadAvailableFiles(): Promise<void> {
    this.loading = true;
    
    return this.fileWatcherService.getAvailableFiles().toPromise().then(files => {
      this.availableFiles = files || [];
      
      // Les colonnes sont celles lues dans le fichier (aucune liste codée en dur).
      this.loading = false;
    }).catch(error => {
      console.error('Erreur lors du chargement des fichiers:', error);
      this.loading = false;
    });
  }

  /**
   * Sélection d'un fichier modèle depuis le poste de travail : l'import est
   * déclenché et le fichier est enregistré dans le dossier watch-folder de
   * l'entreprise, puis la liste des fichiers est rafraîchie.
   */
  onTemplateFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input?.files?.[0];
    // Réinitialise la valeur pour permettre de re-sélectionner le même fichier.
    if (input) {
      input.value = '';
    }
    if (!file) {
      return;
    }
    this.uploadTemplateFile(file);
  }

  /** Importe le fichier modèle choisi dans le watch-folder de l'entreprise. */
  uploadTemplateFile(file: File): void {
    const lowerName = (file?.name || '').toLowerCase();
    const isAllowed = this.allowedModelExtensions.some(ext => lowerName.endsWith(ext));
    if (!isAllowed) {
      this.templateUploadError = I18nService.t('APM.Formatdefichiernonprisencharge');
      return;
    }

    this.isUploadingTemplateFile = true;
    this.templateUploadError = '';
    this.successMessage = '';

    this.fileWatcherService.uploadModelFile(file).subscribe({
      next: (result: any) => {
        const uploadedName = result?.fileName;
        this.loadAvailableFiles().then(() => {
          this.isUploadingTemplateFile = false;
          if (uploadedName) {
            this.modelForm.patchValue({ templateFile: uploadedName });
            this.loadTemplateColumns();
          }
          this.successMessage = I18nService.t('APM.Fichiermodèleimportéavecsuccès');
          this.cdr.detectChanges();
        });
      },
      error: (error: any) => {
        console.error('❌ Erreur lors de l\'import du fichier modèle:', error);
        this.isUploadingTemplateFile = false;
        this.templateUploadError = error?.error?.error
          || I18nService.t('APM.Erreurlorsdelimportdufichiermodèle');
        this.cdr.detectChanges();
      }
    });
  }

  private loadBOModelColumns(model: AutoProcessingModel): void {
    console.log('🔍 [AutoProcessingModelsComponent] loadBOModelColumns() appelé pour:', model.templateFile);
    
    // Charger les colonnes directement depuis les fichiers Excel du watch-folder
    this.loadColumnsFromExcelFiles();
  }

  /**
   * Charge les colonnes depuis les fichiers Excel dans le dossier watch-folder
   */
  private loadColumnsFromExcelFiles(): void {
    console.log('🔍 Chargement des colonnes depuis les fichiers Excel...');
    
    this.fileWatcherService.getAvailableFiles().subscribe({
      next: (files) => {
        console.log('📁 Fichiers disponibles:', files);
        
        // Extraire toutes les colonnes uniques de tous les fichiers
        const allColumns = new Set<string>();
        
        files.forEach(file => {
          if (file.columns && Array.isArray(file.columns)) {
            file.columns.forEach((column: string) => {
              allColumns.add(column);
            });
          }
        });
        
        // Convertir en tableau et trier
        this.availableColumns = Array.from(allColumns).sort();
        console.log('📋 Colonnes disponibles:', this.availableColumns);
      },
      error: (error) => {
        console.error('❌ Erreur lors du chargement des colonnes:', error);
        this.availableColumns = [];
      }
    });
  }

  private loadColumnsForPartnerType(): void {
    const partnerFiles = this.availableFiles.filter(f => 
      f.fileName.toLowerCase().includes('partner') || 
      f.fileName.toLowerCase().includes('partenaire')
    );
    
    if (partnerFiles.length > 0) {
      const firstPartnerFile = partnerFiles[0];
      if (firstPartnerFile.columns) {
                  this.availableColumnsForTemplate = firstPartnerFile.columns;
      }
    }
  }

  private loadColumnsForBOType(): void {
    console.log('🔍 Chargement des colonnes pour le type BO...');
    
    this.loadColumnsFromExcelFiles();
    
    // Mettre à jour le formulaire
    this.modelForm.updateValueAndValidity();
  }

  private loadColumnsForOperationType(): void {
    console.log('🔍 Chargement des colonnes pour le type Operation...');
    
    const operationFiles = this.availableFiles.filter(f => 
      f.fileName.toLowerCase().includes('operation') || 
      f.fileName.toLowerCase().includes('operationbancaire') ||
      f.fileName.toLowerCase().includes('banque')
    );
    
    if (operationFiles.length > 0) {
      const firstOperationFile = operationFiles[0];
      if (firstOperationFile.columns) {
        this.availableColumnsForTemplate = firstOperationFile.columns;
      }
    } else {
      // Fallback to loading from Excel files
      this.loadColumnsFromExcelFiles();
    }
    
    // Mettre à jour le formulaire
    this.modelForm.updateValueAndValidity();
  }

  private updateReconciliationKeysValidation(fileType: string): void {
    const reconciliationKeysGroup = this.modelForm.get('reconciliationKeys');
    if (reconciliationKeysGroup) {
      if (fileType === 'partner') {
        reconciliationKeysGroup.get('partnerKeys')?.setValidators([Validators.required]);
        reconciliationKeysGroup.get('boKeys')?.setValidators([Validators.required]);
        } else {
        reconciliationKeysGroup.get('partnerKeys')?.clearValidators();
        reconciliationKeysGroup.get('boKeys')?.clearValidators();
      }
      reconciliationKeysGroup.updateValueAndValidity();
    }
  }

  private resetReconciliationKeysForBO(): void {
    const reconciliationKeys = this.modelForm.get('reconciliationKeys');
    reconciliationKeys?.patchValue({
      partnerKeys: [],
      boKeys: [],
      boModels: [],
      boModelKeys: {},
      boTreatments: {}
    });
    console.log('✅ Clés de réconciliation réinitialisées pour le type BO');
  }

  private resetReconciliationLogicForBO(): void {
    // Réinitialiser la logique de réconciliation pour les modèles BO
    this.modelForm.patchValue({
      logicType: null,
      expectedRatio: null,
      logicDescription: null
    });
    this.showReconciliationLogicSection = false;
    this.editingReconciliationLogic = false;
    console.log('✅ Logique de réconciliation réinitialisée pour le type BO');
  }

  private loadColumnsForTemplateFile(templateFile: string): void {
    const fileType = this.modelForm.get('fileType')?.value || 'partner';
    void this.resolveAndApplyTemplateColumns(templateFile, fileType).then(() => {
      this.cdr.detectChanges();
    });
  }

  private async ensureAvailableFilesLoaded(): Promise<void> {
    if (!this.availableFiles?.length) {
      await this.loadAvailableFiles();
    }
  }

  private findAvailableFile(templateFile: string) {
    const normalized = (templateFile || '').trim().toLowerCase();
    if (!normalized) {
      return undefined;
    }
    const exact = this.availableFiles.find(f => f.fileName === templateFile);
    if (exact) {
      return exact;
    }
    const caseInsensitive = this.availableFiles.find(
      f => f.fileName.trim().toLowerCase() === normalized
    );
    if (caseInsensitive) {
      return caseInsensitive;
    }
    const templateBase = normalized.replace(/\.[^.]+$/, '');
    return this.availableFiles.find(f => {
      const fileBase = f.fileName.trim().toLowerCase().replace(/\.[^.]+$/, '');
      return fileBase === templateBase
        || normalized.includes(fileBase)
        || fileBase.includes(templateBase);
    });
  }

  /** Colonnes lues dans le fichier modèle du dossier surveillé, et rien d'autre. */
  private async resolveTemplateColumnNames(templateFile: string): Promise<string[]> {
    return this.normalizeColumnNames(await this.getFileColumns(templateFile));
  }

  private extractColumnsFromPreProcessingConfig(config?: ModelPreProcessingConfig | null): string[] {
    if (!config) {
      return [];
    }
    const columns = new Set<string>();
    (config.rowFilters || []).forEach(filter => filter.column?.trim() && columns.add(filter.column.trim()));
    (config.valueMappings || []).forEach(mapping => {
      mapping.column?.trim() && columns.add(mapping.column.trim());
      mapping.conditionColumn?.trim() && columns.add(mapping.conditionColumn.trim());
    });
    (config.columnRenameRules || []).forEach(rule => {
      if (rule.sourceColumn?.trim()) {
        columns.add(rule.sourceColumn.trim());
      }
      if (rule.targetColumn?.trim()) {
        columns.add(rule.targetColumn.trim());
      }
    });
    (config.columnConcatRules || []).forEach(rule => {
      rule.sourceColumns?.forEach(col => col?.trim() && columns.add(col.trim()));
      if (rule.targetColumn?.trim()) {
        columns.add(rule.targetColumn.trim());
      }
    });
    (config.columnMathRules || []).forEach(rule => {
      [rule.sourceColumnA, rule.sourceColumnB, rule.targetColumn].forEach(col => {
        if (col?.trim()) {
          columns.add(col.trim());
        }
      });
    });
    (config.formatActions || []).forEach(action => {
      action.columns?.forEach(col => col?.trim() && columns.add(col.trim()));
      Object.keys(action.columnSettings || {}).forEach(col => col?.trim() && columns.add(col.trim()));
    });
    if (config.envColumn?.enabled && config.envColumn.value?.trim()) {
      columns.add(ENV_COLUMN_NAME);
    }
    return [...columns];
  }

  private extractColumnsFromConditionalKeys(config?: PartnerConditionalKeysConfig | BoConditionalKeysConfig | null): string[] {
    if (!config) {
      return [];
    }
    const columns = new Set<string>();
    if (config.conditionColumn?.trim()) {
      columns.add(config.conditionColumn.trim());
    }
    if (config.defaultKeyColumn?.trim()) {
      columns.add(config.defaultKeyColumn.trim());
    }
    (config.rules || []).forEach(rule => {
      if (rule.keyColumn?.trim()) {
        columns.add(rule.keyColumn.trim());
      }
      if (rule.boKeyColumn?.trim()) {
        columns.add(rule.boKeyColumn.trim());
      }
    });
    if ((config as PartnerConditionalKeysConfig).envConditionValue?.trim()) {
      columns.add(ENV_COLUMN_NAME);
    }
    return [...columns];
  }

  private mergeTemplateColumnLists(base: string[], extra: string[]): string[] {
    const merged = [...base];
    for (const column of extra) {
      const normalized = this.normalizeColumnName(column);
      if (normalized && !merged.includes(normalized)) {
        merged.push(normalized);
      }
    }
    return merged.sort((a, b) => a.localeCompare(b, 'fr'));
  }

  private syncTemplateColumnLists(columns: string[]): void {
    const normalized = this.normalizeColumnNames(columns.filter(Boolean));
    this.availableTemplateColumns = [...normalized];
    this.availableColumnsForTemplate = [...normalized];
    this.availableColumns = [...normalized];
    if (this.modelExportColumnFilterEnabled) {
      this.refreshModelExportColumnCatalog();
    }
  }

  private async resolveAndApplyTemplateColumns(
    templateFile: string,
    fileType: string,
    extras?: {
      partnerKeys?: string[];
      boKeys?: string[];
      preProcessingConfig?: ModelPreProcessingConfig | null;
      partnerConditionalKeys?: PartnerConditionalKeysConfig | null;
      boConditionalKeys?: BoConditionalKeysConfig | null;
    }
  ): Promise<string[]> {
    if (!templateFile?.trim()) {
      this.templateFileColumns = [];
      this.syncTemplateColumnLists([]);
      return [];
    }

    this.isLoadingTemplateColumns = true;
    try {
      const resolved = await this.resolveTemplateColumnNames(templateFile);
      this.templateFileColumns = [...resolved];
      const extraColumns = [
        ...(extras?.partnerKeys || []),
        ...(extras?.boKeys || []),
        ...this.extractColumnsFromPreProcessingConfig(extras?.preProcessingConfig),
        ...this.extractColumnsFromConditionalKeys(extras?.partnerConditionalKeys),
        ...this.extractColumnsFromConditionalKeys(extras?.boConditionalKeys)
      ];
      const columns = this.mergeTemplateColumnLists(resolved, extraColumns);
      this.syncTemplateColumnLists(columns);
      console.log('✅ Colonnes modèle appliquées:', {
        templateFile,
        fileType,
        count: columns.length
      });
      return columns;
    } catch (error) {
      console.error('❌ Erreur lors du chargement des colonnes du fichier modèle:', error);
      this.errorMessage = I18nService.t('APM.errorLoadTemplateColumns');
      return [];
    } finally {
      this.isLoadingTemplateColumns = false;
    }
  }

  private onBOModelsChange(): void {
    if (this.isRestoringModelState) {
      return;
    }

    const selectedBOModels = this.modelForm.get('reconciliationKeys.boModels')?.value || [];
    const boModelKeysGroup = this.modelForm.get('reconciliationKeys.boModelKeys') as FormGroup;
    const boTreatmentsGroup = this.modelForm.get('reconciliationKeys.boTreatments') as FormGroup;

    const preservedKeys: Record<string, string[]> = {};
    const preservedTreatments: Record<string, unknown> = {};
    Object.keys(boModelKeysGroup.controls).forEach(key => {
      preservedKeys[key] = boModelKeysGroup.get(key)?.value || [];
    });
    Object.keys(boTreatmentsGroup.controls).forEach(key => {
      preservedTreatments[key] = boTreatmentsGroup.get(key)?.value || [];
    });

    console.log('🔍 Modèles BO sélectionnés:', selectedBOModels);

    Object.keys(boModelKeysGroup.controls).forEach(key => {
      boModelKeysGroup.removeControl(key);
    });
    Object.keys(boTreatmentsGroup.controls).forEach(key => {
      boTreatmentsGroup.removeControl(key);
    });

    this.loadBOColumnsFromSelectedModels(selectedBOModels);

    selectedBOModels.forEach((modelId: string) => {
      const model = this.models.find(m => m.id === modelId || m.modelId === modelId);
      if (model) {
        const keys = this.boModelKeySelection[modelId] ?? preservedKeys[modelId] ?? [];
        this.boModelKeySelection[modelId] = [...keys];
        boModelKeysGroup.addControl(modelId, this.fb.control([...keys]));
        boTreatmentsGroup.addControl(
          modelId,
          this.fb.control(preservedTreatments[modelId] || [])
        );
      }
    });

    this.syncBoKeysFromModelSelection();
  }

  getAvailableBOModels(): AutoProcessingModel[] {
    if (!Array.isArray(this.models)) {
      console.warn('this.models n\'est pas un tableau:', this.models);
      return [];
    }
    return this.models.filter(model => model.fileType === 'bo');
  }

  private appendBoColumnsFromTemplate(columns: Set<string>, templateFile: string): void {
    const file = this.findTemplateFileStrict(templateFile);
    if (file?.columns?.length) {
      this.normalizeColumnNames(file.columns).forEach(col => columns.add(col));
    }
  }

  private appendBoColumnsFromModel(columns: Set<string>, model: AutoProcessingModel, modelId: string): void {
    if (model.templateFile) {
      this.appendBoColumnsFromTemplate(columns, model.templateFile);
    }

    (model.reconciliationKeys?.boKeys || []).forEach(key => {
      if (key?.trim()) {
        columns.add(this.normalizeColumnName(key));
      }
    });

    const modelSpecificKeys =
      model.reconciliationKeys?.boModelKeys?.[modelId]
      || Object.values(model.reconciliationKeys?.boModelKeys || {}).flat();
    (modelSpecificKeys as string[]).forEach(key => {
      if (key?.trim()) {
        columns.add(this.normalizeColumnName(key));
      }
    });

    this.extractColumnsFromPreProcessingConfig(model.preProcessingConfig).forEach(col => {
      columns.add(this.normalizeColumnName(col));
    });
    this.extractColumnsFromConditionalKeys(model.reconciliationKeys?.boConditionalKeys).forEach(col => {
      columns.add(this.normalizeColumnName(col));
    });
  }

  private collectBoColumnsForSelectedModels(modelIds: string[]): string[] {
    const columns = new Set<string>();

    modelIds.forEach(modelId => {
      const model = this.availableBOModels.find(m => m.id === modelId)
        || this.models.find(m => m.id === modelId);
      if (model) {
        this.appendBoColumnsFromModel(columns, model, modelId);
      }
    });

    this.selectedBOKeys.forEach(key => {
      if (key?.trim()) {
        columns.add(this.normalizeColumnName(key));
      }
    });

    if (this.editingModel?.reconciliationKeys?.boKeys) {
      this.editingModel.reconciliationKeys.boKeys.forEach(key => {
        if (key?.trim()) {
          columns.add(this.normalizeColumnName(key));
        }
      });
    }

    return Array.from(columns)
      .filter(col => !!col)
      .sort((a, b) => a.localeCompare(b, 'fr'));
  }

  /** Colonnes affichées dans « Clés BO conditionnelles » (toutes sources BO fusionnées). */
  getBoConditionalColumnOptions(): string[] {
    const columns = new Set<string>(this.collectBoColumnsForSelectedModels(this.selectedBOModels));

    this.extractColumnsFromConditionalKeys({
      enabled: this.boConditionalKeysEnabled,
      conditionColumn: this.boConditionColumn,
      defaultKeyColumn: this.boConditionalDefaultKeyColumn,
      rules: this.boConditionalKeyRules
    }).forEach(col => columns.add(this.normalizeColumnName(col)));

    this.availableBOColumns.forEach(col => columns.add(this.normalizeColumnName(col)));

    return Array.from(columns)
      .filter(col => !!col)
      .sort((a, b) => a.localeCompare(b, 'fr'));
  }

  private loadBOColumnsFromSelectedModels(selectedModelIds: string[]): void {
    console.log('🔍 Chargement des colonnes pour les modèles BO sélectionnés:', selectedModelIds);
    this.availableBOColumns = this.collectBoColumnsForSelectedModels(selectedModelIds);
    console.log('📋 Toutes les colonnes BO disponibles:', this.availableBOColumns);
  }

  /**
   * Normalise un nom de colonne (gestion de l'encodage et du typage)
   * Méthode centralisée et standardisée pour toutes les sections
   * 
   * Cette méthode gère :
   * - ENCODAGE : Suppression des caractères de contrôle et normalisation Unicode
   * - NORMALISATION : Remplacement des caractères spéciaux par des espaces
   * - TYPAGE : Standardisation du format des noms de colonnes
   * 
   * @param columnName Le nom de colonne à normaliser
   * @return Le nom de colonne normalisé et standardisé
   */

  /**
   * Méthode simple qui retourne la valeur de la colonne sans modification
   */
  private normalizeColumnName(columnName: string): string {
    return columnName;
  }

  private extractBOKeysFromReconciliationKeys(reconciliationKeys: {
    boKeys?: string[];
    boModelKeys?: Record<string, string[]>;
  }): string[] {
    let allBOKeys: string[] = [];
    if (reconciliationKeys.boModelKeys && Object.keys(reconciliationKeys.boModelKeys).length > 0) {
      Object.values(reconciliationKeys.boModelKeys).forEach((keys: string[]) => {
        if (Array.isArray(keys)) {
          allBOKeys = allBOKeys.concat(keys);
        }
      });
    }
    if (allBOKeys.length === 0 && reconciliationKeys.boKeys?.length) {
      allBOKeys = reconciliationKeys.boKeys;
    }
    return [...new Set(allBOKeys.map(key => this.normalizeColumnName(key)))];
  }

  /** Synchronise les sélections UI vers le formulaire avant sauvegarde. */
  private syncReconciliationKeysBeforeSave(): void {
    const boModelKeys: Record<string, string[]> = {};
    this.selectedBOModels.forEach(modelId => {
      boModelKeys[modelId] = [...(this.boModelKeySelection[modelId] ?? this.selectedBOKeys)];
    });
    this.selectedBOKeys = [...new Set(Object.values(boModelKeys).flat())];
    this.modelForm.patchValue({
      reconciliationKeys: {
        partnerKeys: this.selectedPartnerKeys,
        boModels: this.selectedBOModels,
        boKeys: this.selectedBOKeys,
        boModelKeys
      }
    }, { emitEvent: false });
  }

  /** La configuration TRXBO/OPPART n'a de sens que pour un modèle partenaire en logique SPECIAL_RATIO. */
  private isTrxboOppartConfigApplicable(formValue: any): boolean {
    return formValue?.fileType === 'partner' && formValue?.logicType === 'SPECIAL_RATIO';
  }

  /** Libellés d'opérations et commentaires à envoyer au backend (reconciliation_logic.parameters.trxboOppart). */
  private buildTrxboOppartConfig(formValue: any): TrxboOppartConfig {
    const raw = formValue?.trxboOppart || {};
    const pick = (value: any, fallback: string): string => {
      const text = (value ?? '').toString().trim();
      return text.length > 0 ? text : fallback;
    };

    return {
      operationTypes: {
        impact: pick(raw.impactType, DEFAULT_TRXBO_OPPART_CONFIG.operationTypes.impact),
        fees: pick(raw.feesType, DEFAULT_TRXBO_OPPART_CONFIG.operationTypes.fees),
        commission: pick(raw.commissionType, DEFAULT_TRXBO_OPPART_CONFIG.operationTypes.commission)
      },
      comments: {
        tsop: pick(raw.commentTsop, DEFAULT_TRXBO_OPPART_CONFIG.comments.tsop),
        trxsf: pick(raw.commentTrxsf, DEFAULT_TRXBO_OPPART_CONFIG.comments.trxsf),
        rgfrais: pick(raw.commentRgfrais, DEFAULT_TRXBO_OPPART_CONFIG.comments.rgfrais),
        trxsvc: pick(raw.commentTrxsvc, DEFAULT_TRXBO_OPPART_CONFIG.comments.trxsvc),
        fraisSansCommission: pick(raw.commentFraisSansCommission, DEFAULT_TRXBO_OPPART_CONFIG.comments.fraisSansCommission),
        regcom: pick(raw.commentRegcom, DEFAULT_TRXBO_OPPART_CONFIG.comments.regcom),
        fraisEtCommission: pick(raw.commentFraisEtCommission, DEFAULT_TRXBO_OPPART_CONFIG.comments.fraisEtCommission),
        trxsfTrxsvc: pick(raw.commentTrxsfTrxsvc, DEFAULT_TRXBO_OPPART_CONFIG.comments.trxsfTrxsvc),
        ecart: pick(raw.commentEcart, DEFAULT_TRXBO_OPPART_CONFIG.comments.ecart),
        partnerOnly: pick(raw.commentPartnerOnly, DEFAULT_TRXBO_OPPART_CONFIG.comments.partnerOnly)
      },
      additionalOperationTypes: this.collectAdditionalOperationTypes(raw.additionalTypes),
      regularisationRules: this.collectRegularisationRules(raw.regularisationRules),
      aggregationTypes: this.collectAggregationTypes(raw.aggregationTypes)
    };
  }

  /** Ne conserve que les types supplémentaires ayant un libellé renseigné. */
  private collectAdditionalOperationTypes(rawTypes: any): TrxboAdditionalOperationType[] {
    const entries: TrxboAdditionalOperationType[] = [];
    for (const rawEntry of rawTypes || []) {
      const label = (rawEntry?.label ?? '').toString().trim();
      if (label.length === 0) {
        continue;
      }
      entries.push({
        label,
        commentBo: (rawEntry?.commentBo ?? '').toString().trim(),
        commentPartner: (rawEntry?.commentPartner ?? '').toString().trim()
      });
    }
    return entries;
  }

  /** Ne conserve que les types d'agrégats ayant au moins une donnée renseignée (commentaire, libellé ou type). */
  private collectAggregationTypes(rawTypes: any): TrxboAggregationType[] {
    const entries: TrxboAggregationType[] = [];
    for (const rawEntry of rawTypes || []) {
      const commentBo = (rawEntry?.commentBo ?? '').toString().trim();
      const commentPartner = (rawEntry?.commentPartner ?? '').toString().trim();
      const kind = (rawEntry?.kind ?? '').toString().trim();
      const boLabel = (rawEntry?.boLabel ?? '').toString().trim();
      const partnerLabel = (rawEntry?.partnerLabel ?? '').toString().trim();
      if (kind.length === 0 && commentBo.length === 0 && commentPartner.length === 0 && boLabel.length === 0 && partnerLabel.length === 0) {
        continue;
      }
      const defaults = this.defaultAggregationModesForKind(kind);
      entries.push({
        kind,
        commentBo,
        commentPartner,
        boLabel,
        partnerLabel,
        boMode: (rawEntry?.boMode ?? '').toString().trim() || defaults.boMode,
        partnerMode: (rawEntry?.partnerMode ?? '').toString().trim() || defaults.partnerMode
      });
    }
    return entries;
  }

  /** Ne conserve que les règles ayant un cas renseigné et au moins un composant avec une source. */
  private collectRegularisationRules(rawRules: any): TrxboRegularisationRule[] {
    const rules: TrxboRegularisationRule[] = [];
    for (const rawRule of rawRules || []) {
      const caseLabel = (rawRule?.case ?? '').toString().trim();
      if (caseLabel.length === 0) {
        continue;
      }
      const components: TrxboRegularisationComponent[] = [];
      for (const rawComponent of rawRule?.components || []) {
        const source = (rawComponent?.source ?? '').toString().trim();
        if (source.length === 0) {
          continue;
        }
        const component: TrxboRegularisationComponent = {
          source,
          sign: (rawComponent?.sign ?? 'SOURCE').toString().trim() || 'SOURCE',
          negativeTokens: this.normalizeStringList(rawComponent?.negativeTokens),
          defaultSign: (rawComponent?.defaultSign ?? 'POSITIVE').toString().trim() || 'POSITIVE'
        };
        const type = (rawComponent?.type ?? '').toString().trim();
        if (type.length > 0) {
          component.type = type;
        }
        const coefficient = Number(rawComponent?.coefficient);
        if (Number.isFinite(coefficient) && coefficient !== 0) {
          component.coefficient = coefficient;
        }
        components.push(component);
      }
      if (components.length === 0) {
        continue;
      }
      rules.push({ case: caseLabel, components });
    }
    return rules;
  }

  /** Normalise une liste de chaînes (chaîne, CSV ou tableau), en supprimant les vides et doublons. */
  private normalizeStringList(rawValues: any): string[] {
    const values = Array.isArray(rawValues) ? rawValues : (rawValues != null ? [rawValues] : []);
    const result: string[] = [];
    for (const value of values) {
      for (const part of (value ?? '').toString().split(',')) {
        const text = part.trim();
        if (text.length > 0 && !result.includes(text)) {
          result.push(text);
        }
      }
    }
    return result;
  }

  /** Sources de montant disponibles pour un composant de règle de régularisation. */
  getRegularisationSources(): { value: string; label: string }[] {
    return [
      { value: 'BO_AMOUNT', label: 'APM.RegulSrcBoAmount' },
      { value: 'OPPART_TYPE', label: 'APM.RegulSrcOppartType' },
      { value: 'CALCULATED_FRAIS', label: 'APM.RegulSrcCalculatedFrais' }
    ];
  }

  /** Signes disponibles pour un composant de règle de régularisation. */
  getRegularisationSigns(): { value: string; label: string }[] {
    return [
      { value: 'SOURCE', label: 'APM.RegulSignSource' },
      { value: 'POSITIVE', label: 'APM.RegulSignPositive' },
      { value: 'NEGATIVE', label: 'APM.RegulSignNegative' },
      { value: 'SERVICE_BASED', label: 'APM.RegulSignServiceBased' }
    ];
  }

  /**
   * Types d'opérations connus du modèle (impact, frais, commission et types supplémentaires) :
   * utilisés comme options pour choisir les libellés de type OPPART.
   */
  getKnownOperationTypes(): string[] {
    const group = this.modelForm.get('trxboOppart');
    const values = new Set<string>();
    ['impactType', 'feesType', 'commissionType'].forEach(controlName => {
      const value = (group?.get(controlName)?.value ?? '').toString().trim();
      if (value.length > 0) {
        values.add(value);
      }
    });
    for (const control of this.trxboAdditionalTypesArray.controls) {
      const value = (control.get('label')?.value ?? '').toString().trim();
      if (value.length > 0) {
        values.add(value);
      }
    }
    return Array.from(values);
  }

  /** Libellés de cas proposés pour une règle : commentaires configurés + libellés de types supplémentaires. */
  getRegularisationCaseOptions(): string[] {
    const group = this.modelForm.get('trxboOppart');
    const values = new Set<string>();
    [
      'commentTsop', 'commentTrxsf', 'commentRgfrais', 'commentTrxsvc',
      'commentFraisSansCommission', 'commentRegcom', 'commentFraisEtCommission',
      'commentTrxsfTrxsvc', 'commentEcart', 'commentPartnerOnly'
    ].forEach(controlName => {
      const value = (group?.get(controlName)?.value ?? '').toString().trim();
      if (value.length > 0) {
        values.add(value);
      }
    });
    for (const control of this.trxboAdditionalTypesArray.controls) {
      const label = (control.get('label')?.value ?? '').toString().trim();
      if (label.length > 0) {
        values.add(label);
      }
      const commentPartner = (control.get('commentPartner')?.value ?? '').toString().trim();
      if (commentPartner.length > 0) {
        values.add(commentPartner);
      }
      const commentBo = (control.get('commentBo')?.value ?? '').toString().trim();
      if (commentBo.length > 0) {
        values.add(commentBo);
      }
    }
    return Array.from(values);
  }

  get trxboAdditionalTypesArray(): FormArray {
    return this.modelForm.get('trxboOppart.additionalTypes') as FormArray;
  }

  get trxboRegularisationRulesArray(): FormArray {
    return this.modelForm.get('trxboOppart.regularisationRules') as FormArray;
  }

  /** Composants (FormArray) de la règle d'index donné. */
  trxboRegularisationComponents(ruleIndex: number): FormArray {
    return this.trxboRegularisationRulesArray.at(ruleIndex).get('components') as FormArray;
  }

  addTrxboAdditionalType(): void {
    this.trxboAdditionalTypesArray.push(
      this.fb.group({
        label: [''],
        commentBo: [''],
        commentPartner: ['']
      })
    );
  }

  removeTrxboAdditionalType(index: number): void {
    this.trxboAdditionalTypesArray.removeAt(index);
  }

  addTrxboRegularisationRule(): void {
    this.trxboRegularisationRulesArray.push(
      this.fb.group({
        case: [''],
        components: this.fb.array<FormGroup>([])
      })
    );
  }

  removeTrxboRegularisationRule(index: number): void {
    this.trxboRegularisationRulesArray.removeAt(index);
  }

  addTrxboRegularisationComponent(ruleIndex: number): void {
    const group = this.fb.group({
      source: ['OPPART_TYPE'],
      type: [''],
      sign: ['SOURCE'],
      negativeTokens: [''],
      defaultSign: ['POSITIVE'],
      coefficient: ['']
    });
    this.trxboRegularisationComponents(ruleIndex).push(group);
    this.applyTrxboRegularisationComponentState(group);
  }

  /** Active/désactive les champs conditionnels d'un composant selon source et signe. */
  private applyTrxboRegularisationComponentState(group: FormGroup): void {
    const typeControl = group.get('type');
    const negativeTokensControl = group.get('negativeTokens');
    const defaultSignControl = group.get('defaultSign');
    const sourceControl = group.get('source');
    const signControl = group.get('sign');

    const apply = () => {
      const isOppartType = sourceControl?.value === 'OPPART_TYPE';
      const isServiceBased = signControl?.value === 'SERVICE_BASED';
      if (isOppartType) {
        typeControl?.enable({ onlySelf: true, emitEvent: false });
      } else {
        typeControl?.disable({ onlySelf: true, emitEvent: false });
      }
      if (isServiceBased) {
        negativeTokensControl?.enable({ onlySelf: true, emitEvent: false });
        defaultSignControl?.enable({ onlySelf: true, emitEvent: false });
      } else {
        negativeTokensControl?.disable({ onlySelf: true, emitEvent: false });
        defaultSignControl?.disable({ onlySelf: true, emitEvent: false });
      }
    };

    sourceControl?.valueChanges.subscribe(apply);
    signControl?.valueChanges.subscribe(apply);
    apply();
  }

  removeTrxboRegularisationComponent(ruleIndex: number, componentIndex: number): void {
    this.trxboRegularisationComponents(ruleIndex).removeAt(componentIndex);
  }

  get trxboAggregationTypesArray(): FormArray {
    return this.modelForm.get('trxboOppart.aggregationTypes') as FormArray;
  }

  /** Filtre d'affichage des types d'agrégats (commentaire ou libellé, insensible à la casse). */
  aggTypesFilter = '';

  /** Dernier type d'agrégat supprimé, conservé pour permettre l'annulation. */
  private lastRemovedAggType: { group: FormGroup; index: number } | null = null;

  /** Indexes des types d'agrégats correspondant au filtre courant. */
  filteredAggTypeIndexes(): number[] {
    const needle = this.aggTypesFilter.trim().toLowerCase();
    const array = this.trxboAggregationTypesArray;
    const indexes: number[] = [];
    for (let i = 0; i < array.length; i++) {
      if (!needle) {
        indexes.push(i);
        continue;
      }
      const control = array.at(i);
      const haystack = [
        control.get('commentBo')?.value,
        control.get('commentPartner')?.value,
        control.get('boLabel')?.value,
        control.get('partnerLabel')?.value
      ].join(' ').toLowerCase();
      if (haystack.includes(needle)) {
        indexes.push(i);
      }
    }
    return indexes;
  }

  /** Classe CSS (couleur) du sélecteur de mode, dérivée du mode courant. */
  aggSelectClass(value: string | null | undefined): string {
    const mode = (value || 'NONE').toString().trim().toLowerCase();
    return `agg-select agg-mode-${mode}`;
  }

  /** Vrai si une suppression de type d'agrégat est annulable. */
  canUndoAggTypeRemoval(): boolean {
    return this.lastRemovedAggType !== null;
  }

  /** Réinsère le dernier type d'agrégat supprimé. */
  undoRemoveTrxboAggregationType(): void {
    if (!this.lastRemovedAggType) {
      return;
    }
    const array = this.trxboAggregationTypesArray;
    const { group, index } = this.lastRemovedAggType;
    array.insert(Math.min(index, array.length), group);
    this.lastRemovedAggType = null;
    this.trxboAggregationTypesArray.markAsDirty();
  }

  /** Fait défiler la page vers la section « Paramétrage des opérations » ciblée. */
  scrollToPoSection(sectionId: string, event: Event): void {
    event.preventDefault();
    const element = document.getElementById(sectionId);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  /** Marque le FormArray comme modifié après un changement de mode via le sélecteur. */
  onAggModeChange(): void {
    this.trxboAggregationTypesArray.markAsDirty();
  }

  /** Modes de régularisation BO disponibles. */
  getAggregationBoModes(): { value: string; label: string }[] {
    return [
      { value: 'MONTANT_FRAIS', label: 'APM.AggModeMontantFrais' },
      { value: 'MONTANT', label: 'APM.AggModeMontant' },
      { value: 'FRAIS', label: 'APM.AggModeFrais' },
      { value: 'SIMPLE', label: 'APM.AggModeSimple' },
      { value: 'NONE', label: 'APM.AggModeNone' }
    ];
  }

  /** Modes de régularisation partenaire disponibles. */
  getAggregationPartnerModes(): { value: string; label: string }[] {
    return [
      { value: 'MONTANT', label: 'APM.AggModeMontant' },
      { value: 'FRAIS', label: 'APM.AggModeFrais' },
      { value: 'ZERO', label: 'APM.AggModeZero' },
      { value: 'NONE', label: 'APM.AggModeNone' }
    ];
  }

  /** Contrôle de mode (BO ou partenaire) d'une ligne d'agrégat, accédé directement par index. */
  aggModeControl(index: number, field: 'boMode' | 'partnerMode'): FormControl {
    return this.trxboAggregationTypesArray.at(index)?.get(field) as FormControl;
  }

  /** Applique explicitement un mode BO/partenaire sur une ligne d'agrégat. */
  setAggMode(index: number, field: 'boMode' | 'partnerMode', value: string): void {
    this.aggModeControl(index, field)?.setValue(value);
    this.trxboAggregationTypesArray.markAsDirty();
  }

  addTrxboAggregationType(): void {
    this.aggTypesFilter = '';
    this.lastRemovedAggType = null;
    this.trxboAggregationTypesArray.push(
      this.fb.group({
        kind: [''],
        commentBo: [''],
        commentPartner: [''],
        boLabel: [''],
        partnerLabel: [''],
        boMode: ['MONTANT_FRAIS'],
        partnerMode: ['MONTANT']
      })
    );
  }

  removeTrxboAggregationType(index: number): void {
    const array = this.trxboAggregationTypesArray;
    const group = array.at(index);
    if (!group) {
      return;
    }
    array.removeAt(index);
    this.lastRemovedAggType = { group: group as FormGroup, index };
  }

  /**
   * (Re)génère les types d'agrégats à partir des commentaires configurés et des types
   * supplémentaires. Réinitialise les modes par défaut (l'utilisateur peut ensuite les ajuster).
   */
  generateTrxboAggregationTypesFromComments(): void {
    this.aggTypesFilter = '';
    this.lastRemovedAggType = null;
    const group = this.modelForm.get('trxboOppart');
    const comments = {
      tsop: (group?.get('commentTsop')?.value ?? '').toString().trim() || DEFAULT_TRXBO_OPPART_CONFIG.comments.tsop,
      trxsf: (group?.get('commentTrxsf')?.value ?? '').toString().trim() || DEFAULT_TRXBO_OPPART_CONFIG.comments.trxsf,
      rgfrais: (group?.get('commentRgfrais')?.value ?? '').toString().trim() || DEFAULT_TRXBO_OPPART_CONFIG.comments.rgfrais,
      trxsvc: (group?.get('commentTrxsvc')?.value ?? '').toString().trim() || DEFAULT_TRXBO_OPPART_CONFIG.comments.trxsvc,
      fraisSansCommission: (group?.get('commentFraisSansCommission')?.value ?? '').toString().trim() || DEFAULT_TRXBO_OPPART_CONFIG.comments.fraisSansCommission,
      regcom: (group?.get('commentRegcom')?.value ?? '').toString().trim() || DEFAULT_TRXBO_OPPART_CONFIG.comments.regcom,
      fraisEtCommission: (group?.get('commentFraisEtCommission')?.value ?? '').toString().trim() || DEFAULT_TRXBO_OPPART_CONFIG.comments.fraisEtCommission,
      trxsfTrxsvc: (group?.get('commentTrxsfTrxsvc')?.value ?? '').toString().trim() || DEFAULT_TRXBO_OPPART_CONFIG.comments.trxsfTrxsvc,
      ecart: (group?.get('commentEcart')?.value ?? '').toString().trim() || DEFAULT_TRXBO_OPPART_CONFIG.comments.ecart,
      partnerOnly: (group?.get('commentPartnerOnly')?.value ?? '').toString().trim() || DEFAULT_TRXBO_OPPART_CONFIG.comments.partnerOnly
    };

    const generated: TrxboAggregationType[] = [
      { kind: 'tsop', commentBo: comments.tsop, commentPartner: comments.tsop, boLabel: comments.tsop, partnerLabel: comments.tsop, boMode: 'MONTANT_FRAIS', partnerMode: 'MONTANT' },
      { kind: 'trxsf', commentBo: comments.trxsf, commentPartner: comments.trxsf, boLabel: comments.trxsf, partnerLabel: 'OP SANS FRAIS', boMode: 'FRAIS', partnerMode: 'ZERO' },
      { kind: 'rgfrais', commentBo: comments.rgfrais, commentPartner: comments.rgfrais, boLabel: comments.rgfrais, partnerLabel: comments.rgfrais, boMode: 'NONE', partnerMode: 'FRAIS' },
      { kind: 'ecart', commentBo: comments.ecart, commentPartner: comments.ecart, boLabel: 'Écart BO', partnerLabel: 'Écart Partenaire', boMode: 'SIMPLE', partnerMode: 'MONTANT' },
      { kind: 'partnerOnly', commentBo: comments.partnerOnly, commentPartner: comments.partnerOnly, boLabel: comments.partnerOnly, partnerLabel: comments.partnerOnly, boMode: 'NONE', partnerMode: 'MONTANT' },
      { kind: 'trxsvc', commentBo: comments.trxsvc, commentPartner: comments.trxsvc, boLabel: comments.trxsvc, partnerLabel: comments.trxsvc, boMode: 'MONTANT_FRAIS', partnerMode: 'MONTANT' },
      { kind: 'fraisSansCommission', commentBo: comments.fraisSansCommission, commentPartner: comments.fraisSansCommission, boLabel: comments.fraisSansCommission, partnerLabel: comments.fraisSansCommission, boMode: 'MONTANT_FRAIS', partnerMode: 'MONTANT' },
      { kind: 'regcom', commentBo: comments.regcom, commentPartner: comments.regcom, boLabel: comments.regcom, partnerLabel: comments.regcom, boMode: 'MONTANT_FRAIS', partnerMode: 'MONTANT' },
      { kind: 'fraisEtCommission', commentBo: comments.fraisEtCommission, commentPartner: comments.fraisEtCommission, boLabel: comments.fraisEtCommission, partnerLabel: comments.fraisEtCommission, boMode: 'MONTANT_FRAIS', partnerMode: 'MONTANT' },
      { kind: 'trxsfTrxsvc', commentBo: comments.trxsfTrxsvc, commentPartner: comments.trxsfTrxsvc, boLabel: comments.trxsfTrxsvc, partnerLabel: comments.trxsfTrxsvc, boMode: 'MONTANT_FRAIS', partnerMode: 'MONTANT' }
    ];

    for (const control of this.trxboAdditionalTypesArray.controls) {
      const label = (control.get('label')?.value ?? '').toString().trim();
      if (label.length === 0) {
        continue;
      }
      const commentBo = (control.get('commentBo')?.value ?? '').toString().trim() || label;
      const commentPartner = (control.get('commentPartner')?.value ?? '').toString().trim() || commentBo;
      generated.push({
        kind: `additional:${label}`,
        commentBo,
        commentPartner,
        boLabel: commentBo,
        partnerLabel: commentPartner,
        boMode: 'MONTANT_FRAIS',
        partnerMode: 'MONTANT'
      });
    }

    this.restoreTrxboAggregationTypes(generated);
  }

  /** Restaure (remplace) les types d'agrégats enregistrés sur le modèle. */
  /** Modes par défaut d'un type d'agrégat, appliqués quand la config stockée ne fournit pas de mode valide. */
  private defaultAggregationModesForKind(kind: string): { boMode: string; partnerMode: string } {
    switch (kind) {
      case 'trxsf':
        return { boMode: 'FRAIS', partnerMode: 'ZERO' };
      case 'rgfrais':
        return { boMode: 'NONE', partnerMode: 'FRAIS' };
      case 'ecart':
        return { boMode: 'SIMPLE', partnerMode: 'MONTANT' };
      case 'partnerOnly':
        return { boMode: 'NONE', partnerMode: 'MONTANT' };
      default:
        return { boMode: 'MONTANT_FRAIS', partnerMode: 'MONTANT' };
    }
  }

  private restoreTrxboAggregationTypes(stored?: TrxboAggregationType[]): void {
    const array = this.trxboAggregationTypesArray;
    array.clear();
    for (const entry of stored || []) {
      const commentBo = (entry?.commentBo ?? '').toString();
      const commentPartner = (entry?.commentPartner ?? '').toString();
      const kind = (entry?.kind ?? '').toString();
      const boLabel = (entry?.boLabel ?? '').toString().trim();
      const partnerLabel = (entry?.partnerLabel ?? '').toString().trim();
      if (kind.trim().length === 0 && commentBo.trim().length === 0 && commentPartner.trim().length === 0 && boLabel.length === 0 && partnerLabel.length === 0) {
        continue;
      }
      const defaults = this.defaultAggregationModesForKind(kind);
      const boMode = (entry?.boMode ?? '').toString().trim();
      const partnerMode = (entry?.partnerMode ?? '').toString().trim();
      array.push(
        this.fb.group({
          kind: [kind],
          commentBo: [commentBo],
          commentPartner: [commentPartner],
          boLabel: [(entry?.boLabel ?? '').toString()],
          partnerLabel: [(entry?.partnerLabel ?? '').toString()],
          boMode: [boMode || defaults.boMode],
          partnerMode: [partnerMode || defaults.partnerMode]
        })
      );
    }
  }

  /** Complète la configuration TRXBO/OPPART du modèle avec les valeurs par défaut du code. */
  private mergeTrxboOppartConfigWithDefaults(stored?: TrxboOppartConfig): Record<string, string> {
    const defaults = DEFAULT_TRXBO_OPPART_CONFIG;
    const operationTypes = stored?.operationTypes || {};
    const comments = stored?.comments || {};
    return {
      impactType: operationTypes.impact || defaults.operationTypes.impact,
      feesType: operationTypes.fees || defaults.operationTypes.fees,
      commissionType: operationTypes.commission || defaults.operationTypes.commission,
      commentTsop: comments.tsop || defaults.comments.tsop,
      commentTrxsf: comments.trxsf || defaults.comments.trxsf,
      commentRgfrais: comments.rgfrais || defaults.comments.rgfrais,
      commentTrxsvc: comments.trxsvc || defaults.comments.trxsvc,
      commentFraisSansCommission: comments.fraisSansCommission || defaults.comments.fraisSansCommission,
      commentRegcom: comments.regcom || defaults.comments.regcom,
      commentFraisEtCommission: comments.fraisEtCommission || defaults.comments.fraisEtCommission,
      commentTrxsfTrxsvc: comments.trxsfTrxsvc || defaults.comments.trxsfTrxsvc,
      commentEcart: comments.ecart || defaults.comments.ecart,
      commentPartnerOnly: comments.partnerOnly || defaults.comments.partnerOnly
    };
  }

  /** Restaure les types d'opération supplémentaires enregistrés sur le modèle. */
  private restoreTrxboAdditionalTypes(stored?: TrxboOppartConfig): void {
    const additionalTypes = this.trxboAdditionalTypesArray;
    additionalTypes.clear();
    for (const entry of stored?.additionalOperationTypes || []) {
      const label = (entry?.label ?? '').toString().trim();
      if (label.length === 0) {
        continue;
      }
      additionalTypes.push(
        this.fb.group({
          label: [label],
          commentBo: [(entry?.commentBo ?? '').toString()],
          commentPartner: [(entry?.commentPartner ?? '').toString()]
        })
      );
    }
  }

  /** Restaure les règles de régularisation enregistrées sur le modèle. */
  private restoreTrxboRegularisationRules(stored?: TrxboOppartConfig): void {
    const rules = this.trxboRegularisationRulesArray;
    rules.clear();
    for (const rule of stored?.regularisationRules || []) {
      const caseLabel = (rule?.case ?? '').toString().trim();
      if (caseLabel.length === 0) {
        continue;
      }
      const components = this.fb.array<FormGroup>([]);
      for (const component of rule.components || []) {
        const negativeTokens = this.normalizeStringList(component?.negativeTokens);
        const componentGroup = this.fb.group({
          source: [(component?.source ?? 'OPPART_TYPE').toString()],
          type: [(component?.type ?? '').toString()],
          sign: [(component?.sign ?? 'SOURCE').toString()],
          negativeTokens: [negativeTokens.join(', ')],
          defaultSign: [(component?.defaultSign ?? 'POSITIVE').toString()],
          coefficient: [component?.coefficient != null ? component.coefficient : '']
        });
        this.applyTrxboRegularisationComponentState(componentGroup);
        components.push(componentGroup);
      }
      rules.push(
        this.fb.group({
          case: [caseLabel],
          components
        })
      );
    }
  }

  /** Prépare le payload API (JSON propre, sans champs techniques). */
  private buildModelSavePayload(formValue: any): AutoProcessingModel {
    const payload: AutoProcessingModel = {
      name: formValue.name,
      filePattern: formValue.filePattern,
      fileType: formValue.fileType,
      autoApply: formValue.autoApply,
      bankModel: !!formValue.bankModel,
      templateFile: formValue.templateFile,
      reconciliationKeys: JSON.parse(JSON.stringify({
        partnerKeys: formValue.reconciliationKeys?.partnerKeys || [],
        boKeys: formValue.reconciliationKeys?.boKeys || [],
        boModels: formValue.reconciliationKeys?.boModels || [],
        boModelKeys: formValue.reconciliationKeys?.boModelKeys || {},
        boTreatments: formValue.reconciliationKeys?.boTreatments || {},
        partnerConditionalKeys: this.buildPartnerConditionalKeysConfig(),
        boConditionalKeys: this.buildBoConditionalKeysConfig()
      })),
      reconciliationLogic: {
        type: formValue.logicType || 'STANDARD',
        parameters: {
          expectedRatio: formValue.expectedRatio || '1:1',
          tolerance: formValue.tolerance || 0.0,
          description: formValue.logicDescription || '',
          ...(this.isTrxboOppartConfigApplicable(formValue) ? { trxboOppart: this.buildTrxboOppartConfig(formValue) } : {})
        }
      },
      correspondenceRules: {
        rules: this.correspondenceRules
      },
      comparisonColumns: {
        columns: this.comparisonColumns
      },
      preProcessingConfig: JSON.parse(JSON.stringify(this.buildPreProcessingConfig()))
    };

    if (this.editingModel?.modelId) {
      payload.modelId = this.editingModel.modelId;
    } else if (this.editingModel?.id && !/^\d+$/.test(String(this.editingModel.id))) {
      payload.modelId = this.editingModel.id;
    }

    return payload;
  }

  saveModel(): void {
    // Utiliser notre logique de validation personnalisée
    if (this.isFormValid()) {
      this.syncReconciliationKeysBeforeSave();
      const formValue = this.modelForm.value;
      
      // Validation supplémentaire pour le pattern
      if (!formValue.filePattern || formValue.filePattern.trim() === '') {
        this.errorMessage = I18nService.t('APM.errorSelectFilePattern');
        return;
      }
      
      // Pour la création, ne pas inclure l'id
      const modelData = this.buildModelSavePayload(formValue);
      const rulesToSave = this.columnProcessingRules.map(rule => {
        const { id, ...rest } = rule;
        return rest;
      });

      // 🔧 SOLUTION: Ne pas inclure les champs de base de données pour la création
      // if (this.editingModel) {
      //   modelData.id = this.editingModel.id;
      //   modelData.createdAt = this.editingModel.createdAt;
      //   modelData.updatedAt = new Date();
      // }
      
      // Données à sauvegarder

      // Utiliser updateModel si on modifie, createModel si création
      let savePromise: Promise<any>;
      
      console.log('🔍 [DEBUG] État editingModel:', {
        editingModel: this.editingModel,
        hasEditingModel: !!this.editingModel,
        id: this.editingModel?.id,
        modelId: this.editingModel?.modelId
      });
      
      if (this.editingModel) {
        const modelIdToUse =
          this.editingModel.dbId != null
            ? String(this.editingModel.dbId)
            : (this.editingModel.modelId || this.editingModel.id);
        if (!modelIdToUse) {
          console.error('❌ Erreur: Aucun ID disponible pour la mise à jour du modèle');
          console.error('   - editingModel:', this.editingModel);
          this.errorMessage = I18nService.t('APM.errorMissingModelId');
          return;
        }
        
        console.log('🔄 Mise à jour du modèle avec ID:', modelIdToUse);
        console.log('   - Type:', typeof modelIdToUse);
        console.log('   - Données à envoyer:', JSON.stringify(modelData, null, 2));
        savePromise = this.autoProcessingService.updateModel(modelIdToUse, modelData);
      } else {
        // Création d'un nouveau modèle
        console.log('➕ Création d\'un nouveau modèle');
        console.log('   - Données à envoyer:', JSON.stringify(modelData, null, 2));
        savePromise = this.autoProcessingService.createModel(modelData);
      }

      savePromise.then(savedModel => {
        const wasEdit = !!this.editingModel;
        const wasDuplicate = this.isDuplicatingModel;
        const actionLabel = wasEdit
          ? I18nService.t('APM.modelActionModified')
          : (wasDuplicate ? I18nService.t('APM.modelActionDuplicated') : I18nService.t('APM.modelActionCreated'));

        const finalModelId = savedModel.modelId || savedModel.id;
        this.appStateService.setLastEditedModelId(finalModelId);
        if (rulesToSave.length > 0 && finalModelId) {
          this.autoProcessingService.saveColumnProcessingRulesBatch(finalModelId, rulesToSave)
            .then((savedRules) => {
              console.log('✅ Règles de traitement sauvegardées:', savedRules.length);
              this.successMessage = I18nService.t('APM.saveOkWithRules', {
                action: actionLabel,
                count: rulesToSave.length
              });
            })
            .catch(error => {
              console.error('❌ Erreur lors de la sauvegarde des règles:', error);
              this.successMessage = I18nService.t('APM.saveOkRulesError', { action: actionLabel });
            });
        } else {
          this.successMessage = I18nService.t('APM.saveOk', { action: actionLabel });
        }
        
        this.showCreateForm = false;
        this.editingModel = null;
        this.isDuplicatingModel = false;
        this.modelForm.reset({
          fileType: 'bo',
          autoApply: true,
          reconciliationKeys: {
            partnerKeys: [],
            boKeys: [],
            boModels: [],
            boModelKeys: {},
            boTreatments: {}
          }
        });
        this.columnProcessingRules = []; // Réinitialiser les règles
        this.loadModels();
      }).catch(error => {
        console.error('Erreur lors de la sauvegarde:', error);
        console.error('Détail serveur:', error?.error);
        const backendMessage =
          error?.error?.error ||
          error?.error?.message ||
          error?.message;
        this.errorMessage = backendMessage
          ? I18nService.t('APM.errorSaveModelWithReason', { message: backendMessage })
          : I18nService.t('APM.errorSaveModel');
      });
    }
  }

  editModel(model: AutoProcessingModel, mode: 'edit' | 'duplicate' = 'edit'): void {
    const isDuplicate = mode === 'duplicate';
    this.isDuplicatingModel = isDuplicate;
    this.editingModel = isDuplicate ? null : model;
    this.showCreateForm = isDuplicate || !!this.editingModel;

    const sourceModel = isDuplicate ? this.buildModelDuplicate(model) : model;

    console.log('🔍 editModel() appelé avec le modèle:', sourceModel, 'mode:', mode);

    this.isRestoringModelState = true;
    
    // S'assurer que les reconciliationKeys sont complètes
    const reconciliationKeys = {
      partnerKeys: sourceModel.reconciliationKeys?.partnerKeys || [],
      boKeys: sourceModel.reconciliationKeys?.boKeys || [],
      boModels: sourceModel.reconciliationKeys?.boModels || [],
      boModelKeys: sourceModel.reconciliationKeys?.boModelKeys || {},
      boTreatments: sourceModel.reconciliationKeys?.boTreatments || {},
      partnerConditionalKeys: sourceModel.reconciliationKeys?.partnerConditionalKeys,
      boConditionalKeys: sourceModel.reconciliationKeys?.boConditionalKeys
    };
    
    console.log('🔍 Valeurs à patcher dans le formulaire:', {
      name: sourceModel.name,
      filePattern: sourceModel.filePattern,
      fileType: sourceModel.fileType,
      autoApply: sourceModel.autoApply,
      templateFile: sourceModel.templateFile
    });
    
    // Debug: Afficher les valeurs de la logique de réconciliation avant le patchValue
    console.log('🔍 [DEBUG] Logique de réconciliation du modèle:', {
      reconciliationLogic: sourceModel.reconciliationLogic,
      type: sourceModel.reconciliationLogic?.type,
      expectedRatio: sourceModel.reconciliationLogic?.parameters?.expectedRatio,
      description: sourceModel.reconciliationLogic?.parameters?.description,
      tolerance: sourceModel.reconciliationLogic?.parameters?.tolerance
    });
    
    this.modelForm.patchValue({
      name: sourceModel.name,
      filePattern: sourceModel.filePattern,
      fileType: sourceModel.fileType,
      autoApply: sourceModel.autoApply,
      bankModel: !!sourceModel.bankModel,
      templateFile: sourceModel.templateFile,
      reconciliationKeys: reconciliationKeys,
      // Charger les configurations autonomes
      logicType: sourceModel.reconciliationLogic?.type || 'STANDARD',
      expectedRatio: sourceModel.reconciliationLogic?.parameters?.expectedRatio || '1:1',
      logicDescription: sourceModel.reconciliationLogic?.parameters?.description || '',
      tolerance: sourceModel.reconciliationLogic?.parameters?.tolerance || 0.0,
      trxboOppart: this.mergeTrxboOppartConfigWithDefaults(sourceModel.reconciliationLogic?.parameters?.trxboOppart)
    }, { emitEvent: false });
    this.restoreTrxboAdditionalTypes(sourceModel.reconciliationLogic?.parameters?.trxboOppart);
    this.restoreTrxboRegularisationRules(sourceModel.reconciliationLogic?.parameters?.trxboOppart);
    const storedAggregationTypes = sourceModel.reconciliationLogic?.parameters?.trxboOppart?.aggregationTypes;
    if (storedAggregationTypes && storedAggregationTypes.length > 0) {
      this.restoreTrxboAggregationTypes(storedAggregationTypes);
    } else if (this.modelForm.get('fileType')?.value === 'partner' && this.modelForm.get('logicType')?.value === 'SPECIAL_RATIO') {
      this.generateTrxboAggregationTypesFromComments();
    }

    this.selectedBOModels = reconciliationKeys.boModels || [];
    this.selectedBOKeys = this.extractBOKeysFromReconciliationKeys(reconciliationKeys);
    this.boModelKeySelection = {};
    this.selectedBOModels.forEach(modelId => {
      const own = reconciliationKeys.boModelKeys?.[modelId];
      this.boModelKeySelection[modelId] = Array.isArray(own) ? [...own] : [...this.selectedBOKeys];
    });
    void this.refreshBoModelFileColumns();
    
    // Debug: Vérifier les valeurs après le patchValue
    setTimeout(() => {
      console.log('🔍 [DEBUG] Valeurs du formulaire après patchValue:', {
        logicType: this.modelForm.get('logicType')?.value,
        expectedRatio: this.modelForm.get('expectedRatio')?.value,
        logicDescription: this.modelForm.get('logicDescription')?.value,
        tolerance: this.modelForm.get('tolerance')?.value
      });
      
      // Forcer la mise à jour de l'affichage
      this.cdr.detectChanges();
      
      // Vérifier à nouveau après la détection des changements
      setTimeout(() => {
        console.log('🔍 [DEBUG] Valeurs du formulaire après detectChanges:', {
          logicType: this.modelForm.get('logicType')?.value,
          expectedRatio: this.modelForm.get('expectedRatio')?.value,
          logicDescription: this.modelForm.get('logicDescription')?.value,
          tolerance: this.modelForm.get('tolerance')?.value
        });
      }, 50);
    }, 100);
    
    console.log('🔍 Valeur du filePattern après patchValue:', this.modelForm.get('filePattern')?.value);
    
    // Charger les règles de traitement des colonnes du modèle
    if (isDuplicate) {
      this.loadColumnProcessingRulesForDuplicate(model, sourceModel.columnProcessingRules);
    } else {
      this.loadColumnProcessingRules(model.modelId || model.id!, model.columnProcessingRules);
    }

    // Charger les configurations autonomes
    this.correspondenceRules = sourceModel.correspondenceRules?.rules
      ? sourceModel.correspondenceRules.rules.map(rule => ({ ...rule }))
      : [];
    this.comparisonColumns = sourceModel.comparisonColumns?.columns
      ? sourceModel.comparisonColumns.columns.map(col => ({ ...col }))
      : [];
    if (reconciliationKeys.boModels && reconciliationKeys.boModels.length > 0) {
      this.loadBOColumnsFromSelectedModels(reconciliationKeys.boModels);
      
      // S'assurer que les FormGroup pour boModelKeys et boTreatments sont correctement initialisés
      const boModelKeysGroup = this.modelForm.get('reconciliationKeys.boModelKeys') as FormGroup;
      const boTreatmentsGroup = this.modelForm.get('reconciliationKeys.boTreatments') as FormGroup;
      
      // Nettoyer les contrôles existants
      Object.keys(boModelKeysGroup.controls).forEach(key => {
        boModelKeysGroup.removeControl(key);
      });
      Object.keys(boTreatmentsGroup.controls).forEach(key => {
        boTreatmentsGroup.removeControl(key);
      });
      
      // Ajouter les contrôles pour chaque modèle BO
      reconciliationKeys.boModels.forEach((modelId: string) => {
        boModelKeysGroup.addControl(modelId, this.fb.control(reconciliationKeys.boModelKeys[modelId] || []));
        boTreatmentsGroup.addControl(modelId, this.fb.control(reconciliationKeys.boTreatments[modelId] || []));
      });
    }
    
    const correctedPartnerKeys = (reconciliationKeys.partnerKeys || []).map(key => {
      return this.normalizeColumnName(key);
    });

    // Supprimer les doublons
    this.selectedPartnerKeys = [...new Set(correctedPartnerKeys)];
    console.log('✅ Clés partenaires chargées pour édition (corrigées):', this.selectedPartnerKeys);

    this.loadPartnerConditionalKeysConfig(sourceModel.reconciliationKeys?.partnerConditionalKeys);
    this.loadBoConditionalKeysConfig(sourceModel.reconciliationKeys?.boConditionalKeys);

    console.log('✅ Modèles BO chargés pour édition:', this.selectedBOModels);
    console.log('✅ Clés BO chargées pour édition (corrigées):', this.selectedBOKeys);
    console.log('🔍 boModelKeys original:', reconciliationKeys.boModelKeys);
    
    // Afficher les sections de configuration
    this.showColumnRulesSection = true;
    this.showReconciliationLogicSection = true;
    this.showCorrespondenceRulesSection = true;
    this.showComparisonColumnsSection = true;

    this.syncReconciliationKeysBeforeSave();

    const finishEditRestore = () => {
      this.highlightSelectedKeys(reconciliationKeys);
      this.forceUpdate = true;
      setTimeout(() => {
        this.forceUpdate = false;
        this.isRestoringModelState = false;
        this.cdr.detectChanges();
      }, 100);
    };

    const loadColumnsAndPreProcessing = async () => {
      if (sourceModel.templateFile) {
        await this.resolveAndApplyTemplateColumns(
          sourceModel.templateFile,
          sourceModel.fileType || 'partner',
          {
            partnerKeys: reconciliationKeys.partnerKeys,
            boKeys: this.selectedBOKeys,
            preProcessingConfig: sourceModel.preProcessingConfig,
            partnerConditionalKeys: sourceModel.reconciliationKeys?.partnerConditionalKeys,
            boConditionalKeys: sourceModel.reconciliationKeys?.boConditionalKeys
          }
        );
      }
      this.loadPreProcessingConfig(sourceModel.preProcessingConfig);
      finishEditRestore();
    };

    void loadColumnsAndPreProcessing();
  }

  duplicateModel(model: AutoProcessingModel): void {
    this.errorMessage = '';
    this.successMessage = '';
    this.editModel(model, 'duplicate');
  }

  private buildDuplicateName(baseName: string): string {
    const trimmed = (baseName || I18nService.t('APM.defaultModelName')).trim();
    let candidate = `${trimmed} ${I18nService.t('APM.duplicateSuffix')}`;
    let index = 2;
    while (this.models.some(m => m.name.trim().toLowerCase() === candidate.toLowerCase())) {
      candidate = `${trimmed} ${I18nService.t('APM.duplicateSuffixIndex', { index })}`;
      index++;
    }
    return candidate;
  }

  private buildModelDuplicate(source: AutoProcessingModel): AutoProcessingModel {
    const clone = JSON.parse(JSON.stringify(source)) as AutoProcessingModel;
    delete clone.id;
    delete clone.modelId;
    delete clone.createdAt;
    delete clone.updatedAt;
    clone.name = this.buildDuplicateName(source.name);
    clone.columnProcessingRules = (source.columnProcessingRules || []).map(rule => {
      const { id, ...rest } = rule as ColumnProcessingRule & { id?: number };
      return { ...rest };
    });
    return clone;
  }

  private loadColumnProcessingRulesForDuplicate(
    sourceModel: AutoProcessingModel,
    embeddedRules?: ColumnProcessingRule[]
  ): void {
    if (embeddedRules?.length) {
      this.columnProcessingRules = embeddedRules.map(rule => {
        const { id, ...rest } = rule as ColumnProcessingRule & { id?: number };
        return { ...rest };
      });
      return;
    }

    const modelId = sourceModel.id || sourceModel.modelId;
    if (!modelId) {
      this.columnProcessingRules = [];
      return;
    }

    this.autoProcessingService.getColumnProcessingRules(modelId, AutoProcessingService.MODELES_MODULE)
      .then(rules => {
        this.columnProcessingRules = rules
          .sort((a, b) => (a.ruleOrder ?? 0) - (b.ruleOrder ?? 0))
          .map(rule => {
            const { id, ...rest } = rule as ColumnProcessingRule & { id?: number };
            return { ...rest };
          });
      })
      .catch(() => {
        this.columnProcessingRules = [];
      });
  }
    
  async deleteModel(model: AutoProcessingModel): Promise<void> {
    const confirmed = await this.popupService.showConfirm(
      I18nService.t('APM.confirmDeleteModel', { name: model.name }),
      I18nService.t('APM.confirmDeleteTitle')
    );
    if (confirmed) {
      this.autoProcessingService.deleteModel(model.id).then(() => {
        this.successMessage = I18nService.t('APM.modelDeleted');
          this.loadModels();
      }).catch(error => {
        console.error('Erreur lors de la suppression:', error);
        this.errorMessage = I18nService.t('APM.errorDeleteModel');
      });
    }
  }



  /**
   * Méthode alternative pour afficher le formulaire de création
   */
  displayCreateForm(): void {
    console.log('🔄 displayCreateForm() appelé - affichage du formulaire de création');
    this.resetForm();
  }

  /**
   * Met en évidence visuellement les clés sélectionnées dans l'interface
   */
  highlightSelectedKeys(reconciliationKeys: any): void {
    console.log('🎯 Mise en évidence des clés sélectionnées:', reconciliationKeys);
    
    // Forcer la détection des changements pour mettre à jour les classes CSS
    setTimeout(() => {
      // Déclencher un événement de changement pour forcer la mise à jour des classes
      const partnerKeysControl = this.modelForm.get('reconciliationKeys.partnerKeys');
      const boKeysControl = this.modelForm.get('reconciliationKeys.boKeys');
      const boModelsControl = this.modelForm.get('reconciliationKeys.boModels');
      
      if (partnerKeysControl) {
        partnerKeysControl.updateValueAndValidity();
        partnerKeysControl.markAsTouched();
      }
      
      if (boKeysControl) {
        boKeysControl.updateValueAndValidity();
        boKeysControl.markAsTouched();
      }
      
      if (boModelsControl) {
        boModelsControl.updateValueAndValidity();
        boModelsControl.markAsTouched();
      }
      
      // Forcer la détection des changements
      this.modelForm.updateValueAndValidity();
      this.cdr.detectChanges();
      
      console.log('✨ Classes CSS mises à jour pour la mise en évidence');
    }, 100);
  }

  /**
   * Méthodes pour vérifier si les clés sont sélectionnées
   */
  hasPartnerKeys(): boolean {
    const partnerKeys = this.modelForm.get('reconciliationKeys.partnerKeys')?.value;
    return partnerKeys && partnerKeys.length > 0;
  }

  hasBoKeys(): boolean {
    const boKeys = this.modelForm.get('reconciliationKeys.boKeys')?.value;
    return boKeys && boKeys.length > 0;
  }

  hasBoModels(): boolean {
    const boModels = this.modelForm.get('reconciliationKeys.boModels')?.value;
    return boModels && boModels.length > 0;
  }

  /**
   * Retourne les suggestions de patterns basées sur le type de fichier
   */
  getPatternSuggestions(): string[] {
    const fileType = this.modelForm.get('fileType')?.value;
    
    switch (fileType) {
      case 'bo':
        return [
          '*TRXBO*.csv',
          '*TRXBO*.xls',
          '*TRXBO*.xlsx',
          '*bo*.csv',
          '*backoffice*.csv',
          '*BO*.csv'
        ];
      case 'partner':
        return [
          '*CIOMCM*.xls',
          '*CIOMCM*.xlsx',
          '*CIOMCM*.csv',
          '*PMOMCM*.xls',
          '*PMOMCM*.xlsx',
          '*PMOMCM*.csv',
          '*CIOMML*.xls',
          '*PMOMML*.xls',
          '*CIOMGN*.xls',
          '*PMOMGN*.xls',
          '*CIOMCI*.xls',
          '*PMOMCI*.xls',
          '*CIOMSN*.xls',
          '*PMOMSN*.xls',
          '*CIOMKN*.xls',
          '*PMOMKN*.xls',
          '*CIOMBJ*.xls',
          '*PMOMBJ*.xls',
          '*CIOMGB*.xls',
          '*PMOMGB*.xls',
          '*OPPART*.xls',
          '*OPPART*.xlsx',
          '*USSDPART*.csv',
          '*USSDPART*.xls',
          '*partner*.csv',
          '*partner*.xls',
          '*partenaire*.csv'
        ];
      case 'both':
        return [
          '*TRXBO*.csv',
          '*CIOMCM*.xls',
          '*PMOMCM*.xls',
          '*OPPART*.xls',
          '*USSDPART*.csv',
          '*bo*.csv',
          '*partner*.csv'
        ];
      default:
        return [
          '*TRXBO*.csv',
          '*CIOMCM*.xls',
          '*PMOMCM*.xls',
          '*OPPART*.xls',
          '*USSDPART*.csv'
        ];
    }
  }

  /**
   * Applique un pattern suggéré
   */
  applyPatternSuggestion(pattern: string): void {
    this.modelForm.patchValue({
      filePattern: pattern
    });
    console.log(`✅ Pattern appliqué: ${pattern}`);
  }

  /**
   * Marque tous les contrôles du formulaire comme touchés pour afficher les erreurs
   */
  private markFormGroupTouched(): void {
    Object.keys(this.modelForm.controls).forEach(key => {
      const control = this.modelForm.get(key);
      if (control) {
        control.markAsTouched();
        if (control instanceof FormGroup) {
          this.markFormGroupTouched();
        }
      }
    });
  }

  /**
   * Ajoute une classe CSS pour mettre en évidence les éléments sélectionnés
   */
  private addHighlightClass(controlName: string, selectedValues: string[]): void {
    console.log(`🎨 Mise en évidence ${controlName}:`, selectedValues);
    
    // Les classes CSS sont maintenant gérées directement dans le template
    // via les directives [class.has-selected-keys] et [class.*-selected]
    // Cette méthode peut être étendue pour d'autres types de mise en évidence
    
    // Optionnel : Ajouter une animation ou un effet visuel supplémentaire
    if (selectedValues.length > 0) {
      console.log(`✨ ${selectedValues.length} élément(s) sélectionné(s) pour ${controlName}`);
    }
  }

  cancelEdit(): void {
    this.modelForm.reset({
      fileType: 'bo',
      autoApply: true,
      reconciliationKeys: {
        partnerKeys: [],
        boKeys: [],
        boModels: [],
        boModelKeys: {},
        boTreatments: {}
      }
    });
    this.editingModel = null;
    this.isDuplicatingModel = false;
    this.showCreateForm = false;
    this.errorMessage = '';
    this.successMessage = '';
  }

  // ===== MÉTHODES POUR LES RÈGLES DE TRAITEMENT DES COLONNES =====

  toggleColumnRulesSection(): void {
    this.showColumnRulesSection = !this.showColumnRulesSection;
  }

  addColumnRule(): void {
    this.editingRule = null;
    this.ruleForm.reset({
      sourceColumn: '',
      targetColumn: '',
      formatType: 'string',
      toUpperCase: false,
      toLowerCase: false,
      trimSpaces: false,
      removeSpecialChars: true,
      stringToRemove: '',
      padZeros: false,
      regexReplace: '',
      specialCharReplacementMap: {}
    });
  }

  editColumnRule(rule: ColumnProcessingRule): void {
    this.editingRule = rule;
    this.ruleForm.patchValue({
      sourceColumn: rule.sourceColumn,
      targetColumn: rule.targetColumn,
      formatType: rule.formatType || 'string',
      toUpperCase: rule.toUpperCase || false,
      toLowerCase: rule.toLowerCase || false,
      trimSpaces: rule.trimSpaces || false,
      removeSpecialChars: rule.removeSpecialChars || false,
      stringToRemove: rule.stringToRemove || '',
      padZeros: rule.padZeros || false,
      regexReplace: rule.regexReplace || '',
      specialCharReplacementMap: rule.specialCharReplacementMap || {}
    });
  }

  saveColumnRule(): void {
    if (this.ruleForm.valid) {
      const ruleData = this.ruleForm.value;
      
      if (this.editingRule) {
        // Mise à jour d'une règle existante
        const index = this.columnProcessingRules.findIndex(r => r.id === this.editingRule!.id);
        if (index !== -1) {
          this.columnProcessingRules[index] = { ...this.editingRule, ...ruleData };
        }
      } else {
        // Ajout d'une nouvelle règle
        const newRule: ColumnProcessingRule = {
          ...ruleData,
          id: Date.now(), // ID temporaire
          ruleOrder: this.columnProcessingRules.length
        };
        this.columnProcessingRules.push(newRule);
      }
      
      this.editingRule = null;
      this.ruleForm.reset();
      this.successMessage = I18nService.t('APM.processingRuleSaved');
    }
  }

  async deleteColumnRule(rule: ColumnProcessingRule): Promise<void> {
    const confirmed = await this.popupService.showConfirm(
      I18nService.t('APM.confirmDeleteRule'),
      I18nService.t('APM.confirmDeleteTitle')
    );
    if (confirmed) {
      const index = this.columnProcessingRules.findIndex(r => r.id === rule.id);
      if (index !== -1) {
        this.columnProcessingRules.splice(index, 1);
        this.successMessage = I18nService.t('APM.processingRuleDeleted');
      }
    }
  }

  cancelColumnRuleEdit(): void {
    this.editingRule = null;
    this.ruleForm.reset();
  }

  moveRuleUp(index: number): void {
    if (index > 0) {
      const temp = this.columnProcessingRules[index];
      this.columnProcessingRules[index] = this.columnProcessingRules[index - 1];
      this.columnProcessingRules[index - 1] = temp;
    }
  }

  moveRuleDown(index: number): void {
    if (index < this.columnProcessingRules.length - 1) {
      const temp = this.columnProcessingRules[index];
      this.columnProcessingRules[index] = this.columnProcessingRules[index + 1];
      this.columnProcessingRules[index + 1] = temp;
    }
  }

  // Méthode pour obtenir toutes les colonnes disponibles (améliorée)
  private fileNameMatchesKind(fileName: string | null | undefined, kind: 'OPPART' | 'TRXBO' | 'USSDPART'): boolean {
    const code = kind === 'OPPART' ? 'MODELES.TOKENS_OPPART'
      : kind === 'TRXBO' ? 'MODELES.TOKENS_TRXBO'
      : 'MODELES.TOKENS_USSDPART';
    const tokens = this.calculService.getList(code, [kind]);
    const normalized = (fileName || '').toLowerCase();
    return tokens.some(token => normalized.includes(token.toLowerCase()));
  }

  getAllAvailableColumns(): string[] {
    const allColumns = new Set<string>();
    
    // Ajouter les colonnes des fichiers disponibles
    this.availableFiles.forEach(file => {
      if (file.columns && Array.isArray(file.columns)) {
        // Gestion spécifique pour OPPART.xls
        if (this.fileNameMatchesKind(file.fileName, 'OPPART')) {
          console.log('🔍 Détection spécifique OPPART dans getAllAvailableColumns');
          const oppartColumns = [
            'ID Opération', 'Type Opération', 'Montant', 'Solde avant', 'Solde aprés',
            'Code proprietaire', 'Téléphone', 'Statut', 'ID Transaction', 'Num bordereau',
            'Date opération', 'Date de versement', 'Banque appro', 'Login demandeur Appro',
            'Login valideur Appro', 'Motif rejet', 'Frais connexion', 'Numéro Trans GU',
            'Agent', 'Motif régularisation', 'groupe de réseau'
          ];
          oppartColumns.forEach(col => allColumns.add(col));
        }
        // Gestion spécifique pour TRXBO.xls
        else if (this.fileNameMatchesKind(file.fileName, 'TRXBO')) {
          console.log('🔍 Détection spécifique TRXBO dans getAllAvailableColumns');
          const trxboColumns = [
            'ID', 'IDTransaction', 'téléphone client', 'montant', 'Service',
            'Moyen de Paiement', 'Agence', 'Agent', 'Type agent', 'PIXI',
            'Date', 'Numéro Trans GU', 'GRX', 'Statut', 'Latitude',
            'Longitude', 'ID Partenaire DIST', 'Expéditeur', 'Pays provenance',
            'Bénéficiaire', 'Canal de distribution'
          ];
          trxboColumns.forEach(col => allColumns.add(col));
        }
        // Gestion spécifique pour USSDPART.xls
        else if (this.fileNameMatchesKind(file.fileName, 'USSDPART')) {
          console.log('🔍 Détection spécifique USSDPART dans getAllAvailableColumns');
          const ussdpartColumns = [
            'ID', 'Groupe Réseaux', 'Code réseau', 'Agence', 'Code PIXI',
            'Code de Proxy', 'Code service', 'Numéro Trans GU', 'Déstinataire',
            'Login agent', 'Type agent', 'date de création', 'Date d\'envoi vers part',
            'Etat', 'Type', 'Token', 'SMS', 'Action faite', 'Statut',
            'Utilisateur', 'Montant', 'Date dernier traitement', 'Latitude',
            'Longitude', 'Partenaire dist ID', 'Agence SC', 'Groupe reseau SC',
            'Agent SC', 'PDA SC'
          ];
          ussdpartColumns.forEach(col => allColumns.add(col));
        } else {
          file.columns.forEach((col: string) => {
            allColumns.add(this.normalizeColumnName(col));
          });
        }
      }
    });
    
    // Ajouter les colonnes du template
    this.availableColumnsForTemplate.forEach(col => {
      allColumns.add(this.normalizeColumnName(col));
    });
    
    // Ajouter les colonnes disponibles
    this.availableColumns.forEach(col => {
      allColumns.add(this.normalizeColumnName(col));
    });
    
    return Array.from(allColumns).sort();
  }

  // ===== MÉTHODES POUR LA CONFIGURATION DES MODÈLES AUTONOMES =====

  // Toggle des sections
  toggleReconciliationLogicSection(): void {
    this.showReconciliationLogicSection = !this.showReconciliationLogicSection;
  }

  toggleCorrespondenceRulesSection(): void {
    this.showCorrespondenceRulesSection = !this.showCorrespondenceRulesSection;
  }

  toggleComparisonColumnsSection(): void {
    this.showComparisonColumnsSection = !this.showComparisonColumnsSection;
  }

  // Gestion du changement de type de logique
  onLogicTypeChange(): void {
    const logicType = this.modelForm.get('logicType')?.value;
    const expectedRatio = this.modelForm.get('expectedRatio')?.value || '1:1';
    const partnerCount = Number(String(expectedRatio).split(':')[1] ?? '1');

    if (logicType === 'SPECIAL_RATIO'
        && this.modelForm.get('fileType')?.value === 'partner'
        && this.trxboAggregationTypesArray.length === 0) {
      this.generateTrxboAggregationTypesFromComments();
    }

    // Réinitialiser les règles de correspondance selon le type et le ratio attendu
    const presets = RECONCILIATION_LOGIC_LIBRARY[logicType];
    if (presets) {
      this.correspondenceRules = presets.map(preset => ({
        name: preset.id,
        // Le preset SPECIAL_RATIO doit refléter le ratio choisi, sinon le modèle reste figé sur 1:2
        condition: preset.condition.replace(/(==|!=|>=|<=|>|<)\s*2\b/, `$1 ${partnerCount}`),
        action: preset.action,
        description: preset.description.replace(/\b2\b/g, String(partnerCount))
      }));
    }
  }

  /** Recalcule les presets de logique lorsque le ratio attendu change. */
  onExpectedRatioChange(): void {
    if (this.modelForm.get('logicType')?.value === 'SPECIAL_RATIO') {
      this.onLogicTypeChange();
    }
  }

  /** Libellé traduit d'une règle de la bibliothèque (l'identifiant reste celui persisté). */
  getLogicRuleLabelKey(name: string): string {
    return this.findLogicRulePreset(name)?.labelKey || '';
  }

  /** Description traduite d'une règle de la bibliothèque (jamais réinjectée dans le modèle). */
  getLogicRuleDescriptionKey(name: string): string {
    return this.findLogicRulePreset(name)?.descriptionKey || '';
  }

  private findLogicRulePreset(name: string): ReconciliationLogicRulePreset | undefined {
    return Object.values(RECONCILIATION_LOGIC_LIBRARY)
      .flat()
      .find(preset => preset.id === name);
  }

  // ===== MÉTHODES POUR LES RÈGLES DE CORRESPONDANCE =====

  addCorrespondenceRule(): void {
    this.editingCorrespondenceRule = null;
    this.correspondenceRuleForm.reset({
      name: '',
      condition: '',
      action: '',
      description: ''
    });
  }

  editCorrespondenceRule(rule: any): void {
    this.editingCorrespondenceRule = rule;
    this.correspondenceRuleForm.patchValue({
      name: rule.name,
      condition: rule.condition,
      action: rule.action,
      description: rule.description
    });
  }

  saveCorrespondenceRule(): void {
    if (this.correspondenceRuleForm.valid) {
      const ruleData = this.correspondenceRuleForm.value;
      
      if (this.editingCorrespondenceRule) {
        // Mise à jour d'une règle existante
        const index = this.correspondenceRules.findIndex(r => r === this.editingCorrespondenceRule);
        if (index !== -1) {
          this.correspondenceRules[index] = ruleData;
        }
      } else {
        // Ajout d'une nouvelle règle
        this.correspondenceRules.push(ruleData);
      }
      
      this.editingCorrespondenceRule = null;
      this.correspondenceRuleForm.reset();
      this.successMessage = I18nService.t('APM.correspondenceRuleSaved');
    }
  }

  deleteCorrespondenceRule(rule: any): void {
    if (confirm(I18nService.t('APM.confirmDeleteRule'))) {
      const index = this.correspondenceRules.findIndex(r => r === rule);
      if (index !== -1) {
        this.correspondenceRules.splice(index, 1);
        this.successMessage = I18nService.t('APM.correspondenceRuleDeleted');
      }
    }
  }

  cancelCorrespondenceRuleEdit(): void {
    this.editingCorrespondenceRule = null;
    this.correspondenceRuleForm.reset();
  }

  moveCorrespondenceRuleUp(index: number): void {
    if (index > 0) {
      const temp = this.correspondenceRules[index];
      this.correspondenceRules[index] = this.correspondenceRules[index - 1];
      this.correspondenceRules[index - 1] = temp;
    }
  }

  moveCorrespondenceRuleDown(index: number): void {
    if (index < this.correspondenceRules.length - 1) {
      const temp = this.correspondenceRules[index];
      this.correspondenceRules[index] = this.correspondenceRules[index + 1];
      this.correspondenceRules[index + 1] = temp;
    }
  }

  // ===== CLÉS PARTENAIRE CONDITIONNELLES (OPTIONNEL) =====

  isPartnerConditionalKeysConfigValid(): boolean {
    if (!this.partnerConditionalKeysEnabled) {
      return false;
    }
    if (!this.partnerConditionColumn?.trim()) {
      return false;
    }
    return this.partnerConditionalKeyRules.some(
      rule => rule.whenValue?.trim() && rule.keyColumn?.trim()
    );
  }

  buildPartnerConditionalKeysConfig() {
    if (!this.partnerConditionalKeysEnabled) {
      return { enabled: false, conditionColumn: '', rules: [] };
    }
    return {
      enabled: true,
      conditionColumn: this.partnerConditionColumn.trim(),
      rules: this.partnerConditionalKeyRules
        .filter(rule => rule.whenValue?.trim() && rule.keyColumn?.trim())
        .map(rule => ({
          whenValue: rule.whenValue.trim(),
          keyColumn: rule.keyColumn.trim(),
          ...(rule.boKeyColumn?.trim() ? { boKeyColumn: rule.boKeyColumn.trim() } : {})
        })),
      defaultKeyColumn: this.partnerConditionalDefaultKeyColumn?.trim() || undefined,
      ...(this.partnerConditionalEnvEnabled && this.partnerConditionalEnvValue
        ? { envConditionValue: this.partnerConditionalEnvValue }
        : {})
    };
  }

  loadPartnerConditionalKeysConfig(config?: {
    enabled?: boolean;
    conditionColumn?: string;
    rules?: PartnerConditionalKeyRule[];
    defaultKeyColumn?: string;
    envConditionValue?: string;
  }): void {
    this.partnerConditionalKeysEnabled = !!config?.enabled;
    this.partnerConditionColumn = config?.conditionColumn || '';
    this.partnerConditionalDefaultKeyColumn = config?.defaultKeyColumn || '';
    this.partnerConditionalEnvEnabled = !!config?.envConditionValue?.trim();
    this.partnerConditionalEnvValue = config?.envConditionValue
      && ENV_COLUMN_OPTIONS.includes(config.envConditionValue as EnvColumnOption)
      ? config.envConditionValue as EnvColumnOption
      : '';
    this.partnerConditionalKeyRules = config?.rules?.length
      ? config.rules.map(rule => ({ ...rule }))
      : [{ whenValue: '', keyColumn: '', boKeyColumn: '' }];
  }

  resetPartnerConditionalKeysConfig(): void {
    this.partnerConditionalKeysEnabled = false;
    this.partnerConditionColumn = '';
    this.partnerConditionalDefaultKeyColumn = '';
    this.partnerConditionalEnvEnabled = false;
    this.partnerConditionalEnvValue = '';
    this.partnerConditionalKeyRules = [{ whenValue: '', keyColumn: '', boKeyColumn: '' }];
  }

  addPartnerConditionalKeyRule(): void {
    this.partnerConditionalKeyRules.push({ whenValue: '', keyColumn: '', boKeyColumn: '' });
  }

  removePartnerConditionalKeyRule(index: number): void {
    if (this.partnerConditionalKeyRules.length <= 1) {
      this.partnerConditionalKeyRules[0] = { whenValue: '', keyColumn: '', boKeyColumn: '' };
      return;
    }
    this.partnerConditionalKeyRules.splice(index, 1);
  }

  // ===== CLÉS BO CONDITIONNELLES (OPTIONNEL) =====

  isBoConditionalKeysConfigValid(): boolean {
    if (!this.boConditionalKeysEnabled) {
      return false;
    }
    if (!this.boConditionColumn?.trim()) {
      return false;
    }
    return this.boConditionalKeyRules.some(
      rule => rule.whenValue?.trim() && rule.keyColumn?.trim()
    );
  }

  buildBoConditionalKeysConfig(): BoConditionalKeysConfig {
    if (!this.boConditionalKeysEnabled) {
      return { enabled: false, conditionColumn: '', rules: [] };
    }
    return {
      enabled: true,
      conditionColumn: this.boConditionColumn.trim(),
      rules: this.boConditionalKeyRules
        .filter(rule => rule.whenValue?.trim() && rule.keyColumn?.trim())
        .map(rule => ({
          whenValue: rule.whenValue.trim(),
          keyColumn: rule.keyColumn.trim()
        })),
      defaultKeyColumn: this.boConditionalDefaultKeyColumn?.trim() || undefined
    };
  }

  loadBoConditionalKeysConfig(config?: BoConditionalKeysConfig): void {
    this.boConditionalKeysEnabled = !!config?.enabled;
    this.boConditionColumn = config?.conditionColumn || '';
    this.boConditionalDefaultKeyColumn = config?.defaultKeyColumn || '';
    this.boConditionalKeyRules = config?.rules?.length
      ? config.rules.map(rule => ({ ...rule }))
      : [{ whenValue: '', keyColumn: '', boKeyColumn: '' }];
  }

  resetBoConditionalKeysConfig(): void {
    this.boConditionalKeysEnabled = false;
    this.boConditionColumn = '';
    this.boConditionalDefaultKeyColumn = '';
    this.boConditionalKeyRules = [{ whenValue: '', keyColumn: '' }];
  }

  addBoConditionalKeyRule(): void {
    this.boConditionalKeyRules.push({ whenValue: '', keyColumn: '' });
  }

  removeBoConditionalKeyRule(index: number): void {
    if (this.boConditionalKeyRules.length <= 1) {
      this.boConditionalKeyRules[0] = { whenValue: '', keyColumn: '' };
      return;
    }
    this.boConditionalKeyRules.splice(index, 1);
  }

  // ===== MÉTHODES POUR LES CLÉS DE RÉCONCILIATION =====

  /**
   * Charge les colonnes du fichier modèle sélectionné
   * Méthode centralisée avec encodage, typage et normalisation standardisés
   */
  async loadTemplateColumns(): Promise<void> {
    const templateFile = this.modelForm.get('templateFile')?.value;
    if (!templateFile) {
      this.syncTemplateColumnLists([]);
      if (!this.isRestoringModelState) {
        this.selectedPartnerKeys = [];
      }
      return;
    }

    const preservedPartnerKeys = [...this.selectedPartnerKeys];
    const fileType = this.modelForm.get('fileType')?.value || 'partner';

    if (!this.isRestoringModelState) {
      this.selectedPartnerKeys = [];
    }

    await this.resolveAndApplyTemplateColumns(templateFile, fileType, {
      partnerKeys: preservedPartnerKeys
    });

    if (preservedPartnerKeys.length > 0) {
      this.selectedPartnerKeys = preservedPartnerKeys.filter(key =>
        this.availableTemplateColumns.includes(key) || key.length > 0
      );
      this.modelForm.patchValue({
        reconciliationKeys: { partnerKeys: this.selectedPartnerKeys }
      }, { emitEvent: false });
    }
  }

  /**
   * Met à jour toutes les sections avec les colonnes du modèle normalisées
   * Méthode centralisée pour assurer la cohérence entre toutes les sections
   */
  private updateAllSectionsWithModelColumns(): void {
    console.log('🔄 Mise à jour de toutes les sections avec les colonnes du modèle...');
    
    // Mettre à jour les colonnes disponibles pour les règles de traitement
    this.availableColumnsForTemplate = [...this.availableTemplateColumns];
    
    // Mettre à jour les colonnes disponibles pour les clés de réconciliation
    if (this.modelForm.get('fileType')?.value === 'partner') {
      // Pour les modèles partenaires, les colonnes du modèle sont les colonnes partenaires
      this.availableColumns = [...this.availableTemplateColumns];
    }
    
    console.log('✅ Toutes les sections mises à jour avec les colonnes normalisées:', {
      templateColumns: this.availableTemplateColumns.length,
      forTemplate: this.availableColumnsForTemplate.length,
      availableColumns: this.availableColumns.length
    });
  }

  /**
   * Charge les colonnes des modèles BO sélectionnés
   */
  async loadBOColumns(): Promise<void> {
    if (this.selectedBOModels.length === 0) {
      this.availableBOColumns = [];
      if (!this.isRestoringModelState) {
        this.selectedBOKeys = [];
      }
      return;
    }

    const preservedBOKeys = [...this.selectedBOKeys];

    this.isLoadingBOColumns = true;
    this.availableBOColumns = [];

    try {
      const columns = new Set<string>();

      for (const modelId of this.selectedBOModels) {
        const model = this.availableBOModels.find(m => m.id === modelId);
        if (!model) {
          continue;
        }

        this.appendBoColumnsFromModel(columns, model, modelId);

        if (model.templateFile) {
          const file = this.findAvailableFile(model.templateFile);
          if (!file?.columns?.length) {
            const simulated = await this.getFileColumns(model.templateFile);
            this.normalizeColumnNames(simulated).forEach(col => columns.add(col));
          }
        }
      }

      this.selectedBOKeys.forEach(key => {
        if (key?.trim()) {
          columns.add(this.normalizeColumnName(key));
        }
      });

      if (this.editingModel?.reconciliationKeys?.boKeys) {
        this.editingModel.reconciliationKeys.boKeys.forEach(key => {
          if (key?.trim()) {
            columns.add(this.normalizeColumnName(key));
          }
        });
      }

      this.availableBOColumns = Array.from(columns)
        .filter(col => !!col)
        .sort((a, b) => a.localeCompare(b, 'fr'));

      console.log('✅ Colonnes des modèles BO chargées:', this.availableBOColumns);
      console.log('📊 Détails des modèles BO:', {
        selectedModels: this.selectedBOModels,
        totalColumns: this.availableBOColumns.length,
        columns: this.availableBOColumns
      });
      
      // DEBUG: Vérifier si les colonnes sont correctes
      console.log('🔍 DEBUG - Vérification des colonnes chargées:');
      this.availableBOColumns.forEach((col, index) => {
        console.log(`  ${index + 1}. "${col}"`);
      });

      if (preservedBOKeys.length > 0) {
        this.selectedBOKeys = preservedBOKeys.filter(key =>
          this.availableBOColumns.includes(key)
        );
        this.syncReconciliationKeysBeforeSave();
      }
    } catch (error) {
      console.error('❌ Erreur lors du chargement des colonnes des modèles BO:', error);
      this.errorMessage = I18nService.t('APM.errorLoadBOColumns');
    } finally {
      this.isLoadingBOColumns = false;
    }
  }



  /** Colonnes de fichiers modèles obtenues par analyse (fichiers absents de la liste). */
  private templateFileColumnsCache = new Map<string, string[]>();

  /** Colonnes du fichier modèle telles que lues dans le fichier (vide si introuvable). */
  private async getFileColumns(fileName: string): Promise<string[]> {
    if (!fileName?.trim()) {
      return [];
    }
    await this.ensureAvailableFilesLoaded();
    const file = this.findTemplateFileStrict(fileName);
    if (file?.columns?.length) {
      return file.columns.map((col: string) => String(col).trim()).filter(Boolean);
    }
    const cached = this.templateFileColumnsCache.get(fileName);
    if (cached) {
      return cached;
    }
    try {
      const analyzed = await firstValueFrom(this.fileWatcherService.analyzeFile(file?.fileName || fileName));
      const columns = (analyzed?.columns || []).map((col: string) => String(col).trim()).filter(Boolean);
      this.templateFileColumnsCache.set(fileName, columns);
      return columns;
    } catch {
      return [];
    }
  }

  /** Fichier modèle : même nom (casse ignorée), ou même nom sans extension. */
  private findTemplateFileStrict(templateFile: string) {
    const normalized = (templateFile || '').trim().toLowerCase();
    if (!normalized) {
      return undefined;
    }
    const base = normalized.replace(/\.[^.]+$/, '');
    return this.availableFiles.find(f => f.fileName.trim().toLowerCase() === normalized)
      || this.availableFiles.find(f => f.fileName.trim().toLowerCase().replace(/\.[^.]+$/, '') === base);
  }

  /**
   * Normalise les noms de colonnes (gestion de l'encodage et du typage)
   * Méthode centralisée qui utilise normalizeColumnName pour chaque colonne
   */
  private normalizeColumnNames(columns: string[]): string[] {
    return columns.map(column => this.normalizeColumnName(column));
  }

  /**
   * Obtient les noms des modèles BO sélectionnés
   */
  getSelectedBOModelNames(): string {
    return this.selectedBOModels
      .map(id => {
        const model = this.availableBOModels.find(m => m.id === id);
        return model ? model.name : id;
      })
      .join(', ');
  }

  togglePartnerKey(column: string, event: any): void {
    // Normaliser le nom de la colonne avant traitement
    const normalizedColumn = this.normalizeColumnName(column);
    
    if (event.target.checked) {
      if (!this.selectedPartnerKeys.includes(normalizedColumn)) {
        this.selectedPartnerKeys.push(normalizedColumn);
        console.log('✅ Clé partenaire ajoutée:', normalizedColumn, '(original:', column, ')');
        console.log('📋 Clés partenaire actuelles:', this.selectedPartnerKeys);
      }
    } else {
      this.selectedPartnerKeys = this.selectedPartnerKeys.filter(key => key !== normalizedColumn);
      console.log('❌ Clé partenaire supprimée:', normalizedColumn, '(original:', column, ')');
      console.log('📋 Clés partenaire actuelles:', this.selectedPartnerKeys);
    }
    
    // Synchroniser avec le formulaire
    this.modelForm.patchValue({
      reconciliationKeys: {
        partnerKeys: this.selectedPartnerKeys
      }
    }, { emitEvent: false });
  }

  toggleBOModel(modelId: string, event: any): void {
    if (event.target.checked) {
      if (!this.selectedBOModels.includes(modelId)) {
        this.selectedBOModels.push(modelId);
        this.boModelKeySelection[modelId] = this.boModelKeySelection[modelId] ?? [];
        console.log('✅ Modèle BO ajouté:', modelId);
        console.log('📋 Modèles BO actuels:', this.selectedBOModels);
      }
    } else {
      this.selectedBOModels = this.selectedBOModels.filter(id => id !== modelId);
      delete this.boModelKeySelection[modelId];
      delete this.boModelFileColumns[modelId];
      console.log('❌ Modèle BO supprimé:', modelId);
      console.log('📋 Modèles BO actuels:', this.selectedBOModels);
      if (this.selectedBOModels.length === 0) {
        this.selectedBOKeys = [];
      }
    }

    this.modelForm.patchValue({
      reconciliationKeys: {
        boModels: this.selectedBOModels
      }
    }, { emitEvent: false });
    this.onBOModelsChange();
    this.loadBOColumns();
    void this.refreshBoModelFileColumns();
  }

  /** Colonnes du fichier modèle d'un modèle BO sélectionné (affichage cloisonné par modèle). */
  getBoModelFileColumns(modelId: string): string[] {
    return this.boModelFileColumns[modelId] || [];
  }

  getBoModelName(modelId: string): string {
    return this.findBoModel(modelId)?.name || modelId;
  }

  getBoModelTemplateFile(modelId: string): string {
    return this.findBoModel(modelId)?.templateFile || '';
  }

  private findBoModel(modelId: string): AutoProcessingModel | undefined {
    return this.availableBOModels.find(m => m.id === modelId)
      || this.models.find(m => m.id === modelId || m.modelId === modelId);
  }

  isBoModelKeySelected(modelId: string, column: string): boolean {
    return (this.boModelKeySelection[modelId] || []).includes(column);
  }

  /** Clés enregistrées pour ce modèle BO mais absentes de son fichier modèle (à retirer). */
  getBoModelKeysOutsideFile(modelId: string): string[] {
    const columns = new Set(this.getBoModelFileColumns(modelId));
    if (!columns.size) {
      return [];
    }
    return (this.boModelKeySelection[modelId] || []).filter(key => !columns.has(key));
  }

  /** Clés partenaire enregistrées mais absentes du fichier modèle (à retirer). */
  get partnerKeysOutsideFile(): string[] {
    const columns = new Set(this.templateFileColumns);
    if (!columns.size) {
      return [];
    }
    return this.selectedPartnerKeys.filter(key => !columns.has(key));
  }

  removePartnerKey(column: string): void {
    this.togglePartnerKey(column, { target: { checked: false } });
  }

  toggleBoModelKey(modelId: string, column: string, checked: boolean): void {
    const current = this.boModelKeySelection[modelId] || [];
    this.boModelKeySelection[modelId] = checked
      ? (current.includes(column) ? current : [...current, column])
      : current.filter(key => key !== column);
    this.syncBoKeysFromModelSelection();
  }

  /** Clés BO globales (boKeys) = union des clés de chaque modèle ; boModelKeys = clés par modèle. */
  private syncBoKeysFromModelSelection(): void {
    const boModelKeys: Record<string, string[]> = {};
    this.selectedBOModels.forEach(modelId => {
      boModelKeys[modelId] = [...(this.boModelKeySelection[modelId] || [])];
    });
    this.selectedBOKeys = [...new Set(Object.values(boModelKeys).flat())];
    const group = this.modelForm.get('reconciliationKeys.boModelKeys') as FormGroup | null;
    if (group) {
      Object.entries(boModelKeys).forEach(([modelId, keys]) => {
        const control = group.get(modelId);
        if (control) {
          control.setValue(keys, { emitEvent: false });
        } else {
          group.addControl(modelId, this.fb.control(keys), { emitEvent: false });
        }
      });
    }
    this.modelForm.patchValue({ reconciliationKeys: { boKeys: this.selectedBOKeys } }, { emitEvent: false });
  }

  /** Lit les colonnes du fichier modèle de chaque modèle BO sélectionné. */
  private async refreshBoModelFileColumns(): Promise<void> {
    const next: Record<string, string[]> = {};
    for (const modelId of [...this.selectedBOModels]) {
      const templateFile = this.getBoModelTemplateFile(modelId);
      next[modelId] = templateFile ? this.normalizeColumnNames(await this.getFileColumns(templateFile)) : [];
    }
    this.boModelFileColumns = next;
    this.cdr.detectChanges();
  }

  // ===== MÉTHODES POUR LES RÈGLES DE TRAITEMENT DES COLONNES (NOUVELLE STRUCTURE) =====

  toggleColumnProcessingSection(): void {
    this.showColumnProcessingSection = !this.showColumnProcessingSection;
    
    // Si on affiche la section, s'assurer que les colonnes sont chargées avec la méthode centralisée
    if (this.showColumnProcessingSection) {
      this.ensureModelColumnsLoaded();
      this.updateAllSectionsWithModelColumns();
      
      console.log('✅ Section règles de traitement ouverte avec colonnes centralisées:', {
        availableTemplateColumns: this.availableTemplateColumns.length,
        availableColumnsForTemplate: this.availableColumnsForTemplate.length
      });
    }
  }

  // Méthodes pour la logique de réconciliation
  editReconciliationLogic(): void {
    this.editingReconciliationLogic = true;
    
    // Initialiser les valeurs si elles n'existent pas
    if (!this.modelForm.get('logicType')?.value) {
      this.modelForm.patchValue({
        logicType: 'STANDARD',
        expectedRatio: '1:1',
        logicDescription: '',
        tolerance: 0.0
      });
    }
    
    // Pré-remplir les modes d'agrégation par défaut si aucun n'est configuré
    if (this.modelForm.get('fileType')?.value === 'partner'
        && this.modelForm.get('logicType')?.value === 'SPECIAL_RATIO'
        && this.trxboAggregationTypesArray.length === 0) {
      this.generateTrxboAggregationTypesFromComments();
    }
    
    // Forcer la mise à jour de l'affichage
    this.cdr.detectChanges();
    
    console.log('🔧 Édition de la logique de réconciliation - Valeurs actuelles:', {
      logicType: this.modelForm.get('logicType')?.value,
      expectedRatio: this.modelForm.get('expectedRatio')?.value,
      logicDescription: this.modelForm.get('logicDescription')?.value,
      tolerance: this.modelForm.get('tolerance')?.value
    });
  }

  saveReconciliationLogic(): void {
    // Vérifier seulement les champs de logique de réconciliation
    const logicType = this.modelForm.get('logicType')?.value;
    const expectedRatio = this.modelForm.get('expectedRatio')?.value;
    const logicDescription = this.modelForm.get('logicDescription')?.value;
    const tolerance = this.modelForm.get('tolerance')?.value;
    
    // Validation spécifique pour la logique de réconciliation
    if (!logicType || logicType.trim() === '') {
      this.errorMessage = I18nService.t('APM.errorSelectLogicType');
      console.error('❌ Erreur: Type de logique non sélectionné');
      return;
    }

    const trxboOppartParams = this.isTrxboOppartConfigApplicable({
      fileType: this.modelForm.get('fileType')?.value,
      logicType
    })
      ? { trxboOppart: this.buildTrxboOppartConfig(this.modelForm.value) }
      : {};

    // Sauvegarder dans la configuration de réconciliation
    const reconciliationLogic = {
      type: logicType,
      parameters: {
        expectedRatio: expectedRatio || '1:1',
        description: logicDescription || '',
        tolerance: tolerance || 0.0,
        ...trxboOppartParams
      }
    };

    // Mettre à jour le modèle en cours d'édition si on est en mode édition
    if (this.editingModel) {
      this.editingModel.reconciliationLogic = reconciliationLogic;
    }

    this.editingReconciliationLogic = false;

    const modelIdToUse = this.editingModel
      ? (this.editingModel.dbId != null
          ? String(this.editingModel.dbId)
          : (this.editingModel.modelId || this.editingModel.id))
      : null;

    // En création, la logique sera persistée avec le modèle via saveModel()
    if (!this.editingModel || !modelIdToUse) {
      this.successMessage = I18nService.t('APM.reconciliationLogicSaved');
      console.log('✅ Logique de réconciliation enregistrée (persistée avec le modèle):', reconciliationLogic);
      setTimeout(() => {
        this.successMessage = '';
      }, 3000);
      return;
    }

    // Persister immédiatement la logique côté API pour le modèle existant
    const payload = this.buildModelSavePayload(this.modelForm.value);
    this.autoProcessingService.updateModel(modelIdToUse, payload)
      .then(() => {
        this.successMessage = I18nService.t('APM.reconciliationLogicSaved');
        console.log('✅ Logique de réconciliation persistée:', reconciliationLogic);
        setTimeout(() => {
          this.successMessage = '';
        }, 3000);
      })
      .catch(error => {
        const backendMessage =
          error?.error?.error ||
          error?.error?.message ||
          error?.message;
        this.errorMessage = backendMessage
          ? I18nService.t('APM.errorSaveModelWithReason', { message: backendMessage })
          : I18nService.t('APM.errorSaveModel');
        console.error('❌ Erreur lors de la persistance de la logique de réconciliation:', error);
      });
  }

  cancelReconciliationLogicEdit(): void {
    this.editingReconciliationLogic = false;
  }

  // Méthode de debug pour vérifier l'état des sélections
  debugValidationState(): void {
    // Méthode de debug supprimée pour nettoyer l'interface
  }

  addColumnProcessingRule(): void {
    this.editingColumnProcessingRule = -1;
    
    // S'assurer que les colonnes du modèle sont chargées avec la méthode centralisée
    this.ensureModelColumnsLoaded();
    
    // Mettre à jour les colonnes disponibles pour les règles de traitement
    this.updateAllSectionsWithModelColumns();
    
    // Réinitialiser la sélection de colonnes
    this.selectedColumns = [];
    
    this.columnProcessingRuleForm.reset({
      sourceColumn: '',
      targetColumn: '',
      formatType: '',
      toUpperCase: false,
      toLowerCase: false,
      trimSpaces: false,
      removeSpecialChars: true,
      removeAccents: false,
      stringToRemove: '',
      padZeros: false,
      regexReplace: ''
    });
    
    console.log('✅ Règle de traitement ajoutée avec sélection multiple de colonnes:', {
      availableTemplateColumns: this.availableTemplateColumns.length,
      availableColumnsForTemplate: this.availableColumnsForTemplate.length,
      selectedColumns: this.selectedColumns.length
    });
  }

  editColumnProcessingRule(index: number): void {
    this.editingColumnProcessingRule = index;
    const rule = this.columnProcessingRules[index];
    
    // S'assurer que les colonnes sont à jour avec la méthode centralisée
    this.ensureModelColumnsLoaded();
    this.updateAllSectionsWithModelColumns();
    
    // Charger la colonne source dans selectedColumns
    if (rule.sourceColumn) {
      this.selectedColumns = [rule.sourceColumn];
    } else if (rule.sourceColumns && rule.sourceColumns.length > 0) {
      this.selectedColumns = [...rule.sourceColumns];
    } else {
      this.selectedColumns = [];
    }
    
    this.columnProcessingRuleForm.patchValue({
      sourceColumn: rule.sourceColumn,
      targetColumn: rule.targetColumn || '',
      formatType: rule.formatType || '',
      toUpperCase: rule.toUpperCase || false,
      toLowerCase: rule.toLowerCase || false,
      trimSpaces: rule.trimSpaces || false,
      removeSpecialChars: rule.removeSpecialChars || false,
      removeAccents: rule.removeAccents || false,
      stringToRemove: rule.stringToRemove || '',
      padZeros: rule.padZeros || false,
      regexReplace: rule.regexReplace || ''
    });
    
    console.log('✅ Édition de règle de traitement avec colonnes centralisées:', {
      ruleSourceColumn: rule.sourceColumn,
      selectedColumns: this.selectedColumns,
      availableTemplateColumns: this.availableTemplateColumns.length,
      availableColumnsForTemplate: this.availableColumnsForTemplate.length
    });
  }

  saveColumnProcessingRule(): void {
    console.log('🚀 [DEBUG] saveColumnProcessingRule() appelée');
    console.log('🔍 [DEBUG] État du formulaire:', this.columnProcessingRuleForm.valid);
    console.log('🔍 [DEBUG] Colonnes sélectionnées:', this.selectedColumns);
    
    // Validation personnalisée pour la sélection multiple
    if (this.selectedColumns.length === 0) {
      this.errorMessage = I18nService.t('APM.errorSelectAtLeastOneColumn');
      console.log('❌ [DEBUG] Aucune colonne sélectionnée');
      return;
    }
    
    if (this.columnProcessingRuleForm.valid) {
      const ruleData = this.columnProcessingRuleForm.value;
      
      console.log('🔍 [DEBUG] Règle à sauvegarder:', ruleData);
      console.log('🔍 [DEBUG] Règles existantes avant ajout:', this.columnProcessingRules.length);
      
      // Validation déjà faite plus haut
      
      // S'assurer que les colonnes sont à jour avec la méthode centralisée
      this.ensureModelColumnsLoaded();
      this.updateAllSectionsWithModelColumns();
      
      // Si on est en mode édition, mettre à jour uniquement la règle en cours d'édition
      if (this.editingColumnProcessingRule !== null && this.editingColumnProcessingRule !== -1) {
        const editingIndex = this.editingColumnProcessingRule;
        const editingRule = this.columnProcessingRules[editingIndex];
        
        if (editingRule) {
          // Pour l'édition, on ne met à jour que la première colonne sélectionnée (ou la colonne de la règle)
          const columnToUpdate = this.selectedColumns.length > 0 ? this.selectedColumns[0] : editingRule.sourceColumn;
          const normalizedColumn = this.normalizeColumnName(columnToUpdate);
          const availableColumns = [...this.availableTemplateColumns, ...this.availableColumnsForTemplate];
          
          if (availableColumns.includes(normalizedColumn) || availableColumns.includes(columnToUpdate)) {
            const finalColumn = normalizedColumn !== columnToUpdate ? normalizedColumn : columnToUpdate;
            
            const updatedRule = {
              ...ruleData,
              sourceColumn: finalColumn,
              sourceColumns: [finalColumn],
              removeAccents: ruleData.removeAccents || false
            };
            
            // Préserver l'ID et ruleOrder de la règle existante
            this.columnProcessingRules[editingIndex] = {
              ...updatedRule,
              id: editingRule.id,
              ruleOrder: editingRule.ruleOrder !== undefined ? editingRule.ruleOrder : editingIndex
            };
            
            console.log(`✅ [DEBUG] Règle mise à jour pour la colonne: ${finalColumn} (index: ${editingIndex}, id: ${editingRule.id})`);
          }
        }
      } else {
        // Créer une règle pour chaque colonne sélectionnée (mode création)
        this.selectedColumns.forEach(columnName => {
          // Vérifier que la colonne existe dans les colonnes disponibles
          const normalizedColumn = this.normalizeColumnName(columnName);
          const availableColumns = [...this.availableTemplateColumns, ...this.availableColumnsForTemplate];
          
          if (!availableColumns.includes(normalizedColumn) && !availableColumns.includes(columnName)) {
            console.warn(`Colonne "${columnName}" non disponible, ignorée`);
            return;
          }
          
          const finalColumn = normalizedColumn !== columnName ? normalizedColumn : columnName;
          
          // Créer la règle pour cette colonne
          const ruleForColumn = {
            ...ruleData,
            sourceColumn: finalColumn,
            sourceColumns: [finalColumn],
            removeAccents: ruleData.removeAccents || false
          };
          
          // Log pour vérifier que stringToRemove est bien inclus
          if (ruleForColumn.stringToRemove) {
            console.log(`🔍 [DEBUG] Règle créée avec stringToRemove: "${ruleForColumn.stringToRemove}" pour la colonne: ${finalColumn}`);
          }
          
          // Calculer le ruleOrder pour la nouvelle règle (plus grand ordre existant + 1)
          const maxOrder = this.columnProcessingRules.length > 0 
            ? Math.max(...this.columnProcessingRules.map(r => r.ruleOrder || 0)) 
            : -1;
          ruleForColumn.ruleOrder = maxOrder + 1;
          
          // Ajouter une nouvelle règle (permet plusieurs règles pour la même colonne)
          this.columnProcessingRules.push(ruleForColumn);
          console.log(`✅ [DEBUG] Nouvelle règle ajoutée pour la colonne: ${finalColumn} (ruleOrder: ${ruleForColumn.ruleOrder})`);
        });
      }
      
      console.log('✅ [DEBUG] Total des règles après modification:', this.columnProcessingRules.length);
      
      // Sauvegarder les valeurs du formulaire et l'état avant réinitialisation (pour préserver l'état)
      const savedFormValues = { ...this.columnProcessingRuleForm.value };
      const savedSelectedColumns = [...this.selectedColumns];
      const wasEditing = this.editingColumnProcessingRule !== null && this.editingColumnProcessingRule !== -1;
      const wasEditingModel = this.editingModel && this.editingModel.modelId;
      
      // Sauvegarder immédiatement dans la base de données si le modèle existe déjà
      if (wasEditingModel) {
        const columnsCount = this.selectedColumns.length; // Sauvegarder avant réinitialisation
        console.log('💾 [DEBUG] Sauvegarde immédiate des règles pour le modèle:', this.editingModel.modelId);
        
        this.autoProcessingService.saveColumnProcessingRulesBatch(this.editingModel.modelId, this.columnProcessingRules)
          .then((savedRules) => {
            console.log('✅ [DEBUG] Règles sauvegardées avec succès dans la base de données');
            
            // Vérifier que stringToRemove est bien présent dans les règles sauvegardées
            savedRules.forEach((rule, index) => {
              if (rule.stringToRemove) {
                console.log(`  ✓ Règle ${index} - stringToRemove: "${rule.stringToRemove}" pour colonne: ${rule.sourceColumn}`);
              } else {
                console.log(`  ✓ Règle ${index} - Aucun stringToRemove pour colonne: ${rule.sourceColumn}`);
              }
            });
            
            this.successMessage = I18nService.t('APM.processingRulesSavedForColumns', { count: columnsCount });
            
            // Si on était en mode édition d'un modèle existant, préserver l'état du formulaire
            if (wasEditing) {
              // Mettre à jour les règles locales avec celles sauvegardées (pour avoir les IDs)
              this.columnProcessingRules = savedRules;
              
              // Trouver l'index de la règle qui correspond aux colonnes sauvegardées
              const matchingRuleIndex = this.columnProcessingRules.findIndex(rule => 
                rule.sourceColumn === savedSelectedColumns[0] ||
                (rule.sourceColumns && rule.sourceColumns.length > 0 && 
                 rule.sourceColumns.includes(savedSelectedColumns[0]))
              );
              
              if (matchingRuleIndex !== -1) {
                // Rééditer la règle mise à jour pour préserver l'affichage
                this.editColumnProcessingRule(matchingRuleIndex);
              } else {
                // Si pas trouvé, restaurer manuellement le formulaire et la sélection
                this.selectedColumns = savedSelectedColumns;
                this.columnProcessingRuleForm.patchValue(savedFormValues);
              }
            } else {
              // Si c'était une nouvelle règle, réinitialiser
              this.editingColumnProcessingRule = null;
              this.columnProcessingRuleForm.reset();
              this.selectedColumns = [];
            }
          })
          .catch(error => {
            console.error('❌ [DEBUG] Erreur lors de la sauvegarde des règles:', error);
            this.errorMessage = I18nService.t('APM.errorSaveRulesDb');
             // Afficher quand même un message de succès local
            this.successMessage = I18nService.t('APM.processingRulesLocalOnly', { count: columnsCount });
            
            // En cas d'erreur, préserver quand même l'état si on était en mode édition
            if (wasEditing) {
              this.selectedColumns = savedSelectedColumns;
              this.columnProcessingRuleForm.patchValue(savedFormValues);
            } else {
              this.editingColumnProcessingRule = null;
              this.columnProcessingRuleForm.reset();
              this.selectedColumns = [];
            }
          });
      } else {
        // Si le modèle n'existe pas encore, sauvegarder seulement localement
        // Les règles seront sauvegardées lors de la création du modèle
        const columnsCount = this.selectedColumns.length; // Sauvegarder avant réinitialisation
        this.successMessage = I18nService.t('APM.processingRulesPrepared', { count: columnsCount });
        
        // Réinitialiser seulement si on n'est pas en mode édition
        if (!wasEditing) {
          this.editingColumnProcessingRule = null;
          this.columnProcessingRuleForm.reset();
          this.selectedColumns = []; // Réinitialiser la sélection
        }
      }
      
      console.log('🔍 [DEBUG] Règles après modification:', this.columnProcessingRules);
    }
  }

  deleteColumnProcessingRule(index: number): void {
    if (confirm(I18nService.t('APM.confirmDeleteProcessingRule'))) {
      this.columnProcessingRules.splice(index, 1);
      
      // Sauvegarder immédiatement dans la base de données si le modèle existe déjà
      if (this.editingModel && this.editingModel.modelId) {
        console.log('💾 [DEBUG] Sauvegarde immédiate après suppression de règle pour le modèle:', this.editingModel.modelId);
        
        this.autoProcessingService.saveColumnProcessingRulesBatch(this.editingModel.modelId, this.columnProcessingRules)
          .then((savedRules) => {
            console.log('✅ [DEBUG] Règles sauvegardées avec succès après suppression');
            this.successMessage = I18nService.t('APM.processingRuleDeletedAndSaved');
          })
          .catch(error => {
            console.error('❌ [DEBUG] Erreur lors de la sauvegarde après suppression:', error);
            this.errorMessage = I18nService.t('APM.errorSaveInDb');
            this.successMessage = I18nService.t('APM.ruleDeletedLocally');
          });
      } else {
        this.successMessage = I18nService.t('APM.processingRuleDeleted');
      }
    }
  }

  cancelColumnProcessingRuleEdit(): void {
    this.editingColumnProcessingRule = null;
    this.columnProcessingRuleForm.reset();
  }

  /**
   * S'assure que les colonnes du modèle sont chargées avec encodage et typage corrects
   * Méthode centralisée qui utilise la normalisation standardisée
   * Fonctionne pour TOUS les types de modèles (partner, bo, both)
   */
  private ensureModelColumnsLoaded(): void {
    const fileType = this.modelForm.get('fileType')?.value;
    const templateFile = this.modelForm.get('templateFile')?.value;
    
    console.log('🔍 Vérification du chargement des colonnes du modèle...');
    console.log('  - Type de fichier:', fileType);
    console.log('  - Fichier modèle:', templateFile);
    console.log('  - Colonnes disponibles:', this.availableColumnsForTemplate.length);
    
    // Si les colonnes ne sont pas chargées, forcer le chargement
    if (this.availableColumnsForTemplate.length === 0) {
      console.log('⚠️ Colonnes non chargées, chargement automatique...');
      
      if (fileType === 'partner') {
        if (templateFile) {
          // Charger les colonnes du fichier modèle partenaire
          this.loadColumnsForTemplateFile(templateFile);
        } else {
          // Charger les colonnes partenaires par défaut selon le pattern
          this.loadColumnsForPartnerType();
        }
      } else if (fileType === 'bo') {
        if (templateFile) {
          // Charger les colonnes du fichier modèle BO
          this.loadColumnsForTemplateFile(templateFile);
        } else {
          // Charger les colonnes BO par défaut
          this.loadColumnsForBOType();
        }
      } else if (fileType === 'both') {
        // Pour les modèles 'both', charger les colonnes des deux types
        this.loadColumnsForBothTypes();
      }
    }
    
    // Normaliser toutes les colonnes pour l'encodage et le typage
    this.availableColumnsForTemplate = this.availableColumnsForTemplate.map(col => 
      this.normalizeColumnName(col)
    );
    
    // Mettre à jour toutes les sections avec les colonnes normalisées
    this.updateAllSectionsWithModelColumns();
    
    console.log('✅ Colonnes du modèle chargées et normalisées:', this.availableColumnsForTemplate);
  }

  /**
   * Charge les colonnes pour les modèles de type 'both' (partenaire et BO)
   */
  private loadColumnsForBothTypes(): void {
    console.log('🔍 Chargement des colonnes pour modèle type "both"');
    
    // Combiner les colonnes BO et partenaires
    const boColumns = [
      'ID', 'IDTransaction', 'téléphone client', 'montant', 'Service', 'Moyen de Paiement',
      'Agence', 'Agent', 'Type agent', 'PIXI', 'Date', 'Numero Trans GU', 'GRX', 'Statut',
      'Latitude', 'Longitude', 'ID Partenaire DIST', 'Expéditeur', 'Pays provenance',
      'Bénéficiaire', 'Canal de distribution'
    ];
    
    const partnerColumns = [
      'ID Opération', 'Type Opération', 'Montant', 'Solde avant', 'Solde aprés',
      'Code proprietaire', 'Téléphone', 'Statut', 'ID Transaction', 'Num bordereau',
      'Date opération', 'Date de versement', 'Banque appro', 'Login demandeur Appro',
      'Login valideur Appro', 'Motif rejet', 'Frais connexion', 'Numero Trans GU',
      'Agent', 'Motif régularisation', 'groupe de réseau'
    ];
    
    // Combiner et dédupliquer
    this.availableColumnsForTemplate = [...new Set([...boColumns, ...partnerColumns])];
    
    console.log('✅ Colonnes combinées pour modèle "both":', this.availableColumnsForTemplate.length);
  }

  // ===== MÉTHODES POUR LES COLONNES DE COMPARAISON =====

  addComparisonColumn(): void {
    this.editingComparisonColumn = null;
    this.comparisonColumnForm.reset({
      boColumn: '',
      partnerColumn: '',
      comparisonType: 'AUTO',
      tolerance: 0.01
    });
  }

  editComparisonColumn(column: any): void {
    this.editingComparisonColumn = column;
    this.comparisonColumnForm.patchValue({
      boColumn: column.boColumn,
      partnerColumn: column.partnerColumn,
      comparisonType: column.comparisonType,
      tolerance: column.tolerance
    });
  }

  saveComparisonColumn(): void {
    if (this.comparisonColumnForm.valid) {
      const columnData = this.comparisonColumnForm.value;
      
      if (this.editingComparisonColumn) {
        // Mise à jour d'une colonne existante
        const index = this.comparisonColumns.findIndex(c => c === this.editingComparisonColumn);
        if (index !== -1) {
          this.comparisonColumns[index] = columnData;
        }
      } else {
        // Ajout d'une nouvelle colonne
        this.comparisonColumns.push(columnData);
      }
      
      this.editingComparisonColumn = null;
      this.comparisonColumnForm.reset();
      this.successMessage = I18nService.t('APM.comparisonColumnSaved');
    }
  }

  deleteComparisonColumn(column: any): void {
    if (confirm(I18nService.t('APM.confirmDeleteColumn'))) {
      const index = this.comparisonColumns.findIndex(c => c === column);
      if (index !== -1) {
        this.comparisonColumns.splice(index, 1);
        this.successMessage = I18nService.t('APM.comparisonColumnDeleted');
      }
    }
  }

  cancelComparisonColumnEdit(): void {
    this.editingComparisonColumn = null;
    this.comparisonColumnForm.reset();
  }

  moveComparisonColumnUp(index: number): void {
    if (index > 0) {
      const temp = this.comparisonColumns[index];
      this.comparisonColumns[index] = this.comparisonColumns[index - 1];
      this.comparisonColumns[index - 1] = temp;
    }
  }

  moveComparisonColumnDown(index: number): void {
    if (index < this.comparisonColumns.length - 1) {
      const temp = this.comparisonColumns[index];
      this.comparisonColumns[index] = this.comparisonColumns[index + 1];
      this.comparisonColumns[index + 1] = temp;
    }
  }

  // ===== MÉTHODES UTILITAIRES POUR LES BADGES =====

  getActionBadgeClass(action: string): string {
    switch (action) {
      case 'MARK_AS_MATCH':
        return 'badge-success';
      case 'MARK_AS_MISMATCH':
        return 'badge-danger';
      case 'MARK_AS_BO_ONLY':
        return 'badge-warning';
      default:
        return 'badge-secondary';
    }
  }

  getComparisonTypeBadgeClass(type: string): string {
    switch (type) {
      case 'NUMERIC':
        return 'badge-primary';
      case 'DATE':
        return 'badge-info';
      case 'STRING':
        return 'badge-secondary';
      case 'AUTO':
        return 'badge-success';
      default:
        return 'badge-secondary';
    }
  }

  // ===== MÉTHODES DE VALIDATION =====

  /** Vrai si le modèle en cours d'édition est tagué « banque » (clés de réconciliation optionnelles). */
  isBankModel(): boolean {
    return !!this.modelForm.get('bankModel')?.value;
  }

  isFormValid(): boolean {
    // Validation de base du formulaire (en excluant reconciliationKeys pour les partenaires)
    const fileType = this.modelForm.get('fileType')?.value;
    let basicValidation = true;
    
    if (fileType === 'partner') {
      // Pour les partenaires, vérifier manuellement tous les champs sauf reconciliationKeys
      const fieldsToCheck = ['name', 'filePattern', 'fileType', 'autoApply', 'bankModel', 'templateFile', 'logicType', 'expectedRatio', 'logicDescription', 'tolerance'];
      basicValidation = fieldsToCheck.every(field => this.modelForm.get(field)?.valid);
    } else {
      // Pour les BO, utiliser la validation normale
      basicValidation = this.modelForm.valid;
    }
    
    // Validation des clés de réconciliation
    const hasPartnerKeys = this.selectedPartnerKeys.length > 0;
    const hasBOModels = this.selectedBOModels.length > 0;
    
    // Pour les fichiers de type 'bo', pas besoin de clés de réconciliation
    if (fileType === 'bo') {
      return basicValidation;
    }

    // Modèle tagué « banque » : clés partenaire / BO optionnelles
    if (this.isBankModel()) {
      return basicValidation;
    }
    
    // Pour les fichiers partenaires, nécessite modèles BO ET (clés partenaire OU clés conditionnelles)
    const hasConditionalKeys = this.isPartnerConditionalKeysConfigValid();
    const hasBoConditionalKeys = this.isBoConditionalKeysConfigValid();
    const hasBoKeySelection = this.selectedBOKeys.length > 0 || hasBoConditionalKeys;
    const reconciliationKeysValid = hasBOModels && (hasPartnerKeys || hasConditionalKeys) && hasBoKeySelection;
    
    // Vérifier si le groupe reconciliationKeys est valide en ignorant boKeys pour les partenaires
    const reconciliationKeysGroup = this.modelForm.get('reconciliationKeys');
    let reconciliationKeysGroupValid = true;
    
    if (reconciliationKeysGroup) {
      if (fileType === 'partner') {
        // Pour les partenaires, ignorer boKeys et vérifier seulement partnerKeys et boModels
        reconciliationKeysGroupValid = 
          reconciliationKeysGroup.get('partnerKeys')?.valid && 
          reconciliationKeysGroup.get('boModels')?.valid;
        
        // Forcer la validation du groupe reconciliationKeys pour les partenaires
        if (reconciliationKeysGroupValid && !reconciliationKeysGroup.valid) {
          // Marquer le groupe comme valide en supprimant les erreurs
          reconciliationKeysGroup.setErrors(null);
          // Forcer la mise à jour de l'état
          reconciliationKeysGroup.updateValueAndValidity({ onlySelf: false, emitEvent: false });
        }
      } else {
        // Pour les BO, vérifier tous les champs
        reconciliationKeysGroupValid = reconciliationKeysGroup.valid;
      }
    }
    
    // Pour les partenaires, ignorer complètement la validation du groupe reconciliationKeys
    const finalValidation = fileType === 'partner' ? 
      (basicValidation && reconciliationKeysValid) : 
      (basicValidation && reconciliationKeysValid && reconciliationKeysGroupValid);
    
    // Logs détaillés seulement si la validation échoue
    if (!finalValidation) {
      console.log('🔍 Validation partenaire échouée:', {
        basicValidation,
        hasPartnerKeys,
        hasBOModels,
        fileType,
        reconciliationKeysValid,
        selectedPartnerKeys: this.selectedPartnerKeys,
        selectedBOModels: this.selectedBOModels,
        finalValidation
      });
      
      // Logs détaillés pour identifier le problème
      if (!basicValidation) {
        console.log('❌ Problème: Formulaire de base invalide');
        console.log('  - Nom valide:', this.modelForm.get('name')?.valid);
        console.log('  - Pattern valide:', this.modelForm.get('filePattern')?.valid);
        console.log('  - Type valide:', this.modelForm.get('fileType')?.valid);
        console.log('  - Template valide:', this.modelForm.get('templateFile')?.valid);
        console.log('  - Nom valeur:', this.modelForm.get('name')?.value);
        console.log('  - Pattern valeur:', this.modelForm.get('filePattern')?.value);
        console.log('  - Type valeur:', this.modelForm.get('fileType')?.value);
        console.log('  - Template valeur:', this.modelForm.get('templateFile')?.value);
        
        // Vérifier les erreurs de validation
        console.log('  - Erreurs du formulaire:', this.modelForm.errors);
        console.log('  - Erreurs du nom:', this.modelForm.get('name')?.errors);
        console.log('  - Erreurs du pattern:', this.modelForm.get('filePattern')?.errors);
        console.log('  - Erreurs du type:', this.modelForm.get('fileType')?.errors);
        console.log('  - Erreurs du template:', this.modelForm.get('templateFile')?.errors);
        
        // Vérifier tous les champs du formulaire
        console.log('  - Tous les champs du formulaire:');
        Object.keys(this.modelForm.controls).forEach(key => {
          const control = this.modelForm.get(key);
          console.log(`    - ${key}: valid=${control?.valid}, errors=`, control?.errors);
        });
        
        // Vérifier l'état du formulaire
        console.log('  - État du formulaire:', {
          valid: this.modelForm.valid,
          invalid: this.modelForm.invalid,
          pristine: this.modelForm.pristine,
          dirty: this.modelForm.dirty,
          touched: this.modelForm.touched,
          untouched: this.modelForm.untouched
        });
        
        // Vérifier les groupes imbriqués
        console.log('  - ReconciliationKeys valide:', this.modelForm.get('reconciliationKeys')?.valid);
        console.log('  - ReconciliationKeys erreurs:', this.modelForm.get('reconciliationKeys')?.errors);
        console.log('  - PartnerKeys valide:', this.modelForm.get('reconciliationKeys.partnerKeys')?.valid);
        console.log('  - BOKeys valide:', this.modelForm.get('reconciliationKeys.boKeys')?.valid);
        console.log('  - BOModels valide:', this.modelForm.get('reconciliationKeys.boModels')?.valid);
        console.log('  - BOModelKeys valide:', this.modelForm.get('reconciliationKeys.boModelKeys')?.valid);
        console.log('  - BOTreatments valide:', this.modelForm.get('reconciliationKeys.boTreatments')?.valid);
        
        // Logs pour la nouvelle validation
        const reconciliationKeysGroup = this.modelForm.get('reconciliationKeys');
        if (reconciliationKeysGroup) {
          console.log('  - Validation personnalisée ReconciliationKeys:', {
            fileType: fileType,
            partnerKeysValid: reconciliationKeysGroup.get('partnerKeys')?.valid,
            boModelsValid: reconciliationKeysGroup.get('boModels')?.valid,
            boKeysValid: reconciliationKeysGroup.get('boKeys')?.valid,
            groupValid: reconciliationKeysGroup.valid
          });
        }
        
        // Log de la validation finale
        console.log('  - Validation finale détaillée:', {
          basicValidation,
          hasPartnerKeys,
          hasBOModels,
          reconciliationKeysValid,
          reconciliationKeysGroupValid,
          finalValidation
        });
      }
      
      if (!hasPartnerKeys) {
        console.log('❌ Problème: Aucune clé partenaire sélectionnée');
      }
      
      if (!hasBOModels) {
        console.log('❌ Problème: Aucun modèle BO sélectionné');
      }
    } else {
      // Succès : rien à logger (évite la spamming console à chaque cycle de détection)
    }
    
    return finalValidation;
  }

  // ===== MÉTHODES DE RÉINITIALISATION =====

  resetForm(): void {
    this.modelForm.reset({
      name: '',
      filePattern: '',
      fileType: 'partner',
      autoApply: true,
      templateFile: '',
      logicType: 'STANDARD',
      expectedRatio: '1:1',
      logicDescription: '',
      tolerance: 0.0
    });
    
    // Réinitialiser les sections
    this.showReconciliationLogicSection = false;
    this.showCorrespondenceRulesSection = false;
    this.showComparisonColumnsSection = false;
    this.showColumnProcessingSection = false;
    this.showRowFiltersSection = false;
    this.showFormatActionsSection = false;
    this.showValueMappingsSection = false;
    this.showColumnRenameSection = false;
    
    // Réinitialiser les données
    this.correspondenceRules = [];
    this.comparisonColumns = [];
    this.columnProcessingRules = [];
    this.resetPreProcessingConfig();
    this.selectedPartnerKeys = [];
    this.selectedBOModels = [];
    this.selectedBOKeys = [];
    this.boModelKeySelection = {};
    this.boModelFileColumns = {};
    this.templateFileColumns = [];
    this.resetPartnerConditionalKeysConfig();
    this.resetBoConditionalKeysConfig();
    this.availableBOColumns = [];
    this.selectedColumns = []; // Réinitialiser la sélection multiple
    
    // Réinitialiser les formulaires
    this.correspondenceRuleForm.reset();
    this.comparisonColumnForm.reset();
    this.columnProcessingRuleForm.reset();
    
    // Réinitialiser les états d'édition
    this.editingCorrespondenceRule = null;
    this.editingComparisonColumn = null;
    this.editingColumnProcessingRule = null;
    
    this.editingModel = null;
    this.isDuplicatingModel = false;
    this.showCreateForm = true;
    this.errorMessage = '';
    this.successMessage = '';
  }

  // ===== MÉTHODES POUR LA SÉLECTION MULTIPLE DE COLONNES =====

  toggleColumnSelection(columnName: string, isChecked: boolean): void {
    if (isChecked) {
      if (!this.selectedColumns.includes(columnName)) {
        this.selectedColumns.push(columnName);
      }
    } else {
      this.selectedColumns = this.selectedColumns.filter(col => col !== columnName);
    }
  }

  isColumnSelected(columnName: string): boolean {
    return this.selectedColumns.includes(columnName);
  }

  getSelectedColumnsCount(): number {
    return this.selectedColumns.length;
  }

  selectAllColumns(): void {
    this.selectedColumns = [...this.availableTemplateColumns];
  }

  deselectAllColumns(): void {
    this.selectedColumns = [];
  }

  // ===== MÉTHODES POUR LE REGROUPEMENT DES MODÈLES =====

  /**
   * Détermine la catégorie d'un modèle basée sur son nom
   * RÈGLE SPÉCIALE: Tous les modèles commençant par "PM" sont des partenaires paiement
   */
  getModelCategory(model: AutoProcessingModel): string {
    const modelName = model.name.toLowerCase();
    const modelPattern = (model.filePattern || '').toLowerCase();
    const patternKey = `${modelName} ${modelPattern}`;

    // RÈGLE SPÉCIALE: Tous les modèles commençant par "PM" sont des partenaires paiement
    // - "PMWAVECI" 
    // - "Modèle basé sur PMWAVECI.xls"
    // - "PMOMCI", "PMMTNCM", etc.
    if (modelName.startsWith('pm') || 
        modelName.includes('pmwaveci') || 
        modelName.includes('pmom') ||
        modelName.includes('pmmoovbf') ||
        modelName.includes('pmmtncm') ||
        /pm[a-z0-9]{4,}/.test(modelName)) {
      return CATEGORY_PAIEMENT;
    }
    
    // Patterns pour Partenaire CASHIN
    const cashinPatterns = [
      'ciom', 'cashin', 'cash', 'ci_', '_ci', 'ciomcm', 'ciomml', 'ciomgn', 
      'ciomci', 'ciomsn', 'ciomkn', 'ciombj', 'ciomgb'
    ];
    
    // Patterns pour Partenaire PAIEMENT
    const paiementPatterns = [
      'pmom', 'paiement', 'payment', 'pm_', '_pm', 'pmomcm', 'pmomml', 'pmomgn',
      'pmomci', 'pmomsn', 'pmomkn', 'pmombj', 'pmomgb'
    ];
    
    // Vérifier les patterns CASHIN
    for (const pattern of cashinPatterns) {
      if (patternKey.includes(pattern)) {
        return CATEGORY_CASHIN;
      }
    }
    
    // Vérifier les patterns PAIEMENT
    for (const pattern of paiementPatterns) {
      if (patternKey.includes(pattern)) {
        return CATEGORY_PAIEMENT;
      }
    }
    
    // Vérifier les patterns génériques CI et PM
    if (modelName.includes('ci') && !modelName.includes('city') && !modelName.includes('circle')) {
      return CATEGORY_CASHIN;
    }
    
    if (modelName.includes('pm') && !modelName.includes('pump') && !modelName.includes('prime')) {
      return CATEGORY_PAIEMENT;
    }
    
    // Par défaut, c'est un modèle Back Office
    return CATEGORY_BACK_OFFICE;
  }

  /**
   * Regroupe les modèles par catégorie
   */
  getModelsByCategory(): { [category: string]: AutoProcessingModel[] } {
    const groupedModels: { [category: string]: AutoProcessingModel[] } = {
      [CATEGORY_CASHIN]: [],
      [CATEGORY_PAIEMENT]: [],
      [CATEGORY_BACK_OFFICE]: []
    };

    this.models.forEach(model => {
      const category = this.getModelCategory(model);
      groupedModels[category].push(model);
    });

    return groupedModels;
  }

  /**
   * Obtient les catégories qui ont des modèles
   */
  getActiveCategories(): string[] {
    const groupedModels = this.getModelsByCategory();
    return Object.keys(groupedModels).filter(category => groupedModels[category].length > 0);
  }

  /**
   * Obtient le nombre de modèles par catégorie
   */
  getCategoryCount(category: string): number {
    const groupedModels = this.getModelsByCategory();
    return groupedModels[category]?.length || 0;
  }

  /**
   * Obtient la clé i18n du libellé de la catégorie (l'identifiant reste
   * utilisé pour le regroupement et les classes CSS).
   */
  getCategoryLabelKey(category: string): string {
    return CATEGORY_LABEL_KEYS[category] || category;
  }

  /**
   * Obtient la clé i18n de la description de la catégorie
   */
  getCategoryDescriptionKey(category: string): string {
    return CATEGORY_DESCRIPTION_KEYS[category] || '';
  }

  /**
   * Obtient l'icône de la catégorie
   */
  getCategoryIcon(category: string): string {
    switch (category) {
      case CATEGORY_CASHIN:
        return 'fas fa-money-bill-wave';
      case CATEGORY_PAIEMENT:
        return 'fas fa-credit-card';
      case CATEGORY_BACK_OFFICE:
        return 'fas fa-folder';
      default:
        return 'fas fa-cog';
    }
  }

  // ===== PRÉ-TRAITEMENT (filtres lignes + formatage /traitement) =====

  toggleRowFiltersSection(): void {
    this.showRowFiltersSection = !this.showRowFiltersSection;
  }

  toggleFormatActionsSection(): void {
    this.showFormatActionsSection = !this.showFormatActionsSection;
    if (this.showFormatActionsSection && !this.modelFormatActions.length) {
      this.initDefaultFormatActions();
    }
  }

  toggleValueMappingsSection(): void {
    this.showValueMappingsSection = !this.showValueMappingsSection;
  }

  toggleColumnConcatSection(): void {
    this.showColumnConcatSection = !this.showColumnConcatSection;
  }

  toggleColumnMathSection(): void {
    this.showColumnMathSection = !this.showColumnMathSection;
  }

  toggleColumnRenameSection(): void {
    this.showColumnRenameSection = !this.showColumnRenameSection;
  }

  toggleEnvColumnSection(): void {
    this.showEnvColumnSection = !this.showEnvColumnSection;
  }

  private buildModelEnvColumnConfig(): ModelEnvColumnConfig | undefined {
    if (!this.modelEnvColumnEnabled || !this.modelEnvColumnValue) {
      return undefined;
    }
    return {
      enabled: true,
      value: this.modelEnvColumnValue
    };
  }

  addModelColumnRenameRule(): void {
    const columns = this.getPreProcessingColumns();
    this.modelColumnRenameRules.push({
      id: `rename-${this.nextModelColumnRenameId++}`,
      sourceColumn: columns[0] || '',
      targetColumn: '',
      enabled: true
    });
  }

  removeModelColumnRenameRule(index: number): void {
    this.modelColumnRenameRules.splice(index, 1);
  }

  addModelColumnConcatRule(): void {
    this.modelColumnConcatRules.push({
      id: `concat-${this.nextModelConcatRuleId++}`,
      sourceColumns: [],
      targetColumn: '',
      separator: '',
      enabled: true
    });
  }

  removeModelColumnConcatRule(index: number): void {
    this.modelColumnConcatRules.splice(index, 1);
  }

  addModelColumnMathRule(): void {
    const columns = this.getPreProcessingColumns();
    this.modelColumnMathRules.push({
      id: `math-${this.nextModelMathRuleId++}`,
      sourceColumnA: columns[0] || '',
      sourceColumnB: columns[1] || columns[0] || '',
      targetColumn: '',
      operation: 'add',
      enabled: true
    });
  }

  removeModelColumnMathRule(index: number): void {
    this.modelColumnMathRules.splice(index, 1);
  }

  getPreProcessingSectionOrderIndex(sectionId: ModelPreProcessingSectionId): number {
    return this.preProcessingSectionOrder.indexOf(sectionId);
  }

  onPreProcessingSectionDrop(event: CdkDragDrop<ModelPreProcessingSectionId[]>): void {
    if (event.previousIndex === event.currentIndex) {
      return;
    }
    moveItemInArray(this.preProcessingSectionOrder, event.previousIndex, event.currentIndex);
  }

  movePreProcessingSectionUp(index: number): void {
    if (index <= 0) {
      return;
    }
    moveItemInArray(this.preProcessingSectionOrder, index, index - 1);
  }

  movePreProcessingSectionDown(index: number): void {
    if (index >= this.preProcessingSectionOrder.length - 1) {
      return;
    }
    moveItemInArray(this.preProcessingSectionOrder, index, index + 1);
  }

  isConcatSourceColumnSelected(rule: ModelColumnConcatRule, column: string): boolean {
    return (rule.sourceColumns || []).includes(column);
  }

  toggleConcatSourceColumn(rule: ModelColumnConcatRule, column: string, checked: boolean): void {
    if (!rule.sourceColumns) {
      rule.sourceColumns = [];
    }

    if (checked) {
      if (!rule.sourceColumns.includes(column)) {
        rule.sourceColumns.push(column);
      }
    } else {
      rule.sourceColumns = rule.sourceColumns.filter(col => col !== column);
    }
  }

  moveConcatSourceColumnUp(rule: ModelColumnConcatRule, index: number): void {
    if (index <= 0 || index >= rule.sourceColumns.length) {
      return;
    }

    const columns = [...rule.sourceColumns];
    [columns[index - 1], columns[index]] = [columns[index], columns[index - 1]];
    rule.sourceColumns = columns;
  }

  moveConcatSourceColumnDown(rule: ModelColumnConcatRule, index: number): void {
    if (index < 0 || index >= rule.sourceColumns.length - 1) {
      return;
    }

    const columns = [...rule.sourceColumns];
    [columns[index + 1], columns[index]] = [columns[index], columns[index + 1]];
    rule.sourceColumns = columns;
  }

  addModelValueMapping(): void {
    const columns = this.getPreProcessingColumns();
    this.modelValueMappings.push({
      id: `mapping-${this.nextModelValueMappingId++}`,
      column: columns[0] || '',
      fromValue: '',
      conditionColumn: '',
      conditionValue: '',
      toValue: '',
      enabled: true
    });
  }

  removeModelValueMapping(index: number): void {
    this.modelValueMappings.splice(index, 1);
  }

  getPreProcessingColumns(): string[] {
    // OPTIMISATION: le tableau est réassigné (jamais muté en place) à chaque changement,
    // une comparaison de références suffit donc pour servir un résultat en cache.
    const template = this.availableTemplateColumns;
    const forTemplate = this.availableColumnsForTemplate;
    const available = this.availableColumns;
    const cache = this.preProcessingColumnsCache;
    if (cache && cache.templateRef === template && cache.forTemplateRef === forTemplate && cache.availableRef === available) {
      return cache.columns;
    }
    const columns = [
      ...template,
      ...forTemplate,
      ...available
    ];
    const result = [...new Set(columns.filter(column => !!column))];
    this.preProcessingColumnsCache = {
      templateRef: template,
      forTemplateRef: forTemplate,
      availableRef: available,
      columns: result
    };
    return result;
  }

  addModelRowFilter(): void {
    const columns = this.getPreProcessingColumns();
    this.modelRowFilters.push({
      id: `filter-${this.nextModelFilterId++}`,
      column: columns[0] || '',
      selectedValues: [],
      enabled: true
    });
  }

  removeModelRowFilter(index: number): void {
    this.modelRowFilters.splice(index, 1);
  }

  parseFilterValuesInput(input: string): string[] {
    if (!input?.trim()) {
      return [];
    }

    return input
      .split(/[\n,;]+/)
      .map(value => value.trim())
      .filter(value => value.length > 0);
  }

  getFilterValuesInput(filter: ModelRowFilter): string {
    return (filter.selectedValues || []).join(', ');
  }

  updateFilterValuesInput(filter: ModelRowFilter, input: string): void {
    filter.selectedValues = this.parseFilterValuesInput(input);
  }

  toggleFormatActionColumn(action: ModelFormatAction, column: string, checked: boolean): void {
    if (!action.columns) {
      action.columns = [];
    }

    if (checked) {
      if (!action.columns.includes(column)) {
        action.columns.push(column);
      }
      this.ensureFormatColumnSettings(action, column);
    } else {
      action.columns = action.columns.filter(col => col !== column);
      this.removeFormatColumnSettings(action, column);
    }
  }

  actionNeedsPerColumnSettings(type: ModelFormatActionType): boolean {
    return type !== 'removeNumbers' && type !== 'removeZeroDecimals';
  }

  private normalizeLeadingZeroMode(mode?: string | null): 'none' | 'keep' | 'strip' {
    return mode === 'keep' || mode === 'strip' ? mode : 'none';
  }

  getFormatColumnSettings(action: ModelFormatAction, column: string): ModelFormatColumnSettings {
    if (!action.columnSettings) {
      action.columnSettings = {};
    }
    if (!action.columnSettings[column]) {
      action.columnSettings[column] = this.createColumnSettingsFromAction(action);
    }
    const settings = action.columnSettings[column];
    if (action.type === 'removeCharacters') {
      settings.leadingZeroMode = this.normalizeLeadingZeroMode(
        settings.leadingZeroMode ?? action.leadingZeroMode
      );
    }
    return settings;
  }

  applyDefaultSettingsToAllFormatColumns(action: ModelFormatAction): void {
    if (!action.columns?.length) {
      return;
    }
    const defaults = this.createColumnSettingsFromAction(action);
    if (!action.columnSettings) {
      action.columnSettings = {};
    }
    for (const column of action.columns) {
      action.columnSettings[column] = { ...defaults };
    }
  }

  private ensureFormatColumnSettings(action: ModelFormatAction, column: string): void {
    this.getFormatColumnSettings(action, column);
  }

  private removeFormatColumnSettings(action: ModelFormatAction, column: string): void {
    if (!action.columnSettings) {
      return;
    }
    delete action.columnSettings[column];
    if (!Object.keys(action.columnSettings).length) {
      delete action.columnSettings;
    }
  }

  private createColumnSettingsFromAction(action: ModelFormatAction): ModelFormatColumnSettings {
    return {
      specialStringToRemove: action.specialStringToRemove ?? '',
      specialStringRemovalMode: action.specialStringRemovalMode ?? 'all',
      removeCharMode: action.removeCharMode ?? 'remove',
      removeCharPosition: action.removeCharPosition ?? 'start',
      removeCharCount: action.removeCharCount ?? 1,
      removeCharSpecificPosition: action.removeCharSpecificPosition ?? 1,
      leadingZeroMode: this.normalizeLeadingZeroMode(action.leadingZeroMode),
      removeSpacesType: action.removeSpacesType ?? 'all',
      keepLastDigitsCount: action.keepLastDigitsCount ?? 3,
      indicatifType: action.indicatifType ?? 'international',
      customIndicatif: action.customIndicatif ?? '+33',
      decimalSeparator: action.decimalSeparator ?? ',',
      keepTrailingZeros: action.keepTrailingZeros ?? false,
      applyConditionEnabled: action.applyConditionEnabled ?? false,
      conditionColumn: action.conditionColumn ?? '',
      conditionValue: action.conditionValue ?? ''
    };
  }

  private migrateFormatActionColumnSettings(action: ModelFormatAction): void {
    if (!action.columns?.length) {
      return;
    }
    if (action.columnSettings && Object.keys(action.columnSettings).length > 0) {
      for (const column of action.columns) {
        this.ensureFormatColumnSettings(action, column);
      }
      return;
    }
    action.columnSettings = {};
    const defaults = this.createColumnSettingsFromAction(action);
    for (const column of action.columns) {
      action.columnSettings[column] = { ...defaults };
    }
  }

  isFormatActionColumnSelected(action: ModelFormatAction, column: string): boolean {
    return (action.columns || []).includes(column);
  }

  selectAllFormatActionColumns(action: ModelFormatAction): void {
    action.columns = [...this.getPreProcessingColumns()];
    for (const column of action.columns) {
      this.ensureFormatColumnSettings(action, column);
    }
  }

  deselectAllFormatActionColumns(action: ModelFormatAction): void {
    action.columns = [];
    delete action.columnSettings;
  }

  areAllFormatActionColumnsSelected(action: ModelFormatAction): boolean {
    const available = this.getPreProcessingColumns();
    return available.length > 0 && available.every(col => (action.columns || []).includes(col));
  }

  getFormatActionByType(type: ModelFormatActionType): ModelFormatAction {
    let action = this.modelFormatActions.find(item => item.type === type);
    if (!action) {
      action = this.createDefaultFormatAction(type);
      this.modelFormatActions.push(action);
      this.syncFormatActionOrders();
    }
    return action;
  }

  getFormatActionLabelKey(type: ModelFormatActionType): string {
    return this.formatActionTypes.find(item => item.type === type)?.labelKey || '';
  }

  /** Suffixe « (#n) » affiché quand plusieurs actions du même type coexistent. */
  getFormatActionInstanceSuffix(action: ModelFormatAction, index: number): string {
    const instanceNumber = this.modelFormatActions
      .slice(0, index + 1)
      .filter(item => item.type === action.type).length;
    const totalSameType = this.modelFormatActions.filter(item => item.type === action.type).length;
    return totalSameType > 1 ? ` (#${instanceNumber})` : '';
  }

  addFormatAction(type: ModelFormatActionType = this.newFormatActionType): void {
    this.modelFormatActions.push(this.createDefaultFormatAction(type));
    this.syncFormatActionOrders();
    this.newFormatActionType = type;
    this.cdr.markForCheck();
  }

  duplicateFormatAction(index: number): void {
    const source = this.modelFormatActions[index];
    if (!source) {
      return;
    }
    const clone: ModelFormatAction = {
      ...this.createDefaultFormatAction(source.type),
      ...source,
      id: this.createFormatActionId(),
      enabled: source.enabled,
      columns: [...(source.columns || [])],
      columnSettings: source.columnSettings
        ? Object.fromEntries(
          Object.entries(source.columnSettings).map(([column, settings]) => [column, { ...settings }])
        )
        : undefined
    };
    this.modelFormatActions.splice(index + 1, 0, clone);
    this.syncFormatActionOrders();
    this.cdr.markForCheck();
  }

  removeFormatAction(index: number): void {
    if (index < 0 || index >= this.modelFormatActions.length) {
      return;
    }
    this.modelFormatActions.splice(index, 1);
    this.syncFormatActionOrders();
    this.cdr.markForCheck();
  }

  onFormatActionDrop(event: CdkDragDrop<ModelFormatAction[]>): void {
    if (event.previousIndex === event.currentIndex) {
      return;
    }
    moveItemInArray(this.modelFormatActions, event.previousIndex, event.currentIndex);
    this.syncFormatActionOrders();
  }

  moveFormatActionUp(index: number): void {
    if (index <= 0) {
      return;
    }
    moveItemInArray(this.modelFormatActions, index, index - 1);
    this.syncFormatActionOrders();
  }

  moveFormatActionDown(index: number): void {
    if (index >= this.modelFormatActions.length - 1) {
      return;
    }
    moveItemInArray(this.modelFormatActions, index, index + 1);
    this.syncFormatActionOrders();
  }

  private syncFormatActionOrders(): void {
    this.modelFormatActions.forEach((action, index) => {
      action.order = index + 1;
    });
  }

  private createFormatActionId(): string {
    return `format-${this.nextModelFormatActionId++}`;
  }

  private ensureFormatActionIds(): void {
    for (const action of this.modelFormatActions) {
      if (!action.id) {
        action.id = this.createFormatActionId();
      } else if (action.id.startsWith('format-')) {
        const numericPart = Number.parseInt(action.id.replace('format-', ''), 10);
        if (Number.isFinite(numericPart) && numericPart >= this.nextModelFormatActionId) {
          this.nextModelFormatActionId = numericPart + 1;
        }
      }
    }
  }

  private initDefaultFormatActions(): void {
    this.modelFormatActions = this.formatActionTypes.map(item =>
      this.createDefaultFormatAction(item.type)
    );
    this.syncFormatActionOrders();
  }

  private createDefaultFormatAction(type: ModelFormatActionType): ModelFormatAction {
    return {
      id: this.createFormatActionId(),
      type,
      enabled: false,
      columns: [],
      specialStringToRemove: '',
      specialStringRemovalMode: 'all',
      removeCharMode: 'remove',
      removeCharPosition: 'start',
      removeCharCount: 1,
      removeCharSpecificPosition: 1,
      leadingZeroMode: 'none',
      removeSpacesType: 'all',
      keepLastDigitsCount: 3,
      indicatifType: 'international',
      customIndicatif: '+33',
      decimalSeparator: ',',
      keepTrailingZeros: false,
      applyConditionEnabled: false,
      conditionColumn: '',
      conditionValue: ''
    };
  }

  buildPreProcessingConfig(): ModelPreProcessingConfig {
    const rowFilters = this.modelRowFilters
      .filter(filter => filter.column && filter.selectedValues?.length)
      .map(filter => ({
        id: filter.id,
        column: filter.column,
        selectedValues: [...filter.selectedValues],
        enabled: filter.enabled !== false
      }));

    this.ensureFormatActionIds();
    const formatActions = this.modelFormatActions.map((action, index) => {
      this.migrateFormatActionColumnSettings(action);
      return {
        ...action,
        id: action.id || this.createFormatActionId(),
        order: index + 1,
        columns: [...(action.columns || [])],
        columnSettings: action.columnSettings
          ? Object.fromEntries(
            Object.entries(action.columnSettings).map(([column, settings]) => [column, { ...settings }])
          )
          : undefined
      };
    });

    const valueMappings = this.modelValueMappings
      .filter(mapping => mapping.column && mapping.fromValue?.trim())
      .map(mapping => {
        const conditionColumn = mapping.conditionColumn?.trim() || '';
        const conditionValue = mapping.conditionValue?.trim() || '';
        const entry: ModelColumnValueMapping = {
          id: mapping.id,
          column: mapping.column,
          fromValue: mapping.fromValue.trim(),
          toValue: mapping.toValue ?? '',
          enabled: mapping.enabled !== false
        };
        if (conditionColumn && conditionValue) {
          entry.conditionColumn = conditionColumn;
          entry.conditionValue = conditionValue;
        }
        return entry;
      });

    const columnConcatRules = this.modelColumnConcatRules
      .filter(rule => rule.targetColumn?.trim() && rule.sourceColumns?.length >= 2)
      .map(rule => ({
        id: rule.id,
        sourceColumns: [...rule.sourceColumns],
        targetColumn: rule.targetColumn.trim(),
        separator: rule.separator ?? '',
        enabled: rule.enabled !== false
      }));

    const columnMathRules = this.modelColumnMathRules
      .filter(rule =>
        rule.targetColumn?.trim()
        && rule.sourceColumnA
        && rule.sourceColumnB
        && rule.sourceColumnA !== rule.sourceColumnB
      )
      .map(rule => ({
        id: rule.id,
        sourceColumnA: rule.sourceColumnA,
        sourceColumnB: rule.sourceColumnB,
        targetColumn: rule.targetColumn.trim(),
        operation: rule.operation,
        enabled: rule.enabled !== false
      }));

    const columnRenameRules = this.modelColumnRenameRules
      .filter(rule => rule.sourceColumn && rule.targetColumn?.trim() && rule.sourceColumn !== rule.targetColumn.trim())
      .map(rule => ({
        id: rule.id,
        sourceColumn: rule.sourceColumn,
        targetColumn: rule.targetColumn.trim(),
        enabled: rule.enabled !== false
      }));

    const envColumn = this.buildModelEnvColumnConfig();
    const exportColumnFilter = this.buildModelExportColumnFilterConfig();

    if (!rowFilters.length && !formatActions.length && !columnConcatRules.length && !columnMathRules.length && !valueMappings.length && !columnRenameRules.length && !envColumn && !exportColumnFilter) {
      return {
        rowFilters: [],
        formatActions: [],
        columnConcatRules: [],
        columnMathRules: [],
        valueMappings: [],
        columnRenameRules: [],
        sectionOrder: [...this.preProcessingSectionOrder]
      };
    }

    return {
      rowFilters,
      formatActions,
      columnConcatRules,
      columnMathRules,
      valueMappings,
      columnRenameRules,
      ...(envColumn ? { envColumn } : {}),
      ...(exportColumnFilter ? { exportColumnFilter } : {}),
      sectionOrder: [...this.preProcessingSectionOrder]
    };
  }

  private buildModelExportColumnFilterConfig(): ModelExportColumnFilterConfig | undefined {
    if (!this.modelExportColumnFilterEnabled) {
      return undefined;
    }
    const keptColumns = this.modelPreProcessingService.getKeptExportColumns(
      this.modelExportColumns,
      this.modelExportColumnKeepMap
    );
    return {
      enabled: true,
      keptColumns
    };
  }

  onModelExportColumnFilterToggle(enabled: boolean): void {
    this.modelExportColumnFilterEnabled = enabled;
    if (enabled) {
      this.refreshModelExportColumnCatalog();
    }
    this.cdr.detectChanges();
  }

  refreshModelExportColumnCatalog(): void {
    const draft = this.buildDraftModelForExportCatalog();
    if (!draft) {
      this.modelExportColumns = [];
      this.modelExportColumnKeepMap = {};
      return;
    }

    const previous = { ...this.modelExportColumnKeepMap };
    this.modelExportColumns = this.modelPreProcessingService.buildAssistedExportColumnCatalog(
      draft,
      this.columnProcessingRules,
      this.availableTemplateColumns
    );
    const next: Record<string, boolean> = {};
    for (const col of this.modelExportColumns) {
      next[col] = previous[col] !== false;
    }
    this.modelExportColumnKeepMap = next;
    this.cdr.detectChanges();
  }

  private buildDraftModelForExportCatalog(): AutoProcessingModel | null {
    const name = (this.modelForm.get('name')?.value || this.editingModel?.name || '').trim();
    const filePattern = (this.modelForm.get('filePattern')?.value || this.editingModel?.filePattern || '').trim();
    if (!name && !filePattern) {
      return null;
    }
    return {
      name: name || 'modèle',
      filePattern: filePattern || '*',
      fileType: this.modelForm.get('fileType')?.value || this.editingModel?.fileType || 'bo',
      autoApply: true,
      templateFile: this.modelForm.get('templateFile')?.value || this.editingModel?.templateFile || '',
      preProcessingConfig: this.buildPreProcessingConfig()
    };
  }

  getModelExportColumnsKeptCount(): number {
    return this.modelPreProcessingService.getKeptExportColumns(
      this.modelExportColumns,
      this.modelExportColumnKeepMap
    ).length;
  }

  isModelExportColumnKept(column: string): boolean {
    return this.modelExportColumnKeepMap[column] !== false;
  }

  toggleModelExportColumnKeep(column: string, keep: boolean): void {
    this.modelExportColumnKeepMap[column] = keep;
    this.cdr.detectChanges();
  }

  setAllModelExportColumnsKept(keep: boolean): void {
    for (const col of this.modelExportColumns) {
      this.modelExportColumnKeepMap[col] = keep;
    }
    this.cdr.detectChanges();
  }

  resetModelExportColumnKeepDefaults(): void {
    for (const col of this.modelExportColumns) {
      this.modelExportColumnKeepMap[col] = true;
    }
    this.cdr.detectChanges();
  }

  loadPreProcessingConfig(config?: ModelPreProcessingConfig | null): void {
    this.modelRowFilters = [];
    this.modelFormatActions = [];
    this.modelColumnConcatRules = [];
    this.modelColumnMathRules = [];
    this.modelValueMappings = [];
    this.modelColumnRenameRules = [];
    this.modelEnvColumnEnabled = false;
    this.modelEnvColumnValue = '';
    this.modelExportColumnFilterEnabled = false;
    this.modelExportColumns = [];
    this.modelExportColumnKeepMap = {};
    this.preProcessingSectionOrder = [...DEFAULT_PRE_PROCESSING_SECTION_ORDER];
    this.nextModelFilterId = 1;
    this.nextModelConcatRuleId = 1;
    this.nextModelMathRuleId = 1;
    this.nextModelValueMappingId = 1;
    this.nextModelColumnRenameId = 1;
    this.nextModelFormatActionId = 1;

    if (!config) {
      return;
    }

    this.modelRowFilters = (config.rowFilters || []).map(filter => ({
      id: filter.id || `filter-${this.nextModelFilterId++}`,
      column: filter.column || '',
      selectedValues: [...(filter.selectedValues || [])],
      enabled: filter.enabled !== false
    }));

    this.modelFormatActions = (config.formatActions || [])
      .map(action => {
        const defaults = this.createDefaultFormatAction(action.type);
        return {
          ...defaults,
          ...action,
          id: action.id || defaults.id,
          columns: [...(action.columns || [])],
          columnSettings: action.columnSettings
            ? Object.fromEntries(
              Object.entries(action.columnSettings).map(([column, settings]) => [column, { ...settings }])
            )
            : undefined
        };
      })
      .sort((a, b) => (a.order ?? Number.MAX_SAFE_INTEGER) - (b.order ?? Number.MAX_SAFE_INTEGER));
    this.modelFormatActions.forEach(action => this.migrateFormatActionColumnSettings(action));
    this.ensureFormatActionIds();

    this.modelValueMappings = (config.valueMappings || []).map(mapping => ({
      id: mapping.id || `mapping-${this.nextModelValueMappingId++}`,
      column: mapping.column || '',
      fromValue: mapping.fromValue || '',
      conditionColumn: mapping.conditionColumn || '',
      conditionValue: mapping.conditionValue || '',
      toValue: mapping.toValue || '',
      enabled: mapping.enabled !== false
    }));

    this.modelColumnConcatRules = (config.columnConcatRules || []).map(rule => ({
      id: rule.id || `concat-${this.nextModelConcatRuleId++}`,
      sourceColumns: [...(rule.sourceColumns || [])],
      targetColumn: rule.targetColumn || '',
      separator: rule.separator ?? '',
      enabled: rule.enabled !== false
    }));

    this.modelColumnMathRules = (config.columnMathRules || []).map(rule => ({
      id: rule.id || `math-${this.nextModelMathRuleId++}`,
      sourceColumnA: rule.sourceColumnA || '',
      sourceColumnB: rule.sourceColumnB || '',
      targetColumn: rule.targetColumn || '',
      operation: rule.operation === 'subtract' ? 'subtract' : 'add',
      enabled: rule.enabled !== false
    }));

    if (config.sectionOrder?.length) {
      const resolved: ModelPreProcessingSectionId[] = [];
      for (const sectionId of config.sectionOrder) {
        if (DEFAULT_PRE_PROCESSING_SECTION_ORDER.includes(sectionId) && !resolved.includes(sectionId)) {
          resolved.push(sectionId);
        }
      }
      for (const sectionId of DEFAULT_PRE_PROCESSING_SECTION_ORDER) {
        if (!resolved.includes(sectionId)) {
          resolved.push(sectionId);
        }
      }
      this.preProcessingSectionOrder = resolved;
    }

    this.modelColumnRenameRules = (config.columnRenameRules || []).map(rule => ({
      id: rule.id || `rename-${this.nextModelColumnRenameId++}`,
      sourceColumn: rule.sourceColumn || '',
      targetColumn: rule.targetColumn || '',
      enabled: rule.enabled !== false
    }));

    if (this.modelRowFilters.length) {
      this.showRowFiltersSection = true;
    }

    if (this.modelFormatActions.some(action => action.enabled)) {
      this.showFormatActionsSection = true;
    }

    if (this.modelColumnConcatRules.length) {
      this.showColumnConcatSection = true;
    }

    if (this.modelColumnMathRules.length) {
      this.showColumnMathSection = true;
    }

    if (this.modelValueMappings.length) {
      this.showValueMappingsSection = true;
    }

    if (this.modelColumnRenameRules.length) {
      this.showColumnRenameSection = true;
    }

    if (config.envColumn?.enabled && config.envColumn.value) {
      this.modelEnvColumnEnabled = true;
      this.modelEnvColumnValue = ENV_COLUMN_OPTIONS.includes(config.envColumn.value as EnvColumnOption)
        ? config.envColumn.value as EnvColumnOption
        : '';
      this.showEnvColumnSection = true;
    }

    if (config.exportColumnFilter?.enabled) {
      this.modelExportColumnFilterEnabled = true;
      this.showExportColumnFilterSection = true;
      this.refreshModelExportColumnCatalog();
      this.modelExportColumnKeepMap = this.modelPreProcessingService.buildExportColumnKeepMap(
        this.modelExportColumns,
        config.exportColumnFilter
      );
    }

    if (this.showFormatActionsSection && !this.modelFormatActions.length) {
      this.initDefaultFormatActions();
    }
  }

  resetPreProcessingConfig(): void {
    this.modelRowFilters = [];
    this.modelFormatActions = [];
    this.modelColumnConcatRules = [];
    this.modelColumnMathRules = [];
    this.modelValueMappings = [];
    this.modelColumnRenameRules = [];
    this.modelEnvColumnEnabled = false;
    this.modelEnvColumnValue = '';
    this.modelExportColumnFilterEnabled = false;
    this.modelExportColumns = [];
    this.modelExportColumnKeepMap = {};
    this.preProcessingSectionOrder = [...DEFAULT_PRE_PROCESSING_SECTION_ORDER];
    this.nextModelFilterId = 1;
    this.nextModelConcatRuleId = 1;
    this.nextModelMathRuleId = 1;
    this.nextModelValueMappingId = 1;
    this.nextModelColumnRenameId = 1;
    this.nextModelFormatActionId = 1;
    this.showRowFiltersSection = false;
    this.showFormatActionsSection = false;
    this.showColumnConcatSection = false;
    this.showColumnMathSection = false;
    this.showValueMappingsSection = false;
    this.showColumnRenameSection = false;
    this.showEnvColumnSection = false;
    this.showExportColumnFilterSection = false;
    this.modelEnvColumnEnabled = false;
    this.modelEnvColumnValue = '';
    this.modelExportColumnFilterEnabled = false;
    this.modelExportColumns = [];
    this.modelExportColumnKeepMap = {};
  }
}
