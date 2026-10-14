import { Component, OnInit, OnDestroy, ChangeDetectorRef, ChangeDetectionStrategy, HostListener, ElementRef, ViewChild } from '@angular/core';
import { Router } from '@angular/router';
import { Subscription, firstValueFrom } from 'rxjs';
import { skip } from 'rxjs/operators';
import { ReconciliationResponse } from '../../models/reconciliation-response.model';
import { AppStateService } from '../../services/app-state.service';
import { ExportOptimizationService, ExportProgress, ECART_COMMENT_COLORS } from '../../services/export-optimization.service';
import { PopupService } from '../../services/popup.service';
import { EcartSoldeService } from '../../services/ecart-solde.service';
import { TrxSfService } from '../../services/trx-sf.service';
import { ImpactOPService } from '../../services/impact-op.service';
import { EcartSolde } from '../../models/ecart-solde.model';
import { TrxSfData } from '../../services/trx-sf.service';
import { ImpactOP } from '../../models/impact-op.model';
import { fixGarbledCharacters } from '../../utils/encoding-fixer';
import { ReconciliationTabsService } from '../../services/reconciliation-tabs.service';
import { ReconciliationService } from '../../services/reconciliation.service';
import { EcartBoSummaryService } from '../../services/ecart-bo-summary.service';
import { buildEcartBoPendingLinesFromRecords } from '../../utils/ecart-bo-pending-lines.util';
import { extractRecordAmount } from '../../utils/record-amount.util';
import { partitionEcartRecords, resolveMagicPartitionContext } from '../../utils/magic-partition.util';
import { SharedModule } from '../../shared/shared.module';
import { TranslateModule, TranslateService } from '@ngx-translate/core';

