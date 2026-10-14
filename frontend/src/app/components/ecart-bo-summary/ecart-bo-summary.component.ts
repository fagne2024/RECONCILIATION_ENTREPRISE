import { Component, OnInit, OnDestroy, ChangeDetectorRef, ChangeDetectionStrategy } from '@angular/core';
import { Router } from '@angular/router';
import { Subscription, firstValueFrom } from 'rxjs';
import { finalize, take } from 'rxjs/operators';
import { ReconciliationResponse } from '../../models/reconciliation-response.model';
import { AppStateService } from '../../services/app-state.service';
import {
  EcartBoSummaryFilter,
  EcartBoSummaryService,
  EcartBoSummaryPrefill,
  EcartBoSummaryPendingLine
} from '../../services/ecart-bo-summary.service';
import { PopupService } from '../../services/popup.service';
import { ReconciliationTabsService } from '../../services/reconciliation-tabs.service';
import { ReconciliationService } from '../../services/reconciliation.service';
import { fixGarbledCharacters } from '../../utils/encoding-fixer';
import {
  BILINGUAL_COLUMN_ALIASES,
  getRecordValueByAliases
} from '../../utils/bilingual-column.util';
import { ModernPopupComponent } from '../modern-popup/modern-popup.component';
import {
  RECONCILIATION_ENV_OPTIONS,
  normalizeReconciliationReportEnv
} from '../../constants/reconciliation-env-options';
import { SharedModule } from '../../shared/shared.module';
import { TranslateModule } from '@ngx-translate/core';

export interface EcartBoSummaryItem {
  id?: number; // ID si l'item est sauvegardé
  selectionKey: string; // Clé locale stable pour la sélection UI
  date: string;
  agence: string;
  service: string;
  pays: string;
  nombre: number; // Nombre de lignes/transactions
  montant: number; // Montant total (pour référence)
  statut: 'ok' | 'en cours';
  /** Plateforme : BO ou Partenaire (données en plateforme partenaire) */
  env?: 'BO' | 'PARTENAIRE';
  /** Environnement technique : BET, HT, PROD, etc. */
  envCode?: string;
  originalRecords: Record<string, string>[]; // Tous les enregistrements pour ce service
  isManual?: boolean; // Indique si la ligne a été créée manuellement
  commentaire?: string; // Commentaire pour identifier l'origine
  linkedId?: number; // ID de la ligne liée (paire BO/PARTENAIRE)
  token?: string; // Lien entre lignes BO et PARTENAIRE (statut OK) pour recherche rapide
  /** Ligne détectée comme doublon (liste locale ou base). */
  isDuplicate?: boolean;
  /** Détail lisible du doublon (critères correspondants). */
  duplicateHint?: string;
}

type SummaryGroupAccumulator = {
  agence: string;
  service: string;
  pays: string;
  date: string;
  recordCount: number;
  totalMontant: number;
  multiAgenceRecords?: Record<string, string>[];
};

