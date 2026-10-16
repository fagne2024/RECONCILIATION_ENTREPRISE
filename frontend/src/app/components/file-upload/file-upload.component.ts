import { Component, EventEmitter, Input, Output, ChangeDetectorRef, NgZone, OnDestroy, OnInit, ViewChild, ElementRef } from '@angular/core';
import { ReconciliationService } from '../../services/reconciliation.service';
import { AutoProcessingService, AutoProcessingModel, ENV_COLUMN_NAME, ENV_COLUMN_OPTIONS, EnvColumnOption, ProcessingResult, ColumnProcessingRule } from '../../services/auto-processing.service';
import { PartnerConditionalKeysService } from '../../services/partner-conditional-keys.service';
import { ModelPreProcessingService } from '../../services/model-preprocessing.service';
import { ExportOptimizationService } from '../../services/export-optimization.service';
import { TraitementBackgroundService } from '../../services/traitement-background.service';
import { OrangeMoneyUtilsService } from '../../services/orange-money-utils.service';
import { fixGarbledCharacters, fixCellEncoding, fixCellEncodingIfNeeded } from '../../utils/encoding-fixer';
import {
  detectMerchantReportHeaderIndex,
  scoreMerchantReportHeaderRow,
  enrichRowWithCanonicalFrenchColumns,
  buildFrenchAliasEntries,
  applyFrenchAliasesToRow,
  mergeBilingualColumnsInRows,
  FrenchAliasEntry,
  getCanonicalFrenchLabel,
  resolveCanonicalColumnId
} from '../../utils/bilingual-column.util';
import { resolveColumnKeyInRow, deduplicateHeaderNames } from '../../utils/row-column.util';
import { stripAllWhitespace } from '../../utils/concat.util';
import { hasCommaSeparatedSearchFilter, matchesCommaSeparatedFilter } from '../../utils/search-filter.util';
import {
    formatSpreadsheetCellValue,
    formatSpreadsheetDateValue,
    isDateColumnName,
    isExcelSerialDateValue
} from '../../utils/date-format.util';
import * as Papa from 'papaparse';
import * as XLSX from 'xlsx';
import { Router, ActivatedRoute } from '@angular/router';
import { AppStateService } from '../../services/app-state.service';
import { ReconciliationTabsService } from '../../services/reconciliation-tabs.service';
import { forkJoin, Subscription, firstValueFrom } from 'rxjs';
import { take } from 'rxjs/operators';
import { PopupService } from '../../services/popup.service';
import { FileWatcherService } from '../../services/file-watcher.service';
import { ProgressIndicatorService } from '../../services/progress-indicator.service';
import { ColumnRulesProcessorService } from '../../services/column-rules-processor.service';
import { readCsvFileUltraFast, readCsvContentUltraFast } from '../../utils/fast-csv-reader.util';
import { findHeaderLineIndexInCsvLines, findHeaderRowIndexInGrid } from '../../utils/model-header-detection.util';
import { discoverReconciliationKeyColumns } from '../../utils/reconciliation-key.util';
import { formatGridCellAsString, isTransactionIdPreserveColumn, isMsisdnPreserveColumn } from '../../utils/text-cell.util';

@Component({
    selector: 'app-file-upload',
    templateUrl: './file-upload.component.html',
    styleUrls: ['./file-upload.component.scss']
})
export class FileUploadComponent implements OnInit, OnDestroy {
    @ViewChild('boFileInput') boFileInputRef?: ElementRef<HTMLInputElement>;
    @ViewChild('partnerFileInput') partnerFileInputRef?: ElementRef<HTMLInputElement>;
    @ViewChild('autoBoFileInput') autoBoFileInputRef?: ElementRef<HTMLInputElement>;
    @ViewChild('autoPartnerFileInput') autoPartnerFileInputRef?: ElementRef<HTMLInputElement>;
    @ViewChild('traitementFileInput') traitementFileInputRef?: ElementRef<HTMLInputElement>;

    @Output() filesLoaded = new EventEmitter<{
        boData: Record<string, string>[];
        partnerData: Record<string, string>[];
    }>();

    /** Section embarquée sur /traitement : panneau « Traitement Automatique » sans UI de réconciliation. */
    @Input() embedTraitementSection = false;
    /** Progression du traitement automatique (section embarquée /traitement). */
    @Output() embedTraitementProgress = new EventEmitter<string>();
    /** Résultat du traitement (section embarquée) : lignes traitées prêtes à être rechargées par le parent. */
    @Output() embedTraitementResult = new EventEmitter<{
        rows: Record<string, string>[];
        outputName: string;
        lineCount: number;
        modelName: string;
    }>();

    /** Page /upload : Option 1 uniquement (mode manuel). */
    manualOnly = false;
    /** Page /upload-assisted : Option 2 uniquement (mode assisté). */
    assistedOnly = false;
    /** Certification de solde TRXBO/OPPART : redirection vers /certification-solde après réconciliation. */
    certificationMode = false;

    reconciliationMode: 'manual' | 'automatic' = 'manual'; // 'super-auto' commenté
    reconciliationType: '1-1' | '1-2' | '1-3' | '1-4' | '1-5' = '1-1';
    /** Logique de rapprochement proposée en mode manuel. */
    manualLogicMode: 'standard' | 'ratio' | 'custom' = 'standard';
    /** Ratios proposés quand la logique « Ratio » est retenue. */
    readonly reconciliationRatioOptions: ReadonlyArray<'1-2' | '1-3' | '1-4' | '1-5'> = ['1-2', '1-3', '1-4', '1-5'];
    /** Ratio saisi en mode personnalisé (ex: '1-6', '1-10', '2-3'). */
    customRatio = '1-6';
    /** Tolérance de montant en mode personnalisé (0 à 1). */
    customTolerance = 0;

    boFile: File | null = null;
    partnerFile: File | null = null;
    boData: Record<string, string>[] = [];
    partnerData: Record<string, string>[] = [];
    estimatedTime: string = '';

    // Fichiers pour le mode automatique
    autoBoFile: File | null = null;
    autoPartnerFile: File | null = null;
    autoBoFileName: string = '';
    autoPartnerFileName: string = '';
    autoBoData: Record<string, string>[] = [];
    autoPartnerData: Record<string, string>[] = [];

    /** Modal « Traitement de fichier » (mode assisté). */
    showTraitementModal = false;
    traitementFiles: File[] = [];
    traitementModels: AutoProcessingModel[] = [];
    selectedTraitementModelId = '';
    /** Sélection multiple des modèles (module /traitement uniquement). */
    selectedTraitementModelIds = new Set<string>();
    traitementModelSearch = '';
    traitementOutputDate = '';
    /** Texte optionnel inséré dans le nom : pattern_<texte>_YYYYMMDD.ext */
    traitementOutputNameSuffix = '';
    traitementModelsLoading = false;
    traitementProcessing = false;
    traitementProgressMessage = '';
    traitementAutoSelectedModelHint = '';
    /** Colonnes de sortie déduites du modèle (section « garder / supprimer »). */
    traitementOutputColumns: string[] = [];

    /** Afficher/masquer la liste des modèles dans le panneau embarqué (/traitement). */
    showEmbedModelsList = false;

  trackByIndex = (index: number): number => index;

  trackByValue = (index: number, value: any): any => value;

  trackById = (index: number, item: any): any => (item?.id ?? index);
    traitementColumnKeepMap: Record<string, boolean> = {};
    traitementColumnFilterEnabled = false;
    traitementEnvColumnEnabled = false;
    traitementEnvColumnValue: EnvColumnOption | '' = '';
    readonly envColumnName = ENV_COLUMN_NAME;
    readonly envColumnOptions = ENV_COLUMN_OPTIONS;
    traitementOutputColumnsLoading = false;
    /** Suppression de doublons avant export (section Traitement). */
    traitementDedupEnabled = false;
    traitementDedupColumns: string[] = [];
    private availableTemplateFiles: Array<{ fileName: string; columns?: string[] }> | null = null;
    private treatmentProgressLastUi = 0;
    private traitementColumnRulesCache = new Map<string, ColumnProcessingRule[]>();
    private traitementViewDestroyed = false;

    /** Modèle partenaire mémorisé après traitement assisté (évite la re-détection par nom de fichier). */
    assistedPartnerReconciliationModelId: string | null = null;
    assistedBoTreatmentModelId: string | null = null;

    // Fichiers pour le mode super auto - COMMENTÉ
    // superAutoBoFile: File | null = null;
    // superAutoPartnerFile: File | null = null;
    // superAutoBoData: Record<string, string>[] = [];
    // superAutoPartnerData: Record<string, string>[] = [];
    // superAutoEstimatedTime: string = '';

    loading = false;
    errorMessage = '';
    successMessage = '';

    // Variables pour le traitement des gros fichiers
    isProcessingLargeFile = false;
    processingProgress = 0;
    processingMessage = '';
    processingCancelled = false;
    processingAbortController: AbortController | null = null;
    processingMode: string = '';
    processingDetails: {
        mode: string;
        chunks?: number;
        workers?: number;
        memory?: string;
    } | null = null;

    // Variables pour la barre de progression de la réconciliation automatique
    showReconciliationProgress = false;
    reconciliationProgress: {
        percentage: number;
        step: string;
        currentBoChunk?: number;
        totalBoChunks?: number;
        matchesCount?: number;
        boOnlyCount?: number;
        partnerRemaining?: number;
        processed?: number;
        total?: number;
    } = {
        percentage: 0,
        step: '',
        currentBoChunk: 0,
        totalBoChunks: 0,
        matchesCount: 0,
        boOnlyCount: 0,
        partnerRemaining: 0,
        processed: 0,
        total: 0
    };
    private reconciliationProgressSubscription?: Subscription;

    // Sélection d'agences pour TRXBO (étape 1)
    showAgencySelection = false;
    availableAgencies: string[] = [];
    selectedAgencies: string[] = [];
    agencySearchFilter = ''; // Filtre de recherche dans le popup agences
    private agenciesSelectionBeforeSearch: string[] | null = null;
    agencySelectionData: Record<string, string>[] = [];
    agencyColumn: string | null = null; // Colonne utilisée pour la sélection des agences

    // Sélection de services pour TRXBO (étape 2)
    showServiceSelection = false;
    availableServices: string[] = [];
    selectedServices: string[] = [];
    serviceSearchFilter = '';
    private servicesSelectionBeforeSearch: string[] | null = null;
    serviceSelectionData: Record<string, string>[] = [];

    // Sélection des statuts pour TRXBO en mode automatique (étape 3)
    showAutoStatusSelection = false;
    autoAvailableStatuses: string[] = [];
    autoSelectedStatuses: string[] = [];
    autoStatusSearchFilter = '';
    autoStatusSelectionData: Record<string, string>[] = [];
    autoStatusColumn: string | null = null;

    // Sélection manuelle de services
    showManualServiceSelection = false;
    manualAvailableServices: string[] = [];
    manualSelectedServices: string[] = [];
    manualServiceSearchFilter = '';
    private manualServicesSelectionBeforeSearch: string[] | null = null;
    manualServiceSelectionData: Record<string, string>[] = [];
    manualStatusColumn: string | null = null; // Colonne statut pour TRXBO en mode manuel
    
    // Sélection des statuts pour TRXBO en mode manuel (étape 3)
    showManualStatusSelection = false;
    manualAvailableStatuses: string[] = [];
    manualSelectedStatuses: string[] = [];
    manualStatusSearchFilter = '';
    manualStatusSelectionData: Record<string, string>[] = []; // Données déjà filtrées par agence et service

    // Sélection de services/type/statut pour les fichiers partenaires
    showPartnerServiceSelection = false;
    partnerAvailableServices: string[] = [];
    partnerSelectedServices: string[] = [];
    partnerServiceSearchFilter = '';
    private partnerServicesSelectionBeforeSearch: string[] | null = null;
    partnerServiceSelectionData: Record<string, string>[] = [];
    partnerServiceColumn: string | null = null; // Colonne utilisée pour la sélection (service, type, etc.)
    partnerStatusColumn: string | null = null; // Colonne statut
    
    // Sélection des statuts pour les fichiers partenaires (étape 2)
    showPartnerStatusSelection = false;
    partnerAvailableStatuses: string[] = [];
    partnerSelectedStatuses: string[] = [];
    partnerStatusSearchFilter = '';
    partnerStatusSelectionData: Record<string, string>[] = []; // Données déjà filtrées par service

    // Sélection des paiements pour les fichiers partenaires (étape 3)
    showPartnerPaymentSelection = false;
    partnerAvailablePayments: string[] = [];
    partnerSelectedPayments: string[] = [];
    partnerPaymentSearchFilter = '';
    partnerPaymentSelectionData: Record<string, string>[] = []; // Données déjà filtrées par service et statut
    partnerPaymentColumn: string | null = null; // Colonne utilisée pour la sélection des paiements
    /** Compteurs pré-calculés (évite de filtrer 80k+ lignes à chaque cycle de détection Angular). */
    private partnerServiceCounts: Record<string, number> = {};
    private partnerStatusCounts: Record<string, number> = {};
    private partnerPaymentCounts: Record<string, number> = {};
    partnerSelectionBusy = false;
    autoBoSourceFormat: 'csv' | 'excel' | null = null;
    autoPartnerSourceFormat: 'csv' | 'excel' | null = null;
    autoProceedBusy = false;

    /** Sélection des agences sur fichier partenaire (si colonne Agence présente), avant services/types */
    showPartnerAgencySelection = false;
    partnerAvailableAgencies: string[] = [];
    partnerSelectedAgencies: string[] = [];
    partnerAgencySearchFilter = '';
    private partnerAgenciesSelectionBeforeSearch: string[] | null = null;
    partnerAgencyColumn: string | null = null;
    partnerAgencySelectionData: Record<string, string>[] = [];

    // Configuration des formats supportés
    supportedFormats = [
        { name: 'CSV', extensions: ['.csv'], mimeType: 'text/csv' },
        { name: 'Excel', extensions: ['.xlsx', '.xls'], mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
        { name: 'JSON', extensions: ['.json'], mimeType: 'application/json' }
    ];

    constructor(
        private reconciliationService: ReconciliationService, 
        private autoProcessingService: AutoProcessingService,
        private orangeMoneyUtilsService: OrangeMoneyUtilsService,
        private router: Router,
        private route: ActivatedRoute,
        private appStateService: AppStateService,
        private reconciliationTabsService: ReconciliationTabsService,
        private popupService: PopupService,
        private progressIndicatorService: ProgressIndicatorService,
        private exportOptimizationService: ExportOptimizationService,
        private traitementBackgroundService: TraitementBackgroundService,
        private modelPreProcessingService: ModelPreProcessingService,
        private partnerConditionalKeysService: PartnerConditionalKeysService,
        private fileWatcherService: FileWatcherService,
        private columnRulesProcessor: ColumnRulesProcessorService,
        private cd: ChangeDetectorRef,
        private ngZone: NgZone
    ) {
        // Le type de réconciliation est réhydraté dans ngOnInit, une fois le mode actif connu.
    }

    get isAssistedLike(): boolean {
        return this.assistedOnly || this.certificationMode;
    }

    ngOnInit(): void {
        this.manualOnly = this.route.snapshot.data['manualOnly'] === true;
        this.assistedOnly = this.route.snapshot.data['assistedOnly'] === true;
        this.certificationMode = this.route.snapshot.data['certificationMode'] === true;
        if (this.manualOnly) {
            this.reconciliationMode = 'manual';
        } else if (this.assistedOnly || this.certificationMode) {
            this.reconciliationMode = 'automatic';
        }
        this.restoreManualReconciliationType();

        if (this.route.snapshot.queryParamMap.get('reset') === '1') {
            this.resetUploadSession();
        }

        if (this.embedTraitementSection) {
            void this.initTraitementPanel();
        }
    }

    goBackFromAssistedUpload(): void {
        if (this.certificationMode) {
            this.router.navigate(['/certification-solde']);
            return;
        }
        this.goBackToLauncher();
    }

    /** Accès direct à la réconciliation des compenses depuis l'upload certification. */
    goToCompenseReconciliation(): void {
        this.router.navigate(['/certification-solde'], { queryParams: { focus: 'compense' } });
    }

    goBackToLauncher(): void {
        this.router.navigate(['/reconciliation-launcher'], { queryParams: { mode: 'assisted' } });
    }

    goBackToManualLauncher(): void {
        this.router.navigate(['/reconciliation-launcher'], { queryParams: { mode: 'manual' } });
    }

    /** Ouvre le modal de traitement de fichier (mode assisté). */
    async onTraitementFichier(): Promise<void> {
        this.showTraitementModal = true;
        await this.initTraitementPanel();
    }

    /** Initialise le panneau de traitement (modal ou section embarquée). */
    async initTraitementPanel(): Promise<void> {
        this.traitementFiles = [];
        this.selectedTraitementModelId = '';
        this.selectedTraitementModelIds.clear();
        this.traitementModelSearch = '';
        this.traitementOutputDate = this.formatDateForInput(this.getDefaultTraitementOutputDate());
        this.traitementOutputNameSuffix = '';
        this.traitementProgressMessage = '';
        this.traitementAutoSelectedModelHint = '';
        this.resetTraitementColumnSelectionState();
        this.showEmbedModelsList = false;
        await this.loadTraitementModels();
        this.cd.detectChanges();
    }

    resetTraitementPanel(): void {
        if (this.traitementProcessing) {
            return;
        }
        this.traitementFiles = [];
        this.selectedTraitementModelId = '';
        this.selectedTraitementModelIds.clear();
        this.traitementModelSearch = '';
        this.traitementOutputDate = this.formatDateForInput(this.getDefaultTraitementOutputDate());
        this.traitementOutputNameSuffix = '';
        this.traitementProgressMessage = '';
        this.traitementAutoSelectedModelHint = '';
        this.resetTraitementColumnSelectionState();
        this.traitementDedupEnabled = false;
        this.traitementDedupColumns = [];
        this.traitementEnvColumnEnabled = false;
        this.traitementEnvColumnValue = '';
        this.showEmbedModelsList = false;
        this.resetFileInput(this.traitementFileInputRef);
        this.cd.detectChanges();
    }

    closeTraitementModal(force = false, options?: { keepProcessing?: boolean }): void {
        if (this.traitementProcessing && !force) {
            return;
        }
        this.showTraitementModal = false;
        if (!options?.keepProcessing) {
            this.traitementProcessing = false;
        }
        this.resetTraitementPanel();
    }

    get filteredTraitementModels(): AutoProcessingModel[] {
        const query = this.traitementModelSearch.trim().toLowerCase();
        if (!query) {
            return this.traitementModels;
        }
        return this.traitementModels.filter(model => this.traitementModelMatchesSearch(model, query));
    }

    /** Sélectionne automatiquement le modèle le plus pertinent selon la recherche. */
    onTraitementModelSearchChange(): void {
        this.autoSelectTraitementModelFromSearch();
        this.cd.detectChanges();
    }

    private autoSelectTraitementModelFromSearch(): void {
        const query = this.traitementModelSearch.trim().toLowerCase();
        if (!this.traitementModels.length) {
            return;
        }

        if (!query) {
            if (this.isTraitementMultiModelMode) {
                this.selectedTraitementModelIds.clear();
                this.selectedTraitementModelId = '';
                this.traitementAutoSelectedModelHint = '';
            }
            return;
        }

        const filtered = this.filteredTraitementModels;
        if (!filtered.length) {
            if (this.isTraitementMultiModelMode) {
                this.selectedTraitementModelIds.clear();
                this.selectedTraitementModelId = '';
                this.traitementAutoSelectedModelHint =
                    `Aucun modèle ne correspond à « ${query} ».`;
            }
            return;
        }

        if (this.isTraitementMultiModelMode) {
            this.autoSelectTraitementModelsFromSearchMulti(query, filtered);
            return;
        }

        const best = filtered.length === 1
            ? filtered[0]
            : this.pickBestTraitementModelForSearch(query, filtered);

        const bestId = this.getTraitementModelId(best);
        if (!bestId) {
            return;
        }

        this.selectedTraitementModelId = bestId;
        this.syncTraitementEnvColumnFromModel();
        const preSummary = this.modelPreProcessingService.getPreProcessingSummary(best.preProcessingConfig);
        let hint = `Modèle sélectionné : ${best.name} (pattern ${best.filePattern})`;
        if (preSummary.summaryText) {
            hint += ` — ${preSummary.summaryText} configurés`;
        }
        this.traitementAutoSelectedModelHint = hint;
    }

    /**
     * Mode /traitement : la recherche remplace la sélection par les modèles visibles
     * (seuls les résultats filtrés restent cochés).
     */
    private autoSelectTraitementModelsFromSearchMulti(
        query: string,
        filtered: AutoProcessingModel[]
    ): void {
        const nextSelection = new Set<string>();
        for (const model of filtered) {
            const id = this.getTraitementModelId(model);
            if (id) {
                nextSelection.add(id);
            }
        }
        this.selectedTraitementModelIds = nextSelection;
        this.syncTraitementPrimaryModelFromMultiSelection();

        const total = this.selectedTraitementModelIds.size;
        if (total === 0) {
            this.traitementAutoSelectedModelHint =
                `Aucun modèle sélectionné pour « ${query} ».`;
        } else if (total === 1) {
            const model = filtered[0];
            const preSummary = this.modelPreProcessingService.getPreProcessingSummary(model.preProcessingConfig);
            let hint = `Modèle sélectionné : ${model.name} (pattern ${model.filePattern})`;
            if (preSummary.summaryText) {
                hint += ` — ${preSummary.summaryText} configurés`;
            }
            this.traitementAutoSelectedModelHint = hint;
        } else {
            this.traitementAutoSelectedModelHint =
                `${total} modèle(s) sélectionné(s) pour « ${query} ».`;
        }
    }

    private getTraitementModelId(model?: AutoProcessingModel | null): string {
        return model?.id || model?.modelId || '';
    }

    /** Sélection multiple activée uniquement sur le module /traitement embarqué. */
    get isTraitementMultiModelMode(): boolean {
        return this.embedTraitementSection;
    }

    get selectedTraitementModels(): AutoProcessingModel[] {
        if (this.isTraitementMultiModelMode) {
            return this.traitementModels.filter(m => {
                const id = this.getTraitementModelId(m);
                return id && this.selectedTraitementModelIds.has(id);
            });
        }
        const single = this.traitementModels.find(m => this.getTraitementModelId(m) === this.selectedTraitementModelId);
        return single ? [single] : [];
    }

    get showTraitementColumnSection(): boolean {
        if (!this.isTraitementMultiModelMode) {
            return !!this.selectedTraitementModelId;
        }
        return this.selectedTraitementModelIds.size === 1 && !!this.selectedTraitementModelId;
    }

    get showTraitementEnvSection(): boolean {
        return this.showTraitementColumnSection;
    }

    get showTraitementDedupSection(): boolean {
        if (this.isTraitementMultiModelMode) {
            return this.selectedTraitementModelIds.size >= 1;
        }
        return !!this.selectedTraitementModelId;
    }

    private getTraitementCatalogModelId(): string {
        if (this.selectedTraitementModelId) {
            return this.selectedTraitementModelId;
        }
        return [...this.selectedTraitementModelIds][0] || '';
    }

    isTraitementModelSelected(model: AutoProcessingModel): boolean {
        const id = this.getTraitementModelId(model);
        if (!id) {
            return false;
        }
        if (this.isTraitementMultiModelMode) {
            return this.selectedTraitementModelIds.has(id);
        }
        return this.selectedTraitementModelId === id;
    }

    toggleTraitementModelSelection(model: AutoProcessingModel, selected: boolean): void {
        const id = this.getTraitementModelId(model);
        if (!id) {
            return;
        }
        if (selected) {
            this.selectedTraitementModelIds.add(id);
        } else {
            this.selectedTraitementModelIds.delete(id);
        }
        this.syncTraitementPrimaryModelFromMultiSelection();
        this.onTraitementModelSelectionChange();
        this.cd.detectChanges();
    }

    private syncTraitementPrimaryModelFromMultiSelection(): void {
        const ids = [...this.selectedTraitementModelIds];
        if (ids.length === 1) {
            this.selectedTraitementModelId = ids[0];
            return;
        }
        this.selectedTraitementModelId = '';
        if (ids.length !== 1) {
            this.traitementColumnFilterEnabled = false;
            this.traitementDedupEnabled = false;
            this.traitementDedupColumns = [];
            this.clearTraitementColumnCatalog();
        }
    }

    private traitementModelMatchesSearch(model: AutoProcessingModel, query: string): boolean {
        const name = (model.name || '').toLowerCase();
        const pattern = (model.filePattern || '').toLowerCase();
        if (name.includes(query) || pattern.includes(query)) {
            return true;
        }
        if (query.length < 2) {
            return false;
        }
        const type = model.fileType === 'bo'
            ? 'bo back office'
            : model.fileType === 'partner'
                ? 'partenaire partner'
                : 'bo partenaire';
        return type.includes(query);
    }

    private pickBestTraitementModelForSearch(
        query: string,
        models: AutoProcessingModel[]
    ): AutoProcessingModel {
        const scored = models
            .map(model => ({ model, score: this.scoreTraitementModelSearchMatch(query, model) }))
            .sort((a, b) => {
                if (b.score !== a.score) {
                    return b.score - a.score;
                }
                const patternDiff = (a.model.filePattern || '').length - (b.model.filePattern || '').length;
                if (patternDiff !== 0) {
                    return patternDiff;
                }
                return (a.model.name || '').localeCompare(b.model.name || '', 'fr');
            });
        return scored[0].model;
    }

    private scoreTraitementModelSearchMatch(query: string, model: AutoProcessingModel): number {
        const name = (model.name || '').toLowerCase();
        const pattern = (model.filePattern || '').toLowerCase();
        const patternBase = pattern.replace(/[*?]/g, '');

        if (pattern === query || patternBase === query) {
            return 1000;
        }
        if (name === query) {
            return 900;
        }
        if (pattern.startsWith(query) || query.startsWith(patternBase)) {
            return 700;
        }
        if (name.startsWith(query)) {
            return 600;
        }
        if (pattern.includes(query)) {
            return 400;
        }
        if (name.includes(query)) {
            return 300;
        }
        return 100;
    }

    getTraitementOutputPreview(): string {
        const model = this.traitementModels.find(m => m.id === this.selectedTraitementModelId);
        if (!model || !this.traitementOutputDate) {
            return '';
        }
        const sampleFile = this.traitementFiles[0] || new File([''], 'fichier.csv');
        return this.buildProcessedOutputFileName(model, sampleFile);
    }

    private getDefaultTraitementOutputDate(): Date {
        const date = new Date();
        date.setDate(date.getDate() - 1);
        return date;
    }

    private formatDateForInput(date: Date): string {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }

    private formatDateForFileName(dateInput: string): string {
        if (!dateInput) {
            return this.formatDateForInput(this.getDefaultTraitementOutputDate()).replace(/-/g, '');
        }
        return dateInput.replace(/-/g, '');
    }

    async loadTraitementModels(): Promise<void> {
        this.traitementModelsLoading = true;
        try {
            // En /upload-assisted, le bouton "Traitement de fichier" doit lister tous les modèles,
            // même si l'utilisateur n'a pas accès au module de gestion des modèles.
            this.traitementModels = await this.autoProcessingService.getAllModelsUnrestricted(true);
            if (this.traitementFiles.length > 0) {
                this.suggestTraitementModelFromFiles();
            } else if (this.traitementModelSearch.trim()) {
                this.autoSelectTraitementModelFromSearch();
            } else if (this.traitementModels.length === 1 && !this.isTraitementMultiModelMode) {
                this.selectedTraitementModelId = this.getTraitementModelId(this.traitementModels[0]);
            }
        } catch (error) {
            await this.popupService.showError(
                'Impossible de charger les modèles de traitement.',
                'Erreur'
            );
        } finally {
            this.traitementModelsLoading = false;
            this.cd.detectChanges();
        }
    }

    onTraitementFilesSelected(event: Event): void {
        const input = event.target as HTMLInputElement;
        if (!input.files?.length) {
            return;
        }
        const newFiles = Array.from(input.files);
        this.traitementFiles = [...this.traitementFiles, ...newFiles];
        this.resetFileInput(this.traitementFileInputRef);
        this.suggestTraitementModelFromFiles();
        this.cd.detectChanges();
    }

    removeTraitementFile(index: number, event?: Event): void {
        event?.stopPropagation();
        this.traitementFiles.splice(index, 1);
        this.traitementFiles = [...this.traitementFiles];
        if (this.traitementFiles.length) {
            this.suggestTraitementModelFromFiles();
        } else {
            this.traitementAutoSelectedModelHint = '';
        }
        this.cd.detectChanges();
    }

    /** Détecte et sélectionne le modèle dont le pattern correspond aux fichiers uploadés. */
    private suggestTraitementModelFromFiles(): void {
        if (this.isTraitementMultiModelMode) {
            this.suggestTraitementModelsFromFilesMulti();
            return;
        }

        const detected = this.detectTraitementModelFromFiles(this.traitementFiles);
        if (!detected?.id) {
            this.traitementAutoSelectedModelHint = this.traitementFiles.length
                ? 'Aucun modèle ne correspond au nom des fichiers sélectionnés — choisissez-le manuellement.'
                : '';
            return;
        }

        this.selectedTraitementModelId = this.getTraitementModelId(detected);
        const searchToken = (detected.filePattern || detected.name || '')
            .replace(/[*?]/g, '')
            .trim();
        if (searchToken) {
            this.traitementModelSearch = searchToken;
        }

        const preSummary = this.modelPreProcessingService.getPreProcessingSummary(detected.preProcessingConfig);
        let hint = `Modèle détecté automatiquement : ${detected.name} (pattern ${detected.filePattern})`;
        if (preSummary.summaryText) {
            hint += ` — ${preSummary.summaryText} configurés`;
        }
        this.traitementAutoSelectedModelHint = hint;
    }

    /** En mode multiple : ne pas présélectionner par pattern — l'utilisateur choisit les modèles à appliquer sur le même fichier. */
    private suggestTraitementModelsFromFilesMulti(): void {
        if (!this.traitementFiles.length) {
            this.traitementAutoSelectedModelHint = '';
            return;
        }
        const fileNames = this.traitementFiles.map(f => f.name).join(', ');
        this.traitementAutoSelectedModelHint =
            `${this.traitementFiles.length} fichier(s) chargé(s) (${fileNames}). ` +
            `Cochez un ou plusieurs modèles : chacun sera appliqué sur le(s) même(s) fichier(s) et produira un téléchargement.`;
    }

    private detectTraitementModelFromFiles(files: File[]): AutoProcessingModel | null {
        if (!files.length || !this.traitementModels.length) {
            return null;
        }

        const candidates: Array<{ model: AutoProcessingModel; score: number }> = [];

        for (const model of this.traitementModels) {
            if (!model.id || !model.filePattern) {
                continue;
            }

            let matchedFiles = 0;
            for (const file of files) {
                if (this.matchesFilePattern(file.name, model.filePattern)) {
                    matchedFiles++;
                }
            }

            if (matchedFiles === 0) {
                continue;
            }

            const patternSpecificity = model.filePattern.replace(/[*?]/g, '').length;
            const score = matchedFiles * 1000 + patternSpecificity;
            candidates.push({ model, score });
        }

        if (!candidates.length) {
            return null;
        }

        const allFilesMatched = candidates.filter(
            candidate => this.countTraitementModelFileMatches(candidate.model, files) === files.length
        );
        const pool = allFilesMatched.length ? allFilesMatched : candidates;
        pool.sort((a, b) => b.score - a.score);
        return pool[0].model;
    }

    private countTraitementModelFileMatches(model: AutoProcessingModel, files: File[]): number {
        if (!model.filePattern) {
            return 0;
        }

        return files.filter(file => this.matchesFilePattern(file.name, model.filePattern)).length;
    }

    getTraitementModelLabel(model: AutoProcessingModel): string {
        const typeLabel = model.fileType === 'bo'
            ? 'BO'
            : model.fileType === 'partner'
                ? 'Partenaire'
                : 'BO / Partenaire';
        return `${model.name} — pattern: ${model.filePattern} (${typeLabel})`;
    }

    onTraitementModelSelectionChange(): void {
        this.traitementDedupEnabled = false;
        this.traitementDedupColumns = [];
        this.clearTraitementColumnCatalog();
        this.syncTraitementEnvColumnFromModel();

        const modelId = this.getTraitementCatalogModelId();
        const model = this.traitementModels.find(m => m.id === modelId);
        this.traitementColumnFilterEnabled = this.modelPreProcessingService.isExportColumnFilterEnabled(
            model?.preProcessingConfig
        );

        if (this.showTraitementColumnSection || this.showTraitementDedupSection) {
            void this.loadTraitementOutputColumns().then(() => {
                this.applyTraitementExportColumnFilterFromModel(model);
                this.applyDefaultTraitementDedupColumns();
            });
        }
    }

    private applyTraitementExportColumnFilterFromModel(model?: AutoProcessingModel | null): void {
        const filter = model?.preProcessingConfig?.exportColumnFilter;
        if (!filter?.enabled || !this.traitementOutputColumns.length) {
            return;
        }
        this.traitementColumnKeepMap = {
            ...this.traitementColumnKeepMap,
            ...this.modelPreProcessingService.buildExportColumnKeepMap(
                this.traitementOutputColumns,
                filter
            )
        };
        this.cd.detectChanges();
    }

    onTraitementDedupToggle(enabled: boolean): void {
        this.traitementDedupEnabled = enabled;
        if (enabled && !this.traitementOutputColumns.length && this.showTraitementDedupSection) {
            void this.loadTraitementOutputColumns().then(() => this.applyDefaultTraitementDedupColumns());
        } else if (enabled && !this.traitementDedupColumns.length) {
            this.applyDefaultTraitementDedupColumns();
        }
        this.cd.detectChanges();
    }

    isTraitementDedupColumnSelected(column: string): boolean {
        return this.traitementDedupColumns.includes(column);
    }

    toggleTraitementDedupColumn(column: string, selected: boolean): void {
        if (selected) {
            if (!this.traitementDedupColumns.includes(column)) {
                this.traitementDedupColumns = [...this.traitementDedupColumns, column];
            }
        } else {
            this.traitementDedupColumns = this.traitementDedupColumns.filter(col => col !== column);
        }
        this.cd.detectChanges();
    }

    resetTraitementDedupToModelKeys(): void {
        this.applyDefaultTraitementDedupColumns();
    }

    private applyDefaultTraitementDedupColumns(): void {
        const modelId = this.getTraitementCatalogModelId();
        const model = this.traitementModels.find(m => m.id === modelId);
        if (!model || !this.traitementOutputColumns.length) {
            this.traitementDedupColumns = [];
            return;
        }

        const sampleRow = Object.fromEntries(
            this.traitementOutputColumns.map(col => [col, ''])
        ) as Record<string, string>;
        const fromModel = this.modelPreProcessingService.resolveReconciliationDedupColumnKeys(
            model,
            sampleRow
        );
        const selected: string[] = [];

        for (const col of fromModel) {
            if (this.traitementOutputColumns.includes(col) && !selected.includes(col)) {
                selected.push(col);
            }
        }

        for (const partnerKey of model.reconciliationKeys?.partnerKeys || []) {
            const match = this.traitementOutputColumns.find(col =>
                col === partnerKey
                || this.normalizeColumnName(col) === this.normalizeColumnName(partnerKey)
            );
            if (match && !selected.includes(match)) {
                selected.push(match);
            }
        }

        this.traitementDedupColumns = selected;
        this.cd.detectChanges();
    }

    private syncTraitementEnvColumnFromModel(): void {
        const model = this.traitementModels.find(m => m.id === this.selectedTraitementModelId);
        const env = model?.preProcessingConfig?.envColumn;
        if (env?.enabled && env.value && ENV_COLUMN_OPTIONS.includes(env.value as EnvColumnOption)) {
            this.traitementEnvColumnEnabled = true;
            this.traitementEnvColumnValue = env.value as EnvColumnOption;
            return;
        }
        this.traitementEnvColumnEnabled = false;
        this.traitementEnvColumnValue = '';
    }

    private buildEffectivePreProcessingConfig(model: AutoProcessingModel) {
        const base = model.preProcessingConfig;

        if (!this.showTraitementEnvSection) {
            return base;
        }

        const envColumn = this.traitementEnvColumnEnabled && this.traitementEnvColumnValue
            ? { enabled: true, value: this.traitementEnvColumnValue }
            : undefined;

        if (!base) {
            return envColumn ? { envColumn } : undefined;
        }

        return {
            ...base,
            envColumn
        };
    }

    private resetTraitementColumnSelectionState(): void {
        this.clearTraitementColumnCatalog();
        this.traitementColumnFilterEnabled = false;
    }

    private clearTraitementColumnCatalog(): void {
        this.traitementOutputColumns = [];
        this.traitementColumnKeepMap = {};
        this.traitementOutputColumnsLoading = false;
        this.traitementDedupColumns = [];
    }

    onTraitementColumnFilterToggle(enabled: boolean): void {
        this.traitementColumnFilterEnabled = enabled;
        if (enabled && this.selectedTraitementModelId && !this.traitementOutputColumns.length) {
            void this.loadTraitementOutputColumns();
        }
        this.cd.detectChanges();
    }

    private async resolveModelTemplateColumns(model: AutoProcessingModel): Promise<string[]> {
        const defaultColumns = this.modelPreProcessingService.getDefaultTemplateColumns(
            model.templateFile,
            model.filePattern
        );
        if (defaultColumns.length) {
            return defaultColumns;
        }

        const templateFile = model.templateFile?.trim();
        if (!templateFile) {
            return [];
        }

        try {
            if (!this.availableTemplateFiles) {
                this.availableTemplateFiles = await firstValueFrom(
                    this.fileWatcherService.getAvailableFiles()
                ) ?? [];
            }

            const cached = this.availableTemplateFiles.find(f => f.fileName === templateFile);
            if (cached?.columns?.length) {
                return cached.columns.map(col => String(col).trim()).filter(Boolean);
            }

            const analyzed = await firstValueFrom(this.fileWatcherService.analyzeFile(templateFile));
            if (analyzed?.columns?.length) {
                return analyzed.columns.map((col: string) => String(col).trim()).filter(Boolean);
            }
        } catch (error) {
        }

        return [];
    }

    /** Colonnes attendues du fichier modèle (watch-folder) pour localiser l'en-tête à la lecture. */
    private async resolveModelExpectedHeaderColumns(
        model: AutoProcessingModel,
        columnRules: ColumnProcessingRule[] = []
    ): Promise<string[]> {
        const templateColumns = await this.resolveModelTemplateColumns(model);
        if (templateColumns.length >= 2) {
            return templateColumns;
        }

        const inputColumns = this.collectAssistedTreatmentInputColumns(model, columnRules);
        if (inputColumns.length >= 2) {
            return inputColumns;
        }

        return this.modelPreProcessingService.getDefaultTemplateColumns(
            model.templateFile,
            model.filePattern
        );
    }

    async loadTraitementOutputColumns(): Promise<void> {
        this.clearTraitementColumnCatalog();

        const catalogModelId = this.getTraitementCatalogModelId();
        const model = this.traitementModels.find(m => m.id === catalogModelId);
        if (!model?.id) {
            this.cd.detectChanges();
            return;
        }

        this.traitementOutputColumnsLoading = true;
        this.cd.detectChanges();

        try {
            const columnRules = await this.autoProcessingService.getColumnProcessingRules(
                model.id,
                AutoProcessingService.RECONCILIATION_MODULE
            );
            const templateColumns = await this.resolveModelTemplateColumns(model);
            this.traitementOutputColumns = this.modelPreProcessingService.buildAssistedExportColumnCatalog(
                model,
                columnRules,
                templateColumns
            );
            for (const col of this.traitementOutputColumns) {
                this.traitementColumnKeepMap[col] = true;
            }
            if (this.traitementColumnFilterEnabled) {
                this.applyTraitementExportColumnFilterFromModel(model);
            }
        } catch (error) {
        } finally {
            this.traitementOutputColumnsLoading = false;
            this.cd.detectChanges();
        }
    }

    getTraitementColumnsKeptCount(): number {
        return this.traitementOutputColumns.filter(col => this.traitementColumnKeepMap[col] !== false).length;
    }

    setAllTraitementColumnsKept(keep: boolean): void {
        for (const col of this.traitementOutputColumns) {
            this.traitementColumnKeepMap[col] = keep;
        }
        this.cd.detectChanges();
    }

    resetTraitementColumnKeepDefaults(): void {
        for (const col of this.traitementOutputColumns) {
            this.traitementColumnKeepMap[col] = true;
        }
        this.cd.detectChanges();
    }

    isTraitementColumnKept(column: string): boolean {
        return this.traitementColumnKeepMap[column] !== false;
    }

    toggleTraitementColumnKeep(column: string, keep: boolean): void {
        this.traitementColumnKeepMap[column] = keep;
        this.cd.detectChanges();
    }

    getSelectedTraitementExportColumns(): string[] {
        if (!this.traitementColumnFilterEnabled) {
            return [];
        }
        return this.traitementOutputColumns.filter(col => this.traitementColumnKeepMap[col] !== false);
    }

    canApplyTraitement(): boolean {
        const hasModel = this.isTraitementMultiModelMode
            ? this.selectedTraitementModelIds.size > 0
            : !!this.selectedTraitementModelId;
        return !this.traitementProcessing
            && this.traitementFiles.length > 0
            && hasModel
            && !!this.traitementOutputDate;
    }

    async applyAssistedFileTreatment(): Promise<void> {
        if (!this.canApplyTraitement()) {
            return;
        }

        if (this.traitementEnvColumnEnabled && !this.traitementEnvColumnValue) {
            await this.popupService.showWarning(
                `Veuillez choisir une valeur pour la colonne ${ENV_COLUMN_NAME}.`,
                'Colonne ENV'
            );
            return;
        }

        if (this.traitementDedupEnabled && !this.traitementDedupColumns.length) {
            await this.popupService.showWarning(
                'Activez la suppression de doublons uniquement après avoir coché au moins une colonne clé.',
                'Suppression de doublons'
            );
            return;
        }

        if (this.isTraitementMultiModelMode && this.selectedTraitementModelIds.size > 1) {
            await this.applyEmbedMultiModelTraitement();
            return;
        }

        const model = this.selectedTraitementModels[0];
        if (!model?.id) {
            await this.popupService.showError('Veuillez sélectionner un modèle de traitement.', 'Modèle requis');
            return;
        }

        await this.applySingleModelTraitement(model, this.traitementFiles);
    }

    /** Traite plusieurs modèles en une fois (module /traitement) — même fichier(s) pour chaque modèle. */
    private async applyEmbedMultiModelTraitement(): Promise<void> {
        const models = this.selectedTraitementModels;
        const files = [...this.traitementFiles];
        if (!models.length) {
            await this.popupService.showError('Sélectionnez au moins un modèle de traitement.', 'Modèle requis');
            return;
        }
        if (!files.length) {
            await this.popupService.showError('Ajoutez au moins un fichier à traiter.', 'Fichier requis');
            return;
        }

        this.traitementViewDestroyed = false;
        this.traitementProcessing = true;
        this.treatmentProgressLastUi = 0;
        this.traitementColumnRulesCache.clear();
        this.traitementBackgroundService.beginTraitement(models[0]?.name || 'Traitement multiple', files.map(f => f.name));

        const successes: string[] = [];
        const skipped: string[] = [];

        try {
            for (let i = 0; i < models.length; i++) {
                const model = models[i];
                await this.updateTraitementProgress(
                    `Modèle ${i + 1}/${models.length} — ${model.name} (${files.length} fichier(s))...`
                );

                const result = await this.runAssistedFileTreatmentForModel(model, files);
                if (result.success && result.outputName) {
                    successes.push(
                        `${model.name} → ${result.outputName} (${result.lineCount?.toLocaleString('fr-FR') ?? 0} ligne(s))`
                    );
                    this.embedTraitementResult.emit({
                        rows: result.exportRows || [],
                        outputName: result.outputName,
                        lineCount: result.lineCount || 0,
                        modelName: model.name
                    });
                } else if (result.warningMessage) {
                    skipped.push(`${model.name} : ${result.warningMessage}`);
                }
            }

            if (!successes.length) {
                this.traitementBackgroundService.failTraitement(
                    skipped.length
                        ? `Aucun fichier produit. ${skipped.join(' ; ')}`
                        : 'Aucun fichier produit.'
                );
                if (!this.traitementViewDestroyed) {
                    await this.popupService.showWarning(
                        skipped.length
                            ? `Aucun fichier produit.\n\n${skipped.join('\n')}`
                            : 'Aucun fichier produit.',
                        'Traitement multiple'
                    );
                }
                return;
            }

            let message = `${successes.length} fichier(s) téléchargé(s) :\n${successes.join('\n')}`;
            if (skipped.length) {
                message += `\n\nNon produit(s) :\n${skipped.join('\n')}`;
            }
            this.resetTraitementPanel();
            if (!this.traitementViewDestroyed) {
                await this.popupService.showSuccess(message, 'Traitement multiple terminé');
            }
        } catch (error: any) {
            this.traitementBackgroundService.failTraitement(error?.message || 'Erreur lors du traitement multiple.');
            if (!this.traitementViewDestroyed) {
                await this.popupService.showError(
                    `Erreur lors du traitement multiple : ${error?.message || error}`,
                    'Erreur'
                );
            }
        } finally {
            this.traitementProcessing = false;
            this.traitementProgressMessage = '';
            this.safeTraitementDetectChanges();
        }
    }

    private async applySingleModelTraitement(model: AutoProcessingModel, files: File[]): Promise<void> {
        this.traitementViewDestroyed = false;
        this.traitementProcessing = true;
        this.treatmentProgressLastUi = 0;
        this.traitementColumnRulesCache.clear();
        this.traitementBackgroundService.beginTraitement(model.name, files.map(f => f.name));
        const perf = this.startTreatmentPerf(
            this.embedTraitementSection ? 'Traitement automatique (/traitement)' : 'Traitement assisté',
            {
                fichiers: files.map(f => ({ nom: f.name, ko: Math.round(f.size / 1024) })),
                modele: model.name,
                pattern: model.filePattern
            }
        );

        try {
            const result = await this.runAssistedFileTreatmentForModel(model, files);
            if (!result.success) {
                this.traitementBackgroundService.failTraitement(result.warningMessage || 'Traitement sans résultat.');
                if (result.warningMessage && !this.traitementViewDestroyed) {
                    await this.popupService.showWarning(result.warningMessage, 'Traitement');
                }
                return;
            }

            const duplicateSummary = (result.duplicatesRemoved ?? 0) > 0
                ? ` ${result.duplicatesRemoved} doublon(s) ignoré(s).`
                : '';
            const preProcessingSuccess = result.preProcessingResultMessage
                ? `\n\n${result.preProcessingResultMessage}`
                : '';
            const duplicateInfo = (result.duplicatesRemoved ?? 0) > 0
                ? `\n${result.duplicatesRemoved} doublon(s) ignoré(s).`
                : '';

            if (this.embedTraitementSection) {
                this.resetTraitementPanel();
                perf.end('Traitement terminé (embed)', {
                    lignes: result.lineCount,
                    fichier: result.outputName
                });
                this.embedTraitementResult.emit({
                    rows: result.exportRows || [],
                    outputName: result.outputName || '',
                    lineCount: result.lineCount || 0,
                    modelName: model.name
                });
                if (!this.traitementViewDestroyed) {
                    await this.popupService.showSuccess(
                        `Fichier traité et téléchargé (${result.outputName}).${duplicateSummary}${preProcessingSuccess}`,
                        'Traitement terminé'
                    );
                }
                return;
            }

            if (this.traitementViewDestroyed) {
                return;
            }

            const defaultSide = model.fileType === 'partner' ? 'Partenaire' : 'BO (Back Office)';
            const sideChoice = await this.popupService.showSelectInput(
                `${files.length > 1 ? files.length + ' fichier(s) fusionnés' : 'Fichier traité'}.\n` +
                `${(result.lineCount ?? 0).toLocaleString('fr-FR')} ligne(s) unique(s).${duplicateInfo}\n` +
                `Fichier produit : ${result.outputName}.\n` +
                `Assigner ce fichier à quel emplacement pour la réconciliation ?`,
                'Destination BO ou Partenaire',
                ['BO (Back Office)', 'Partenaire'],
                defaultSide
            );

            if (!sideChoice || !result.exportRows) {
                return;
            }

            const side: 'bo' | 'partner' = sideChoice.startsWith('BO') ? 'bo' : 'partner';
            this.closeTraitementModal(true, { keepProcessing: true });
            await this.updateTraitementProgress('Assignation du fichier en cours...', { force: true });
            await this.assignProcessedTreatmentDataAsync(
                result.exportRows,
                result.outputName!,
                side,
                model.id
            );

            const bothReady = this.canProceedAuto();
            perf.end('Traitement terminé', { lignes: result.lineCount, fichier: result.outputName });
            await this.yieldToMainThread(true);
            if (!this.traitementViewDestroyed) {
                await this.popupService.showSuccess(
                    `Fichier traité et téléchargé (${result.outputName}).${duplicateSummary}${preProcessingSuccess}` +
                    (bothReady
                        ? '\n\nBO et Partenaire sont prêts : vous pouvez lancer la réconciliation.'
                        : '\n\nChargez ou traitez l\'autre fichier (BO ou Partenaire) puis lancez la réconciliation.'),
                    'Traitement terminé'
                );
            }
        } catch (error: any) {
            perf.end('Traitement échoué', { erreur: error?.message || String(error) });
            this.traitementBackgroundService.failTraitement(error?.message || 'Erreur lors du traitement.');
            if (!this.traitementViewDestroyed) {
                this.closeTraitementModal(true);
                await this.popupService.showError(
                    `Erreur lors du traitement : ${error?.message || error}`,
                    'Erreur'
                );
            }
        } finally {
            this.traitementProcessing = false;
            this.traitementProgressMessage = '';
            this.safeTraitementDetectChanges();
        }
    }

    private async runAssistedFileTreatmentForModel(
        model: AutoProcessingModel,
        files: File[],
        options?: { suppressWarnings?: boolean }
    ): Promise<{
        success: boolean;
        outputName?: string;
        lineCount?: number;
        duplicatesRemoved?: number;
        preProcessingResultMessage?: string;
        exportRows?: Record<string, string>[];
        warningMessage?: string;
    }> {
        const columnRules = await this.getTraitementColumnRules(model.id!);
        const expectedHeaderColumns = await this.resolveModelExpectedHeaderColumns(model, columnRules);

        const needsCompilation = await this.needsAssistedCompilation(files);
        const compiled = needsCompilation
            ? await this.compileAssistedTreatmentFileRows(files, expectedHeaderColumns)
            : await this.loadSingleAssistedTreatmentFile(files[0], expectedHeaderColumns);

        await this.updateTraitementProgress(
            `Lecture terminée (${compiled.rows.length.toLocaleString('fr-FR')} ligne(s)) — ${model.name}...`
        );
        console.error('[DIAG-TRAITEMENT] APRÈS LECTURE:', compiled.rows.length);

        if (!compiled.rows.length) {
            return {
                success: false,
                warningMessage: 'Aucune donnée lisible dans les fichiers sélectionnés.'
            };
        }
        const inputColumns = this.collectAssistedTreatmentInputColumns(model, columnRules);
        let workingRows = compiled.rows;
        const needsEnrichment = this.needsAssistedColumnEnrichment(compiled.rows[0], inputColumns);

        if (needsEnrichment) {
            workingRows = await this.enrichAssistedRowsAsync(
                compiled.rows,
                inputColumns,
                (done, total) => this.updateTraitementProgress(
                    `${model.name} — colonnes : ${done.toLocaleString('fr-FR')} / ${total.toLocaleString('fr-FR')}...`
                )
            );
            console.error('[DIAG-TRAITEMENT] APRÈS ENRICHISSEMENT:', workingRows.length);
        }

        let preProcessingResultMessage = '';
        const effectivePreProcessingConfig = this.buildEffectivePreProcessingConfig(model);
        console.error(
            '[DIAG-TRAITEMENT] ROW-FILTERS MODELE APPLIQUES:',
            JSON.stringify(
                (effectivePreProcessingConfig?.rowFilters ?? []).map((f: { column?: string; selectedValues?: string[]; enabled?: boolean }) => ({
                    column: f.column,
                    enabled: f.enabled,
                    selectedValues: f.selectedValues
                }))
            )
        );
        if (this.modelPreProcessingService.hasPreProcessing(effectivePreProcessingConfig)) {
            const rowsBeforePreProcessing = workingRows.length;
            workingRows = await this.modelPreProcessingService.applyPreProcessingAsync(
                workingRows,
                effectivePreProcessingConfig,
                {
                    batchSize: workingRows.length > 100000
                        ? 10000
                        : workingRows.length > 20000
                            ? 5000
                            : workingRows.length,
                    onProgress: async (message, done, total) => {
                        await this.updateTraitementProgress(
                            `${model.name} — ${message} ${done.toLocaleString('fr-FR')} / ${total.toLocaleString('fr-FR')}...`,
                            { skipYield: workingRows.length <= 20000 }
                        );
                    },
                    yieldFn: workingRows.length <= 20000
                        ? undefined
                        : () => this.yieldToMainThread(true)
                }
            );
            workingRows = await this.stripKeyColumnWhitespaceAsync(workingRows);
            preProcessingResultMessage = this.modelPreProcessingService.buildApplicationResult(
                rowsBeforePreProcessing,
                workingRows.length,
                effectivePreProcessingConfig
            );

            if (!workingRows.length) {
                return {
                    success: false,
                    warningMessage: 'Aucune ligne restante après pré-traitement du modèle.'
                };
            }
            console.error('[DIAG-TRAITEMENT] APRÈS PRÉ-TRAITEMENT:', workingRows.length);
        }

        await this.updateTraitementProgress(
            `${model.name} — règles sur ${workingRows.length.toLocaleString('fr-FR')} ligne(s)...`,
            { skipYield: workingRows.length <= 20000 }
        );

        const processed = columnRules.length
            ? await this.columnRulesProcessor.applyRulesAsync(
                workingRows,
                columnRules,
                workingRows.length <= 20000
                    ? undefined
                    : async (done, total) => {
                        await this.updateTraitementProgress(
                            `${model.name} — règles : ${done.toLocaleString('fr-FR')} / ${total.toLocaleString('fr-FR')}...`,
                            { skipYield: true }
                        );
                    },
                workingRows.length <= 20000 ? undefined : () => this.yieldToMainThread(true)
            )
            : workingRows;

        if (!processed?.length) {
            return { success: false, warningMessage: 'Aucun résultat après application des règles.' };
        }
        console.error('[DIAG-TRAITEMENT] APRÈS RÈGLES:', processed.length);

        const { rows: mergedRows } = mergeBilingualColumnsInRows(processed, expectedHeaderColumns);

        const useColumnFilter = !this.isTraitementMultiModelMode || this.selectedTraitementModelIds.size === 1;
        const exportColumns = useColumnFilter ? this.getSelectedTraitementExportColumns() : [];
        if (useColumnFilter && this.traitementColumnFilterEnabled && this.traitementOutputColumns.length > 0 && exportColumns.length === 0) {
            return {
                success: false,
                warningMessage: 'Sélectionnez au moins une colonne à conserver dans le fichier final.'
            };
        }

        let exportRows = mergedRows;
        if (exportColumns.length) {
            exportRows = this.modelPreProcessingService.projectRowsToExportColumns(
                mergedRows,
                exportColumns,
                columnRules,
                model
            );
        }

        const outputName = this.buildProcessedOutputFileName(model, compiled.referenceFile);
        let { rows: finalExportRows, columns: finalExportColumns } =
            this.modelPreProcessingService.dropEmptyColumnsFromRows(
                exportRows,
                exportColumns.length ? exportColumns : undefined
            );

        const dedupResult = this.traitementDedupEnabled && this.traitementDedupColumns.length
            ? this.modelPreProcessingService.deduplicateRowsByConfiguredColumns(
                finalExportRows,
                this.traitementDedupColumns,
                model
            )
            : this.modelPreProcessingService.deduplicateRowsByReconciliationKey(
                model,
                finalExportRows
            );
        finalExportRows = dedupResult.uniqueRows;

        if (!finalExportRows.length) {
            return { success: false, warningMessage: 'Aucune ligne unique après déduplication.' };
        }
        console.error('[DIAG-TRAITEMENT] APRÈS DÉDUP:', finalExportRows.length, '— supprimés:', dedupResult.duplicatesRemoved, '— clé:', dedupResult.dedupColumns);

        if (dedupResult.duplicatesRemoved > 0) {
            await this.updateTraitementProgress(
                `${model.name} — ${dedupResult.duplicatesRemoved.toLocaleString('fr-FR')} doublon(s) retiré(s)` +
                (dedupResult.dedupColumns.length
                    ? ` (clé : ${dedupResult.dedupColumns.join(', ')})`
                    : ''),
                { skipYield: true }
            );
        }

        await this.updateTraitementProgress(`Téléchargement : ${outputName}`);
        await this.downloadProcessedTreatmentFile(finalExportRows, outputName, {
            skipNormalize: true,
            columns: finalExportColumns.length ? finalExportColumns : undefined
        });

        // Publier le résultat dans le service de fond (re-téléchargement possible depuis une autre page)
        this.traitementBackgroundService.addResult({
            outputName,
            lineCount: finalExportRows.length,
            duplicatesRemoved: dedupResult.duplicatesRemoved,
            exportRows: finalExportRows,
            exportColumns: finalExportColumns.length ? finalExportColumns : Object.keys(finalExportRows[0] ?? {})
        });

        return {
            success: true,
            outputName,
            lineCount: finalExportRows.length,
            duplicatesRemoved: dedupResult.duplicatesRemoved,
            preProcessingResultMessage,
            exportRows: finalExportRows
        };
    }

    /** Fusion multi-fichiers uniquement ; Excel mono-fichier (y compris multi-feuilles) = lecture directe. */
    private async needsAssistedCompilation(files: File[]): Promise<boolean> {
        const needs = files.length > 1;
        return needs;
    }

    /** Compte les feuilles Excel qui contiennent des cellules (!ref). */
    private countWorkbookSheetsWithData(workbook: XLSX.WorkBook): number {
        const names = workbook.SheetNames ?? [];
        if (!names.length) {
            return 0;
        }
        const sheets = workbook.Sheets;
        if (!sheets) {
            // bookSheets:true ne charge pas Sheets — éviter fusion sur simple décompte de noms
            return 1;
        }
        const withData = names.filter(name => !!sheets[name]?.['!ref']);
        return withData.length > 0 ? withData.length : 1;
    }

    private getWorkbookSheetNamesWithData(workbook: XLSX.WorkBook): string[] {
        const names = workbook.SheetNames ?? [];
        if (!names.length) {
            return [];
        }
        const sheets = workbook.Sheets;
        if (!sheets) {
            return [names[0]];
        }
        const withData = names.filter(name => !!sheets[name]?.['!ref']);
        return withData.length > 0 ? withData : [names[0]];
    }

    private async countExcelSheets(file: File): Promise<number> {
        const data = new Uint8Array(await this.readFileAsArrayBuffer(file));
        const workbook = XLSX.read(data, { type: 'array', bookSheets: true });
        return this.countWorkbookSheetsWithData(workbook);
    }

    getTraitementActionLabel(): string {
        if (this.isTraitementMultiModelMode && this.selectedTraitementModelIds.size > 1) {
            return `Traiter ${this.selectedTraitementModelIds.size} modèles`;
        }
        return this.traitementFiles.length > 1
            ? 'Compiler et appliquer le traitement'
            : 'Appliquer le traitement';
    }

    /** Chronomètre console pour diagnostiquer les lenteurs du traitement assisté. */
    private startTreatmentPerf(
        label: string,
        details?: Record<string, unknown>
    ): {
        mark: (step: string, detail?: Record<string, unknown>) => void;
        end: (step: string, detail?: Record<string, unknown>) => void;
    } {
        const runId = `traitement-${Date.now().toString(36)}`;
        const t0 = performance.now();
        let last = t0;
        console.groupCollapsed(`⏱️ [${runId}] ${label}`);
        if (details) {
        }
        return {
            mark: (step: string, detail?: Record<string, unknown>) => {
                const now = performance.now();
                const delta = now - last;
                const total = now - t0;
                last = now;
            },
            end: (step: string, detail?: Record<string, unknown>) => {
                const now = performance.now();
                const total = now - t0;
                console.groupEnd();
            }
        };
    }

    /** Lecture directe d'un seul fichier (CSV ou Excel mono-feuille) — sans étape de compilation. */
    private async loadSingleAssistedTreatmentFile(
        file: File,
        expectedHeaderColumns: string[] = []
    ): Promise<{
        rows: Record<string, string>[];
        sourceSummary: string;
        referenceFile: File;
    }> {
        const fileSizeMB = (file.size / (1024 * 1024)).toFixed(1);
        this.setTraitementProgressNoUi(`Lecture ultra-rapide : ${file.name} (${fileSizeMB} Mo)`);

        const parsed = await this.readAssistedTreatmentFileRows(file, expectedHeaderColumns);
        const headerInfo = parsed.headerLine >= 0
            ? `, en-tête ligne ${parsed.headerLine + 1}`
            : '';
        const removedInfo = parsed.removedLines > 0
            ? `, ${parsed.removedLines} ligne(s) ignorée(s)`
            : '';

        return {
            rows: parsed.rows,
            sourceSummary: `${file.name} (${parsed.rows.length}${headerInfo}${removedInfo})`,
            referenceFile: file
        };
    }

    /** Fusionne plusieurs fichiers ou feuilles Excel en un seul jeu de lignes. */
    private async compileAssistedTreatmentFileRows(
        files: File[],
        expectedHeaderColumns: string[] = []
    ): Promise<{
        rows: Record<string, string>[];
        sourceSummary: string;
        referenceFile: File;
    }> {
        const compiled: Record<string, string>[] = [];
        const loadedNames: string[] = [];

        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            const fileSizeMB = (file.size / (1024 * 1024)).toFixed(1);
            this.setTraitementProgressNoUi(
                `Fusion ultra-rapide ${i + 1}/${files.length} : ${file.name} (${fileSizeMB} Mo)`
            );

            const parsed = await this.readAssistedTreatmentFileRows(file, expectedHeaderColumns);
            if (parsed.rows.length) {
                this.appendRowsSafely(compiled, parsed.rows);
                const headerInfo = parsed.headerLine >= 0
                    ? `, en-tête ligne ${parsed.headerLine + 1}`
                    : '';
                const removedInfo = parsed.removedLines > 0
                    ? `, ${parsed.removedLines} ligne(s) ignorée(s)`
                    : '';
                loadedNames.push(`${file.name} (${parsed.rows.length}${headerInfo}${removedInfo})`);
            }
            if (i < files.length - 1) {
                await this.yieldToMainThread(true);
            }
        }

        return {
            rows: compiled,
            sourceSummary: loadedNames.join(', '),
            referenceFile: files[0]
        };
    }

    /**
     * Fusionne des lignes sans spread sur l'ensemble du tableau source.
     *
     * `target.push(...source)` déverse tout le tableau dans les arguments de
     * `push` : au-delà de ~65 000–125 000 éléments (limite de pile d'appels du
     * moteur), cela lève « RangeError: Maximum call stack size exceeded ». On
     * copie donc par tranches bornées, sûres quelle que soit la taille du fichier.
     */
    private appendRowsSafely(target: Record<string, string>[], source: Record<string, string>[]): void {
        if (!source.length) {
            return;
        }
        const APPEND_CHUNK_SIZE = 10000;
        for (let i = 0; i < source.length; i += APPEND_CHUNK_SIZE) {
            const chunk = source.slice(i, i + APPEND_CHUNK_SIZE);
            target.push(...chunk);
        }
    }

    /** Paramètres de traitement par chunks (alignés sur la zone glisser-déposer /traitement). */
    private getAssistedCompilationBatchConfig(dataRowCount: number): { yieldEvery: number } {
        if (dataRowCount > 500000) {
            return { yieldEvery: 60000 };
        }
        if (dataRowCount > 100000) {
            return { yieldEvery: 25000 };
        }
        if (dataRowCount > 10000) {
            return { yieldEvery: 8000 };
        }
        return { yieldEvery: 4000 };
    }

    /** Normalise uniquement la zone utile à la détection d'en-têtes (max 300 lignes). */
    private buildAssistedHeaderDetectionGrid(jsonData: any[][]): any[][] {
        const scanLimit = Math.min(300, jsonData.length);
        const headerGrid: any[][] = new Array(scanLimit);
        for (let i = 0; i < scanLimit; i++) {
            headerGrid[i] = this.resolveAssistedGridRow(jsonData[i]);
        }
        return headerGrid;
    }

    /** Construit une ligne compilée rapidement (même logique que le glisser-déposer /traitement). */
    private buildAssistedRowFromGridCells(headers: string[], rowData: any[]): Record<string, string> {
        const row: Record<string, string> = {};
        for (let index = 0; index < headers.length; index++) {
            const value = rowData[index];
            row[headers[index]] = value !== undefined && value !== null
                ? fixCellEncodingIfNeeded(String(value).trim())
                : '';
        }
        return row;
    }

    /**
     * Construit une ligne en alignant les cellules sur les en-têtes DÉTECTÉS de la feuille
     * (au lieu d'un simple index positionnel). Évite le décalage des colonnes (débit/crédit, etc.)
     * sur les feuilles 2, 3… lorsque le tableau n'est pas exactement au même décalage que la feuille 1.
     */
    private buildAssistedRowFromCellMapping(
        columnToHeader: (string | null)[],
        rowData: any[]
    ): Record<string, string> {
        const row: Record<string, string> = {};
        const length = Math.min(columnToHeader.length, rowData.length);
        for (let column = 0; column < length; column++) {
            const header = columnToHeader[column];
            if (!header) {
                continue;
            }
            const value = rowData[column];
            row[header] = value !== undefined && value !== null
                ? fixCellEncodingIfNeeded(String(value).trim())
                : '';
        }
        return row;
    }

    private buildAssistedCsvRow(headers: string[], values: string[]): Record<string, string> {
        const row: Record<string, string> = {};
        for (let index = 0; index < headers.length; index++) {
            row[headers[index]] = fixGarbledCharacters((values[index] ?? '').trim());
        }
        return row;
    }

    /** Ne normalise que les lignes « une seule cellule avec séparateurs » (export Excel mal formé). */
    private resolveAssistedGridRow(row: any[]): any[] {
        if (!Array.isArray(row) || row.length === 0) {
            return row;
        }
        const nonEmptyCells = row.filter(
            cell => cell !== null && cell !== undefined && String(cell).trim() !== ''
        );
        if (nonEmptyCells.length !== 1) {
            return row;
        }
        return this.normalizeAssistedTreatmentRow(row);
    }

    /** Conserve les libellés d'origine (EN) pour que les filtres du modèle restent alignés. */
    private mapAssistedTreatmentHeaders(headerRow: string[], fallbackRow: string[] = []): string[] {
        const source = headerRow.some(h => h && String(h).trim()) ? headerRow : fallbackRow;
        return source.map((header, index) => this.normalizeColumnName(header || `Col${index + 1}`));
    }

    private detectAssistedCsvDelimiter(line: string): string {
        const delimiters = [';', ',', '\t', '|'];
        const sampleLine = line.length > 1000 ? line.substring(0, 1000) : line;
        let bestDelimiter = ';';
        let bestScore = 0;
        for (const delimiter of delimiters) {
            const score = sampleLine.split(delimiter).length;
            if (score > bestScore) {
                bestScore = score;
                bestDelimiter = delimiter;
            }
        }
        return bestDelimiter;
    }

    private splitCsvLineFast(line: string, delimiter: string): string[] {
        return line.split(delimiter);
    }

    private resolveAssistedCsvHeader(
        lines: string[],
        delimiter: string,
        expectedHeaderColumns: string[] = []
    ): {
        headerLine: number;
        headers: string[];
        dataStartLine: number;
        skippedBeforeHeader: number;
        source: string;
    } {
        if (expectedHeaderColumns.length >= 2) {
            const modelLineIndex = findHeaderLineIndexInCsvLines(
                lines,
                delimiter,
                expectedHeaderColumns,
                80
            );
            if (modelLineIndex !== null) {
                const headerCells = this.splitCsvLineFast(lines[modelLineIndex], delimiter);
                const headers = headerCells.map((header, index) =>
                    this.normalizeColumnName(fixGarbledCharacters(header.trim()) || `Col${index + 1}`)
                );
                return {
                    headerLine: modelLineIndex,
                    headers,
                    dataStartLine: modelLineIndex + 1,
                    skippedBeforeHeader: modelLineIndex,
                    source: 'modèle watch-folder'
                };
            }
        }

        for (let i = 0; i < Math.min(15, lines.length); i++) {
            const line = lines[i];
            if (!line.trim()) {
                continue;
            }
            const lower = line.toLowerCase();
            const hasTransactionId = lower.includes('transaction id') || lower.includes('transaction_id');
            const hasSerialOrSender =
                lower.includes('s. no') ||
                lower.includes('s.no') ||
                lower.includes('sender msisdn') ||
                lower.includes('sender_msisdn');
            if (hasTransactionId && hasSerialOrSender) {
                const headerCells = this.splitCsvLineFast(line, delimiter);
                const headers = headerCells.map((header, index) =>
                    this.normalizeColumnName(fixGarbledCharacters(header.trim()) || `Col${index + 1}`)
                );
                return {
                    headerLine: i,
                    headers,
                    dataStartLine: i + 1,
                    skippedBeforeHeader: i,
                    source: 'Airtel User Transaction Report'
                };
            }
        }

        const headerGrid: any[][] = [];
        const lineIndices: number[] = [];
        for (let i = 0; i < lines.length && headerGrid.length < 300; i++) {
            const line = lines[i];
            if (!line.trim()) {
                continue;
            }
            const cells = this.splitCsvLineFast(line, delimiter);
            if (!cells.length) {
                continue;
            }
            headerGrid.push(cells.map(cell => fixGarbledCharacters(cell.trim())));
            lineIndices.push(i);
        }

        if (!headerGrid.length) {
            return {
                headerLine: 0,
                headers: [],
                dataStartLine: 0,
                skippedBeforeHeader: 0,
                source: 'vide'
            };
        }

        const assistedHeader = this.detectAssistedTreatmentHeader(headerGrid, expectedHeaderColumns);
        const headerLine = assistedHeader.headerRowIndex;
        const headerRow = assistedHeader.headerRow;
        const hasDetectedHeaders = headerRow.some(h => h && String(h).trim());
        const headers = this.mapAssistedTreatmentHeaders(
            hasDetectedHeaders ? headerRow : [],
            headerGrid[0] || []
        );

        if (hasDetectedHeaders) {
            return {
                headerLine,
                headers,
                dataStartLine: (lineIndices[headerLine] ?? headerLine) + 1,
                skippedBeforeHeader: headerLine,
                source: assistedHeader.source
            };
        }

        return {
            headerLine: 0,
            headers,
            dataStartLine: (lineIndices[0] ?? 0) + 1,
            skippedBeforeHeader: 0,
            source: assistedHeader.source
        };
    }

    private collectAssistedTreatmentInputColumns(
        model: AutoProcessingModel,
        columnRules: ColumnProcessingRule[]
    ): string[] {
        const columns = new Set<string>(
            this.modelPreProcessingService.collectInputColumns(model.preProcessingConfig)
        );
        columnRules.forEach(rule => {
            if (rule.sourceColumn) {
                columns.add(rule.sourceColumn);
            }
        });
        return Array.from(columns);
    }

    /**
     * Enrichissement bilingue uniquement si une colonne source du modèle n'est pas résolue
     * mais qu'un alias FR peut être dérivé d'un en-tête EN déjà présent.
     */
    private needsAssistedColumnEnrichment(
        sampleRow: Record<string, string>,
        inputColumns: string[]
    ): boolean {
        for (const column of inputColumns) {
            if (!column || resolveColumnKeyInRow(sampleRow, column)) {
                continue;
            }
            if (this.buildAssistedFrenchAliasesForInputColumns(
                Object.keys(sampleRow),
                [column],
                sampleRow
            ).length > 0) {
                return true;
            }
        }
        return false;
    }

    private buildAssistedFrenchAliasesForInputColumns(
        headers: string[],
        inputColumns: string[],
        sampleRow: Record<string, string>
    ): FrenchAliasEntry[] {
        const allAliases = buildFrenchAliasEntries(headers);
        if (!allAliases.length || !inputColumns.length) {
            return [];
        }

        const neededFrenchKeys = new Set<string>();
        for (const column of inputColumns) {
            if (!column || resolveColumnKeyInRow(sampleRow, column)) {
                continue;
            }
            const canonicalId = resolveCanonicalColumnId(column);
            const frenchLabel = canonicalId ? getCanonicalFrenchLabel(canonicalId) : null;
            if (frenchLabel) {
                neededFrenchKeys.add(frenchLabel);
            }
        }

        if (!neededFrenchKeys.size) {
            return allAliases;
        }

        return allAliases.filter(alias => neededFrenchKeys.has(alias.frenchKey));
    }

    private async enrichAssistedRowsAsync(
        rows: Record<string, string>[],
        inputColumns: string[],
        onProgress?: (done: number, total: number) => void | Promise<void>
    ): Promise<Record<string, string>[]> {
        if (!rows.length) {
            return rows;
        }

        const aliases = this.buildAssistedFrenchAliasesForInputColumns(
            Object.keys(rows[0]),
            inputColumns,
            rows[0]
        );
        if (!aliases.length) {
            return rows;
        }

        if (rows.length <= 8000) {
            for (let i = 0; i < rows.length; i++) {
                applyFrenchAliasesToRow(rows[i], aliases);
            }
            if (onProgress) {
                await onProgress(rows.length, rows.length);
            }
            return rows;
        }

        const batchSize = rows.length > 50000 ? 2000 : 5000;
        for (let start = 0; start < rows.length; start += batchSize) {
            const end = Math.min(start + batchSize, rows.length);
            for (let i = start; i < end; i++) {
                applyFrenchAliasesToRow(rows[i], aliases);
            }
            await onProgress?.(end, rows.length);
            if (end < rows.length) {
                await this.yieldToMainThread(true);
            }
        }

        if (onProgress) {
            await onProgress(rows.length, rows.length);
        }

        return rows;
    }

    private readFileAsText(file: File): Promise<string> {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e: ProgressEvent<FileReader>) => resolve(e.target?.result as string);
            reader.onerror = () => reject(new Error('Erreur lors de la lecture du fichier'));
            reader.readAsText(file, 'utf-8');
        });
    }

    /**
     * Détecte la ligne d'en-tête et ignore les lignes avant l'en-tête et les lignes inutiles.
     */
    private parseAssistedTreatmentGrid(
        jsonData: any[][],
        expectedHeaderColumns: string[] = []
    ): {
        rows: Record<string, string>[];
        headerLine: number;
        removedLines: number;
    } {
        if (!jsonData?.length) {
            return { rows: [], headerLine: 0, removedLines: 0 };
        }

        const normalizedGrid = this.normalizeAssistedTreatmentGrid(jsonData);
        const assistedHeader = this.detectAssistedTreatmentHeader(normalizedGrid, expectedHeaderColumns);
        const headerLine = assistedHeader.headerRowIndex;
        const headerRow = assistedHeader.headerRow;
        const hasDetectedHeaders = headerRow.some(h => h && String(h).trim());
        const headers = this.mapAssistedTreatmentHeaders(
            hasDetectedHeaders ? headerRow : [],
            normalizedGrid[0] || []
        );
        const startIndex = hasDetectedHeaders ? headerLine + 1 : 1;
        const skippedBeforeHeader = hasDetectedHeaders ? headerLine : 0;

        const rows: Record<string, string>[] = [];
        let skippedUselessRows = 0;

        for (let i = startIndex; i < normalizedGrid.length; i++) {
            const rowData = normalizedGrid[i] as any[];
            if (!rowData || rowData.length === 0) {
                skippedUselessRows++;
                continue;
            }

            const row: Record<string, string> = {};
            headers.forEach((header, index) => {
                this.assignExcelCellValue(row, header, rowData[index]);
            });

            if (!this.isUsefulAssistedTreatmentRow(row, headers)) {
                skippedUselessRows++;
                continue;
            }

            rows.push(enrichRowWithCanonicalFrenchColumns(row));
        }


        return {
            rows,
            headerLine,
            removedLines: skippedBeforeHeader + skippedUselessRows
        };
    }

    private async parseAssistedTreatmentGridAsync(
        jsonData: any[][],
        progressLabel = 'Lecture Excel',
        expectedHeaderColumns: string[] = []
    ): Promise<{
        rows: Record<string, string>[];
        headerLine: number;
        removedLines: number;
    }> {
        if (!jsonData?.length) {
            return { rows: [], headerLine: 0, removedLines: 0 };
        }

        const headerGrid = this.buildAssistedHeaderDetectionGrid(jsonData);
        const assistedHeader = this.detectAssistedTreatmentHeader(headerGrid, expectedHeaderColumns);
        const headerLine = assistedHeader.headerRowIndex;
        const headerRow = assistedHeader.headerRow;
        const hasDetectedHeaders = headerRow.some(h => h && String(h).trim());
        const headers = this.mapAssistedTreatmentHeaders(
            hasDetectedHeaders ? headerRow : [],
            headerGrid[0] || []
        );
        const startIndex = hasDetectedHeaders ? headerLine + 1 : 1;
        const skippedBeforeHeader = hasDetectedHeaders ? headerLine : 0;

        const rows: Record<string, string>[] = [];
        let skippedUselessRows = 0;
        const dataRowCount = jsonData.length - startIndex;
        const { yieldEvery } = this.getAssistedCompilationBatchConfig(dataRowCount);
        let processedDataRows = 0;
        const gridParseStart = performance.now();

        for (let i = startIndex; i < jsonData.length; i++) {
            const rowData = this.resolveAssistedGridRow(jsonData[i] as any[]);
            if (!rowData || rowData.length === 0) {
                skippedUselessRows++;
                continue;
            }

            const row = this.buildAssistedRowFromGridCells(headers, rowData);

            if (!this.isUsefulAssistedTreatmentRow(row, headers)) {
                skippedUselessRows++;
                continue;
            }

            rows.push(row);
            processedDataRows++;

            if (processedDataRows % yieldEvery === 0) {
                this.setTraitementProgressNoUi(
                    `${progressLabel} : ${processedDataRows.toLocaleString('fr-FR')} / ${dataRowCount.toLocaleString('fr-FR')} ligne(s)...`
                );
                await this.yieldToMainThread(true);
            }
        }

        if (processedDataRows > 0) {
            this.setTraitementProgressNoUi(
                `${progressLabel} : ${processedDataRows.toLocaleString('fr-FR')} / ${dataRowCount.toLocaleString('fr-FR')} ligne(s) — finalisation...`
            );
            await this.yieldToMainThread(true);
        }

        const gridParseMs = performance.now() - gridParseStart;

        return {
            rows,
            headerLine,
            removedLines: skippedBeforeHeader + skippedUselessRows
        };
    }

    /** Lit toutes les feuilles Excel et fusionne les lignes utiles (rapports multi-feuilles Orange Money, etc.). */
    private async parseAssistedTreatmentWorkbook(
        workbook: XLSX.WorkBook,
        expectedHeaderColumns: string[] = []
    ): Promise<{
        rows: Record<string, string>[];
        headerLine: number;
        removedLines: number;
    }> {
        const fusionStart = performance.now();
        const sheetNames = this.getWorkbookSheetNamesWithData(workbook);
        if (!sheetNames.length) {
            return { rows: [], headerLine: 0, removedLines: 0 };
        }

        const multiSheet = sheetNames.length > 1;
        const firstSheet = workbook.Sheets?.[sheetNames[0]];
        if (!firstSheet) {
            return { rows: [], headerLine: 0, removedLines: 0 };
        }
        const firstGrid = await this.workbookSheetToGridAsync(firstSheet);
        if (!firstGrid.length) {
            return { rows: [], headerLine: 0, removedLines: 0 };
        }

        // Détecte l'en-tête (scan limité à ~300 lignes) AVANT de parser les données, pour
        // décider du meilleur chemin en un seul passage (évite de parser la feuille 1 deux fois).
        const assistedHeader = this.detectAssistedTreatmentHeader(
            this.buildAssistedHeaderDetectionGrid(firstGrid),
            expectedHeaderColumns
        );
        const headerRow = assistedHeader.headerRow.map(h => this.normalizeColumnName(h || ''));
        const hasRealHeaders = headerRow.filter(h => h.length > 0).length > 1;
        const dedupHeaders = hasRealHeaders ? deduplicateHeaderNames(headerRow) : [];
        const needsDedup = dedupHeaders.length > 0 && dedupHeaders.some(h => / \(\d+\)$/.test(h));

        let headers: string[];
        let firstRows: Record<string, string>[];
        let headerLine: number;
        let removedLines: number;

        if (needsDedup) {
            // Chemin rapide : un seul passage avec la mappe désambiguïsée (17 colonnes).
            headers = dedupHeaders;
            const startIndex = assistedHeader.headerRowIndex >= 0
                ? assistedHeader.headerRowIndex + 1
                : 1;
            const compiled = this.compileAssistedGridWithMapping(
                firstGrid,
                headers as (string | null)[],
                startIndex,
                headers,
                false
            );
            firstRows = compiled.rows;
            headerLine = assistedHeader.headerRowIndex;
            removedLines = startIndex;
        } else {
            const firstParse = await this.parseAssistedTreatmentGridAsync(
                firstGrid,
                multiSheet ? 'Fusion feuille 1' : 'Lecture Excel',
                expectedHeaderColumns
            );
            firstRows = firstParse.rows;
            headerLine = firstParse.headerLine;
            removedLines = firstParse.removedLines;
            headers = firstRows.length
                ? Object.keys(firstRows[0])
                : headerRow.filter(h => h.length > 0);
        }

        console.error(
            `[DIAG-FEUILLE] Feuille 1 "${sheetNames[0]}": ${firstRows.length} ligne(s) ${this.diagSheetStatsSuffix(firstRows)}`
        );
        if (!multiSheet) {
            return { rows: firstRows, headerLine, removedLines };
        }

        const mergedRows: Record<string, string>[] = [];
        this.appendRowsSafely(mergedRows, firstRows);

        console.error(
            `[DIAG-FEUILLE] Feuille 1 "${sheetNames[0]}" — colonnes de référence (${headers.length}): ` +
            headers.map((h, i) => `${i}=${h || '∅'}`).join('|')
        );

        for (let i = 1; i < sheetNames.length; i++) {
            const sheetName = sheetNames[i];
            this.setTraitementProgressNoUi(`Fusion feuille ${i + 1}/${sheetNames.length} : ${sheetName}`);

            const sheet = workbook.Sheets?.[sheetName];
            if (!sheet) {
                continue;
            }
            const grid = await this.workbookSheetToGridAsync(sheet);
            if (!grid.length) {
                continue;
            }

            const continuation = await this.parseAssistedTreatmentContinuationSheetAsync(
                grid,
                headers,
                assistedHeader.headerRow
            );
            this.appendRowsSafely(mergedRows, continuation.rows);
            removedLines += continuation.removedLines;
            console.error(
                `[DIAG-FEUILLE] Feuille ${i + 1} "${sheetName}": ${continuation.rows.length} ligne(s) ${this.diagSheetStatsSuffix(continuation.rows)}`
            );
            await this.yieldToMainThread();
        }

        const fusionMs = performance.now() - fusionStart;
        console.error(
            `[DIAG-TRAITEMENT] Fusion des ${sheetNames.length} feuilles : ${mergedRows.length.toLocaleString('fr-FR')} ligne(s) en ${Math.round(fusionMs)} ms`
        );
        return {
            rows: mergedRows,
            headerLine,
            removedLines
        };
    }

    private diagSheetStatsSuffix(rows: Record<string, string>[]): string {
        const statut = new Map<string, number>();
        const paiement = new Map<string, number>();
        let succStatut = 0;
        let transacPaiement = 0;
        let both = 0;

        // Les clés de colonnes sont identiques pour toutes les lignes d'une même feuille.
        // On les résout UNE fois sur un échantillon : `resolveColumnKeyInRow` normalise les
        // en-têtes et, à défaut de correspondance exacte (« Statut » / « Paiement » absents
        // du fichier), balaie TOUTES les colonnes de la ligne en normalisant chacune, puis
        // relance un second balayage par identifiant canonique bilingue — soit plusieurs
        // millisecondes par appel. Appelé ligne à ligne sur des dizaines (ou centaines) de
        // milliers de lignes, cela bloque la page pendant des minutes : le dernier message
        // affiché reste alors « … — finalisation... ».
        const sample = rows.find(r => Object.keys(r).length > 0) || rows[0] || {};
        const sKey = resolveColumnKeyInRow(sample, 'Statut');
        const pKey = resolveColumnKeyInRow(sample, 'Paiement');

        for (const row of rows) {
            const sVal = sKey ? String(row[sKey] ?? '') : '';
            const pVal = pKey ? String(row[pKey] ?? '') : '';
            if (sKey) {
                statut.set(sVal, (statut.get(sVal) ?? 0) + 1);
            }
            if (pKey) {
                paiement.set(pVal, (paiement.get(pVal) ?? 0) + 1);
            }
            if (sVal === 'Succès') {
                succStatut++;
            }
            if (pVal === 'Transaction') {
                transacPaiement++;
            }
            if (sVal === 'Succès' && pVal === 'Transaction') {
                both++;
            }
        }
        // Borné : une colonne à forte cardinalité (horodatage, référence…) produirait
        // sinon une chaîne de plusieurs mégaoctets transmise à `console.error`.
        const MAX_ENTRIES = 20;
        const fmt = (m: Map<string, number>) => {
            if (!m.size) {
                return '∅';
            }
            const parts: string[] = [];
            for (const [k, v] of m) {
                if (parts.length >= MAX_ENTRIES) {
                    break;
                }
                parts.push(`"${k}"=${v}`);
            }
            const others = m.size - parts.length;
            const shown = parts.join(', ');
            return others > 0 ? `${shown}, …(+${others} autres)` : shown;
        };
        return `| Statut: ${fmt(statut)} | Paiement: ${fmt(paiement)} | Succès=${succStatut} Transaction=${transacPaiement} BOTH=${both}`;
    }

    private async workbookSheetToGridAsync(worksheet: XLSX.WorkSheet): Promise<any[][]> {
        const extractStart = performance.now();
        const grid = XLSX.utils.sheet_to_json(worksheet, {
            header: 1,
            defval: '',
            raw: true,
            blankrows: false
        }) as any[][];
        return grid;
    }

    private workbookSheetToGrid(worksheet: XLSX.WorkSheet): any[][] {
        return XLSX.utils.sheet_to_json(worksheet, {
            header: 1,
            defval: '',
            raw: true,
            blankrows: false
        }) as any[][];
    }

    private parseAssistedTreatmentContinuationSheet(
        jsonData: any[][],
        headers: string[],
        referenceHeaderRow: string[]
    ): { rows: Record<string, string>[]; removedLines: number } {
        return this.parseAssistedTreatmentContinuationSheetSync(jsonData, headers, referenceHeaderRow);
    }

    private async parseAssistedTreatmentContinuationSheetAsync(
        jsonData: any[][],
        headers: string[],
        referenceHeaderRow: string[]
    ): Promise<{ rows: Record<string, string>[]; removedLines: number }> {
        if (!jsonData.length || !headers.length) {
            return { rows: [], removedLines: 0 };
        }

        const mapping = this.detectContinuationSheetMapping(jsonData, headers, referenceHeaderRow);
        return this.compileAssistedGridWithMappingAsync(
            jsonData,
            mapping.columnToHeader,
            mapping.dataStartIndex,
            headers,
            'Fusion feuille',
            false
        );
    }

    private parseAssistedTreatmentContinuationSheetSync(
        jsonData: any[][],
        headers: string[],
        referenceHeaderRow: string[]
    ): { rows: Record<string, string>[]; removedLines: number } {
        if (!jsonData.length || !headers.length) {
            return { rows: [], removedLines: 0 };
        }

        const mapping = this.detectContinuationSheetMapping(jsonData, headers, referenceHeaderRow);
        const compiled = this.compileAssistedGridWithMapping(
            jsonData,
            mapping.columnToHeader,
            mapping.dataStartIndex,
            headers,
            false
        );
        return {
            rows: compiled.rows,
            removedLines: mapping.dataStartIndex
        };
    }

    /**
     * Compilation rapide en un seul passage d'une grille vers des lignes mappées.
     * Pré-calcule une liste compacte des colonnes mappées (une seule fois) puis traite
     * chaque ligne dans une boucle serrée — évite les allocations/contrôles répétés par
     * colonne (String/trim, if(header)) qui ralentissaient la fusion des grandes feuilles.
     */
    private compileAssistedGridWithMapping(
        grid: any[][],
        columnToHeader: (string | null)[],
        dataStartIndex: number,
        headers: string[],
        enrich = true
    ): { rows: Record<string, string>[] } {
        const mappedCols: { idx: number; header: string }[] = [];
        for (let c = 0; c < columnToHeader.length; c++) {
            const h = columnToHeader[c];
            if (h && h.length > 0) {
                mappedCols.push({ idx: c, header: h });
            }
        }
        const colCount = mappedCols.length;
        const rows: Record<string, string>[] = [];

        for (let i = dataStartIndex; i < grid.length; i++) {
            const raw = grid[i];
            if (!Array.isArray(raw) || raw.length === 0) {
                continue;
            }
            const row: Record<string, string> = {};
            for (let m = 0; m < colCount; m++) {
                const { idx, header } = mappedCols[m];
                const v = raw[idx];
                row[header] = v !== undefined && v !== null
                    ? fixCellEncodingIfNeeded(String(v).trim())
                    : '';
            }
            if (colCount === 0 || this.isUsefulAssistedTreatmentRow(row, headers)) {
                rows.push(enrich ? enrichRowWithCanonicalFrenchColumns(row) : row);
            }
        }
        return { rows };
    }

    /** Version async : même compilation, mais avec rendu (yield) toutes les N lignes. */
    private async compileAssistedGridWithMappingAsync(
        grid: any[][],
        columnToHeader: (string | null)[],
        dataStartIndex: number,
        headers: string[],
        progressLabel: string,
        enrich = true
    ): Promise<{ rows: Record<string, string>[]; removedLines: number }> {
        const mappedCols: { idx: number; header: string }[] = [];
        for (let c = 0; c < columnToHeader.length; c++) {
            const h = columnToHeader[c];
            if (h && h.length > 0) {
                mappedCols.push({ idx: c, header: h });
            }
        }
        const colCount = mappedCols.length;
        const rows: Record<string, string>[] = [];
        let removedLines = dataStartIndex;
        const dataRowCount = grid.length - dataStartIndex;
        const { yieldEvery } = this.getAssistedCompilationBatchConfig(dataRowCount);
        let processedDataRows = 0;

        for (let i = dataStartIndex; i < grid.length; i++) {
            const raw = grid[i];
            if (!Array.isArray(raw) || raw.length === 0) {
                removedLines++;
                continue;
            }
            const row: Record<string, string> = {};
            for (let m = 0; m < colCount; m++) {
                const { idx, header } = mappedCols[m];
                const v = raw[idx];
                row[header] = v !== undefined && v !== null
                    ? fixCellEncodingIfNeeded(String(v).trim())
                    : '';
            }
            if (colCount > 0 && !this.isUsefulAssistedTreatmentRow(row, headers)) {
                removedLines++;
                continue;
            }
            if (colCount > 0) {
                rows.push(enrich ? enrichRowWithCanonicalFrenchColumns(row) : row);
            } else {
                rows.push(row);
            }
            processedDataRows++;

            if (processedDataRows % yieldEvery === 0) {
                this.setTraitementProgressNoUi(
                    `${progressLabel} : ${processedDataRows.toLocaleString('fr-FR')} / ${dataRowCount.toLocaleString('fr-FR')} ligne(s)...`
                );
                await this.yieldToMainThread(true);
            }
        }

        return { rows, removedLines };
    }

    /**
     * Détecte la ligne d'en-tête propre à la feuille (2, 3…) puis aligne chaque en-tête par NOM
     * (et non par index) : les colonnes débit/crédit restent alignées même si le tableau de la
     * feuille ne démarre pas au même décalage de colonnes que la feuille 1.
     */
    private detectContinuationSheetMapping(
        grid: any[][],
        headers: string[],
        referenceHeaderRow: string[]
    ): { dataStartIndex: number; columnToHeader: (string | null)[] } {
        const headerKeyNorm = headers.map(h => this.normalizeColumnName(h).toLowerCase());
        const refNorm = referenceHeaderRow
            .map(h => this.normalizeColumnName(h).toLowerCase())
            .filter(h => h.length > 0);

        const minMatches = Math.min(3, headerKeyNorm.length);

        const matchesHeaderKey = (cell: string): number => {
            if (!cell || !headerKeyNorm.length) {
                return 0;
            }
            if (headerKeyNorm.includes(cell)) {
                return 2;
            }
            return headerKeyNorm.some(h => h.includes(cell) || cell.includes(h)) ? 1 : 0;
        };

        // Stratégie 1 : meilleure ligne à partir des clés de la feuille 1 (exact ou sous-chaîne).
        let bestHeaderIndex = -1;
        let bestMatchCount = 0;
        let bestRowCells: string[] = [];
        for (let i = 0; i < Math.min(grid.length, 35); i++) {
            const rowCells = this.extractAssistedGridRowStrings(grid[i])
                .map(h => this.normalizeColumnName(h).toLowerCase());
            const nonEmpty = rowCells.filter(h => h.length > 0);
            if (!nonEmpty.length) {
                continue;
            }

            let score = 0;
            for (const cell of nonEmpty) {
                score += matchesHeaderKey(cell);
            }

            if (score > bestMatchCount) {
                bestMatchCount = score;
                bestHeaderIndex = i;
                bestRowCells = rowCells;
            }
            if (bestMatchCount >= refNorm.length * 2) {
                break;
            }
        }

        if (bestHeaderIndex >= 0 && bestMatchCount > 0) {
            const columnToHeader: (string | null)[] = [];
            for (let c = 0; c < bestRowCells.length; c++) {
                const cell = bestRowCells[c];
                if (!cell) {
                    columnToHeader.push(null);
                    continue;
                }
                const matchIndex = headerKeyNorm.findIndex((h, i) =>
                    h.length > 0 && (h === cell || h.includes(cell) || cell.includes(h))
                );
                columnToHeader.push(matchIndex >= 0 ? headers[matchIndex] : null);
            }

            const mappedCount = columnToHeader.filter(Boolean).length;
            if (mappedCount >= minMatches) {
                const colMap = columnToHeader
                    .map((h, i) => `${i}=${(h && h.toString()) || '∅'}`)
                    .join('|');
                console.error(
                    `[DIAG-FEUILLE] MAPPAGE continuer: cols=${mappedCount}/${columnToHeader.length} ` +
                    `(index=${bestHeaderIndex + 1}, score=${bestMatchCount}), ` +
                    `cols=${colMap}, rows0=${this.diagGridSample(grid)}`
                );
                return {
                    dataStartIndex: bestHeaderIndex + 1,
                    columnToHeader
                };
            }
        }

        // Stratégie 2 : repli positionnel — colonnes alignées EXACTEMENT comme la feuille 1.
        // Utiliser la MÊME mappe de colonnes de la feuille 1 pour garantir la cohérence.
        // maxGridCols est calculé sur un échantillon (en-tête + premières lignes de données),
        // sans parcourir les 65K lignes de la feuille.
        const sampleWindow = Math.min(60, grid.length);
        let maxGridCols = 0;
        for (let s = 0; s < sampleWindow; s++) {
            const r = grid[s];
            if (r && Array.isArray(r) && r.length > maxGridCols) {
                maxGridCols = r.length;
            }
        }
        let startGuess = bestHeaderIndex >= 0 ? bestHeaderIndex + 1 : 0;
        
        // Construire la mappe EXACTE à partir des en-têtes de la feuille 1
        // Si la grille a plus de colonnes que les en-têtes, les colonnes supplémentaires sont ignorées
        // Si la grille a moins de colonnes, on tronque aux colonnes disponibles
        const columnToHeader: (string | null)[] = [];
        for (let c = 0; c < maxGridCols; c++) {
            if (c < headers.length && headers[c] && headers[c].length > 0) {
                columnToHeader.push(headers[c]);
            } else {
                columnToHeader.push(null);
            }
        }
        
        // Ajuster le départ : chercher la première ligne qui ressemble vraiment à une donnée
        // (évite de repartir depuis le titre / les métadonnées en haut de la feuille).
        const firstProbeWindow = Math.min(40, grid.length);
        for (let k = startGuess; k < firstProbeWindow; k++) {
            const raw = grid[k] as any[] | undefined;
            if (!Array.isArray(raw) || raw.length === 0) {
                continue;
            }
            let significant = 0;
            for (let c = 0; c < columnToHeader.length && c < raw.length; c++) {
                const v = raw[c];
                const s = String(v ?? '').trim();
                if (s && s !== columnToHeader[c]) {
                    significant++;
                }
            }
            if (significant >= 2) {
                startGuess = k;
                break;
            }
        }
        
        const mappedCols = columnToHeader.filter(Boolean).length;
        console.error(
            `[DIAG-FEUILLE] MAPPAGE continuer: AUCUN en-tête fiable (score=${bestMatchCount}, refs=${refNorm.length}, cols=${maxGridCols}) → mapping positionnel FEUILLE_1 ` +
            `(headers=${headers.length}, mapped=${mappedCols}/${columnToHeader.length}, dataStart=${startGuess}), ` +
            `cols=${columnToHeader.map((h, i) => `${i}=${h || '∅'}`).join('|')}, ` +
            `rows0=${this.diagGridSample(grid)}`
        );
        return {
            dataStartIndex: startGuess,
            columnToHeader
        };
    }

    /** Échantillon compact des premières lignes utiles d'une grille pour le diagnostic. */
    private diagGridSample(grid: any[][], rows: number = 2, maxCells: number = 12): string {
        const sample = grid
            .slice(0, Math.min(rows * 2, grid.length))
            .filter(r => r && Array.isArray(r) && r.some(c => c !== null && c !== undefined && String(c).trim()))
            .slice(0, rows)
            .map(r => this.extractAssistedGridRowStrings(r).slice(0, maxCells).join('|'));
        return sample.join(' · ');
    }

    /**
     * Détecte la ligne d'en-tête (Airtel User Transaction Report, puis heuristique générale).
     */
    private detectAssistedTreatmentHeader(
        jsonData: any[][],
        expectedHeaderColumns: string[] = []
    ): {
        headerRowIndex: number;
        headerRow: string[];
        source: string;
    } {
        if (expectedHeaderColumns.length >= 2) {
            const modelHeaderIndex = findHeaderRowIndexInGrid(jsonData, expectedHeaderColumns, 80);
            if (modelHeaderIndex !== null) {
                const headerRow = this.extractAssistedGridRowStrings(jsonData[modelHeaderIndex]);
                return {
                    headerRowIndex: modelHeaderIndex,
                    headerRow,
                    source: 'modèle watch-folder'
                };
            }
        }

        const airtelHeaderIndex = this.detectAirtelUserTransactionReportHeaderIndex(jsonData);
        if (airtelHeaderIndex !== null) {
            const headerRow = this.extractAssistedGridRowStrings(jsonData[airtelHeaderIndex]);
            return {
                headerRowIndex: airtelHeaderIndex,
                headerRow,
                source: 'Airtel User Transaction Report'
            };
        }

        const orangeMoneyHeaderIndex = this.detectOrangeMoneyChannelReportHeaderIndex(jsonData);
        if (orangeMoneyHeaderIndex !== null) {
            const headerRow = this.extractAssistedGridRowStrings(jsonData[orangeMoneyHeaderIndex]);
            return {
                headerRowIndex: orangeMoneyHeaderIndex,
                headerRow,
                source: 'Orange Money Channel User Transaction Report'
            };
        }

        const merchantHeaderIndex = detectMerchantReportHeaderIndex(jsonData);
        if (merchantHeaderIndex !== null) {
            const headerRow = this.extractAssistedGridRowStrings(jsonData[merchantHeaderIndex]);
            return {
                headerRowIndex: merchantHeaderIndex,
                headerRow,
                source: 'Merchant Transaction Report (FR/EN)'
            };
        }

        const generic = this.detectExcelHeadersImproved(jsonData, true);
        return {
            headerRowIndex: generic.headerRowIndex,
            headerRow: generic.headerRow,
            source: 'détection générique'
        };
    }

    /**
     * Rapport Airtel : métadonnées sur les ~5 premières lignes, en-têtes réels ensuite
     * (ex. S. No., Transaction ID, Sender Msisdn…).
     */
    private detectAirtelUserTransactionReportHeaderIndex(jsonData: any[][]): number | null {
        const scanLimit = Math.min(12, jsonData.length);
        let isAirtelReport = false;

        for (let i = 0; i < scanLimit; i++) {
            const rowText = this.getAssistedGridRowText(jsonData[i]).toLowerCase();
            if (
                rowText.includes('user_transaction_report') ||
                rowText.includes('user transaction report')
            ) {
                isAirtelReport = true;
                break;
            }
            if (
                rowText.includes('selection criteria') &&
                (rowText.includes('from date') || rowText.includes('to date'))
            ) {
                isAirtelReport = true;
                break;
            }
        }

        if (!isAirtelReport) {
            return null;
        }

        for (let i = 0; i < Math.min(15, jsonData.length); i++) {
            const rowText = this.getAssistedGridRowText(jsonData[i]).toLowerCase();
            const hasTransactionId = rowText.includes('transaction id') || rowText.includes('transaction_id');
            const hasSerialOrSender =
                rowText.includes('s. no') ||
                rowText.includes('s.no') ||
                rowText.includes('sender msisdn') ||
                rowText.includes('sender_msisdn');
            if (hasTransactionId && hasSerialOrSender) {
                return i;
            }
        }

        // Fallback Airtel : ignorer les 5 premières lignes (ligne 6 = en-têtes)
        return jsonData.length > 5 ? 5 : null;
    }

    /**
     * Rapport Orange Money multi-feuilles (Channel User Transaction Report).
     */
    private detectOrangeMoneyChannelReportHeaderIndex(jsonData: any[][]): number | null {
        const scanLimit = Math.min(35, jsonData.length);
        let isOrangeMoneyReport = false;

        for (let i = 0; i < scanLimit; i++) {
            const rowText = fixCellEncoding(this.getAssistedGridRowText(jsonData[i])).toLowerCase();
            if (
                rowText.includes('channel user transaction') ||
                rowText.includes('compte orange money') ||
                rowText.includes('orange money') ||
                rowText.includes('rapport journalier')
            ) {
                isOrangeMoneyReport = true;
                break;
            }
        }

        if (!isOrangeMoneyReport) {
            return null;
        }

        const detected = this.detectExcelHeadersImproved(jsonData, true);
        return detected.headerRow?.some(h => h && String(h).trim()) ? detected.headerRowIndex : null;
    }

    /** Répartit les lignes CSV lues en une seule colonne (export Excel). */
    private normalizeAssistedTreatmentGrid(jsonData: any[][]): any[][] {
        return jsonData.map(row => this.normalizeAssistedTreatmentRow(row));
    }

    private async normalizeAssistedTreatmentGridAsync(jsonData: any[][]): Promise<any[][]> {
        if (jsonData.length <= 5000) {
            return this.normalizeAssistedTreatmentGrid(jsonData);
        }

        const result: any[][] = new Array(jsonData.length);
        const batchSize = 1500;
        for (let start = 0; start < jsonData.length; start += batchSize) {
            const end = Math.min(start + batchSize, jsonData.length);
            for (let i = start; i < end; i++) {
                result[i] = this.normalizeAssistedTreatmentRow(jsonData[i]);
            }
            await this.yieldToMainThread();
        }
        return result;
    }

    private normalizeAssistedTreatmentRow(row: any[]): any[] {
        if (!Array.isArray(row) || row.length === 0) {
            return row;
        }

        const nonEmptyCells = row.filter(
            cell => cell !== null && cell !== undefined && String(cell).trim() !== ''
        );

        if (nonEmptyCells.length !== 1) {
            return row;
        }

        const cellValue = String(nonEmptyCells[0]);
        const commaCount = (cellValue.match(/,/g) || []).length;
        const semicolonCount = (cellValue.match(/;/g) || []).length;

        if (commaCount + semicolonCount < 2) {
            return row;
        }

        const delimiter = semicolonCount > commaCount ? ';' : ',';
        const parsed = Papa.parse(cellValue, {
            header: false,
            delimiter,
            skipEmptyLines: false
        });

        const splitRow = parsed.data?.[0] as any[] | undefined;
        if (splitRow && splitRow.length > 1) {
            return splitRow;
        }

        return row;
    }

    private getAssistedGridRowText(row: any[] | undefined): string {
        if (!row || !row.length) {
            return '';
        }
        return row
            .map(cell => (cell !== null && cell !== undefined ? String(cell).trim() : ''))
            .filter(v => v !== '')
            .join(' ');
    }

    private extractAssistedGridRowStrings(row: any[] | undefined): string[] {
        if (!row || !row.length) {
            return [];
        }
        return row.map(cell => fixCellEncoding(cell !== null && cell !== undefined ? String(cell).trim() : ''));
    }

    /** Préambule Airtel : ne garder que les lignes à partir de l'en-tête transactionnel. */
    private stripAirtelReportPreambleFromText(text: string): string {
        const lower = text.toLowerCase();
        const isAirtel =
            lower.includes('user_transaction_report') ||
            lower.includes('user transaction report') ||
            (lower.includes('selection criteria') && lower.includes('from date'));

        if (!isAirtel) {
            return text;
        }

        const lines = text.split(/\r?\n/);
        for (let i = 0; i < Math.min(15, lines.length); i++) {
            const line = lines[i].toLowerCase();
            const hasTransactionId = line.includes('transaction id') || line.includes('transaction_id');
            const hasSerialOrSender =
                line.includes('s. no') ||
                line.includes('s.no') ||
                line.includes('sender msisdn');
            if (hasTransactionId && hasSerialOrSender) {
                return lines.slice(i).join('\n');
            }
        }

        return lines.length > 5 ? lines.slice(5).join('\n') : text;
    }

    /** Filtre les lignes vides, répétitions d'en-tête, totaux et lignes trop pauvres. */
    private isUsefulAssistedTreatmentRow(row: Record<string, string>, headers: string[]): boolean {
        // Un seul passage : compte les valeurs non vides, détecte les répétitions d'en-tête
        // et construit la chaîne jointe pour les motifs de métadonnées/pied de page.
        let nonEmpty = 0;
        let headerMatches = 0;
        const joinedParts: string[] = [];
        const headerMatchThreshold = Math.min(3, headers.length);

        for (let i = 0; i < headers.length; i++) {
            const h = headers[i];
            const cell = (row[h] ?? '').toString().trim();
            if (cell) {
                nonEmpty++;
                joinedParts.push(cell.toLowerCase());
                if (cell.toLowerCase() === h.toLowerCase()) {
                    headerMatches++;
                }
            }
        }

        if (nonEmpty === 0) {
            return false;
        }
        if (headerMatches >= headerMatchThreshold) {
            return false;
        }
        if (headers.length >= 4 && nonEmpty < 2) {
            return false;
        }

        const joined = joinedParts.join(' ');
        if (/user_transaction_report|user transaction report/.test(joined)) {
            return false;
        }
        if (/^(selection criteria|from date\s*:|to date\s*:)/.test(joined)) {
            return false;
        }
        if (/^(total\b|totaux\b|sous[- ]?total|grand total|nombre de lignes|nb de lignes)/.test(joined)) {
            return false;
        }
        if (/^(report generated|généré le|genere le|page \d+\s*\/\s*\d+$|fin du rapport|^---+$)/.test(joined)) {
            return false;
        }

        return true;
    }

    private buildProcessedOutputFileName(model: AutoProcessingModel, originalFile: File): string {
        const pattern = (model.filePattern || model.name || 'modele').trim();
        const patternDotIndex = pattern.lastIndexOf('.');
        const rawBase = patternDotIndex > 0 ? pattern.substring(0, patternDotIndex) : pattern;
        const base = this.sanitizePatternBaseForFileName(rawBase);
        const ext = patternDotIndex > 0
            ? pattern.substring(patternDotIndex).replace(/[*?]/g, '')
            : (() => {
                const originalDotIndex = originalFile.name.lastIndexOf('.');
                return originalDotIndex > 0 ? originalFile.name.substring(originalDotIndex) : '.csv';
            })();
        const dateSuffix = this.formatDateForFileName(this.traitementOutputDate);
        const nameSuffix = this.sanitizeFileNameSegment(this.traitementOutputNameSuffix);
        const fileBase = nameSuffix ? `${base}_${nameSuffix}_${dateSuffix}` : `${base}_${dateSuffix}`;
        return `${fileBase}${ext}`;
    }

    /** Nettoie un segment de nom de fichier (texte optionnel saisi par l'utilisateur). */
    private sanitizeFileNameSegment(segment: string): string {
        const cleaned = (segment || '')
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/[\\/:*?"<>|]/g, '')
            .replace(/\s+/g, '_')
            .replace(/[_\-.]{2,}/g, '_')
            .replace(/^[_\-.]+|[_\-.]+$/g, '')
            .trim();
        return cleaned;
    }

    /** Retire les wildcards du pattern (*, ?) pour produire un nom de fichier réel. */
    private sanitizePatternBaseForFileName(patternBase: string): string {
        const cleaned = patternBase
            .replace(/[*?]/g, '')
            .replace(/[_\-.]{2,}/g, '_')
            .replace(/^[_\-.]+|[_\-.]+$/g, '')
            .trim();
        return cleaned || 'modele';
    }

    private removeDuplicateTreatmentRows(rows: Record<string, string>[]): {
        uniqueRows: Record<string, string>[];
        duplicatesRemoved: number;
    } {
        const seen = new Set<string>();
        const uniqueRows: Record<string, string>[] = [];
        let duplicatesRemoved = 0;

        const orderedKeys = Object.keys(rows[0]);

        for (const row of rows) {
            const key = this.buildTreatmentRowDedupKey(row, orderedKeys);
            if (seen.has(key)) {
                duplicatesRemoved++;
                continue;
            }
            seen.add(key);
            uniqueRows.push(row);
        }

        if (duplicatesRemoved > 0) {
        }

        return { uniqueRows, duplicatesRemoved };
    }

    private async removeDuplicateTreatmentRowsAsync(rows: Record<string, string>[]): Promise<{
        uniqueRows: Record<string, string>[];
        duplicatesRemoved: number;
    }> {
        if (!rows.length) {
            return { uniqueRows: [], duplicatesRemoved: 0 };
        }

        const seen = new Set<string>();
        const uniqueRows: Record<string, string>[] = [];
        let duplicatesRemoved = 0;
        const orderedKeys = Object.keys(rows[0]);
        const batchSize = rows.length > 100000 ? 20000 : rows.length <= 8000 ? rows.length : 5000;

        for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            const key = this.buildTreatmentRowDedupKey(row, orderedKeys);
            if (seen.has(key)) {
                duplicatesRemoved++;
            } else {
                seen.add(key);
                uniqueRows.push(row);
            }

            if (batchSize < rows.length && i > 0 && i % batchSize === 0) {
                await this.yieldToMainThread(true);
            }
        }

        if (duplicatesRemoved > 0) {
        }

        return { uniqueRows, duplicatesRemoved };
    }

    private buildTreatmentRowDedupKey(row: Record<string, string>, orderedKeys: string[]): string {
        let key = '';
        for (let i = 0; i < orderedKeys.length; i++) {
            const k = orderedKeys[i];
            key += `${row[k] ?? ''}\u0001`;
        }
        return key;
    }

    private getAssistedXlsxReadOptions(fileSizeMB: number): XLSX.ParsingOptions {
        if (fileSizeMB > 1) {
            return {
                type: 'array',
                cellDates: false,
                cellNF: false,
                cellText: false,
                sheetStubs: false,
                dense: true,
                cellStyles: false,
                cellHTML: false,
                cellFormula: false,
                raw: true,
                codepage: 65001
            };
        }
        return {
            type: 'array',
            cellDates: true,
            raw: true
        };
    }

    private yieldToMainThread(light = false): Promise<void> {
        return new Promise(resolve => {
            requestAnimationFrame(() => setTimeout(resolve, light ? 0 : 1));
        });
    }

    /** Met à jour la barre de progression (modal assisté ou panneau /traitement) sans bloquer le thread UI. */
    private async updateTraitementProgress(
        message: string,
        options?: { force?: boolean; skipYield?: boolean }
    ): Promise<void> {
        this.traitementProgressMessage = message;
        if (this.embedTraitementSection) {
            this.embedTraitementProgress.emit(message);
        }

        const now = performance.now();
        const force = options?.force ?? false;
        if (force || now - this.treatmentProgressLastUi > 80) {
            this.ngZone.run(() => this.cd.detectChanges());
            this.treatmentProgressLastUi = now;
        }

        if (!options?.skipYield) {
            await this.yieldToMainThread(true);
        }

        // Publier la progression dans le service de fond pour survie à la navigation
        this.traitementBackgroundService.updateProgress(message);
    }

    /** DetectChanges sans risque « ViewDestroyed » quand le composant a été quitté. */
    private safeTraitementDetectChanges(): void {
        if (!this.traitementViewDestroyed) {
            this.ngZone.run(() => this.cd.detectChanges());
        }
    }

    /**
     * Met à jour la progression et publie dans le service de fond SANS déclencher
     * le change-detection Angular (utilisé pendant la lecture de fichiers, en boucle
     * locale, quand la vue peut être détruite).
     */
    private setTraitementProgressNoUi(message: string): void {
        this.traitementProgressMessage = message;
        this.traitementBackgroundService.updateProgress(message);
        this.safeTraitementDetectChanges();
    }

    private buildColumnValueCounts(
        data: Record<string, string>[],
        column: string | null
    ): Record<string, number> {
        const counts: Record<string, number> = {};
        if (!column || !data?.length) {
            return counts;
        }
        for (let i = 0; i < data.length; i++) {
            const value = data[i][column];
            if (value == null || !String(value).trim()) {
                continue;
            }
            const key = String(value);
            counts[key] = (counts[key] ?? 0) + 1;
        }
        return counts;
    }

    private extractUniqueSortedValuesWithCounts(
        data: Record<string, string>[],
        column: string | null
    ): { values: string[]; counts: Record<string, number> } {
        const counts = this.buildColumnValueCounts(data, column);
        return { values: Object.keys(counts).sort(), counts };
    }

    private assignPartnerServiceSelectionData(data: Record<string, string>[]): void {
        this.partnerServiceSelectionData = data;
        this.partnerServiceCounts = this.buildColumnValueCounts(data, this.partnerServiceColumn);
    }

    private assignPartnerStatusSelectionData(data: Record<string, string>[]): void {
        this.partnerStatusSelectionData = data;
        this.partnerStatusCounts = this.buildColumnValueCounts(data, this.partnerStatusColumn);
    }

    private assignPartnerPaymentSelectionData(data: Record<string, string>[]): void {
        this.partnerPaymentSelectionData = data;
        this.partnerPaymentCounts = this.buildColumnValueCounts(data, this.partnerPaymentColumn);
    }

    private async filterRowsByColumnValuesAsync(
        data: Record<string, string>[],
        column: string,
        allowed: string[],
        onProgress?: (done: number, total: number) => void
    ): Promise<Record<string, string>[]> {
        if (!data?.length || !column || !allowed.length) {
            return [];
        }
        const allowedSet = new Set(allowed);
        const batchSize = data.length > 100000 ? 20000 : 10000;
        const result: Record<string, string>[] = [];
        for (let start = 0; start < data.length; start += batchSize) {
            const end = Math.min(start + batchSize, data.length);
            for (let i = start; i < end; i++) {
                const row = data[i];
                if (allowedSet.has(row[column])) {
                    result.push(row);
                }
            }
            onProgress?.(end, data.length);
            if (end < data.length) {
                await this.yieldToMainThread(true);
            }
        }
        return result;
    }

    private isFullValueSelection(selected: string[], available: string[]): boolean {
        if (!selected.length || selected.length !== available.length) {
            return false;
        }
        const set = new Set(selected);
        return available.every(v => set.has(v));
    }

    private shouldSkipCsvNormalize(source: 'csv' | 'excel' | null): boolean {
        return source === 'csv';
    }

    private async filterPartnerRowsOrPassthrough(
        data: Record<string, string>[],
        column: string,
        selected: string[],
        available: string[],
        progressLabel: string
    ): Promise<Record<string, string>[]> {
        if (this.isFullValueSelection(selected, available)) {
            return data;
        }
        return this.filterRowsByColumnValuesAsync(data, column, selected, (done, total) => {
            this.processingMessage = `${progressLabel} : ${done.toLocaleString('fr-FR')} / ${total.toLocaleString('fr-FR')}...`;
            this.cd.detectChanges();
        });
    }

    private async finalizePartnerSelectionData(
        data: Record<string, string>[],
        progressPrefix: string
    ): Promise<Record<string, string>[]> {
        let working = data;
        if (!this.shouldSkipCsvNormalize(this.autoPartnerSourceFormat)) {
            working = await this.normalizeDataAsync(working, (done, total) => {
                this.processingMessage = `${progressPrefix} — normalisation : ${done.toLocaleString('fr-FR')} / ${total.toLocaleString('fr-FR')}...`;
                this.cd.detectChanges();
            });
        }
        await this.convertDebitCreditToNumberAsync(working, (done, total) => {
            this.processingMessage = `${progressPrefix} — finalisation : ${done.toLocaleString('fr-FR')} / ${total.toLocaleString('fr-FR')}...`;
            this.cd.detectChanges();
        });
        await this.yieldToMainThread(true);
        return working;
    }

    private async prepareAutoReconciliationData(
        boData: Record<string, string>[],
        partnerData: Record<string, string>[],
        onProgress: (message: string) => void
    ): Promise<{ bo: Record<string, string>[]; partner: Record<string, string>[] }> {
        let bo = boData;
        let partner = partnerData;

        if (!this.shouldSkipCsvNormalize(this.autoBoSourceFormat)) {
            onProgress('Normalisation du fichier BO...');
            bo = await this.normalizeDataAsync(bo, (done, total) => {
                onProgress(`Normalisation BO : ${done.toLocaleString('fr-FR')} / ${total.toLocaleString('fr-FR')}...`);
            });
        }

        if (!this.shouldSkipCsvNormalize(this.autoPartnerSourceFormat)) {
            onProgress('Normalisation du fichier Partenaire...');
            partner = await this.normalizeDataAsync(partner, (done, total) => {
                onProgress(`Normalisation Partenaire : ${done.toLocaleString('fr-FR')} / ${total.toLocaleString('fr-FR')}...`);
            });
        }

        await this.yieldToMainThread(true);
        return { bo, partner };
    }

    /** Laisse l'UI afficher la progression avant l'appel synchrone XLSX.read. */
    private readAssistedXlsxWorkbook(data: Uint8Array, fileSizeMB: number): Promise<XLSX.WorkBook> {
        return new Promise((resolve, reject) => {
            setTimeout(() => {
                try {
                    resolve(XLSX.read(data, this.getAssistedXlsxReadOptions(fileSizeMB)));
                } catch (error) {
                    reject(error);
                }
            }, fileSizeMB > 10 ? 100 : 0);
        });
    }

    private getResolvedAutoBoFileName(): string {
        return this.autoBoFile?.name || this.autoBoFileName || '';
    }

    private getResolvedAutoPartnerFileName(): string {
        return this.autoPartnerFile?.name || this.autoPartnerFileName || '';
    }

    private async rememberPartnerModelFromFileName(fileName: string): Promise<void> {
        if (!fileName) {
            return;
        }
        try {
            const models = await this.autoProcessingService.getAllModelsUnrestricted();
            const match = models.find(m =>
                (m.fileType === 'partner' || m.fileType === 'both') &&
                this.matchesFilePattern(fileName, m.filePattern)
            );
            const matchId = match?.id || match?.modelId;
            if (matchId) {
                this.assistedPartnerReconciliationModelId = matchId;
            }
        } catch (error) {
        }
    }

    private async getTraitementColumnRules(modelId: string): Promise<ColumnProcessingRule[]> {
        const cached = this.traitementColumnRulesCache.get(modelId);
        if (cached) {
            return cached;
        }
        const rules = await this.autoProcessingService.getColumnProcessingRules(
            modelId,
            AutoProcessingService.RECONCILIATION_MODULE
        );
        this.traitementColumnRulesCache.set(modelId, rules);
        return rules;
    }

    private async stripKeyColumnWhitespaceAsync(rows: Record<string, string>[]): Promise<Record<string, string>[]> {
        if (rows.length <= 20000) {
            return this.stripKeyColumnWhitespace(rows);
        }

        const keyColumns = this.resolveKeyColumnsForWhitespace(rows[0]);
        if (!keyColumns.length) {
            return rows;
        }

        const batchSize = rows.length > 100000 ? 10000 : 5000;
        for (let start = 0; start < rows.length; start += batchSize) {
            const end = Math.min(start + batchSize, rows.length);
            this.stripKeyColumnWhitespaceInRange(rows, keyColumns, start, end);
            await this.yieldToMainThread(true);
        }
        return rows;
    }

    private resolveKeyColumnsForWhitespace(sampleRow: Record<string, string> | undefined): string[] {
        if (!sampleRow) {
            return [];
        }
        const keyPatterns = ['cle', 'key', 'reference', 'referenceid', 'idtransaction', 'reconciliation'];
        const columns: string[] = [];
        for (const col of Object.keys(sampleRow)) {
            const lower = col.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '');
            if (keyPatterns.some(k => lower === k || lower.includes(k)) && !isTransactionIdPreserveColumn(col)) {
                columns.push(col);
            }
        }
        return columns;
    }

    private stripKeyColumnWhitespaceInRange(
        rows: Record<string, string>[],
        keyColumns: string[],
        start: number,
        end: number
    ): void {
        for (let i = start; i < end; i++) {
            const row = rows[i];
            for (const col of keyColumns) {
                if (Object.prototype.hasOwnProperty.call(row, col)) {
                    row[col] = stripAllWhitespace(row[col]);
                }
            }
        }
    }

    private stripKeyColumnWhitespace(rows: Record<string, string>[]): Record<string, string>[] {
        if (!rows.length) {
            return rows;
        }
        const keyColumns = this.resolveKeyColumnsForWhitespace(rows[0]);
        if (!keyColumns.length) {
            return rows;
        }
        this.stripKeyColumnWhitespaceInRange(rows, keyColumns, 0, rows.length);
        return rows;
    }

    private async downloadProcessedTreatmentFile(
        data: Record<string, string>[],
        outputBaseName: string,
        options?: { skipNormalize?: boolean; columns?: string[] }
    ): Promise<void> {
        let exportRows = data;
        if (!options?.skipNormalize && data.length > 3000) {
            exportRows = await this.normalizeDataAsync(data, async (done, total) => {
                await this.updateTraitementProgress(
                    `Préparation export : ${done.toLocaleString('fr-FR')} / ${total.toLocaleString('fr-FR')} ligne(s)...`
                );
            });
        } else if (!options?.skipNormalize) {
            exportRows = this.normalizeData(data);
        }

        const columns = options?.columns?.length
            ? options.columns
            : this.getColumnsFromData(exportRows);
        const lowerName = outputBaseName.toLowerCase();
        const exportOptions = {
            chunkSize: exportRows.length > 100000 ? 5000 : exportRows.length > 20000 ? 2000 : 1000,
            onProgress: async (progress: { current: number; total: number }) => {
                await this.updateTraitementProgress(
                    `Téléchargement : ${progress.current.toLocaleString('fr-FR')} / ${progress.total.toLocaleString('fr-FR')} ligne(s)...`
                );
            },
            yieldFn: () => this.yieldToMainThread(true)
        };

        if (this.isExcelFile(lowerName)) {
            const format = lowerName.endsWith('.xls') ? 'xls' : 'xlsx';
            await this.exportOptimizationService.exportExcelOptimized(
                exportRows,
                columns,
                outputBaseName,
                { format, ...exportOptions }
            );
        } else {
            await this.exportOptimizationService.exportCSVOptimized(
                exportRows,
                columns,
                outputBaseName,
                exportOptions
            );
        }
    }

    private assignProcessedTreatmentData(
        data: Record<string, string>[],
        fileName: string,
        side: 'bo' | 'partner',
        modelId?: string
    ): void {
        void this.assignProcessedTreatmentDataAsync(data, fileName, side, modelId);
    }

    private async assignProcessedTreatmentDataAsync(
        data: Record<string, string>[],
        fileName: string,
        side: 'bo' | 'partner',
        modelId?: string
    ): Promise<void> {
        const treatedFormat: 'csv' | 'excel' = 'csv';
        if (side === 'bo') {
            this.autoBoSourceFormat = treatedFormat;
            this.autoBoData = data;
            this.autoBoFile = null;
            this.autoBoFileName = fileName;
            if (modelId) {
                this.assistedBoTreatmentModelId = modelId;
            }

            await this.yieldToMainThread(true);
            if (await this.detectTRXBOAndExtractServicesAsync(this.autoBoData)) {
                if (this.availableAgencies.length > 0) {
                    this.showAgencySelectionStep();
                } else {
                    this.showServiceSelectionStep();
                }
            }
        } else {
            this.autoPartnerSourceFormat = treatedFormat;
            this.autoPartnerData = data;
            this.autoPartnerFile = null;
            this.autoPartnerFileName = fileName;
            if (modelId) {
                this.assistedPartnerReconciliationModelId = modelId;
            }

            await this.convertDebitCreditToNumberAsync(this.autoPartnerData);
            await this.yieldToMainThread(true);
            await this.handleAutoPartnerSelectionFlowAsync();
        }

        this._canProceedCache = null;
        this.ngZone.run(() => this.cd.detectChanges());
    }

    private collectUniqueColumnValues(
        data: Record<string, string>[],
        column: string
    ): string[] {
        const seen = new Set<string>();
        for (let i = 0; i < data.length; i++) {
            const value = data[i][column];
            if (value !== undefined && value !== null && String(value).trim()) {
                seen.add(String(value).trim());
            }
        }
        return [...seen].sort();
    }

    private async collectUniqueColumnValuesAsync(
        data: Record<string, string>[],
        column: string
    ): Promise<string[]> {
        if (data.length <= 5000) {
            return this.collectUniqueColumnValues(data, column);
        }

        const seen = new Set<string>();
        const batchSize = 5000;
        for (let start = 0; start < data.length; start += batchSize) {
            const end = Math.min(start + batchSize, data.length);
            for (let i = start; i < end; i++) {
                const value = data[i][column];
                if (value !== undefined && value !== null && String(value).trim()) {
                    seen.add(String(value).trim());
                }
            }
            await this.yieldToMainThread(true);
        }
        return [...seen].sort();
    }

    private async detectTRXBOAndExtractServicesAsync(data: Record<string, string>[]): Promise<boolean> {
        if (!data?.length) {
            return false;
        }

        const columns = Object.keys(data[0]);
        const hasServiceColumn = columns.some(col => {
            const lower = col.toLowerCase();
            return lower.includes('service') || lower.includes('serv');
        });
        if (!hasServiceColumn) {
            return false;
        }

        const agencyColumn = columns.find(col => {
            const lower = col.toLowerCase();
            return lower.includes('agence') || lower.includes('agency');
        });

        if (agencyColumn) {
            this.availableAgencies = await this.collectUniqueColumnValuesAsync(data, agencyColumn);
            this.agencySelectionData = data;
            this.agencyColumn = agencyColumn;
            return true;
        }

        return this.extractServicesFromTRXBOAsync(data);
    }

    private async extractServicesFromTRXBOAsync(data: Record<string, string>[]): Promise<boolean> {
        if (!data?.length) {
            return false;
        }

        const columns = Object.keys(data[0]);
        const serviceColumn = columns.find(col => {
            const lower = col.toLowerCase();
            return lower.includes('service') || lower.includes('serv');
        });
        const statusColumn = columns.find(col => {
            const lower = col.toLowerCase();
            return lower.includes('statut') || lower.includes('status') || lower.includes('état') || lower.includes('state');
        });
        this.autoStatusColumn = statusColumn || null;

        if (!serviceColumn) {
            return false;
        }

        this.availableServices = await this.collectUniqueColumnValuesAsync(data, serviceColumn);
        this.serviceSelectionData = data;
        return true;
    }

    private async handleAutoPartnerSelectionFlowAsync(): Promise<void> {
        const detected = await this.detectPartnerServiceTypeAndStatusAsync(this.autoPartnerData);
        if (detected === 'agency') {
            this.showPartnerAgencySelectionStep();
        } else if (detected === 'services') {
            this.showPartnerServiceSelectionStep();
        }
    }

    private async detectPartnerServiceTypeAndStatusAsync(
        data: Record<string, string>[]
    ): Promise<false | 'agency' | 'services'> {
        if (!data?.length) {
            return false;
        }

        this.partnerAgencyColumn = null;
        this.partnerAgencySelectionData = [];
        this.partnerAvailableAgencies = [];
        this.partnerServiceSelectionData = [];
        this.partnerServiceCounts = {};
        this.partnerAvailableServices = [];

        const columns = Object.keys(data[0]);
        const serviceColumn = columns.find(col => {
            const colLower = col.toLowerCase();
            return colLower.includes('service') || colLower.includes('serv') || colLower.includes('type');
        });
        const statusColumn = columns.find(col => {
            const colLower = col.toLowerCase();
            return colLower.includes('statut') || colLower.includes('status') || colLower.includes('état')
                || colLower.includes('généré le') || colLower.includes('genere le');
        });
        const agencyColumn = columns.find(col => {
            const lower = col.toLowerCase();
            return lower.includes('agence') || lower.includes('agency');
        });

        if (!serviceColumn) {
            return false;
        }

        this.partnerServiceColumn = serviceColumn;
        this.partnerStatusColumn = statusColumn || null;

        if (agencyColumn) {
            const agencies = await this.collectUniqueColumnValuesAsync(data, agencyColumn);
            if (agencies.length > 0) {
                this.partnerAvailableAgencies = agencies;
                this.partnerAgencySelectionData = data;
                this.partnerAgencyColumn = agencyColumn;
                return 'agency';
            }
        }

        this.partnerAvailableServices = await this.collectUniqueColumnValuesAsync(data, serviceColumn);
        this.assignPartnerServiceSelectionData(data);
        return 'services';
    }

    private readAssistedTreatmentFileRows(
        file: File,
        expectedHeaderColumns: string[] = []
    ): Promise<{
        rows: Record<string, string>[];
        headerLine: number;
        removedLines: number;
    }> {
        const fileName = file.name.toLowerCase();

        if (fileName.endsWith('.csv')) {
            return this.readAssistedTreatmentCsvFileFast(file, expectedHeaderColumns);
        }

        if (this.isExcelFile(fileName)) {
            return this.readAssistedTreatmentExcelFile(file, expectedHeaderColumns);
        }

        return Promise.reject(new Error('Format non supporté. Utilisez CSV ou Excel.'));
    }

    /**
     * Lecture CSV ultra-rapide — PapaParse + Web Worker pour les gros fichiers.
     */
    private async readAssistedTreatmentCsvFileFast(
        file: File,
        expectedHeaderColumns: string[] = []
    ): Promise<{
        rows: Record<string, string>[];
        headerLine: number;
        removedLines: number;
    }> {
        return readCsvFileUltraFast(file, {
            stripAirtelPreamble: true,
            expectedHeaderColumns,
            normalizeHeader: (header, index) =>
                this.normalizeColumnName(header || `Col${index + 1}`),
            onProgress: (processed, total) => {
                if (processed % 2500 === 0) {
                    this.setTraitementProgressNoUi(
                        `Lecture CSV : ${processed.toLocaleString('fr-FR')} / ${total.toLocaleString('fr-FR')} ligne(s)...`
                    );
                }
            },
            yieldFn: () => this.yieldToMainThread(true)
        });
    }

    private async readAssistedTreatmentExcelFile(
        file: File,
        expectedHeaderColumns: string[] = []
    ): Promise<{
        rows: Record<string, string>[];
        headerLine: number;
        removedLines: number;
    }> {
        const fileSizeMB = file.size / (1024 * 1024);
        this.setTraitementProgressNoUi(
            fileSizeMB > 5
                ? `Lecture Excel (${fileSizeMB.toFixed(0)} Mo) : ${file.name}...`
                : `Lecture Excel : ${file.name}...`
        );

        try {
            const arrayBuffer = await this.readFileAsArrayBuffer(file);
            await this.yieldToMainThread();

            const data = new Uint8Array(arrayBuffer);
            this.setTraitementProgressNoUi(
                fileSizeMB > 5
                    ? `Analyse Excel (${fileSizeMB.toFixed(0)} Mo) — veuillez patienter...`
                    : `Analyse Excel : ${file.name}...`
            );
            await this.yieldToMainThread();

            const xlsxStart = performance.now();
            const workbook = await this.readAssistedXlsxWorkbook(data, fileSizeMB);
            if (!workbook.SheetNames?.length) {
                throw new Error('Aucune feuille Excel trouvée');
            }

            await this.yieldToMainThread();
            const workbookStart = performance.now();
            const parsed = await this.parseAssistedTreatmentWorkbook(workbook, expectedHeaderColumns);
            return parsed;
        } catch (error) {
            throw error instanceof Error ? error : new Error(String(error));
        }
    }

    /** Réhydrate la logique de rapprochement choisie précédemment (mode manuel uniquement). */
    private restoreManualReconciliationType(): void {
        if (this.isAssistedLike) {
            this.manualLogicMode = 'standard';
            this.reconciliationType = '1-1';
            return;
        }
        const storedType = this.appStateService.getReconciliationType();
        if (storedType === '1-1') {
            this.manualLogicMode = 'standard';
            this.reconciliationType = '1-1';
        } else {
            this.manualLogicMode = 'ratio';
            this.reconciliationType = storedType;
        }
    }

    /** Le sélecteur de logique n'est proposé qu'en mode manuel (hors certification). */
    get showManualLogicSelector(): boolean {
        return this.reconciliationMode === 'manual' && !this.isAssistedLike;
    }

    get isRatioLogicMode(): boolean {
        return this.manualLogicMode === 'ratio';
    }

    onManualLogicModeChange(mode: 'standard' | 'ratio' | 'custom'): void {
        this.manualLogicMode = mode;
        if (mode === 'ratio') {
            if (this.reconciliationType === '1-1') {
                this.reconciliationType = '1-2';
            }
        } else {
            // « Standard » et « Personnalisée » s'appuient toutes deux sur le chemin 1-1 :
            // la logique personnalisée est portée par les colonnes de comparaison et les clés
            // supplémentaires choisies à l'étape suivante.
            this.reconciliationType = '1-1';
        }
        this.persistManualReconciliationType();
    }

    onReconciliationRatioChange(type: string): void {
        const ratio = type as '1-2' | '1-3' | '1-4' | '1-5';
        if (!this.reconciliationRatioOptions.includes(ratio)) {
            return;
        }
        this.manualLogicMode = 'ratio';
        this.reconciliationType = ratio;
        this.persistManualReconciliationType();
    }

    onCustomRatioChange(event: Event): void {
        const input = event.target as HTMLInputElement;
        this.customRatio = input.value.trim();
        // Mettre à jour le type de réconciliation pour refléter le ratio personnalisé
        this.reconciliationType = this.customRatio as any;
        this.persistManualReconciliationType();
    }

    onCustomToleranceChange(event: Event): void {
        const input = event.target as HTMLInputElement;
        const value = parseFloat(input.value);
        if (!isNaN(value) && value >= 0 && value <= 1) {
            this.customTolerance = value;
        }
    }

    private persistManualReconciliationType(): void {
        if (this.isAssistedLike) {
            return;
        }
        this.appStateService.setReconciliationType(this.reconciliationType);
        this.updateEstimatedTime();
    }

    private updateEstimatedTime(): void {
        // Ne calculer l'estimation que si les deux fichiers sont chargés
        if (!this.boFile || !this.partnerFile) {
            this.estimatedTime = '';
            return;
        }

        const totalRows = this.boData.length + this.partnerData.length;
        if (totalRows === 0) {
            this.estimatedTime = '';
            return;
        }

        // Estimation basée sur le nombre total de lignes
        // On suppose une moyenne de 5000 lignes par seconde
        const estimatedSeconds = Math.ceil(totalRows / 5000);
        
        if (estimatedSeconds < 60) {
            this.estimatedTime = `${estimatedSeconds} seconde${estimatedSeconds > 1 ? 's' : ''}`;
        } else {
            const minutes = Math.floor(estimatedSeconds / 60);
            const seconds = estimatedSeconds % 60;
            this.estimatedTime = `${minutes} minute${minutes > 1 ? 's' : ''} ${seconds > 0 ? `et ${seconds} seconde${seconds > 1 ? 's' : ''}` : ''}`;
        }
    }

    onBoFileSelected(event: Event): void {
        const input = event.target as HTMLInputElement;
        if (input.files?.length) {
            this.boFile = input.files[0];
            
            if (this.reconciliationMode === 'manual') {
                // Mode manuel: pas de traitement automatique
                this.processManualBoFile(this.boFile);
            } else {
                // Mode automatique: utiliser le traitement automatique
                this.processFileWithAutoProcessing(this.boFile, 'bo');
            }
        }
    }

    onPartnerFileSelected(event: Event): void {
        const input = event.target as HTMLInputElement;
        if (input.files?.length) {
            this.partnerFile = input.files[0];
            
            if (this.reconciliationMode === 'manual') {
                // Mode manuel: pas de traitement automatique
                this.parseFile(this.partnerFile, false);
            } else {
                // Mode automatique: utiliser le traitement automatique
                this.processFileWithAutoProcessing(this.partnerFile, 'partner');
            }
        }
    }

    // Méthodes de suppression des fichiers
    removeBoFile(event: Event): void {
        event.stopPropagation(); // Empêcher le déclenchement du clic sur le conteneur
        this.boFile = null;
        this.boData = [];
        this.estimatedTime = '';
        this.updateEstimatedTime();
        this.clearCachesOnFileRemoval('bo');
        this.resetFileInput(this.boFileInputRef);
    }

    removePartnerFile(event: Event): void {
        event.stopPropagation(); // Empêcher le déclenchement du clic sur le conteneur
        this.partnerFile = null;
        this.partnerData = [];
        this.estimatedTime = '';
        this.updateEstimatedTime();
        this.clearCachesOnFileRemoval('partner');
        this.resetFileInput(this.partnerFileInputRef);
    }

    removeAutoBoFile(event: Event): void {
        event.stopPropagation(); // Empêcher le déclenchement du clic sur le conteneur
        this.autoBoFile = null;
        this.autoBoData = [];
        this.autoBoFileName = '';
        this.autoBoSourceFormat = null;
        this.assistedBoTreatmentModelId = null;
        this.clearCachesOnFileRemoval('bo');
        this.resetFileInput(this.autoBoFileInputRef);
    }

    removeAutoPartnerFile(event: Event): void {
        event.stopPropagation(); // Empêcher le déclenchement du clic sur le conteneur
        this.autoPartnerFile = null;
        this.autoPartnerData = [];
        this.autoPartnerFileName = '';
        this.autoPartnerSourceFormat = null;
        this.assistedPartnerReconciliationModelId = null;
        this.clearCachesOnFileRemoval('partner');
        this.resetFileInput(this.autoPartnerFileInputRef);
    }

    /**
     * Réinitialise l'input file pour permettre de re-sélectionner le même fichier
     */
    private resetFileInput(inputRef?: ElementRef<HTMLInputElement>): void {
        if (inputRef?.nativeElement) {
            inputRef.nativeElement.value = '';
        }
    }

    /** Réinitialise l'écran de chargement (nouvelle réconciliation). */
    private resetUploadSession(): void {
        this.boFile = null;
        this.partnerFile = null;
        this.boData = [];
        this.partnerData = [];
        this.autoBoFile = null;
        this.autoPartnerFile = null;
        this.autoBoData = [];
        this.autoPartnerData = [];
        this.autoBoFileName = '';
        this.autoPartnerFileName = '';
        this.assistedBoTreatmentModelId = null;
        this.assistedPartnerReconciliationModelId = null;
        this.estimatedTime = '';
        this.errorMessage = '';
        this.successMessage = '';
        this.loading = false;
        this.showReconciliationProgress = false;
        this._canProceedCache = null;

        this.clearCachesOnFileRemoval('bo');
        this.clearCachesOnFileRemoval('partner');

        this.resetFileInput(this.boFileInputRef);
        this.resetFileInput(this.partnerFileInputRef);
        this.resetFileInput(this.autoBoFileInputRef);
        this.resetFileInput(this.autoPartnerFileInputRef);
        this.closeTraitementModal(true);
        this.reconciliationService.clearData();
        this.reconciliationTabsService.clearAllData();
        this.cd.detectChanges();
    }

    /**
     * Nettoie tous les caches (AppStateService, caches locaux) lors de la suppression d'un fichier.
     * Permet d'éviter d'utiliser des données obsolètes sans actualiser la page.
     */
    private clearCachesOnFileRemoval(fileType: 'bo' | 'partner'): void {
        // Vider le cache AppStateService (données de réconciliation et fichiers)
        this.appStateService.clearData();

        // Invalider le cache canProceed
        this._canProceedCache = null;

        // Réinitialiser les sélections dérivées des fichiers BO
        if (fileType === 'bo') {
            this.availableAgencies = [];
            this.selectedAgencies = [];
            this.agencySelectionData = [];
            this.agencyColumn = null;
            this.availableServices = [];
            this.selectedServices = [];
            this.serviceSelectionData = [];
            this.manualAvailableServices = [];
            this.manualSelectedServices = [];
            this.manualServiceSelectionData = [];
            this.manualStatusColumn = null;
            this.manualAvailableStatuses = [];
            this.manualSelectedStatuses = [];
            this.manualStatusSelectionData = [];
        }

        // Réinitialiser les sélections dérivées des fichiers Partenaire
        if (fileType === 'partner') {
            this.partnerAvailableServices = [];
            this.partnerSelectedServices = [];
            this.partnerServiceSelectionData = [];
            this.partnerServiceCounts = {};
            this.partnerServiceColumn = null;
            this.partnerStatusColumn = null;
            this.partnerAvailableStatuses = [];
            this.partnerSelectedStatuses = [];
            this.partnerStatusSelectionData = [];
            this.partnerStatusCounts = {};
            this.partnerAvailablePayments = [];
            this.partnerSelectedPayments = [];
            this.partnerPaymentSelectionData = [];
            this.partnerPaymentCounts = {};
            this.partnerPaymentColumn = null;
            this.showPartnerAgencySelection = false;
            this.partnerAvailableAgencies = [];
            this.partnerSelectedAgencies = [];
            this.partnerAgencySearchFilter = '';
            this.partnerAgenciesSelectionBeforeSearch = null;
            this.partnerAgencyColumn = null;
            this.partnerAgencySelectionData = [];
        }

        // Fermer les modales de sélection si ouvertes
        this.showAgencySelection = false;
        this.showServiceSelection = false;
        this.showManualServiceSelection = false;
        this.showManualStatusSelection = false;
        this.showPartnerAgencySelection = false;
        this.showPartnerServiceSelection = false;
        this.showPartnerStatusSelection = false;
        this.showPartnerPaymentSelection = false;

        this.cd.detectChanges();
    }

    // Nouvelle méthode pour traiter le fichier BO en mode manuel avec détection TRXBO
    private processManualBoFile(file: File): void {
        
        // En mode manuel, utiliser la même logique que le mode automatique pour les fichiers CSV
        // La détection TRXBO est maintenant intégrée dans parseCSV
        this.parseFile(file, true);
    }

    // Nouvelle méthode pour le traitement automatique optimisé
    private processFileWithAutoProcessing(file: File, fileType: 'bo' | 'partner'): void {
        
        // Détecter si c'est un gros fichier (> 50MB)
        const isLargeFile = file.size > 50 * 1024 * 1024; // 50MB
        if (isLargeFile) {
            this.isProcessingLargeFile = true;
            this.processingProgress = 0;
            this.processingMessage = `Analyse du fichier ${file.name}...`;
            this.processingCancelled = false;
            this.processingAbortController = new AbortController();
            
            // Déterminer le mode de traitement
            const totalRows = Math.ceil(file.size / 100); // Estimation approximative
            if (totalRows > 100000) {
                this.processingMode = 'Web Workers';
                this.processingDetails = {
                    mode: 'Parallèle',
                    workers: navigator.hardwareConcurrency || 4,
                    chunks: Math.ceil(totalRows / 15000)
                };
            } else if (totalRows > 50000) {
                this.processingMode = 'Chunks';
                this.processingDetails = {
                    mode: 'Séquentiel',
                    chunks: Math.ceil(totalRows / 10000)
                };
            } else {
                this.processingMode = 'Standard';
                this.processingDetails = {
                    mode: 'Direct'
                };
            }
        }
        
        // Vérifier s'il y a un modèle de traitement automatique
        const abortController = isLargeFile && this.processingAbortController ? this.processingAbortController : undefined;
        
        // Traitement simplifié sans callback de progression
        this.autoProcessingService.processFile(file).then((result: ProcessingResult) => {
                
                if (result.success) {
                    
                    // Utiliser les données traitées
                    if (fileType === 'bo') {
                        this.boData = result.processedData;
                    } else {
                        this.partnerData = result.processedData;
                    }
                    
                    // Afficher une notification de succès
                    this.showProcessingNotification(result);
                } else {
                    
                    // Traitement standard
                    this.parseFile(file, fileType === 'bo');
                }
                
                // Mettre à jour l'estimation si les deux fichiers sont chargés
                if (this.boFile && this.partnerFile) {
                    this.updateEstimatedTime();
                }
                
                // Réinitialiser les indicateurs de traitement
                this.isProcessingLargeFile = false;
                this.processingProgress = 0;
                this.processingMessage = '';
                this.processingAbortController = null;
                
                // Vérifier l'état après traitement
        }).catch((error) => {
                
                if (this.processingCancelled) {
                    this.processingMessage = 'Traitement annulé';
                } else {
                    
                    // Fallback vers le traitement standard
                    this.parseFile(file, fileType === 'bo');
                    
                    if (this.boFile && this.partnerFile) {
                        this.updateEstimatedTime();
                    }
                }
                
                // Réinitialiser les indicateurs de traitement
                this.isProcessingLargeFile = false;
                this.processingProgress = 0;
                this.processingMessage = '';
                this.processingAbortController = null;
                
                // Vérifier l'état après fallback
        });
    }

    // Méthode pour annuler le traitement
    cancelProcessing(): void {
        if (this.processingAbortController) {
            this.processingCancelled = true;
            this.processingAbortController.abort();
            this.processingMessage = 'Annulation en cours...';
        }
    }

    // Méthode pour mettre à jour la progression
    updateProcessingProgress(progress: number, message: string): void {
        this.processingProgress = progress;
        this.processingMessage = message;
    }

    // Nouvelle méthode pour la réconciliation automatique
    onFileUploadWithAutoReconciliation(event: any): void {
        const file = event.target.files[0];
        if (!file) return;

        // Déterminer le type de fichier (BO ou partenaire) basé sur le nom ou l'extension
        const fileType = this.determineFileType(file.name);


        // Méthode simplifiée sans réconciliation automatique
        // TODO: Implémenter le traitement de fichier
    }

    // Méthode pour déterminer le type de fichier
    private determineFileType(fileName: string): 'bo' | 'partner' {
        const lowerFileName = fileName.toLowerCase();
        
        // Logique pour déterminer le type basée sur le nom du fichier
        if (lowerFileName.includes('bo') || lowerFileName.includes('backoffice') || lowerFileName.includes('trxbo')) {
            return 'bo';
        } else if (lowerFileName.includes('partner') || lowerFileName.includes('partenaire') || lowerFileName.includes('pmmtncm')) {
            return 'partner';
        } else {
            // Par défaut, considérer comme partenaire
            return 'partner';
        }
    }

    // Méthode pour afficher les résultats de la réconciliation automatique
    private displayAutoReconciliationResults(result: any): void {
        
        // Appliquer le filtrage automatique Orange Money si nécessaire
        this.applyAutomaticOrangeMoneyFilterForReconciliation(result);
        
        // Vous pouvez ajouter ici la logique pour afficher les résultats dans l'UI
        // Par exemple, stocker les résultats dans une propriété du composant
        // et les afficher dans le template
    }

    // Afficher une notification de traitement automatique
    private showProcessingNotification(result: ProcessingResult): void {
        const message = `✅ Traitement automatique appliqué!\n\n` +
                       `📁 Fichier: ${result.fileName}\n` +
                       `🤖 Modèle: ${result.modelId}\n` +
                       `⚡ Temps: ${result.processingTime}ms\n` +
                       `📊 Lignes traitées: ${result.processedData.length}\n\n` +
                       `Les données ont été automatiquement traitées selon le modèle configuré.`;
        
        this.popupService.showSuccess(message, 'Traitement Automatique');
    }

    private convertDebitCreditToNumber(records: Record<string, any>[]): Record<string, any>[] {
        return this.convertDebitCreditToNumberInPlace(records);
    }

    /**
     * Repère les clés réelles du Débit / Crédit quel que soit l'accent ou l'encodage.
     * Les relevés Orange Money utilisent « Débit » / « Crédit » (accentués) alors que
     * d'autres sources utilisent « debit » / « credit » (sans accent ou éventuellement mal encodés).
     */
    private findDebitCreditColumns(record: Record<string, any>): { debitKey?: string; creditKey?: string } {
        let debitKey: string | undefined;
        let creditKey: string | undefined;
        for (const key of Object.keys(record)) {
            const keyNorm = this.normalizeColumnName(key).toLowerCase().replace(/[\s\u00A0]/g, '').replace(/\uFFFD/g, '');
            if (!debitKey && (keyNorm === 'debit' || keyNorm === 'débit')) debitKey = key;
            if (!creditKey && (keyNorm === 'credit' || keyNorm === 'crédit')) creditKey = key;
            if (debitKey && creditKey) break;
        }
        return { debitKey, creditKey };
    }

    /**
     * Convertit une valeur monétaire en nombre : supprime les séparateurs de milliers,
     * traduit la virgule décimale puis parse en float. Les montants Orange Money sont
     * formatés « 164 238,68 ».
     */
    private convertDebitCreditValue(value: any): any {
        if (value == null || value === '') return value;
        const cleaned = String(value)
            .replace(/[\s\u00A0\u202F]/g, '')
            .replace(',', '.');
        if (cleaned === '') return value;
        const num = parseFloat(cleaned);
        return isNaN(num) ? value : num;
    }

    /** Conversion in-place (évite de cloner 80k+ lignes avec spread). */
    private convertDebitCreditToNumberInPlace(records: Record<string, any>[]): Record<string, any>[] {
        if (!records.length) return records;
        const firstRecord = records.find(r => r && typeof r === 'object');
        const shared = firstRecord
            ? this.findDebitCreditColumns(firstRecord)
            : { debitKey: undefined, creditKey: undefined };
        const hasSharedResolution = shared.debitKey !== undefined || shared.creditKey !== undefined;
        for (let i = 0; i < records.length; i++) {
            const record = records[i];
            if (!record || typeof record !== 'object') continue;
            let { debitKey, creditKey } = shared;
            if (!hasSharedResolution) {
                const found = this.findDebitCreditColumns(record);
                debitKey = found.debitKey;
                creditKey = found.creditKey;
            }
            if (debitKey && record[debitKey] !== undefined) record[debitKey] = this.convertDebitCreditValue(record[debitKey]);
            if (creditKey && record[creditKey] !== undefined) record[creditKey] = this.convertDebitCreditValue(record[creditKey]);
        }
        return records;
    }

    private async convertDebitCreditToNumberAsync(
        records: Record<string, any>[],
        onProgress?: (done: number, total: number) => void
    ): Promise<Record<string, any>[]> {
        if (records.length <= 5000) {
            return this.convertDebitCreditToNumberInPlace(records);
        }
        const batchSize = records.length > 100000 ? 20000 : 10000;
        const firstRecord = records.find(r => r && typeof r === 'object');
        const shared = firstRecord
            ? this.findDebitCreditColumns(firstRecord)
            : { debitKey: undefined, creditKey: undefined };
        const hasSharedResolution = shared.debitKey !== undefined || shared.creditKey !== undefined;
        for (let start = 0; start < records.length; start += batchSize) {
            const end = Math.min(start + batchSize, records.length);
            for (let i = start; i < end; i++) {
                const record = records[i];
                if (!record || typeof record !== 'object') continue;
                let { debitKey, creditKey } = shared;
                if (!hasSharedResolution) {
                    const found = this.findDebitCreditColumns(record);
                    debitKey = found.debitKey;
                    creditKey = found.creditKey;
                }
                if (debitKey && record[debitKey] !== undefined) record[debitKey] = this.convertDebitCreditValue(record[debitKey]);
                if (creditKey && record[creditKey] !== undefined) record[creditKey] = this.convertDebitCreditValue(record[creditKey]);
            }
            onProgress?.(end, records.length);
            await this.yieldToMainThread(true);
        }
        return records;
    }

    // Méthode pour appliquer le filtrage automatique Orange Money dans la réconciliation
    private applyAutomaticOrangeMoneyFilterForReconciliation(result: any): void {
        
        // Vérifier si le fichier traité est un fichier Orange Money
        const fileName = result.fileName || '';
        const isOrangeMoneyFile = this.orangeMoneyUtilsService.isOrangeMoneyFile(fileName);
        
        if (isOrangeMoneyFile) {
            
            // Vérifier si le modèle utilisé est un modèle Orange Money
            const modelId = result.modelId || '';
            const isOrangeMoneyModel = modelId.toLowerCase().includes('orange') || 
                                     modelId.toLowerCase().includes('ciomcm') ||
                                     modelId.toLowerCase().includes('orange money');
            
            if (isOrangeMoneyModel) {
                
                // Appliquer le filtrage sur les données traitées
                if (result.processedData && result.processedData.length > 0) {
                    const filteredData = this.filterOrangeMoneyData(result.processedData);
                    
                    
                    // Mettre à jour les résultats avec les données filtrées
                    result.processedData = filteredData;
                    result.orangeMoneyFilterApplied = true;
                    result.filteredRowsCount = filteredData.length;
                    
                    // Afficher une notification
                    this.showOrangeMoneyFilterNotification(result);
                }
            } else {
            }
        } else {
        }
    }

    // Méthode pour filtrer les données Orange Money
    private filterOrangeMoneyData(data: any[]): any[] {
        
        // Vérifier si c'est un fichier Orange Money avec traitement spécial
        const isOrangeMoneyFile = data.length > 0 && Object.keys(data[0]).some(col => 
            col.toLowerCase().includes('compte orange money') || 
            col.toLowerCase().includes('référence') ||
            col.toLowerCase().includes('reference')
        );
        
        if (isOrangeMoneyFile) {
            
            const filteredData = data.filter(row => {
                // Chercher la colonne "Statut" dans les données
                const statutColumn = Object.keys(row).find(key => 
                    key.toLowerCase().includes('statut') || 
                    key.toLowerCase().includes('status')
                );
                
                if (statutColumn) {
                    const statutValue = row[statutColumn];
                    const shouldKeep = statutValue && statutValue.toString().toLowerCase().includes('succès');
                    if (!shouldKeep) {
                    }
                    return shouldKeep;
                }
                
                return true; // Si pas de colonne Statut, garder toutes les lignes
            });
            
            
            return filteredData;
        } else {
            // Traitement normal pour les autres fichiers
            const filteredData = data.filter(row => {
                // Chercher la colonne "Statut" dans les données
                const statutColumn = Object.keys(row).find(key => 
                    key.toLowerCase().includes('statut') || 
                    key.toLowerCase().includes('status')
                );
                
                if (statutColumn) {
                    const statutValue = row[statutColumn];
                    const shouldKeep = statutValue && statutValue.toString().toLowerCase().includes('succès');
                    if (!shouldKeep) {
                    }
                    return shouldKeep;
                }
                
                return true; // Si pas de colonne Statut, garder toutes les lignes
            });
            
            
            return filteredData;
        }
    }

    // Méthode pour afficher une notification de filtrage Orange Money
    private showOrangeMoneyFilterNotification(result: any): void {
        const message = `🎯 Filtrage Orange Money automatique appliqué!\n\n` +
                       `📁 Fichier: ${result.fileName}\n` +
                       `🤖 Modèle: ${result.modelId}\n` +
                       `✅ Lignes avec "Succès": ${result.filteredRowsCount}\n` +
                       `📊 Total initial: ${result.processedData.length + (result.totalRowsCount - result.filteredRowsCount)} lignes\n\n` +
                       `Seules les lignes avec le statut "Succès" ont été conservées pour la réconciliation.`;
        
        // Vous pouvez remplacer alert par une notification plus élégante
        this.popupService.showInfo(message);
    }

    // Méthode pour appliquer le filtrage automatique Orange Money dans le file upload
    private applyAutomaticOrangeMoneyFilterForFileUpload(fileName: string, isBo: boolean): void {
        
        // Vérifier si le fichier traité est un fichier Orange Money
        const isOrangeMoneyFile = this.orangeMoneyUtilsService.isOrangeMoneyFile(fileName);
        
        if (isOrangeMoneyFile) {
            
            // Appliquer le filtrage sur les données appropriées
            if (isBo && this.boData.length > 0) {
                const originalCount = this.boData.length;
                this.boData = this.filterOrangeMoneyData(this.boData);
                const filteredCount = this.boData.length;
                
                this.showOrangeMoneyFilterNotificationForFileUpload(fileName, 'BO', originalCount, filteredCount);
            } else if (!isBo && this.partnerData.length > 0) {
                const originalCount = this.partnerData.length;
                this.partnerData = this.filterOrangeMoneyData(this.partnerData);
                const filteredCount = this.partnerData.length;
                
                this.showOrangeMoneyFilterNotificationForFileUpload(fileName, 'Partenaire', originalCount, filteredCount);
            } else {
            }
        } else {
        }
    }

    // Méthode pour afficher une notification de filtrage Orange Money pour le file upload
    private showOrangeMoneyFilterNotificationForFileUpload(fileName: string, fileType: string, originalCount: number, filteredCount: number): void {
        const message = `🎯 Filtrage Orange Money automatique appliqué!\n\n` +
                       `📁 Fichier: ${fileName}\n` +
                       `📂 Type: ${fileType}\n` +
                       `✅ Lignes avec "Succès": ${filteredCount}\n` +
                       `📊 Total initial: ${originalCount} lignes\n\n` +
                       `Seules les lignes avec le statut "Succès" ont été conservées.`;
        
        this.popupService.showInfo(message, 'Filtrage Orange Money');
    }

    /**
     * Sélectionne et ordonne les colonnes Orange Money pour correspondre à la logique du menu Traitement
     * Ordre attendu: Référence, Débit, Crédit, N° de Compte, Date, Service, Statut
     * Si le fichier ne semble pas être Orange Money, renvoie les données telles quelles.
     * EXCEPTION: Le fichier PMOMBF ne doit pas utiliser les colonnes par défaut Orange Money.
     */
    private applyOrangeMoneyColumnSelection<T extends Record<string, any>>(rows: T[], fileName?: string): T[] {
        if (!rows || rows.length === 0) return rows;

        const startTime = performance.now();
        const isLargeDataset = rows.length > 100000;

        // Pour les gros datasets, normaliser par chunks pour éviter de bloquer l'UI
        let normalizedRows: T[];
        if (isLargeDataset) {
            const normalizeStartTime = performance.now();
            const CHUNK_SIZE = 50000;
            normalizedRows = [] as T[];
            
            for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
                const chunk = rows.slice(i, i + CHUNK_SIZE);
                const normalizedChunk = chunk.map(row => {
                    const normalizedRow: Record<string, any> = {};
                    Object.keys(row).forEach(key => {
                        const normalizedKey = this.normalizeColumnName(key);
                        normalizedRow[normalizedKey] = row[key];
                    });
                    return normalizedRow as T;
                });
                normalizedRows.push(...normalizedChunk);
                
                // Logger la progression tous les 100k enregistrements
                if ((i + CHUNK_SIZE) % 100000 === 0 || i + CHUNK_SIZE >= rows.length) {
                    const progress = ((i + CHUNK_SIZE) / rows.length * 100).toFixed(1);
                    const duration = ((performance.now() - normalizeStartTime) / 1000).toFixed(2);
                }
                
                // Petite pause pour permettre à l'UI de se mettre à jour (sans await car fonction synchrone)
                // Utiliser setTimeout de manière synchrone n'est pas possible, donc on continue
                // La pause sera gérée par le traitement par chunks lui-même
            }
            const normalizeDuration = ((performance.now() - normalizeStartTime) / 1000).toFixed(2);
        } else {
            // Normaliser les colonnes dans les données d'abord
            const normalizeStartTime = performance.now();
            normalizedRows = rows.map(row => {
                const normalizedRow: Record<string, any> = {};
                Object.keys(row).forEach(key => {
                    const normalizedKey = this.normalizeColumnName(key);
                    normalizedRow[normalizedKey] = row[key];
                });
                return normalizedRow as T;
            });
            const normalizeDuration = ((performance.now() - normalizeStartTime) / 1000).toFixed(2);
        }

        const headers = Object.keys(normalizedRows[0]);
        
        const lower = (s: string) => s.toLowerCase();

        // EXCEPTION: Le fichier PMOMBF ne doit pas utiliser les colonnes par défaut Orange Money
        if (fileName && lower(fileName).includes('pmombf')) {
            return normalizedRows;
        }

        // Détection d'un fichier Orange Money basée sur la présence de colonnes clés
        const looksLikeOM = headers.some(h => lower(h).includes('référence') || lower(h).includes('reference'))
            && headers.some(h => lower(h).includes('statut') || lower(h).includes('status'))
            && headers.some(h => lower(h).includes('date'));

        
        if (!looksLikeOM) {
            return normalizedRows;
        }

        const targetOrder = [
            'Référence',
            'Débit',
            'Crédit',
            'N° de Compte',
            'Date',
            'Service',
            'Statut'
        ];

        // Fonction de matching souple inspirée de la logique du menu Traitement
        const findColumn = (target: string): string | null => {
            const targetLower = target.toLowerCase();
            // Correspondance exacte d'abord
            const exact = headers.find(h => h === target);
            if (exact) return exact;

            // Correspondances partielles spécifiques
            for (const h of headers) {
                const hLower = lower(h);
                if (target === 'Référence' && (hLower.includes('référence') || hLower.includes('reference'))) return h;
                if (target === 'Débit' && (hLower.includes('débit') || hLower.includes('debit'))) return h;
                if (target === 'Crédit' && (hLower.includes('crédit') || hLower.includes('credit'))) return h;
                if (target === 'N° de Compte' && ((hLower.includes('n°') || hLower.includes('no') || hLower.includes('nº')) && hLower.includes('compte'))) return h;
                if (target === 'Date' && hLower.includes('date')) return h;
                if (target === 'Service' && hLower.includes('service')) return h;
                if (target === 'Statut' && (hLower.includes('statut') || hLower.includes('status'))) return h;
            }
            return null;
        };

        const mappedColumns: (string | null)[] = targetOrder.map(findColumn);

        // Si aucune correspondance pertinente, ne pas altérer
        if (mappedColumns.every(c => c === null)) {
            const totalDuration = ((performance.now() - startTime) / 1000).toFixed(2);
            return normalizedRows;
        }

        // Recomposer les lignes avec uniquement les colonnes cibles, dans l'ordre
        const remapStartTime = performance.now();
        
        let remapped: T[];
        if (isLargeDataset) {
            // Pour les gros datasets, remapper par chunks
            const REMAP_CHUNK_SIZE = 50000;
            remapped = [] as T[];
            
            for (let i = 0; i < normalizedRows.length; i += REMAP_CHUNK_SIZE) {
                const chunk = normalizedRows.slice(i, i + REMAP_CHUNK_SIZE);
                const remappedChunk = chunk.map(row => {
                    // Conserver toutes les colonnes normalisées existantes (Station, Numéro SIM, Code PDA, etc.)
                    const obj: any = { ...row };
                    mappedColumns.forEach((col, idx) => {
                        const targetName = targetOrder[idx];
                        if (col && Object.prototype.hasOwnProperty.call(row, col)) {
                            obj[targetName] = row[col];
                        } else {
                            obj[targetName] = '';
                        }
                    });
                    return obj as T;
                });
                remapped.push(...remappedChunk);
                
                // Logger la progression
                if ((i + REMAP_CHUNK_SIZE) % 100000 === 0 || i + REMAP_CHUNK_SIZE >= normalizedRows.length) {
                    const progress = ((i + REMAP_CHUNK_SIZE) / normalizedRows.length * 100).toFixed(1);
                    const duration = ((performance.now() - remapStartTime) / 1000).toFixed(2);
                }
            }
        } else {
            remapped = normalizedRows.map(row => {
                // Conserver toutes les colonnes normalisées existantes (Station, Numéro SIM, Code PDA, etc.)
                const obj: any = { ...row };
                mappedColumns.forEach((col, idx) => {
                    const targetName = targetOrder[idx];
                    if (col && Object.prototype.hasOwnProperty.call(row, col)) {
                        obj[targetName] = row[col];
                    } else {
                        obj[targetName] = '';
                    }
                });
                return obj as T;
            });
        }
        
        const remapDuration = ((performance.now() - remapStartTime) / 1000).toFixed(2);
        const totalDuration = ((performance.now() - startTime) / 1000).toFixed(2);

        return remapped;
    }

    private parseFile(file: File, isBo: boolean): void {
        
        const fileName = file.name.toLowerCase();
        if (fileName.endsWith('.csv')) {
            this.parseCSV(file, isBo);
        } else if (this.isExcelFile(fileName)) {
            this.parseXLSX(file, isBo);
        } else {
            this.errorMessage = `Format de fichier non supporté: ${file.name}. Formats supportés: CSV, XLS, XLSX, XLSM, XLSB, XLT, XLTX, XLTM`;
        }
    }

    /**
     * Vérifie si le fichier est un fichier Excel (tous formats)
     */
    private isExcelFile(fileName: string): boolean {
        const excelExtensions = [
            '.xls',    // Excel 97-2003
            '.xlsx',   // Excel 2007+
            '.xlsm',   // Excel avec macros
            '.xlsb',   // Excel binaire
            '.xlt',    // Template Excel 97-2003
            '.xltx',   // Template Excel 2007+
            '.xltm'    // Template Excel avec macros
        ];
        
        return excelExtensions.some(ext => fileName.endsWith(ext));
    }

    private parseCSV(file: File, isBo: boolean): void {
        // Traitement commun une fois le fichier analysé (identique pour flux continu
        // et parsing classique).
        const onComplete = (rows: Record<string, string>[]) => {
            if (isBo) {
                this.boData = rows;
                
                // Vérifier si c'est un fichier TRXBO et déclencher la sélection des services (pour le mode manuel)
                setTimeout(() => {
                    if (this.boData && this.boData.length > 0) {
                        if (this.detectTRXBOAndExtractServicesForManual(this.boData)) {
                            if (this.availableAgencies.length > 0) {
                                this.showAgencySelectionStep();
                            } else {
                                this.showManualServiceSelectionStep();
                            }
                        }
                    }
                }, 100);
            } else {
                this.partnerData = this.convertDebitCreditToNumber(rows);
                
                // Vérifier si le fichier partenaire a des colonnes service/type/statut et déclencher la sélection (pour le mode manuel)
                if (this.reconciliationMode === 'manual') {
                    // Utiliser setTimeout pour laisser Angular terminer le cycle de détection en cours
                    setTimeout(() => {
                        if (this.partnerData && this.partnerData.length > 0) {
                            const detected = this.detectPartnerServiceTypeAndStatusForManual(this.partnerData);
                            if (detected === 'agency') {
                                requestAnimationFrame(() => this.showPartnerAgencySelectionStep());
                            } else if (detected === 'services') {
                                requestAnimationFrame(() => this.showManualPartnerServiceSelectionStep());
                            } else {
                            }
                        } else {
                        }
                    }, 100);
                }
            }
            
            // Mettre à jour l'estimation si les deux fichiers sont chargés
            if (this.boFile && this.partnerFile) {
                this.updateEstimatedTime();
            }
            
            // Forcer la détection des changements pour mettre à jour la vue
            this.cd.detectChanges();
        };
        
        // Fichiers volumineux : lecture en streaming (Papa.parse sur le File) pour ne pas
        // charger tout le fichier en mémoire ni geler l'interface — même approche que
        // le module /traitement (readCsvFileUltraFast). L'ancienne méthode readAsText +
        // split('\n') doublonnait la mémoire et rendait l'upload extrêmement lent.
        if (file.size > 3 * 1024 * 1024) {
            void this.parseLargeCsvFile(file, onComplete);
            return;
        }
        
        const reader = new FileReader();
        reader.onload = (e: ProgressEvent<FileReader>) => {
            let text = e.target?.result as string;
            // Nettoyer le BOM éventuel
            if (text.charCodeAt(0) === 0xFEFF) {
                text = text.slice(1);
            }
            
            // Détecter automatiquement le délimiteur (même logique que le mode automatique)
            const lines = text.split('\n').filter(line => line.trim());
            if (lines.length > 0) {
                const firstLine = lines[0];
                const commaCount = (firstLine.match(/,/g) || []).length;
                const semicolonCount = (firstLine.match(/;/g) || []).length;
                const delimiter = semicolonCount > commaCount ? ';' : ',';
                
                Papa.parse(text, {
                    header: true,
                    delimiter: delimiter,
                    skipEmptyLines: true,
                    transformHeader: (header: string) => {
                        // Normaliser les noms de colonnes pour assurer la cohérence avec les fichiers XLSX
                        return this.normalizeColumnName(header);
                    },
                    complete: (results) => {
                        onComplete(results.data as Record<string, string>[]);
                    },
                    error: (error: any) => {
                        this.cd.detectChanges();
                    }
                });
            }
        };
        reader.onerror = (e) => {
        };
        reader.readAsText(file, 'utf-8');
    }

    /**
     * Lecture CSV volumineux en streaming — même approche que /traitement et que le
     * mode automatique (readCsvFileUltraFast) : Papa.parse lit le File par morceaux,
     * sans charger l'intégralité en mémoire, et cède régulièrement la main à l'UI.
     */
    private async parseLargeCsvFile(
        file: File,
        onComplete: (rows: Record<string, string>[]) => void
    ): Promise<void> {
        const isLargeFile = file.size > 512 * 1024;
        if (isLargeFile) {
            this.isProcessingLargeFile = true;
            this.processingProgress = 0;
            this.processingMessage = `Lecture de ${file.name}...`;
            this.cd.detectChanges();
        }
        try {
            const { rows } = await readCsvFileUltraFast(file, {
                stripAirtelPreamble: true,
                normalizeHeader: (header, index) =>
                    this.normalizeColumnName(header || `Col${index + 1}`),
                onProgress: (processed, total) => {
                    if (!isLargeFile) {
                        return;
                    }
                    this.processingProgress = total > 0 ? Math.round((processed / total) * 100) : 0;
                    this.processingMessage =
                        `Lecture ${file.name} : ${processed.toLocaleString('fr-FR')} / ${total.toLocaleString('fr-FR')} ligne(s)...`;
                    this.cd.detectChanges();
                },
                yieldFn: () => this.yieldToMainThread(true)
            });
            onComplete(rows as Record<string, string>[]);
        } catch (error) {
            this.cd.detectChanges();
        } finally {
            if (isLargeFile) {
                this.isProcessingLargeFile = false;
                this.processingProgress = 0;
                this.processingMessage = '';
                this.cd.detectChanges();
            }
        }
    }

    /**
     * Détecte et corrige l'encodage du fichier
     */
    private detectAndFixEncoding(text: string): string {
        // Nettoyer le BOM éventuel
        if (text.charCodeAt(0) === 0xFEFF) {
            text = text.slice(1);
        }
        
        // Détecter et corriger les caractères mal encodés
        text = fixGarbledCharacters(text);
        
        // Normaliser les retours à la ligne
        text = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
        
        return text;
    }

    /**
     * Détecte si un fichier est un fichier Orange Money et trouve la ligne d'en-tête
     */
    private detectOrangeMoneyFile(content: string, delimiter: string): {
        isOrangeMoney: boolean;
        headerRowIndex: number;
        headerRow: string[];
    } {
        
        const lines = content.split('\n').filter(line => line.trim());
        let bestHeaderRowIndex = -1;
        let bestScore = -1;
        let bestHeaderRow: string[] = [];
        
        // NOUVELLE APPROCHE : Chercher d'abord à la ligne 23 (ligne spécifique) mais vérifier que ce sont des en-têtes
        
        // Vérifier si la ligne 23 existe
        if (lines.length > 22) {
            const line23 = lines[22]; // Index 22 = ligne 23
            const cells23 = line23.split(delimiter).map(cell => cell.trim());
            const rowStrings23 = cells23.map(cell => cell.toString());
            const nonEmptyColumns23 = rowStrings23.filter(cell => cell && cell !== '').length;
            
            
            // Vérifier si la ligne 23 contient des en-têtes valides (pas des données)
            const hasValidHeaders = this.hasValidHeaders(rowStrings23);
            
            // Si la ligne 23 a beaucoup de colonnes ET contient des en-têtes valides
            // ET que ce ne sont PAS des données (vérification stricte)
            if (nonEmptyColumns23 >= 10 && hasValidHeaders) {
                return {
                    isOrangeMoney: true,
                    headerRowIndex: 22, // Index 22 = ligne 23
                    headerRow: cells23
                };
            } else {
                if (!hasValidHeaders) {
                } else {
                }
            }
        } else {
        }
        
        // ÉTAPE 2: Si ligne 23 pas trouvée, chercher dans les 50 premières lignes
        
        for (let i = 0; i < Math.min(50, lines.length); i++) {
            const line = lines[i];
            const cells = line.split(delimiter).map(cell => cell.trim());
            
            // Calculer un score pour cette ligne
            let score = 0;
            let nonEmptyColumns = 0;
            
            const rowStrings = cells.map(cell => cell.toString());
            
            // Compter les colonnes non vides
            nonEmptyColumns = rowStrings.filter(cell => cell && cell !== '').length;
            
            // Mots-clés typiques des en-têtes Orange Money
            const headerKeywords = [
                'N°', 'Date', 'Heure', 'Référence', 'Opération', 'Agent', 'Correspondant',
                'Montant', 'Commissions', 'Service', 'Paiement', 'Statut', 'Mode',
                'Compte', 'Wallet', 'Pseudo', 'Débit', 'Crédit', 'Sous-réseau',
                'Opération', 'Agent', 'Correspondant', 'Sous-réseau', 'Transaction',
                'ID', 'External', 'Reference', 'Amount', 'Status', 'Phone', 'Email'
            ];
            
            for (const cell of rowStrings) {
                // Vérification robuste pour éviter les erreurs undefined/null
                if (!cell || cell === '' || typeof cell !== 'string') continue;
                
                for (const keyword of headerKeywords) {
                    if (cell.toLowerCase().includes(keyword.toLowerCase())) {
                        score += 5;
                    }
                }
                
                // Bonus pour les colonnes "N°"
                if (cell.includes('N°') || cell === 'N') {
                    score += 15;
                }
                
                // Bonus pour les caractères spéciaux typiques des en-têtes
                if (cell.includes('é') || cell.includes('è') || cell.includes('à') || 
                    cell.includes('ç') || cell.includes('ù') || cell.includes('ô')) {
                    score += 3;
                }
            }
            
            // Vérifier si cette ligne contient des en-têtes valides (CRITÈRE CRITIQUE)
            const hasValidHeaders = this.hasValidHeaders(rowStrings);
            
            // PÉNALITÉ MAJEURE si la ligne ressemble à des données
            if (!hasValidHeaders) {
                score -= 1000; // Pénalité massive pour rejeter les lignes de données
            }
            
            // Bonus pour avoir plusieurs colonnes non vides (critère important pour Orange Money)
            // MAIS seulement si ce sont de vrais en-têtes
            if (hasValidHeaders) {
                if (nonEmptyColumns >= 10) {
                    score += 50; // Bonus très important pour les vraies lignes d'en-tête
                }
                
                if (nonEmptyColumns >= 15) {
                    score += 100; // Bonus maximum pour les vraies lignes d'en-tête
                }
            }
            
            // Pénalité pour les lignes avec peu de colonnes non vides
            if (nonEmptyColumns < 5) {
                score -= 20;
            }
            
            // Bonus pour les lignes qui contiennent "N°" ET "Référence" (critère spécifique Orange Money)
            const hasNColumn = rowStrings.some(cell => cell && (cell.includes('N°') || cell === 'N'));
            const hasReferenceColumn = rowStrings.some(cell => cell && cell.toLowerCase().includes('référence'));
            if (hasNColumn && hasReferenceColumn) {
                score += 100; // Bonus très important pour les vraies lignes d'en-tête Orange Money
            }
            
            // Bonus pour les lignes qui contiennent "N°" ET "Date" ET "Heure" (critère très spécifique Orange Money)
            const hasDateColumn = rowStrings.some(cell => cell && cell.toLowerCase().includes('date'));
            const hasHeureColumn = rowStrings.some(cell => cell && cell.toLowerCase().includes('heure'));
            if (hasNColumn && hasDateColumn && hasHeureColumn) {
                score += 200; // Bonus maximum pour les vraies lignes d'en-tête Orange Money
            }
            
            // Bonus pour les lignes qui contiennent "N°" ET "Date" ET "Heure" ET "Référence" (critère ultra spécifique)
            if (hasNColumn && hasDateColumn && hasHeureColumn && hasReferenceColumn) {
                score += 500; // Bonus ultra maximum pour les vraies lignes d'en-tête Orange Money
            }
            
            // Bonus pour les premières lignes (plus probable d'être des en-têtes)
            if (i <= 20) {
                score += 10;
            }
            
            
            if (score > bestScore) {
                bestScore = score;
                bestHeaderRowIndex = i;
                bestHeaderRow = cells;
            }
        }
        
        
        // Vérifier que le meilleur en-tête trouvé est vraiment valide
        // (score > 0 signifie qu'il a passé la validation hasValidHeaders)
        const isValidResult = bestScore > 0 && bestHeaderRowIndex >= 0 && bestHeaderRow.length > 0;
        
        if (!isValidResult) {
        }
        
        return {
            isOrangeMoney: isValidResult,
            headerRowIndex: isValidResult ? bestHeaderRowIndex : -1,
            headerRow: isValidResult ? bestHeaderRow : []
        };
    }

    /**
     * Méthode simple qui retourne les données sans modification
     */
    private normalizeData(data: Record<string, string>[]): Record<string, string>[] {
        return data.map(row => this.normalizeDataRow(row));
    }

    private normalizeDataRow(row: Record<string, string>): Record<string, string> {
        const cleanedRow: Record<string, string> = {};
        for (const [key, value] of Object.entries(row)) {
            const cleanKey = fixCellEncoding(key);
            const cell = value as unknown;
            if (cell === null || cell === undefined) {
                cleanedRow[cleanKey] = '';
            } else if (cell instanceof Date) {
                cleanedRow[cleanKey] = formatSpreadsheetDateValue(cell);
            } else if (typeof cell === 'object') {
                try {
                    cleanedRow[cleanKey] = fixCellEncoding(JSON.stringify(cell));
                } catch (e) {
                    cleanedRow[cleanKey] = fixCellEncoding(String(cell));
                }
            } else if (typeof cell === 'number') {
                if (isNaN(cell) || !isFinite(cell)) {
                    cleanedRow[cleanKey] = '';
                } else if (isDateColumnName(cleanKey) && isExcelSerialDateValue(cell)) {
                    cleanedRow[cleanKey] = formatSpreadsheetDateValue(cell);
                } else {
                    cleanedRow[cleanKey] = String(cell);
                }
            } else {
                const str = String(cell);
                if (isDateColumnName(cleanKey) && isExcelSerialDateValue(str)) {
                    cleanedRow[cleanKey] = formatSpreadsheetDateValue(str);
                } else {
                    cleanedRow[cleanKey] = fixCellEncoding(str);
                }
            }
        }
        return cleanedRow;
    }

    private async normalizeDataAsync(
        data: Record<string, string>[],
        onProgress?: (done: number, total: number) => void
    ): Promise<Record<string, string>[]> {
        if (data.length <= 3000) {
            return this.normalizeData(data);
        }

        const batchSize = data.length > 100000 ? 20000 : 10000;
        const result: Record<string, string>[] = new Array(data.length);
        for (let start = 0; start < data.length; start += batchSize) {
            const end = Math.min(start + batchSize, data.length);
            for (let i = start; i < end; i++) {
                result[i] = this.normalizeDataRow(data[i]);
            }
            onProgress?.(end, data.length);
            await this.yieldToMainThread(true);
        }
        return result;
    }

    /** Affecte une valeur de cellule Excel en formatant les colonnes date */
    private assignExcelCellValue(row: Record<string, unknown>, header: string, value: unknown): void {
        const formatted = formatSpreadsheetCellValue(header, value);
        if (formatted === undefined || formatted === null || formatted === '') {
            row[header] = '';
            return;
        }
        if (isTransactionIdPreserveColumn(header) || isMsisdnPreserveColumn(header)) {
            row[header] = fixCellEncoding(formatGridCellAsString(header, formatted));
            return;
        }
        row[header] = typeof formatted === 'string' ? fixCellEncoding(formatted) : formatted;
    }

    /**
     * Normalise un nom de colonne en corrigeant l'encodage et en nettoyant les caractères
     */
    private normalizeColumnName(columnName: string): string {
        if (!columnName) return '';
        
        // Nettoyer les espaces d'abord
        let normalized = columnName.trim();
        
        // Supprimer les guillemets
        if ((normalized.startsWith('"') && normalized.endsWith('"')) ||
            (normalized.startsWith("'") && normalized.endsWith("'"))) {
            normalized = normalized.slice(1, -1);
        }
        
        // Nettoyer les caractères invisibles (BOM, etc.)
        normalized = normalized.replace(/[\u200B-\u200D\uFEFF]/g, '');
        
        // Corriger les caractères mal encodés (é, è, à, etc.) - IMPORTANT: après le nettoyage
        normalized = fixCellEncoding(normalized);
        
        // Remplacer les espaces multiples par un seul
        normalized = normalized.replace(/\s+/g, ' ');
        
        return normalized.trim();
    }

    /**
     * Normalise une valeur
     */
    private normalizeValue(value: any): string {
        if (value === null || value === undefined) return '';
        
        let normalized = String(value).trim();
        
        // Supprimer les guillemets inutiles
        if ((normalized.startsWith('"') && normalized.endsWith('"')) ||
            (normalized.startsWith("'") && normalized.endsWith("'"))) {
            normalized = normalized.slice(1, -1);
        }
        
        return normalized;
    }

    private parseLargeCSV(lines: string[], isBo: boolean, fileName: string): void {
        const parseStartTime = performance.now();
        const CHUNK_SIZE = 10000;
        const data: Record<string, string>[] = [];
        
        
        // Activer l'indicateur de progression
        this.isProcessingLargeFile = true;
        this.processingMessage = 'Traitement du fichier volumineux...';
        this.processingProgress = 0;
        
        // Détecter le délimiteur et les en-têtes
        const detectStartTime = performance.now();
        const firstLine = lines[0];
        const delimiter = this.detectDelimiter(firstLine);
        const headers = firstLine.split(delimiter);
        const detectDuration = ((performance.now() - detectStartTime) / 1000).toFixed(3);
        
        
        // Traitement par chunks
        for (let i = 1; i < lines.length; i += CHUNK_SIZE) {
            const chunk = lines.slice(i, i + CHUNK_SIZE);
            const chunkData: Record<string, string>[] = [];
            
            for (const line of chunk) {
                if (line.trim() === '') continue;
                
                const values = line.split(delimiter);
                const row: Record<string, string> = {};
                
                headers.forEach((header, index) => {
                    row[header] = values[index] || '';
                });
                
                chunkData.push(row);
            }
            
            data.push(...chunkData);
            
            // Mettre à jour la progression
            const progress = Math.min(100, (i / lines.length) * 100);
            this.processingProgress = Math.round(progress);
            this.processingMessage = `Traitement: ${data.length} lignes traitées sur ${lines.length - 1}`;
            
            
            // Petite pause pour permettre l'affichage de la progression
            setTimeout(() => {}, 10);
        }
        
        const parseEndTime = performance.now();
        const parseDuration = ((parseEndTime - parseStartTime) / 1000).toFixed(2);
        
        // Désactiver l'indicateur de progression
        this.isProcessingLargeFile = false;
        this.processingProgress = 0;
        this.processingMessage = '';
        
        // Traitement des données avec logs
        const postProcessStartTime = performance.now();
        
        try {
            if (isBo) {
                const selectionStartTime = performance.now();
                this.boData = this.applyOrangeMoneyColumnSelection(data, fileName);
                const selectionDuration = ((performance.now() - selectionStartTime) / 1000).toFixed(2);
            } else {
                const convertStartTime = performance.now();
                const convertedData = this.convertDebitCreditToNumber(data);
                const convertDuration = ((performance.now() - convertStartTime) / 1000).toFixed(2);
                
                const selectionStartTime = performance.now();
                this.partnerData = this.applyOrangeMoneyColumnSelection(convertedData, fileName);
                const selectionDuration = ((performance.now() - selectionStartTime) / 1000).toFixed(2);
            }
            
            const postProcessDuration = ((performance.now() - postProcessStartTime) / 1000).toFixed(2);
            
            // Mettre à jour l'estimation seulement si les deux fichiers sont chargés
            if (this.boFile && this.partnerFile) {
                const estimateStartTime = performance.now();
                this.updateEstimatedTime();
                const estimateDuration = ((performance.now() - estimateStartTime) / 1000).toFixed(2);
            }
            
            // Forcer la détection des changements
            this.cd.detectChanges();
            
        } catch (error) {
            const errorTime = performance.now();
            const errorDuration = ((errorTime - postProcessStartTime) / 1000).toFixed(2);
            throw error;
        }
    }

    private detectDelimiter(line: string): string {
        const delimiters = [';', ',', '\t', '|'];
        let bestDelimiter = ';'; // Délimiteur par défaut
        let maxCount = 0;
        
        for (const delimiter of delimiters) {
            const count = (line.match(new RegExp('\\' + delimiter, 'g')) || []).length;
            if (count > maxCount) {
                maxCount = count;
                bestDelimiter = delimiter;
            }
        }
        
        return bestDelimiter;
    }

    /**
     * Vérifie si les clés semblent être des en-têtes valides plutôt que des données
     */
    private hasValidHeaders(keys: string[]): boolean {
        if (!keys || keys.length === 0) return false;
        
        // Filtrer les clés vides et les colonnes génériques
        const nonEmptyKeys = keys.filter(key => key && key.trim() !== '' && !key.startsWith('Col'));
        
        if (nonEmptyKeys.length === 0) return false;
        
        // Patterns de données à rejeter (plus stricts)
        const dataPatterns = [
            /^\d{8,}$/, // Numéros longs (IDs, téléphones, etc.) - 8 chiffres ou plus
            /^\d{4}-\d{2}-\d{2}/, // Dates
            /^\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}/, // Dates avec heures
            /^\d+\.\d+$/, // Nombres décimaux simples
            /^[a-z0-9-]{10,}$/i, // Codes/identifiants alphanumériques longs (ex: cos-20w0wph3r2a1t)
            /^0\d{9}$/, // Numéros de téléphone (10 chiffres commençant par 0)
            /^[A-Z]{2,}_[A-Z0-9_]+$/i, // Codes en majuscules avec underscores (ex: CI_PAIEMENTWAVE_LONACI)
            /^[A-Z]{3,}$/, // Codes en majuscules (ex: CASH, API)
            /^Col\d+$/, // Colonnes génériques
            /^Successful$/, // Statuts
            /^Cash in$/, // Types de transaction
            /^Cash out$/, // Types de transaction
            /^FRI:\d+\/MSISDN$/, // Références Orange Money
            /^ID:\d+\/(MM|MSISDN|USER)$/, // IDs Orange Money
            /^INTOUCH CASHIN CASHOUT$/, // Services Orange Money
            /^INTOUCH PAYMENT$/, // Services Orange Money
            /^depot\s+\d+\s+\d+$/, // Descriptions de dépôt
            /^Un paiement de \d+ XAF/, // Descriptions de paiement
            /^-\d+$/, // Montants négatifs
            /^XAF$/, // Devises
            /^Debit$/, // Types de transaction
            /^PC0_\d+$/, // Codes de transaction
            /^null$/i, // Valeurs null
            /^\d{13,}$/, // Timestamps longs
        ];
        
        // Patterns d'en-têtes valides (mots-clés typiques)
        const headerPatterns = [
            /^(N°|Numéro|Number|ID|Id)$/i,
            /^(Date|Heure|Time|Timestamp)$/i,
            /^(Référence|Reference|Ref)$/i,
            /^(Montant|Amount|Somme)$/i,
            /^(Opération|Operation|Transaction)$/i,
            /^(Agent|Correspondant|Correspondent)$/i,
            /^(Service|Type|Category)$/i,
            /^(Statut|Status|État|State)$/i,
            /^(Compte|Account|Wallet)$/i,
            /^(Téléphone|Phone|Tel)$/i,
            /^(Description|Libellé|Label)$/i,
            /^(Colonne|Column|Champ|Field)$/i,
        ];
        
        // Compter les correspondances avec les patterns de données
        const dataMatches = nonEmptyKeys.filter(key => 
            dataPatterns.some(pattern => pattern.test(key.trim()))
        ).length;
        
        // Compter les correspondances avec les patterns d'en-têtes
        const headerMatches = nonEmptyKeys.filter(key => 
            headerPatterns.some(pattern => pattern.test(key.trim()))
        ).length;
        
        // Calculer le ratio de données vs en-têtes
        const dataRatio = dataMatches / nonEmptyKeys.length;
        const headerRatio = headerMatches / nonEmptyKeys.length;
        
        // Critères de rejet (plus stricts)
        // 1. Si plus de 40% des clés sont des données, c'est probablement une ligne de données
        // 2. Si moins de 10% des clés sont des en-têtes valides, c'est probablement une ligne de données
        // 3. Si on a beaucoup de numéros longs ou de codes, c'est probablement des données
        const hasManyDataPatterns = dataRatio > 0.4;
        const hasFewHeaders = headerRatio < 0.1;
        const hasManyLongNumbers = nonEmptyKeys.filter(k => /^\d{8,}$/.test(k.trim())).length > nonEmptyKeys.length * 0.3;
        const hasManyCodes = nonEmptyKeys.filter(k => /^[A-Z0-9_-]{8,}$/i.test(k.trim())).length > nonEmptyKeys.length * 0.3;
        
        const isDataLike = hasManyDataPatterns || (hasFewHeaders && (hasManyLongNumbers || hasManyCodes));
        
        
        return !isDataLike;
    }

    /**
     * Parse un fichier CSV sans en-têtes en générant des noms de colonnes
     * Essaie d'abord de trouver une vraie ligne d'en-tête dans les premières lignes
     */
    private parseCSVWithoutHeaders(text: string, delimiter: string, isBo: boolean, fileName: string): void {
        
        Papa.parse(text, {
            header: false,
            delimiter: delimiter,
            skipEmptyLines: true,
            complete: (results) => {
                const rawRows = results.data as any[][];
                
                if (rawRows.length === 0) {
                    return;
                }
                
                // Chercher une vraie ligne d'en-tête dans les 20 premières lignes
                let headerRowIndex = -1;
                let headers: string[] = [];
                
                for (let i = 0; i < Math.min(20, rawRows.length); i++) {
                    const row = rawRows[i];
                    if (!row || row.length === 0) continue;
                    
                    const rowStrings = row.map(cell => String(cell || '').trim());
                    if (this.hasValidHeaders(rowStrings)) {
                        headerRowIndex = i;
                        headers = rowStrings.map((h, idx) => {
                            const normalized = this.normalizeColumnName(h);
                            return normalized || `Colonne_${idx + 1}`;
                        });
                        break;
                    }
                }
                
                // Si aucune ligne d'en-tête valide trouvée, générer des noms de colonnes
                if (headerRowIndex === -1) {
                    const firstRow = rawRows[0];
                    const columnCount = firstRow ? firstRow.length : 0;
                    headers = Array.from({ length: columnCount }, (_, i) => `Colonne_${i + 1}`);
                    headerRowIndex = 0; // Utiliser la première ligne comme données
                }
                
                
                // Créer les lignes de données avec les en-têtes trouvés ou générés
                const processedRows: any[] = [];
                const dataStartIndex = headerRowIndex + 1; // Commencer après la ligne d'en-tête
                
                for (let i = dataStartIndex; i < rawRows.length; i++) {
                    const rowData = rawRows[i];
                    if (!rowData || rowData.length === 0) continue;
                    
                    const row: any = {};
                    headers.forEach((header: string, index: number) => {
                        const value = rowData[index];
                        row[header] = value !== undefined && value !== null ? String(value).trim() : '';
                    });
                    processedRows.push(row);
                }
                
                
                if (isBo) {
                    this.boData = this.applyOrangeMoneyColumnSelection(this.normalizeData(processedRows), fileName);
                } else {
                    this.partnerData = this.applyOrangeMoneyColumnSelection(this.normalizeData(this.convertDebitCreditToNumber(processedRows)), fileName);
                }
                
                // Mettre à jour l'estimation seulement si les deux fichiers sont chargés
                if (this.boFile && this.partnerFile) {
                    this.updateEstimatedTime();
                }
                // Forcer la détection des changements
                this.cd.detectChanges();
            },
            error: (error: any) => {
            }
        });
    }

    private parseXLSX(file: File, isBo: boolean): void {
        const reader = new FileReader();
        reader.onload = (e: ProgressEvent<FileReader>) => {
            try {
                
                const data = new Uint8Array(e.target?.result as ArrayBuffer);
                const workbook = XLSX.read(data, { type: 'array' });
                
                
                const firstSheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[firstSheetName];
                
                
                // Conversion en tableau de tableaux pour analyse
                const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[][];
                if (jsonData.length === 0) {
                    this.errorMessage = 'Le fichier Excel est vide ou ne contient pas de données';
                    return;
                }
                
                
                // Détecter les en-têtes avec une méthode améliorée
                const headerDetection = this.detectExcelHeadersImproved(jsonData);
                const headers = headerDetection.headerRow;
                const headerRowIndex = headerDetection.headerRowIndex;
                
                
                // Vérifier si c'est un fichier Orange Money
                const isOrangeMoneyFile = headers.some(header => 
                    header && (
                        header.toLowerCase().includes('n°') || 
                        header.toLowerCase().includes('référence') ||
                        header.toLowerCase().includes('reference') ||
                        header.toLowerCase().includes('compte orange money')
                    )
                );
                
                
                // Vérifier si des en-têtes valides ont été trouvés
                if (!headers || headers.length === 0 || headers.every(h => !h || h.trim() === '')) {
                    const fallbackHeaders = jsonData[0]?.map((h, idx) => h || `Col${idx + 1}`) || [];
                    const correctedHeaders = fallbackHeaders.map(header => this.normalizeColumnName(header));
                    
                    // Créer les lignes de données
                    const rows: any[] = [];
                    for (let i = 1; i < jsonData.length; i++) {
                        const rowData = jsonData[i] as any[];
                        if (!rowData || rowData.length === 0) continue;
                        
                        const row: any = {};
                        correctedHeaders.forEach((header: string, index: number) => {
                            const value = rowData[index];
                            this.assignExcelCellValue(row, header, value);
                        });
                        rows.push(row);
                    }
                    
                    if (isBo) {
                        this.boData = this.applyOrangeMoneyColumnSelection(this.normalizeData(rows), file.name);
                        
                        // Vérifier si c'est un fichier TRXBO et déclencher la sélection des services (pour le mode manuel)
                        if (this.reconciliationMode === 'manual') {
                            setTimeout(() => {
                                if (this.boData && this.boData.length > 0) {
                                    if (this.detectTRXBOAndExtractServicesForManual(this.boData)) {
                                        if (this.availableAgencies.length > 0) {
                                            this.showAgencySelectionStep();
                                        } else {
                                            this.showManualServiceSelectionStep();
                                        }
                                    }
                                }
                            }, 100);
                        }
                    } else {
                        this.partnerData = this.applyOrangeMoneyColumnSelection(this.normalizeData(this.convertDebitCreditToNumber(rows)), file.name);
                        
                        // Vérifier si le fichier partenaire a des colonnes service/type/statut et déclencher la sélection (pour le mode manuel)
                        if (this.reconciliationMode === 'manual') {
                            setTimeout(() => {
                                if (this.partnerData && this.partnerData.length > 0) {
                                    const pr = this.detectPartnerServiceTypeAndStatusForManual(this.partnerData);
                                    if (pr === 'agency') {
                                        this.showPartnerAgencySelectionStep();
                                    } else if (pr === 'services') {
                                        this.showManualPartnerServiceSelectionStep();
                                    }
                                }
                            }, 100);
                        }
                    }
                    // Forcer la détection des changements
                    this.cd.detectChanges();
                } else {
                    // Corriger les caractères spéciaux dans les en-têtes
                    const correctedHeaders = headers.map(header => this.normalizeColumnName(header));
                    
                    // Créer les lignes de données en commençant après la ligne d'en-tête
                    const rows: any[] = [];
                    for (let i = headerRowIndex + 1; i < jsonData.length; i++) {
                        const rowData = jsonData[i] as any[];
                        if (!rowData || rowData.length === 0) continue;
                        
                        const row: any = {};
                        correctedHeaders.forEach((header: string, index: number) => {
                            const value = rowData[index];
                            this.assignExcelCellValue(row, header, value);
                        });
                        rows.push(row);
                    }
                    
                    
                    if (isBo) {
                        this.boData = this.applyOrangeMoneyColumnSelection(this.normalizeData(rows), file.name);
                        
                        // Vérifier si c'est un fichier TRXBO et déclencher la sélection des services (pour le mode manuel)
                        if (this.reconciliationMode === 'manual') {
                            setTimeout(() => {
                                if (this.boData && this.boData.length > 0) {
                                    if (this.detectTRXBOAndExtractServicesForManual(this.boData)) {
                                        if (this.availableAgencies.length > 0) {
                                            this.showAgencySelectionStep();
                                        } else {
                                            this.showManualServiceSelectionStep();
                                        }
                                    }
                                }
                            }, 100);
                        }
                    } else {
                        this.partnerData = this.applyOrangeMoneyColumnSelection(this.normalizeData(this.convertDebitCreditToNumber(rows)), file.name);
                        
                        // Vérifier si le fichier partenaire a des colonnes service/type/statut et déclencher la sélection (pour le mode manuel)
                        if (this.reconciliationMode === 'manual') {
                            setTimeout(() => {
                                if (this.partnerData && this.partnerData.length > 0) {
                                    const pr = this.detectPartnerServiceTypeAndStatusForManual(this.partnerData);
                                    if (pr === 'agency') {
                                        this.showPartnerAgencySelectionStep();
                                    } else if (pr === 'services') {
                                        this.showManualPartnerServiceSelectionStep();
                                    }
                                }
                            }, 100);
                        }
                    }
                    // Forcer la détection des changements
                    this.cd.detectChanges();
                }
                
                
                // Appliquer le filtrage automatique Orange Money si nécessaire
                if (isOrangeMoneyFile) {
                    this.applyAutomaticOrangeMoneyFilterForFileUpload(file.name, isBo);
                }
                
                // Mettre à jour l'estimation seulement si les deux fichiers sont chargés
                if (this.boFile && this.partnerFile) {
                    this.updateEstimatedTime();
                }
                
            } catch (error) {
                this.errorMessage = `Erreur lors de la lecture du fichier Excel: ${error}`;
            }
        };
        reader.onerror = (e) => {
            this.errorMessage = 'Erreur lors de la lecture du fichier';
        };
        reader.readAsArrayBuffer(file);
    }

    /**
     * Méthode améliorée pour détecter les en-têtes Excel
     */
    private detectExcelHeadersImproved(jsonData: any[][], silent = false): { headerRowIndex: number; headerRow: string[] } {
        if (!silent) {
        }

        const maxRowsToCheck = Math.min(300, jsonData.length);
        let bestHeaderRowIndex = 0;
        let bestScore = 0;
        let bestHeaderRow: string[] = [];

        for (let i = 0; i < maxRowsToCheck; i++) {
            const row = jsonData[i] as any[];
            if (!row || row.length === 0) continue;

            const rowStrings = row.map((cell: any) => {
                if (cell === null || cell === undefined || cell === '') return '';
                const cellString = String(cell).trim();
                return cellString || '';
            });

            if (!silent) {
            }

            const score = this.calculateHeaderScore(rowStrings, i);

            if (!silent) {
            }

            if (score > bestScore) {
                bestScore = score;
                bestHeaderRowIndex = i;
                bestHeaderRow = [...rowStrings];
                if (!silent) {
                }
            }
        }

        if (!silent) {
        }
        
        // Fallback orienté Orange Money: si la meilleure ligne ne contient pas assez d'indices, chercher plus bas
        const omTargets = ['référence','reference','débit','debit','crédit','credit','n°','no','nº','compte','date','service','statut','status'];
        const bestOmMatches = (bestHeaderRow || []).reduce((acc, c) => {
            const v = (c || '').toString().toLowerCase();
            return acc + (omTargets.some(t => v.includes(t)) ? 1 : 0);
        }, 0);
        if (bestOmMatches < 4) {
            for (let i = bestHeaderRowIndex + 1; i < Math.min(bestHeaderRowIndex + 80, jsonData.length); i++) {
                const row = jsonData[i] || [];
                const rowStrings = row.map(cell => (cell !== undefined && cell !== null) ? String(cell).trim() : '');
                const matches = rowStrings.reduce((acc, c) => acc + (omTargets.some(t => c.toLowerCase().includes(t)) ? 1 : 0), 0);
                if (matches >= 4) {
                    bestHeaderRowIndex = i;
                    bestHeaderRow = [...rowStrings];
                    if (!silent) {
                    }
                    break;
                }
            }
        }

        return {
            headerRowIndex: bestHeaderRowIndex,
            headerRow: bestHeaderRow
        };
    }

    /**
     * Calcule le score d'une ligne pour déterminer si c'est un en-tête
     */
    private calculateHeaderScore(rowStrings: string[], rowIndex: number): number {
        let score = 0;
        
        // Vérification défensive
        if (!Array.isArray(rowStrings)) {
            return 0;
        }
        
        const nonEmptyColumns = rowStrings.filter(cell => cell !== '').length;
        
        // Bonus pour avoir plusieurs colonnes non vides
        if (nonEmptyColumns >= 3) score += 10;
        if (nonEmptyColumns >= 6) score += 10;
        
        // Bonus pour les mots-clés d'en-tête
        const headerKeywords = [
            'N°', 'Date', 'Heure', 'Référence', 'Service', 'Paiement', 'Statut', 'Mode',
            'Compte', 'Wallet', 'Pseudo', 'Débit', 'Crédit', 'Montant', 'Commissions',
            'Opération', 'Agent', 'Correspondant', 'Sous-réseau', 'Transaction',
            'ID', 'External', 'Reference', 'Amount', 'Status', 'Phone', 'Email',
            'Transaction ID', 'Sender Msisdn', 'Receiver Msisdn', 'Post Balance', 'Previous Balance',
            'S. No', 'Service Name', 'Transaction Status', 'external_transaction',
            'Organization Short Code', 'Receipt No', 'Initiation Time', 'Completion Time',
            'Paid In', 'Withdrawn', 'ThirdPartyTransactionId', 'Initiator MSISDN',
            'Code court de l\'organisation', 'N° de reçu', 'Heure d\'initiation', 'Heure de fin',
            'Versé', 'Retiré', 'Statut de la transaction', 'MSISDN de l\'initiateur'
        ];
        
        for (const cell of rowStrings) {
            // Vérification robuste pour éviter les erreurs undefined/null
            if (!cell || cell === '' || typeof cell !== 'string') continue;
            
            for (const keyword of headerKeywords) {
                if (cell.toLowerCase().includes(keyword.toLowerCase())) {
                    score += 5;
                }
            }
            
            // Bonus pour les colonnes "N°"
            if (cell.includes('N°') || cell === 'N') score += 15;
            
            // Bonus pour les caractères spéciaux typiques des en-têtes
            if (cell.includes('é') || cell.includes('è') || cell.includes('à') || 
                cell.includes('ç') || cell.includes('ù') || cell.includes('ô')) score += 3;
        }

        // Heuristique spécifique Orange Money
        const rowLower = rowStrings.map(c => c.toLowerCase());
        const omTargets = ['référence','reference','débit','debit','crédit','credit','n°','no','nº','compte','date','service','statut','status'];
        const omMatches = rowLower.reduce((acc, v) => acc + (omTargets.some(t => v.includes(t)) ? 1 : 0), 0);
        score += omMatches * 5;
        if (omMatches >= 5) score += 30;
        // Bonus si présence combinée de Date + (Référence) + (Débit|Crédit)
        const hasDate = rowLower.some(v => v.includes('date'));
        const hasRef  = rowLower.some(v => v.includes('référence') || v.includes('reference'));
        const hasAmt  = rowLower.some(v => v.includes('débit') || v.includes('debit') || v.includes('crédit') || v.includes('credit'));
        if (hasDate && hasRef && hasAmt) score += 20;

        score += scoreMerchantReportHeaderRow(rowStrings);
        
        // Pénalité pour les lignes avec peu de colonnes non vides
        if (nonEmptyColumns < 2) {
            score -= 5;
        }
        
        // Bonus pour les premières lignes (plus probable d'être des en-têtes)
        if (rowIndex <= 2) {
            score += 5;
        }
        
        return score;
    }

    /**
     * Détermine le format Excel du fichier
     */
    private getExcelFormat(fileName: string): string {
        const fileNameLower = fileName.toLowerCase();
        if (fileNameLower.endsWith('.xls')) return 'Excel 97-2003 (.xls)';
        if (fileNameLower.endsWith('.xlsx')) return 'Excel 2007+ (.xlsx)';
        if (fileNameLower.endsWith('.xlsm')) return 'Excel avec macros (.xlsm)';
        if (fileNameLower.endsWith('.xlsb')) return 'Excel binaire (.xlsb)';
        if (fileNameLower.endsWith('.xlt')) return 'Template Excel 97-2003 (.xlt)';
        if (fileNameLower.endsWith('.xltx')) return 'Template Excel 2007+ (.xltx)';
        if (fileNameLower.endsWith('.xltm')) return 'Template Excel avec macros (.xltm)';
        return 'Format Excel inconnu';
    }

    private _canProceedCache: boolean | null = null;
    private _lastDataLengths = { bo: 0, partner: 0 };

    canProceed(): boolean {
        // Cache pour éviter les recalculs inutiles
        const currentBoLength = this.boData.length;
        const currentPartnerLength = this.partnerData.length;
        
        // Vérifier si les données ont changé depuis le dernier calcul
        if (this._lastDataLengths.bo === currentBoLength && 
            this._lastDataLengths.partner === currentPartnerLength && 
            this._canProceedCache !== null) {
            return this._canProceedCache;
        }

        const canProceed = currentBoLength > 0 && currentPartnerLength > 0;
        
        // Mettre à jour le cache et les longueurs
        this._canProceedCache = canProceed;
        this._lastDataLengths = { bo: currentBoLength, partner: currentPartnerLength };
        
        // Log seulement si les données ont changé
        
        // Forcer la détection des changements si l'état a changé
        this.cd.detectChanges();
        
        return canProceed;
    }

    onProceed(): void {
        
        if (this.canProceed()) {
            
            // Sauvegarder les données dans le service d'état
            this.appStateService.setReconciliationLaunchMode('manual');
            this.appStateService.setReconciliationEntryPath('/upload');
            this.appStateService.setReconciliationData(this.boData, this.partnerData);
            this.appStateService.setReconciliationType(this.reconciliationType);
            this.appStateService.setCurrentStep(2);
            
            // Naviguer vers la page de sélection des colonnes
            this.router.navigate(['/column-selection']);
        } else {
        }
    }

    goToStats() {
        this.appStateService.setCurrentStep(4);
        this.router.navigate(['/stats']);
    }

    /**
     * Détermine si un gros fichier est détecté
     */
    isLargeFileDetected(): boolean {
        if (!this.boFile || !this.partnerFile) {
            return false;
        }
        
        const totalSize = this.boFile.size + this.partnerFile.size;
        const sizeThreshold = 50 * 1024 * 1024; // 50MB
        
        // Vérifier la taille totale
        if (totalSize > sizeThreshold) {
            return true;
        }
        
        // Vérifier le nombre de lignes estimé
        const estimatedBoRows = Math.ceil(this.boFile.size / 100);
        const estimatedPartnerRows = Math.ceil(this.partnerFile.size / 100);
        
        return estimatedBoRows > 100000 || estimatedPartnerRows > 100000;
    }

    goToDashboard() {
        this.router.navigate(['/dashboard']);
    }

    // goToReconciliationLauncher() - COMMENTÉ (mode super auto désactivé)
    // goToReconciliationLauncher() {
    //     this.router.navigate(['/reconciliation-launcher']);
    // }

    // Méthodes utilitaires pour le mode automatique
    clearMessages(): void {
        this.errorMessage = '';
        this.successMessage = '';
    }

    getColumnsFromData(data: any[]): string[] {
        if (data.length === 0) return [];
        return Object.keys(data[0]);
    }

    // Méthodes pour le mode automatique
    onAutoBoFileSelected(event: Event): void {
        const input = event.target as HTMLInputElement;
        if (input.files?.length) {
            this.autoBoFile = input.files[0];
            this.autoBoFileName = this.autoBoFile.name; // Conserver le nom du fichier
            this.cd.detectChanges(); // Forcer la mise à jour de la vue
            this.parseAutoFile(this.autoBoFile, true);
        }
    }

    onAutoPartnerFileSelected(event: Event): void {
        const input = event.target as HTMLInputElement;
        if (input.files?.length) {
            this.autoPartnerFile = input.files[0];
            this.autoPartnerFileName = this.autoPartnerFile.name;
            void this.rememberPartnerModelFromFileName(this.autoPartnerFileName);
            this.cd.detectChanges();
            this.parseAutoFile(this.autoPartnerFile, false);
        }
    }

    // Méthode pour détecter si le fichier est TRXBO et extraire les agences (étape 1)
    private detectTRXBOAndExtractServices(data: Record<string, string>[]): boolean {
        if (!data || data.length === 0) return false;
        
        const firstRow = data[0];
        const columns = Object.keys(firstRow);
        
        // Vérifier si c'est un fichier TRXBO (contient une colonne "Service" ou "service")
        const hasServiceColumn = columns.some(col => 
            col.toLowerCase().includes('service') || 
            col.toLowerCase().includes('serv')
        );
        
        if (hasServiceColumn) {
            
            // D'abord, chercher la colonne Agence pour filtrer
            const agencyColumn = columns.find(col => 
                col.toLowerCase().includes('agence') || 
                col.toLowerCase().includes('agency')
            );
            
            if (agencyColumn) {
                
                // Extraire toutes les agences uniques
                const agencies = this.collectUniqueColumnValues(data, agencyColumn);
                this.availableAgencies = agencies;
                this.agencySelectionData = data;
                this.agencyColumn = agencyColumn;
                
                
                return true;
            } else {
                // Pas de colonne Agence, passer directement à l'extraction des services
                return this.extractServicesFromTRXBO(data);
            }
        }
        
        return false;
    }

    // Méthode pour extraire les services après filtrage par agence
    private extractServicesFromTRXBO(data: Record<string, string>[]): boolean {
        if (!data || data.length === 0) return false;
        
        const firstRow = data[0];
        const columns = Object.keys(firstRow);
        
        // Trouver la colonne service
        const serviceColumn = columns.find(col => 
            col.toLowerCase().includes('service') || 
            col.toLowerCase().includes('serv')
        );

        // Trouver la colonne statut (mode auto)
        const statusColumn = columns.find(col => {
            const c = col.toLowerCase();
            return c.includes('statut') || c.includes('status') || c.includes('état') || c.includes('state');
        });
        this.autoStatusColumn = statusColumn || null;
        
        if (serviceColumn) {
            // Extraire tous les services uniques
            const services = this.collectUniqueColumnValues(data, serviceColumn);
            this.availableServices = services;
            this.serviceSelectionData = data;
            
            if (statusColumn) {
            }
            
            return true;
        }
        
        return false;
    }

    // Méthode pour détecter TRXBO et extraire les agences pour le mode manuel (étape 1)
    private detectTRXBOAndExtractServicesForManual(data: Record<string, string>[]): boolean {
        if (!data || data.length === 0) return false;
        
        const firstRow = data[0];
        const columns = Object.keys(firstRow);
        
        // Vérifier si c'est un fichier TRXBO (contient une colonne "Service" ou "service")
        const hasServiceColumn = columns.some(col => 
            col.toLowerCase().includes('service') || 
            col.toLowerCase().includes('serv')
        );
        
        if (hasServiceColumn) {
            
            // D'abord, chercher la colonne Agence pour filtrer
            const agencyColumn = columns.find(col => 
                col.toLowerCase().includes('agence') || 
                col.toLowerCase().includes('agency')
            );
            
            if (agencyColumn) {
                
                // Extraire toutes les agences uniques
                const agencies = this.collectUniqueColumnValues(data, agencyColumn);
                this.availableAgencies = agencies;
                this.agencySelectionData = data;
                this.agencyColumn = agencyColumn;
                
                
                return true;
            } else {
                // Pas de colonne Agence, passer directement à l'extraction des services
                return this.extractServicesFromTRXBOForManual(data);
            }
        }
        
        return false;
    }

    // Méthode pour extraire les services après filtrage par agence (mode manuel)
    private extractServicesFromTRXBOForManual(data: Record<string, string>[]): boolean {
        if (!data || data.length === 0) return false;
        
        const firstRow = data[0];
        const columns = Object.keys(firstRow);
        
        // Trouver la colonne service
        const serviceColumn = columns.find(col => 
            col.toLowerCase().includes('service') || 
            col.toLowerCase().includes('serv')
        );
        
        // Trouver la colonne statut
        const statusColumn = columns.find(col => {
            const colLower = col.toLowerCase();
            return colLower.includes('statut') || 
                   colLower.includes('status') ||
                   colLower.includes('état') ||
                   colLower.includes('state');
        });
        
        if (serviceColumn) {
            // Extraire tous les services uniques
            const services = [...new Set(data.map(row => row[serviceColumn]).filter(service => service && service.trim()))];
            this.manualAvailableServices = services.sort();
            this.manualServiceSelectionData = data;
            this.manualStatusColumn = statusColumn || null;
            
            if (statusColumn) {
            }
            
            
            return true;
        }
        
        return false;
    }

    // Méthode pour détecter les colonnes service/type/statut (et agence si présente) — fichiers partenaires, mode manuel
    private detectPartnerServiceTypeAndStatusForManual(data: Record<string, string>[]): false | 'agency' | 'services' {
        if (!data || data.length === 0) return false;

        this.partnerAgencyColumn = null;
        this.partnerAgencySelectionData = [];
        this.partnerAvailableAgencies = [];
        this.partnerServiceSelectionData = [];
        this.partnerServiceCounts = {};
        this.partnerAvailableServices = [];
        
        const firstRow = data[0];
        const columns = Object.keys(firstRow);
        
        const serviceColumn = columns.find(col => {
            const colLower = col.toLowerCase();
            return colLower.includes('service') ||
                   colLower.includes('serv') ||
                   colLower.includes('type');
        });
        
        const statusColumn = columns.find(col => {
            const colLower = col.toLowerCase();
            return colLower.includes('statut') ||
                   colLower.includes('status') ||
                   colLower.includes('état') ||
                   colLower.includes('généré le') ||
                   colLower.includes('genere le');
        });

        const agencyColumn = columns.find(col => {
            const c = col.toLowerCase();
            return c.includes('agence') || c.includes('agency');
        });
        
        if (!serviceColumn) {
            return false;
        }

        this.partnerServiceColumn = serviceColumn;
        this.partnerStatusColumn = statusColumn || null;

        if (agencyColumn) {
            const agencies = [...new Set(
                data.map(row => row[agencyColumn])
                    .filter(agency => agency && agency.toString().trim())
            )].sort();
            if (agencies.length > 0) {
                this.partnerAvailableAgencies = agencies;
                this.partnerAgencySelectionData = data;
                this.partnerAgencyColumn = agencyColumn;
                return 'agency';
            }
        }
        
        const services = [...new Set(
            data.map(row => row[serviceColumn])
                .filter(service => service && service.toString().trim())
        )].sort();
        
        this.partnerAvailableServices = services;
        this.assignPartnerServiceSelectionData(data);
        
        return 'services';
    }

    // Méthode pour détecter les colonnes service/type/statut (et agence si présente) dans les fichiers partenaires (mode automatique)
    private detectPartnerServiceTypeAndStatus(data: Record<string, string>[]): false | 'agency' | 'services' {
        if (!data || data.length === 0) return false;

        this.partnerAgencyColumn = null;
        this.partnerAgencySelectionData = [];
        this.partnerAvailableAgencies = [];
        this.partnerServiceSelectionData = [];
        this.partnerServiceCounts = {};
        this.partnerAvailableServices = [];

        const firstRow = data[0];
        const columns = Object.keys(firstRow);

        // Chercher une colonne service ou type
        const serviceColumn = columns.find(col => {
            const colLower = col.toLowerCase();
            return colLower.includes('service') || 
                   colLower.includes('serv') ||
                   colLower.includes('type');
        });
        
        // Chercher une colonne statut
        const statusColumn = columns.find(col => {
            const colLower = col.toLowerCase();
            return colLower.includes('statut') || 
                   colLower.includes('status') ||
                   colLower.includes('état') ||
                   colLower.includes('généré le') ||
                   colLower.includes('genere le');
        });
        
        const agencyColumn = columns.find(col => {
            const c = col.toLowerCase();
            return c.includes('agence') || c.includes('agency');
        });

        // Si on trouve au moins une colonne service/type, on active la sélection
        if (serviceColumn) {
            this.partnerServiceColumn = serviceColumn;
            this.partnerStatusColumn = statusColumn || null;

            if (agencyColumn) {
                const agencies = [...new Set(
                    data.map(row => row[agencyColumn])
                        .filter(agency => agency && agency.toString().trim())
                )].sort();

                if (agencies.length > 0) {
                    this.partnerAvailableAgencies = agencies;
                    this.partnerAgencySelectionData = data;
                    this.partnerAgencyColumn = agencyColumn;
                    return 'agency';
                }
            }

            if (statusColumn) {
            }

            // Extraire toutes les valeurs uniques de service/type
            const services = [...new Set(
                data.map(row => row[serviceColumn])
                    .filter(service => service && service.toString().trim())
            )];

            this.partnerAvailableServices = services.sort();
            this.assignPartnerServiceSelectionData(data);


            return 'services';
        }

        return false;
    }

    private handleAutoPartnerSelectionFlow(): void {
        const detected = this.detectPartnerServiceTypeAndStatus(this.autoPartnerData);
        if (detected === 'agency') {
            this.showPartnerAgencySelectionStep();
        } else if (detected === 'services') {
            this.showPartnerServiceSelectionStep();
        }
    }

    private showPartnerServiceSelectionForCurrentMode(): void {
        if (this.reconciliationMode === 'manual') {
            this.showManualPartnerServiceSelectionStep();
            return;
        }

        this.showPartnerServiceSelectionStep();
    }

    // Méthode pour afficher la sélection des agences (TRXBO - étape 1)
    private showAgencySelectionStep(): void {
        this.showAgencySelection = true;
        this.agencySearchFilter = '';
        this.selectedAgencies = [...this.availableAgencies]; // Sélectionner toutes par défaut
    }

    // Méthode pour confirmer la sélection des agences (TRXBO)
    confirmAgencySelection(): void {
        if (this.selectedAgencies.length === 0) {
            this.errorMessage = 'Veuillez sélectionner au moins une agence.';
            return;
        }

        
        // Filtrer les données pour ne garder que les lignes des agences sélectionnées
        if (!this.agencyColumn || !this.agencySelectionData || this.agencySelectionData.length === 0) {
            this.errorMessage = 'Erreur: colonne Agence non trouvée.';
            return;
        }
        
        const filteredData = this.agencySelectionData.filter(row => 
            this.selectedAgencies.includes(row[this.agencyColumn!])
        );
        
        
        // Maintenant extraire les services des données filtrées
        // Vérifier si on est en mode manuel ou automatique
        if (this.reconciliationMode === 'manual') {
            if (this.extractServicesFromTRXBOForManual(filteredData)) {
                // Masquer la sélection des agences
                this.showAgencySelection = false;
                
                // Forcer la détection des changements pour mettre à jour la vue
                this.cd.detectChanges();
                
                // Afficher la sélection des services (mode manuel)
                this.showManualServiceSelectionStep();
            } else {
                this.errorMessage = 'Erreur lors de l\'extraction des services.';
            }
        } else {
            if (this.extractServicesFromTRXBO(filteredData)) {
                // Masquer la sélection des agences
                this.showAgencySelection = false;
                
                // Forcer la détection des changements pour mettre à jour la vue
                this.cd.detectChanges();
                
                // Afficher la sélection des services
                this.showServiceSelectionStep();
            } else {
                this.errorMessage = 'Erreur lors de l\'extraction des services.';
            }
        }
    }

    // Méthode pour annuler la sélection des agences
    cancelAgencySelection(): void {
        this.showAgencySelection = false;
        this.agencySearchFilter = '';
        this.availableAgencies = [];
        this.selectedAgencies = [];
        this.agencySelectionData = [];
        this.agencyColumn = null;
    }

    // ——— Agences fichier partenaire (mode manuel), même principe que TRXBO ———

    private showPartnerAgencySelectionStep(): void {
        this.showPartnerAgencySelection = true;
        this.partnerAgencySearchFilter = '';
        this.partnerAgenciesSelectionBeforeSearch = null;
        this.partnerSelectedAgencies = [...this.partnerAvailableAgencies];
        this.cd.detectChanges();
    }

    confirmPartnerAgencySelection(): void {
        if (this.partnerSelectedAgencies.length === 0) {
            this.errorMessage = 'Veuillez sélectionner au moins une agence.';
            return;
        }
        if (!this.partnerAgencyColumn || !this.partnerAgencySelectionData?.length || !this.partnerServiceColumn) {
            this.errorMessage = 'Erreur : données agence partenaire incomplètes.';
            return;
        }

        const filteredData = this.partnerAgencySelectionData.filter(row =>
            this.partnerSelectedAgencies.includes(row[this.partnerAgencyColumn!])
        );


        const services = [...new Set(
            filteredData.map(row => row[this.partnerServiceColumn!])
                .filter(s => s && s.toString().trim())
        )].sort();

        this.partnerAvailableServices = services;
        this.assignPartnerServiceSelectionData(filteredData);
        this.showPartnerAgencySelection = false;
        this.partnerAgencySearchFilter = '';
        this.partnerAgencySelectionData = [];
        this.partnerAgencyColumn = null;

        this.cd.detectChanges();
        this.showPartnerServiceSelectionForCurrentMode();
    }

    cancelPartnerAgencySelection(): void {
        this.showPartnerAgencySelection = false;
        this.partnerAgencySearchFilter = '';
        this.partnerAvailableAgencies = [];
        this.partnerSelectedAgencies = [];
        this.partnerAgencySelectionData = [];
        this.partnerAgencyColumn = null;
        this.partnerServiceColumn = null;
        this.partnerStatusColumn = null;
        this.partnerAgenciesSelectionBeforeSearch = null;
    }

    skipPartnerAgencySelection(): void {
        if (!this.partnerAvailableAgencies?.length) {
            const source = this.partnerAgencySelectionData?.length ? this.partnerAgencySelectionData : [];
            if (!source.length) {
                this.errorMessage = 'Aucune donnée disponible pour continuer.';
                return;
            }
            if (!this.partnerServiceColumn) {
                this.errorMessage = 'Colonne service/type introuvable.';
                return;
            }
            const services = [...new Set(
                source.map(row => row[this.partnerServiceColumn!])
                    .filter(s => s && s.toString().trim())
            )].sort();
            this.partnerAvailableServices = services;
            this.assignPartnerServiceSelectionData(source);
            this.showPartnerAgencySelection = false;
            this.partnerAgencySearchFilter = '';
            this.cd.detectChanges();
            this.showPartnerServiceSelectionForCurrentMode();
            return;
        }
        this.partnerSelectedAgencies = [...this.partnerAvailableAgencies];
        this.confirmPartnerAgencySelection();
    }

    onPartnerAgencySelectionChange(event: Event, agency: string): void {
        const checkbox = event.target as HTMLInputElement;
        if (checkbox.checked) {
            if (!this.partnerSelectedAgencies.includes(agency)) {
                this.partnerSelectedAgencies.push(agency);
            }
        } else {
            this.partnerSelectedAgencies = this.partnerSelectedAgencies.filter(a => a !== agency);
        }
    }

    getPartnerAgencyCount(agency: string): number {
        if (!this.partnerAgencySelectionData?.length || !this.partnerAgencyColumn) return 0;
        return this.partnerAgencySelectionData.filter(row => row[this.partnerAgencyColumn!] === agency).length;
    }

    get filteredPartnerAvailableAgencies(): string[] {
        if (!hasCommaSeparatedSearchFilter(this.partnerAgencySearchFilter)) return this.partnerAvailableAgencies;
        return this.partnerAvailableAgencies.filter(agency =>
            matchesCommaSeparatedFilter(
                this.partnerAgencySearchFilter,
                agency,
                this.getPartnerAgencyCount(agency)
            )
        );
    }

    onPartnerAgencySearchFilterChange(value: string): void {
        const hasFilter = hasCommaSeparatedSearchFilter(value);
        const hadSnapshot = Array.isArray(this.partnerAgenciesSelectionBeforeSearch);
        if (hasFilter && !hadSnapshot) {
            this.partnerAgenciesSelectionBeforeSearch = [...this.partnerSelectedAgencies];
        }
        this.partnerAgencySearchFilter = value;
        if (hasFilter) {
            this.partnerSelectedAgencies = [...this.filteredPartnerAvailableAgencies];
        } else if (hadSnapshot) {
            this.partnerSelectedAgencies = [...(this.partnerAgenciesSelectionBeforeSearch || [])];
            this.partnerAgenciesSelectionBeforeSearch = null;
        }
    }

    selectAllPartnerAgencies(): void {
        const toSelect = this.filteredPartnerAvailableAgencies;
        toSelect.forEach(agency => {
            if (!this.partnerSelectedAgencies.includes(agency)) this.partnerSelectedAgencies.push(agency);
        });
        this.partnerSelectedAgencies = [...this.partnerSelectedAgencies];
    }

    deselectAllPartnerAgencies(): void {
        const toDeselect = this.filteredPartnerAvailableAgencies;
        this.partnerSelectedAgencies = this.partnerSelectedAgencies.filter(a => !toDeselect.includes(a));
    }

    // Passer la sélection des agences : tout sélectionner ou utiliser les données telles quelles si liste vide
    skipAgencySelection(): void {
        if (!this.availableAgencies || this.availableAgencies.length === 0) {
            const sourceData = this.agencySelectionData && this.agencySelectionData.length > 0 ? this.agencySelectionData : [];
            if (sourceData.length === 0) {
                this.errorMessage = 'Aucune donnée disponible pour continuer.';
                return;
            }
            if (this.reconciliationMode === 'manual') {
                if (this.extractServicesFromTRXBOForManual(sourceData)) {
                    this.showAgencySelection = false;
                    this.cd.detectChanges();
                    this.showManualServiceSelectionStep();
                } else {
                    this.errorMessage = 'Erreur lors de l\'extraction des services.';
                }
            } else {
                if (this.extractServicesFromTRXBO(sourceData)) {
                    this.showAgencySelection = false;
                    this.cd.detectChanges();
                    this.showServiceSelectionStep();
                } else {
                    this.errorMessage = 'Erreur lors de l\'extraction des services.';
                }
            }
        } else {
            this.selectedAgencies = [...this.availableAgencies];
            this.confirmAgencySelection();
        }
    }

    // Méthode pour gérer le changement de sélection des agences
    onAgencySelectionChange(event: Event, agency: string): void {
        const checkbox = event.target as HTMLInputElement;
        if (checkbox.checked) {
            if (!this.selectedAgencies.includes(agency)) {
                this.selectedAgencies.push(agency);
            }
        } else {
            this.selectedAgencies = this.selectedAgencies.filter(a => a !== agency);
        }
    }

    // Méthode pour compter le nombre de lignes par agence
    getAgencyCount(agency: string): number {
        if (!this.agencySelectionData || this.agencySelectionData.length === 0 || !this.agencyColumn) return 0;
        
        return this.agencySelectionData.filter(row => row[this.agencyColumn!] === agency).length;
    }

    /** Liste des agences filtrée par le critère de recherche (popup) */
    get filteredAvailableAgencies(): string[] {
        if (!hasCommaSeparatedSearchFilter(this.agencySearchFilter)) return this.availableAgencies;
        return this.availableAgencies.filter(agency =>
            matchesCommaSeparatedFilter(
                this.agencySearchFilter,
                agency,
                this.getAgencyCount(agency)
            )
        );
    }

    /**
     * Auto-cocher selon la recherche, de façon cloisonnée :
     * - si un terme est saisi : ne sélectionner que les éléments visibles (filtrés)
     * - si la recherche est vidée : restaurer la sélection précédente
     */
    onAgencySearchFilterChange(value: string): void {
        const hasFilter = hasCommaSeparatedSearchFilter(value);
        const hadSnapshot = Array.isArray(this.agenciesSelectionBeforeSearch);
        if (hasFilter && !hadSnapshot) {
            this.agenciesSelectionBeforeSearch = [...this.selectedAgencies];
        }
        this.agencySearchFilter = value;
        if (hasFilter) {
            this.selectedAgencies = [...this.filteredAvailableAgencies];
        } else if (hadSnapshot) {
            this.selectedAgencies = [...(this.agenciesSelectionBeforeSearch || [])];
            this.agenciesSelectionBeforeSearch = null;
        }
    }

    // Méthode pour sélectionner toutes les agences (visibles si filtre actif)
    selectAllAgencies(): void {
        const toSelect = this.filteredAvailableAgencies;
        toSelect.forEach(agency => {
            if (!this.selectedAgencies.includes(agency)) this.selectedAgencies.push(agency);
        });
        this.selectedAgencies = [...this.selectedAgencies];
    }

    // Méthode pour désélectionner toutes les agences (visibles si filtre actif)
    deselectAllAgencies(): void {
        const toDeselect = this.filteredAvailableAgencies;
        this.selectedAgencies = this.selectedAgencies.filter(a => !toDeselect.includes(a));
    }

    // Méthode pour afficher la sélection des services
    private showServiceSelectionStep(): void {
        this.showServiceSelection = true;
        this.serviceSearchFilter = '';
        this.selectedServices = [...this.availableServices]; // Sélectionner tous par défaut
    }


    // Méthode pour confirmer la sélection des services
    confirmServiceSelection(): void {
        if (this.selectedServices.length === 0) {
            this.errorMessage = 'Veuillez sélectionner au moins un service.';
            return;
        }

        
        // Filtrer les données pour ne garder que les lignes des services sélectionnés
        const serviceColumn = Object.keys(this.serviceSelectionData[0]).find(col => 
            col.toLowerCase().includes('service') || 
            col.toLowerCase().includes('serv')
        );
        
        if (serviceColumn) {
            const filteredData = this.serviceSelectionData.filter(row => 
                this.selectedServices.includes(row[serviceColumn])
            );
            
            
            // Masquer la sélection des services
            this.showServiceSelection = false;

            // Si une colonne statut existe, afficher le popup de sélection des statuts
            if (this.autoStatusColumn && filteredData.length > 0) {
                const statuses = [...new Set(
                    filteredData.map(row => row[this.autoStatusColumn!])
                        .filter(s => s && s.toString().trim())
                )];
                this.autoAvailableStatuses = statuses.sort();
                this.autoStatusSelectionData = filteredData;
                this.showAutoStatusSelectionStep();
                this.cd.detectChanges();
                return;
            }

            // Pas de colonne statut : mettre à jour les données et continuer
            this.autoBoData = filteredData;
            this.cd.detectChanges();
            this.continueWithAutoReconciliation();
        }
    }

    // Passer la sélection des services TRXBO (mode auto) : tout sélectionner ou utiliser les données si liste vide
    skipServiceSelection(): void {
        if (!this.availableServices || this.availableServices.length === 0) {
            const sourceData = this.serviceSelectionData && this.serviceSelectionData.length > 0 ? this.serviceSelectionData : [];
            if (sourceData.length === 0) {
                this.errorMessage = 'Aucune donnée disponible pour continuer.';
                return;
            }
            if (this.autoStatusColumn && sourceData.length > 0) {
                const statuses = [...new Set(
                    sourceData.map(row => row[this.autoStatusColumn!]).filter(s => s && s.toString().trim())
                )];
                this.autoAvailableStatuses = statuses.sort();
                this.autoStatusSelectionData = sourceData;
                this.showServiceSelection = false;
                this.showAutoStatusSelectionStep();
                this.cd.detectChanges();
            } else {
                this.autoBoData = sourceData;
                this.showServiceSelection = false;
                this.cd.detectChanges();
                this.continueWithAutoReconciliation();
            }
        } else {
            this.selectedServices = [...this.availableServices];
            this.confirmServiceSelection();
        }
    }

    // Méthode pour annuler la sélection des services
    cancelServiceSelection(): void {
        this.showServiceSelection = false;
        this.serviceSearchFilter = '';
        this.availableServices = [];
        this.selectedServices = [];
        this.serviceSelectionData = [];
        // Nettoyer aussi les données de statut auto
        this.autoStatusColumn = null;
        this.showAutoStatusSelection = false;
        this.autoAvailableStatuses = [];
        this.autoSelectedStatuses = [];
        this.autoStatusSelectionData = [];
    }

    // ----- Statuts mode automatique (étape 3) -----
    private showAutoStatusSelectionStep(): void {
        this.showAutoStatusSelection = true;
        this.autoStatusSearchFilter = '';
        this.autoSelectedStatuses = [...this.autoAvailableStatuses]; // tous sélectionnés par défaut
    }

    confirmAutoStatusSelection(): void {
        if (this.autoSelectedStatuses.length === 0) {
            this.errorMessage = 'Veuillez sélectionner au moins un statut.';
            return;
        }


        const filteredData = this.autoStatusSelectionData.filter(row =>
            this.autoSelectedStatuses.includes(row[this.autoStatusColumn!])
        );


        this.autoBoData = filteredData;
        this.showAutoStatusSelection = false;
        this.cd.detectChanges();
        this.continueWithAutoReconciliation();
    }

    // Passer la sélection des statuts TRXBO (mode auto) : tout sélectionner ou utiliser les données si liste vide
    skipAutoStatusSelection(): void {
        if (!this.autoAvailableStatuses || this.autoAvailableStatuses.length === 0) {
            const sourceData = this.autoStatusSelectionData && this.autoStatusSelectionData.length > 0
                ? this.autoStatusSelectionData : [];
            if (sourceData.length === 0) {
                this.errorMessage = 'Aucune donnée disponible pour continuer.';
                return;
            }
            this.autoBoData = sourceData;
            this.showAutoStatusSelection = false;
            this.cd.detectChanges();
            this.continueWithAutoReconciliation();
        } else {
            this.autoSelectedStatuses = [...this.autoAvailableStatuses];
            this.confirmAutoStatusSelection();
        }
    }

    cancelAutoStatusSelection(): void {
        this.showAutoStatusSelection = false;
        this.autoStatusSearchFilter = '';
        this.autoAvailableStatuses = [];
        this.autoSelectedStatuses = [];
        this.autoStatusSelectionData = [];
    }

    onAutoStatusSelectionChange(event: Event, status: string): void {
        const checkbox = event.target as HTMLInputElement;
        if (checkbox.checked) {
            if (!this.autoSelectedStatuses.includes(status)) {
                this.autoSelectedStatuses.push(status);
            }
        } else {
            this.autoSelectedStatuses = this.autoSelectedStatuses.filter(s => s !== status);
        }
    }

    getAutoStatusCount(status: string): number {
        if (!this.autoStatusSelectionData.length || !this.autoStatusColumn) return 0;
        return this.autoStatusSelectionData.filter(row => row[this.autoStatusColumn!] === status).length;
    }

    get filteredAutoAvailableStatuses(): string[] {
        if (!hasCommaSeparatedSearchFilter(this.autoStatusSearchFilter)) return this.autoAvailableStatuses;
        return this.autoAvailableStatuses.filter(st =>
            matchesCommaSeparatedFilter(
                this.autoStatusSearchFilter,
                st,
                this.getAutoStatusCount(st)
            )
        );
    }

    selectAllAutoStatuses(): void {
        const toSelect = this.filteredAutoAvailableStatuses;
        toSelect.forEach(st => { if (!this.autoSelectedStatuses.includes(st)) this.autoSelectedStatuses.push(st); });
        this.autoSelectedStatuses = [...this.autoSelectedStatuses];
    }

    deselectAllAutoStatuses(): void {
        const toDeselect = this.filteredAutoAvailableStatuses;
        this.autoSelectedStatuses = this.autoSelectedStatuses.filter(st => !toDeselect.includes(st));
    }
    // ----- Fin statuts mode automatique -----

    // Méthode pour continuer avec la réconciliation automatique après sélection des services
    private continueWithAutoReconciliation(): void {
        // Cette méthode sera appelée après la sélection des services
        // Elle contiendra la logique de réconciliation automatique
        this.onAutoProceed();
    }

    // Méthode pour gérer le changement de sélection des services
    onServiceSelectionChange(event: Event, service: string): void {
        const checkbox = event.target as HTMLInputElement;
        if (checkbox.checked) {
            if (!this.selectedServices.includes(service)) {
                this.selectedServices.push(service);
            }
        } else {
            this.selectedServices = this.selectedServices.filter(s => s !== service);
        }
    }

    // Méthode pour compter le nombre de lignes par service
    getServiceCount(service: string): number {
        if (!this.serviceSelectionData || this.serviceSelectionData.length === 0) return 0;
        
        const serviceColumn = Object.keys(this.serviceSelectionData[0]).find(col => 
            col.toLowerCase().includes('service') || 
            col.toLowerCase().includes('serv')
        );
        
        if (serviceColumn) {
            return this.serviceSelectionData.filter(row => row[serviceColumn] === service).length;
        }
        
        return 0;
    }

    get filteredAvailableServices(): string[] {
        if (!hasCommaSeparatedSearchFilter(this.serviceSearchFilter)) return this.availableServices;
        return this.availableServices.filter(s =>
            matchesCommaSeparatedFilter(
                this.serviceSearchFilter,
                s,
                this.getServiceCount(s)
            )
        );
    }

    onServiceSearchFilterChange(value: string): void {
        const hasFilter = hasCommaSeparatedSearchFilter(value);
        const hadSnapshot = Array.isArray(this.servicesSelectionBeforeSearch);
        if (hasFilter && !hadSnapshot) {
            this.servicesSelectionBeforeSearch = [...this.selectedServices];
        }
        this.serviceSearchFilter = value;
        if (hasFilter) {
            this.selectedServices = [...this.filteredAvailableServices];
        } else if (hadSnapshot) {
            this.selectedServices = [...(this.servicesSelectionBeforeSearch || [])];
            this.servicesSelectionBeforeSearch = null;
        }
    }

    selectAllServices(): void {
        const toSelect = this.filteredAvailableServices;
        toSelect.forEach(s => { if (!this.selectedServices.includes(s)) this.selectedServices.push(s); });
        this.selectedServices = [...this.selectedServices];
    }

    deselectAllServices(): void {
        const toDeselect = this.filteredAvailableServices;
        this.selectedServices = this.selectedServices.filter(s => !toDeselect.includes(s));
    }

    // Méthode pour afficher la sélection des services/type/statut pour le partenaire (mode automatique)
    private showPartnerServiceSelectionStep(): void {
        this.showPartnerServiceSelection = true;
        this.partnerServiceSearchFilter = '';
        this.partnerSelectedServices = [...this.partnerAvailableServices]; // Sélectionner tous par défaut
    }

    // Méthode pour afficher la sélection des services/type/statut pour le partenaire (mode manuel)
    private showManualPartnerServiceSelectionStep(): void {
        
        // S'assurer que les autres overlays sont fermés
        if (this.showManualServiceSelection) {
            this.showManualServiceSelection = false;
        }
        if (this.showServiceSelection) {
            this.showServiceSelection = false;
        }
        
        this.showPartnerServiceSelection = true;
        this.partnerServiceSearchFilter = '';
        this.partnerSelectedServices = [...this.partnerAvailableServices]; // Sélectionner tous par défaut
        
        
        // Forcer la détection des changements pour mettre à jour la vue
        this.cd.detectChanges();
        
        // Double vérification après un court délai
        setTimeout(() => {
        }, 200);
    }

    // Méthode pour confirmer la sélection des services/type/statut partenaire
    async confirmPartnerServiceSelection(): Promise<void> {
        if (this.partnerSelectionBusy) {
            return;
        }
        if (this.partnerSelectedServices.length === 0) {
            this.errorMessage = 'Veuillez sélectionner au moins un service/type.';
            return;
        }

        
        if (!this.partnerServiceColumn || !this.partnerServiceSelectionData || this.partnerServiceSelectionData.length === 0) {
            this.errorMessage = 'Erreur: colonne service/type non trouvée.';
            return;
        }

        this.partnerSelectionBusy = true;
        this.cd.detectChanges();

        try {
            const filteredData = await this.filterPartnerRowsOrPassthrough(
                this.partnerServiceSelectionData,
                this.partnerServiceColumn,
                this.partnerSelectedServices,
                this.partnerAvailableServices,
                'Filtrage par service'
            );
            this.processingMessage = '';
        
        
            if (this.partnerStatusColumn && filteredData.length > 0) {
                const { values, counts } = this.extractUniqueSortedValuesWithCounts(
                    filteredData,
                    this.partnerStatusColumn
                );
            
                this.partnerAvailableStatuses = values;
                this.partnerStatusSelectionData = filteredData;
                this.partnerStatusCounts = counts;
            
            
                this.showPartnerServiceSelection = false;
                this.showPartnerStatusSelectionStep();
                this.cd.detectChanges();
            } else {
                const convertedData = await this.finalizePartnerSelectionData(filteredData, 'Service partenaire');
            
                if (this.reconciliationMode === 'manual') {
                    this.partnerData = convertedData;
                    this.showPartnerServiceSelection = false;
                    this.cd.detectChanges();
                    this.continueWithManualReconciliation();
                } else {
                    this.autoPartnerData = convertedData;
                    this.showPartnerServiceSelection = false;
                    this.cd.detectChanges();
                }
            }
        } finally {
            this.partnerSelectionBusy = false;
            this.processingMessage = '';
            this.cd.detectChanges();
        }
    }

    // Méthode pour passer la sélection des services/type/statut partenaire
    // Comporte comme "aucun filtrage" en sélectionnant tous les services/types disponibles
    skipPartnerServiceSelection(): void {
        this.partnerSelectedServices = [...this.partnerAvailableServices];
        this.confirmPartnerServiceSelection();
    }

    // Méthode pour annuler la sélection des services partenaire
    cancelPartnerServiceSelection(): void {
        this.showPartnerAgencySelection = false;
        this.showPartnerServiceSelection = false;
        this.showPartnerStatusSelection = false;
        this.showPartnerPaymentSelection = false;
        this.partnerAgencySearchFilter = '';
        this.partnerAvailableAgencies = [];
        this.partnerSelectedAgencies = [];
        this.partnerAgencySelectionData = [];
        this.partnerAgencyColumn = null;
        this.partnerAgenciesSelectionBeforeSearch = null;
        this.partnerServiceSearchFilter = '';
        this.partnerStatusSearchFilter = '';
        this.partnerPaymentSearchFilter = '';
        this.partnerAvailableServices = [];
        this.partnerSelectedServices = [];
        this.partnerServiceSelectionData = [];
        this.partnerServiceCounts = {};
        this.partnerServiceColumn = null;
        this.partnerStatusColumn = null;
        // Nettoyer aussi les variables de statut
        this.partnerAvailableStatuses = [];
        this.partnerSelectedStatuses = [];
        this.partnerStatusSelectionData = [];
        this.partnerStatusCounts = {};
        // Nettoyer aussi les variables de paiement
        this.partnerAvailablePayments = [];
        this.partnerSelectedPayments = [];
        this.partnerPaymentSelectionData = [];
        this.partnerPaymentCounts = {};
        this.partnerPaymentColumn = null;
    }

    // Méthode pour gérer le changement de sélection des services partenaire
    onPartnerServiceSelectionChange(event: Event, service: string): void {
        const checkbox = event.target as HTMLInputElement;
        if (checkbox.checked) {
            if (!this.partnerSelectedServices.includes(service)) {
                this.partnerSelectedServices.push(service);
            }
        } else {
            this.partnerSelectedServices = this.partnerSelectedServices.filter(s => s !== service);
        }
    }

    // Méthode pour compter le nombre de lignes par service/type partenaire
    getPartnerServiceCount(service: string): number {
        return this.partnerServiceCounts[service] ?? 0;
    }

    get filteredPartnerAvailableServices(): string[] {
        if (!hasCommaSeparatedSearchFilter(this.partnerServiceSearchFilter)) return this.partnerAvailableServices;
        return this.partnerAvailableServices.filter(s =>
            matchesCommaSeparatedFilter(
                this.partnerServiceSearchFilter,
                s,
                this.getPartnerServiceCount(s)
            )
        );
    }

    onPartnerServiceSearchFilterChange(value: string): void {
        const hasFilter = hasCommaSeparatedSearchFilter(value);
        const hadSnapshot = Array.isArray(this.partnerServicesSelectionBeforeSearch);
        if (hasFilter && !hadSnapshot) {
            this.partnerServicesSelectionBeforeSearch = [...this.partnerSelectedServices];
        }
        this.partnerServiceSearchFilter = value;
        if (hasFilter) {
            this.partnerSelectedServices = [...this.filteredPartnerAvailableServices];
        } else if (hadSnapshot) {
            this.partnerSelectedServices = [...(this.partnerServicesSelectionBeforeSearch || [])];
            this.partnerServicesSelectionBeforeSearch = null;
        }
    }

    selectAllPartnerServices(): void {
        const selected = new Set(this.partnerSelectedServices);
        this.filteredPartnerAvailableServices.forEach(s => selected.add(s));
        this.partnerSelectedServices = [...selected];
    }

    deselectAllPartnerServices(): void {
        const toDeselect = this.filteredPartnerAvailableServices;
        this.partnerSelectedServices = this.partnerSelectedServices.filter(s => !toDeselect.includes(s));
    }

    // Méthode pour afficher la sélection des statuts pour le partenaire (étape 2)
    private showPartnerStatusSelectionStep(): void {
        this.showPartnerStatusSelection = true;
        this.partnerStatusSearchFilter = '';
        this.partnerSelectedStatuses = [...this.partnerAvailableStatuses]; // Sélectionner tous par défaut
    }

    // Méthode pour confirmer la sélection des statuts partenaire
    async confirmPartnerStatusSelection(): Promise<void> {
        if (this.partnerSelectionBusy) {
            return;
        }
        if (this.partnerSelectedStatuses.length === 0) {
            this.errorMessage = 'Veuillez sélectionner au moins un statut.';
            return;
        }

        
        if (!this.partnerStatusColumn || !this.partnerStatusSelectionData || this.partnerStatusSelectionData.length === 0) {
            this.errorMessage = 'Erreur: colonne statut non trouvée.';
            return;
        }

        this.partnerSelectionBusy = true;
        this.cd.detectChanges();

        try {
            const filteredData = await this.filterPartnerRowsOrPassthrough(
                this.partnerStatusSelectionData,
                this.partnerStatusColumn,
                this.partnerSelectedStatuses,
                this.partnerAvailableStatuses,
                'Filtrage par statut'
            );
            this.processingMessage = '';
        
        
            if (filteredData.length > 0) {
                const firstRow = filteredData[0];
                const columns = Object.keys(firstRow);
            
                const paymentColumn = columns.find(col => {
                    const colLower = col.toLowerCase();
                    return colLower.includes('paiement') || 
                           colLower.includes('payment') ||
                           colLower.includes('moyen de paiement') ||
                           colLower.includes('moyen paiement') ||
                           colLower.includes('application :') ||
                           colLower.includes('application:') ||
                           colLower.includes('application');
                });
            
                if (paymentColumn) {
                
                    const { values, counts } = this.extractUniqueSortedValuesWithCounts(filteredData, paymentColumn);
                
                    this.partnerAvailablePayments = values;
                    this.partnerPaymentSelectionData = filteredData;
                    this.partnerPaymentCounts = counts;
                    this.partnerPaymentColumn = paymentColumn;
                
                
                    this.showPartnerStatusSelection = false;
                    this.partnerStatusSelectionData = [];
                    this.partnerStatusCounts = {};
                    this.partnerAvailableStatuses = [];
                    this.partnerSelectedStatuses = [];
                    this.showPartnerPaymentSelectionStep();
                    this.cd.detectChanges();
                    return;
                }
            }
        
            const convertedData = await this.finalizePartnerSelectionData(filteredData, 'Statut partenaire');
        
            this.showPartnerStatusSelection = false;
            this.partnerStatusSelectionData = [];
            this.partnerStatusCounts = {};
            this.partnerAvailableStatuses = [];
            this.partnerSelectedStatuses = [];
        
            if (this.reconciliationMode === 'manual') {
                this.partnerData = convertedData;
                this.cd.detectChanges();
                this.continueWithManualReconciliation();
            } else {
                this.autoPartnerData = convertedData;
                this.cd.detectChanges();
            }
        } finally {
            this.partnerSelectionBusy = false;
            this.processingMessage = '';
            this.cd.detectChanges();
        }
    }

    // Méthode pour passer la sélection des statuts partenaire
    // Comporte comme "aucun filtrage" en sélectionnant tous les statuts disponibles
    skipPartnerStatusSelection(): void {
        this.partnerSelectedStatuses = [...this.partnerAvailableStatuses];
        this.confirmPartnerStatusSelection();
    }

    // Méthode pour afficher la sélection des paiements pour le partenaire (étape 3)
    private showPartnerPaymentSelectionStep(): void {
        this.showPartnerPaymentSelection = true;
        this.partnerPaymentSearchFilter = '';
        this.partnerSelectedPayments = [...this.partnerAvailablePayments]; // Sélectionner tous par défaut
    }

    // Méthode pour confirmer la sélection des paiements partenaire
    async confirmPartnerPaymentSelection(): Promise<void> {
        if (this.partnerSelectionBusy) {
            return;
        }
        if (this.partnerSelectedPayments.length === 0) {
            this.errorMessage = 'Veuillez sélectionner au moins un paiement.';
            return;
        }

        
        if (!this.partnerPaymentColumn || !this.partnerPaymentSelectionData || this.partnerPaymentSelectionData.length === 0) {
            this.errorMessage = 'Erreur: colonne Paiement non trouvée.';
            return;
        }

        this.partnerSelectionBusy = true;
        this.cd.detectChanges();

        try {
            const filteredData = await this.filterPartnerRowsOrPassthrough(
                this.partnerPaymentSelectionData,
                this.partnerPaymentColumn,
                this.partnerSelectedPayments,
                this.partnerAvailablePayments,
                'Filtrage par paiement'
            );
            this.processingMessage = '';
        
        
            const convertedData = await this.finalizePartnerSelectionData(filteredData, 'Paiement partenaire');
        
            this.showPartnerPaymentSelection = false;
            this.partnerPaymentSelectionData = [];
            this.partnerPaymentCounts = {};
            this.partnerAvailablePayments = [];
            this.partnerSelectedPayments = [];
            this.partnerPaymentColumn = null;
        
            if (this.reconciliationMode === 'manual') {
                this.partnerData = convertedData;
                this.cd.detectChanges();
                this.continueWithManualReconciliation();
            } else {
                this.autoPartnerData = convertedData;
                this.cd.detectChanges();
            }
        } finally {
            this.partnerSelectionBusy = false;
            this.processingMessage = '';
            this.cd.detectChanges();
        }
    }

    // Méthode pour passer la sélection des paiements partenaire
    // Si aucune valeur de paiement n'est disponible, on applique directement les données existantes sans filtrage
    // Sinon, on sélectionne tous les paiements disponibles et on réutilise la logique de confirmation
    async skipPartnerPaymentSelection(): Promise<void> {
        if (!this.partnerAvailablePayments || this.partnerAvailablePayments.length === 0) {
            const sourceData = this.partnerPaymentSelectionData && this.partnerPaymentSelectionData.length > 0
                ? this.partnerPaymentSelectionData
                : this.partnerStatusSelectionData;

            if (this.partnerSelectionBusy) {
                return;
            }
            this.partnerSelectionBusy = true;
            this.cd.detectChanges();

            try {
                const convertedData = await this.finalizePartnerSelectionData(sourceData || [], 'Paiement partenaire (passer)');

                this.showPartnerPaymentSelection = false;
                this.partnerPaymentSelectionData = [];
                this.partnerPaymentCounts = {};
                this.partnerAvailablePayments = [];
                this.partnerSelectedPayments = [];
                this.partnerPaymentColumn = null;

                if (this.reconciliationMode === 'manual') {
                    this.partnerData = convertedData;
                    this.cd.detectChanges();
                    this.continueWithManualReconciliation();
                } else {
                    this.autoPartnerData = convertedData;
                    this.cd.detectChanges();
                }
            } finally {
                this.partnerSelectionBusy = false;
                this.cd.detectChanges();
            }
        } else {
            this.partnerSelectedPayments = [...this.partnerAvailablePayments];
            await this.confirmPartnerPaymentSelection();
        }
    }

    // Méthode pour annuler la sélection des paiements partenaire
    cancelPartnerPaymentSelection(): void {
        this.showPartnerPaymentSelection = false;
        this.partnerPaymentSearchFilter = '';
        this.partnerPaymentSelectionData = [];
        this.partnerAvailablePayments = [];
        this.partnerSelectedPayments = [];
        this.partnerPaymentColumn = null;
        // Revenir à la sélection des statuts
        this.showPartnerStatusSelection = true;
    }

    // Méthode pour gérer le changement de sélection des paiements partenaire
    onPartnerPaymentSelectionChange(event: Event, payment: string): void {
        const checkbox = event.target as HTMLInputElement;
        if (checkbox.checked) {
            if (!this.partnerSelectedPayments.includes(payment)) {
                this.partnerSelectedPayments.push(payment);
            }
        } else {
            this.partnerSelectedPayments = this.partnerSelectedPayments.filter(p => p !== payment);
        }
    }

    // Méthode pour compter le nombre de lignes par paiement partenaire
    getPartnerPaymentCount(payment: string): number {
        return this.partnerPaymentCounts[payment] ?? 0;
    }

    get filteredPartnerAvailablePayments(): string[] {
        if (!hasCommaSeparatedSearchFilter(this.partnerPaymentSearchFilter)) return this.partnerAvailablePayments;
        return this.partnerAvailablePayments.filter(p =>
            matchesCommaSeparatedFilter(
                this.partnerPaymentSearchFilter,
                p,
                this.getPartnerPaymentCount(p)
            )
        );
    }

    selectAllPartnerPayments(): void {
        const toSelect = this.filteredPartnerAvailablePayments;
        toSelect.forEach(p => { if (!this.partnerSelectedPayments.includes(p)) this.partnerSelectedPayments.push(p); });
        this.partnerSelectedPayments = [...this.partnerSelectedPayments];
    }

    deselectAllPartnerPayments(): void {
        const toDeselect = this.filteredPartnerAvailablePayments;
        this.partnerSelectedPayments = this.partnerSelectedPayments.filter(p => !toDeselect.includes(p));
    }

    // Méthode pour annuler la sélection des statuts partenaire
    cancelPartnerStatusSelection(): void {
        this.showPartnerStatusSelection = false;
        this.partnerStatusSearchFilter = '';
        this.partnerStatusSelectionData = [];
        this.partnerAvailableStatuses = [];
        this.partnerSelectedStatuses = [];
        // Revenir à la sélection des services
        this.showPartnerServiceSelection = true;
    }

    // Méthode pour gérer le changement de sélection des statuts partenaire
    onPartnerStatusSelectionChange(event: Event, status: string): void {
        const checkbox = event.target as HTMLInputElement;
        if (checkbox.checked) {
            if (!this.partnerSelectedStatuses.includes(status)) {
                this.partnerSelectedStatuses.push(status);
            }
        } else {
            this.partnerSelectedStatuses = this.partnerSelectedStatuses.filter(s => s !== status);
        }
    }

    // Méthode pour compter le nombre de lignes par statut partenaire
    getPartnerStatusCount(status: string): number {
        return this.partnerStatusCounts[status] ?? 0;
    }

    get filteredPartnerAvailableStatuses(): string[] {
        if (!hasCommaSeparatedSearchFilter(this.partnerStatusSearchFilter)) return this.partnerAvailableStatuses;
        return this.partnerAvailableStatuses.filter(st =>
            matchesCommaSeparatedFilter(
                this.partnerStatusSearchFilter,
                st,
                this.getPartnerStatusCount(st)
            )
        );
    }

    selectAllPartnerStatuses(): void {
        const selected = new Set(this.partnerSelectedStatuses);
        this.filteredPartnerAvailableStatuses.forEach(st => selected.add(st));
        this.partnerSelectedStatuses = [...selected];
    }

    // Méthode pour désélectionner tous les statuts partenaire
    deselectAllPartnerStatuses(): void {
        const toDeselect = this.filteredPartnerAvailableStatuses;
        this.partnerSelectedStatuses = this.partnerSelectedStatuses.filter(st => !toDeselect.includes(st));
    }


    private parseAutoFile(file: File, isBo: boolean): void {
        const fileName = file.name.toLowerCase();
        const fileSizeMB = file.size / (1024 * 1024);
        
        if (fileName.endsWith('.csv')) {
            void this.parseAutoCsvFast(file, isBo);
        } else if (this.isExcelFile(fileName)) {
            // Utiliser la méthode alternative pour les très gros fichiers Excel
            if (fileSizeMB > 50) {
                this.parseAutoXLSXLargeFile(file, isBo);
            } else {
                this.parseAutoXLSX(file, isBo);
            }
        } else {
            this.popupService.showError('Format de fichier non supporté. Veuillez choisir un fichier CSV ou Excel (.xls, .xlsx, .xlsm, .xlsb, .xlt, .xltx, .xltm)', 'Format Non Supporté');
        }
    }

    /** Lecture CSV assistée — PapaParse + Web Worker pour les gros fichiers. */
    private async parseAutoCsvFast(file: File, isBo: boolean): Promise<void> {
        const showProgress = file.size > 512 * 1024;
        if (showProgress) {
            this.isProcessingLargeFile = true;
            this.processingProgress = 0;
            this.processingMessage = `Lecture de ${file.name}...`;
            this.cd.detectChanges();
        }

        try {
            const { rows } = await readCsvFileUltraFast(file, {
                stripAirtelPreamble: true,
                normalizeHeader: (header, index) =>
                    this.normalizeColumnName(header || `Col${index + 1}`),
                onProgress: (processed, total) => {
                    if (!showProgress) {
                        return;
                    }
                    this.processingProgress = total > 0 ? Math.round((processed / total) * 100) : 0;
                    this.processingMessage =
                        `Lecture ${file.name} : ${processed.toLocaleString('fr-FR')} / ${total.toLocaleString('fr-FR')} ligne(s)...`;
                    this.cd.detectChanges();
                },
                yieldFn: () => this.yieldToMainThread(true)
            });

            const data = rows as Record<string, string>[];

            if (isBo) {
                this.autoBoSourceFormat = 'csv';
                this.autoBoData = data;
                if (this.detectTRXBOAndExtractServices(this.autoBoData)) {
                    if (this.availableAgencies.length > 0) {
                        this.showAgencySelectionStep();
                    } else {
                        this.showServiceSelectionStep();
                    }
                }
            } else {
                this.autoPartnerSourceFormat = 'csv';
                this.autoPartnerData = data;
                await this.convertDebitCreditToNumberAsync(data, (done, total) => {
                    if (showProgress) {
                        this.processingMessage =
                            `Finalisation partenaire : ${done.toLocaleString('fr-FR')} / ${total.toLocaleString('fr-FR')}...`;
                        this.cd.detectChanges();
                    }
                });
                this.handleAutoPartnerSelectionFlow();
            }
            this.cd.detectChanges();
        } catch (error) {
            this.cd.detectChanges();
        } finally {
            if (showProgress) {
                this.isProcessingLargeFile = false;
                this.processingProgress = 0;
                this.processingMessage = '';
                this.cd.detectChanges();
            }
        }
    }

    private parseAutoCSV(file: File, isBo: boolean): void {
        void this.parseAutoCsvFast(file, isBo);
    }

    private parseAutoXLSX(file: File, isBo: boolean): void {
        if (isBo) {
            this.autoBoSourceFormat = 'excel';
        } else {
            this.autoPartnerSourceFormat = 'excel';
        }
        // Afficher un indicateur de progression pour les fichiers volumineux
        const fileSizeMB = file.size / (1024 * 1024);
        const startTime = Date.now();
        
        if (fileSizeMB > 5) {
            this.progressIndicatorService.showProgress(
                'Lecture du fichier Excel en cours...',
                file.name,
                file.size
            );
        }

        const reader = new FileReader();
        reader.onload = (e: ProgressEvent<FileReader>) => {
            try {
                
                // Options optimisées pour les fichiers volumineux
                const options: XLSX.ParsingOptions = {
                    type: 'array',
                    cellDates: true,
                    cellNF: false,
                    cellText: false,
                    sheetStubs: false,
                    // Lire toutes les lignes
                    sheetRows: undefined,
                };

                const data = new Uint8Array(e.target?.result as ArrayBuffer);
                const workbook = XLSX.read(data, options);
                const firstSheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[firstSheetName];
                
                // Vérifier si la feuille est valide avant de continuer

                if (!worksheet) {
                    if (fileSizeMB > 5) {
                        this.progressIndicatorService.hideProgress();
                    }
                    this.popupService.showError('Impossible de lire la feuille Excel. Vérifiez que le fichier n\'est pas corrompu.', 'Erreur de lecture Excel');
                    return;
                }

                // Pour les gros fichiers, on essaie de lire même sans !ref
                if (!worksheet['!ref'] && fileSizeMB < 10) {
                    if (fileSizeMB > 5) {
                        this.progressIndicatorService.hideProgress();
                    }
                    this.popupService.showError('Le fichier Excel semble être vide. Veuillez vérifier le fichier et réessayer.', 'Fichier Excel vide');
                    return;
                }

                // Conversion optimisée en tableau de tableaux pour analyse
                let jsonData: any[][];
                try {
                    jsonData = XLSX.utils.sheet_to_json(worksheet, { 
                        header: 1,
                        defval: '', // Valeur par défaut pour les cellules vides
                        raw: false // Convertir les dates en strings
                    }) as any[][];
                } catch (error) {
                    // Tentative alternative avec options plus permissives
                    jsonData = XLSX.utils.sheet_to_json(worksheet, { 
                        header: 1,
                        defval: '',
                        raw: true, // Garder les valeurs brutes
                        blankrows: false // Ignorer les lignes vides
                    }) as any[][];
                }
                
                if (!jsonData || jsonData.length === 0) {
                    if (fileSizeMB > 5) {
                        this.progressIndicatorService.hideProgress();
                    }
                    
                    // Pour les très gros fichiers, suggérer des solutions alternatives
                    if (fileSizeMB > 50) {
                        this.popupService.showError(
                            `Le fichier Excel (${fileSizeMB.toFixed(1)} MB) est très volumineux et ne peut pas être traité entièrement. 
                            Suggestions : 
                            1. Divisez le fichier en plusieurs parties plus petites
                            2. Supprimez les colonnes non nécessaires
                            3. Utilisez un fichier CSV à la place si possible`,
                            'Fichier trop volumineux'
                        );
                    } else {
                        this.popupService.showError('Aucune donnée trouvée dans le fichier Excel. Veuillez vérifier que le fichier contient des données.', 'Aucune donnée');
                    }
                    return;
                }
                
                
                // Pour les très gros fichiers, informer l'utilisateur de la limitation
                if (fileSizeMB > 50 && jsonData.length === 10000) {
                    this.progressIndicatorService.updateMessage(
                        'Fichier très volumineux détecté. Traitement des 10,000 premières lignes seulement...'
                    );
                }
                
                // Détecter les en-têtes avec une méthode optimisée
                const headerDetection = this.detectExcelHeadersImproved(jsonData);
                const headers = headerDetection.headerRow;
                const headerRowIndex = headerDetection.headerRowIndex;
                
                
                // Vérifier si des en-têtes valides ont été trouvés
                if (!headers || headers.length === 0 || headers.every(h => !h || h.trim() === '')) {
                    const fallbackHeaders = jsonData[0]?.map((h, idx) => h || `Col${idx + 1}`) || [];
                    const correctedHeaders = fallbackHeaders.map(header => this.normalizeColumnName(header));
                    
                    // Créer les lignes de données avec traitement par chunks pour les gros fichiers
                    const rows: any[] = [];
                    const chunkSize = 1000; // Traiter par chunks de 1000 lignes
                    
                    for (let i = 1; i < jsonData.length; i += chunkSize) {
                        const endIndex = Math.min(i + chunkSize, jsonData.length);
                        
                        for (let j = i; j < endIndex; j++) {
                            const rowData = jsonData[j] as any[];
                            if (!rowData || rowData.length === 0) continue;
                            
                            const row: any = {};
                            correctedHeaders.forEach((header: string, index: number) => {
                                this.assignExcelCellValue(row, header, rowData[index]);
                            });
                            rows.push(row);
                        }
                        
                        // Log de progression pour gros fichiers
                        if (fileSizeMB > 5 && i % (chunkSize * 10) === 1) {
                            const progress = ((i - 1) / jsonData.length * 100);
                            this.progressIndicatorService.updateProgress(
                                progress,
                                `Traitement des données: ${progress.toFixed(1)}%`
                            );
                        }
                    }
                    
                    if (isBo) {
                        this.autoBoData = rows;
                    } else {
                        this.autoPartnerData = this.convertDebitCreditToNumber(rows);
                        
                        // Vérifier si le fichier partenaire contient des colonnes service/type/statut
                        this.handleAutoPartnerSelectionFlow();
                    }
                    
                    // Invalider le cache de canProceed
                    this._canProceedCache = null;
                    // Forcer la détection des changements pour mettre à jour la vue
                    this.cd.detectChanges();
                } else {
                    // Corriger les caractères spéciaux dans les en-têtes
                    const correctedHeaders = headers.map(header => this.normalizeColumnName(header));
                    
                    // Créer les lignes de données en commençant après la ligne d'en-tête
                    const rows: any[] = [];
                    const chunkSize = 1000; // Traiter par chunks de 1000 lignes
                    
                    for (let i = headerRowIndex + 1; i < jsonData.length; i += chunkSize) {
                        const endIndex = Math.min(i + chunkSize, jsonData.length);
                        
                        for (let j = i; j < endIndex; j++) {
                            const rowData = jsonData[j] as any[];
                            if (!rowData || rowData.length === 0) continue;
                            
                            const row: any = {};
                            correctedHeaders.forEach((header: string, index: number) => {
                                const value = rowData[index];
                                this.assignExcelCellValue(row, header, value);
                            });
                            rows.push(row);
                        }
                        
                        // Log de progression pour gros fichiers
                        if (fileSizeMB > 5 && i % (chunkSize * 10) === headerRowIndex + 1) {
                            const progress = ((i - headerRowIndex - 1) / (jsonData.length - headerRowIndex - 1) * 100);
                            this.progressIndicatorService.updateProgress(
                                progress,
                                `Traitement des données: ${progress.toFixed(1)}%`
                            );
                        }
                    }
                    
                    
                    if (isBo) {
                        this.autoBoData = rows;
                        
                        // Vérifier si c'est un fichier TRXBO et déclencher la sélection des agences ou services
                        if (this.detectTRXBOAndExtractServices(this.autoBoData)) {
                            if (this.availableAgencies.length > 0) {
                                this.showAgencySelectionStep();
                            } else {
                                this.showServiceSelectionStep();
                            }
                        }
                    } else {
                        this.autoPartnerData = this.convertDebitCreditToNumber(rows);
                        
                        // Vérifier si le fichier partenaire contient des colonnes service/type/statut
                        this.handleAutoPartnerSelectionFlow();
                    }
                    
                    // Invalider le cache de canProceed
                    this._canProceedCache = null;
                    // Forcer la détection des changements pour mettre à jour la vue
                    this.cd.detectChanges();
                }
                
                
                // Masquer l'indicateur de progression
                if (fileSizeMB > 5) {
                    this.progressIndicatorService.updateProgress(100, 'Traitement terminé avec succès !');
                    setTimeout(() => {
                        this.progressIndicatorService.hideProgress();
                    }, 1500);
                }
                
                // Appliquer le filtrage automatique Orange Money si nécessaire
                // ATTENTION: Le filtrage se fait APRÈS le traitement complet pour préserver toutes les colonnes
                this.applyAutomaticOrangeMoneyFilterForFileUpload(file.name, isBo);
                
            } catch (error) {
                // Masquer l'indicateur de progression en cas d'erreur
                if (fileSizeMB > 5) {
                    this.progressIndicatorService.hideProgress();
                }
                // En cas d'erreur avec un gros fichier, suggérer des solutions
                if (file.size > 10 * 1024 * 1024) { // > 10MB
                }
            }
        };
        reader.onerror = (e) => {
        };
        reader.readAsArrayBuffer(file);
    }

    /**
     * Méthode alternative pour traiter les fichiers Excel très volumineux
     * Utilise une approche de lecture par chunks pour éviter les problèmes de mémoire
     */
    private async parseAutoXLSXLargeFile(file: File, isBo: boolean): Promise<void> {
        const fileSizeMB = file.size / (1024 * 1024);
        
        this.progressIndicatorService.showProgress(
            'Lecture du fichier Excel volumineux...',
            file.name,
            file.size
        );

        try {
            // Lire le fichier par chunks pour éviter les problèmes de mémoire
            const arrayBuffer = await this.readFileAsArrayBuffer(file);
            const data = new Uint8Array(arrayBuffer);
            
            // Options pour forcer le chargement des feuilles
            const options: XLSX.ParsingOptions = {
                type: 'array',
                cellDates: false,
                cellNF: false,
                cellText: false,
                sheetStubs: false,
                sheetRows: undefined,
                // Forcer le chargement des feuilles
                bookSheets: true,
                bookProps: false,
                bookVBA: false,
                // Options supplémentaires pour les gros fichiers
                cellStyles: false,
                cellHTML: false,
                cellFormula: false
            };

            const workbook = XLSX.read(data, options);
            
            // Vérifier si les feuilles sont chargées
            if (!workbook.Sheets || workbook.SheetNames.length === 0) {
                throw new Error('Aucune feuille chargée dans le workbook');
            }
            
            let firstSheetName = workbook.SheetNames[0];
            let worksheet = workbook.Sheets[firstSheetName];


            // Si la première feuille n'est pas accessible, essayer les autres
            if (!worksheet && workbook.SheetNames.length > 1) {
                for (let i = 1; i < workbook.SheetNames.length; i++) {
                    const sheetName = workbook.SheetNames[i];
                    const testWorksheet = workbook.Sheets[sheetName];
                    if (testWorksheet) {
                        firstSheetName = sheetName;
                        worksheet = testWorksheet;
                        break;
                    }
                }
            }

            if (!worksheet) {
                throw new Error('Impossible de lire la feuille Excel');
            }

            // Lecture limitée des données avec fallback
            let jsonData: any[][];
            try {
                jsonData = XLSX.utils.sheet_to_json(worksheet, { 
                    header: 1,
                    defval: '',
                    raw: true
                }) as any[][];
            } catch (error) {
                // Tentative sans limitation de range
                jsonData = XLSX.utils.sheet_to_json(worksheet, { 
                    header: 1,
                    defval: '',
                    raw: true,
                    blankrows: false
                }) as any[][];
            }

            if (!jsonData || jsonData.length === 0) {
                throw new Error('Aucune donnée trouvée dans le fichier');
            }


            // Traitement standard des données
            const headerDetection = this.detectExcelHeadersImproved(jsonData);
            const headers = headerDetection.headerRow;
            const headerRowIndex = headerDetection.headerRowIndex;

            if (!headers || headers.length === 0 || headers.every(h => !h || h.trim() === '')) {
                const fallbackHeaders = jsonData[0]?.map((h, idx) => h || `Col${idx + 1}`) || [];
                const correctedHeaders = fallbackHeaders.map(header => this.normalizeColumnName(header));
                
                const rows: any[] = [];
                for (let i = 1; i < jsonData.length; i++) {
                    const rowData = jsonData[i] as any[];
                    if (!rowData || rowData.length === 0) continue;
                    
                    const row: any = {};
                    correctedHeaders.forEach((header: string, index: number) => {
                        const value = rowData[index];
                                this.assignExcelCellValue(row, header, value);
                    });
                    rows.push(row);
                }
                
                if (isBo) {
                    this.autoBoData = rows;
                } else {
                    this.autoPartnerData = this.convertDebitCreditToNumber(rows);
                    
                    // Vérifier si le fichier partenaire contient des colonnes service/type/statut
                    this.handleAutoPartnerSelectionFlow();
                }
            } else {
                const correctedHeaders = headers.map(header => this.normalizeColumnName(header));
                const rows: any[] = [];
                
                for (let i = headerRowIndex + 1; i < jsonData.length; i++) {
                    const rowData = jsonData[i] as any[];
                    if (!rowData || rowData.length === 0) continue;
                    
                    const row: any = {};
                        correctedHeaders.forEach((header: string, index: number) => {
                            this.assignExcelCellValue(row, header, rowData[index]);
                        });
                        rows.push(row);
                    }
                    
                    if (isBo) {
                        this.autoBoData = rows;
                        if (this.detectTRXBOAndExtractServices(this.autoBoData)) {
                        this.showServiceSelectionStep();
                    }
                } else {
                    this.autoPartnerData = this.convertDebitCreditToNumber(rows);
                    
                    // Vérifier si le fichier partenaire contient des colonnes service/type/statut
                    this.handleAutoPartnerSelectionFlow();
                }
            }

            // Forcer la détection des changements pour mettre à jour la vue
            this.cd.detectChanges();
            
            this.progressIndicatorService.updateProgress(100, 'Traitement terminé avec succès !');
            
            setTimeout(() => {
                this.progressIndicatorService.hideProgress();
            }, 1500);

            // Invalider le cache de canProceed
            this._canProceedCache = null;

        } catch (error) {
            
            // Tentative de fallback ultime avec options minimales
            try {
                const arrayBuffer = await this.readFileAsArrayBuffer(file);
                const data = new Uint8Array(arrayBuffer);
                
                // Options ultra-minimales pour forcer le chargement
                const minimalOptions: XLSX.ParsingOptions = {
                    type: 'array',
                    cellDates: false,
                    cellNF: false,
                    cellText: false,
                    sheetStubs: false,
                    // Essayer sans limitation de lignes
                    sheetRows: undefined,
                    // Forcer le chargement des feuilles
                    bookSheets: true
                };

                const workbook = XLSX.read(data, minimalOptions);
                
                if (!workbook.Sheets || workbook.SheetNames.length === 0) {
                    throw new Error('Aucune feuille chargée en fallback');
                }
                
                if (workbook.SheetNames.length > 0) {
                    const sheetName = workbook.SheetNames[0];
                    const worksheet = workbook.Sheets[sheetName];
                    
                    if (worksheet) {
                        
                        // Lecture ultra-simple
                        const jsonData = XLSX.utils.sheet_to_json(worksheet, { 
                            header: 1,
                            defval: '',
                            raw: true
                        }) as any[][];

                        if (jsonData && jsonData.length > 0) {
                            
                            // Traitement simplifié
                            const fallbackHeaders = jsonData[0]?.map((h, idx) => h || `Col${idx + 1}`) || [];
                            const correctedHeaders = fallbackHeaders.map(header => this.normalizeColumnName(header));
                            
                            const rows: any[] = [];
                            const maxRows = Math.min(jsonData.length, 1000); // Limiter à 1000 lignes max
                            
                            for (let i = 1; i < maxRows; i++) {
                                const rowData = jsonData[i] as any[];
                                if (!rowData || rowData.length === 0) continue;
                                
                                const row: any = {};
                                correctedHeaders.forEach((header: string, index: number) => {
                                    const value = rowData[index];
                                    this.assignExcelCellValue(row, header, value);
                                });
                                rows.push(row);
                            }
                            
                            if (isBo) {
                                this.autoBoData = rows;
                            } else {
                                this.autoPartnerData = this.convertDebitCreditToNumber(rows);
                                
                                // Vérifier si le fichier partenaire contient des colonnes service/type/statut
                                this.handleAutoPartnerSelectionFlow();
                            }

                            this.progressIndicatorService.updateProgress(100, 'Traitement réussi en mode fallback !');
                            
                            setTimeout(() => {
                                this.progressIndicatorService.hideProgress();
                            }, 1500);

                            this._canProceedCache = null;
                            // Forcer la détection des changements pour mettre à jour la vue
                            this.cd.detectChanges();
                            return;
                        }
                    }
                }
                
                throw new Error('Fallback ultime échoué');
                
            } catch (fallbackError) {
                // Dernière tentative avec la méthode de fallback ultime
                await this.parseAutoXLSXUltimateFallback(file, isBo);
            }
        }
    }

    /**
     * Lit un fichier comme ArrayBuffer de manière asynchrone
     */
    private readFileAsArrayBuffer(file: File): Promise<ArrayBuffer> {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target?.result as ArrayBuffer);
            reader.onerror = (e) => reject(e);
            reader.readAsArrayBuffer(file);
        });
    }

    /**
     * Méthode de fallback ultime pour les fichiers Excel problématiques
     * Utilise une approche complètement différente
     */
    private async parseAutoXLSXUltimateFallback(file: File, isBo: boolean): Promise<void> {
        const fileSizeMB = file.size / (1024 * 1024);
        
        this.progressIndicatorService.showProgress(
            'Tentative de lecture alternative...',
            file.name,
            file.size
        );

        try {
            const arrayBuffer = await this.readFileAsArrayBuffer(file);
            const data = new Uint8Array(arrayBuffer);
            
            // Essayer différentes approches de lecture
            const approaches = [
                // Approche 1: Lecture complète sans limitations
                {
                    name: 'Lecture complète',
                    options: {
                        type: 'array' as const,
                        cellDates: false,
                        cellNF: false,
                        cellText: false,
                        sheetStubs: false
                    }
                },
                // Approche 2: Lecture avec cellDates activé
                {
                    name: 'Avec cellDates',
                    options: {
                        type: 'array' as const,
                        cellDates: true,
                        cellNF: false,
                        cellText: false,
                        sheetStubs: false
                    }
                },
                // Approche 3: Lecture avec cellText activé
                {
                    name: 'Avec cellText',
                    options: {
                        type: 'array' as const,
                        cellDates: false,
                        cellNF: false,
                        cellText: true,
                        sheetStubs: false
                    }
                }
            ];

            for (const approach of approaches) {
                try {
                    const workbook = XLSX.read(data, approach.options);
                    
                    
                    if (workbook.Sheets && workbook.SheetNames.length > 0) {
                        const sheetName = workbook.SheetNames[0];
                        const worksheet = workbook.Sheets[sheetName];
                        
                        if (worksheet) {
                            
                            // Lecture des données avec options permissives
                            const jsonData = XLSX.utils.sheet_to_json(worksheet, { 
                                header: 1,
                                defval: '',
                                raw: true,
                                blankrows: false
                            }) as any[][];

                            if (jsonData && jsonData.length > 0) {
                                
                                // Traitement simplifié
                                const fallbackHeaders = jsonData[0]?.map((h, idx) => h || `Col${idx + 1}`) || [];
                                const correctedHeaders = fallbackHeaders.map(header => this.normalizeColumnName(header));
                                
                                const rows: any[] = [];
                                const maxRows = jsonData.length;
                                
                                for (let i = 1; i < maxRows; i++) {
                                    const rowData = jsonData[i] as any[];
                                    if (!rowData || rowData.length === 0) continue;
                                    
                                    const row: any = {};
                                    correctedHeaders.forEach((header: string, index: number) => {
                                        const value = rowData[index];
                                        this.assignExcelCellValue(row, header, value);
                                    });
                                    rows.push(row);
                                }
                                
                                if (isBo) {
                                    this.autoBoData = rows;
                                } else {
                                    this.autoPartnerData = this.convertDebitCreditToNumber(rows);
                                    
                                    // Vérifier si le fichier partenaire contient des colonnes service/type/statut
                                    this.handleAutoPartnerSelectionFlow();
                                }

                                this.progressIndicatorService.updateProgress(100, 'Lecture réussie avec méthode alternative !');
                                
                                setTimeout(() => {
                                    this.progressIndicatorService.hideProgress();
                                }, 1500);

                                this._canProceedCache = null;
                                // Forcer la détection des changements pour mettre à jour la vue
                                this.cd.detectChanges();
                                return;
                            }
                        }
                    }
                } catch (approachError) {
                    continue;
                }
            }
            
            throw new Error('Toutes les approches de lecture ont échoué');
            
        } catch (error) {
            this.progressIndicatorService.hideProgress();
            this.popupService.showError(
                `Impossible de traiter ce fichier Excel de ${fileSizeMB.toFixed(1)} MB. 
                
                Le fichier semble avoir un format ou une structure qui empêche sa lecture par la bibliothèque XLSX.
                
                Solutions recommandées :
                1. Ouvrez le fichier dans Excel et sauvegardez-le au format CSV
                2. Divisez le fichier en plusieurs parties plus petites
                3. Vérifiez que le fichier n'est pas protégé par mot de passe
                4. Essayez de supprimer les colonnes non nécessaires
                
                Si le problème persiste, le fichier pourrait être corrompu.`,
                'Fichier non lisible'
            );
        }
    }



    /**
     * Tente d'extraire les clés de réconciliation à partir d'un modèle partenaire.
     */
    private resolveKeysFromPartnerModel(
        model: AutoProcessingModel,
        boData: Record<string, string>[],
        partnerData: Record<string, string>[]
    ): {
        boKeyColumn: string;
        partnerKeyColumn: string;
        source: 'model';
        confidence: number;
        modelId?: string;
    } | null {
        const resolved = this.partnerConditionalKeysService.resolveKeysFromPartnerModel(
            model,
            boData,
            partnerData
        );
        if (!resolved) {
            return null;
        }
        return {
            ...resolved,
            source: 'model',
            confidence: 1.0,
            modelId: model.modelId || model.id
        };
    }

    /**
     * Détecte les clés de réconciliation en priorisant les modèles.
     */
    private async detectReconciliationKeys(
        boData: Record<string, string>[], 
        partnerData: Record<string, string>[],
        boFileName: string,
        partnerFileName: string
    ): Promise<{
        boKeyColumn: string;
        partnerKeyColumn: string;
        source: 'model';
        confidence: number;
        modelId?: string;
    }> {
        boFileName = (boFileName || this.getResolvedAutoBoFileName()).trim();
        partnerFileName = (partnerFileName || this.getResolvedAutoPartnerFileName()).trim();


        try {
            const models = await this.autoProcessingService.getAllModelsUnrestricted();

            // Priorité 0 : modèle partenaire mémorisé lors du traitement assisté
            if (this.assistedPartnerReconciliationModelId) {
                const preselected = models.find(m =>
                    (m.id || m.modelId) === this.assistedPartnerReconciliationModelId
                );
                if (preselected) {
                    const fromTreatment = this.resolveKeysFromPartnerModel(preselected, boData, partnerData);
                    if (fromTreatment) {
                        return fromTreatment;
                    }
                }
            }

            // Priorité 1 : correspondance par nom de fichier partenaire
            let partnerModels = models.filter(model =>
                (model.fileType === 'partner' || model.fileType === 'both') &&
                partnerFileName &&
                this.matchesFilePattern(partnerFileName, model.filePattern)
            );

            // Priorité 2 : correspondance par nom de fichier BO (ex. TRXBO lié au modèle partenaire)
            if (partnerModels.length === 0 && boFileName) {
                partnerModels = models.filter(model =>
                    (model.fileType === 'partner' || model.fileType === 'both') &&
                    this.matchesFilePattern(boFileName, model.filePattern)
                );
            }

            // Priorité 3 : fallback par présence des clés dans les données
            if (partnerModels.length === 0) {
                partnerModels = models.filter(m =>
                    (m.fileType === 'partner' || m.fileType === 'both') &&
                    this.modelHasPartnerKeyConfig(m)
                );
            }

            for (const model of partnerModels) {
                const resolved = this.resolveKeysFromPartnerModel(model, boData, partnerData);
                if (resolved) {
                    return resolved;
                }
            }

            const discovered = discoverReconciliationKeyColumns(boData, partnerData);
            if (discovered) {
                const patternMatch = partnerModels[0]
                    ?? models.find(m =>
                        (m.fileType === 'partner' || m.fileType === 'both') &&
                        partnerFileName &&
                        this.matchesFilePattern(partnerFileName, m.filePattern)
                    );
                return {
                    ...discovered,
                    source: 'model',
                    confidence: 0.85,
                    modelId: patternMatch?.modelId || patternMatch?.id
                };
            }

        } catch (error) {
        }

        throw new Error(
            `Aucun modèle de réconciliation trouvé pour les fichiers ${boFileName || 'BO'} et ${partnerFileName || 'Partenaire'}. ` +
            `Veuillez configurer un modèle de traitement automatique dans la section "Modèles de Traitement".`
        );
    }

    private modelHasPartnerKeyConfig(model: AutoProcessingModel): boolean {
        const rk = model.reconciliationKeys;
        if (!rk) {
            return false;
        }
        const hasBoModelKeys = (rk.boModels || []).some(
            id => (rk.boModelKeys?.[id] || []).length > 0
        );
        return !!(
            rk.partnerKeys?.length ||
            rk.boKeys?.length ||
            hasBoModelKeys ||
            this.partnerConditionalKeysService.isEnabled(rk.partnerConditionalKeys) ||
            this.partnerConditionalKeysService.isBoConditionalEnabled(rk.boConditionalKeys)
        );
    }

    /**
     * Applique les traitements BO spécifiés dans un modèle
     */
    private applyBoTreatments(
        boData: Record<string, string>[], 
        boTreatments: any
    ): Record<string, string>[] {
        
        if (!boTreatments || Object.keys(boTreatments).length === 0) {
            return boData;
        }
        
        let processedData = [...boData];
        const MAX_LOG_SAMPLES = 5;
        
        const logSample = (phase: string, column: string, data: Record<string, string>[]) => {
            const sampleValues = data.slice(0, MAX_LOG_SAMPLES).map(row => row?.[column]);
        };
        
        // Appliquer les traitements pour chaque modèle BO
        Object.entries(boTreatments).forEach(([modelId, treatments]) => {
            
            if (Array.isArray(treatments)) {
                treatments.forEach((treatment: any) => {
                    if (!treatment?.type || !treatment?.column) {
                        return;
                    }
                    
                    const column = treatment.column;
                    
                    switch (treatment.type) {
                        case 'removeSuffix': {
                            const suffix = treatment.suffix;
                            if (typeof suffix !== 'string' || !suffix.length) {
                                return;
                            }
                            
                            logSample('🔍 Valeurs avant traitement', column, processedData);
                            
                            processedData = processedData.map(row => {
                                const newRow = { ...row };
                                if (typeof newRow[column] === 'string' && newRow[column].endsWith(suffix)) {
                                    newRow[column] = newRow[column].slice(0, -suffix.length);
                                }
                                return newRow;
                            });
                            
                            logSample('🔍 Valeurs après traitement', column, processedData);
                            break;
                        }
                        case 'toNumber': {
                            logSample('🔍 Valeurs avant conversion', column, processedData);
                            
                            processedData = processedData.map(row => {
                                const newRow = { ...row };
                                if (newRow[column] !== undefined && newRow[column] !== null) {
                                    const numericValue = parseFloat(String(newRow[column]).replace(/\s/g, ''));
                                    if (!isNaN(numericValue)) {
                                        newRow[column] = String(numericValue);
                                    }
                                }
                                return newRow;
                            });
                            
                            logSample('🔍 Valeurs après conversion', column, processedData);
                            break;
                        }
                        case 'toString': {
                            logSample('🔍 Valeurs avant conversion', column, processedData);
                            
                            processedData = processedData.map(row => {
                                const newRow = { ...row };
                                if (newRow[column] !== undefined && newRow[column] !== null) {
                                    newRow[column] = String(newRow[column]);
                                }
                                return newRow;
                            });
                            
                            logSample('🔍 Valeurs après conversion', column, processedData);
                            break;
                        }
                        default:
                    }
                });
            }
        });
        
        return processedData;
    }


    /**
     * Vérifie si un nom de fichier correspond à un pattern
     * Supporte plusieurs modes de détection :
     * 1. Patterns avec wildcards (* et ?) - comportement classique
     * 2. Patterns avec extension - correspondance exacte avec extension
     * 3. Patterns simples - détection par inclusion (ex: "TRXBO" détecte "TRXBO_02082025.xlsx")
     * 4. Détection par préfixe - détection par début de nom
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
        
        // Mode 1: Pattern avec wildcards
        if (patternNoExt.includes('*') || patternNoExt.includes('?')) {
            // Construire le regex à partir du pattern sans extension
            const regexPattern = patternNoExt
                .replace(/\./g, '\\.')
                .replace(/\*/g, '.*')
                .replace(/\?/g, '.');
            
            try {
                const regex = new RegExp(`^${regexPattern}$`, 'i');
                const matches = regex.test(nameNoExt);
                
                if (matches) {
                    // Si le pattern a une extension, vérifier que l'extension du fichier est acceptée
                    if (patternExt && acceptedExtensions.includes(patternExt)) {
                        // Le pattern spécifie une extension, accepter les extensions équivalentes
                        const fileExtAccepted = acceptedExtensions.includes(fileNameExt);
                        return fileExtAccepted;
                    } else {
                        // Le pattern n'a pas d'extension spécifique, accepter n'importe quelle extension
                        return true;
                    }
                } else {
                    return false;
                }
            } catch (error) {
                return false;
            }
        }
        
        // Mode 2: Pattern avec extension - correspondance exacte (insensible à la casse)
        // Exemple: pattern "pmmoovbf.xlsx" détecte "PMMOOVBF.xlsx" ou "PMMOOVBF.csv"
        if (patternExt && acceptedExtensions.includes(patternExt)) {
            // Si le pattern a une extension acceptée, tester sans extension puis vérifier l'extension
            if (nameNoExt === patternNoExt) {
                // Correspondance exacte du nom, vérifier que l'extension est acceptée
                const fileExtAccepted = acceptedExtensions.includes(fileNameExt);
                return fileExtAccepted;
            }
        } else if (patternExt) {
            // Extension non standard, correspondance exacte stricte
            const exactMatch = lowerName === lowerPattern;
            if (exactMatch) {
                return true;
            }
        }
        
        // Mode 3: Pattern simple - détection par inclusion (sans extension)
        // Exemple: pattern "TRXBO" détecte "TRXBO_02082025.xlsx"
        const containsPattern = nameNoExt.includes(patternNoExt);
        
        if (containsPattern) {
            // Si le pattern avait une extension acceptée, vérifier que l'extension du fichier est aussi acceptée
            if (patternExt && acceptedExtensions.includes(patternExt)) {
                const fileExtAccepted = acceptedExtensions.includes(fileNameExt);
                return fileExtAccepted;
            }
            return true;
        }
        
        // Mode 4: Détection par préfixe (optionnel, pour plus de flexibilité)
        // Exemple: pattern "TRXBO" détecte "TRXBO_02082025.xlsx"
        const startsWithPattern = nameNoExt.startsWith(patternNoExt);
        
        if (startsWithPattern) {
            // Si le pattern avait une extension acceptée, vérifier que l'extension du fichier est aussi acceptée
            if (patternExt && acceptedExtensions.includes(patternExt)) {
                const fileExtAccepted = acceptedExtensions.includes(fileNameExt);
                return fileExtAccepted;
            }
            return true;
        }
        
        return false;
    }

    /**
     * Trouve une colonne existante dans les données (renommée pour clarifier le rôle)
     */
    private findExistingColumn(data: Record<string, string>[], candidateKeys: string[]): string | null {
        if (!data || data.length === 0) {
            return null;
        }
        
        if (!candidateKeys || candidateKeys.length === 0) {
            return null;
        }

        const availableColumns = Object.keys(data[0]);
        
        // Normaliser les noms de colonnes AVANT de les logger
        const normalizedColumns = availableColumns.map(col => this.normalizeColumnName(col));
        const normalizedCandidates = candidateKeys.map(key => this.normalizeColumnName(key));
        
        // Créer un mapping entre colonnes normalisées et originales pour l'accès aux données
        const columnMapping = new Map<string, string>();
        availableColumns.forEach((originalCol, index) => {
            const normalizedCol = normalizedColumns[index];
            columnMapping.set(normalizedCol, originalCol);
        });


        // PRIORITÉ 1: Chercher des correspondances exactes
        for (let i = 0; i < normalizedCandidates.length; i++) {
            const candidateIndex = normalizedColumns.indexOf(normalizedCandidates[i]);
            if (candidateIndex !== -1) {
                // ⚠️ IMPORTANT: Retourner la colonne ORIGINALE (non normalisée) car c'est celle qui existe dans les données
                const foundColumn = availableColumns[candidateIndex];
                return foundColumn;
            }
        }
        
        // PRIORITÉ 1.5: Chercher des correspondances exactes insensibles à la casse
        for (let i = 0; i < normalizedCandidates.length; i++) {
            const candidate = normalizedCandidates[i].toLowerCase();
            for (let j = 0; j < normalizedColumns.length; j++) {
                const column = normalizedColumns[j].toLowerCase();
                if (candidate === column) {
                    // ⚠️ IMPORTANT: Retourner la colonne ORIGINALE (non normalisée) car c'est celle qui existe dans les données
                    const foundColumn = availableColumns[j];
                    return foundColumn;
                }
            }
        }
        
        // PRIORITÉ 2: Chercher des correspondances sans espaces (pour gérer les variations d'espaces)
        for (let i = 0; i < normalizedCandidates.length; i++) {
            const candidate = normalizedCandidates[i].replace(/\s+/g, '');
            for (let j = 0; j < normalizedColumns.length; j++) {
                const column = normalizedColumns[j].replace(/\s+/g, '');
                
                if (candidate === column) {
                    // ⚠️ IMPORTANT: Retourner la colonne ORIGINALE (non normalisée) car c'est celle qui existe dans les données
                    const foundColumn = availableColumns[j];
                    return foundColumn;
                }
            }
        }

        // PRIORITÉ 3: Chercher des correspondances partielles (plus flexible)
        for (let i = 0; i < normalizedCandidates.length; i++) {
            const candidate = normalizedCandidates[i];
            for (let j = 0; j < normalizedColumns.length; j++) {
                const column = normalizedColumns[j];
                
                // Vérifier si l'une contient l'autre
                if (column.includes(candidate) || candidate.includes(column)) {
                    // Vérification spéciale pour éviter les correspondances incorrectes
                    // Si on cherche "id" et qu'on trouve "Provider category", c'est incorrect
                    if (candidate.toLowerCase() === 'id' && column.toLowerCase().includes('provider')) {
                        continue;
                    }
                    
                    // Vérification spéciale pour éviter les correspondances trop courtes
                    if (candidate.length < 3 && column.length > candidate.length * 3) {
                        continue;
                    }
                    
                    // ⚠️ IMPORTANT: Retourner la colonne ORIGINALE (non normalisée) car c'est celle qui existe dans les données
                    const foundColumn = availableColumns[j];
                    return foundColumn;
                }
                
                // Vérifier la similarité (pour gérer les variations d'encodage)
                const similarity = this.calculateStringSimilarity(candidate, column);
                if (similarity > 0.8) {
                    // ⚠️ IMPORTANT: Retourner la colonne ORIGINALE (non normalisée) car c'est celle qui existe dans les données
                    const foundColumn = availableColumns[j];
                    return foundColumn;
                }
            }
        }

        // PRIORITÉ 4: Gestion spéciale pour les fichiers Orange Money avec encodage problématique
        for (let i = 0; i < candidateKeys.length; i++) {
            const candidate = candidateKeys[i];
            for (let j = 0; j < availableColumns.length; j++) {
                const column = availableColumns[j];
                
                // Cas spécial pour "Référence" vs "R f rence"
                if (candidate.toLowerCase().includes('référence') || candidate.toLowerCase().includes('reference')) {
                    if (column.toLowerCase().includes('r') && column.toLowerCase().includes('f') && column.toLowerCase().includes('rence')) {
                        return column;
                    }
                }
                
                // Cas spécial pour "Compte Orange Money" vs "Compte Orange Money" mal encodé
                if (candidate.toLowerCase().includes('compte') && candidate.toLowerCase().includes('orange')) {
                    if (column.toLowerCase().includes('compte') && column.toLowerCase().includes('orange')) {
                        return column;
                    }
                }
                
                // Cas spécial pour "Tête de réseau" vs "T te de r seau"
                if (candidate.toLowerCase().includes('tête') || candidate.toLowerCase().includes('tete')) {
                    if (column.toLowerCase().includes('t') && column.toLowerCase().includes('te') && column.toLowerCase().includes('seau')) {
                        return column;
                    }
                }
                
                // Cas général pour les caractères mal encodés (é, è, à, etc.)
                const cleanCandidate = candidate.toLowerCase()
                    .replace(/[éèêë]/g, 'e')
                    .replace(/[àâä]/g, 'a')
                    .replace(/[îï]/g, 'i')
                    .replace(/[ôö]/g, 'o')
                    .replace(/[ûùü]/g, 'u')
                    .replace(/[ç]/g, 'c')
                    .replace(/[^a-z0-9]/g, '');
                
                const cleanColumn = column.toLowerCase()
                    .replace(/[éèêë]/g, 'e')
                    .replace(/[àâä]/g, 'a')
                    .replace(/[îï]/g, 'i')
                    .replace(/[ôö]/g, 'o')
                    .replace(/[ûùü]/g, 'u')
                    .replace(/[ç]/g, 'c')
                    .replace(/[^a-z0-9]/g, '');
                
                if (cleanCandidate === cleanColumn && cleanCandidate.length > 0) {
                    return column;
                }
            }
        }

        // PRIORITÉ 5: Gestion spéciale pour les fichiers CIOMCM sans colonne "Reference" explicite
        for (let i = 0; i < candidateKeys.length; i++) {
            const candidate = candidateKeys[i];
            
            // Si on cherche "Reference" mais qu'elle n'existe pas, chercher des alternatives
            if (candidate.toLowerCase().includes('reference') || candidate.toLowerCase().includes('référence')) {
                const availableColumns = Object.keys(data[0]);
                
                // Essayer de trouver une colonne qui pourrait contenir des références
                for (let j = 0; j < availableColumns.length; j++) {
                    const column = availableColumns[j];
                    
                    // Ignorer les colonnes vides ou undefined
                    if (column === 'undefined' || column === '' || column === null) {
                        continue;
                    }
                    
                    // Vérifier si la colonne contient des données qui ressemblent à des références
                    const sampleData = data.slice(0, 5); // Prendre les 5 premières lignes
                    let hasReferenceLikeData = false;
                    
                    for (const row of sampleData) {
                        const value = row[column];
                        if (value && typeof value === 'string') {
                            // Vérifier si la valeur ressemble à une référence (alphanumérique, longueur > 3)
                            if (value.length > 3 && /^[A-Za-z0-9_-]+$/.test(value)) {
                                hasReferenceLikeData = true;
                                break;
                            }
                        }
                    }
                    
                    if (hasReferenceLikeData) {
                        return column;
                    }
                }
                
                // Si aucune colonne avec des données de référence n'est trouvée, 
                // utiliser la première colonne non-vide qui n'est pas "Compte Orange Money"
                for (let j = 0; j < availableColumns.length; j++) {
                    const column = availableColumns[j];
                    
                    if (column !== 'undefined' && column !== '' && column !== null && 
                        !column.toLowerCase().includes('compte') && 
                        !column.toLowerCase().includes('orange')) {
                        
                        return column;
                    }
                }
            }
        }

        return null;
    }

    /**
     * Calcule la similarité entre deux chaînes
     */
    private calculateStringSimilarity(str1: string, str2: string): number {
        if (str1 === str2) return 1.0;
        if (str1.length === 0 || str2.length === 0) return 0.0;
        
        const longer = str1.length > str2.length ? str1 : str2;
        const shorter = str1.length > str2.length ? str2 : str1;
        
        const distance = this.levenshteinDistance(longer, shorter);
        return (longer.length - distance) / longer.length;
    }

    /**
     * Calcule la distance de Levenshtein
     */
    private levenshteinDistance(str1: string, str2: string): number {
        const matrix = [];
        
        for (let i = 0; i <= str2.length; i++) {
            matrix[i] = [i];
        }
        
        for (let j = 0; j <= str1.length; j++) {
            matrix[0][j] = j;
        }
        
        for (let i = 1; i <= str2.length; i++) {
            for (let j = 1; j <= str1.length; j++) {
                if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
                    matrix[i][j] = matrix[i - 1][j - 1];
                } else {
                    matrix[i][j] = Math.min(
                        matrix[i - 1][j - 1] + 1,
                        matrix[i][j - 1] + 1,
                        matrix[i - 1][j] + 1
                    );
                }
            }
        }
        
        return matrix[str2.length][str1.length];
    }







    canProceedAuto(): boolean {
        return this.autoBoData.length > 0 && this.autoPartnerData.length > 0;
    }

    isAssistedReconciliationActive(): boolean {
        return this.autoProceedBusy;
    }

    getAutoProceedButtonLabel(): string {
        if (this.isAssistedReconciliationActive()) {
            return 'Réconciliation en cours — voir la progression';
        }
        if (this.certificationMode) {
            return 'Lancer la certification';
        }
        if (this.assistedOnly) {
            return 'Lancer la réconciliation';
        }
        return '🔄 Lancer la Réconciliation Automatique';
    }

    async onAutoProceed(): Promise<void> {
        if (!this.canProceedAuto()) {
            return;
        }

        if (this.isAssistedReconciliationActive()) {
            this.showReconciliationProgress = true;
            this.cd.detectChanges();
            return;
        }

        if (
            this.reconciliationProgress.percentage === 100 &&
            this.appStateService.getReconciliationResults()
        ) {
            this.showReconciliationProgress = true;
            this.cd.detectChanges();
            return;
        }

        await this.startAssistedReconciliation();
    }

    private async startAssistedReconciliation(): Promise<void> {
        this.autoProceedBusy = true;
            this.appStateService.setReconciliationLaunchMode('assisted');
            this.appStateService.setReconciliationEntryPath('/upload-assisted');
            this.loading = false; // Ne pas utiliser loading pour ne pas masquer la barre de progression
            this.errorMessage = '';
            this.successMessage = '';
            this.showReconciliationProgress = true;
            this.reconciliationProgress = {
                percentage: 0,
                step: 'Détection des clés de réconciliation...',
                currentBoChunk: 0,
                totalBoChunks: 0,
                matchesCount: 0,
                boOnlyCount: 0,
                partnerRemaining: 0,
                processed: 0,
                total: 0
            };
            this.cd.detectChanges();
            await this.yieldToMainThread(true);


            // Récupérer les noms de fichiers (upload direct ou via traitement assisté)
            const boFileName = this.getResolvedAutoBoFileName();
            const partnerFileName = this.getResolvedAutoPartnerFileName();


            try {
                // Détecter intelligemment les clés de réconciliation
                const keyDetectionResult = await this.detectReconciliationKeys(
                    this.autoBoData,
                    this.autoPartnerData,
                    boFileName,
                    partnerFileName
                );

                // Afficher les résultats de la détection

                // Afficher un message informatif pour le modèle
                const detectionMessage = `✅ Clés trouvées via modèle (${keyDetectionResult.modelId}) - Confiance: ${Math.round(keyDetectionResult.confidence * 100)}%`;

                // Traiter les données
                let processedBoData = this.autoBoData;
                let processedPartnerData = this.autoPartnerData;
                let partnerKeyColumn = keyDetectionResult.partnerKeyColumn;
                let boKeyColumn = keyDetectionResult.boKeyColumn;

                // Appliquer les traitements du modèle (boTreatments + clés conditionnelles partenaire)
                if (keyDetectionResult.modelId) {
                    try {
                        const models = await this.autoProcessingService.getAllModelsUnrestricted();
                        const usedModel = models.find(m =>
                            (m.id || m.modelId) === keyDetectionResult.modelId
                        );

                        if (usedModel?.reconciliationKeys?.boTreatments) {
                            processedBoData = this.applyBoTreatments(
                                processedBoData,
                                usedModel.reconciliationKeys.boTreatments
                            );
                        }

                        const conditionalConfig = usedModel?.reconciliationKeys?.partnerConditionalKeys;
                        const preparedKeys = this.partnerConditionalKeysService.applyModelConditionalKeys(
                            processedBoData,
                            processedPartnerData,
                            usedModel!
                        );
                        if (preparedKeys) {
                            processedBoData = preparedKeys.boData;
                            processedPartnerData = preparedKeys.partnerData;
                            boKeyColumn = preparedKeys.boKeyColumn;
                            partnerKeyColumn = preparedKeys.partnerKeyColumn;
                        } else if (this.partnerConditionalKeysService.isEnabled(conditionalConfig)) {
                            // Config activée mais invalide sur ces données : conserver les clés classiques du modèle
                        }
                    } catch (error) {
                    }
                }

                // Configurer les colonnes de comparaison
                const comparisonColumns = [{
                    boColumn: boKeyColumn,
                    partnerColumn: partnerKeyColumn
            }];

                
                // 🔍 VÉRIFICATION CRITIQUE: Vérifier que les colonnes existent dans les données
                if (processedBoData.length > 0) {
                    const boColumns = Object.keys(processedBoData[0]);
                    const boKeyExists = boColumns.includes(boKeyColumn);
                    if (!boKeyExists) {
                        // Chercher des colonnes similaires
                        const similarColumns = boColumns.filter(col => 
                            col.toLowerCase().includes(boKeyColumn.toLowerCase()) ||
                            boKeyColumn.toLowerCase().includes(col.toLowerCase())
                        );
                        if (similarColumns.length > 0) {
                        }
                        throw new Error(`Colonne clé BO "${boKeyColumn}" introuvable dans les données. Colonnes disponibles: ${boColumns.join(', ')}`);
                    }
                }
                
                if (processedPartnerData.length > 0) {
                    const partnerColumns = Object.keys(processedPartnerData[0]);
                    const partnerKeyExists = partnerColumns.includes(partnerKeyColumn);
                    if (!partnerKeyExists) {
                        // Chercher des colonnes similaires
                        const similarColumns = partnerColumns.filter(col => 
                            col.toLowerCase().includes(partnerKeyColumn.toLowerCase()) ||
                            partnerKeyColumn.toLowerCase().includes(col.toLowerCase())
                        );
                        if (similarColumns.length > 0) {
                        }
                        throw new Error(`Colonne clé Partner "${partnerKeyColumn}" introuvable dans les données. Colonnes disponibles: ${partnerColumns.join(', ')}`);
                    }
                }
                    
            const prepared = await this.prepareAutoReconciliationData(
                processedBoData,
                processedPartnerData,
                (message) => {
                    this.reconciliationProgress = { ...this.reconciliationProgress, step: message };
                    this.cd.detectChanges();
                }
            );
            const normalizedBoData = prepared.bo;
            const normalizedPartnerData = prepared.partner;
            
            
            // Créer la requête de réconciliation
                    const reconciliationRequest = {
                        boFileContent: normalizedBoData,
                        partnerFileContent: normalizedPartnerData,
                    boKeyColumn: boKeyColumn,
                    partnerKeyColumn: partnerKeyColumn,
                        comparisonColumns: comparisonColumns,
                boColumnFilters: []
            };

            const totalRows = normalizedBoData.length + normalizedPartnerData.length;
            if (totalRows <= 20000) {
                try {
                    const jsonTest = JSON.stringify(reconciliationRequest);
                } catch (error) {
                    throw new Error('Erreur: Les données ne peuvent pas être sérialisées en JSON. Vérifiez la structure des données.');
                }
            } else {
            }

            await this.yieldToMainThread(true);

                    this.loading = false;
                    this.reconciliationProgress = {
                        ...this.reconciliationProgress,
                        step: 'Initialisation de la réconciliation...',
                    };
                    this.cd.detectChanges();

                    // S'abonner aux mises à jour de progression
                    this.reconciliationProgressSubscription = this.reconciliationService.progress$.subscribe(
                        (progress) => {
                            this.reconciliationProgress = {
                                percentage: progress.percentage || 0,
                                step: progress.step || '',
                                currentBoChunk: progress.currentBoChunk || 0,
                                totalBoChunks: progress.totalBoChunks || 0,
                                matchesCount: progress.matchesCount || 0,
                                boOnlyCount: progress.boOnlyCount || 0,
                                partnerRemaining: progress.partnerRemaining || 0,
                                processed: progress.processed || 0,
                                total: progress.total || 0
                            };
                            this.cd.detectChanges();
                        },
                        (error) => {
                        }
                    );

                    // Lancer la réconciliation
                    this.reconciliationService.reconcile(reconciliationRequest).subscribe({
                        next: (result) => {
                            this.autoProceedBusy = false;
                            this.loading = false;
                            // NE PAS fermer automatiquement le popup - l'utilisateur le fermera manuellement
                            // Mettre à jour la progression à 100% pour indiquer la fin
                            this.reconciliationProgress = {
                                ...this.reconciliationProgress,
                                percentage: 100,
                                step: '✅ Réconciliation terminée avec succès!'
                            };
                            this.cd.detectChanges();
                            
                            // Nettoyer l'abonnement mais garder le popup ouvert
                            if (this.reconciliationProgressSubscription) {
                                this.reconciliationProgressSubscription.unsubscribe();
                            }
                            
                            
                            // Sauvegarder les données traitées dans le service d'état
                            this.appStateService.setReconciliationData(processedBoData, processedPartnerData);
                            this.reconciliationTabsService.clearAllData();
                            // Sauvegarder le résultat de la réconciliation (nouvelle réco = cache onglets vidé)
                            this.appStateService.setReconciliationResults(result);
                            this.appStateService.setCurrentStep(4);
                            
                            // Attendre que l'utilisateur ferme le popup avant de naviguer
                            // La navigation se fera quand l'utilisateur fermera le popup
                        },
                        error: (error) => {
                            this.autoProceedBusy = false;
                            this.loading = false;
                            // NE PAS fermer automatiquement le popup - l'utilisateur le fermera manuellement
                            // Mettre à jour la progression pour indiquer l'erreur
                            this.reconciliationProgress = {
                                ...this.reconciliationProgress,
                                percentage: 0,
                                step: '❌ Erreur lors de la réconciliation'
                            };
                            this.cd.detectChanges();
                            
                            // Nettoyer l'abonnement mais garder le popup ouvert
                            if (this.reconciliationProgressSubscription) {
                                this.reconciliationProgressSubscription.unsubscribe();
                            }
                            
                            this.errorMessage = `Erreur lors de la réconciliation automatique: ${error.message}`;
                        }
                    });

            } catch (error: any) {
                this.autoProceedBusy = false;
                this.loading = false;
                this.errorMessage = '';

                const bo = this.getResolvedAutoBoFileName() || 'BO';
                const partner = this.getResolvedAutoPartnerFileName() || 'Partenaire';
                const message = error?.message?.includes('Aucun modèle de réconciliation trouvé')
                    ? `Réconciliation impossible : aucun modèle trouvé pour ${bo} et ${partner}.\n\n` +
                      `Configurez un modèle dans « Modèles de Traitement » ou utilisez « Traitement de fichier » pour assigner le bon modèle.`
                    : (error?.message || 'Erreur lors de la détection des clés de réconciliation.');

                await this.popupService.showError(message, 'Réconciliation impossible');
            }
    }

    // Méthodes pour la sélection de service en mode manuel
    private detectTRXBOForManualMode(data: Record<string, string>[]): boolean {
        if (!data || data.length === 0) return false;
        
        const firstRow = data[0];
        const columns = Object.keys(firstRow);
        
        // Vérifier si c'est un fichier TRXBO (contient une colonne "Service" ou "service")
        const hasServiceColumn = columns.some(col => 
            col.toLowerCase().includes('service') || 
            col.toLowerCase().includes('serv')
        );
        
        if (hasServiceColumn) {
            
            // Trouver la colonne service
            const serviceColumn = columns.find(col => 
                col.toLowerCase().includes('service') || 
                col.toLowerCase().includes('serv')
            );
            
            if (serviceColumn) {
                // Extraire tous les services uniques
                const services = [...new Set(data.map(row => row[serviceColumn]).filter(service => service && service.trim()))];
                this.manualAvailableServices = services.sort();
                this.manualServiceSelectionData = data;
                
                
                return true;
            }
        }
        
        return false;
    }

    private showManualServiceSelectionStep(): void {
        this.showManualServiceSelection = true;
        this.manualServiceSearchFilter = '';
        this.manualSelectedServices = [...this.manualAvailableServices]; // Sélectionner tous par défaut
    }

    confirmManualServiceSelection(): void {
        if (this.manualSelectedServices.length === 0) {
            this.errorMessage = 'Veuillez sélectionner au moins un service.';
            return;
        }

        
        // Filtrer les données pour ne garder que les lignes des services sélectionnés
        const serviceColumn = Object.keys(this.manualServiceSelectionData[0]).find(col => 
            col.toLowerCase().includes('service') || 
            col.toLowerCase().includes('serv')
        );
        
        if (serviceColumn) {
            const filteredData = this.manualServiceSelectionData.filter(row => 
                this.manualSelectedServices.includes(row[serviceColumn])
            );
            
            
            // Si une colonne statut existe, extraire les statuts et afficher la sélection
            if (this.manualStatusColumn && filteredData.length > 0) {
                // Extraire les statuts uniques des données filtrées par service
                const statuses = [...new Set(
                    filteredData.map(row => row[this.manualStatusColumn!])
                        .filter(status => status && status.toString().trim())
                )];
                
                this.manualAvailableStatuses = statuses.sort();
                this.manualStatusSelectionData = filteredData;
                
                
                // Masquer la sélection des services et afficher la sélection des statuts
                this.showManualServiceSelection = false;
                this.showManualStatusSelectionStep();
                
                // Forcer la détection des changements pour mettre à jour la vue
                this.cd.detectChanges();
            } else {
                // Pas de colonne statut, mettre à jour les données BO directement
                this.boData = filteredData;
                
                // Masquer la sélection des services
                this.showManualServiceSelection = false;
                
                // Continuer avec la réconciliation manuelle
                this.continueWithManualReconciliation();
            }
        }
    }

    // Passer la sélection des services TRXBO (mode manuel) : tout sélectionner ou utiliser les données si liste vide
    skipManualServiceSelection(): void {
        if (!this.manualAvailableServices || this.manualAvailableServices.length === 0) {
            const sourceData = this.manualServiceSelectionData && this.manualServiceSelectionData.length > 0
                ? this.manualServiceSelectionData : [];
            if (sourceData.length === 0) {
                this.errorMessage = 'Aucune donnée disponible pour continuer.';
                return;
            }
            if (this.manualStatusColumn && sourceData.length > 0) {
                const statuses = [...new Set(
                    sourceData.map(row => row[this.manualStatusColumn!]).filter(s => s && s.toString().trim())
                )];
                this.manualAvailableStatuses = statuses.sort();
                this.manualStatusSelectionData = sourceData;
                this.showManualServiceSelection = false;
                this.showManualStatusSelectionStep();
                this.cd.detectChanges();
            } else {
                this.boData = sourceData;
                this.showManualServiceSelection = false;
                this.continueWithManualReconciliation();
            }
        } else {
            this.manualSelectedServices = [...this.manualAvailableServices];
            this.confirmManualServiceSelection();
        }
    }

    cancelManualServiceSelection(): void {
        this.showManualServiceSelection = false;
        this.manualServiceSearchFilter = '';
        this.manualStatusSearchFilter = '';
        this.manualAvailableServices = [];
        this.manualSelectedServices = [];
        this.manualServiceSelectionData = [];
        // Nettoyer aussi les variables de statut
        this.manualStatusColumn = null;
        this.showManualStatusSelection = false;
        this.manualAvailableStatuses = [];
        this.manualSelectedStatuses = [];
        this.manualStatusSelectionData = [];
    }

    private continueWithManualReconciliation(): void {
        
        // Vérifier si le fichier partenaire est uploadé
        if (!this.partnerFile) {
            this.errorMessage = 'Veuillez d\'abord uploader le fichier partenaire avant de continuer.';
            return;
        }
        
        // Vérifier si les données partenaire sont chargées
        if (this.partnerData.length === 0) {
            this.processFileWithAutoProcessing(this.partnerFile, 'partner');
            return;
        }
        
        // Sauvegarder les données dans le service d'état
        this.appStateService.setReconciliationData(this.boData, this.partnerData);
        this.appStateService.setCurrentStep(2);
        
        // Naviguer vers la page de sélection des colonnes
        this.router.navigate(['/column-selection']);
    }

    onManualServiceSelectionChange(event: Event, service: string): void {
        const checkbox = event.target as HTMLInputElement;
        if (checkbox.checked) {
            if (!this.manualSelectedServices.includes(service)) {
                this.manualSelectedServices.push(service);
            }
        } else {
            this.manualSelectedServices = this.manualSelectedServices.filter(s => s !== service);
        }
    }

    get filteredManualAvailableServices(): string[] {
        if (!hasCommaSeparatedSearchFilter(this.manualServiceSearchFilter)) return this.manualAvailableServices;
        return this.manualAvailableServices.filter(s =>
            matchesCommaSeparatedFilter(
                this.manualServiceSearchFilter,
                s,
                this.getManualServiceCount(s)
            )
        );
    }

    onManualServiceSearchFilterChange(value: string): void {
        const hasFilter = hasCommaSeparatedSearchFilter(value);
        const hadSnapshot = Array.isArray(this.manualServicesSelectionBeforeSearch);
        if (hasFilter && !hadSnapshot) {
            this.manualServicesSelectionBeforeSearch = [...this.manualSelectedServices];
        }
        this.manualServiceSearchFilter = value;
        if (hasFilter) {
            this.manualSelectedServices = [...this.filteredManualAvailableServices];
        } else if (hadSnapshot) {
            this.manualSelectedServices = [...(this.manualServicesSelectionBeforeSearch || [])];
            this.manualServicesSelectionBeforeSearch = null;
        }
    }

    getManualServiceCount(service: string): number {
        if (!this.manualServiceSelectionData || this.manualServiceSelectionData.length === 0) return 0;
        
        const serviceColumn = Object.keys(this.manualServiceSelectionData[0]).find(col => 
            col.toLowerCase().includes('service') || 
            col.toLowerCase().includes('serv')
        );
        
        if (serviceColumn) {
            return this.manualServiceSelectionData.filter(row => row[serviceColumn] === service).length;
        }
        
        return 0;
    }

    selectAllManualServices(): void {
        const toSelect = this.filteredManualAvailableServices;
        toSelect.forEach(s => { if (!this.manualSelectedServices.includes(s)) this.manualSelectedServices.push(s); });
        this.manualSelectedServices = [...this.manualSelectedServices];
    }

    deselectAllManualServices(): void {
        const toDeselect = this.filteredManualAvailableServices;
        this.manualSelectedServices = this.manualSelectedServices.filter(s => !toDeselect.includes(s));
    }

    // Méthode pour afficher la sélection des statuts pour TRXBO en mode manuel (étape 3)
    private showManualStatusSelectionStep(): void {
        this.showManualStatusSelection = true;
        this.manualStatusSearchFilter = '';
        this.manualSelectedStatuses = [...this.manualAvailableStatuses]; // Sélectionner tous par défaut
    }

    // Méthode pour confirmer la sélection des statuts (mode manuel)
    confirmManualStatusSelection(): void {
        if (this.manualSelectedStatuses.length === 0) {
            this.errorMessage = 'Veuillez sélectionner au moins un statut.';
            return;
        }

        
        if (!this.manualStatusColumn || !this.manualStatusSelectionData || this.manualStatusSelectionData.length === 0) {
            this.errorMessage = 'Erreur: colonne statut non trouvée.';
            return;
        }
        
        // Filtrer les données pour ne garder que les lignes des statuts sélectionnés
        const filteredData = this.manualStatusSelectionData.filter(row => 
            this.manualSelectedStatuses.includes(row[this.manualStatusColumn!])
        );
        
        
        // Mettre à jour les données BO avec les données filtrées
        this.boData = filteredData;
        
        // Masquer la sélection des statuts
        this.showManualStatusSelection = false;
        
        // Continuer avec la réconciliation manuelle
        this.continueWithManualReconciliation();
    }

    // Passer la sélection des statuts TRXBO (mode manuel) : tout sélectionner ou utiliser les données si liste vide
    skipManualStatusSelection(): void {
        if (!this.manualAvailableStatuses || this.manualAvailableStatuses.length === 0) {
            const sourceData = this.manualStatusSelectionData && this.manualStatusSelectionData.length > 0
                ? this.manualStatusSelectionData : [];
            if (sourceData.length === 0) {
                this.errorMessage = 'Aucune donnée disponible pour continuer.';
                return;
            }
            this.boData = sourceData;
            this.showManualStatusSelection = false;
            this.continueWithManualReconciliation();
        } else {
            this.manualSelectedStatuses = [...this.manualAvailableStatuses];
            this.confirmManualStatusSelection();
        }
    }

    // Méthode pour annuler la sélection des statuts (mode manuel)
    cancelManualStatusSelection(): void {
        this.showManualStatusSelection = false;
        this.manualStatusSearchFilter = '';
        this.manualAvailableStatuses = [];
        this.manualSelectedStatuses = [];
        this.manualStatusSelectionData = [];
    }

    // Méthode pour gérer le changement de sélection des statuts (mode manuel)
    onManualStatusSelectionChange(event: Event, status: string): void {
        const checkbox = event.target as HTMLInputElement;
        if (checkbox.checked) {
            if (!this.manualSelectedStatuses.includes(status)) {
                this.manualSelectedStatuses.push(status);
            }
        } else {
            this.manualSelectedStatuses = this.manualSelectedStatuses.filter(s => s !== status);
        }
    }

    // Méthode pour compter le nombre de lignes par statut (mode manuel)
    getManualStatusCount(status: string): number {
        if (!this.manualStatusSelectionData || this.manualStatusSelectionData.length === 0 || !this.manualStatusColumn) return 0;
        
        return this.manualStatusSelectionData.filter(row => row[this.manualStatusColumn!] === status).length;
    }

    get filteredManualAvailableStatuses(): string[] {
        if (!hasCommaSeparatedSearchFilter(this.manualStatusSearchFilter)) return this.manualAvailableStatuses;
        return this.manualAvailableStatuses.filter(st =>
            matchesCommaSeparatedFilter(
                this.manualStatusSearchFilter,
                st,
                this.getManualStatusCount(st)
            )
        );
    }

    selectAllManualStatuses(): void {
        const toSelect = this.filteredManualAvailableStatuses;
        toSelect.forEach(st => { if (!this.manualSelectedStatuses.includes(st)) this.manualSelectedStatuses.push(st); });
        this.manualSelectedStatuses = [...this.manualSelectedStatuses];
    }

    // Méthode pour désélectionner tous les statuts (mode manuel)
    deselectAllManualStatuses(): void {
        const toDeselect = this.filteredManualAvailableStatuses;
        this.manualSelectedStatuses = this.manualSelectedStatuses.filter(st => !toDeselect.includes(st));
    }

    // Méthodes pour l'aide et la configuration des modèles
    canAccessModelConfiguration(): boolean {
        return this.appStateService.isAdmin() || this.appStateService.isModuleAllowed('Modèles');
    }

    goToModelConfiguration(): void {
        if (!this.canAccessModelConfiguration()) {
            void this.popupService.showWarning(
                'La configuration des modèles est réservée aux utilisateurs ayant accès au module « Modèles de traitement ». Contactez un administrateur.',
                'Accès refusé'
            );
            return;
        }
        this.router.navigate(['/auto-processing-models']);
    }

    showModelHelp(): void {
        const helpMessage = `📚 Aide - Configuration des Modèles de Réconciliation

🔧 Pour configurer un modèle de réconciliation :

1. Allez dans "Modèles de Traitement" 
2. Cliquez sur "Créer un nouveau modèle"
3. Configurez :
   - Nom du modèle (ex: "Oppart")
   - Pattern de fichier (ex: "*OPPART*.xls")
   - Type: "partner"
   - Clés de réconciliation :
     * Partner Keys: ["Numero Trans GU"]
     * BO Keys: ["Numero Trans GU"]

💡 Exemple pour vos fichiers :
   - Modèle "Oppart" : Pattern "*OPPART*.xls", Type "partner"
   - Modèle "TRXBO" : Pattern "*TRXBO*.xls", Type "bo"

✅ Une fois configuré, la réconciliation automatique utilisera ces modèles.`;

        this.popupService.showInfo(helpMessage);
    }

    /**
     * Ferme le popup de progression de réconciliation
     */
    closeReconciliationProgress(): void {
        const clickStartTime = performance.now();
        
        const step1Start = performance.now();
        this.showReconciliationProgress = false;
        const step1Duration = performance.now() - step1Start;
        
        // Nettoyer l'abonnement si toujours actif
        const step2Start = performance.now();
        if (this.reconciliationProgressSubscription) {
            this.reconciliationProgressSubscription.unsubscribe();
        }
        const step2Duration = performance.now() - step2Start;
        
        // Si la réconciliation est terminée (step à 100%), naviguer vers les résultats
        const step3Start = performance.now();
        
        if (this.reconciliationProgress.percentage === 100) {
            const navStart = performance.now();
            const targetRoute = this.certificationMode ? '/certification-solde' : '/results';
            this.appStateService.reconciliationResult$.pipe(take(1)).subscribe(results => {
                if (!results) {
                    return;
                }
                this.router.navigate([targetRoute]).then(() => {
                    const navDuration = performance.now() - navStart;
                }).catch((error) => {
                    const navDuration = performance.now() - navStart;
                });
            });
        } else {
        }
        const step3Duration = performance.now() - step3Start;
        
        const step4Start = performance.now();
        this.cd.detectChanges();
        const step4Duration = performance.now() - step4Start;
        
        const totalDuration = performance.now() - clickStartTime;
    }

    ngOnDestroy(): void {
        this.traitementViewDestroyed = true;
        // Nettoyer l'abonnement à la progression
        if (this.reconciliationProgressSubscription) {
            this.reconciliationProgressSubscription.unsubscribe();
        }
    }
} 