@Component({
  selector: 'app-ecart-bo-table',
  standalone: true,
  imports: [TranslateModule, SharedModule],
  templateUrl: './ecart-bo-table.component.html',
  styleUrls: ['./ecart-bo-table.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class EcartBoTableComponent implements OnInit, OnDestroy {
  response: ReconciliationResponse | null = null;
  filteredBoOnly: Record<string, string>[] = [];
  displayedBoOnly: Record<string, string>[] = [];
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
  selectedBoOnlyKeys: string[] = [];
  
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
  isSavingEcartBo = false;
  isSavingEcartBoToTrxSf = false;
  isSavingEcartBoToImpactOP = false;
  selectedBoEcartSoldeDate: string | null = null;
  selectedBoTrxSfDate: string | null = null;
  selectedBoImportOpDate: string | null = null;
  
  // Chargement progressif
  isLoading = false;
  loadProgress = 0;
  private lastProcessedSignature = '';
  private loadBoOnlyInFlight: Promise<void> | null = null;
  private loadBoOnlyGeneration = 0;
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
    private ecartSoldeService: EcartSoldeService,
    private trxSfService: TrxSfService,
    private impactOPService: ImpactOPService,
    private reconciliationTabsService: ReconciliationTabsService,
    private reconciliationService: ReconciliationService,
    private ecartBoSummaryService: EcartBoSummaryService,
    private translate: TranslateService,
    private el: ElementRef
  ) {}

  private t(key: string, params?: any): string {
    return this.translate.instant(key, params) as string;
  }

  @HostListener('scroll', ['$event.target'])
  onHostScroll(target: HTMLElement): void {
    this.showScrollTopBtn = target.scrollTop > 300;
    this.cdr.markForCheck();
  }

  ngOnInit(): void {
    this.syncMagicContextFromAppState();

    this.subscription.add(
      this.appStateService.getReconciliationResults().subscribe((response: ReconciliationResponse | null) => {
        if (response) {
          this.response = response;
          this.syncMagicContextFromAppState();
          void this.loadBoOnly();
        }
      })
    );

    this.subscription.add(
      this.appStateService.selectedMagicService$.pipe(skip(1)).subscribe(() => {
        this.syncMagicContextFromAppState();
        if (this.response) {
          void this.loadBoOnly(true);
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

  private buildBoOnlyLoadSignature(): string {
    const sessionId =
      this.response?.progressSessionId ||
      this.reconciliationService.getCurrentJobId() ||
      '';
    return [
      sessionId,
      this.response?.totalBoOnly ?? 0,
      this.appStateService.getSelectedMagicService(),
      this.appStateService.getSelectedMagicPartnerFile()
    ].join('|');
  }

  private async resolveBoOnlyForDisplay(): Promise<Record<string, string>[]> {
    const sessionId =
      this.response?.progressSessionId ||
      this.reconciliationService.getCurrentJobId();
    const expectedTotal = this.response?.totalBoOnly ?? 0;
    let boOnly = this.response?.boOnly || [];

    if (
      sessionId &&
      (this.response?.resultsPaginated || expectedTotal > 0)
    ) {
      const needsServerLoad =
        boOnly.length === 0 ||
        (expectedTotal > 0 && boOnly.length !== expectedTotal);
      if (needsServerLoad) {
        const ecarts = await this.reconciliationService.loadBoEcartsFromSession(sessionId);
        boOnly = ecarts.boOnly;
        if (this.response) {
          this.response = {
            ...this.response,
            boOnly: ecarts.boOnly,
            mismatches: ecarts.mismatches
          };
        }
        this.reconciliationTabsService.setFilteredMismatches(ecarts.mismatches);
      }
    } else if (boOnly.length === 0) {
      const cached = this.reconciliationTabsService.getFilteredBoOnly();
      if (cached?.length) {
        boOnly = cached;
      }
    }

    const ctx = resolveMagicPartitionContext({
      appStateService: this.appStateService.getSelectedMagicService(),
      appStatePartnerFile: this.appStateService.getSelectedMagicPartnerFile(),
      tabsContext: this.reconciliationTabsService.getMagicViewContext()
    });

    if (!ctx.service && !ctx.partnerFile) {
      return boOnly;
    }

    this.reconciliationTabsService.setMagicViewContext(ctx.service, ctx.partnerFile);
    this.magicServiceFilterLocked = ctx.service;

    return partitionEcartRecords(boOnly, ctx);
  }

  private loadBoOnly(forceReload = false): Promise<void> {
    const signature = this.buildBoOnlyLoadSignature();
    if (!forceReload && signature === this.lastProcessedSignature && this.filteredBoOnly.length > 0) {
      return Promise.resolve();
    }
    if (this.loadBoOnlyInFlight) {
      return this.loadBoOnlyInFlight;
    }
    this.loadBoOnlyInFlight = this.executeLoadBoOnly(signature).finally(() => {
      this.loadBoOnlyInFlight = null;
    });
    return this.loadBoOnlyInFlight;
  }

  private async executeLoadBoOnly(signature: string): Promise<void> {
    const generation = ++this.loadBoOnlyGeneration;
    this.isLoading = true;
    this.loadProgress = 0;
    this.cdr.markForCheck();

    try {
      this.syncMagicContextFromAppState();
      const allData = await this.resolveBoOnlyForDisplay();
      if (generation !== this.loadBoOnlyGeneration) {
        return;
      }
      this.reconciliationTabsService.setFilteredBoOnly(allData);
      await this.loadBoOnlyProgressively(allData, generation);
      if (generation === this.loadBoOnlyGeneration) {
        this.lastProcessedSignature = signature;
      }
    } finally {
      if (generation === this.loadBoOnlyGeneration) {
        this.isLoading = false;
        this.cdr.markForCheck();
        setTimeout(() => this.updateTableScrollState(), 100);
      }
    }
  }

  private async loadBoOnlyProgressively(allData: Record<string, string>[], generation: number): Promise<void> {
      const total = allData.length;
      
      if (total === 0) {
        if (generation !== this.loadBoOnlyGeneration) {
          return;
        }
        this.filteredBoOnly = [];
        this.loadProgress = 100;
        this.initializeColumns();
        this.applyFilters();
        return;
      }

      const chunkSize = 500;
      this.filteredBoOnly = [];
      
      if (allData.length > 0) {
        const sampleSize = Math.min(50, total);
        this.filteredBoOnly.push(...allData.slice(0, sampleSize));
        this.loadProgress = 2;
        this.initializeColumns();
        this.applyFilters();
        this.cdr.markForCheck();
        await new Promise(resolve => setTimeout(resolve, 0));
        if (generation !== this.loadBoOnlyGeneration) {
          return;
        }
      }
      
      for (let i = 50; i < total; i += chunkSize) {
        if (generation !== this.loadBoOnlyGeneration) {
          return;
        }
        const chunk = allData.slice(i, Math.min(i + chunkSize, total));
        this.filteredBoOnly.push(...chunk);
        this.loadProgress = Math.round(((i + chunk.length) / total) * 98 + 2);
        
        if ((i / chunkSize) % 3 === 0) {
          this.applyFilters();
        }
        
        this.cdr.markForCheck();
        await new Promise(resolve => setTimeout(resolve, 0));
      }
      
      if (generation !== this.loadBoOnlyGeneration) {
        return;
      }
      this.applyFilters();
      this.loadProgress = 100;
  }

  private initializeColumns(): void {
    if (this.filteredBoOnly.length > 0) {
      const allKeysSet = new Set<string>();
      
      // Optimiser : parcourir seulement les premiers enregistrements pour détecter les colonnes
      // Les colonnes sont généralement les mêmes dans tous les enregistrements
      const sampleSize = Math.min(100, this.filteredBoOnly.length);
      for (let i = 0; i < sampleSize; i++) {
        Object.keys(this.filteredBoOnly[i]).forEach(key => {
          const correctedKey = fixGarbledCharacters(key);
          allKeysSet.add(correctedKey);
        });
      }
      
      // Si on a déjà toutes les colonnes, pas besoin de continuer
      // Sinon, parcourir le reste (cas rare)
      if (sampleSize < this.filteredBoOnly.length) {
        for (let i = sampleSize; i < this.filteredBoOnly.length; i++) {
          Object.keys(this.filteredBoOnly[i]).forEach(key => {
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
    let filtered = [...this.filteredBoOnly];
    
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
    
    this.displayedBoOnly = filtered;
    this.totalPages = Math.max(1, Math.ceil(this.displayedBoOnly.length / this.pageSize));
    
    // Réinitialiser à la première page si nécessaire
    if (this.currentPage > this.totalPages) {
      this.currentPage = 1;
    }
    
    this.cdr.markForCheck();
  }

  getPagedBoOnly(): Record<string, string>[] {
    const start = (this.currentPage - 1) * this.pageSize;
    const end = start + this.pageSize;
    return this.displayedBoOnly.slice(start, end);
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

  getBoOnlyKey(record: Record<string, string>): string {
    const parts = [
      this.getFromRecord(record, ['CLE', 'clé de réconciliation', 'cle_reconciliation', 'reconciliation_key', 'Key', 'key', 'ID', 'id']),
      this.getFromRecord(record, ['ID Opération', 'ID Operation', 'id_operation', 'idOperation', 'ID OPERATION']),
      this.getFromRecord(record, ['Numéro Trans GU', 'Numero Trans GU', 'numeroTransGU', 'numero_trans_gu']),
      this.getFromRecord(record, ['Référence', 'Reference', 'reference']),
      this.getFromRecord(record, ['Date opération', 'Date', 'dateOperation', 'date_operation', 'DATE']),
      this.getFromRecord(record, ['Montant', 'montant', 'amount', 'Amount', 'volume', 'Volume']),
      this.getFromRecord(record, ['Service', 'service', 'SERVICE']),
      this.getFromRecord(record, ['Agence', 'agence', 'AGENCE', 'agency'])
    ].map(value => value?.toString().trim()).filter(value => !!value);

    if (parts.length === 0) {
      return Object.values(record).join('|');
    }

    return parts.join('|');
  }

  trackByBoRow = (index: number, record: Record<string, string>): string => this.getBoOnlyKey(record);

  trackByIndex = (index: number): number => index;

  trackByValue = (index: number, value: string): string => value;

  isBoRecordSelected(record: Record<string, string>): boolean {
    const key = this.getBoOnlyKey(record);
    return this.selectedBoOnlyKeys.includes(key);
  }

  toggleBoSelection(record: Record<string, string>, event: any): void {
    const key = this.getBoOnlyKey(record);
    if (event.target.checked) {
      if (!this.selectedBoOnlyKeys.includes(key)) {
        this.selectedBoOnlyKeys.push(key);
      }
    } else {
      this.selectedBoOnlyKeys = this.selectedBoOnlyKeys.filter(k => k !== key);
    }
  }

  get allBoSelectedOnPage(): boolean {
    const pageRecords = this.getPagedBoOnly();
    return pageRecords.length > 0 && pageRecords.every(r => this.isBoRecordSelected(r));
  }

  toggleSelectAllBoOnPage(event: any): void {
    const pageRecords = this.getPagedBoOnly();
    if (event.target.checked) {
      pageRecords.forEach(record => {
        const key = this.getBoOnlyKey(record);
        if (!this.selectedBoOnlyKeys.includes(key)) {
          this.selectedBoOnlyKeys.push(key);
        }
      });
    } else {
      const pageKeys = pageRecords.map(r => this.getBoOnlyKey(r));
      this.selectedBoOnlyKeys = this.selectedBoOnlyKeys.filter(k => !pageKeys.includes(k));
    }
  }

  private getBoSelectionDataset(): Record<string, string>[] {
    if (this.filteredBoOnly && this.filteredBoOnly.length > 0) {
      return this.filteredBoOnly;
    }
    if (this.response?.boOnly && this.response.boOnly.length > 0) {
      return this.response.boOnly;
    }
    const mismatches = this.response?.mismatches || [];
    const boOnly = this.response?.boOnly || [];
    return [...mismatches, ...boOnly];
  }

  getBoRecordsForAction(): Record<string, string>[] {
    const dataset = this.getBoSelectionDataset();
    const keySet = new Set(this.selectedBoOnlyKeys);
    return dataset.filter(record => keySet.has(this.getBoOnlyKey(record)));
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

  getBoOnlyAgencyAndService(record: Record<string, string>): { agency: string; service: string; volume: number; date: string; country: string } {
    // Fonction helper pour trouver une valeur avec plusieurs noms de colonnes possibles
    const getValueWithFallback = (possibleKeys: string[]): string => {
      for (const key of possibleKeys) {
        const originalKey = this.getOriginalKey(record, key);
        if (record[originalKey] !== undefined && record[originalKey] !== null && record[originalKey] !== '') {
          return record[originalKey].toString();
        }
        // Essayer aussi directement avec la clé
        if (record[key] !== undefined && record[key] !== null && record[key] !== '') {
          return record[key].toString();
        }
      }
      return '';
    };

    // Recherche d'agence avec plusieurs noms possibles
    const agency = getValueWithFallback(['Agence', 'agence', 'AGENCE', 'agency', 'Agency', 'AGENCY']);
    
    // Recherche de service avec plusieurs noms possibles
    const service = getValueWithFallback(['Service', 'service', 'SERVICE', 'serv', 'Serv']);
    
    // Recherche de volume/montant (AMOUNT, Montant, crédit/débit, etc.)
    const volume = extractRecordAmount(record);
    
    // Recherche de date avec plusieurs noms possibles
    const date = getValueWithFallback(['Date', 'date', 'DATE', 'jour', 'Jour', 'JOUR', 'created', 'Created', 'CREATED']);
    
    // Recherche de pays (GRX doit être considéré comme PAYS)
    const country = getValueWithFallback(['GRX', 'grx', 'Pays', 'pays', 'PAYS', 'country', 'Country', 'COUNTRY']);

    return {
      agency,
      service,
      volume,
      date,
      country: country || 'Non spécifié'
    };
  }

  calculateTotalVolumeBoOnly(): number {
    return this.filteredBoOnly.reduce(
      (total, record) => total + extractRecordAmount(record),
      0
    );
  }

  async exportResults(): Promise<void> {
    if (this.displayedBoOnly.length === 0) {
      this.popupService.showError(this.t('SV.noEcartToSave'));
      return;
    }

    try {
      this.isExporting = true;
      this.exportProgress = {
        current: 0,
        total: this.displayedBoOnly.length,
        percentage: 0,
        message: this.t('MSG.preparingExport'),
        isComplete: false
      };
      this.showExportMenu = false;
      this.cdr.markForCheck();

      let selectedCols = this.availableColumnsForExport.filter(col => this.selectedColumnsForExport[col]);
      const hasCommentaire = this.displayedBoOnly.some(record => (this.getValue(record, 'Commentaire') ?? '').toString().trim() !== '');
      if (hasCommentaire && !selectedCols.includes('Commentaire')) {
        selectedCols = ['Commentaire', ...selectedCols];
      }
      const columns = selectedCols;

      const rows = this.displayedBoOnly.map(record => {
        const row: any = {};
        columns.forEach(col => {
          row[col] = this.getValue(record, col);
        });
        return row;
      });

      const fileName = `ecart_bo_${new Date().toISOString().split('T')[0]}.xlsx`;

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
      this.popupService.showError(this.t('MSG.exportBoError'));
      this.cdr.markForCheck();
    }
  }

  async saveEcartBoToEcartSolde(): Promise<void> {
    const sourceRecords = this.getBoRecordsForAction();

    if (sourceRecords.length === 0) {
      this.popupService.showWarning(this.t('SV.noCheckedRow'));
      return;
    }

    this.isSavingEcartBo = true;
    this.cdr.markForCheck();

    try {
      console.log('🔄 Début de la sauvegarde des ECART BO (lignes cochées)...');
      console.log('DEBUG: Nombre d\'enregistrements ECART BO à sauvegarder:', sourceRecords.length);

      const defaultDateCandidate = this.selectedBoEcartSoldeDate
        || this.extractIsoDay(this.getFromRecord(sourceRecords[0], ['Date opération', 'Date', 'dateOperation', 'date_operation']))
        || this.extractIsoDay(this.getBoOnlyAgencyAndService(sourceRecords[0]).date)
        || this.toIsoLocalDate(new Date().toISOString());

      const dateInput = await this.popupService.showDateInput(
        this.t('SV.selectDateEcartSolde'),
        this.t('SV.dateEcartSolde'),
        defaultDateCandidate
      );

      if (dateInput === null) {
        await this.popupService.showInfo(this.t('SV.cancelledEcartSolde'));
        return;
      }

      const normalizedDateInput = this.toIsoLocalDate(dateInput || defaultDateCandidate);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(normalizedDateInput)) {
        await this.popupService.showWarning(this.t('SV.invalidDateCancelled'));
        return;
      }

      this.selectedBoEcartSoldeDate = normalizedDateInput;
      const overrideDateIso = this.makeIsoDateTime(normalizedDateInput);

      // Convertir les données ECART BO en format EcartSolde
      const ecartSoldeData: EcartSolde[] = sourceRecords.map((record, index) => {
        const getValueWithFallback = (keys: string[]): string => {
          for (const key of keys) {
            const originalKey = this.getOriginalKey(record, key);
            if (record[originalKey] !== undefined && record[originalKey] !== null && record[originalKey] !== '') {
              return record[originalKey].toString();
            }
            // Essayer aussi directement avec la clé
            if (record[key] !== undefined && record[key] !== null && record[key] !== '') {
              return record[key].toString();
            }
          }
          return '';
        };

        // Extraire les informations d'agence et de service
        const agencyInfo = this.getBoOnlyAgencyAndService(record);
        
        // Fonction helper pour convertir les dates (y compris format Excel) au format ISO
        const formatDateForBackend = (dateStr: string): string => {
          if (!dateStr) return '';
          
          // Si la date contient déjà des caractères de format date (tirets, T, espaces suivis de chiffres), ne pas traiter comme Excel
          if (dateStr.includes('-') || dateStr.includes('T') || /\d{4}/.test(dateStr)) {
            // Si la date est déjà au format ISO, la retourner
            if (dateStr.includes('T')) return dateStr;
            
            // Convertir le format "2025-07-09 12:40:18.0" en "2025-07-09T12:40:18"
            const cleanedDate = dateStr.replace(/\.\d+$/, ''); // Enlever les millisecondes
            return cleanedDate.replace(' ', 'T');
          }
          
          // Vérifier si c'est un numéro de série Excel pur (nombre décimal sans autre caractère)
          const numValue = parseFloat(dateStr);
          const numStr = numValue.toString();
          // Vérifier que la conversion en nombre et retour en string donne la même chose (ou presque)
          if (!isNaN(numValue) && numValue > 0 && numValue < 100000 && Math.abs(parseFloat(dateStr) - numValue) < 0.0001) {
            // C'est probablement un numéro de série Excel
            const excelEpoch = new Date(1900, 0, 1).getTime();
            const millisecondsPerDay = 86400000;
            const jsDate = new Date(excelEpoch + (numValue - 2) * millisecondsPerDay);
            console.log(`📅 Conversion Excel → JS: ${dateStr} → ${jsDate.toISOString()}`);
            return jsDate.toISOString();
          }
          
          // Par défaut, retourner la chaîne telle quelle
          return dateStr;
        };

        // Créer l'objet EcartSolde avec les données mappées
        const ecartSolde: EcartSolde = {
          id: undefined, // Sera généré par la base de données
          idTransaction: getValueWithFallback(['ID Transaction', 'IDTransaction', 'id_transaction', 'ID_TRANSACTION', 'transaction_id', 'TransactionId', 'ID', 'id', 'Id', 'CLE', 'clé de réconciliation', 'cle_reconciliation']),
          telephoneClient: getValueWithFallback(['t l phone client', 'téléphone client', 'telephone_client', 'TELEPHONE_CLIENT', 'phone', 'Phone', 'Telephone', 'telephone', 'Téléphone']),
          montant: parseFloat(getValueWithFallback(['montant', 'Montant', 'MONTANT', 'amount', 'Amount', 'volume', 'Volume'])) || 0,
          service: agencyInfo.service,
          agence: agencyInfo.agency,
          dateTransaction: overrideDateIso || formatDateForBackend(agencyInfo.date),
          numeroTransGu: getValueWithFallback(['Numero Trans GU', 'Numéro Trans GU', 'numero_trans_gu', 'NUMERO_TRANS_GU', 'transaction_number', 'TransactionNumber']),
          pays: agencyInfo.country,
          statut: 'EN_ATTENTE', // Statut par défaut
          commentaire: 'IMPACT J+1', // Commentaire par défaut
          dateImport: new Date().toISOString()
        };

        return ecartSolde;
      });

      console.log('DEBUG: Données converties en format EcartSolde:', ecartSoldeData.length, 'enregistrements');

      // Validation des données avant sauvegarde
      const validRecords = ecartSoldeData.filter(record => 
        record.idTransaction && 
        record.idTransaction.trim() !== '' && 
        record.agence && 
        record.agence.trim() !== ''
      );

      const deduplicatedRecords = this.deduplicateItems(
        validRecords,
        record => (record.idTransaction || '').trim().toLowerCase()
      );

      console.log('DEBUG: Nombre d\'enregistrements valides après filtrage:', validRecords.length);
      console.log('DEBUG: Doublons locaux ignorés avant envoi:', deduplicatedRecords.duplicates);

      if (deduplicatedRecords.unique.length === 0) {
        console.error('DEBUG: Aucun enregistrement valide trouvé. Raisons possibles:');
        console.error('- idTransaction manquant ou vide');
        console.error('- agence manquante ou vide');
        console.error('- Colonnes non trouvées dans les données source');
        this.popupService.showWarning(this.t('SV.noValidData'));
        return;
      }

      // Afficher un message de confirmation avec les détails
      const message =
        this.t('SV.summaryTitle') +
        this.t('SV.totalBo', { count: sourceRecords.length }) +
        this.t('SV.validRecords', { count: deduplicatedRecords.unique.length }) +
        this.t('SV.invalidRecords', { count: ecartSoldeData.length - validRecords.length }) +
        this.t('SV.duplicatesInSelection', { count: deduplicatedRecords.duplicates }) +
        this.t('SV.defaultComment') +
        this.t('SV.duplicatesIgnored') +
        this.t('SV.continueQuestion');

      const confirmed = await this.popupService.showConfirm(message, this.t('SV.confirmTitle'));
      if (!confirmed) {
        console.log('❌ Sauvegarde annulée par l\'utilisateur');
        return;
      }

      console.log('✅ Confirmation utilisateur reçue, début de la sauvegarde...');
      
      // Sauvegarder les données via le service
      const result = await this.ecartSoldeService.createMultipleEcartSoldes(deduplicatedRecords.unique);
      
      console.log('=== RÉSULTATS DE LA SAUVEGARDE ===');
      console.log('DEBUG: Enregistrements reçus:', result.totalReceived);
      console.log('DEBUG: Enregistrements créés:', result.count);
      console.log('DEBUG: Doublons ignorés:', result.duplicates);
      console.log('DEBUG: Message:', result.message);
      
      // Afficher un message de succès détaillé
      let successMessage =
        this.t('SV.successTitle') +
        this.t('SV.summaryHeader') +
        this.t('SV.recordsSent', { count: deduplicatedRecords.unique.length }) +
        this.t('SV.recordsCreated', { count: result.count }) +
        this.t('SV.duplicatesInSelectionLine', { count: deduplicatedRecords.duplicates }) +
        this.t('SV.duplicatesInDb', { count: result.duplicates }) +
        this.t('SV.storedEcartSolde');
      
      this.popupService.showSuccess(successMessage);
      this.cdr.markForCheck();
    } catch (error: any) {
      console.error('❌ Erreur lors de la sauvegarde des ECART BO:', error);
      
      let errorMessage = this.t('SV.errorBoTitle');
      const detail = error.error?.error || error.message;
      errorMessage += detail
        ? this.t('SV.details', { detail })
        : this.t('SV.pleaseRetry');
      
      this.popupService.showError(errorMessage);
    } finally {
      this.isSavingEcartBo = false;
      this.cdr.markForCheck();
    }
  }

  async saveEcartBoToTrxSf(): Promise<void> {
    const sourceRecords = this.getBoRecordsForAction();

    if (sourceRecords.length === 0) {
      this.popupService.showWarning(this.t('SV.noCheckedRowTrx'));
      return;
    }

    this.isSavingEcartBoToTrxSf = true;
    this.cdr.markForCheck();

    try {
      console.log('🔄 Début de la sauvegarde des ECART BO dans TRX SF (lignes cochées)...');
      console.log('DEBUG: Nombre d\'enregistrements ECART BO à sauvegarder:', sourceRecords.length);

      const defaultDateCandidate = this.selectedBoTrxSfDate
        || this.extractIsoDay(this.getFromRecord(sourceRecords[0], ['Date opération', 'Date', 'dateOperation', 'date_operation']))
        || this.extractIsoDay(this.getBoOnlyAgencyAndService(sourceRecords[0]).date)
        || this.toIsoLocalDate(new Date().toISOString());

      const dateInput = await this.popupService.showDateInput(
        this.t('SV.selectDateTrx'),
        this.t('SV.dateTrx'),
        defaultDateCandidate
      );

      if (dateInput === null) {
        await this.popupService.showInfo(this.t('SV.cancelledTrx'));
        return;
      }

      const normalizedDateInput = this.toIsoLocalDate(dateInput || defaultDateCandidate);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(normalizedDateInput)) {
        await this.popupService.showWarning(this.t('SV.invalidDateCancelled'));
        return;
      }

      this.selectedBoTrxSfDate = normalizedDateInput;
      const overrideDateIso = this.makeIsoDateTime(normalizedDateInput);

      // Convertir les données ECART BO en format TrxSfData avec récupération des frais
      const trxSfDataPromises = sourceRecords.map(async (record, index) => {
        const getValueWithFallback = (keys: string[]): string => {
          for (const key of keys) {
            const originalKey = this.getOriginalKey(record, key);
            if (record[originalKey] !== undefined && record[originalKey] !== null && record[originalKey] !== '') {
              return record[originalKey].toString();
            }
            // Essayer aussi directement avec la clé
            if (record[key] !== undefined && record[key] !== null && record[key] !== '') {
              return record[key].toString();
            }
          }
          return '';
        };

        // Extraire les informations d'agence et de service
        const agencyInfo = this.getBoOnlyAgencyAndService(record);
        
        // Fonction helper pour convertir les dates (y compris format Excel) au format ISO
        const formatDateForBackend = (dateStr: string): string => {
          if (!dateStr) return '';
          
          // Si la date contient déjà des caractères de format date (tirets, T, espaces suivis de chiffres), ne pas traiter comme Excel
          if (dateStr.includes('-') || dateStr.includes('T') || /\d{4}/.test(dateStr)) {
            // Si la date est déjà au format ISO, la retourner
            if (dateStr.includes('T')) return dateStr;
            
            // Convertir le format "2025-07-09 12:40:18.0" en "2025-07-09T12:40:18"
            const cleanedDate = dateStr.replace(/\.\d+$/, ''); // Enlever les millisecondes
            return cleanedDate.replace(' ', 'T');
          }
          
          // Vérifier si c'est un numéro de série Excel pur (nombre décimal sans autre caractère)
          const numValue = parseFloat(dateStr);
          const numStr = numValue.toString();
          // Vérifier que la conversion en nombre et retour en string donne la même chose (ou presque)
          if (!isNaN(numValue) && numValue > 0 && numValue < 100000 && Math.abs(parseFloat(dateStr) - numValue) < 0.0001) {
            // C'est probablement un numéro de série Excel
            const excelEpoch = new Date(1900, 0, 1).getTime();
            const millisecondsPerDay = 86400000;
            const jsDate = new Date(excelEpoch + (numValue - 2) * millisecondsPerDay);
            console.log(`📅 Conversion Excel → JS: ${dateStr} → ${jsDate.toISOString()}`);
            return jsDate.toISOString();
          }
          
          // Par défaut, retourner la chaîne telle quelle
          return dateStr;
        };

        // Calculer automatiquement les frais selon la configuration du service
        let frais = 0;
        try {
          // Récupérer la configuration des frais pour le service
          const fraisConfigResponse = await this.trxSfService.getFraisConfigByService(agencyInfo.service).toPromise();
          const fraisConfig = fraisConfigResponse;
          
          if (fraisConfig && fraisConfig.typeFrais) {
            if (fraisConfig.typeFrais === 'NOMINAL' || fraisConfig.typeFrais === 'FIXE') {
              // Frais fixe : on prend le montant configuré
              frais = fraisConfig.montant || 0;
              console.log(`💰 Frais fixe configuré pour ${agencyInfo.service}: ${frais}`);
            } else if (fraisConfig.typeFrais === 'POURCENTAGE') {
              // Frais en pourcentage : on applique le pourcentage sur le montant
              const pourcentage = fraisConfig.pourcentage || 0;
              frais = (agencyInfo.volume * pourcentage) / 100;
              console.log(`📊 Frais pourcentage configuré pour ${agencyInfo.service}: ${pourcentage}% sur ${agencyInfo.volume} = ${frais}`);
            }
          } else {
            // Pas de configuration, frais à 0 par défaut
            frais = 0;
            console.log(`⚠️ Pas de configuration de frais pour ${agencyInfo.service}, frais à 0`);
          }
          
          console.log(`✅ Frais calculés pour ${agencyInfo.agency}:`);
          console.log(`   - Service: ${agencyInfo.service}`);
          console.log(`   - Montant transaction: ${agencyInfo.volume}`);
          console.log(`   - Frais calculés: ${frais}`);
          console.log(`   - Configuration:`, fraisConfig);
        } catch (configError) {
          console.warn(`⚠️ Erreur lors de la récupération de la config des frais pour ${agencyInfo.service}:`, configError);
          frais = 0; // Frais par défaut en cas d'erreur
        }

        // Créer l'objet TrxSfData avec les données mappées
        const trxSf: any = {
          idTransaction: getValueWithFallback(['IDTransaction', 'id_transaction', 'ID_TRANSACTION', 'transaction_id', 'TransactionId', 'ID', 'id', 'Id', 'CLE', 'clé de réconciliation', 'cle_reconciliation']),
          telephoneClient: getValueWithFallback(['téléphone client', 'telephone_client', 'TELEPHONE_CLIENT', 'phone', 'Phone', 'Telephone', 'telephone', 'Téléphone']),
          montant: parseFloat(getValueWithFallback(['montant', 'Montant', 'MONTANT', 'amount', 'Amount', 'volume', 'Volume'])) || 0,
          service: agencyInfo.service,
          agence: agencyInfo.agency,
          dateTransaction: overrideDateIso || formatDateForBackend(agencyInfo.date),
          numeroTransGu: getValueWithFallback(['Numéro Trans GU', 'numero_trans_gu', 'NUMERO_TRANS_GU', 'transaction_number', 'TransactionNumber', 'numeroTransGu', 'NumeroTransGu']),
          pays: agencyInfo.country,
          statut: 'EN_ATTENTE',
          frais: frais, // Frais récupérés depuis l'API
          commentaire: 'ECART BO - Importé depuis la réconciliation avec frais TSOP',
          dateImport: new Date().toISOString()
        };

        console.log(`DEBUG: Enregistrement ${index + 1} préparé pour TRX SF:`, {
          idTransaction: trxSf.idTransaction,
          agence: trxSf.agence,
          service: trxSf.service,
          montant: trxSf.montant,
          frais: trxSf.frais,
          agencyInfo: agencyInfo
        });

        return trxSf;
      });

      // Attendre que toutes les promesses soient résolues
      const trxSfData = await Promise.all(trxSfDataPromises);

      console.log('DEBUG: Données converties en format TrxSfData avec frais:', trxSfData.length, 'enregistrements');

      // Validation des données avant sauvegarde
      const validRecords = trxSfData.filter(record => 
        record.idTransaction && 
        record.idTransaction.trim() !== '' && 
        record.agence && 
        record.agence.trim() !== ''
      );

      const deduplicatedRecords = this.deduplicateItems(
        validRecords,
        record => (record.idTransaction || '').trim().toLowerCase()
      );

      console.log('DEBUG: Nombre d\'enregistrements valides après filtrage:', validRecords.length);
      console.log('DEBUG: Doublons locaux ignorés avant envoi:', deduplicatedRecords.duplicates);

      if (deduplicatedRecords.unique.length === 0) {
        this.popupService.showWarning(this.t('SV.noValidRecordTrx'));
        return;
      }

      // Sauvegarder les données dans TRX SF
      console.log('🔄 Sauvegarde des données dans TRX SF avec frais TSOP...');
      
      // Appeler le service pour sauvegarder les données
      const result = await this.trxSfService.createMultipleTrxSf(deduplicatedRecords.unique).toPromise();
      
      console.log('✅ Sauvegarde dans TRX SF terminée avec succès:', result);
      
      // Afficher un message de succès
      this.popupService.showSuccess(this.t('SV.successTrxBo', {
        count: deduplicatedRecords.unique.length,
        duplicates: deduplicatedRecords.duplicates
      }));
      this.cdr.markForCheck();
    } catch (error) {
      console.error('❌ Erreur lors de la sauvegarde dans TRX SF:', error);
      
      let errorMessage = this.t('MSG.trxSfSaveError');
      if (error && typeof error === 'object') {
        const errorObj = error as any;
        if (errorObj.error && typeof errorObj.error === 'object') {
          errorMessage = errorObj.error.message || errorObj.error.details || errorMessage;
        } else if (errorObj.message) {
          errorMessage = errorObj.message;
        }
      }
      
      this.popupService.showError(`❌ ${errorMessage}`);
    } finally {
      this.isSavingEcartBoToTrxSf = false;
      this.cdr.markForCheck();
    }
  }

  private extractIsoDay(input: string): string {
    const s = String(input || '').trim();
    if (!s) return '';
    let m = s.match(/(\d{4})-(\d{2})-(\d{2})/);
    if (m) return `${m[1]}-${m[2]}-${m[3]}`;
    m = s.match(/(\d{2})-(\d{2})-(\d{4})/);
    if (m) return `${m[3]}-${m[2]}-${m[1]}`;
    return '';
  }

  private toIsoLocalDate(input: string): string {
    try {
      const d = new Date(input);
      if (!isNaN(d.getTime())) return d.toISOString().split('T')[0];
    } catch {}
    return input || '';
  }

  private makeIsoDateTime(datePart: string): string {
    try {
      if (/^\d{4}-\d{2}-\d{2}$/.test(datePart)) {
        return new Date(`${datePart}T00:00:00`).toISOString();
      }
    } catch {}
    return new Date().toISOString();
  }

  async saveEcartBoToImpactOP(): Promise<void> {
    const sourceRecords = this.getBoRecordsForAction();

    if (sourceRecords.length === 0) {
      this.popupService.showWarning(this.t('SV.noCheckedRowImportOp'));
      return;
    }

    this.isSavingEcartBoToImpactOP = true;
    this.cdr.markForCheck();

    try {
      console.log('🔄 Début de la sauvegarde des ECART BO dans Import OP (lignes cochées)...');
      console.log('DEBUG: Nombre d\'enregistrements ECART BO à sauvegarder:', sourceRecords.length);

      const defaultDateCandidate = this.selectedBoImportOpDate
        || this.extractIsoDay(this.getFromRecord(sourceRecords[0], ['Date opération', 'Date', 'dateOperation', 'date_operation']))
        || this.extractIsoDay(this.getBoOnlyAgencyAndService(sourceRecords[0]).date)
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
        this.popupService.showWarning(this.t('SV.invalidDateCancelled'));
        return;
      }

      this.selectedBoImportOpDate = normalizedDateInput;
      const overrideDateIso = this.makeIsoDateTime(normalizedDateInput);

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

        const agencyInfo = this.getBoOnlyAgencyAndService(record);
        const typeOperationRaw = getValueWithFallback(['Type', 'type', 'TYPE', 'Type Opération', 'typeOperation', 'type_operation']);
        const typeOperation = (typeOperationRaw && typeOperationRaw.trim()) ? typeOperationRaw.trim() : 'DEPOT';
        const codeProprietaireRaw = getValueWithFallback(['Agence', 'agence', 'AGENCE', 'agency']) || agencyInfo.agency;
        const codeProprietaire = (codeProprietaireRaw && codeProprietaireRaw.trim()) ? codeProprietaireRaw.trim() : 'UNKNOWN';
        const groupeReseauRaw = getValueWithFallback(['Pays', 'pays', 'PAYS', 'GRX', 'grx']) || agencyInfo.country;
        const groupeReseauVal = (groupeReseauRaw && groupeReseauRaw.trim()) ? groupeReseauRaw.trim() : 'DEFAULT';
        const groupeReseau = groupeReseauVal.length > 10 ? groupeReseauVal.substring(0, 10) : groupeReseauVal;
        const numeroTransGURaw = getValueWithFallback(['Numéro Trans GU', 'numeroTransGU', 'numero_trans_gu', 'Numero Trans GU']);
        const numeroTransGU = (numeroTransGURaw && numeroTransGURaw.trim()) ? numeroTransGURaw.trim() : `GU-BO-${Date.now()}-${index}`;

        return {
          id: undefined,
          typeOperation,
          montant: getNumberWithFallback(['Montant', 'montant', 'amount']) || agencyInfo.volume || 0,
          soldeAvant: 0,
          soldeApres: 0,
          codeProprietaire,
          dateOperation: overrideDateIso || new Date().toISOString(),
          numeroTransGU,
          groupeReseau,
          statut: 'EN_ATTENTE',
          commentaire: `Importé depuis ECART BO - ${new Date().toLocaleString('fr-FR')}`,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        } as ImpactOP;
      });

      const deduplicatedImpacts = this.deduplicateItems(
        impactOPData,
        impact => this.buildImpactOpDedupKey(impact)
      );

      console.log('DEBUG: Envoi batch ECART BO vers Import OP...');
      const batchResult = await firstValueFrom(this.impactOPService.createImpactOPBatch(deduplicatedImpacts.unique));
      const successCount = batchResult.successCount ?? 0;
      const errorCount = batchResult.errorCount ?? 0;

      if (batchResult.errors?.length) {
        console.warn('⚠️ Erreurs détaillées (batch BO):', batchResult.errors.slice(0, 10));
      }

      if (successCount > 0) {
        this.popupService.showSuccess(this.t('SV.importOpSuccess', {
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
    } catch (error: any) {
      console.error('❌ Erreur lors de la sauvegarde ECART BO vers Import OP:', error);
      this.popupService.showError(this.t('SV.importOpErrorTitle') + this.t('SV.pleaseRetry'));
    } finally {
      this.isSavingEcartBoToImpactOP = false;
      this.cdr.markForCheck();
    }
  }

  goBack(): void {
    this.router.navigate(['/results']);
  }

  goToSummary(): void {
    const records = this.filteredBoOnly.length > 0
      ? this.filteredBoOnly
      : (this.reconciliationTabsService.getFilteredBoOnly() || []);
    const pendingLines = buildEcartBoPendingLinesFromRecords(records);
    if (pendingLines.length > 0) {
      this.ecartBoSummaryService.setPendingLinesFromEcartBo(pendingLines, 'ecart-bo');
    }
    this.router.navigate(['/ecart-bo-summary']);
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
    this.tableWrapperRef?.nativeElement.scrollBy({ left: -this.TABLE_SCROLL_STEP, behavior: 'smooth' });
  }

  scrollTableRight(): void {
    this.tableWrapperRef?.nativeElement.scrollBy({ left: this.TABLE_SCROLL_STEP, behavior: 'smooth' });
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
