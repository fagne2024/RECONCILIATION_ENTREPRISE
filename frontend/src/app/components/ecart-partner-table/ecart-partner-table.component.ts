import { Component, OnInit, OnDestroy, ChangeDetectorRef, ChangeDetectionStrategy, HostListener, ElementRef, ViewChild } from '@angular/core';
import { Router } from '@angular/router';
import { Subscription, firstValueFrom } from 'rxjs';
import { skip } from 'rxjs/operators';
import { Match, ReconciliationResponse } from '../../models/reconciliation-response.model';
import { AppStateService } from '../../services/app-state.service';
import { ExportOptimizationService, ExportProgress, ECART_COMMENT_COLORS } from '../../services/export-optimization.service';
import { PopupService } from '../../services/popup.service';
import { ImpactOPService } from '../../services/impact-op.service';
import { OperationService } from '../../services/operation.service';
import { CompteService } from '../../services/compte.service';
import { ImpactOP } from '../../models/impact-op.model';
import { OperationCreateRequest } from '../../models/operation.model';
import { fixGarbledCharacters } from '../../utils/encoding-fixer';
import { ReconciliationTabsService } from '../../services/reconciliation-tabs.service';
import { ReconciliationService } from '../../services/reconciliation.service';
import { extractRecordAmount } from '../../utils/record-amount.util';
import { partitionEcartRecords, resolveMagicPartitionContext } from '../../utils/magic-partition.util';
import { SharedModule } from '../../shared/shared.module';
import { DsPaginationComponent } from '../../shared/ui';
import { OppartService } from '../../services/oppart.service';
import { ConfigurationCalculService } from '../../services/configuration-calcul.service';
import { Oppart } from '../../models/oppart.model';
import { SuiviTrxAnnulerRow, SuiviTrxAnnulerService } from '../../services/suivi-trx-a-annuler.service';
import {
  EMPTY_PARTNER_FIELDS,
  PartnerFields,
  extractPartnerFields,
  normalizePartnerAmount,
  partnerPhoneKey,
  normalizePartnerTransactionId
} from '../../utils/partner-fields.util';
import { TranslateModule, TranslateService } from '@ngx-translate/core';

/** Ligne éditable de la table de création OPPART. */
interface OppartDraftRowUI {
  client: string;
  typeOp: string;
  montant: string;
  /** Date d'opération BO. */
  dateOperation: string;
  /** Date d'opération côté partenaire. */
  dateOperationPart: string;
  /** Date de la demande / initiation. */
  dateDemande: string;
  idTransaction: string;
  pays: string;
  source: string;
}

/** Champ cible OPPART + colonnes source candidates pour l'auto-détection. */
interface OppartTargetFieldDef {
  key: keyof OppartDraftRowUI;
  label: string;
  hint: string;
  keywords: string[];
  /** Valeur manuelle pré-remplie à l'ouverture du popup. */
  defaultValue?: string;
  /** false : ne pas repliquer la 1re colonne du fichier si aucune correspondance. */
  allowFirstColumnFallback?: boolean;
}

/** ID Annulation retrouvé dans les données existantes, avec sa provenance. */
interface SuiviIdCandidate {
  id: string;
  source: string;
}

/** Champ existant (ligne partenaire ou BO) dont la valeur peut être utilisée comme ID. */
interface SuiviIdFieldOption {
  key: string;
  label: string;
  value: string;
  source: string;
}