@Component({
  selector: 'app-ecart-bo-summary',
  standalone: true,
  imports: [TranslateModule, SharedModule],
  templateUrl: './ecart-bo-summary.component.html',
  styleUrls: ['./ecart-bo-summary.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class EcartBoSummaryComponent implements OnInit, OnDestroy {
  response: ReconciliationResponse | null = null;
  summaryItems: EcartBoSummaryItem[] = [];
  filteredItems: EcartBoSummaryItem[] = [];
  pagedItems: EcartBoSummaryItem[] = [];
  /** Totaux pré-calculés pour éviter des reduce() à chaque cycle de détection de changements. */
  filteredTotalNombre = 0;
  filteredTotalVolume = 0;
  private subscription = new Subscription();
  private savedDataMode = false;
  private lastSavedFetchKey = '';
  
  // Pagination
  currentPage = 1;
  pageSize = 20;
  totalPages = 1;
  
  // Recherche
  searchKey: string = '';
  
  // Filtres
  selectedAgence: string = '';
  selectedService: string = '';
  selectedPays: string = '';
  selectedStatut: string = '';
  /** Filtre plateforme BO / PARTENAIRE */
  selectedEnv: string = '';
  /** Filtre ENV technique (BET, HT, …) */
  selectedEnvCode: string = '';
  selectedDateFrom: string = '';
  selectedDateTo: string = '';
  selectedToken: string = '';
  /** Par défaut, les données sauvegardées sont limitées au mois courant pour accélérer l’affichage. */
  showAllSavedHistory = false;

  // Liste des valeurs uniques pour les filtres
  uniqueAgencies: string[] = [];
  uniqueServices: string[] = [];
  uniquePays: string[] = [];
  /** Valeurs pour le filtre / listes ENV (BET, HT, …) */
  uniqueEnvCodes: string[] = [];
  readonly envCodePresetOptions: readonly string[] = [...RECONCILIATION_ENV_OPTIONS];
  /** Options des filtres (cascade pays → service → ENV, cloisonnement des données affichées) */
  filterOptionsPays: string[] = [];
  filterOptionsServices: string[] = [];
  filterOptionsEnvCodes: string[] = [];

  isLoading = false;
  loadingStep = '';
  cachedVisibleDuplicateCount = 0;
  allFilteredSelected = false;
  someFilteredSelected = false;
  selectedSavableCountCached = 0;
  selectedDeletableCountCached = 0;
  private searchDebounceTimer: ReturnType<typeof setTimeout> | null = null;
  private static readonly SUMMARY_BUILD_CHUNK_SIZE = 500;
  isSaving = false;
  isDeleting = false;
  deletingItemId: number | null = null;
  isBulkDeleting = false;
  isExporting = false;
  /** Clés locales des lignes sélectionnées (sauvegarde ou suppression). */
  selectedRowKeys = new Set<string>();
  /** Aperçu des doublons détectés dans la liste (affiché dans la bannière). */
  duplicateBannerLines: string[] = [];
  
  // Édition
  showEditModal = false;
  editingItem: EcartBoSummaryItem | null = null;
  editForm: {
    date: string;
    agence: string;
    service: string;
    pays: string;
    nombre: number;
    volume: number;
    statut: 'ok' | 'en cours';
    env: 'BO' | 'PARTENAIRE';
    envCode: string;
    token: string;
  } = {
    date: '',
    agence: '',
    service: '',
    pays: '',
    nombre: 0,
    volume: 0,
    statut: 'en cours',
    env: 'BO',
    envCode: '',
    token: ''
  };
  isUpdating = false;

  // Ajout
  showAddModal = false;
  addForm: {
    date: string;
    agence: string;
    service: string;
    pays: string;
    nombre: number;
    volume: number;
    statut: 'ok' | 'en cours';
    env: 'BO' | 'PARTENAIRE';
    envCode: string;
    token: string;
  } = {
    date: '',
    agence: '',
    service: '',
    pays: '',
    nombre: 0,
    volume: 0,
    statut: 'en cours',
    env: 'BO',
    envCode: '',
    token: ''
  };
  isAdding = false;

  /** True tant que l'utilisateur n'a pas choisi l'ENV (réconciliation ou lignes en attente écarts BO). */
  awaitingEnvChoice = false;
  /** Sélection temporaire dans le panneau pré-chargement. */
  pendingEnvSelection = '';
  /** ENV appliqué aux lignes générées (réconciliation / pending) et défaut du formulaire Ajouter. */
  sessionDefaultEnvCode = '';
  private pendingLinesBuffer: EcartBoSummaryPendingLine[] | null = null;
  private prefillBuffer: EcartBoSummaryPrefill | null = null;
  private selectionKeyCounter = 0;
  private isPersistingLinks = false;

  /** Service magique actif (réconciliation magique) — cloisonne l'affichage. */
  magicServiceFilterLocked = '';

  constructor(
    private appStateService: AppStateService,
    private router: Router,
    private cdr: ChangeDetectorRef,
    private ecartBoSummaryService: EcartBoSummaryService,
    private popupService: PopupService,
    private reconciliationTabsService: ReconciliationTabsService,
    private reconciliationService: ReconciliationService
  ) {}

  private buildResponseFromTabsService(): ReconciliationResponse | null {
    const mismatches = this.reconciliationTabsService.getFilteredMismatches() || [];
    const boOnly = this.reconciliationTabsService.getFilteredBoOnly() || [];
    const partnerOnly = this.reconciliationTabsService.getFilteredPartnerOnly() || [];
    const matches = this.reconciliationTabsService.getFilteredMatches() || [];

    const hasAny =
      mismatches.length > 0 || boOnly.length > 0 || partnerOnly.length > 0 || matches.length > 0;

    if (!hasAny) {
      return null;
    }

    return {
      matches,
      boOnly,
      partnerOnly,
      mismatches,
      totalBoRecords: boOnly.length + matches.length,
      totalPartnerRecords: partnerOnly.length + matches.length,
      totalMatches: matches.length,
      totalMismatches: mismatches.length,
      totalBoOnly: boOnly.length,
      totalPartnerOnly: partnerOnly.length
    };
  }

  ngOnInit(): void {
    this.refreshUniqueEnvCodes();
    this.syncMagicServiceFilterFromContext();
    const pendingLines = this.ecartBoSummaryService.getAndClearPendingLinesFromEcartBo();
    const prefill = this.ecartBoSummaryService.getAndClearPrefillFromMatches();

    this.subscription.add(
      this.appStateService.getReconciliationResults().pipe(take(1)).subscribe((response: ReconciliationResponse | null) => {
        if (pendingLines && pendingLines.length > 0) {
          this.pendingLinesBuffer = this.filterPendingLinesByMagicService(pendingLines);
          this.prefillBuffer = prefill;
          this.awaitingEnvChoice = true;
          this.pendingEnvSelection = this.sessionDefaultEnvCode || '';
          this.cdr.markForCheck();
          return;
        }
        if (response) {
          this.response = this.slimResponseForEcarts(response);
          this.prefillBuffer = prefill;
          this.awaitingEnvChoice = true;
          this.pendingEnvSelection = this.sessionDefaultEnvCode || '';
          this.cdr.markForCheck();
          return;
        }
        const responseFromTabs = this.buildResponseFromTabsService();
        if (responseFromTabs) {
          this.response = this.slimResponseForEcarts(responseFromTabs);
          this.prefillBuffer = prefill;
          this.awaitingEnvChoice = true;
          this.pendingEnvSelection = this.sessionDefaultEnvCode || '';
          this.cdr.markForCheck();
          return;
        }
        this.loadSavedSummaryData();
        if (prefill) {
          this.popupService
            .showSuccess(
              'Données prêtes. Le formulaire Écart BO Summary sera prérempli ; vous pouvez modifier et ajouter la ligne.'
            )
            .then(() => {
              this.openAddModalWithPrefill(prefill);
              this.cdr.markForCheck();
            });
        }
      })
    );
  }

  get envPreloadHint(): string {
    if (this.prefillBuffer) {
      return `Les correspondances sélectionnées (${this.prefillBuffer.nombre.toLocaleString('fr-FR')} transactions) seront préparées pour sauvegarde.`;
    }
    if (this.pendingLinesBuffer && this.pendingLinesBuffer.length > 0) {
      return `${this.pendingLinesBuffer.length} ligne(s) en attente depuis les écarts BO.`;
    }
    return 'Les écarts issus de la réconciliation en cours vont être chargés dans le tableau.';
  }

  /**
   * Après choix de l'ENV : construit les lignes (réconciliation ou pending) et éventuellement ouvre le préremplissage matches.
   */
  confirmEnvAndLoadData(): void {
    this.sessionDefaultEnvCode = (this.pendingEnvSelection || '').trim();
    const prefill = this.prefillBuffer;
    this.prefillBuffer = null;

    if (this.pendingLinesBuffer && this.pendingLinesBuffer.length > 0) {
      this.awaitingEnvChoice = false;
      const lines = this.pendingLinesBuffer;
      this.pendingLinesBuffer = null;
      this.applyPendingLinesFromEcartBo(lines);
      this.popupService.showSuccess(
        `${lines.length} ligne(s) prêtes (ENV : ${this.sessionDefaultEnvCode || 'T-E / non renseigné'}). Utilisez « Sauvegarder » pour enregistrer.`
      );
    } else if (this.response && prefill) {
      // Depuis /matches : ne pas agréger les milliers d'écarts BO — uniquement la ligne de correspondances.
      this.awaitingEnvChoice = false;
      this.response = null;
    } else if (this.response) {
      this.isLoading = true;
      this.awaitingEnvChoice = false;
      this.cdr.markForCheck();
      this.loadSummaryData();
    } else {
      this.awaitingEnvChoice = false;
    }

    this.syncMagicServiceFilterFromContext();

    if (prefill) {
      this.popupService
        .showSuccess(
          'Données prêtes. Le formulaire Écart BO Summary sera prérempli ; vous pouvez modifier et ajouter la ligne.'
        )
        .then(() => {
          this.openAddModalWithPrefill(prefill);
          this.cdr.markForCheck();
        });
    }
    this.cdr.markForCheck();
  }

  /** Lignes générées : env_code = choix session (vide = agrégat T-E côté relevé). */
  private getEnvCodeForNewRows(): string | undefined {
    const v = this.sessionDefaultEnvCode?.trim();
    return v || undefined;
  }

  private createSelectionKey(prefix: string): string {
    this.selectionKeyCounter += 1;
    return `${prefix}-${this.selectionKeyCounter}`;
  }

  /** Applique les lignes en attente venues de la page écarts BO (aucun enregistrement : l'utilisateur clique sur Sauvegarder pour enregistrer). */
  private applyPendingLinesFromEcartBo(pending: EcartBoSummaryPendingLine[]): void {
    this.savedDataMode = false;
    this.lastSavedFetchKey = '';
    const defaultEnv = this.ecartBoSummaryService.getDefaultEnvForAddModal();
    this.summaryItems = pending.map(line => ({
      selectionKey: this.createSelectionKey('pending'),
      date: line.date || new Date().toISOString().split('T')[0],
      agence: line.agence || '',
      service: line.service || '',
      pays: line.pays || '',
      nombre: line.nombreTransactions ?? 1,
      montant: line.montant ?? 0,
      statut: 'en cours' as const,
      env: defaultEnv as 'BO' | 'PARTENAIRE',
      envCode: this.getEnvCodeForNewRows(),
      originalRecords: [],
      token: undefined
    } as EcartBoSummaryItem));
    this.selectedRowKeys.clear();
    this.summaryItems.forEach(item => this.selectedRowKeys.add(item.selectionKey));
    this.uniqueAgencies = [...new Set(this.summaryItems.map(i => i.agence).filter(Boolean))].sort();
    this.uniqueServices = [...new Set(this.summaryItems.map(i => i.service).filter(Boolean))].sort();
    this.uniquePays = [...new Set(this.summaryItems.map(i => i.pays).filter(Boolean))].sort();
    this.refreshUniqueEnvCodes();
    this.markAndFilterDuplicateSummaryItems(true);
    this.applyFilters();
    this.cdr.markForCheck();
  }

  private refreshUniqueEnvCodes(): void {
    const fromItems = this.summaryItems
      .map(i => (i.envCode || '').trim())
      .filter((c): c is string => !!c);
    this.uniqueEnvCodes = [...new Set([...this.envCodePresetOptions, ...fromItems])].sort((a, b) =>
      a.localeCompare(b, 'fr')
    );
  }

  trackBySelectionKey(_: number, item: EcartBoSummaryItem): string {
    return item.selectionKey;
  }

  trackByString(_: number, value: string): string {
    return value;
  }

  trackByNumber(_: number, value: number): number {
    return value;
  }

  private toYmdLocal(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  private currentMonthDateRange(): { startDate: string; endDate: string } {
    const now = new Date();
    const first = new Date(now.getFullYear(), now.getMonth(), 1);
    const last = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    return { startDate: this.toYmdLocal(first), endDate: this.toYmdLocal(last) };
  }

  /**
   * Période par défaut des données sauvegardées :
   * - mois en cours
   * - inclut J-1 même si la veille est dans le mois précédent (début de mois)
   */
  private defaultSavedHistoryDateRange(): { startDate: string; endDate: string } {
    const now = new Date();
    const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
    const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    const start = yesterday.getTime() < firstOfMonth.getTime() ? yesterday : firstOfMonth;
    return { startDate: this.toYmdLocal(start), endDate: this.toYmdLocal(lastOfMonth) };
  }

  private normalizeStatusForApi(statut: string): string | undefined {
    if (statut === 'ok') {
      return 'OK';
    }
    if (statut === 'en cours') {
      return 'EN_COURS';
    }
    return undefined;
  }

  private buildSavedSummaryFilter(): { filter: EcartBoSummaryFilter; key: string } {
    const filter: EcartBoSummaryFilter = {};
    if (this.selectedAgence) {
      filter.agence = this.selectedAgence;
    }
    if (this.selectedService) {
      filter.service = this.selectedService;
    }
    if (this.selectedPays) {
      filter.pays = this.selectedPays;
    }
    const statut = this.normalizeStatusForApi(this.selectedStatut);
    if (statut) {
      filter.statut = statut;
    }
    if (this.selectedEnv) {
      filter.platform = this.selectedEnv;
    }
    if (this.selectedEnvCode) {
      filter.env = normalizeReconciliationReportEnv(this.selectedEnvCode);
    }

    if (this.selectedDateFrom || this.selectedDateTo) {
      if (this.selectedDateFrom) {
        filter.startDate = this.selectedDateFrom;
      }
      if (this.selectedDateTo) {
        filter.endDate = this.selectedDateTo;
      }
    } else if (!this.showAllSavedHistory) {
      const range = this.defaultSavedHistoryDateRange();
      filter.startDate = range.startDate;
      filter.endDate = range.endDate;
    }

    const key = JSON.stringify({
      agence: filter.agence || '',
      service: filter.service || '',
      pays: filter.pays || '',
      statut: filter.statut || '',
      platform: filter.platform || '',
      env: filter.env || '',
      startDate: filter.startDate || '',
      endDate: filter.endDate || '',
      all: this.showAllSavedHistory
    });
    return { filter, key };
  }

  private shouldReloadSavedDataForFilters(): boolean {
    return this.savedDataMode && this.buildSavedSummaryFilter().key !== this.lastSavedFetchKey;
  }

  loadByToken(): void {
    const t = this.selectedToken?.trim();
    if (!t) {
      this.popupService.showWarning('❌ Saisissez un token pour rechercher.');
      return;
    }
    this.isLoading = true;
    this.cdr.markForCheck();
    this.ecartBoSummaryService.getEcartBoSummaries({ token: t }).pipe(
      finalize(() => {
        this.isLoading = false;
        this.cdr.markForCheck();
      })
    ).subscribe({
      next: (savedData) => {
        this.applySavedDataToSummary(savedData);
        this.applyFilters();
        this.popupService.showSuccess(`✅ ${this.summaryItems.length} ligne(s) trouvée(s) pour le token.`);
      },
      error: (err) => {
        console.error('Erreur recherche par token:', err);
        this.popupService.showError('❌ Erreur lors de la recherche par token.');
      }
    });
  }

  private applySavedDataToSummary(savedData: any[]): void {
    this.selectedRowKeys.clear();
    this.summaryItems = savedData.map(item => {
      const commentaire = item.commentaire || '';
      const isManual = commentaire.includes('Ajout manuel') || commentaire.includes('ajout manuel');
      const mapped: any = {
        id: item.id,
        selectionKey: this.createSelectionKey(`saved-${item.id ?? 'x'}`),
        date: this.formatSummaryDate(item.dateTransaction || ''),
        agence: item.agence || 'Non spécifié',
        service: item.service || 'Non spécifié',
        pays: item.pays || 'Non spécifié',
        nombre: item.nombreTransactions || 0,
        montant: item.montantTotal || 0,
        statut: this.normalizeSummaryStatut(item.statut),
        env: this.normalizeSummaryEnv(item.env),
        envCode: item.envCode != null && String(item.envCode).trim() !== '' ? String(item.envCode).trim() : undefined,
        originalRecords: [],
        isManual,
        commentaire,
        token: item.token || undefined
      };
      // Snapshots pour éviter des updates "inutiles" (rafales) lors du linking automatique
      mapped.__originalStatut = mapped.statut;
      mapped.__originalToken = mapped.token;
      return mapped as EcartBoSummaryItem;
    });
    this.uniqueAgencies = [...new Set(this.summaryItems.map(i => i.agence).filter(Boolean))].sort();
    this.uniqueServices = [...new Set(this.summaryItems.map(i => i.service).filter(Boolean))].sort();
    this.uniquePays = [...new Set(this.summaryItems.map(i => i.pays).filter(Boolean))].sort();
    this.refreshUniqueEnvCodes();
    this.markAndFilterDuplicateSummaryItems(true);
    this.linkMatchingPairs(true);
  }

  loadSavedSummaryData(): void {
    this.awaitingEnvChoice = false;
    this.pendingLinesBuffer = null;
    this.prefillBuffer = null;
    this.isLoading = true;
    this.cdr.markForCheck();
    const { filter, key } = this.buildSavedSummaryFilter();

    this.ecartBoSummaryService
      .getEcartBoSummaries(filter)
      .subscribe({
        next: (savedData) => {
          this.savedDataMode = true;
          this.lastSavedFetchKey = key;
          // Laisser Angular afficher le spinner avant le traitement lourd (linking, filtres).
          setTimeout(() => {
            try {
              this.applySavedDataToSummary(savedData);
              this.applyFilters();
            } catch (processingError) {
              console.error('Erreur lors du traitement des données sauvegardées:', processingError);
              this.popupService.showError('❌ Erreur lors du traitement des données sauvegardées.');
            } finally {
              this.isLoading = false;
              this.cdr.markForCheck();
            }
          }, 0);
        },
        error: (error) => {
          this.isLoading = false;
          this.cdr.markForCheck();
          console.error('Erreur lors du chargement des données sauvegardées:', error);
          if (this.response) {
            this.loadSummaryData();
          }
        }
      });
  }

  ngOnDestroy(): void {
    if (this.searchDebounceTimer) {
      clearTimeout(this.searchDebounceTimer);
    }
    this.subscription.unsubscribe();
  }

  private slimResponseForEcarts(response: ReconciliationResponse): ReconciliationResponse {
    return {
      ...response,
      matches: []
    };
  }

  private loadSummaryData(): void {
    this.savedDataMode = false;
    this.lastSavedFetchKey = '';
    this.isLoading = true;
    this.loadingStep = 'Préparation des écarts…';
    this.cdr.markForCheck();

    void this.buildSummaryItemsFromReconciliationResponseAsync()
      .catch(error => {
        console.error('Erreur lors du chargement des écarts de réconciliation:', error);
        this.popupService.showError('❌ Erreur lors du chargement des écarts.');
      })
      .finally(() => {
        this.isLoading = false;
        this.loadingStep = '';
        this.cdr.markForCheck();
      });
  }

  /** Construit summaryItems par lots pour ne pas bloquer le thread UI. */
  private async buildSummaryItemsFromReconciliationResponseAsync(): Promise<void> {
    const sessionId =
      this.response?.progressSessionId ||
      this.reconciliationService.getCurrentJobId();
    const needsRemoteEcarts =
      !!this.response &&
      ((this.response.resultsPaginated ?? false) ||
        ((this.response.totalBoOnly ?? 0) + (this.response.totalMismatches ?? 0) >
          (this.response.boOnly?.length ?? 0) + (this.response.mismatches?.length ?? 0)));

    if (sessionId && needsRemoteEcarts) {
      this.loadingStep = 'Chargement des écarts BO…';
      this.cdr.markForCheck();
      const serverLines = await this.reconciliationService.loadEcartBoSummaryLines(sessionId);
      if (serverLines.length > 0) {
        const filtered = this.filterPendingLinesByMagicService(serverLines);
        this.applyPendingLinesFromEcartBo(filtered);
        queueMicrotask(() => this.linkMatchingPairs(false));
        return;
      }
    }

    await this.ensureBoEcartsLoaded();

    const mismatches = this.applyMagicReconciliationFilter(this.response?.mismatches ?? []);
    const boOnly = this.applyMagicReconciliationFilter(this.response?.boOnly ?? []);
    const records = mismatches.concat(boOnly);
    const groupedByAgence = new Map<string, SummaryGroupAccumulator>();
    const chunkSize = EcartBoSummaryComponent.SUMMARY_BUILD_CHUNK_SIZE;

    for (let start = 0; start < records.length; start += chunkSize) {
      const end = Math.min(start + chunkSize, records.length);
      for (let i = start; i < end; i++) {
        this.accumulateSummaryRecord(records[i], groupedByAgence);
      }
      this.loadingStep = records.length
        ? `Agrégation ${end.toLocaleString('fr-FR')} / ${records.length.toLocaleString('fr-FR')} écarts…`
        : 'Finalisation…';
      this.cdr.markForCheck();
      if (end < records.length) {
        await new Promise<void>(resolve => setTimeout(resolve, 0));
      }
    }

    this.finalizeSummaryFromGroups(groupedByAgence);
    queueMicrotask(() => this.linkMatchingPairs(false));
    this.applyFilters();
  }

  /** Charge boOnly/mismatches depuis l'API si la réponse HTTP a été tronquée (pagination). */
  private async ensureBoEcartsLoaded(): Promise<void> {
    if (!this.response) {
      return;
    }

    const localCount = (this.response.boOnly?.length ?? 0) + (this.response.mismatches?.length ?? 0);
    const expectedCount = (this.response.totalBoOnly ?? 0) + (this.response.totalMismatches ?? 0);
    if (localCount > 0 && (!this.response.resultsPaginated || localCount >= expectedCount)) {
      return;
    }

    const tabsBo = this.reconciliationTabsService.getFilteredBoOnly() || [];
    const tabsMismatch = this.reconciliationTabsService.getFilteredMismatches() || [];
    if ((tabsBo.length + tabsMismatch.length) > 0) {
      this.response = {
        ...this.response,
        boOnly: tabsBo,
        mismatches: tabsMismatch
      };
      return;
    }

    if (!this.response.resultsPaginated && expectedCount <= 0) {
      return;
    }

    const sessionId =
      this.response.progressSessionId ||
      this.reconciliationService.getCurrentJobId();
    if (!sessionId) {
      return;
    }

    this.loadingStep = 'Chargement des écarts BO…';
    this.cdr.markForCheck();
    const { boOnly, mismatches } = await this.reconciliationService.loadBoEcartsFromSession(sessionId);
    this.response = {
      ...this.response,
      boOnly,
      mismatches
    };
    this.reconciliationTabsService.setFilteredBoOnly(boOnly);
    this.reconciliationTabsService.setFilteredMismatches(mismatches);
  }

  private accumulateSummaryRecord(
    record: Record<string, string>,
    groupedByAgence: Map<string, SummaryGroupAccumulator>
  ): void {
    const getValue = (row: Record<string, string>, aliasGroup: readonly string[]): string =>
      getRecordValueByAliases(row, aliasGroup);

    const agence = getValue(record, BILINGUAL_COLUMN_ALIASES.agence) || 'Non spécifié';
    const service = getValue(record, BILINGUAL_COLUMN_ALIASES.service) || 'Non spécifié';
    const pays = getValue(record, BILINGUAL_COLUMN_ALIASES.pays) || 'Non spécifié';
    const date = getValue(record, BILINGUAL_COLUMN_ALIASES.date) || '';
    const montantStr = getValue(record, BILINGUAL_COLUMN_ALIASES.montant);
    const montant = montantStr ? parseFloat(montantStr.toString().replace(',', '.')) : 0;
    const key = `${agence}|${service}|${pays}`;
    const isMultiAgence = agence === 'multiAgence';

    let group = groupedByAgence.get(key);
    if (!group) {
      group = {
        agence,
        service,
        pays,
        date,
        recordCount: 0,
        totalMontant: 0,
        ...(isMultiAgence ? { multiAgenceRecords: [] } : {})
      };
      groupedByAgence.set(key, group);
    }

    if (isMultiAgence) {
      group.multiAgenceRecords!.push(record);
    } else {
      group.recordCount += 1;
    }
    group.totalMontant += Number.isFinite(montant) ? montant : 0;
  }

  private finalizeSummaryFromGroups(groupedByAgence: Map<string, SummaryGroupAccumulator>): void {
    const getValue = (record: Record<string, string>, aliasGroup: readonly string[]): string =>
      getRecordValueByAliases(record, aliasGroup);

    const items: EcartBoSummaryItem[] = [];
    for (const group of groupedByAgence.values()) {
      if (group.agence === 'multiAgence' && group.multiAgenceRecords?.length) {
        for (const record of group.multiAgenceRecords) {
          const agence = getValue(record, BILINGUAL_COLUMN_ALIASES.agence) || group.agence;
          const service = getValue(record, BILINGUAL_COLUMN_ALIASES.service) || group.service;
          const pays = getValue(record, BILINGUAL_COLUMN_ALIASES.pays) || group.pays;
          const date = getValue(record, BILINGUAL_COLUMN_ALIASES.date) || group.date;
          const montantStr = getValue(record, BILINGUAL_COLUMN_ALIASES.montant);
          const montant = montantStr ? parseFloat(montantStr.toString().replace(',', '.')) : 0;
          items.push({
            selectionKey: this.createSelectionKey('generated'),
            date,
            agence,
            service,
            pays,
            nombre: 1,
            montant,
            statut: 'en cours',
            env: 'BO',
            envCode: this.getEnvCodeForNewRows(),
            originalRecords: [],
            token: undefined
          } as EcartBoSummaryItem);
        }
      } else {
        items.push({
          selectionKey: this.createSelectionKey('generated'),
          date: group.date,
          agence: group.agence,
          service: group.service,
          pays: group.pays,
          nombre: group.recordCount,
          montant: group.totalMontant,
          statut: 'en cours',
          env: 'BO',
          envCode: this.getEnvCodeForNewRows(),
          originalRecords: [],
          token: undefined
        } as EcartBoSummaryItem);
      }
    }

    this.selectedRowKeys.clear();
    this.summaryItems = items;
    this.markAndFilterDuplicateSummaryItems(true);

    this.uniqueAgencies = [...new Set(this.summaryItems.map(item => item.agence).filter(Boolean))].sort();
    this.uniqueServices = [...new Set(this.summaryItems.map(item => item.service).filter(Boolean))].sort();
    this.uniquePays = [...new Set(this.summaryItems.map(item => item.pays).filter(Boolean))].sort();
    this.refreshUniqueEnvCodes();
    this.syncMagicServiceFilterFromContext();
  }

  onSearch(): void {
    if (this.searchDebounceTimer) {
      clearTimeout(this.searchDebounceTimer);
    }
    this.searchDebounceTimer = setTimeout(() => {
      this.searchDebounceTimer = null;
      this.applyFilters();
    }, 250);
  }

  toggleSavedHistoryScope(): void {
    this.showAllSavedHistory = !this.showAllSavedHistory;
    if (this.savedDataMode) {
      this.loadSavedSummaryData();
      return;
    }
    this.applyFilters();
  }

  /** Recharge les données sans réinitialiser les filtres (Du/Au, agence, service, etc.). */
  refreshSummaryData(): void {
    if (this.isLoading || this.awaitingEnvChoice) {
      return;
    }

    if (this.response && !this.savedDataMode) {
      this.loadSummaryData();
      return;
    }

    this.loadSavedSummaryData();
  }

  /** Applique le cloisonnement service depuis la réconciliation magique. */
  private syncMagicServiceFilterFromContext(): void {
    const magicService = this.getActiveMagicServiceFilter();
    this.magicServiceFilterLocked = magicService;
    if (magicService) {
      this.selectedService = magicService;
    }
  }

  private getActiveMagicServiceFilter(): string {
    const magicCtx = this.reconciliationTabsService.getMagicViewContext();
    return (magicCtx.service || this.appStateService.getSelectedMagicService() || '').trim();
  }

  private ensureMagicViewContext(): void {
    const magicCtx = this.reconciliationTabsService.getMagicViewContext();
    const service = magicCtx.service || this.appStateService.getSelectedMagicService();
    const partnerFile = magicCtx.partnerFile || this.appStateService.getSelectedMagicPartnerFile();
    if (service && !magicCtx.service) {
      this.reconciliationTabsService.setMagicViewContext(service, partnerFile);
    }
  }

  private applyMagicReconciliationFilter(records: Record<string, string>[]): Record<string, string>[] {
    const service = this.getActiveMagicServiceFilter();
    const partnerFile = this.reconciliationTabsService.getMagicViewContext().partnerFile
      || this.appStateService.getSelectedMagicPartnerFile();
    if (!service && !partnerFile) {
      return records;
    }
    this.ensureMagicViewContext();
    return this.reconciliationTabsService.filterBoEcartsByMagicView(records);
  }

  private filterPendingLinesByMagicService(lines: EcartBoSummaryPendingLine[]): EcartBoSummaryPendingLine[] {
    const magicService = this.getActiveMagicServiceFilter();
    if (!magicService) {
      return lines;
    }
    return lines.filter(line => (line.service || '').trim() === magicService);
  }

  /**
   * Indique si une ligne passe les critères actifs. Les skips servent au cloisonnement des listes déroulantes (pays → service → ENV).
   */
  private itemMatchesFilters(
    item: EcartBoSummaryItem,
    skips?: { skipPays?: boolean; skipService?: boolean; skipEnvCode?: boolean }
  ): boolean {
    const s = skips || {};

    if (this.searchKey && this.searchKey.trim()) {
      const searchTerm = this.searchKey.toLowerCase().trim();
      const envNorm = normalizeReconciliationReportEnv(item.envCode).toLowerCase();
      const matchSearch =
        item.date.toLowerCase().includes(searchTerm) ||
        item.agence.toLowerCase().includes(searchTerm) ||
        item.service.toLowerCase().includes(searchTerm) ||
        item.pays.toLowerCase().includes(searchTerm) ||
        item.statut.toLowerCase().includes(searchTerm) ||
        (item.env || '').toLowerCase().includes(searchTerm) ||
        (item.envCode || '').toLowerCase().includes(searchTerm) ||
        envNorm.includes(searchTerm) ||
        item.nombre.toString().includes(searchTerm) ||
        (item.token || '').toLowerCase().includes(searchTerm);
      if (!matchSearch) return false;
    }

    if (this.selectedToken && this.selectedToken.trim()) {
      if (!this.itemMatchesTokenFilter(item, this.selectedToken.trim())) return false;
    }

    if (this.selectedAgence && item.agence !== this.selectedAgence) return false;

    if (!s.skipService && this.selectedService && item.service !== this.selectedService) return false;

    if (!s.skipPays && this.selectedPays && item.pays !== this.selectedPays) return false;

    if (this.selectedStatut && item.statut !== this.selectedStatut) return false;

    if (this.selectedEnv && item.env !== this.selectedEnv) return false;

    if (!s.skipEnvCode && this.selectedEnvCode) {
      const sel = normalizeReconciliationReportEnv(this.selectedEnvCode);
      if (normalizeReconciliationReportEnv(item.envCode) !== sel) return false;
    }

    if (this.selectedDateFrom) {
      const dateFrom = new Date(this.selectedDateFrom);
      if (!item.date) return false;
      const itemDate = new Date(item.date.split('T')[0]);
      if (itemDate < dateFrom) return false;
    }

    if (this.selectedDateTo) {
      const dateTo = new Date(this.selectedDateTo);
      dateTo.setHours(23, 59, 59, 999);
      if (!item.date) return false;
      const itemDate = new Date(item.date.split('T')[0]);
      if (itemDate > dateTo) return false;
    }

    return true;
  }

  /** Réinitialise les sélections de cascade si elles ne sont plus valides pour les données courantes. */
  private sanitizeCascadeSelections(): void {
    const paysValid = new Set(
      this.summaryItems
        .filter(i => this.itemMatchesFilters(i, { skipPays: true, skipService: true, skipEnvCode: true }))
        .map(i => i.pays)
        .filter((p): p is string => !!p)
    );
    if (this.selectedPays && !paysValid.has(this.selectedPays)) {
      this.selectedPays = '';
    }

    const svcValid = new Set(
      this.summaryItems
        .filter(i => this.itemMatchesFilters(i, { skipService: true, skipEnvCode: true }))
        .map(i => i.service)
        .filter((v): v is string => !!v)
    );
    if (this.selectedService && !svcValid.has(this.selectedService)) {
      this.selectedService = '';
    }

    const envValid = new Set(
      this.summaryItems
        .filter(i => this.itemMatchesFilters(i, { skipEnvCode: true }))
        .map(i => normalizeReconciliationReportEnv(i.envCode))
    );
    if (this.selectedEnvCode) {
      const n = normalizeReconciliationReportEnv(this.selectedEnvCode);
      if (!envValid.has(n)) {
        this.selectedEnvCode = '';
      }
    }
  }

  private rebuildFilterOptionLists(): void {
    const paysSet = new Set<string>();
    const serviceSet = new Set<string>();
    const envSet = new Set<string>();

    for (const item of this.summaryItems) {
      if (this.itemMatchesFilters(item, { skipPays: true, skipService: true, skipEnvCode: true }) && item.pays) {
        paysSet.add(item.pays);
      }
      if (this.itemMatchesFilters(item, { skipService: true, skipEnvCode: true }) && item.service) {
        serviceSet.add(item.service);
      }
      if (this.itemMatchesFilters(item, { skipEnvCode: true })) {
        envSet.add(normalizeReconciliationReportEnv(item.envCode));
      }
    }

    this.filterOptionsPays = [...paysSet].sort((a, b) => a.localeCompare(b, 'fr'));
    this.filterOptionsServices = [...serviceSet].sort((a, b) => a.localeCompare(b, 'fr'));

    const ordered: string[] = [];
    for (const code of this.envCodePresetOptions) {
      if (envSet.has(code)) {
        ordered.push(code);
      }
    }
    for (const k of [...envSet].sort((a, b) => a.localeCompare(b, 'fr'))) {
      if (!ordered.includes(k)) {
        ordered.push(k);
      }
    }
    this.filterOptionsEnvCodes = ordered;
  }

  private refreshSelectionCache(): void {
    let selectableCount = 0;
    let selectedSelectable = 0;
    let duplicateCount = 0;

    for (const item of this.filteredItems) {
      if (item.isDuplicate) {
        duplicateCount++;
      }
      const canSelect = item.id != null || item.statut === 'en cours';
      if (!canSelect) {
        continue;
      }
      selectableCount++;
      if (this.selectedRowKeys.has(item.selectionKey)) {
        selectedSelectable++;
      }
    }

    this.cachedVisibleDuplicateCount = duplicateCount;
    this.allFilteredSelected = selectableCount > 0 && selectedSelectable === selectableCount;
    this.someFilteredSelected = selectedSelectable > 0 && selectedSelectable < selectableCount;
    this.selectedSavableCountCached = this.getSelectedSavableItems().length;
    this.selectedDeletableCountCached = this.getSelectedDeletableItems().length;
  }

  applyFilters(): void {
    if (this.shouldReloadSavedDataForFilters()) {
      this.loadSavedSummaryData();
      return;
    }
    this.sanitizeCascadeSelections();
    this.rebuildFilterOptionLists();
    this.filteredItems = this.summaryItems.filter(item => this.itemMatchesFilters(item));
    this.currentPage = 1;
    this.refreshFilteredTotals();
    this.updatePagination();
    this.refreshSelectionCache();
  }

  private refreshFilteredTotals(): void {
    let nombre = 0;
    let volume = 0;
    for (const item of this.filteredItems) {
      nombre += item.nombre || 0;
      volume += item.montant || 0;
    }
    this.filteredTotalNombre = nombre;
    this.filteredTotalVolume = volume;
  }

  onStatutChange(item: EcartBoSummaryItem, newStatut: 'ok' | 'en cours'): void {
    item.statut = newStatut;
    
    // Si la ligne est liée, mettre à jour aussi la ligne liée
    if (item.linkedId) {
      const linkedItem = this.summaryItems.find(i => i.id === item.linkedId);
      if (linkedItem) {
        linkedItem.statut = newStatut;
      }
    }
    
    this.cdr.markForCheck();
    // Ici vous pouvez ajouter une logique pour sauvegarder le changement si nécessaire
  }

  private normalizeSummaryEnv(env: string | undefined): 'BO' | 'PARTENAIRE' {
    const normalized = (env || '').trim().toUpperCase();
    if (normalized === 'PARTENAIRE' || normalized === 'PARTNER') {
      return 'PARTENAIRE';
    }
    return 'BO';
  }

  private normalizeSummaryStatut(statut: string | undefined): 'ok' | 'en cours' {
    return (statut || '').trim().toUpperCase() === 'OK' ? 'ok' : 'en cours';
  }

  private normalizeMatchText(value: string | undefined): string {
    return (value || '').trim().toUpperCase();
  }

  private isMultiAgenceAgence(agence: string | undefined): boolean {
    return this.normalizeMatchText(agence) === 'MULTIAGENCE';
  }

  private formatSummaryDate(value: string | undefined): string {
    if (!value) {
      return '';
    }
    const parsed = this.parseDate(String(value));
    if (!parsed) {
      return String(value);
    }
    const y = parsed.getFullYear();
    const m = String(parsed.getMonth() + 1).padStart(2, '0');
    const d = String(parsed.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  /** Format attendu par le backend (LocalDateTime sans fuseau : yyyy-MM-ddTHH:mm:ss). */
  private formatLocalDateTimeForBackend(dateStr: string): string {
    if (!dateStr || !dateStr.trim()) {
      const now = new Date();
      return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}T00:00:00`;
    }

    let trimmed = dateStr.trim().replace(/Z$/i, '').replace(/[+-]\d{2}:?\d{2}$/, '');
    trimmed = trimmed.replace(/\.\d+$/, '');

    if (trimmed.includes('T')) {
      return trimmed;
    }
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      return `${trimmed}T00:00:00`;
    }
    if (/^\d{4}-\d{2}-\d{2}\s+\d/.test(trimmed)) {
      return trimmed.replace(' ', 'T');
    }

    const parsed = this.parseDate(trimmed);
    if (parsed) {
      const y = parsed.getFullYear();
      const m = String(parsed.getMonth() + 1).padStart(2, '0');
      const d = String(parsed.getDate()).padStart(2, '0');
      return `${y}-${m}-${d}T00:00:00`;
    }

    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}T00:00:00`;
  }

  private extractHttpErrorMessage(error: any, fallback: string): string {
    const backendMessage = error?.error?.message;
    if (backendMessage && typeof backendMessage === 'string') {
      return backendMessage;
    }
    if (error?.message && typeof error.message === 'string') {
      return error.message;
    }
    return fallback;
  }

  /** Clé de dédoublonnage : date + agence + service + pays + plateforme + ENV + nombre + montant. */
  buildSummaryDuplicateKey(
    item: Pick<EcartBoSummaryItem, 'date' | 'agence' | 'service' | 'pays' | 'nombre' | 'montant' | 'env' | 'envCode'>,
    dateOverride?: string
  ): string {
    const dateKey = this.toSummaryDayKey(dateOverride ?? item.date);
    const env = (item.env || 'BO').toUpperCase();
    const envCode = (item.envCode || '').trim().toUpperCase();
    const montant = Number.isFinite(item.montant) ? item.montant.toFixed(2) : '0.00';
    return [
      dateKey,
      (item.agence || '').trim(),
      (item.service || '').trim(),
      (item.pays || '').trim(),
      env,
      envCode,
      String(item.nombre ?? 0),
      montant
    ].join('|');
  }

  private toSummaryDayKey(dateStr: string): string {
    const parsed = this.parseDate(dateStr);
    if (parsed) {
      const y = parsed.getFullYear();
      const m = String(parsed.getMonth() + 1).padStart(2, '0');
      const d = String(parsed.getDate()).padStart(2, '0');
      return `${y}-${m}-${d}`;
    }
    return (dateStr || '').trim().slice(0, 10);
  }

  /** Marque ou retire les doublons dans la liste affichée. */
  private markAndFilterDuplicateSummaryItems(removeDuplicates: boolean): number {
    const seen = new Map<string, EcartBoSummaryItem>();
    let duplicateCount = 0;
    const nextItems: EcartBoSummaryItem[] = [];

    for (const item of this.summaryItems) {
      const key = this.buildSummaryDuplicateKey(item);
      if (seen.has(key)) {
        duplicateCount += 1;
        const reference = seen.get(key)!;
        const hint = `Doublon de : ${this.formatSummaryItemDuplicateLine(reference)}`;
        if (removeDuplicates) {
          continue;
        }
        nextItems.push({ ...item, isDuplicate: true, duplicateHint: hint });
        continue;
      }
      seen.set(key, item);
      nextItems.push({ ...item, isDuplicate: false, duplicateHint: undefined });
    }

    if (removeDuplicates && duplicateCount > 0) {
      this.summaryItems = nextItems;
      // Purger les sélections devenues invalides (lignes doublons supprimées) pour ne pas
      // conserver de clés de sélection référant à des lignes retirées de la liste.
      if (this.selectedRowKeys.size > 0) {
        const validKeys = new Set(this.summaryItems.map(i => i.selectionKey));
        for (const key of Array.from(this.selectedRowKeys)) {
          if (!validKeys.has(key)) {
            this.selectedRowKeys.delete(key);
          }
        }
      }
    } else if (!removeDuplicates) {
      this.summaryItems = nextItems;
    }

    this.refreshDuplicateBannerState();
    return duplicateCount;
  }

  /** Nombre de doublons visibles après filtrage. */
  get visibleDuplicateCount(): number {
    return this.cachedVisibleDuplicateCount;
  }

  getDuplicateCriteriaText(): string {
    return 'date, agence, service, pays, plateforme (BO/Partenaire), ENV, nombre de transactions et montant total';
  }

  private getDuplicateCriteriaBullets(): string {
    return [
      '• Date de transaction',
      '• Agence, service et pays',
      '• Plateforme (BO / Partenaire) et ENV',
      '• Nombre de transactions et montant total'
    ].join('\n');
  }

  formatSummaryItemDuplicateLine(item: Pick<EcartBoSummaryItem, 'date' | 'agence' | 'service' | 'pays' | 'nombre' | 'montant' | 'env' | 'envCode'>): string {
    const date = this.formatSummaryDate(item.date) || item.date || '—';
    const env = item.env || 'BO';
    const envCode = item.envCode?.trim() ? ` / ${item.envCode.trim()}` : '';
    const montant = Number.isFinite(item.montant) ? item.montant.toLocaleString('fr-FR') : '0';
    return `${date} · ${item.agence || '—'} · ${item.service || '—'} · ${item.pays || '—'} · ${env}${envCode} · ${item.nombre ?? 0} trx · ${montant}`;
  }

  private formatDuplicateRecordSummary(dup: {
    agence?: string;
    service?: string;
    pays?: string;
    dateTransaction?: string;
    nombreTransactions?: number;
    montant?: number;
    env?: string;
    envCode?: string | null;
    idExistant?: number | null;
    message?: string;
  }): string {
    const line = this.formatSummaryItemDuplicateLine({
      date: dup.dateTransaction || '',
      agence: String(dup.agence || ''),
      service: String(dup.service || ''),
      pays: String(dup.pays || ''),
      nombre: Number(dup.nombreTransactions || 0),
      montant: Number(dup.montant || 0),
      env: (dup.env as 'BO' | 'PARTENAIRE') || 'BO',
      envCode: dup.envCode != null ? String(dup.envCode) : undefined
    });

    if (dup.message?.includes('lot envoyé')) {
      return `Doublon dans votre sélection — ${line}`;
    }
    if (dup.idExistant) {
      return `Déjà enregistré (n° ${dup.idExistant}) — ${line}`;
    }
    return line;
  }

  private refreshDuplicateBannerState(): void {
    const duplicates = this.summaryItems.filter(item => item.isDuplicate);
    this.duplicateBannerLines = duplicates
      .slice(0, 5)
      .map(item => this.formatSummaryItemDuplicateLine(item));
    if (duplicates.length > 5) {
      this.duplicateBannerLines.push(`… et ${duplicates.length - 5} autre(s) doublon(s) dans la liste.`);
    }
  }

  private showDuplicateConflictPopup(
    existing: EcartBoSummaryItem,
    action: 'ajout' | 'modification'
  ): void {
    void this.popupService.showWarning(
      `Impossible de ${action === 'ajout' ? 'ajouter' : 'enregistrer'} cette ligne : ` +
      `une entrée identique existe déjà.\n\n` +
      `Ligne en conflit :\n${this.formatSummaryItemDuplicateLine(existing)}\n\n` +
      `Un doublon correspond à la même combinaison :\n${this.getDuplicateCriteriaBullets()}`,
      'Doublon détecté'
    );
  }

  private findDuplicateSummaryItem(
    candidate: Pick<EcartBoSummaryItem, 'date' | 'agence' | 'service' | 'pays' | 'nombre' | 'montant' | 'env' | 'envCode' | 'id'>,
    dateOverride?: string
  ): EcartBoSummaryItem | undefined {
    const key = this.buildSummaryDuplicateKey(candidate, dateOverride);
    return this.summaryItems.find(item => {
      if (candidate.id != null && item.id === candidate.id) {
        return false;
      }
      return this.buildSummaryDuplicateKey(item, dateOverride) === key;
    });
  }

  private datesWithinLinkWindow(dateA: string, dateB: string): boolean {
    const parsedA = this.parseDate(dateA);
    const parsedB = this.parseDate(dateB);
    if (!parsedA || !parsedB) {
      return false;
    }
    const diff = Math.abs(this.getCalendarDay(parsedA) - this.getCalendarDay(parsedB));
    return diff <= 1;
  }

  /** Agrégat multiAgence : la date BO est le jour Partenaire ou J+1 (pas J-1). */
  private boDateMatchesPartenaireAggregate(partenaireDate: string, boDate: string): boolean {
    const parsedPartner = this.parseDate(partenaireDate);
    const parsedBo = this.parseDate(boDate);
    if (!parsedPartner || !parsedBo) {
      return false;
    }
    const diff = this.getCalendarDay(parsedBo) - this.getCalendarDay(parsedPartner);
    return diff >= 0 && diff <= 1;
  }

  private envCodesMatch(itemA: EcartBoSummaryItem, itemB: EcartBoSummaryItem): boolean {
    const codeA = (itemA.envCode || '').trim();
    const codeB = (itemB.envCode || '').trim();
    if (!codeA || !codeB) {
      return true;
    }
    return normalizeReconciliationReportEnv(codeA) === normalizeReconciliationReportEnv(codeB);
  }

  private findSubsetMatchingMontant(
    candidates: EcartBoSummaryItem[],
    targetMontant: number,
    targetNombre?: number
  ): EcartBoSummaryItem[] | null {
    if (candidates.length === 0) {
      return null;
    }
    const target = Math.round((targetMontant ?? 0) * 100);
    const amounts = candidates.map(c => Math.round((c.montant ?? 0) * 100));
    const hasNombreTarget = targetNombre != null;
    const nombres = candidates.map(c => c.nombre ?? 0);

    if (candidates.length <= 22) {
      const totalMasks = 1 << candidates.length;
      for (let mask = 1; mask < totalMasks; mask++) {
        let sum = 0;
        let nombreSum = 0;
        const subset: EcartBoSummaryItem[] = [];
        for (let i = 0; i < candidates.length; i++) {
          if (mask & (1 << i)) {
            sum += amounts[i];
            nombreSum += nombres[i];
            subset.push(candidates[i]);
          }
        }
        if (sum === target && (!hasNombreTarget || nombreSum === targetNombre)) {
          return subset;
        }
      }
      return null;
    }

    const fullSum = amounts.reduce((acc, value) => acc + value, 0);
    const fullNombre = nombres.reduce((acc, value) => acc + value, 0);
    const nombreOk = !hasNombreTarget || fullNombre === targetNombre;
    return fullSum === target && nombreOk ? candidates : null;
  }

  private linkMultiAgenceAggregate(
    partenaireItem: EcartBoSummaryItem,
    matchingBoItems: EcartBoSummaryItem[],
    itemsToUpdate: EcartBoSummaryItem[],
    linkedPartners: Set<EcartBoSummaryItem>,
    linkedBos: Set<EcartBoSummaryItem>,
    usedBoItemIds: Set<number>,
    usedBoItemRefs: Set<EcartBoSummaryItem>
  ): void {
    const linkToken = this.resolveLinkToken(partenaireItem, ...matchingBoItems);
    partenaireItem.token = linkToken;
    if (partenaireItem.statut !== 'ok') {
      partenaireItem.statut = 'ok';
    }
    this.markItemLinkChange(partenaireItem, itemsToUpdate, true);
    linkedPartners.add(partenaireItem);

    for (const boItem of matchingBoItems) {
      boItem.token = linkToken;
      boItem.linkedId = partenaireItem.id;
      if (boItem.statut !== 'ok') {
        boItem.statut = 'ok';
      }
      this.markItemLinkChange(boItem, itemsToUpdate, true);
      linkedBos.add(boItem);
      if (boItem.id) {
        usedBoItemIds.add(boItem.id);
      } else {
        usedBoItemRefs.add(boItem);
      }
    }
    partenaireItem.linkedId = matchingBoItems.find(b => b.id)?.id;
  }

  private servicePaysMatch(itemA: EcartBoSummaryItem, itemB: EcartBoSummaryItem): boolean {
    return (
      this.normalizeMatchText(itemA.service) === this.normalizeMatchText(itemB.service) &&
      this.normalizeMatchText(itemA.pays) === this.normalizeMatchText(itemB.pays)
    );
  }

  private businessKeysMatch(itemA: EcartBoSummaryItem, itemB: EcartBoSummaryItem): boolean {
    return (
      this.servicePaysMatch(itemA, itemB) &&
      itemA.nombre === itemB.nombre &&
      this.amountsEqual(itemA.montant, itemB.montant)
    );
  }

  private agencesCompatible(itemA: EcartBoSummaryItem, itemB: EcartBoSummaryItem): boolean {
    if (this.normalizeMatchText(itemA.agence) === this.normalizeMatchText(itemB.agence)) {
      return true;
    }
    return this.isMultiAgenceAgence(itemA.agence) || this.isMultiAgenceAgence(itemB.agence);
  }

  private resolveLinkToken(...items: EcartBoSummaryItem[]): string {
    const tokens = items
      .map(item => (item.token || '').trim())
      .filter(token => token.length > 0);
    if (tokens.length > 0) {
      const stableToken = tokens.find(token => !token.startsWith('LINK-'));
      return stableToken || tokens[0];
    }
    const ids = items.map(item => item.id ?? 'x').join('-');
    return `LINK-${Date.now()}-${ids}`;
  }

  private markItemLinkChange(
    item: EcartBoSummaryItem,
    itemsToUpdate: EcartBoSummaryItem[],
    force = false
  ): void {
    if (!item.id) {
      return;
    }
    const itemAny: any = item as any;
    const changed =
      itemAny.__originalStatut !== item.statut || itemAny.__originalToken !== item.token;
    if (!force && !changed) {
      return;
    }
    if (!itemsToUpdate.some(row => row.id === item.id)) {
      itemsToUpdate.push(item);
    }
  }

  /** Si une correspondance BO/Partenaire existe, les deux lignes doivent être à OK. */
  private ensureOkStatusWhenCorrespondenceExists(itemsToUpdate: EcartBoSummaryItem[]): void {
    const promote = (item: EcartBoSummaryItem, force = false) => {
      if (item.statut !== 'ok') {
        item.statut = 'ok';
      }
      this.markItemLinkChange(item, itemsToUpdate, force);
    };

    for (const item of this.summaryItems) {
      if (item.linkedId) {
        const linked = this.summaryItems.find(row => row.id === item.linkedId);
        if (linked) {
          promote(item, true);
          promote(linked, true);
        }
      }
    }

    const tokenGroups = new Map<string, EcartBoSummaryItem[]>();
    for (const item of this.summaryItems) {
      const token = (item.token || '').trim();
      if (!token) {
        continue;
      }
      if (!tokenGroups.has(token)) {
        tokenGroups.set(token, []);
      }
      tokenGroups.get(token)!.push(item);
    }

    for (const group of tokenGroups.values()) {
      const hasBo = group.some(row => this.normalizeSummaryEnv(row.env) === 'BO');
      const hasPartner = group.some(row => this.normalizeSummaryEnv(row.env) === 'PARTENAIRE');
      if (hasBo && hasPartner) {
        group.forEach(row => promote(row, true));
      }
    }
  }

  private applyLinkToPair(
    itemA: EcartBoSummaryItem,
    itemB: EcartBoSummaryItem,
    linkToken: string,
    itemsToUpdate: EcartBoSummaryItem[]
  ): void {
    itemA.linkedId = itemB.id;
    itemB.linkedId = itemA.id;
    itemA.token = linkToken;
    itemB.token = linkToken;
    if (itemA.statut !== 'ok') {
      itemA.statut = 'ok';
    }
    if (itemB.statut !== 'ok') {
      itemB.statut = 'ok';
    }
    this.markItemLinkChange(itemA, itemsToUpdate, true);
    this.markItemLinkChange(itemB, itemsToUpdate, true);
  }

  private itemMatchesTokenFilter(item: EcartBoSummaryItem, tokenTerm: string): boolean {
    const term = tokenTerm.toLowerCase();
    if ((item.token || '').toLowerCase().includes(term)) {
      return true;
    }
    const carriers = this.summaryItems.filter(row => (row.token || '').toLowerCase().includes(term));
    return carriers.some(carrier => this.areLinkedCounterparts(carrier, item));
  }

  private areLinkedCounterparts(itemA: EcartBoSummaryItem, itemB: EcartBoSummaryItem): boolean {
    if (itemA === itemB) {
      return true;
    }
    if (itemA.id && itemB.linkedId === itemA.id) {
      return true;
    }
    if (itemB.id && itemA.linkedId === itemB.id) {
      return true;
    }
    const envA = this.normalizeSummaryEnv(itemA.env);
    const envB = this.normalizeSummaryEnv(itemB.env);
    if (envA === envB) {
      return false;
    }
    return (
      this.businessKeysMatch(itemA, itemB) &&
      this.agencesCompatible(itemA, itemB) &&
      this.datesWithinLinkWindow(itemA.date, itemB.date)
    );
  }

  private persistStatusLinkUpdates(items: EcartBoSummaryItem[]): void {
    if (!this.savedDataMode || this.isPersistingLinks) {
      return;
    }
    const uniqueById = new Map<number, EcartBoSummaryItem>();
    for (const item of items) {
      if (item.id) {
        uniqueById.set(item.id, item);
      }
    }
    if (uniqueById.size === 0) {
      return;
    }

    const changedItems = [...uniqueById.values()].filter(item => {
      const itemAny = item as any;
      return itemAny.__originalStatut !== item.statut || itemAny.__originalToken !== item.token;
    });
    if (changedItems.length === 0) {
      return;
    }

    const payload = changedItems.map(item => {
      const row: {
        id: number;
        statut: string;
        env: string;
        token?: string;
        envCode?: string;
      } = {
        id: item.id!,
        statut: item.statut === 'ok' ? 'OK' : 'EN_COURS',
        env: item.env || 'BO'
      };
      if (item.token != null && String(item.token).trim() !== '') {
        row.token = String(item.token).trim();
      }
      if (item.envCode != null && String(item.envCode).trim() !== '') {
        row.envCode = String(item.envCode).trim();
      }
      return row;
    });

    this.isPersistingLinks = true;
    this.subscription.add(
      this.ecartBoSummaryService.applyStatusLinkUpdates(payload).pipe(
        finalize(() => {
          this.isPersistingLinks = false;
          this.cdr.markForCheck();
        })
      ).subscribe({
        next: () => {
          uniqueById.forEach(item => {
            const itemAny: any = item as any;
            itemAny.__originalStatut = item.statut;
            itemAny.__originalToken = item.token;
          });
        },
        error: (err) => {
          console.error('Erreur lors de la persistance des liaisons BO/Partenaire:', err);
        }
      })
    );
  }

  /**
   * Lie les paires BO/Partenaire (même service/pays/nombre/volume, dates à ≤1 jour),
   * propage le token existant côté BO et passe le statut à OK.
   */
  linkMatchingPairs(persist = false): void {
    const itemsToUpdate: EcartBoSummaryItem[] = [];

    // Réinitialiser les liens mémoire avant recalcul
    for (const item of this.summaryItems) {
      item.linkedId = undefined;
    }

    let hasBo = false;
    let hasPartner = false;
    for (const item of this.summaryItems) {
      const env = this.normalizeSummaryEnv(item.env);
      if (env === 'BO') {
        hasBo = true;
      } else if (env === 'PARTENAIRE') {
        hasPartner = true;
      }
      if (hasBo && hasPartner) {
        break;
      }
    }
    if (!hasBo || !hasPartner) {
      return;
    }

    // Étape 1 : paires 1-1 (même agence ou multiAgence impliqué)
    type IndexedItem = { item: EcartBoSummaryItem; index: number };
    const bucketKey = (item: EcartBoSummaryItem): string => {
      const montantKey = Math.round((item.montant ?? 0) * 100);
      const core = `${this.normalizeMatchText(item.service)}|${this.normalizeMatchText(item.pays)}|${item.nombre}|${montantKey}`;
      if (this.isMultiAgenceAgence(item.agence)) {
        return `multi|${core}`;
      }
      return `${this.normalizeMatchText(item.agence)}|${core}`;
    };

    const buckets = new Map<string, IndexedItem[]>();
    for (let idx = 0; idx < this.summaryItems.length; idx++) {
      const item = this.summaryItems[idx];
      if (!item.env) {
        continue;
      }
      const key = bucketKey(item);
      if (!buckets.has(key)) {
        buckets.set(key, []);
      }
      buckets.get(key)!.push({ item, index: idx });
    }

    const linkedPartners = new Set<EcartBoSummaryItem>();
    const linkedBos = new Set<EcartBoSummaryItem>();

    for (const group of buckets.values()) {
      if (group.length < 2) {
        continue;
      }
      group.sort((a, b) => a.index - b.index);
      for (let a = 0; a < group.length; a++) {
        const item1 = group[a].item;
        if (linkedPartners.has(item1) || linkedBos.has(item1)) {
          continue;
        }
        const env1 = this.normalizeSummaryEnv(item1.env);
        for (let b = a + 1; b < group.length; b++) {
          const item2 = group[b].item;
          if (linkedPartners.has(item2) || linkedBos.has(item2)) {
            continue;
          }
          const env2 = this.normalizeSummaryEnv(item2.env);
          if (env1 === env2) {
            continue;
          }
          const boItem = env1 === 'BO' ? item1 : item2;
          const partnerItem = env1 === 'PARTENAIRE' ? item1 : item2;
          if (
            this.businessKeysMatch(item1, item2) &&
            this.agencesCompatible(item1, item2) &&
            this.datesWithinLinkWindow(item1.date, item2.date)
          ) {
            const linkToken = this.resolveLinkToken(boItem, partnerItem);
            this.applyLinkToPair(item1, item2, linkToken, itemsToUpdate);
            linkedPartners.add(partnerItem);
            linkedBos.add(boItem);
            break;
          }
        }
      }
    }

    // Étape 2 : multiAgence — une ligne Partenaire peut correspondre à plusieurs lignes BO
    const usedBoItemIds = new Set<number>();
    const usedBoItemRefs = new Set<EcartBoSummaryItem>();

    for (const partenaireItem of this.summaryItems) {
      if (linkedPartners.has(partenaireItem) || this.normalizeSummaryEnv(partenaireItem.env) !== 'PARTENAIRE') {
        continue;
      }

      const isMultiAgence = this.isMultiAgenceAgence(partenaireItem.agence);
      const candidates: EcartBoSummaryItem[] = [];

      for (const boItem of this.summaryItems) {
        const boAlreadyUsed = boItem.id ? usedBoItemIds.has(boItem.id) : usedBoItemRefs.has(boItem);
        if (
          linkedBos.has(boItem) ||
          this.normalizeSummaryEnv(boItem.env) !== 'BO' ||
          boAlreadyUsed
        ) {
          continue;
        }

        if (!this.servicePaysMatch(boItem, partenaireItem) || !this.envCodesMatch(boItem, partenaireItem)) {
          continue;
        }

        const dateMatches = isMultiAgence
          ? this.boDateMatchesPartenaireAggregate(partenaireItem.date, boItem.date)
          : this.datesWithinLinkWindow(partenaireItem.date, boItem.date);

        if (dateMatches) {
          candidates.push(boItem);
        }
      }

      let matchingBoItems: EcartBoSummaryItem[] | null = null;

      if (isMultiAgence) {
        const candidatesSum = candidates.reduce((sum, row) => sum + (row.montant ?? 0), 0);
        const candidatesNombre = candidates.reduce((sum, row) => sum + (row.nombre ?? 0), 0);
        if (
          candidates.length > 0 &&
          this.amountsEqual(candidatesSum, partenaireItem.montant) &&
          candidatesNombre === partenaireItem.nombre
        ) {
          matchingBoItems = candidates;
        } else {
          matchingBoItems = this.findSubsetMatchingMontant(
            candidates,
            partenaireItem.montant,
            partenaireItem.nombre
          );
        }
      } else if (candidates.length === 1) {
        const bo = candidates[0];
        if (
          bo.nombre === partenaireItem.nombre &&
          this.amountsEqual(bo.montant, partenaireItem.montant)
        ) {
          matchingBoItems = candidates;
        }
      }

      if (matchingBoItems && matchingBoItems.length > 0) {
        this.linkMultiAgenceAggregate(
          partenaireItem,
          matchingBoItems,
          itemsToUpdate,
          linkedPartners,
          linkedBos,
          usedBoItemIds,
          usedBoItemRefs
        );
      }
    }

    this.ensureOkStatusWhenCorrespondenceExists(itemsToUpdate);

    if (itemsToUpdate.length > 0) {
      itemsToUpdate.forEach(item => {
        const itemAny: any = item as any;
        if (!persist) {
          itemAny.__originalStatut = item.statut;
          itemAny.__originalToken = item.token;
        }
      });
      if (persist) {
        this.persistStatusLinkUpdates(itemsToUpdate);
      }
    }
    this.cdr.markForCheck();
  }

  /**
   * Parse une date depuis différents formats
   */
  private parseDate(dateStr: string): Date | null {
    if (!dateStr) return null;
    
    try {
      // Essayer différents formats
      if (dateStr.includes('T')) {
        return new Date(dateStr);
      }
      
      // Format YYYY-MM-DD
      if (/^\d{4}-\d{2}-\d{2}/.test(dateStr)) {
        return new Date(dateStr);
      }
      
      // Format avec heures
      if (dateStr.includes(' ')) {
        return new Date(dateStr.replace(' ', 'T'));
      }
      
      return new Date(dateStr);
    } catch (e) {
      console.error('Erreur lors du parsing de la date:', dateStr, e);
      return null;
    }
  }

  /**
   * Obtient le numéro du jour calendaire (nombre de jours depuis l'époque)
   * Utilisé pour comparer les dates en jours calendaires plutôt qu'en heures
   */
  private getCalendarDay(date: Date): number {
    // Créer une date à minuit pour normaliser
    const normalizedDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    // Retourner le nombre de jours depuis l'époque (1er janvier 1970)
    return Math.floor(normalizedDate.getTime() / (1000 * 60 * 60 * 24));
  }

  /** Comparaison stricte des volumes (montants) : égalité après arrondi à 2 décimales (évite les erreurs de flottants / parsing). */
  private amountsEqual(a: number | undefined, b: number | undefined): boolean {
    const round2 = (n: number) => Math.round(n * 100) / 100;
    return round2(a ?? 0) === round2(b ?? 0);
  }

  getPagedItems(): EcartBoSummaryItem[] {
    return this.pagedItems;
  }

  updatePagination(): void {
    this.totalPages = Math.max(1, Math.ceil(this.filteredItems.length / this.pageSize));
    if (this.currentPage > this.totalPages) {
      this.currentPage = this.totalPages;
    }
    if (this.currentPage < 1) {
      this.currentPage = 1;
    }
    const start = (this.currentPage - 1) * this.pageSize;
    this.pagedItems = this.filteredItems.slice(start, start + this.pageSize);
  }

  prevPage(): void {
    if (this.currentPage > 1) {
      this.currentPage--;
      this.updatePagination();
      this.cdr.markForCheck();
    }
  }

  nextPage(): void {
    if (this.currentPage < this.totalPages) {
      this.currentPage++;
      this.updatePagination();
      this.cdr.markForCheck();
    }
  }

  goToPage(page: number): void {
    if (page >= 1 && page <= this.totalPages) {
      this.currentPage = page;
      this.updatePagination();
      this.cdr.markForCheck();
    }
  }

  getPageNumbers(): number[] {
    const pages: number[] = [];
    const maxVisible = 5;
    
    if (this.totalPages <= maxVisible) {
      for (let i = 1; i <= this.totalPages; i++) {
        pages.push(i);
      }
    } else {
      let start = Math.max(1, this.currentPage - 2);
      let end = Math.min(this.totalPages, start + maxVisible - 1);
      
      if (end - start < maxVisible - 1) {
        start = Math.max(1, end - maxVisible + 1);
      }
      
      for (let i = start; i <= end; i++) {
        pages.push(i);
      }
    }
    
    return pages;
  }

  onPageSizeChange(): void {
    this.currentPage = 1;
    this.updatePagination();
    this.cdr.markForCheck();
  }

  // Exposer Math pour le template
  Math = Math;

  /**
   * Calcule le total de la colonne "nombre" pour les items filtrés
   */
  getTotalNombre(): number {
    return this.filteredTotalNombre;
  }

  /**
   * Calcule le total de la colonne "volume" pour les items filtrés
   */
  getTotalVolume(): number {
    return this.filteredTotalVolume;
  }

  clearFilters(): void {
    this.searchKey = '';
    this.selectedAgence = '';
    this.selectedService = '';
    this.selectedPays = '';
    this.selectedStatut = '';
    this.selectedEnv = '';
    this.selectedEnvCode = '';
    this.selectedDateFrom = '';
    this.selectedDateTo = '';
    this.selectedToken = '';
    this.applyFilters();
  }

  goBack(): void {
    this.router.navigate(['/ecart-bo']);
  }

  getStatutClass(statut: string): string {
    return statut === 'ok' ? 'statut-ok' : 'statut-en-cours';
  }

  /**
   * Affiche uniquement la partie timestamp du token (ex. LINK-1769214369692-1-2 → 1769214369692).
   * Si le token n'est pas au format LINK-*, on affiche le token complet.
   */
  getTokenDisplay(token: string | undefined): string {
    if (!token || !token.trim()) return '-';
    const t = token.trim();
    if (t.startsWith('LINK-')) {
      const parts = t.split('-');
      return parts[1] ?? t;
    }
    return t;
  }

  openEditModal(item: EcartBoSummaryItem): void {
    this.editingItem = item;
    this.editForm = {
      date: item.date || '',
      agence: item.agence || '',
      service: item.service || '',
      pays: item.pays || '',
      nombre: item.nombre || 0,
      volume: item.montant || 0,
      statut: item.statut || 'en cours',
      env: item.env || 'BO',
      envCode: item.envCode || '',
      token: item.token || ''
    };
    this.showEditModal = true;
    this.cdr.markForCheck();
  }

  closeEditModal(): void {
    this.showEditModal = false;
    this.editingItem = null;
    this.editForm = { date: '', agence: '', service: '', pays: '', nombre: 0, volume: 0, statut: 'en cours', env: 'BO', envCode: '', token: '' };
    this.cdr.markForCheck();
  }

  async updateItem(): Promise<void> {
    if (!this.editingItem) {
      return;
    }

    // Validation
    if (!this.editForm.agence || !this.editForm.service || !this.editForm.pays) {
      this.popupService.showWarning('❌ Veuillez remplir tous les champs obligatoires.');
      return;
    }

    this.isUpdating = true;
    this.cdr.markForCheck();

    try {
      // Si c'est un item sauvegardé (avec ID), mettre à jour via l'API
      if (this.editingItem.id) {
        const updatedData: any = {
          dateTransaction: this.formatLocalDateTimeForBackend(this.editForm.date),
          agence: this.editForm.agence,
          service: this.editForm.service,
          pays: this.editForm.pays,
          nombreTransactions: this.editForm.nombre,
          montantTotal: this.editForm.volume || 0,
          statut: this.editForm.statut === 'ok' ? 'OK' : 'EN_COURS',
          env: this.editForm.env || 'BO',
          envCode: this.editForm.envCode != null && this.editForm.envCode.trim() !== ''
            ? this.editForm.envCode.trim()
            : null
        };
        if (this.editForm.token !== undefined) {
          updatedData.token = this.editForm.token && this.editForm.token.trim() ? this.editForm.token.trim() : null;
        }

        const duplicate = this.findDuplicateSummaryItem(
          {
            id: this.editingItem.id,
            date: this.editForm.date,
            agence: this.editForm.agence,
            service: this.editForm.service,
            pays: this.editForm.pays,
            nombre: this.editForm.nombre,
            montant: this.editForm.volume || 0,
            env: this.editForm.env,
            envCode: this.editForm.envCode
          },
          this.editForm.date
        );
        if (duplicate) {
          this.showDuplicateConflictPopup(duplicate, 'modification');
          this.isUpdating = false;
          this.cdr.markForCheck();
          return;
        }

        const updated = await firstValueFrom(this.ecartBoSummaryService.updateEcartBoSummary(this.editingItem.id, updatedData));
        
        this.editingItem.date = updated.dateTransaction || this.editForm.date;
        this.editingItem.agence = updated.agence || this.editForm.agence;
        this.editingItem.service = updated.service || this.editForm.service;
        this.editingItem.pays = updated.pays || this.editForm.pays;
        this.editingItem.nombre = updated.nombreTransactions || this.editForm.nombre;
        this.editingItem.montant = updated.montantTotal || this.editForm.volume || 0;
        this.editingItem.statut = (updated.statut === 'OK' ? 'ok' : 'en cours') as 'ok' | 'en cours';
        this.editingItem.token = updated.token || undefined;
        this.editingItem.envCode =
          updated.envCode != null && String(updated.envCode).trim() !== ''
            ? String(updated.envCode).trim()
            : undefined;
        
        // Mettre à jour aussi dans summaryItems
        const index = this.summaryItems.findIndex(item => item.id === this.editingItem!.id);
        if (index >= 0) {
          this.summaryItems[index] = { ...this.editingItem };
        }
        
        // Vérifier si la ligne modifiée peut être liée à une autre
        this.linkMatchingPairs(this.savedDataMode);
        this.refreshUniqueEnvCodes();
      } else {
        // Si c'est un item non sauvegardé (données de réconciliation), mettre à jour localement
        this.editingItem.date = this.editForm.date;
        this.editingItem.agence = this.editForm.agence;
        this.editingItem.service = this.editForm.service;
        this.editingItem.pays = this.editForm.pays;
        this.editingItem.nombre = this.editForm.nombre;
        this.editingItem.montant = this.editForm.volume || 0;
        this.editingItem.statut = this.editForm.statut;
        this.editingItem.env = this.editForm.env;
        this.editingItem.envCode =
          this.editForm.envCode != null && this.editForm.envCode.trim() !== ''
            ? this.editForm.envCode.trim()
            : undefined;
        
        // Vérifier si la ligne modifiée peut être liée à une autre
        this.linkMatchingPairs(false);
        
        // Mettre à jour aussi dans summaryItems
        const index = this.summaryItems.findIndex(item => 
          item.agence === this.editingItem!.agence && 
          item.service === this.editingItem!.service && 
          item.pays === this.editingItem!.pays &&
          !item.id
        );
        if (index >= 0) {
          this.summaryItems[index] = { ...this.editingItem };
        }
        this.refreshUniqueEnvCodes();
      }
      
      // Réappliquer les filtres après modification
      this.applyFilters();

      this.popupService.showSuccess('✅ Ligne modifiée avec succès !');
      this.closeEditModal();
    } catch (error: any) {
      console.error('Erreur lors de la modification:', error);
      this.popupService.showError(
        `❌ Erreur: ${this.extractHttpErrorMessage(error, 'Erreur inconnue lors de la modification')}`
      );
    } finally {
      this.isUpdating = false;
      this.cdr.markForCheck();
    }
  }

  async saveData(): Promise<void> {
    const selectedSavableItems = this.getSelectedSavableItems();
    const hasSelection = this.selectedRowKeys.size > 0;
    const currentPageSavableItems = this.getPagedItems().filter(item => !item.id);
    const itemsToSave = selectedSavableItems.length > 0 ? selectedSavableItems : currentPageSavableItems;
    const saveScopeLabel = selectedSavableItems.length > 0 ? 'sélectionnée(s)' : 'affichée(s) sur la page courante';

    if (hasSelection && selectedSavableItems.length === 0) {
      this.popupService.showWarning('❌ La sélection en cours ne contient aucune ligne à enregistrer.');
      return;
    }

    if (itemsToSave.length === 0) {
      this.popupService.showWarning('❌ Aucune ligne non enregistrée à sauvegarder.');
      return;
    }

    // Date par défaut : J-1 (hier)
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const defaultDate = yesterday.toISOString().split('T')[0];
    
    const selectedDate = await this.popupService.showDateInput(
      `Veuillez sélectionner la date à appliquer aux ${itemsToSave.length} ligne(s) ${saveScopeLabel} :`,
      'Sélection de la date pour la sauvegarde',
      defaultDate
    );

    if (!selectedDate) {
      return;
    }

    const confirmed = await this.popupService.showConfirm(
      `📋 ${itemsToSave.length} ligne(s) ${saveScopeLabel} seront sauvegardées avec la date ${selectedDate}. Continuer ?`,
      'Confirmation de sauvegarde'
    );

    if (!confirmed) return;

    const batchKeys = new Set<string>();
    const dedupedItemsToSave: EcartBoSummaryItem[] = [];
    let inBatchDuplicates = 0;
    for (const item of itemsToSave) {
      const key = this.buildSummaryDuplicateKey({ ...item, date: selectedDate });
      if (batchKeys.has(key)) {
        inBatchDuplicates += 1;
        continue;
      }
      batchKeys.add(key);
      dedupedItemsToSave.push(item);
    }

    if (inBatchDuplicates > 0) {
      const proceedWithDedup = await this.popupService.showConfirm(
        `${inBatchDuplicates} doublon(s) dans votre sélection.\n\n` +
        `Deux lignes sont considérées identiques si elles ont la même ${this.getDuplicateCriteriaText()}.\n\n` +
        `Seules ${dedupedItemsToSave.length} ligne(s) unique(s) seront envoyées à la sauvegarde. Continuer ?`,
        'Doublons dans la sélection'
      );
      if (!proceedWithDedup) {
        return;
      }
    }

    if (dedupedItemsToSave.length === 0) {
      await this.popupService.showWarning(
        `Toutes les lignes sélectionnées sont des doublons.\n\n` +
        `Critères : ${this.getDuplicateCriteriaText()}.\n\n` +
        `Modifiez ou supprimez les lignes en double avant de sauvegarder.`,
        'Aucune ligne unique à enregistrer'
      );
      return;
    }

    this.isSaving = true;
    this.cdr.markForCheck();

    try {
      // Préparer les données regroupées par agence + service + pays pour la sauvegarde
      const serviceSummaryData = dedupedItemsToSave.map((item) => ({
        agence: item.agence,
        service: item.service,
        pays: item.pays,
        montant: item.montant, // Montant total
        date: item.date,
        statut: item.statut === 'ok' ? 'OK' : 'EN_COURS',
        nombreTransactions: item.nombre, // Nombre de lignes/transactions
        env: item.env || 'BO',
        ...(item.token != null && String(item.token).trim() !== ''
          ? { token: String(item.token).trim() }
          : {}),
        ...(item.envCode != null && String(item.envCode).trim() !== ''
          ? { envCode: String(item.envCode).trim() }
          : {})
      }));

      if (serviceSummaryData.length === 0) {
        this.popupService.showWarning('❌ Aucune donnée valide trouvée pour la sauvegarde.');
        return;
      }

      // Fonction pour formater la date au format ISO
      const formatDateForBackend = (dateStr: string): string => {
        if (!dateStr) return new Date().toISOString();
        
        // Si la date contient déjà des caractères de format date (tirets, T, espaces suivis de chiffres)
        if (dateStr.includes('-') || dateStr.includes('T') || /\d{4}/.test(dateStr)) {
          // Si la date est déjà au format ISO, la retourner
          if (dateStr.includes('T')) return dateStr;
          
          // Convertir le format "2025-07-09 12:40:18.0" en "2025-07-09T12:40:18"
          const cleanedDate = dateStr.replace(/\.\d+$/, ''); // Enlever les millisecondes
          return cleanedDate.replace(' ', 'T');
        }
        
        // Vérifier si c'est un numéro de série Excel pur
        const numValue = parseFloat(dateStr);
        if (!isNaN(numValue) && numValue > 0 && numValue < 100000) {
          // C'est probablement un numéro de série Excel
          const excelEpoch = new Date(1900, 0, 1).getTime();
          const millisecondsPerDay = 86400000;
          const jsDate = new Date(excelEpoch + (numValue - 2) * millisecondsPerDay);
          return jsDate.toISOString();
        }
        
        // Essayer de parser la date normalement
        const parsedDate = new Date(dateStr);
        if (!isNaN(parsedDate.getTime())) {
          return parsedDate.toISOString();
        }
        
        // Par défaut, retourner la date actuelle
        return new Date().toISOString();
      };

      // Formater les dates dans les données - utiliser la date sélectionnée pour toutes les lignes
      const formattedData = serviceSummaryData.map(item => ({
        ...item,
        date: formatDateForBackend(selectedDate) // Utiliser la date sélectionnée au lieu de item.date
      }));

      const result = await this.ecartBoSummaryService.saveEcartBoSummary(formattedData);

      const buildSaveIdentity = (payload: {
        agence: string;
        service: string;
        pays: string;
        date: string;
        nombreTransactions: number;
        montant?: number;
        env?: string;
        envCode?: string;
      }): string =>
        this.buildSummaryDuplicateKey(
          {
            date: payload.date,
            agence: payload.agence,
            service: payload.service,
            pays: payload.pays,
            nombre: payload.nombreTransactions,
            montant: payload.montant ?? 0,
            env: (payload.env as 'BO' | 'PARTENAIRE') || 'BO',
            envCode: payload.envCode
          },
          payload.date
        );

      const duplicateSignatureCounts = new Map<string, number>();
      (result.duplicateRecords || []).forEach(dup => {
        const signature = buildSaveIdentity({
          agence: String(dup.agence || ''),
          service: String(dup.service || ''),
          pays: String(dup.pays || ''),
          date: String(dup.dateTransaction || selectedDate),
          nombreTransactions: Number(dup.nombreTransactions || 0),
          montant: Number(dup.montant || 0),
          env: String(dup.env || 'BO'),
          envCode: dup.envCode != null ? String(dup.envCode) : undefined
        });
        duplicateSignatureCounts.set(signature, (duplicateSignatureCounts.get(signature) || 0) + 1);
      });

      const savedItems: EcartBoSummaryItem[] = [];
      dedupedItemsToSave.forEach((item, index) => {
        const signature = buildSaveIdentity({
          agence: formattedData[index].agence,
          service: formattedData[index].service,
          pays: formattedData[index].pays,
          date: formattedData[index].date,
          nombreTransactions: formattedData[index].nombreTransactions,
          montant: formattedData[index].montant,
          env: formattedData[index].env,
          envCode: formattedData[index].envCode
        });
        const duplicateCount = duplicateSignatureCounts.get(signature) || 0;
        if (duplicateCount > 0) {
          duplicateSignatureCounts.set(signature, duplicateCount - 1);
          return;
        }
        savedItems.push(item);
      });
      const savedSelectionKeys = new Set(savedItems.map(item => item.selectionKey));
      const keptDuplicateCount = Math.max(dedupedItemsToSave.length - savedItems.length, 0);
      
      // Construire le message de résultat avec les informations sur les doublons
      if (result.duplicates > 0) {
        let message = `${result.duplicates} doublon(s) n'ont pas été enregistrés.\n\n`;
        message += `Résumé :\n`;
        message += `  • ${savedItems.length} ligne(s) créée(s)\n`;
        message += `  • ${result.duplicates} doublon(s) refusé(s)\n`;
        if (keptDuplicateCount > 0) {
          message += `  • ${keptDuplicateCount} doublon(s) conservé(s) à l'écran\n`;
        }
        message += `\nDétail des doublons :\n`;
        (result.duplicateRecords || []).forEach((dup, index) => {
          message += `\n${index + 1}. ${this.formatDuplicateRecordSummary(dup)}`;
        });
        message += `\n\nCritères appliqués :\n${this.getDuplicateCriteriaBullets()}`;

        await this.popupService.showWarning(message, 'Doublons lors de la sauvegarde');
      } else {
        const count = savedItems.length;
        const message = `✅ ${count} ligne(s) ${saveScopeLabel} sauvegardée(s) avec succès !`;
        await this.popupService.showSuccess(message);
      }

      if (savedItems.length > 0) {
        this.summaryItems = this.summaryItems.filter(item => !savedSelectionKeys.has(item.selectionKey));
        this.refreshUniqueEnvCodes();
        this.applyFilters();
        this.loadSavedSummaryData();
      }
      savedSelectionKeys.forEach(key => this.selectedRowKeys.delete(key));

      this.cdr.markForCheck();
    } catch (error: any) {
      console.error('Erreur lors de la sauvegarde:', error);
      this.popupService.showError(`❌ Erreur: ${error.message || 'Erreur inconnue lors de la sauvegarde'}`);
    } finally {
      this.isSaving = false;
      this.cdr.markForCheck();
    }
  }

  openAddModal(): void {
    const today = new Date();
    const defaultEnv = this.ecartBoSummaryService.getDefaultEnvForAddModal();
    this.addForm = {
      date: today.toISOString().split('T')[0],
      agence: '',
      service: '',
      pays: '',
      nombre: 0,
      volume: 0,
      statut: 'en cours',
      env: defaultEnv,
      envCode: this.sessionDefaultEnvCode || '',
      token: ''
    };
    this.showAddModal = true;
    this.cdr.markForCheck();
  }

  /**
   * Ouvre le formulaire "Ajouter une nouvelle ligne" prérempli avec les données venant de /matches.
   * Le mode manuel reste disponible (l'utilisateur peut modifier avant d'ajouter).
   */
  openAddModalWithPrefill(prefill: EcartBoSummaryPrefill): void {
    const defaultEnv = this.ecartBoSummaryService.getDefaultEnvForAddModal();
    this.addForm = {
      date: prefill.date || new Date().toISOString().split('T')[0],
      agence: prefill.agence || '',
      service: prefill.service || '',
      pays: prefill.pays || '',
      nombre: prefill.nombre ?? 0,
      volume: prefill.volume ?? 0,
      statut: 'en cours',
      env: defaultEnv,
      envCode: this.sessionDefaultEnvCode || '',
      token: ''
    };
    this.showAddModal = true;
    this.cdr.markForCheck();
  }

  closeAddModal(): void {
    this.showAddModal = false;
    const defaultEnv = this.ecartBoSummaryService.getDefaultEnvForAddModal();
    this.addForm = {
      date: '',
      agence: '',
      service: '',
      pays: '',
      nombre: 0,
      volume: 0,
      statut: 'en cours',
      env: defaultEnv,
      envCode: this.sessionDefaultEnvCode || '',
      token: ''
    };
    this.cdr.markForCheck();
  }

  async addItem(): Promise<void> {
    // Validation
    if (!this.addForm.agence || !this.addForm.service || !this.addForm.pays) {
      this.popupService.showWarning('❌ Veuillez remplir tous les champs obligatoires.');
      return;
    }

    if (this.addForm.nombre < 0) {
      this.popupService.showWarning('❌ Le nombre de transactions doit être positif.');
      return;
    }

    if (!this.addForm.date) {
      this.popupService.showWarning('❌ La date est obligatoire.');
      return;
    }

    const duplicate = this.findDuplicateSummaryItem({
      date: this.addForm.date,
      agence: this.addForm.agence,
      service: this.addForm.service,
      pays: this.addForm.pays,
      nombre: this.addForm.nombre,
      montant: this.addForm.volume || 0,
      env: this.addForm.env,
      envCode: this.addForm.envCode
    });
    if (duplicate) {
      this.showDuplicateConflictPopup(duplicate, 'ajout');
      return;
    }

    this.isAdding = true;
    this.cdr.markForCheck();

    try {
      // Formater la date pour le backend
      const formattedDate = this.formatLocalDateTimeForBackend(this.addForm.date);

      // Créer l'objet pour le backend
      const summaryData: any = {
        dateTransaction: formattedDate,
        agence: this.addForm.agence,
        service: this.addForm.service,
        pays: this.addForm.pays,
        nombreTransactions: this.addForm.nombre,
        montantTotal: this.addForm.volume || 0,
        statut: this.addForm.statut === 'ok' ? 'OK' : 'EN_COURS',
        env: this.addForm.env || this.ecartBoSummaryService.getDefaultEnvForAddModal(),
        commentaire: `Ajout manuel - ${this.addForm.nombre} transaction(s)`
      };
      if (this.addForm.envCode != null && this.addForm.envCode.trim() !== '') {
        summaryData.envCode = this.addForm.envCode.trim();
      }
      if (this.addForm.token && this.addForm.token.trim()) {
        summaryData.token = this.addForm.token.trim();
      }

      // Sauvegarder en base de données
      const result = await this.ecartBoSummaryService.createEcartBoSummary(summaryData);

      if (result.count === 0 && result.duplicates > 0) {
        const dup = result.duplicateRecords?.[0];
        let message = `Cette ligne n'a pas été ajoutée : elle existe déjà en base.\n\n`;
        if (dup) {
          message += `${this.formatDuplicateRecordSummary(dup)}\n\n`;
        } else {
          message += `${this.formatSummaryItemDuplicateLine({
            date: this.addForm.date,
            agence: this.addForm.agence,
            service: this.addForm.service,
            pays: this.addForm.pays,
            nombre: this.addForm.nombre,
            montant: this.addForm.volume || 0,
            env: this.addForm.env,
            envCode: this.addForm.envCode
          })}\n\n`;
        }
        message += `Critères de doublon :\n${this.getDuplicateCriteriaBullets()}`;
        await this.popupService.showWarning(message, 'Doublon — ligne non ajoutée');
        return;
      }

      if (result.count === 0) {
        await this.popupService.showWarning(
          'Aucune ligne n\'a été enregistrée. Vérifiez les données saisies.',
          'Ajout non effectué'
        );
        return;
      }

      // Recharger les données sauvegardées pour afficher la nouvelle ligne
      this.loadSavedSummaryData();

      await this.popupService.showSuccess('Ligne ajoutée et sauvegardée avec succès !');
      this.closeAddModal();
    } catch (error: any) {
      console.error('Erreur lors de l\'ajout:', error);
      this.popupService.showError(`❌ Erreur: ${error.message || 'Erreur inconnue lors de l\'ajout'}`);
    } finally {
      this.isAdding = false;
      this.cdr.markForCheck();
    }
  }

  async deleteItem(item: EcartBoSummaryItem): Promise<void> {
    if (!item.id) {
      this.popupService.showWarning('❌ Cette ligne ne peut pas être supprimée car elle n\'a pas d\'ID.');
      return;
    }

    // Demander confirmation avec popup moderne
    const message = `Êtes-vous sûr de vouloir supprimer cette ligne ?\n\n` +
      `📅 Date: ${item.date || '-'}\n` +
      `🏢 Agence: ${item.agence}\n` +
      `🔧 Service: ${item.service}\n` +
      `🌍 Pays: ${item.pays}\n` +
      `📊 Nombre: ${item.nombre}`;
    
    const confirmed = await ModernPopupComponent.showConfirm(
      message,
      '🗑️ Confirmation de suppression'
    );
    
    if (!confirmed) {
      return;
    }

    this.isDeleting = true;
    this.deletingItemId = item.id;
    this.cdr.markForCheck();

    try {
      // Supprimer en base de données
      await firstValueFrom(this.ecartBoSummaryService.deleteEcartBoSummary(item.id));
      
      // Retirer l'item de la liste locale
      this.summaryItems = this.summaryItems.filter(i => i.id !== item.id);
      this.selectedRowKeys.delete(item.selectionKey);
      
      // Réappliquer les filtres
      this.applyFilters();
      
      this.popupService.showSuccess('✅ Ligne supprimée avec succès !');
    } catch (error: any) {
      console.error('Erreur lors de la suppression:', error);
      this.popupService.showError(`❌ Erreur: ${error.message || 'Erreur inconnue lors de la suppression'}`);
    } finally {
      this.isDeleting = false;
      this.deletingItemId = null;
      this.cdr.markForCheck();
    }
  }

  /** Lignes filtrées pouvant être sélectionnées pour une action utilisateur. */
  getSelectableItemsFiltered(): EcartBoSummaryItem[] {
    return this.filteredItems.filter(item => item.id != null || !item.id);
  }

  getSelectedItems(): EcartBoSummaryItem[] {
    return this.summaryItems.filter(item => this.selectedRowKeys.has(item.selectionKey));
  }

  getSelectedSavableItems(): EcartBoSummaryItem[] {
    return this.getSelectedItems().filter(item => !item.id);
  }

  getSelectedDeletableItems(): EcartBoSummaryItem[] {
    return this.getSelectedItems().filter(item => item.id != null);
  }

  get selectedSavableCount(): number {
    return this.selectedSavableCountCached;
  }

  get selectedDeletableCount(): number {
    return this.selectedDeletableCountCached;
  }

  isSelected(item: EcartBoSummaryItem): boolean {
    return this.selectedRowKeys.has(item.selectionKey);
  }

  toggleSelection(item: EcartBoSummaryItem): void {
    const { selectionKey } = item;
    if (this.selectedRowKeys.has(selectionKey)) {
      this.selectedRowKeys.delete(selectionKey);
    } else {
      this.selectedRowKeys.add(selectionKey);
    }
    this.refreshSelectionCache();
    this.cdr.markForCheck();
  }

  /** True si tous les éléments sélectionnables (toutes les pages / filtrés) sont sélectionnés. */
  get isAllSelectedFiltered(): boolean {
    return this.allFilteredSelected;
  }

  /** True si au moins une ligne (et pas toutes) parmi les filtrées est sélectionnée (checkbox indéterminée). */
  get isSomeSelectedFiltered(): boolean {
    return this.someFilteredSelected;
  }

  /** Sélectionne ou désélectionne tous les éléments sélectionnables (toutes les pages en cours). */
  toggleSelectAllFiltered(): void {
    const selectable = this.filteredItems.filter(item => item.id != null || item.statut === 'en cours');
    if (this.allFilteredSelected) {
      selectable.forEach(item => this.selectedRowKeys.delete(item.selectionKey));
    } else {
      selectable.forEach(item => this.selectedRowKeys.add(item.selectionKey));
    }
    this.refreshSelectionCache();
    this.cdr.markForCheck();
  }

  clearSelection(): void {
    this.selectedRowKeys.clear();
    this.refreshSelectionCache();
    this.cdr.markForCheck();
  }

  async deleteSelected(): Promise<void> {
    const itemsToDelete = this.getSelectedDeletableItems();
    if (itemsToDelete.length === 0) {
      this.popupService.showWarning('Aucune ligne sélectionnée.');
      return;
    }
    const count = itemsToDelete.length;
    const confirmed = await ModernPopupComponent.showConfirm(
      `Êtes-vous sûr de vouloir supprimer les ${count} ligne(s) sélectionnée(s) ?`,
      '🗑️ Suppression en masse'
    );
    if (!confirmed) return;

    this.isBulkDeleting = true;
    this.cdr.markForCheck();
    const ids = itemsToDelete.map(item => item.id!).filter((id): id is number => id != null);
    let successCount = 0;
    let errorCount = 0;
    try {
      for (let i = 0; i < ids.length; i++) {
        const id = ids[i];
        try {
          await firstValueFrom(this.ecartBoSummaryService.deleteEcartBoSummary(id));
          this.summaryItems = this.summaryItems.filter(item => item.id !== id);
          itemsToDelete
            .filter(item => item.id === id)
            .forEach(item => this.selectedRowKeys.delete(item.selectionKey));
          successCount++;
        } catch {
          errorCount++;
        }
        if (i < ids.length - 1) {
          await new Promise(r => setTimeout(r, 250));
        }
      }
      this.applyFilters();
      if (errorCount === 0) {
        this.popupService.showSuccess(`✅ ${successCount} ligne(s) supprimée(s) avec succès.`);
      } else {
        this.popupService.showWarning(`${successCount} supprimée(s), ${errorCount} erreur(s).`);
      }
    } finally {
      this.isBulkDeleting = false;
      this.cdr.markForCheck();
    }
  }

  /**
   * Exporte les données filtrées en CSV
   */
  exportData(): void {
    if (this.filteredItems.length === 0) {
      this.popupService.showWarning('❌ Aucune donnée à exporter.');
      return;
    }

    this.isExporting = true;
    this.cdr.markForCheck();

    try {
      const columns = ['Date', 'Agence', 'Service', 'Pays', 'Plateforme', 'ENV', 'Token', 'Nombre', 'Volume', 'Statut'];
      
      // Fonction pour échapper les valeurs CSV
      const escapeCsvValue = (value: any): string => {
        if (value === null || value === undefined) {
          return '';
        }
        const str = String(value);
        if (str.includes(';') || str.includes('"') || str.includes('\n')) {
          return `"${str.replace(/"/g, '""')}"`;
        }
        return str;
      };

      // Créer les lignes CSV
      const csvRows: string[] = [];
      
      // En-têtes
      csvRows.push(columns.map(col => escapeCsvValue(col)).join(';'));
      
      // Données
      for (const item of this.filteredItems) {
        const row = [
          item.date || '',
          item.agence || '',
          item.service || '',
          item.pays || '',
          item.env || 'BO',
          item.envCode || '',
          item.token || '',
          item.nombre || 0,
          item.montant || 0,
          item.statut || 'en cours'
        ];
        csvRows.push(row.map(val => escapeCsvValue(val)).join(';'));
      }

      // Créer le contenu CSV
      const csvContent = csvRows.join('\r\n');
      
      // Générer le nom de fichier avec la date actuelle
      const now = new Date();
      const dateStr = now.toISOString().split('T')[0].replace(/-/g, '');
      const timeStr = now.toTimeString().split(' ')[0].replace(/:/g, '');
      const fileName = `ecart-bo-summary_${dateStr}_${timeStr}.csv`;
      
      // Créer et télécharger le fichier
      const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' }); // BOM pour Excel
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      this.popupService.showSuccess(`✅ Export réussi: ${fileName} (${this.filteredItems.length} ligne(s))`);
    } catch (error: any) {
      console.error('Erreur lors de l\'export:', error);
      this.popupService.showError(`❌ Erreur lors de l'export: ${error.message || 'Erreur inconnue'}`);
    } finally {
      this.isExporting = false;
      this.cdr.markForCheck();
    }
  }
}