@Component({
  selector: 'app-ecart-partner-table',
  standalone: true,
  imports: [TranslateModule, SharedModule, DsPaginationComponent],
  templateUrl: './ecart-partner-table.component.html',
  styleUrls: ['./ecart-partner-table.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class EcartPartnerTableComponent implements OnInit, OnDestroy {
  response: ReconciliationResponse | null = null;
  filteredPartnerOnly: Record<string, string>[] = [];
  displayedPartnerOnly: Record<string, string>[] = [];
  private subscription = new Subscription();
  
  // Pagination
  currentPage = 1;
  pageSize = 20;
  totalPages = 1;
  
  // Recherche
  searchKey: string = '';
  
  // Colonnes du tableau
  allColumns: string[] = [];
  displayedColumns: string[] = [];
  
  // Sélection de colonnes pour export
  showColumnSelector = false;
  selectedColumnsForExport: { [key: string]: boolean } = {};
  availableColumnsForExport: string[] = [];
  
  // Sélection de lignes
  selectedPartnerOnlyKeys: string[] = [];
  
  // Export
  isExporting = false;
  exportProgress: ExportProgress = {
    current: 0,
    total: 0,
    percentage: 0,
    message: '',
    isComplete: false
  };
  private exportSubscription?: Subscription;
  
  // Menu dropdown
  showExportMenu = false;
  
  // Sauvegarde
  isSavingEcartPartnerToImpactOP = false;
  selectedPartnerImportOpDate: string | null = null;
  
  // Création OPPART
  showOppartCreation = false;
  oppartSourceRecords: Record<string, string>[] = [];
  oppartColumnMapping: { [key: string]: string } = {};
  oppartManualValues: { [key: string]: string } = {};
  showOppartSourceList = true;
  oppartSourceFilter = '';
  oppartDraftRows: OppartDraftRowUI[] = [];
  isSavingOppart = false;

  // Saisie directe de l'ID Annulation depuis un écart partenaire
  showSuiviIdPopup = false;
  suiviIdRecord: Record<string, string> | null = null;
  suiviIdFields: PartnerFields = { ...EMPTY_PARTNER_FIELDS };
  suiviIdValue = '';
  /** IDs Annulation retrouvés automatiquement dans les données existantes. */
  suiviIdCandidates: SuiviIdCandidate[] = [];
  /** Champs de la ligne (et du BO correspondant) utilisables comme ID. */
  suiviIdFieldOptions: SuiviIdFieldOption[] = [];
  /** Champ sélectionné dans la liste des valeurs existantes. */
  suiviIdSelectedField = '';
  isSavingSuiviId = false;
  /** Préfixe des clés de suivi créées depuis /ecart-partner (évite les collisions avec /matches). */
  static readonly SUIVI_ECART_PARTNER_PREFIX = 'ecart-partner:';
  private suiviRows: SuiviTrxAnnulerRow[] = [];
  private suiviRowsByMatchKey = new Map<string, SuiviTrxAnnulerRow>();
  private suiviRowsByTransactionId = new Map<string, SuiviTrxAnnulerRow[]>();
  private suiviRowsByPhoneAmount = new Map<string, SuiviTrxAnnulerRow[]>();
  private suiviIdIndexLoaded = false;
  private suiviIdIndexRequested = false;
  private suiviIdIndexPromise: Promise<void> | null = null;

  /** Index des correspondances de réconciliation pour retrouver un ID ou les champs BO. */
  private matchIndexBuilt = false;
  private matchIndexSource: Match[] | null = null;
  private matchIdsByTransactionId = new Map<string, string[]>();
  private matchIdsByPhoneAmount = new Map<string, string[]>();
  private matchIdsByPhone = new Map<string, string[]>();
  private matchesByTransactionId = new Map<string, Match>();
  private matchesByPhoneAmount = new Map<string, Match>();

  /** Définition des champs cibles OPPART et des colonnes source d'auto-détection. */
  readonly oppartTargetFields: OppartTargetFieldDef[] = [
    { key: 'client', label: 'Client', hint: 'Client / bénéficiaire', keywords: ['client', 'telephone', 'tel', 'beneficiaire', 'beneficiaire', 'expediteur', 'benef', 'nom'] },
    { key: 'typeOp', label: 'Type_OP', hint: 'Type d\'opération / service', keywords: ['type', 'service', 'trans'] },
    { key: 'montant', label: 'Montant', hint: 'Montant / volume', keywords: ['montant', 'amount', 'volume', 'prix'] },
    {
      key: 'dateOperation',
      label: 'Date opération BO',
      hint: 'Date d\'opération BO (récupérée du BO correspondant ou colonne source)',
      // Aucune colonne partenaire par défaut : la date BO vient de la
      // correspondance de réconciliation. L'utilisateur peut néanmoins
      // sélectionner une colonne ou saisir une valeur manuelle.
      keywords: [],
      allowFirstColumnFallback: false
    },
    {
      key: 'dateOperationPart',
      label: 'Date opération part',
      hint: 'Date de l\'opération côté partenaire',
      keywords: ['completiontime', 'transactiondate', 'horodatage', 'operdate', 'dateoperation', 'date'],
      allowFirstColumnFallback: false
    },
    {
      key: 'dateDemande',
      label: 'Date demande',
      hint: 'Date de la demande / initiation',
      keywords: ['datedemande', 'datedelademande', 'demande', 'requestdate', 'requesttime', 'requestdatetime', 'daterequest', 'initiationtime', 'initiationdate', 'initiationdatetime', 'soumission'],
      allowFirstColumnFallback: false
    },
    { key: 'idTransaction', label: 'ID', hint: 'Identifiant de transaction', keywords: ['transgu', 'trans gu', 'numero', 'idop', 'id op', 'idtransaction', 'id'] },
    { key: 'pays', label: 'Pays', hint: 'Pays / réseau', keywords: ['pays', 'country', 'grx', 'groupe', 'reseau', 'network'] },
    {
      key: 'source',
      label: 'Source',
      hint: 'Origine de la ligne (éditable)',
      keywords: ['source', 'origine', 'origin'],
      defaultValue: EcartPartnerTableComponent.OPPART_SOURCE_ECART_PARTNER,
      // La source n'est pas une donnée du fichier d'écarts : pas de repli sur la 1re colonne.
      allowFirstColumnFallback: false
    }
  ];

  /** Source appliquée par défaut aux lignes converties depuis les écarts partenaire. */
  static readonly OPPART_SOURCE_ECART_PARTNER = 'ECART_PARTNER';

  /** Valeurs proposées dans la liste déroulante du champ Type_OP. */
  readonly oppartTypeOpOptions: string[] = [
    'Compense',
    'Approvisionnement',
    'Ajustement',
    'Régularisation',
    'Transfert'
  ];

  /** Options du select Type_OP, en conservant une valeur existante hors liste. */
  oppartTypeOpSelectOptions(current?: string): string[] {
    const value = (current || '').trim();
    if (value && !this.oppartTypeOpOptions.includes(value)) {
      return [...this.oppartTypeOpOptions, value];
    }
    return this.oppartTypeOpOptions;
  }
  
  // Chargement progressif
  isLoading = false;
  loadProgress = 0;
  private lastProcessedSignature = '';
  private loadPartnerOnlyInFlight: Promise<void> | null = null;
  private loadPartnerOnlyGeneration = 0;
  magicServiceFilterLocked = '';

  // Scroll to top
  showScrollTopBtn = false;

  // Scroll horizontal tableau
  @ViewChild('tableWrapper') tableWrapperRef!: ElementRef<HTMLDivElement>;
  tableScrollLeft = 0;
  tableScrollMax = 0;
  private readonly TABLE_SCROLL_STEP = 300;
  
  constructor(
    private appStateService: AppStateService,
    private router: Router,
    private cdr: ChangeDetectorRef,
    private exportOptimizationService: ExportOptimizationService,
    private popupService: PopupService,
    private impactOPService: ImpactOPService,
    private operationService: OperationService,
    private compteService: CompteService,
    private reconciliationTabsService: ReconciliationTabsService,
    private reconciliationService: ReconciliationService,
    private oppartService: OppartService,
    private suiviTrxAnnulerService: SuiviTrxAnnulerService,
    private translate: TranslateService,
    private calculService: ConfigurationCalculService,
    private el: ElementRef
  ) {}

  private t(key: string, params?: any): string {
    return this.translate.instant(key, params) as string;
  }

  fieldLabel(field: OppartTargetFieldDef): string {
    return this.t('OPP.field.' + field.key + '.label') || field.label;
  }

  fieldHint(field: OppartTargetFieldDef): string {
    return this.t('OPP.field.' + field.key + '.hint') || field.hint;
  }

  @HostListener('scroll', ['$event.target'])
  onHostScroll(target: HTMLElement): void {
    this.showScrollTopBtn = target.scrollTop > 300;
    this.cdr.markForCheck();
  }

  ngOnInit(): void {
    this.syncMagicContextFromAppState();
    this.loadSuiviIdIndex();

    this.subscription.add(
      this.appStateService.getReconciliationResults().subscribe((response: ReconciliationResponse | null) => {
        if (response) {
          this.response = response;
          this.syncMagicContextFromAppState();
          void this.loadPartnerOnly();
        }
      })
    );

    this.subscription.add(
      this.appStateService.selectedMagicService$.pipe(skip(1)).subscribe(() => {
        this.syncMagicContextFromAppState();
        if (this.response) {
          void this.loadPartnerOnly(true);
        }
      })
    );
    
    // Fermer le menu en cliquant en dehors
    document.addEventListener('click', this.handleDocumentClick.bind(this));
  }
  
  private handleDocumentClick(event: MouseEvent): void {
    const target = event.target as HTMLElement;
    if (!target.closest('.export-menu-container')) {
      this.showExportMenu = false;
      this.cdr.markForCheck();
    }
  }

  ngOnDestroy(): void {
    this.subscription.unsubscribe();
    if (this.exportSubscription) {
      this.exportSubscription.unsubscribe();
    }
    document.removeEventListener('click', this.handleDocumentClick.bind(this));
  }

  private syncMagicContextFromAppState(): void {
    const service = this.appStateService.getSelectedMagicService();
    const partnerFile = this.appStateService.getSelectedMagicPartnerFile();
    if (service || partnerFile) {
      this.reconciliationTabsService.setMagicViewContext(service, partnerFile);
      if (service) {
        this.magicServiceFilterLocked = service;
      }
    }
  }

  private buildPartnerOnlyLoadSignature(): string {
    const sessionId =
      this.response?.progressSessionId ||
      this.reconciliationService.getCurrentJobId() ||
      '';
    return [
      sessionId,
      this.response?.totalPartnerOnly ?? 0,
      this.appStateService.getSelectedMagicService(),
      this.appStateService.getSelectedMagicPartnerFile()
    ].join('|');
  }

  private async resolvePartnerOnlyForDisplay(): Promise<Record<string, string>[]> {
    const sessionId =
      this.response?.progressSessionId ||
      this.reconciliationService.getCurrentJobId();
    const expectedTotal = this.response?.totalPartnerOnly ?? 0;
    let partnerOnly = this.response?.partnerOnly || [];

    if (
      sessionId &&
      (this.response?.resultsPaginated || expectedTotal > 0)
    ) {
      const needsServerLoad =
        partnerOnly.length === 0 ||
        (expectedTotal > 0 && partnerOnly.length !== expectedTotal);
      if (needsServerLoad) {
        partnerOnly = await this.reconciliationService.loadPartnerOnlyFromSession(sessionId);
        if (this.response) {
          this.response = { ...this.response, partnerOnly };
        }
      }
    } else if (partnerOnly.length === 0) {
      const cached = this.reconciliationTabsService.getFilteredPartnerOnly();
      if (cached?.length) {
        partnerOnly = cached;
      }
    }

    const ctx = resolveMagicPartitionContext({
      appStateService: this.appStateService.getSelectedMagicService(),
      appStatePartnerFile: this.appStateService.getSelectedMagicPartnerFile(),
      tabsContext: this.reconciliationTabsService.getMagicViewContext()
    });

    if (!ctx.service && !ctx.partnerFile) {
      return partnerOnly;
    }

    this.reconciliationTabsService.setMagicViewContext(ctx.service, ctx.partnerFile);
    this.magicServiceFilterLocked = ctx.service;

    return partitionEcartRecords(partnerOnly, ctx);
  }

  private loadPartnerOnly(forceReload = false): Promise<void> {
    const signature = this.buildPartnerOnlyLoadSignature();
    if (!forceReload && signature === this.lastProcessedSignature && this.filteredPartnerOnly.length > 0) {
      return Promise.resolve();
    }
    if (this.loadPartnerOnlyInFlight) {
      return this.loadPartnerOnlyInFlight;
    }
    this.loadPartnerOnlyInFlight = this.executeLoadPartnerOnly(signature).finally(() => {
      this.loadPartnerOnlyInFlight = null;
    });
    return this.loadPartnerOnlyInFlight;
  }

  private async executeLoadPartnerOnly(signature: string): Promise<void> {
    const generation = ++this.loadPartnerOnlyGeneration;
    this.isLoading = true;
    this.loadProgress = 0;
    this.cdr.markForCheck();

    try {
      this.syncMagicContextFromAppState();
      const allData = await this.resolvePartnerOnlyForDisplay();
      if (generation !== this.loadPartnerOnlyGeneration) {
        return;
      }
      this.reconciliationTabsService.setFilteredPartnerOnly(allData);
      await this.loadPartnerOnlyProgressively(allData, generation);
      if (generation === this.loadPartnerOnlyGeneration) {
        this.lastProcessedSignature = signature;
      }
    } finally {
      if (generation === this.loadPartnerOnlyGeneration) {
        this.isLoading = false;
        this.loadProgress = 100;
        this.cdr.markForCheck();
        setTimeout(() => this.updateTableScrollState(), 100);
      }
    }
  }

  getPartnerOnlyVolume(record: Record<string, string>): number {
    return extractRecordAmount(record);
  }

  private async loadPartnerOnlyProgressively(allData: Record<string, string>[], generation: number): Promise<void> {
      const total = allData.length;
      
      if (total === 0) {
        if (generation !== this.loadPartnerOnlyGeneration) {
          return;
        }
        this.filteredPartnerOnly = [];
        this.loadProgress = 100;
        this.initializeColumns();
        this.applyFilters();
        return;
      }

      const chunkSize = 500;
      this.filteredPartnerOnly = [];
      
      if (allData.length > 0) {
        const sampleSize = Math.min(50, total);
        this.filteredPartnerOnly.push(...allData.slice(0, sampleSize));
        this.loadProgress = 2;
        this.initializeColumns();
        this.applyFilters();
        this.cdr.markForCheck();
        await new Promise(resolve => setTimeout(resolve, 0));
        if (generation !== this.loadPartnerOnlyGeneration) {
          return;
        }
      }
      
      for (let i = 50; i < total; i += chunkSize) {
        if (generation !== this.loadPartnerOnlyGeneration) {
          return;
        }
        const chunk = allData.slice(i, Math.min(i + chunkSize, total));
        this.filteredPartnerOnly.push(...chunk);
        this.loadProgress = Math.round(((i + chunk.length) / total) * 98 + 2);
        
        if ((i / chunkSize) % 3 === 0) {
          this.applyFilters();
        }
        
        this.cdr.markForCheck();
        await new Promise(resolve => setTimeout(resolve, 0));
      }
      
      if (generation !== this.loadPartnerOnlyGeneration) {
        return;
      }
      this.applyFilters();
  }

  private initializeColumns(): void {
    if (this.filteredPartnerOnly.length > 0) {
      const allKeysSet = new Set<string>();
      
      // Optimiser : parcourir seulement les premiers enregistrements pour détecter les colonnes
      const sampleSize = Math.min(100, this.filteredPartnerOnly.length);
      for (let i = 0; i < sampleSize; i++) {
        Object.keys(this.filteredPartnerOnly[i]).forEach(key => {
          const correctedKey = fixGarbledCharacters(key);
          allKeysSet.add(correctedKey);
        });
      }
      
      // Si on a déjà toutes les colonnes, pas besoin de continuer
      if (sampleSize < this.filteredPartnerOnly.length) {
        for (let i = sampleSize; i < this.filteredPartnerOnly.length; i++) {
          Object.keys(this.filteredPartnerOnly[i]).forEach(key => {
            const correctedKey = fixGarbledCharacters(key);
            allKeysSet.add(correctedKey);
          });
        }
      }
      
      this.allColumns = Array.from(allKeysSet);
      this.displayedColumns = this.allColumns;
      
      // Colonnes disponibles pour l'export
      this.availableColumnsForExport = this.allColumns;
      
      // Initialiser la sélection pour l'export (toutes sélectionnées par défaut)
      this.availableColumnsForExport.forEach(col => {
        this.selectedColumnsForExport[col] = true;
      });
    }
  }

  onSearch(): void {
    this.currentPage = 1;
    this.applyFilters();
  }

  private applyFilters(): void {
    let filtered = [...this.filteredPartnerOnly];
    
    // Appliquer la recherche de manière optimisée
    if (this.searchKey.trim()) {
      const searchLower = this.searchKey.toLowerCase();
      const searchTerms = searchLower.split(/\s+/).filter(term => term.length > 0);
      
      filtered = filtered.filter(record => {
        // Créer une chaîne de recherche une seule fois par enregistrement
        const searchableText = Object.values(record)
          .map(val => String(val).toLowerCase())
          .join(' ');
        
        // Vérifier si tous les termes de recherche sont présents
        return searchTerms.every(term => searchableText.includes(term));
      });
    }
    
    this.displayedPartnerOnly = filtered;
    this.totalPages = Math.max(1, Math.ceil(this.displayedPartnerOnly.length / this.pageSize));
    
    // Réinitialiser à la première page si nécessaire
    if (this.currentPage > this.totalPages) {
      this.currentPage = 1;
    }
    
    this.cdr.markForCheck();
  }

  getPagedPartnerOnly(): Record<string, string>[] {
    const start = (this.currentPage - 1) * this.pageSize;
    const end = start + this.pageSize;
    return this.displayedPartnerOnly.slice(start, end);
  }

  prevPage(): void {
    if (this.currentPage > 1) {
      this.currentPage--;
      this.cdr.markForCheck();
    }
  }

  nextPage(): void {
    if (this.currentPage < this.totalPages) {
      this.currentPage++;
      this.cdr.markForCheck();
    }
  }

  goToPage(page: number): void {
    if (page >= 1 && page <= this.totalPages) {
      this.currentPage = page;
      this.cdr.markForCheck();
    }
  }

  getValue(record: Record<string, string>, column: string): string {
    // Chercher la clé originale (peut être mal encodée)
    const originalKey = this.getOriginalKey(record, column);
    return record[originalKey] || '';
  }

  private getOriginalKey(record: Record<string, string>, correctedKey: string): string {
    const keys = Object.keys(record);
    return keys.find(key => fixGarbledCharacters(key) === correctedKey) || correctedKey;
  }

  getPageNumbers(): number[] {
    const pages: number[] = [];
    const maxVisible = 5;
    let start = Math.max(1, this.currentPage - Math.floor(maxVisible / 2));
    let end = Math.min(this.totalPages, start + maxVisible - 1);
    
    if (end - start < maxVisible - 1) {
      start = Math.max(1, end - maxVisible + 1);
    }
    
    for (let i = start; i <= end; i++) {
      pages.push(i);
    }
    return pages;
  }

  toggleExportMenu(event?: Event): void {
    if (event) {
      event.stopPropagation();
    }
    this.showExportMenu = !this.showExportMenu;
    this.cdr.markForCheck();
    
    if (this.showExportMenu) {
      setTimeout(() => {
        this.positionDropdown();
      }, 10);
    }
  }
  
  private positionDropdown(): void {
    const button = document.querySelector('.export-menu-button') as HTMLElement;
    const dropdown = document.querySelector('.export-menu-dropdown') as HTMLElement;
    
    if (button && dropdown) {
      const rect = button.getBoundingClientRect();
      const scrollY = window.scrollY || window.pageYOffset;
      const scrollX = window.scrollX || window.pageXOffset;
      
      // Positionner le dropdown au-dessus des données (sous le bouton)
      dropdown.style.position = 'fixed';
      dropdown.style.top = `${rect.bottom + scrollY + 8}px`;
      dropdown.style.left = `${rect.right + scrollX - dropdown.offsetWidth}px`;
      dropdown.style.zIndex = '10004';
    }
  }
  
  openColumnSelector(): void {
    this.showColumnSelector = true;
    this.showExportMenu = false;
    this.cdr.markForCheck();
  }
  
  closeColumnSelector(): void {
    this.showColumnSelector = false;
    this.cdr.markForCheck();
  }
  
  toggleAllColumns(select: boolean): void {
    this.availableColumnsForExport.forEach(col => {
      this.selectedColumnsForExport[col] = select;
    });
  }
  
  get selectedColumnsCount(): number {
    return Object.values(this.selectedColumnsForExport).filter(v => v).length;
  }

  // Sélection de lignes
  private getFromRecord(record: Record<string, string>, keys: string[]): string {
    for (const key of keys) {
      const originalKey = this.getOriginalKey(record, key);
      if (record[originalKey] !== undefined && record[originalKey] !== null && String(record[originalKey]).trim() !== '') {
        return String(record[originalKey]);
      }
      // Essayer aussi directement avec la clé
      if (record[key] !== undefined && record[key] !== null && String(record[key]).trim() !== '') {
        return String(record[key]);
      }
    }
    return '';
  }

  getPartnerOnlyKey(record: Record<string, string>): string {
    const numeroTrans = this.getFromRecord(record, ['Numéro Trans GU', 'Numero Trans GU', 'numeroTransGU', 'numero_trans_gu']);
    const idOperation = this.getFromRecord(record, ['ID Opération', 'ID Operation', 'id_operation', 'idOperation', 'ID OPERATION']);
    const dateOp = this.getFromRecord(record, ['Date opération', 'Date', 'dateOperation', 'date_operation', 'DATE']);
    const montant = this.getFromRecord(record, ['Montant', 'montant', 'amount', 'Amount', 'volume', 'Volume']);
    const parts = [numeroTrans, idOperation, dateOp, montant].filter(p => p);
    return parts.length > 0 ? parts.join('|') : JSON.stringify(record);
  }

  // ---------------------------------------------------------------------------
  // Saisie directe de l'ID Annulation (Suivi TRX à annuler)
  // ---------------------------------------------------------------------------

  /**
   * Charge les lignes de suivi déjà enregistrées pour préremplir l'ID
   * Annulation et savoir si la transaction est déjà suivie.
   */
  private loadSuiviIdIndex(): void {
    if (this.suiviIdIndexRequested) {
      return;
    }
    this.suiviIdIndexRequested = true;
    this.suiviIdIndexPromise = firstValueFrom(this.suiviTrxAnnulerService.getAll('/ecart-partner'))
      .then((rows) => {
        this.suiviIdIndexLoaded = true;
        this.indexSuiviRows(rows || []);
        // Le popup a pu être ouvert avant la fin du chargement : on complète
        // l'ID existant sans écraser une saisie en cours.
        if (this.showSuiviIdPopup && this.suiviIdRecord) {
          this.suiviIdCandidates = this.buildSuiviIdCandidates(this.suiviIdRecord);
          this.suiviIdFieldOptions = this.buildSuiviIdFieldOptions(this.suiviIdRecord);
          if (!this.suiviIdValue.trim()) {
            const existing = this.getSuiviRowForRecord(this.suiviIdRecord);
            const foundId = (existing?.idAnnulation || '').trim()
              || (this.suiviIdCandidates.length === 1 ? this.suiviIdCandidates[0].id : '');
            if (foundId) {
              this.suiviIdValue = foundId;
            }
          }
        }
        this.cdr.markForCheck();
      })
      .catch((error) => {
        // L'utilisateur peut ne pas avoir le sous-menu Suivi : la saisie reste possible,
        // l'API fera le contrôle de droits au moment de l'enregistrement.
        console.warn('Préchargement des IDs d\'annulation indisponible:', error);
      });
  }

  /** Attend la fin du préchargement pour ne pas créer de doublon. */
  private async ensureSuiviIdIndexLoaded(): Promise<void> {
    this.loadSuiviIdIndex();
    if (this.suiviIdIndexPromise) {
      await this.suiviIdIndexPromise;
    }
  }

  private indexSuiviRows(rows: SuiviTrxAnnulerRow[]): void {
    this.suiviRows = rows || [];
    this.suiviRowsByMatchKey.clear();
    this.suiviRowsByTransactionId.clear();
    this.suiviRowsByPhoneAmount.clear();

    for (const row of this.suiviRows) {
      const matchKey = (row.matchKey || '').trim();
      if (matchKey) {
        this.suiviRowsByMatchKey.set(matchKey, row);
      }

      const transactionId = normalizePartnerTransactionId(row.partnerTransactionId);
      if (transactionId) {
        const list = this.suiviRowsByTransactionId.get(transactionId) || [];
        list.push(row);
        this.suiviRowsByTransactionId.set(transactionId, list);
      }

      const phone = partnerPhoneKey(row.partnerTelephone);
      const amount = normalizePartnerAmount(row.partnerMontant);
      if (phone && amount) {
        const key = `${phone}|${amount}`;
        const list = this.suiviRowsByPhoneAmount.get(key) || [];
        list.push(row);
        this.suiviRowsByPhoneAmount.set(key, list);
      }
    }
  }

  private upsertIndexedSuiviRow(saved: SuiviTrxAnnulerRow): void {
    const next = this.suiviRows.filter(row => row.id !== saved.id);
    next.unshift(saved);
    this.indexSuiviRows(next);
  }

  /** Clé durable d'une ligne d'écart partenaire dans le suivi. */
  getEcartPartnerSuiviMatchKey(record: Record<string, string>): string {
    const fields = extractPartnerFields([record]);
    const prefix = EcartPartnerTableComponent.SUIVI_ECART_PARTNER_PREFIX;
    const transactionId = normalizePartnerTransactionId(fields.transactionId);
    let key: string;
    if (transactionId) {
      key = `${prefix}${transactionId}`;
    } else {
      const phone = partnerPhoneKey(fields.telephone);
      const amount = normalizePartnerAmount(fields.montant);
      const parts = [phone, amount, (fields.date || '').trim()].filter(Boolean);
      key = parts.length > 0
        ? `${prefix}${parts.join('|')}`
        : `${prefix}${this.getPartnerOnlyKey(record)}`;
    }
    return key.length > 500 ? key.slice(0, 500) : key;
  }

  /** Retrouve la ligne de suivi correspondant à un écart partenaire (ID prioritaire, puis téléphone/montant). */
  getSuiviRowForRecord(record: Record<string, string>): SuiviTrxAnnulerRow | null {
    if (!record) {
      return null;
    }
    const byKey = this.suiviRowsByMatchKey.get(this.getEcartPartnerSuiviMatchKey(record));
    if (byKey) {
      return byKey;
    }

    const fields = extractPartnerFields([record]);
    if (fields.transactionId) {
      const candidates = this.suiviRowsByTransactionId.get(normalizePartnerTransactionId(fields.transactionId));
      const found = this.pickRowWithAnnulationId(candidates);
      if (found) {
        return found;
      }
    }

    const phone = partnerPhoneKey(fields.telephone);
    const amount = normalizePartnerAmount(fields.montant);
    if (phone && amount) {
      const candidates = this.suiviRowsByPhoneAmount.get(`${phone}|${amount}`);
      const found = this.pickRowWithAnnulationId(candidates);
      if (found) {
        return found;
      }
    }
    return null;
  }

  private pickRowWithAnnulationId(rows?: SuiviTrxAnnulerRow[]): SuiviTrxAnnulerRow | null {
    if (!rows || rows.length === 0) {
      return null;
    }
    return rows.find(row => (row.idAnnulation || '').trim() !== '') || rows[0];
  }

  // ---------------------------------------------------------------------------
  // Récupération d'un ID existant (suivi, réconciliation, champs de la ligne)
  // ---------------------------------------------------------------------------

  /** Construit les index des correspondances pour retrouver IDs et champs BO. */
  private rebuildMatchIndexes(): void {
    this.matchIdsByTransactionId.clear();
    this.matchIdsByPhoneAmount.clear();
    this.matchIdsByPhone.clear();
    this.matchesByTransactionId.clear();
    this.matchesByPhoneAmount.clear();
    this.matchIndexBuilt = true;
    this.matchIndexSource = this.response?.matches || [];

    for (const match of this.matchIndexSource) {
      const records: Record<string, string>[] = [];
      if (match.partnerData) {
        records.push(match.partnerData);
      }
      for (const record of match.partnerDataList || []) {
        if (record) {
          records.push(record);
        }
      }

      const fields = extractPartnerFields(records);
      const transactionId = normalizePartnerTransactionId(fields.transactionId);
      const phone = partnerPhoneKey(fields.telephone);
      const amount = normalizePartnerAmount(fields.montant);
      const phoneAmountKey = phone && amount ? `${phone}|${amount}` : '';

      if (transactionId && !this.matchesByTransactionId.has(transactionId)) {
        this.matchesByTransactionId.set(transactionId, match);
      }
      if (phoneAmountKey && !this.matchesByPhoneAmount.has(phoneAmountKey)) {
        this.matchesByPhoneAmount.set(phoneAmountKey, match);
      }

      // Un ID Annulation peut être porté par la ligne partenaire ou par le BO.
      const idAnnulation = (fields.idAnnulation || '').trim()
        || (match.boData ? (extractPartnerFields([match.boData]).idAnnulation || '').trim() : '');
      if (!idAnnulation) {
        continue;
      }

      this.addIdToIndex(this.matchIdsByTransactionId, transactionId, idAnnulation);
      this.addIdToIndex(this.matchIdsByPhoneAmount, phoneAmountKey, idAnnulation);
      this.addIdToIndex(this.matchIdsByPhone, phone, idAnnulation);
    }
  }

  private ensureMatchIndexes(): void {
    const matches = this.response?.matches || [];
    if (!this.matchIndexBuilt || this.matchIndexSource !== matches) {
      this.rebuildMatchIndexes();
    }
  }

  private addIdToIndex(index: Map<string, string[]>, key: string, id: string): void {
    if (!key || !id) {
      return;
    }
    const values = index.get(key) || [];
    if (!values.includes(id)) {
      values.push(id);
    }
    index.set(key, values);
  }

  private findMatchedBoForRecord(record: Record<string, string>): Record<string, string> | null {
    this.ensureMatchIndexes();
    const fields = extractPartnerFields([record]);

    const transactionId = normalizePartnerTransactionId(fields.transactionId);
    if (transactionId) {
      const matched = this.matchesByTransactionId.get(transactionId);
      if (matched?.boData) {
        return matched.boData;
      }
    }

    const phone = partnerPhoneKey(fields.telephone);
    const amount = normalizePartnerAmount(fields.montant);
    if (phone && amount) {
      const matched = this.matchesByPhoneAmount.get(`${phone}|${amount}`);
      if (matched?.boData) {
        return matched.boData;
      }
    }
    return null;
  }

  /**
   * Liste les IDs Annulation déjà présents dans les données :
   * ligne partenaire, suivi persisté, puis correspondances de réconciliation.
   */
  private buildSuiviIdCandidates(record: Record<string, string>): SuiviIdCandidate[] {
    this.ensureMatchIndexes();
    const fields = extractPartnerFields([record]);
    const candidates: SuiviIdCandidate[] = [];
    const seen = new Set<string>();

    const add = (value: string | null | undefined, source: string): void => {
      const id = (value || '').trim();
      if (!id || seen.has(id)) {
        return;
      }
      seen.add(id);
      candidates.push({ id, source });
    };

    const transactionId = normalizePartnerTransactionId(fields.transactionId);
    const phone = partnerPhoneKey(fields.telephone);
    const amount = normalizePartnerAmount(fields.montant);

    add(fields.idAnnulation, 'Ligne partenaire');

    // Lignes de suivi déjà enregistrées (le matchKey de la ligne reste prioritaire).
    add(this.getSuiviRowForRecord(record)?.idAnnulation, 'Suivi TRX');
    if (transactionId) {
      (this.suiviRowsByTransactionId.get(transactionId) || [])
        .forEach(row => add(row.idAnnulation, 'Suivi TRX'));
    }
    if (phone && amount) {
      (this.suiviRowsByPhoneAmount.get(`${phone}|${amount}`) || [])
        .forEach(row => add(row.idAnnulation, 'Suivi TRX'));
    }

    const idsByTransaction = transactionId
      ? this.matchIdsByTransactionId.get(transactionId) || []
      : [];
    const idsByPhoneAmount = phone && amount
      ? this.matchIdsByPhoneAmount.get(`${phone}|${amount}`) || []
      : [];

    idsByTransaction.forEach(id => add(id, 'Réconciliation'));
    idsByPhoneAmount.forEach(id => add(id, 'Réconciliation'));

    // Le téléphone seul n'est utilisé que si les critères plus précis n'ont rien donné.
    const hasPreciseMatch = idsByTransaction.length > 0 || idsByPhoneAmount.length > 0;
    if (!hasPreciseMatch && phone) {
      (this.matchIdsByPhone.get(phone) || []).forEach(id => add(id, 'Réconciliation (téléphone)'));
    }

    return candidates;
  }

  /** Champs non vides de la ligne partenaire et du BO correspondant. */
  private buildSuiviIdFieldOptions(record: Record<string, string>): SuiviIdFieldOption[] {
    const options: SuiviIdFieldOption[] = [];
    const seen = new Set<string>();

    const add = (key: string, value: unknown, source: string): void => {
      const text = value === null || value === undefined ? '' : String(value).trim();
      if (!text) {
        return;
      }
      const dedupeKey = `${source}|${key}|${text}`;
      if (seen.has(dedupeKey)) {
        return;
      }
      seen.add(dedupeKey);
      options.push({ key: `${source}::${key}`, label: key, value: text, source });
    };

    for (const key of Object.keys(record)) {
      add(key, record[key], 'Partenaire');
    }

    const boData = this.findMatchedBoForRecord(record);
    if (boData) {
      for (const key of Object.keys(boData)) {
        add(key, boData[key], 'BO');
      }
    }

    return options.sort((a, b) => {
      const aIdLike = this.isIdLikeField(a.label) ? 0 : 1;
      const bIdLike = this.isIdLikeField(b.label) ? 0 : 1;
      if (aIdLike !== bIdLike) {
        return aIdLike - bIdLike;
      }
      if (a.source !== b.source) {
        return a.source === 'Partenaire' ? -1 : 1;
      }
      return a.label.localeCompare(b.label, 'fr', { sensitivity: 'base' });
    });
  }

  private isIdLikeField(label: string): boolean {
    const normalized = label
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();
    return /(^|[^a-z])(id|ref|reference|numero|num|no|token|code|auth|receipt|transaction|txn|trx|gu)([^a-z]|$)/.test(normalized);
  }

  /** Utilise un ID retrouvé automatiquement. */
  useSuiviIdCandidate(candidate: SuiviIdCandidate): void {
    if (!candidate) {
      return;
    }
    this.suiviIdValue = candidate.id;
    this.cdr.markForCheck();
  }

  /** Copie la valeur du champ sélectionné dans l'ID Annulation. */
  useSuiviIdFieldValue(): void {
    const option = this.suiviIdFieldOptions.find(item => item.key === this.suiviIdSelectedField);
    if (!option) {
      return;
    }
    this.suiviIdValue = option.value;
    this.cdr.markForCheck();
  }

  /** Relance le chargement des lignes de suivi déjà enregistrées. */
  private reloadSuiviIdIndex(): Promise<void> {
    this.suiviIdIndexRequested = false;
    this.suiviIdIndexLoaded = false;
    this.suiviIdIndexPromise = null;
    this.loadSuiviIdIndex();
    return this.suiviIdIndexPromise || Promise.resolve();
  }

  /** Relance la recherche d'IDs existants (suivi + réconciliation). */
  async refreshSuiviIdCandidates(): Promise<void> {
    if (!this.suiviIdRecord) {
      return;
    }
    await this.reloadSuiviIdIndex();
    if (!this.suiviIdRecord) {
      return;
    }
    this.rebuildMatchIndexes();
    this.suiviIdCandidates = this.buildSuiviIdCandidates(this.suiviIdRecord);
    this.suiviIdFieldOptions = this.buildSuiviIdFieldOptions(this.suiviIdRecord);
    this.suiviIdSelectedField = '';
    if (!this.suiviIdValue.trim() && this.suiviIdCandidates.length === 1) {
      this.suiviIdValue = this.suiviIdCandidates[0].id;
    }
    this.cdr.markForCheck();
  }

  shortSuiviIdValue(value: string): string {
    const text = (value || '').trim();
    return text.length > 56 ? `${text.slice(0, 53)}…` : text;
  }

  hasSuiviId(record: Record<string, string>): boolean {
    const row = this.getSuiviRowForRecord(record);
    return !!row && (row.idAnnulation || '').trim() !== '';
  }

  openSuiviIdPopup(record: Record<string, string>): void {
    this.loadSuiviIdIndex();
    this.ensureMatchIndexes();
    const fields = extractPartnerFields([record]);
    const existing = this.getSuiviRowForRecord(record);
    this.suiviIdRecord = record;
    this.suiviIdFields = fields;
    this.suiviIdCandidates = this.buildSuiviIdCandidates(record);
    this.suiviIdFieldOptions = this.buildSuiviIdFieldOptions(record);
    this.suiviIdSelectedField = '';

    const existingId = (existing?.idAnnulation || fields.idAnnulation || '').trim();
    this.suiviIdValue = existingId
      || (this.suiviIdCandidates.length === 1 ? this.suiviIdCandidates[0].id : '');
    this.showSuiviIdPopup = true;
    this.cdr.markForCheck();
  }

  closeSuiviIdPopup(): void {
    if (this.isSavingSuiviId) {
      return;
    }
    this.showSuiviIdPopup = false;
    this.suiviIdRecord = null;
    this.suiviIdValue = '';
    this.suiviIdCandidates = [];
    this.suiviIdFieldOptions = [];
    this.suiviIdSelectedField = '';
    this.cdr.markForCheck();
  }

  async saveSuiviId(): Promise<void> {
    const record = this.suiviIdRecord;
    const idAnnulation = (this.suiviIdValue || '').trim();
    if (!record) {
      return;
    }
    if (!idAnnulation) {
      this.popupService.showWarning('Veuillez saisir l\'ID d\'annulation.');
      return;
    }

    const fields = this.suiviIdFields;

    this.isSavingSuiviId = true;
    this.cdr.markForCheck();

    try {
      // On attend l'index existant pour mettre à jour la bonne ligne (et éviter
      // un doublon si la ligne a déjà été créée depuis /matches).
      await this.ensureSuiviIdIndexLoaded();
      const existing = this.getSuiviRowForRecord(record);
      const row: SuiviTrxAnnulerRow = {
        id: existing?.id,
        matchKey: existing?.matchKey || this.getEcartPartnerSuiviMatchKey(record),
        boDate: existing?.boDate ?? null,
        boAgence: existing?.boAgence ?? null,
        boService: existing?.boService ?? null,
        boMontant: existing?.boMontant ?? null,
        boToken: existing?.boToken ?? null,
        boPays: existing?.boPays ?? null,
        boEnv: existing?.boEnv ?? null,
        boTelephone: existing?.boTelephone ?? null,
        boStatut: existing?.boStatut ?? null,
        partnerTransactionId: fields.transactionId || existing?.partnerTransactionId || null,
        partnerDate: fields.date || existing?.partnerDate || null,
        partnerMontant: fields.montant || existing?.partnerMontant || null,
        partnerTelephone: fields.telephone || existing?.partnerTelephone || null,
        statutPart: existing?.statutPart ?? null,
        idAnnulation
      };

      const saved = await firstValueFrom(this.suiviTrxAnnulerService.save(row, '/ecart-partner'));
      this.upsertIndexedSuiviRow(saved);
      this.showSuiviIdPopup = false;
      this.suiviIdRecord = null;
      this.suiviIdValue = '';
      this.suiviIdCandidates = [];
      this.suiviIdFieldOptions = [];
      this.suiviIdSelectedField = '';
      this.popupService.showSuccess('ID d\'annulation enregistré dans le suivi (statut OK).');
    } catch (error: any) {
      console.error('Erreur lors de l\'enregistrement de l\'ID d\'annulation:', error);
      const detail = error?.error?.message || error?.message || '';
      this.popupService.showError(
        'Impossible d\'enregistrer l\'ID d\'annulation.' + (detail ? '\n' + detail : '')
      );
    } finally {
      this.isSavingSuiviId = false;
      this.cdr.markForCheck();
    }
  }

  trackByPartnerRow = (index: number, record: Record<string, string>): string => this.getPartnerOnlyKey(record);

  trackByIndex = (index: number): number => index;

  trackByValue = (index: number, value: string): string => value;

  isPartnerRecordSelected(record: Record<string, string>): boolean {
    const key = this.getPartnerOnlyKey(record);
    return this.selectedPartnerOnlyKeys.includes(key);
  }

  togglePartnerSelection(record: Record<string, string>, event: any): void {
    const key = this.getPartnerOnlyKey(record);
    if (event.target.checked) {
      if (!this.selectedPartnerOnlyKeys.includes(key)) {
        this.selectedPartnerOnlyKeys.push(key);
      }
    } else {
      this.selectedPartnerOnlyKeys = this.selectedPartnerOnlyKeys.filter(k => k !== key);
    }
  }

  get allPartnerSelected(): boolean {
    const allRecords = this.displayedPartnerOnly;
    return allRecords.length > 0 && allRecords.every(r => this.isPartnerRecordSelected(r));
  }

  toggleSelectAllPartner(event: any): void {
    const allRecords = this.displayedPartnerOnly;
    if (event.target.checked) {
      allRecords.forEach(record => {
        const key = this.getPartnerOnlyKey(record);
        if (!this.selectedPartnerOnlyKeys.includes(key)) {
          this.selectedPartnerOnlyKeys.push(key);
        }
      });
    } else {
      const allKeys = new Set(allRecords.map(r => this.getPartnerOnlyKey(r)));
      this.selectedPartnerOnlyKeys = this.selectedPartnerOnlyKeys.filter(k => !allKeys.has(k));
    }
  }

  private getPartnerSelectionDataset(): Record<string, string>[] {
    if (this.filteredPartnerOnly && this.filteredPartnerOnly.length > 0) {
      return this.filteredPartnerOnly;
    }
    if (this.response?.partnerOnly && this.response.partnerOnly.length > 0) {
      return this.response.partnerOnly;
    }
    return [];
  }

  getPartnerRecordsForAction(): Record<string, string>[] {
    const dataset = this.getPartnerSelectionDataset();
    const keySet = new Set(this.selectedPartnerOnlyKeys);
    return dataset.filter(record => keySet.has(this.getPartnerOnlyKey(record)));
  }

  private deduplicateItems<T>(items: T[], keyBuilder: (item: T) => string): { unique: T[]; duplicates: number } {
    const seen = new Set<string>();
    const unique: T[] = [];
    let duplicates = 0;

    for (const item of items) {
      const key = keyBuilder(item);
      if (!key) {
        unique.push(item);
        continue;
      }
      if (seen.has(key)) {
        duplicates++;
        continue;
      }
      seen.add(key);
      unique.push(item);
    }

    return { unique, duplicates };
  }

  private buildImpactOpDedupKey(impact: ImpactOP): string {
    return [
      (impact.codeProprietaire || '').trim().toLowerCase(),
      (impact.numeroTransGU || '').trim().toLowerCase(),
      (impact.dateOperation || '').trim(),
      Number(impact.montant || 0).toFixed(2),
      (impact.typeOperation || '').trim().toLowerCase(),
      (impact.groupeReseau || '').trim().toLowerCase()
    ].join('|');
  }

  getPartnerOnlyAgencyAndService(record: Record<string, string>): { agency: string; service: string; volume: number; date: string } {
    const getValue = (keys: string[]): string => {
      for (const key of keys) {
        const originalKey = this.getOriginalKey(record, key);
        if (record[originalKey]) {
          return record[originalKey];
        }
      }
      return '';
    };

    return {
      agency: getValue(['Agence', 'AGENCE', 'agence']),
      service: getValue(['Service', 'SERVICE', 'service', 'TRANS TYPE', 'Trans Type', 'TYPE', 'Type']),
      volume: this.getPartnerOnlyVolume(record),
      date: getValue(['Date', 'date', 'DATE', 'Date opération', 'dateOperation', 'TIMESTAMP', 'Timestamp'])
    };
  }

  calculateTotalVolumePartnerOnly(): number {
    return this.filteredPartnerOnly.reduce(
      (total, record) => total + this.getPartnerOnlyVolume(record),
      0
    );
  }

  // Vérifier si un enregistrement est éligible pour créer une OP
  isPartnerRecordEligible(record: Record<string, string>): boolean {
    if (!record || Object.keys(record).length === 0) {
      return false;
    }
    
    // Chercher un montant/volume dans toutes les clés (insensible à la casse)
    const amountKeywords = ['montant', 'amount', 'crédit', 'credit', 'volume', 'prix', 'price'];
    const hasAmount = Object.keys(record).some(key => {
      const keyLower = key.toLowerCase();
      const value = record[key];
      const hasKeyword = amountKeywords.some(keyword => keyLower.includes(keyword));
      const hasValue = value !== undefined && value !== null && String(value).trim() !== '';
      if (hasKeyword && hasValue) {
        const numValue = parseFloat(String(value).replace(/[,\s]/g, ''));
        return !isNaN(numValue);
      }
      return false;
    });
    
    // Chercher une date dans toutes les clés (insensible à la casse)
    const dateKeywords = ['date', 'jour', 'operation', 'opération', 'op', 'time', 'temps'];
    const hasDate = Object.keys(record).some(key => {
      const keyLower = key.toLowerCase();
      const value = record[key];
      return dateKeywords.some(keyword => keyLower.includes(keyword)) &&
             value !== undefined && value !== null && String(value).trim() !== '';
    });
    
    return hasAmount && hasDate;
  }

  // Créer une opération depuis un enregistrement partenaire
  async createOperationFromPartnerRecord(record: Record<string, string>): Promise<void> {
    try {
      if (!this.isPartnerRecordEligible(record)) {
        await this.popupService.showWarning(this.t('MSG.insufficientDataForOp'));
        return;
      }

      // Clés étendues pour couvrir "Type", "Type Opération", etc. (aligné avec saveEcartPartnerToImpactOP)
      const rawType = this.getFromRecord(record, ['Type', 'type', 'TYPE', 'Type Opération', 'typeOperation', 'type_operation']);
      const normalized = this.normalizeType(rawType);
      // Ordre important : fournisseur avant client pour éviter Compense_fournisseur -> Compense_client
      // Classification par mots-clés : règles de calcul (Configuration > Calcul) prioritaires,
      // code par défaut en repli.
      const isCompensation = this.calculService.matchesAny(normalized, 'BANQUE.TYPES_COMPENSATION', ['compens']);
      const isAppro = this.calculService.matchesAny(normalized, 'BANQUE.TYPES_APPROVISIONNEMENT', ['appro']);
      let typeOperation = normalized.includes('fournisseur') && isCompensation ? 'Compense_fournisseur'
                            : normalized.includes('fournisseur') && isAppro ? 'Appro_fournisseur'
                            : isCompensation ? 'Compense_client'
                            : isAppro ? 'Appro_client'
                            : this.calculService.matchesAny(normalized, 'BANQUE.TYPES_NIVELLEMENT', ['nivel']) ? 'nivellement'
                            : normalized.includes('regularis') ? 'régularisation_solde'
                            : normalized === 'ajustement' ? 'ajustement'
                            : rawType ? this.mapRawTypeToBackend(rawType) : '';

      // Si le type n'a pas pu être déterminé (colonne absente ou valeur non reconnue),
      // proposer une sélection comme "Ajouter une opération" pour éviter le fallback silencieux à Ajustement
      if (!typeOperation) {
        const typeOptions = ['Compense_client', 'Appro_client', 'Compense_fournisseur', 'nivellement', 'régularisation_solde', 'ajustement'];
        const typeLabels = ['Compense_client', 'Appro_client', 'Compense_fournisseur', 'Nivellement', 'Régularisation solde', 'Ajustement'];
        const typeInput = await this.popupService.showSelectInput(
          this.t('MSG.opTypeNotDetected'),
          this.t('MSG.opTypeTitle'),
          typeLabels,
          typeLabels[typeLabels.length - 1]
        );
        if (typeInput === null) {
          await this.popupService.showInfo(this.t('MSG.operationCancelled'));
          return;
        }
        const idx = typeLabels.indexOf(typeInput);
        typeOperation = idx >= 0 ? typeOptions[idx] : 'ajustement';
      }

      const { agency } = this.getPartnerOnlyAgencyAndService(record);
      const codeProprietaire = (this.getFromRecord(record, ['Agence','agency','Code propriétaire','Code proprietaire','codeProprietaire','code_proprietaire']) || agency || '').trim();
      if (!codeProprietaire) {
        await this.popupService.showWarning(this.t('MSG.ownerCodeNotFound'));
        return;
      }

      // Nettoyer les séparateurs de milliers
      const rawAmountStr = this.getFromRecord(record, ['Montant','montant','amount']) || String(this.getPartnerOnlyAgencyAndService(record).volume || '0');
      const normalizedAmount = parseFloat(String(rawAmountStr).replace(/[,\s]/g, '')) || 0;
      const montant = Math.abs(normalizedAmount);
      const rawDate = this.getFromRecord(record, ['Date opération','Date','dateOperation','date_operation','DATE']);
      const defaultDateCandidate = this.selectedPartnerImportOpDate
          || this.extractIsoDay(rawDate)
          || this.extractIsoDay(this.getPartnerOnlyAgencyAndService(record).date)
          || this.toIsoLocalDate(new Date().toISOString());

      const dateInput = await this.popupService.showDateInput(
          this.t('MSG.selectDateForImportOp'),
          this.t('MSG.createOpDateTitle'),
          defaultDateCandidate
      );

      if (dateInput === null) {
        await this.popupService.showInfo(this.t('MSG.operationCancelled'));
        return;
      }

      const normalizedDate = this.toIsoLocalDate(dateInput || defaultDateCandidate);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(normalizedDate)) {
        await this.popupService.showWarning(this.t('MSG.invalidDateOpCancelled'));
        return;
      }

      this.selectedPartnerImportOpDate = normalizedDate;
      const nomBordereau = this.getFromRecord(record, ['Numéro Trans GU','Numero Trans GU','numeroTransGU','numero_trans_gu']);

      // Charger les codes propriétaires des banques
      let banqueCodes: string[] = [];
      try {
        const comptesBanque = await firstValueFrom(this.compteService.filterComptes({ categorie: ['Banque'] }));
        if (comptesBanque && comptesBanque.length > 0) {
          banqueCodes = [...new Set(comptesBanque.map(c => c.codeProprietaire).filter((cp): cp is string => cp !== undefined && cp !== null))].sort();
        }
      } catch (e) {
        console.error('Erreur lors du chargement des codes propriétaires des banques:', e);
      }
      
      if (banqueCodes.length === 0) {
        banqueCodes = ['ECOBANK CM'];
      } else {
        if (!banqueCodes.includes('ECOBANK CM')) {
          banqueCodes.unshift('ECOBANK CM');
        }
      }
      
      // Demander la banque via autocomplétion
      const banqueInput = await this.popupService.showAutocompleteInput(
          this.t('MSG.bankLabel'),
          this.t('MSG.createOpDialogTitle'),
          banqueCodes,
          'ECOBANK CM'
      );
      const banque = (banqueInput || '').trim();
      if (!banque) {
        await this.popupService.showWarning(this.t('MSG.bankRequired'));
        return;
      }

      // Demander le type de référence
      const referenceTypeInput = await this.popupService.showSelectInput(
          this.t('MSG.referenceTypeLabel'),
          this.t('MSG.referenceTypeTitle'),
          ['STANDARD', 'CROSS_BORDER', 'NIVELLEMENT'],
          'STANDARD'
      );
      const referenceType = referenceTypeInput || 'STANDARD';

      // Si NIVELLEMENT est sélectionné, forcer le type d'opération à "nivellement"
      let finalTypeOperation = typeOperation;
      if (referenceType === 'NIVELLEMENT') {
        finalTypeOperation = 'nivellement';
      }

      const comptes = await firstValueFrom(this.compteService.getComptesByCodeProprietaire(codeProprietaire));
      if (!comptes || !comptes.length) {
        await this.popupService.showError(this.t('MSG.noAccountForOwnerCode', { code: codeProprietaire }));
        return;
      }
      const compteId = comptes[0].id!;

      const payload: OperationCreateRequest = {
          compteId,
          typeOperation: finalTypeOperation,
          montant,
          banque,
          nomBordereau: nomBordereau || undefined,
          dateOperation: normalizedDate,
          referenceType: referenceType
      };

      await new Promise<void>((resolve, reject) => {
          this.operationService.createOperation(payload).subscribe({
              next: async () => { 
                  await this.popupService.showSuccess(this.t('MSG.operationCreated')); 
                  resolve(); 
              },
              error: async (err) => { 
                  console.error(err); 
                  await this.popupService.showError(this.t('MSG.opCreationFailed')); 
                  reject(err); 
              }
          });
      });
    } catch (e) {
      console.error(e);
      await this.popupService.showError(this.t('MSG.opCreationError'));
    }
  }


  /**
   * Ouvre la création OPPART pour des lignes d'écarts partenaire (ligne unique ou lignes cochées).
   * Construit le mapping colonnes source → champs OPPART (auto-détection) puis la table éditable.
   */
  openOppartCreation(records: Record<string, string>[]): void {
    const source = (records || []).filter(r => r && Object.keys(r).length > 0);
    if (!source.length) {
      this.popupService.showWarning(this.t('SV.noPartnerRowToOppart'));
      return;
    }
    this.oppartSourceRecords = source;
    this.oppartManualValues = {};
    // Pré-remplit la source (éditable avant sauvegarde).
    this.oppartTargetFields.forEach(field => {
      if (field.defaultValue) {
        this.oppartManualValues[field.key] = field.defaultValue;
      }
    });
    this.oppartSourceFilter = '';
    this.showOppartSourceList = true;
    this.buildOppartMapping();
    this.rebuildOppartDraftRows();
    this.showOppartCreation = true;
    this.cdr.markForCheck();
  }

  /** Ouvre la création OPPART pour toutes les lignes cochées. */
  openOppartCreationForSelection(): void {
    const records = this.getPartnerRecordsForAction();
    if (!records.length) {
      this.popupService.showWarning(this.t('SV.noCheckedRowToOppart'));
      return;
    }
    this.openOppartCreation(records);
  }

  /** Clic sur le bouton OPPART d'une ligne : si des lignes sont cochées, toutes les lignes cochées sont reprises (sinon la ligne seule). */
  openOppartCreationFromRow(record: Record<string, string>): void {
    if (this.selectedPartnerOnlyKeys.length > 0) {
      if (!this.getPartnerRecordsForAction().length) {
        this.openOppartCreationForSelection();
        return;
      }
      const selected = this.getPartnerRecordsForAction();
      const key = this.getPartnerOnlyKey(record);
      const alreadyIncluded = selected.some(r => this.getPartnerOnlyKey(r) === key);
      this.openOppartCreation(alreadyIncluded ? selected : [...selected, record]);
      return;
    }
    this.openOppartCreation([record]);
  }

  closeOppartCreation(): void {
    this.showOppartCreation = false;
    this.cdr.markForCheck();
  }

  /** Colonnes du fichier d'écarts partenaire disponibles pour le mapping. */
  get oppartMappingSourceColumns(): string[] {
    const cols = this.allColumns?.length ? this.allColumns : this.displayedColumns?.length ? this.displayedColumns : [];
    return cols.map(c => this.fixColumnLabel(c)).filter((v, i, arr) => arr.indexOf(v) === i);
  }

  private fixColumnLabel(value: string): string {
    try {
      return fixGarbledCharacters(value);
    } catch {
      return value;
    }
  }

  private normalizeOppartHeader(value: string): string {
    return (value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
  }

  /** Construit le mapping colonnes source → champs OPPART par auto-détection (sinon colonne par défaut). */
  private buildOppartMapping(): void {
    const defaults: Record<string, string> = {
      client: 'Bénéficiaire',
      typeOp: 'Service',
      montant: 'Montant',
      dateOperation: 'Date',
      idTransaction: 'ID Operation',
      pays: 'Pays'
    };
    const sourceColumns = this.oppartMappingSourceColumns;
    const mapping: { [key: string]: string } = {};

    for (const field of this.oppartTargetFields) {
      const matched = sourceColumns.find(col => {
        const n = this.normalizeOppartHeader(col);
        // La date d'opération partenaire ne doit pas récupérer une date de
        // demande/initiation ni une date explicitement marquée BO.
        if (field.key === 'dateOperationPart') {
          const looksLikeRequest = n.includes('demande') || n.includes('request') || n.includes('initiation') || n.includes('soumission');
          const looksLikeBoDate = n.includes('bo') && (n.includes('date') || n.includes('operation'));
          if (looksLikeRequest || looksLikeBoDate) {
            return false;
          }
        }
        return field.keywords.some(kw => n.includes(this.normalizeOppartHeader(kw)));
      });
      const fallback = field.allowFirstColumnFallback === false
        ? ''
        : (defaults[field.key] || sourceColumns[0] || '');
      mapping[field.key] = matched || fallback;
    }

    this.oppartColumnMapping = mapping;
  }

  /** Met à jour le mapping quand l'utilisateur change une colonne source. */
  onOppartMappingChange(): void {
    this.rebuildOppartDraftRows();
    this.cdr.markForCheck();
  }

  /** Valeur manuelle (toutes les lignes) pour un champ, si renseignée. */
  getOppartManualValue(fieldKey: string): string {
    const v = (this.oppartManualValues[fieldKey] || '').trim();
    return v;
  }

  /** Met à jour le mapping quand l'utilisateur saisit une valeur manuelle. */
  onOppartManualValueChange(): void {
    this.rebuildOppartDraftRows();
    this.cdr.markForCheck();
  }

  /** Efface la valeur manuelle d'un champ (retour à la récupération par colonne). */
  clearOppartManualValue(fieldKey: string): void {
    if (this.oppartManualValues[fieldKey]) {
      delete this.oppartManualValues[fieldKey];
      this.rebuildOppartDraftRows();
      this.cdr.markForCheck();
    }
  }

  getOppartSourceColumnFor(fieldKey: string): string {
    return (this.oppartColumnMapping[fieldKey] || '').trim();
  }

  /** Lignes source filtrées pour la liste « tout ce qui a été sélectionné ». */
  get filteredOppartSourceRecords(): Record<string, string>[] {
    const q = (this.oppartSourceFilter || '').toLowerCase().trim();
    if (!q) {
      return this.oppartSourceRecords;
    }
    return this.oppartSourceRecords.filter(record => {
      return Object.keys(record).some(key => {
        const v = record[key];
        return v != null && String(v).toLowerCase().includes(q);
      });
    });
  }

  toggleOppartSourceList(): void {
    this.showOppartSourceList = !this.showOppartSourceList;
    this.cdr.markForCheck();
  }

  private getOppartSourceRecordValue(record: Record<string, string>, column: string): string {
    if (!column) {
      return '';
    }
    const corrected = this.fixColumnLabel(column);
    const original = this.getOriginalKey(record, corrected);
    if (record[original] !== undefined && record[original] !== null && String(record[original]).trim() !== '') {
      return String(record[original]).trim();
    }
    const direct = Object.keys(record).find(k => this.normalizeOppartHeader(k) === this.normalizeOppartHeader(column));
    if (direct != null && record[direct] !== undefined && record[direct] !== null && String(record[direct]).trim() !== '') {
      return String(record[direct]).trim();
    }
    return '';
  }

  get selectedOppartMappingCount(): number {
    return this.oppartTargetFields.filter(f => (this.oppartColumnMapping[f.key] || '').trim() !== '').length;
  }

  /** Construit les lignes éditable de la table de création OPPART depuis les lignes source. */
  private rebuildOppartDraftRows(): void {
    this.oppartDraftRows = this.oppartSourceRecords.map(record => {
      const partnerDate = this.resolveOppartFieldValue('dateOperationPart', record)
        || extractPartnerFields([record]).date;
      const mappedBoDate = this.resolveOppartFieldValue('dateOperation', record);
      const boDate = this.findMatchedBoDateForRecord(record);
      const dateOperation = mappedBoDate || boDate || partnerDate;
      const row: OppartDraftRowUI = {
        client: this.resolveOppartFieldValue('client', record),
        typeOp: this.resolveOppartFieldValue('typeOp', record),
        montant: this.resolveOppartFieldValue('montant', record),
        dateOperation: this.normalizeOppartDate(dateOperation),
        dateOperationPart: this.normalizeOppartDate(partnerDate),
        dateDemande: this.normalizeOppartDate(this.resolveOppartFieldValue('dateDemande', record)),
        idTransaction: this.resolveOppartFieldValue('idTransaction', record),
        pays: this.resolveOppartFieldValue('pays', record),
        source: this.resolveOppartFieldValue('source', record)
      };
      return row;
    });
  }

  /**
   * Date d'opération BO d'une ligne partenaire : celle du BO correspondant
   * dans la réconciliation, si une correspondance existe.
   */
  private findMatchedBoDateForRecord(record: Record<string, string>): string {
    const boData = this.findMatchedBoForRecord(record);
    return boData ? extractPartnerFields([boData]).date : '';
  }

  /** Résout la valeur d'un champ : valeur manuelle si renseignée, sinon colonne source mappée. */
  private resolveOppartFieldValue(fieldKey: string, record: Record<string, string>): string {
    const manual = this.getOppartManualValue(fieldKey);
    if (manual) {
      return manual;
    }
    const column = this.getOppartSourceColumnFor(fieldKey);
    const value = this.getOppartSourceRecordValue(record, column);
    if (fieldKey === 'montant') {
      return this.formatOppartMontant(value, record);
    }
    return value;
  }

  private formatOppartMontant(value: string, record: Record<string, string>): string {
    if (value && !isNaN(this.parseOppartNumber(value))) {
      return String(value);
    }
    const volume = this.getPartnerOnlyVolume(record);
    const amount = this.getOppartSourceRecordValue(record, this.oppartColumnMapping['montant']);
    const parsed = this.parseOppartNumber(amount);
    const v = !isNaN(parsed) ? parsed : volume;
    return v !== 0 ? String(v) : '';
  }

  private parseOppartNumber(value: any): number {
    if (value == null || value === '') {
      return NaN;
    }
    if (typeof value === 'number') {
      return value;
    }
    let s = String(value).trim();
    if (!s) {
      return NaN;
    }
    const negative = /^\(.*\)$/.test(s) || s.startsWith('-');
    s = s.replace(/[^0-9.,]/g, '');
    if (!s) {
      return NaN;
    }
    const lastComma = s.lastIndexOf(',');
    const lastDot = s.lastIndexOf('.');
    if (lastComma > -1 && lastDot > -1) {
      s = lastComma > lastDot ? s.replace(/\./g, '').replace(/,/g, '.') : s.replace(/,/g, '');
    } else if (lastComma > -1) {
      const decimals = s.length - lastComma - 1;
      s = decimals === 1 || decimals === 2 ? s.replace(/,/g, '.') : s.replace(/,/g, '');
    }
    const num = parseFloat(s);
    if (isNaN(num)) {
      return NaN;
    }
    return negative && num > 0 ? -num : num;
  }

  private normalizeOppartDate(value: string): string {
    const s = String(value || '').trim();
    if (!s) {
      return '';
    }
    let m = s.match(/(\d{4})-(\d{2})-(\d{2})/);
    if (m) return `${m[1]}-${m[2]}-${m[3]}`;
    m = s.match(/(\d{2})[\/.\-](\d{2})[\/.\-](\d{4})/);
    if (m) return `${m[3]}-${m[2]}-${m[1]}`;
    m = s.match(/(\d{4})[\/.](\d{2})[\/.](\d{2})/);
    if (m) return `${m[1]}-${m[2]}-${m[3]}`;
    const excelNum = parseFloat(s);
    if (!isNaN(excelNum) && excelNum > 10000 && excelNum < 60000) {
      const excelEpoch = new Date(Date.UTC(1899, 11, 30));
      const d = new Date(excelEpoch.getTime() + excelNum * 86400000);
      if (!isNaN(d.getTime())) {
        const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
        const dd = String(d.getUTCDate()).padStart(2, '0');
        return `${d.getUTCFullYear()}-${mm}-${dd}`;
      }
    }
    const parsed = new Date(s);
    if (!isNaN(parsed.getTime())) {
      const mm = String(parsed.getMonth() + 1).padStart(2, '0');
      const dd = String(parsed.getDate()).padStart(2, '0');
      return `${parsed.getFullYear()}-${mm}-${dd}`;
    }
    return s;
  }

  trackByOppartRow = (index: number): number => index;

  trackByOppartField = (index: number, field: OppartTargetFieldDef): string => field.key;

  isOppartCellEmpty(value: string): boolean {
    return (value || '').trim() === '';
  }

  /** Sauvegarde les lignes OPPART en lot via le backend. */
  async saveOppartRows(): Promise<void> {
    const rows = this.oppartDraftRows || [];
    if (!rows.length) {
      this.popupService.showWarning(this.t('SV.noOppartRowToSave'));
      return;
    }

    const payload: Omit<Oppart, 'id'>[] = rows.map(row => {
      const item: any = {
        client: (row.client || '').trim(),
        typeOp: (row.typeOp || '').trim(),
        montant: Math.abs(this.parseOppartNumber(row.montant) || 0),
        dateOperation: this.normalizeOppartDate(row.dateOperation),
        dateOperationPart: this.normalizeOppartDate(row.dateOperationPart),
        dateDemande: this.normalizeOppartDate(row.dateDemande),
        idTransaction: (row.idTransaction || '').trim(),
        pays: (row.pays || '').trim(),
        // Source freely editable dans le popup, avec repli sur la source par défaut.
        source: (row.source || '').trim() || EcartPartnerTableComponent.OPPART_SOURCE_ECART_PARTNER
      };
      for (const key of ['dateOperation', 'dateOperationPart', 'dateDemande']) {
        if (!item[key] || item[key].trim() === '') {
          delete item[key];
        }
      }
      return item as Omit<Oppart, 'id'>;
    }).filter(r => r.client !== '' || r.typeOp !== '' || r.idTransaction !== '' || r.pays !== '' || r.montant !== 0);

    if (!payload.length) {
      this.popupService.showWarning('❌ Aucune ligne OPPART valide (toutes les lignes sont vides).');
      return;
    }

    this.isSavingOppart = true;
    this.cdr.markForCheck();

    try {
      const batchResult = await firstValueFrom(this.oppartService.createOppartBatch(payload));
      const successCount = batchResult.successCount ?? 0;
      const errorCount = batchResult.errorCount ?? 0;

      if (successCount > 0) {
        this.popupService.showSuccess(this.t('SV.oppartSuccess', { created: successCount, errors: errorCount }));
        this.showOppartCreation = false;
      } else {
        this.popupService.showError(this.t('SV.oppartFailure', {
          details: batchResult.errors?.length
            ? this.t('SV.detailsPrefix') + batchResult.errors.slice(0, 3).join(' ; ')
            : this.t('SV.checkLogs')
        }));
      }
    } catch (error: any) {
      console.error('❌ Erreur lors de la sauvegarde OPPART:', error);
      const detail = error?.error?.message || error?.message;
      let errorMessage = this.t('MSG.oppartSaveError');
      if (detail) {
        errorMessage += '\n' + detail;
      }
      this.popupService.showError(errorMessage);
    } finally {
      this.isSavingOppart = false;
      this.cdr.markForCheck();
    }
  }

  private normalizeType(input: string): string {
    return (input || '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  }

  /** Mappe une valeur brute de type vers le format backend attendu */
  private mapRawTypeToBackend(rawType: string): string {
    const n = this.normalizeType(rawType);
    const known: Record<string, string> = {
      'compense_client': 'Compense_client', 'compense_fournisseur': 'Compense_fournisseur',
      'appro_client': 'Appro_client', 'appro_fournisseur': 'Appro_fournisseur',
      'nivellement': 'nivellement', 'régularisation_solde': 'régularisation_solde', 'regularisation_solde': 'régularisation_solde',
      'ajustement': 'ajustement'
    };
    return known[n] || '';
  }

  private extractIsoDay(input: string): string {
    const s = String(input || '').trim();
    if (!s) return '';
    let m = s.match(/(\d{4})-(\d{2})-(\d{2})/);
    if (m) return `${m[1]}-${m[2]}-${m[3]}`;
    m = s.match(/(\d{2})-(\d{2})-(\d{4})/);
    if (m) return `${m[3]}-${m[2]}-${m[1]}`;
    m = s.match(/(\d{2})\/(\d{2})\/(\d{4})/);
    if (m) return `${m[3]}-${m[2]}-${m[1]}`;
    m = s.match(/(\d{4})\/(\d{2})\/(\d{2})/);
    if (m) return `${m[1]}-${m[2]}-${m[3]}`;
    return '';
  }

  private toIsoLocalDate(input: string): string {
    try {
      const d = new Date(input);
      if (!isNaN(d.getTime())) return d.toISOString().split('T')[0];
    } catch {}
    return input;
  }

  private getPartnerOnlyDate(record: Record<string, string>): string {
    const dateColumn = this.findDateColumn(record);
    return dateColumn ? record[dateColumn] || 'Non spécifié' : 'Non spécifié';
  }

  private findDateColumn(data: Record<string, string>): string | null {
    const dateKeywords = ['date', 'jour', 'day', 'created', 'creation', 'transaction', 'operation', 'opération'];
    return this.findColumnByKeywords(data, dateKeywords);
  }

  private findColumnByKeywords(data: Record<string, string>, keywords: string[]): string | null {
    for (const key of Object.keys(data)) {
      const keyLower = key.toLowerCase();
      if (keywords.some(kw => keyLower.includes(kw.toLowerCase()))) {
        if (data[key] && String(data[key]).trim() !== '') {
          return key;
        }
      }
    }
    return null;
  }

  private makeIsoDateTime(datePart: string): string {
    try {
      if (/^\d{4}-\d{2}-\d{2}$/.test(datePart)) {
        return new Date(`${datePart}T00:00:00`).toISOString();
      }
    } catch {}
    return new Date().toISOString();
  }

  async saveEcartPartnerToImpactOP(): Promise<void> {
    const sourceRecords = this.getPartnerRecordsForAction();
    if (sourceRecords.length === 0) {
      this.popupService.showWarning(this.t('SV.noCheckedRowImportOp'));
      return;
    }

    this.isSavingEcartPartnerToImpactOP = true;
    this.cdr.markForCheck();

    try {
      console.log('🔄 Début de la sauvegarde des ECART Partenaire dans Import OP...');
      console.log('DEBUG: Nombre d\'enregistrements ECART Partenaire à sauvegarder (lignes cochées):', sourceRecords.length);

      const defaultDateCandidate = this.selectedPartnerImportOpDate
        || this.extractIsoDay(this.getFromRecord(sourceRecords[0], ['Date opération', 'Date', 'dateOperation', 'date_operation']))
        || this.extractIsoDay(this.getPartnerOnlyDate(sourceRecords[0]))
        || this.toIsoLocalDate(new Date().toISOString());

      const dateInput = await this.popupService.showDateInput(
        this.t('SV.selectDateImportOp'),
        this.t('SV.dateImportOp'),
        defaultDateCandidate
      );

      if (dateInput === null) {
        await this.popupService.showInfo(this.t('SV.cancelledImportOp'));
        return;
      }

      const normalizedDateInput = this.toIsoLocalDate(dateInput || defaultDateCandidate);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(normalizedDateInput)) {
        await this.popupService.showWarning(this.t('SV.invalidDateCancelled'));
        return;
      }

      this.selectedPartnerImportOpDate = normalizedDateInput;
      const overrideDateIso = this.makeIsoDateTime(normalizedDateInput);

      // Convertir les données ECART Partenaire en format ImpactOP (toutes les lignes, champs obligatoires renseignés)
      const impactOPData: ImpactOP[] = sourceRecords.map((record, index) => {
        const getValueWithFallback = (keys: string[]): string => {
          for (const key of keys) {
            const originalKey = this.getOriginalKey(record, key);
            if (record[originalKey] !== undefined && record[originalKey] !== null && String(record[originalKey]).trim() !== '') {
              return String(record[originalKey]).trim();
            }
            if (record[key] !== undefined && record[key] !== null && String(record[key]).trim() !== '') {
              return String(record[key]).trim();
            }
          }
          return '';
        };

        const getNumberWithFallback = (keys: string[]): number => {
          const value = getValueWithFallback(keys);
          const parsed = parseFloat(String(value).replace(/[^\d.-]/g, ''));
          return isNaN(parsed) ? 0 : parsed;
        };

        // Fonction helper pour convertir les numéros de série Excel en dates JavaScript
        const parseExcelDate = (dateValue: string): Date => {
          // Si la valeur est vide, retourner la date actuelle
          if (!dateValue || dateValue.trim() === '') {
            return new Date();
          }
          
          // Si la date contient déjà des caractères de format date, la parser normalement
          if (dateValue.includes('-') || dateValue.includes('T') || dateValue.includes('/') || /\d{4}/.test(dateValue)) {
            const parsedDate = new Date(dateValue);
            if (!isNaN(parsedDate.getTime())) {
              console.log(`📅 Date texte parsée: ${dateValue} → ${parsedDate.toISOString()}`);
              return parsedDate;
            }
          }
          
          // Vérifier si c'est un numéro de série Excel pur (nombre décimal)
          const numValue = parseFloat(dateValue);
          if (!isNaN(numValue) && numValue > 0 && numValue < 100000 && Math.abs(parseFloat(dateValue) - numValue) < 0.0001) {
            // C'est probablement un numéro de série Excel
            // Excel epoch: 1er janvier 1900 (avec correction pour le bug du 29 février 1900)
            const excelEpoch = new Date(1900, 0, 1).getTime();
            const millisecondsPerDay = 86400000;
            // Soustraire 2 pour corriger le bug Excel (29/02/1900) et l'index qui commence à 1
            const jsDate = new Date(excelEpoch + (numValue - 2) * millisecondsPerDay);
            console.log(`📅 Conversion Excel → JS: ${dateValue} → ${jsDate.toISOString()}`);
            return jsDate;
          }
          
          // Si tout échoue, retourner la date actuelle
          console.warn(`⚠️ Date non reconnue: "${dateValue}", utilisation de la date actuelle`);
          return new Date();
        };
        
        // Construire la date d'opération au format LocalDateTime
        const dateOperationStr = getValueWithFallback(['Date opération', 'dateOperation', 'date_operation']);
        const parsedDate = parseExcelDate(dateOperationStr);
        const dateOperation = overrideDateIso || parsedDate.toISOString();

        // Récupérer les valeurs réelles des colonnes ECART Partenaire (tous les champs obligatoires renseignés)
        const typeOperationRaw = getValueWithFallback(['Type', 'type', 'TYPE', 'Type Opération', 'typeOperation', 'type_operation']);
        const typeOperation = (typeOperationRaw && typeOperationRaw.trim()) ? typeOperationRaw.trim() : 'DEPOT';

        const codeProprietaireRaw = getValueWithFallback(['Agence', 'agence', 'AGENCE', 'agency', 'Code propriétaire', 'Code proprietaire', 'codeProprietaire', 'code_proprietaire']);
        const codeProprietaire = (codeProprietaireRaw && codeProprietaireRaw.trim()) ? codeProprietaireRaw.trim() : 'UNKNOWN';

        const groupeReseauRaw = getValueWithFallback(['Pays', 'pays', 'PAYS', 'country', 'Country', 'GRX', 'grx', 'groupe de réseau', 'groupeReseau', 'groupe_reseau']);
        const groupeReseauVal = (groupeReseauRaw && groupeReseauRaw.trim()) ? groupeReseauRaw.trim() : 'DEFAULT';
        const groupeReseau = groupeReseauVal.length > 10 ? groupeReseauVal.substring(0, 10) : groupeReseauVal;

        const numeroTransGURaw = getValueWithFallback(['Numéro Trans GU', 'numeroTransGU', 'numero_trans_gu', 'Numero Trans GU']);
        const numeroTransGU = (numeroTransGURaw && numeroTransGURaw.trim()) ? numeroTransGURaw.trim() : `GU-${Date.now()}-${index}`;

        const soldeAvant = getNumberWithFallback(['Solde_avant', 'Solde_Avant', 'SOLDE_AVANT', 'solde_avant', 'Solde avant', 'soldeAvant']);
        const soldeApres = getNumberWithFallback(['Solde_Après', 'Solde_Apres', 'SOLDE_APRES', 'solde_après', 'Solde après', 'soldeApres', 'Solde aprés']);

        return {
          id: undefined,
          typeOperation,
          montant: getNumberWithFallback(['Montant', 'montant', 'amount']),
          soldeAvant,
          soldeApres,
          codeProprietaire,
          dateOperation: dateOperation || new Date().toISOString(),
          numeroTransGU,
          groupeReseau,
          statut: 'EN_ATTENTE',
          commentaire: `Importé depuis ECART Partenaire - ${new Date().toLocaleString('fr-FR')}`,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        } as ImpactOP;
      });

      const deduplicatedImpacts = this.deduplicateItems(
        impactOPData,
        impact => this.buildImpactOpDedupKey(impact)
      );

      console.log('DEBUG: Données converties pour Import OP (échantillon):', impactOPData.slice(0, 2));
      console.log('DEBUG: Envoi en une requête batch pour éviter 429 Too Many Requests...');

      // Sauvegarder en une requête batch (évite le rate limiting 429)
      const batchResult = await firstValueFrom(this.impactOPService.createImpactOPBatch(deduplicatedImpacts.unique));
      const successCount = batchResult.successCount ?? 0;
      const errorCount = batchResult.errorCount ?? 0;

      if (batchResult.errors?.length) {
        console.warn('⚠️ Erreurs détaillées (batch):', batchResult.errors.slice(0, 10));
      }

      if (successCount > 0) {
        this.popupService.showSuccess(this.t('SV.importOpSuccessPartner', {
          created: successCount,
          errors: errorCount,
          duplicates: deduplicatedImpacts.duplicates,
          sent: deduplicatedImpacts.unique.length
        }));
      } else {
        this.popupService.showError(this.t('SV.importOpFailure', {
          details: batchResult.errors?.length
            ? this.t('SV.detailsPrefix') + batchResult.errors.slice(0, 3).join(' ; ')
            : this.t('SV.checkLogs')
        }));
      }

    } catch (error) {
      console.error('❌ Erreur lors de la sauvegarde ECART Partenaire vers Import OP:', error);
      
      let errorMessage = this.t('SV.importOpErrorTitle');
      
      if (error && typeof error === 'object') {
        const apiError = error as any;
        const detail = apiError.error?.message || apiError.message;
        errorMessage += detail
          ? this.t('SV.details', { detail })
          : this.t('SV.communicationError');
      } else {
        errorMessage += this.t('SV.unknownError');
      }
      
      errorMessage += '\n\n' + this.t('SV.pleaseRetry');
      
      this.popupService.showError(errorMessage);
    } finally {
      this.isSavingEcartPartnerToImpactOP = false;
      this.cdr.markForCheck();
    }
  }

  async exportResults(): Promise<void> {
    if (this.displayedPartnerOnly.length === 0) {
      this.popupService.showError(this.t('MSG.noDataToExport'));
      return;
    }

    try {
      this.isExporting = true;
      this.exportProgress = {
        current: 0,
        total: this.displayedPartnerOnly.length,
        percentage: 0,
        message: this.t('MSG.preparingExport'),
        isComplete: false
      };
      this.showExportMenu = false;
      this.cdr.markForCheck();

      let selectedCols = this.availableColumnsForExport.filter(col => this.selectedColumnsForExport[col]);
      const hasCommentaire = this.displayedPartnerOnly.some(record => (this.getValue(record, 'Commentaire') ?? '').toString().trim() !== '');
      if (hasCommentaire && !selectedCols.includes('Commentaire')) {
        selectedCols = ['Commentaire', ...selectedCols];
      }
      const columns = selectedCols;

      const rows = this.displayedPartnerOnly.map(record => {
        const row: any = {};
        columns.forEach(col => {
          row[col] = this.getValue(record, col);
        });
        return row;
      });

      const fileName = `ecart_partner_${new Date().toISOString().split('T')[0]}.xlsx`;

      if (this.exportSubscription) {
        this.exportSubscription.unsubscribe();
      }

      this.exportSubscription = this.exportOptimizationService.exportProgress$.subscribe(progress => {
        this.exportProgress = progress;
        this.cdr.markForCheck();

        if (progress.isComplete) {
          this.isExporting = false;
          if (progress.message.includes('✅')) {
            this.popupService.showSuccess(this.t('MSG.exportSuccess'));
          } else {
            this.popupService.showError(this.t('MSG.exportError'));
          }
          this.cdr.markForCheck();
        }
      });

      if (hasCommentaire) {
        await this.exportOptimizationService.exportExcelWithCommentColors(rows, columns, fileName, {
          commentColumn: 'Commentaire',
          colorMap: ECART_COMMENT_COLORS
        });
      } else {
        const isLargeDataset = rows.length > 5000;
        if (isLargeDataset) {
          await this.exportOptimizationService.exportExcelOptimized(rows, columns, fileName, {
            chunkSize: 3000,
            useWebWorker: true,
            enableCompression: true
          });
        } else {
          await this.exportOptimizationService.exportExcelOptimized(rows, columns, fileName, {
            chunkSize: 2000,
            useWebWorker: false
          });
        }
      }

    } catch (error) {
      console.error('Erreur lors de l\'export:', error);
      this.isExporting = false;
      this.popupService.showError(this.t('MSG.exportPartnerError'));
      this.cdr.markForCheck();
    }
  }

  goBack(): void {
    this.router.navigate(['/results']);
  }

  scrollToTop(): void {
    this.el.nativeElement.scrollTo({ top: 0, behavior: 'smooth' });
  }

  onTableScroll(event: Event): void {
    const el = event.target as HTMLDivElement;
    this.tableScrollLeft = el.scrollLeft;
    this.tableScrollMax = el.scrollWidth - el.clientWidth;
    this.cdr.markForCheck();
  }

  scrollTableLeft(): void {
    const el = this.tableWrapperRef?.nativeElement;
    if (el) {
      el.scrollBy({ left: -this.TABLE_SCROLL_STEP, behavior: 'smooth' });
    }
  }

  scrollTableRight(): void {
    const el = this.tableWrapperRef?.nativeElement;
    if (el) {
      el.scrollBy({ left: this.TABLE_SCROLL_STEP, behavior: 'smooth' });
    }
  }

  private updateTableScrollState(): void {
    const el = this.tableWrapperRef?.nativeElement;
    if (el) {
      this.tableScrollLeft = el.scrollLeft;
      this.tableScrollMax = el.scrollWidth - el.clientWidth;
      this.cdr.markForCheck();
    }
  }
}
