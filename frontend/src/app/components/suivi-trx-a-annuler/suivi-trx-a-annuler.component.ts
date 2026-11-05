import { Component, OnInit, OnDestroy, ChangeDetectorRef, ChangeDetectionStrategy, HostListener, ElementRef, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Subscription, firstValueFrom } from 'rxjs';
import { Match } from '../../models/reconciliation-response.model';
import { ExportOptimizationService, ExportProgress } from '../../services/export-optimization.service';
import { PopupService } from '../../services/popup.service';
import { SuiviTrxAnnulerRow, SuiviTrxAnnulerService } from '../../services/suivi-trx-a-annuler.service';
import { AppStateService } from '../../services/app-state.service';
import { ReconciliationService } from '../../services/reconciliation.service';
import {
  PartnerFields,
  extractPartnerFields,
  normalizePartnerAmount,
  partnerPhoneKey,
  normalizePartnerTransactionId
} from '../../utils/partner-fields.util';
import { fixGarbledCharacters } from '../../utils/encoding-fixer';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { DsPaginationComponent } from '../../shared/ui';


/** Enregistrement partenaire indexé pour le rapprochement automatique. */
interface PartnerCandidate {
  fields: PartnerFields;
}

/** Formulaire de création manuelle d'une ligne de suivi. */
interface ManualRowForm {
  boDate: string;
  boAgence: string;
  boService: string;
  boMontant: string;
  boToken: string;
  boPays: string;
  boEnv: string;
  boTelephone: string;
  boStatut: string;
  partnerTransactionId: string;
  partnerDate: string;
  partnerMontant: string;
  idAnnulation: string;
  partnerTelephone: string;
  statutPart: string;
}

@Component({
  selector: 'app-suivi-trx-a-annuler',
  standalone: true,
  imports: [TranslateModule, CommonModule, FormsModule, ReactiveFormsModule, DsPaginationComponent],
  templateUrl: './suivi-trx-a-annuler.component.html',
  styleUrls: ['./suivi-trx-a-annuler.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class SuiviTrxAAnnulerComponent implements OnInit, OnDestroy {
  filteredMatches: Match[] = [];
  displayedMatches: Match[] = [];
  private subscription = new Subscription();

  currentPage = 1;
  pageSize = 20;
  totalPages = 1;

  searchKey: string = '';

  isLoading = true;
  loadProgress = 0;
  /** Texte de recherche normalisé par clé de match (tous les champs BO/Partenaire). */
  private searchIndex: Map<string, string> = new Map();

  showExportMenu = false;

  isExporting = false;
  exportProgress: ExportProgress = {
    current: 0,
    total: 0,
    percentage: 0,
    message: '',
    isComplete: false
  };
  private exportSubscription?: Subscription;

  private pendingDraftMatch: Match | null = null;
  /** Identifiants en base, indexés par clé de match. */
  private readonly persistedIds = new Map<string, number>();

  showScrollTopBtn = false;

  @ViewChild('tableWrapper') tableWrapperRef!: ElementRef<HTMLDivElement>;
  tableScrollLeft = 0;
  tableScrollMax = 0;
  private readonly TABLE_SCROLL_STEP = 300;

  // Colonnes demandées
  boDisplayColumns = ['Date', 'Agence', 'Service', 'Montant', 'Token', 'Pays', 'ENV', 'Telephone', 'Statut BO'];
  partnerDisplayColumns = ['Transaction ID', 'Date', 'Montant', 'ID Annulation', 'Telephone', 'Statut traitement', 'Statut Part'];

  showAnnulationPopup = false;
  selectedMatchForAnnulation: Match | null = null;
  annulationIdInput = '';
  isSavingAnnulation = false;
  /** Message affiché dans le popup de saisie manuelle (absence de correspondance). */
  annulationPopupNotice = '';

  // Création manuelle d'une ligne de suivi
  showManualRowPopup = false;
  isSavingManualRow = false;
  manualRowForm: ManualRowForm = this.createEmptyManualRow();

  // Rapprochement automatique Téléphone + Montant + Transaction ID
  verificationInProgress = false;
  verificationNotice: { type: 'success' | 'warning' | 'info'; message: string } | null = null;
  private autoVerificationDone = false;
  private persistedRows: SuiviTrxAnnulerRow[] = [];
  /** Motifs de bascule en saisie manuelle, indexés par clé de match. */
  private manualReasons = new Map<string, string>();
  private partnerCandidates: PartnerCandidate[] = [];
  private partnerByTransactionId = new Map<string, PartnerCandidate[]>();
  private partnerByPhoneAmount = new Map<string, PartnerCandidate[]>();
  private partnerByPhone = new Map<string, PartnerCandidate[]>();
  private knownIdsByTransactionId = new Map<string, string[]>();
  private knownIdsByPhoneAmount = new Map<string, string[]>();
  private partnerRecordsLoaded = false;

  constructor(
    private router: Router,
    private cdr: ChangeDetectorRef,
    private exportOptimizationService: ExportOptimizationService,
    private popupService: PopupService,
    private suiviTrxService: SuiviTrxAnnulerService,
    private appStateService: AppStateService,
    private reconciliationService: ReconciliationService,
    private el: ElementRef,
    private translate: TranslateService
  ) {}

  private t(key: string, params?: Record<string, unknown>): string {
    return this.translate.instant(key, params);
  }

  @HostListener('scroll', ['$event.target'])
  onHostScroll(target: HTMLElement): void {
    this.showScrollTopBtn = target.scrollTop > 300;
    this.cdr.markForCheck();
  }

  ngOnInit(): void {
    this.loadDraftFromMatches();
    this.loadPersistedRows();
    document.addEventListener('click', this.handleDocumentClick.bind(this));
  }

  private loadDraftFromMatches(): void {
    try {
      const raw = localStorage.getItem('suiviTrxAnnulerDraft');
      if (!raw) {
        return;
      }
      const draft = JSON.parse(raw);
      if (!draft) {
        return;
      }
      const boData = draft.boData || {};
      const partnerData = draft.partnerData || {};
      const match: Match = {
        key: draft.matchKey || `suivi-trx-${Date.now()}`,
        boData: boData,
        partnerData: partnerData,
        differences: []
      };
      this.pendingDraftMatch = match;
      localStorage.removeItem('suiviTrxAnnulerDraft');
    } catch (e) {
      console.error('Erreur lors du chargement du draft depuis /matches:', e);
    }
  }

  /** Charge les lignes enregistrées en base : source de vérité de la page. */
  private loadPersistedRows(): void {
    this.isLoading = true;
    this.loadProgress = 20;
    this.cdr.markForCheck();

    this.subscription.add(
      this.suiviTrxService.getAll().subscribe({
        next: (rows) => {
          this.setMatches(this.buildMatchesFromRows(rows));
        },
        error: (error) => {
          console.error('Erreur lors du chargement du suivi TRX à annuler:', error);
          // On conserve le brouillon éventuel pour ne pas bloquer la saisie.
          this.setMatches([]);
          this.popupService.showError('Impossible de charger les données enregistrées.');
        }
      })
    );
  }

  private buildMatchesFromRows(rows: SuiviTrxAnnulerRow[]): Match[] {
    this.persistedIds.clear();
    this.persistedRows = rows || [];
    const matches: Match[] = [];
    for (const row of this.persistedRows) {
      const match = this.rowToMatch(row);
      if (row.id != null) {
        this.persistedIds.set(match.key, row.id);
      }
      matches.push(match);
    }
    return matches;
  }

  private rowToMatch(row: SuiviTrxAnnulerRow): Match {
    const boData: Record<string, string> = {};
    this.putIfValue(boData, 'Date', row.boDate);
    this.putIfValue(boData, 'Agence', row.boAgence);
    this.putIfValue(boData, 'Service', row.boService);
    this.putIfValue(boData, 'Montant', row.boMontant);
    this.putIfValue(boData, 'Token', row.boToken);
    this.putIfValue(boData, 'Pays', row.boPays);
    this.putIfValue(boData, 'ENV', row.boEnv);
    this.putIfValue(boData, 'Telephone', row.boTelephone);
    this.putIfValue(boData, 'Statut BO', row.boStatut);

    const partnerData: Record<string, string> = {};
    this.putIfValue(partnerData, 'Transaction ID', row.partnerTransactionId);
    this.putIfValue(partnerData, 'Date', row.partnerDate);
    this.putIfValue(partnerData, 'Montant', row.partnerMontant);
    this.putIfValue(partnerData, 'ID Annulation', row.idAnnulation);
    this.putIfValue(partnerData, 'Telephone', row.partnerTelephone);
    this.putIfValue(partnerData, 'Statut Part', row.statutPart);

    return {
      key: (row.matchKey || '').trim() || `suivi-trx-${row.id ?? Date.now()}`,
      boData,
      partnerData,
      differences: []
    };
  }

  private putIfValue(target: Record<string, string>, key: string, value?: string | null): void {
    const trimmed = (value ?? '').toString().trim();
    if (trimmed) {
      target[key] = trimmed;
    }
  }

  /** Applique la liste (lignes en base + brouillon éventuel) à l'affichage. */
  private setMatches(matches: Match[]): void {
    const draft = this.pendingDraftMatch;
    const merged = draft
      ? [draft, ...matches.filter(m => m.key !== draft.key)]
      : matches;

    this.filteredMatches = merged;
    this.currentPage = 1;
    this.searchIndex.clear();
    this.buildSearchIndex(merged);
    this.applyFilters();
    this.isLoading = false;
    this.loadProgress = 100;
    this.cdr.markForCheck();
    setTimeout(() => this.updateTableScrollState(), 100);
    this.scheduleAutoVerification();
  }

  /**
   * Prépare le texte de recherche de chaque ligne. Toutes les valeurs sont
   * indexées (BO, Partenaire, lignes partenaires multiples, statut) en deux
   * formes : lisible (espaces) et compacte (chiffres/lettres collés) afin de
   * retrouver les montants et téléphones quel que soit leur format.
   */
  private buildSearchIndex(matches: Match[]): void {
    this.searchIndex.clear();
    matches.forEach(match => {
      this.searchIndex.set(match.key, this.buildSearchText(match));
    });
  }

  private buildSearchText(match: Match): string {
    const values: string[] = [];
    const add = (value: any): void => {
      if (value === null || value === undefined) {
        return;
      }
      const text = String(value).trim();
      if (text) {
        values.push(text);
      }
    };

    add(match.key);
    Object.values(match.boData || {}).forEach(add);
    Object.values(match.partnerData || {}).forEach(add);
    (match.partnerDataList || []).forEach(record => {
      Object.values(record || {}).forEach(add);
    });
    add(this.getPartnerValue(match, 'Statut traitement'));

    const normalized = values.map(value => this.normalizeSearchText(value)).join(' ');
    const compact = values.map(value => this.compactSearchText(value)).filter(Boolean).join(' ');
    return `${normalized} ${compact}`;
  }

  /** Minuscules, sans accents, séparateurs remplacés par des espaces. */
  private normalizeSearchText(value: string): string {
    return fixGarbledCharacters(value || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
  }

  /** Forme compacte (sans séparateurs) : téléphones, montants, références. */
  private compactSearchText(value: string): string {
    return this.normalizeSearchText(value).replace(/\s+/g, '');
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

  onSearch(): void {
    this.currentPage = 1;
    this.applyFilters();
  }

  private applyFilters(): void {
    let filtered = [...this.filteredMatches];

    const terms = this.parseSearchTerms(this.searchKey);
    if (terms.length > 0) {
      filtered = filtered.filter(match => {
        const searchable = this.searchIndex.get(match.key) ?? this.buildSearchText(match);
        return terms.every(term =>
          searchable.includes(term.normalized) ||
          (term.compact.length > 1 && searchable.includes(term.compact))
        );
      });
    }

    this.displayedMatches = filtered;
    this.totalPages = Math.max(1, Math.ceil(this.displayedMatches.length / this.pageSize));

    if (this.currentPage > this.totalPages) {
      this.currentPage = 1;
    }

    this.cdr.markForCheck();
  }

  /**
   * Découpe la saisie en termes (aucune longueur minimale) et fournit pour
   * chacun la forme normalisée et la forme compacte : « 07 12 34 » comme
   * « 071234 », « 1 000,50 » comme « 1000,50 ».
   */
  private parseSearchTerms(raw: string): Array<{ normalized: string; compact: string }> {
    return (raw || '')
      .trim()
      .split(/\s+/)
      .map(term => ({
        normalized: this.normalizeSearchText(term),
        compact: this.compactSearchText(term)
      }))
      .filter(term => term.normalized.length > 0);
  }

  getPagedMatches(): Match[] {
    const start = (this.currentPage - 1) * this.pageSize;
    const end = start + this.pageSize;
    return this.displayedMatches.slice(start, end);
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

  onPageSizeChange(size: number): void {
    if (size > 0) {
      this.pageSize = size;
      this.currentPage = 1;
      this.totalPages = Math.max(1, Math.ceil(this.displayedMatches.length / this.pageSize));
      if (this.currentPage > this.totalPages) {
        this.currentPage = this.totalPages;
      }
      this.cdr.markForCheck();
    }
  }

  private normalizeColumnName(name: string): string {
    const fixed = fixGarbledCharacters(name || '');
    return fixed
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]/g, '');
  }

  private getValueByFlexibleKey(record: Record<string, any> | undefined | null, correctedKey: string): string {
    if (!record) {
      return '';
    }

    const originalKey = this.getOriginalKey(record, correctedKey);
    const directValue = record[originalKey];
    if (directValue !== undefined && directValue !== null && String(directValue).trim() !== '') {
      return String(directValue).trim();
    }

    const targetNorm = this.normalizeColumnName(correctedKey);
    if (!targetNorm) {
      return '';
    }

    const keys = Object.keys(record);

    for (const k of keys) {
      const keyNorm = this.normalizeColumnName(k);
      if (!keyNorm) continue;

      if (
        keyNorm === targetNorm ||
        keyNorm.includes(targetNorm) ||
        targetNorm.includes(keyNorm)
      ) {
        const v = record[k];
        if (v !== undefined && v !== null && String(v).trim() !== '') {
          return String(v).trim();
        }
      }
    }

    return '';
  }

  private getValueFromRecordByLabel(record: Record<string, any> | undefined | null, label: string): string {
    if (!record) {
      return '';
    }

    const labelMap: Record<string, string[]> = {
      'Date': ['Date', 'date', 'DATE', 'jour', 'Jour', 'JOUR', 'dateTransaction', 'DateTransaction', 'Date Operation', 'Date Opération', 'Date Transaction'],
      'Agence': ['Agence', 'agence', 'AGENCY', 'Agency', 'Zone', 'zone', 'Agence zone', 'Agence/Zone', 'Agence BO'],
      'Service': ['Service', 'service', 'SERVICE', 'serv', 'Serv', 'Type Opération', 'Type Operation', 'Type operation', 'type operation', 'Type service', 'Operation', 'Opération', 'Service BO', 'Product', 'Produit'],
      'Montant': ['Montant', 'montant', 'MONTANT', 'Montant TTC', 'Montant HT', 'amount', 'Amount', 'Mnt', 'mnt', 'Montant transaction', 'Valeur', 'valeur'],
      'ID': ['ID', 'Id', 'id', 'IDTransaction', 'ID Transaction', 'Reference', 'Référence', 'Ref', 'ref', 'Numero', 'Numéro', 'N°', 'Transaction ID', 'Trans ID', 'ID BO'],
      'Pays': ['network_groupe_code', 'Network Groupe Code', 'Pays', 'pays', 'PAYS', 'country', 'Country', 'GRX', 'grx', 'Destination', 'destination', 'Code pays', 'Pays destination', 'Country code'],
      'ENV': ['ENV', 'Env', 'env', 'Environnement', 'environnement', 'Plateforme', 'plateforme', 'Channel', 'canal'],
      'Telephone': ['Telephone', 'Téléphone', 'telephone', 'téléphone', 'Tel', 'TEL', 'Phone', 'phone', 'Numéro Téléphone', 'Numero Telephone', 'Numero telephone', 'MSISDN', 'msisdn', 'telephone_number'],
      'Token': ['Token', 'token', 'TOKEN', 'Jeton', 'jeton'],
      'Transaction ID': ['Transaction ID', 'TransactionId', 'transactionId', 'ID Transaction', 'IDTransaction', 'Numéro Trans GU', 'Numero Trans GU', 'Reference', 'Référence', 'Trans ID', 'Trace ID', 'RRN', 'ID Transaction Partenaire'],
      'ID Annulation': ['ID Annulation', 'IDAnnulation', 'Id Annulation', 'Annulation ID', 'ID Annul', 'ID_ANNULATION', 'ID ANNULATION', 'Numero Annulation', 'Numéro Annulation', 'Reference Annulation', 'Référence Annulation'],
      'Statut': ['Statut', 'statut', 'STATUS', 'Status', 'Etat', 'état']
    };

    const keys = labelMap[label] || [label];
    for (const k of keys) {
      const v = this.getValueByFlexibleKey(record, k);
      if (v) {
        return v;
      }
    }

    // Fallback: recherche par similarité sur toutes les clés
    const targetNorm = this.normalizeColumnName(label);
    if (targetNorm) {
      for (const k of Object.keys(record)) {
        const keyNorm = this.normalizeColumnName(k);
        if (keyNorm.includes(targetNorm) || targetNorm.includes(keyNorm)) {
          const v = record[k];
          if (v !== undefined && v !== null && String(v).trim() !== '') {
            return String(v).trim();
          }
        }
      }
    }

    return '';
  }

  getBoValue(match: Match, column: string): string {
    // Colonne technique ajoutee au suivi : lecture stricte pour ne pas la
    // confondre avec une eventuelle colonne BO nommee "Statut".
    if (column === 'Statut BO') {
      return (match.boData?.['Statut BO'] ?? '').toString().trim();
    }

    const sources: Record<string, any>[] = [];
    if (match.boData) {
      sources.push(match.boData);
    }
    for (const record of sources) {
      const v = this.getValueFromRecordByLabel(record, column);
      if (v) {
        return v;
      }
    }
    // Côté BO, le token par défaut est l'ID de la transaction.
    if (column === 'Token') {
      return this.getBoValue(match, 'ID');
    }
    return '';
  }

  private resolveAnnulationId(sources: Record<string, any>[]): string {
    return this.getPartnerValueInternal(sources, 'ID Annulation');
  }

  getPartnerValue(match: Match, column: string): string {
    // Donnee saisie dans le suivi : lecture stricte du partenaire (ne pas la
    // confondre avec l'eventuel statut brut d'une ligne de reconciliation).
    if (column === 'Statut Part') {
      return (match.partnerData?.['Statut Part'] ?? '').toString().trim();
    }

    const sources: Record<string, any>[] = [];
    if (match.partnerData) {
      sources.push(match.partnerData);
    }
    if (match.partnerDataList && match.partnerDataList.length > 0) {
      for (const pr of match.partnerDataList) {
        if (pr) {
          sources.push(pr);
        }
      }
    }

    if (column === 'Statut traitement') {
      const annulationId = this.resolveAnnulationId(sources);
      return annulationId ? 'OK' : 'En cours';
    }

    if (column === 'ID Annulation') {
      return this.resolveAnnulationId(sources);
    }

    return this.getPartnerValueInternal(sources, column);
  }

  /**
   * Enregistre le statut BO saisi dans la liste (Echec / Annulee).
   */
  onBoStatutChange(match: Match, statut: string): void {
    const next = (statut || '').trim();
    if (next !== 'Echec' && next !== 'Annulée') {
      return;
    }
    const previous = this.getBoValue(match, 'Statut BO');
    this.persistStatutChange(
      match,
      'bo',
      'Statut BO',
      next,
      previous,
      'Impossible d\'enregistrer le statut BO.'
    );
  }

  /**
   * Enregistre le statut partenaire saisi dans la liste (Succes / Annulee).
   */
  onStatutPartChange(match: Match, statut: string): void {
    const next = (statut || '').trim();
    if (next !== 'Succès' && next !== 'Annulée') {
      return;
    }
    const previous = this.getPartnerValue(match, 'Statut Part');
    this.persistStatutChange(
      match,
      'part',
      'Statut Part',
      next,
      previous,
      'Impossible d\'enregistrer le statut partenaire.'
    );
  }

  /**
   * Mise a jour optimiste d'un statut saisi : enregistre la ligne complete et
   * restaure la valeur precedente si l'API echoue.
   */
  private persistStatutChange(
    match: Match,
    side: 'bo' | 'part',
    column: 'Statut BO' | 'Statut Part',
    next: string,
    previous: string,
    errorMessage: string
  ): void {
    if (previous === next) {
      return;
    }

    let record: Record<string, string>;
    if (side === 'bo') {
      if (!match.boData) {
        match.boData = {};
      }
      record = match.boData;
    } else {
      if (!match.partnerData) {
        match.partnerData = {};
      }
      record = match.partnerData;
    }
    record[column] = next;
    this.buildSearchIndex(this.filteredMatches);
    this.applyFilters();
    this.cdr.markForCheck();

    const payload = this.buildRowPayload(match, this.getPartnerValue(match, 'ID Annulation'));
    this.subscription.add(
      this.suiviTrxService.save(payload).subscribe({
        next: (saved) => {
          if (saved?.id != null) {
            this.persistedIds.set(match.key, saved.id);
          }
          this.upsertPersistedRow({
            ...payload,
            ...(saved || {}),
            boStatut: saved?.boStatut ?? payload.boStatut,
            statutPart: saved?.statutPart ?? payload.statutPart
          });
          this.cdr.markForCheck();
        },
        error: (error) => {
          console.error(errorMessage, error);
          if (previous) {
            record[column] = previous;
          } else {
            delete record[column];
          }
          this.buildSearchIndex(this.filteredMatches);
          this.applyFilters();
          this.popupService.showError(errorMessage);
          this.cdr.markForCheck();
        }
      })
    );
  }

  openAnnulationPopup(match: Match): void {
    this.selectedMatchForAnnulation = match;
    const current = this.getPartnerValue(match, 'ID Annulation');
    this.annulationIdInput = current || '';
    this.annulationPopupNotice = this.manualReasons.get(match.key)
      || (this.partnerRecordsLoaded
        ? ''
        : 'Données de réconciliation non disponibles : la ligne peut être complétée manuellement.');
    this.showAnnulationPopup = true;
    this.cdr.markForCheck();
  }

  closeAnnulationPopup(): void {
    this.showAnnulationPopup = false;
    this.selectedMatchForAnnulation = null;
    this.annulationIdInput = '';
    this.cdr.markForCheck();
  }

  saveAnnulationId(): void {
    const match = this.selectedMatchForAnnulation;
    if (!match) {
      return;
    }
    const id = (this.annulationIdInput || '').trim();
    if (!id) {
      this.popupService.showWarning('Veuillez saisir un ID d\'annulation');
      return;
    }

    const payload = this.buildRowPayload(match, id);
    this.isSavingAnnulation = true;
    this.cdr.markForCheck();

    this.subscription.add(
      this.suiviTrxService.save(payload).subscribe({
        next: (saved) => {
          if (saved?.id != null) {
            this.persistedIds.set(match.key, saved.id);
          }
          if (match.partnerData) {
            match.partnerData['ID Annulation'] = id;
          } else {
            match.partnerData = { 'ID Annulation': id };
          }
          if (match.partnerDataList && match.partnerDataList.length > 0) {
            match.partnerDataList[0]['ID Annulation'] = id;
          }
          this.upsertPersistedRow({
            ...payload,
            id: saved?.id ?? payload.id,
            matchKey: saved?.matchKey ?? payload.matchKey,
            idAnnulation: id,
            statut: 'OK'
          });
          this.manualReasons.delete(match.key);
          this.pendingDraftMatch = null;
          this.isSavingAnnulation = false;
          this.popupService.showSuccess('ID d\'annulation enregistré');
          this.closeAnnulationPopup();
          this.applyFilters();
          this.cdr.markForCheck();
        },
        error: (error) => {
          console.error('Erreur lors de l\'enregistrement de l\'ID annulation:', error);
          this.isSavingAnnulation = false;
          this.popupService.showError('Impossible d\'enregistrer l\'ID d\'annulation.');
          this.cdr.markForCheck();
        }
      })
    );
  }

  /**
   * Ouvre le formulaire de création d'une ligne sans passer par une
   * transaction issue de la réconciliation.
   */
  openManualRowPopup(): void {
    this.manualRowForm = this.createEmptyManualRow();
    this.showManualRowPopup = true;
    this.cdr.markForCheck();
  }

  closeManualRowPopup(): void {
    if (this.isSavingManualRow) {
      return;
    }
    this.showManualRowPopup = false;
    this.cdr.markForCheck();
  }

  /** Statut traitement calculé comme pour les lignes existantes. */
  get manualStatutTraitement(): string {
    return (this.manualRowForm.idAnnulation || '').trim() ? 'OK' : 'En cours';
  }

  saveManualRow(): void {
    if (this.isSavingManualRow) {
      return;
    }
    if (!Object.values(this.manualRowForm).some(value => (value || '').trim().length > 0)) {
      this.popupService.showWarning('Veuillez renseigner au moins un champ avant d\'ajouter la ligne.');
      return;
    }

    const matchKey = `manual-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const payload: SuiviTrxAnnulerRow = {
      matchKey,
      boDate: this.cleanManualValue(this.manualRowForm.boDate),
      boAgence: this.cleanManualValue(this.manualRowForm.boAgence),
      boService: this.cleanManualValue(this.manualRowForm.boService),
      boMontant: this.cleanManualValue(this.manualRowForm.boMontant),
      boToken: this.cleanManualValue(this.manualRowForm.boToken),
      boPays: this.cleanManualValue(this.manualRowForm.boPays),
      boEnv: this.cleanManualValue(this.manualRowForm.boEnv),
      boTelephone: this.cleanManualValue(this.manualRowForm.boTelephone),
      boStatut: this.cleanManualValue(this.manualRowForm.boStatut),
      partnerTransactionId: this.cleanManualValue(this.manualRowForm.partnerTransactionId),
      partnerDate: this.cleanManualValue(this.manualRowForm.partnerDate),
      partnerMontant: this.cleanManualValue(this.manualRowForm.partnerMontant),
      idAnnulation: this.cleanManualValue(this.manualRowForm.idAnnulation),
      partnerTelephone: this.cleanManualValue(this.manualRowForm.partnerTelephone),
      statutPart: this.cleanManualValue(this.manualRowForm.statutPart)
    };

    this.isSavingManualRow = true;
    this.cdr.markForCheck();

    this.subscription.add(
      this.suiviTrxService.save(payload).subscribe({
        next: (saved) => {
          const savedRow: SuiviTrxAnnulerRow = {
            ...payload,
            ...(saved || {}),
            matchKey: saved?.matchKey || matchKey,
            boStatut: saved?.boStatut ?? payload.boStatut,
            statutPart: saved?.statutPart ?? payload.statutPart
          };

          if (savedRow.id != null) {
            this.persistedIds.set(savedRow.matchKey || matchKey, savedRow.id);
          }
          this.upsertPersistedRow(savedRow);
          this.addSavedRowToView(savedRow);

          this.isSavingManualRow = false;
          this.showManualRowPopup = false;
          this.manualRowForm = this.createEmptyManualRow();
          this.popupService.showSuccess('Ligne ajoutée au suivi');
          this.cdr.markForCheck();
        },
        error: (error) => {
          console.error('Erreur lors de l\'ajout manuel d\'une ligne de suivi:', error);
          this.isSavingManualRow = false;
          this.popupService.showError('Impossible d\'ajouter cette ligne de suivi.');
          this.cdr.markForCheck();
        }
      })
    );
  }

  private addSavedRowToView(row: SuiviTrxAnnulerRow): void {
    const match = this.rowToMatch(row);
    this.filteredMatches = [
      match,
      ...this.filteredMatches.filter(existing => existing.key !== match.key)
    ];
    this.buildSearchIndex(this.filteredMatches);
    this.currentPage = 1;
    this.applyFilters();
  }

  private cleanManualValue(value: string): string | null {
    const trimmed = (value || '').trim();
    return trimmed ? trimmed : null;
  }

  private createEmptyManualRow(): ManualRowForm {
    return {
      boDate: '',
      boAgence: '',
      boService: '',
      boMontant: '',
      boToken: '',
      boPays: '',
      boEnv: '',
      boTelephone: '',
      boStatut: '',
      partnerTransactionId: '',
      partnerDate: '',
      partnerMontant: '',
      idAnnulation: '',
      partnerTelephone: '',
      statutPart: ''
    };
  }

  /**
   * Lance la vérification automatique une seule fois après le chargement des
   * lignes (l'utilisateur peut la relancer avec le bouton « Vérifier »).
   */
  private scheduleAutoVerification(): void {
    if (this.autoVerificationDone) {
      return;
    }
    this.autoVerificationDone = true;
    void this.runAutoVerification();
  }

  dismissVerificationNotice(): void {
    this.verificationNotice = null;
    this.cdr.markForCheck();
  }

  isManualRow(match: Match): boolean {
    return this.manualReasons.has(match.key);
  }

  getManualReason(match: Match): string {
    return this.manualReasons.get(match.key) || '';
  }

  /**
   * Rapprochement automatique des lignes sans ID Annulation :
   * - priorité au Transaction ID, puis Téléphone + Montant ;
   * - récupération de l'ID Annulation déjà saisi (notamment via /ecart-partner) ;
   * - complétion des champs manquants depuis les données partenaires ;
   * - bascule en saisie manuelle avec un message clair si aucune correspondance.
   */
  async runAutoVerification(): Promise<void> {
    if (this.verificationInProgress) {
      return;
    }

    const pending = this.filteredMatches.filter(
      match => !this.getPartnerValue(match, 'ID Annulation').trim()
    );
    if (pending.length === 0) {
      this.verificationNotice = this.filteredMatches.length > 0
        ? { type: 'info', message: 'Toutes les lignes disposent déjà d\'un ID d\'annulation.' }
        : null;
      this.cdr.markForCheck();
      return;
    }

    this.verificationInProgress = true;
    this.verificationNotice = null;
    this.manualReasons.clear();
    this.cdr.markForCheck();

    let completed = 0;
    let enriched = 0;
    let manual = 0;

    try {
      await this.loadPartnerSourceRecords();
      this.rebuildPartnerIndex();
      this.rebuildKnownAnnulationIndex();

      for (const match of pending) {
        const rowFields = this.getMatchPartnerFields(match);
        const candidates = this.findPartnerCandidates(rowFields);
        const merged: PartnerFields = { ...rowFields };
        if (candidates.length === 1) {
          this.mergeMissingPartnerFields(merged, candidates[0].fields);
        }

        const ids = this.getAnnulationIds(merged, candidates);
        if (ids.length === 1) {
          this.applyPartnerFieldsToMatch(match, merged);
          try {
            await this.persistVerifiedRow(match, ids[0]);
            // On n'affiche l'ID qu'une fois la sauvegarde réussie.
            this.setMatchAnnulationId(match, ids[0]);
            this.manualReasons.delete(match.key);
            completed++;
            continue;
          } catch (error) {
            console.warn('Enregistrement automatique de l\'ID d\'annulation impossible:', error);
          }
        }

        // Pas d'ID unique : on complète ce qui peut l'être et on passe en manuel.
        if (candidates.length === 1 && this.applyPartnerFieldsToMatch(match, merged)) {
          try {
            await this.persistVerifiedRow(match, '');
            enriched++;
          } catch (error) {
            console.warn('Complétion automatique de la ligne impossible:', error);
          }
        }

        let reason: string;
        if (ids.length > 1) {
          reason = 'Plusieurs IDs d\'annulation différents existent pour cette transaction : saisie manuelle requise.';
        } else if (candidates.length > 1) {
          reason = 'Plusieurs transactions correspondent au Téléphone / Montant : saisie manuelle requise (Transaction ID absent ou ambigu).';
        } else if (candidates.length === 1) {
          reason = 'Transaction partenaire trouvée, mais aucun ID d\'annulation n\'y est rattaché : saisie manuelle requise.';
        } else {
          reason = 'Aucune correspondance trouvée (Téléphone / Montant / Transaction ID) : saisie manuelle requise.';
        }
        this.manualReasons.set(match.key, reason);
        manual++;
      }

      const parts: string[] = [];
      if (completed > 0) {
        parts.push(`${completed} ligne(s) passée(s) en OK automatiquement`);
      }
      if (enriched > 0) {
        parts.push(`${enriched} ligne(s) complétée(s) depuis les données partenaires`);
      }
      if (manual > 0) {
        parts.push(`${manual} ligne(s) à compléter manuellement`);
      }

      const sourceMessage = this.partnerRecordsLoaded
        ? ''
        : ' Données de réconciliation non chargées : vérification limitée aux lignes de suivi.';

      const manualHint = manual > 0
        ? ' Utilisez « Saisir ID Annulation » pour les lignes marquées « Manuel ».'
        : '';

      this.verificationNotice = {
        type: completed > 0 && manual === 0 ? 'success' : (completed > 0 ? 'info' : 'warning'),
        message: (parts.length > 0
          ? `Vérification automatique : ${parts.join(' · ')}.`
          : 'Vérification automatique terminée.') + sourceMessage + manualHint
      };
    } catch (error) {
      console.error('Erreur lors de la vérification automatique:', error);
      this.verificationNotice = {
        type: 'warning',
        message: 'La vérification automatique a échoué. Les lignes restent disponibles en saisie manuelle.'
      };
    } finally {
      this.verificationInProgress = false;
      this.buildSearchIndex(this.filteredMatches);
      this.applyFilters();
      this.cdr.markForCheck();
    }
  }

  private partnerRecords: Record<string, any>[] = [];

  /** Charge les enregistrements partenaires de la réconciliation courante (correspondances + écarts). */
  private async loadPartnerSourceRecords(): Promise<void> {
    const records: Record<string, any>[] = [];
    const seen = new Set<Record<string, any>>();
    const push = (record: Record<string, any> | null | undefined) => {
      if (record && !seen.has(record)) {
        seen.add(record);
        records.push(record);
      }
    };

    const current = this.appStateService.getCurrentReconciliationResults();
    const magic = this.appStateService.getMagicFullResponse();
    for (const response of [current, magic]) {
      if (!response) {
        continue;
      }
      (response.matches || []).forEach(match => {
        if (match.partnerData) {
          push(match.partnerData);
        }
        (match.partnerDataList || []).forEach(push);
      });
      (response.partnerOnly || []).forEach(push);
    }

    const sessionId = current?.progressSessionId || this.reconciliationService.getCurrentJobId();
    if (current && sessionId
      && (current.resultsPaginated
        || (current.partnerOnly?.length ?? 0) < (current.totalPartnerOnly ?? 0))) {
      try {
        const partnerOnly = await this.reconciliationService.loadPartnerOnlyFromSession(sessionId);
        (partnerOnly || []).forEach(push);
      } catch (error) {
        console.warn('Chargement des écarts partenaires indisponible pour la vérification:', error);
      }
    }

    this.partnerRecords = records;
    this.partnerRecordsLoaded = records.length > 0;
  }

  /** Indexe les enregistrements partenaires par Transaction ID, Téléphone + Montant et Téléphone. */
  private rebuildPartnerIndex(): void {
    this.partnerCandidates = [];
    this.partnerByTransactionId.clear();
    this.partnerByPhoneAmount.clear();
    this.partnerByPhone.clear();

    const seen = new Set<string>();
    for (const record of this.partnerRecords) {
      const fields = extractPartnerFields([record]);
      if (!fields.transactionId && !fields.telephone && !fields.montant) {
        continue;
      }
      const transactionId = normalizePartnerTransactionId(fields.transactionId);
      const phone = partnerPhoneKey(fields.telephone);
      const amount = normalizePartnerAmount(fields.montant);
      const signature = `${transactionId}|${phone}|${amount}|${(fields.date || '').trim()}`;
      if (seen.has(signature)) {
        continue;
      }
      seen.add(signature);

      const candidate: PartnerCandidate = { fields };
      this.partnerCandidates.push(candidate);
      this.addCandidate(this.partnerByTransactionId, transactionId, candidate);
      if (phone && amount) {
        this.addCandidate(this.partnerByPhoneAmount, `${phone}|${amount}`, candidate);
      }
      if (phone) {
        this.addCandidate(this.partnerByPhone, phone, candidate);
      }
    }
  }

  private addCandidate(
    index: Map<string, PartnerCandidate[]>,
    key: string,
    candidate: PartnerCandidate
  ): void {
    if (!key) {
      return;
    }
    const list = index.get(key) || [];
    if (!list.includes(candidate)) {
      list.push(candidate);
    }
    index.set(key, list);
  }

  /** Rapprochement : Transaction ID prioritaire, puis Téléphone + Montant, puis Téléphone. */
  private findPartnerCandidates(fields: PartnerFields): PartnerCandidate[] {
    const transactionId = normalizePartnerTransactionId(fields.transactionId);
    if (transactionId) {
      const byTransaction = this.partnerByTransactionId.get(transactionId);
      if (byTransaction && byTransaction.length > 0) {
        return byTransaction;
      }
    }

    const phone = partnerPhoneKey(fields.telephone);
    const amount = normalizePartnerAmount(fields.montant);
    if (phone && amount) {
      const byPhoneAmount = this.partnerByPhoneAmount.get(`${phone}|${amount}`);
      if (byPhoneAmount && byPhoneAmount.length > 0) {
        return byPhoneAmount;
      }
    }

    if (phone) {
      const byPhone = this.partnerByPhone.get(phone);
      if (byPhone && byPhone.length > 0) {
        return byPhone;
      }
    }
    return [];
  }

  private getMatchPartnerFields(match: Match): PartnerFields {
    const records: Record<string, any>[] = [];
    if (match.partnerData) {
      records.push(match.partnerData);
    }
    (match.partnerDataList || []).forEach(record => {
      if (record) {
        records.push(record);
      }
    });
    const fields = extractPartnerFields(records);
    // Certains modèles n'ont le téléphone que côté BO : il sert de repli pour
    // retrouver la transaction partenaire (le montant, lui, reste partenaire).
    if (!fields.telephone) {
      const boPhone = this.getBoValue(match, 'Telephone');
      if (boPhone) {
        fields.telephone = boPhone;
      }
    }
    return fields;
  }

  private mergeMissingPartnerFields(target: PartnerFields, source: PartnerFields): void {
    if (!target.transactionId) {
      target.transactionId = source.transactionId;
    }
    if (!target.date) {
      target.date = source.date;
    }
    if (!target.montant) {
      target.montant = source.montant;
    }
    if (!target.telephone) {
      target.telephone = source.telephone;
    }
    if (!target.idAnnulation) {
      target.idAnnulation = source.idAnnulation;
    }
  }

  /** Complète la ligne affichée avec les champs détectés (sans écraser l'existant). */
  private applyPartnerFieldsToMatch(match: Match, fields: PartnerFields): boolean {
    const partnerData = match.partnerData || (match.partnerData = {});
    let changed = false;
    const setIfMissing = (key: string, value: string) => {
      if (value && !String(partnerData[key] ?? '').trim()) {
        partnerData[key] = value;
        changed = true;
      }
    };
    setIfMissing('Transaction ID', fields.transactionId);
    setIfMissing('Date', fields.date);
    setIfMissing('Montant', fields.montant);
    setIfMissing('Telephone', fields.telephone);
    setIfMissing('ID Annulation', fields.idAnnulation);
    return changed;
  }

  private setMatchAnnulationId(match: Match, idAnnulation: string): void {
    const partnerData = match.partnerData || (match.partnerData = {});
    partnerData['ID Annulation'] = idAnnulation;
    if (match.partnerDataList && match.partnerDataList.length > 0 && match.partnerDataList[0]) {
      match.partnerDataList[0]['ID Annulation'] = idAnnulation;
    }
  }

  /** IDs d'annulation connus pour cette transaction (lignes de suivi, dont celles créées via /ecart-partner). */
  private getAnnulationIds(fields: PartnerFields, candidates: PartnerCandidate[]): string[] {
    const ids = new Set<string>();
    const transactionId = normalizePartnerTransactionId(fields.transactionId);
    if (transactionId) {
      (this.knownIdsByTransactionId.get(transactionId) || []).forEach(id => ids.add(id));
    }

    if (ids.size === 0) {
      const phone = partnerPhoneKey(fields.telephone);
      const amount = normalizePartnerAmount(fields.montant);
      if (phone && amount) {
        (this.knownIdsByPhoneAmount.get(`${phone}|${amount}`) || []).forEach(id => ids.add(id));
      }
    }

    if (ids.size === 0) {
      candidates
        .map(candidate => (candidate.fields.idAnnulation || '').trim())
        .filter(Boolean)
        .forEach(id => ids.add(id));
    }

    return Array.from(ids);
  }

  private rebuildKnownAnnulationIndex(): void {
    this.knownIdsByTransactionId.clear();
    this.knownIdsByPhoneAmount.clear();

    for (const row of this.persistedRows) {
      const idAnnulation = (row.idAnnulation || '').trim();
      if (!idAnnulation) {
        continue;
      }

      const transactionId = normalizePartnerTransactionId(row.partnerTransactionId);
      if (transactionId) {
        this.pushUniqueId(this.knownIdsByTransactionId, transactionId, idAnnulation);
      }

      const phone = partnerPhoneKey(row.partnerTelephone);
      const amount = normalizePartnerAmount(row.partnerMontant);
      if (phone && amount) {
        this.pushUniqueId(this.knownIdsByPhoneAmount, `${phone}|${amount}`, idAnnulation);
      }
    }
  }

  private pushUniqueId(index: Map<string, string[]>, key: string, id: string): void {
    const list = index.get(key) || [];
    if (!list.includes(id)) {
      list.push(id);
    }
    index.set(key, list);
  }

  private upsertPersistedRow(row: SuiviTrxAnnulerRow): void {
    this.persistedRows = this.persistedRows.filter(existing => !(
      (row.id != null && existing.id === row.id)
      || (!!row.matchKey && existing.matchKey === row.matchKey)
    ));
    this.persistedRows.unshift(row);
    this.rebuildKnownAnnulationIndex();
  }

  private async persistVerifiedRow(match: Match, idAnnulation: string): Promise<void> {
    const payload = this.buildRowPayload(match, idAnnulation);
    const saved = await firstValueFrom(this.suiviTrxService.save(payload));
    if (saved?.id != null) {
      this.persistedIds.set(match.key, saved.id);
    }
    this.upsertPersistedRow({
      ...payload,
      ...(saved || {}),
      idAnnulation: idAnnulation || saved?.idAnnulation || '',
      statut: idAnnulation ? 'OK' : (saved?.statut || 'En cours')
    });
  }

  /** Construit la ligne persistée (colonnes du suivi) à partir d'un match affiché. */
  private buildRowPayload(match: Match, annulationId: string): SuiviTrxAnnulerRow {
    return {
      id: this.persistedIds.get(match.key),
      matchKey: match.key,
      boDate: this.getBoValue(match, 'Date'),
      boAgence: this.getBoValue(match, 'Agence'),
      boService: this.getBoValue(match, 'Service'),
      boMontant: this.getBoValue(match, 'Montant'),
      boToken: this.getBoValue(match, 'Token'),
      boPays: this.getBoValue(match, 'Pays'),
      boEnv: this.getBoValue(match, 'ENV'),
      boTelephone: this.getBoValue(match, 'Telephone'),
      boStatut: this.getBoValue(match, 'Statut BO'),
      partnerTransactionId: this.getPartnerValue(match, 'Transaction ID'),
      partnerDate: this.getPartnerValue(match, 'Date'),
      partnerMontant: this.getPartnerValue(match, 'Montant'),
      idAnnulation: annulationId,
      partnerTelephone: this.getPartnerValue(match, 'Telephone'),
      statutPart: this.getPartnerValue(match, 'Statut Part')
    };
  }

  async deleteRow(match: Match): Promise<void> {
    const label = this.getBoValue(match, 'Token') || this.getPartnerValue(match, 'Transaction ID') || 'cette ligne';
    const confirmed = await this.popupService.showConfirm(`Supprimer le suivi de ${label} ?`);
    if (!confirmed) {
      return;
    }

    const persistedId = this.persistedIds.get(match.key);
    const removeLocally = () => {
      this.persistedIds.delete(match.key);
      this.persistedRows = this.persistedRows.filter(row => !(
        (persistedId != null && row.id === persistedId)
        || (!!row.matchKey && row.matchKey === match.key)
      ));
      this.rebuildKnownAnnulationIndex();
      this.manualReasons.delete(match.key);
      this.filteredMatches = this.filteredMatches.filter(m => m.key !== match.key);
      if (this.pendingDraftMatch?.key === match.key) {
        this.pendingDraftMatch = null;
      }
      this.searchIndex.clear();
      this.buildSearchIndex(this.filteredMatches);
      this.currentPage = 1;
      this.applyFilters();
      this.cdr.markForCheck();
    };

    if (persistedId == null) {
      removeLocally();
      return;
    }

    this.subscription.add(
      this.suiviTrxService.delete(persistedId).subscribe({
        next: () => {
          removeLocally();
          this.popupService.showSuccess('Suivi supprimé');
        },
        error: (error) => {
          console.error('Erreur lors de la suppression du suivi:', error);
          this.popupService.showError('Impossible de supprimer ce suivi.');
        }
      })
    );
  }

  private getPartnerValueInternal(sources: Record<string, any>[], column: string): string {
    for (const record of sources) {
      const v = this.getValueFromRecordByLabel(record, column);
      if (v) {
        return v;
      }
    }
    return '';
  }

  trackByMatch = (index: number, match: Match): string => match?.key || String(index);
  trackByIndex = (index: number): number => index;

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
      const viewportMargin = 8;
      const dropdownWidth = dropdown.offsetWidth || 320;
      const spaceBelow = window.innerHeight - rect.bottom - viewportMargin;
      const spaceAbove = rect.top - viewportMargin;
      const openUp = dropdown.offsetHeight > spaceBelow && spaceAbove > spaceBelow;
      const availableHeight = Math.max(180, (openUp ? spaceAbove : spaceBelow) - viewportMargin);
      const left = Math.min(
        Math.max(viewportMargin, rect.right - dropdownWidth),
        window.innerWidth - dropdownWidth - viewportMargin
      );
      const top = openUp
        ? Math.max(viewportMargin, rect.top - (dropdown.offsetHeight || 200) - viewportMargin)
        : rect.bottom + viewportMargin;

      dropdown.style.position = 'fixed';
      dropdown.style.top = `${top}px`;
      dropdown.style.left = `${left}px`;
      dropdown.style.maxHeight = `${availableHeight}px`;
      dropdown.style.overflowY = 'auto';
    }
  }

  async exportResults(): Promise<void> {
    const source = this.displayedMatches.length > 0 ? this.displayedMatches : this.filteredMatches;
    if (source.length === 0) {
      this.popupService.showError(this.t('MSG.noDataToExport'));
      return;
    }

    try {
      this.isExporting = true;
      this.exportProgress = {
        current: 0,
        total: source.length,
        percentage: 0,
        message: this.t('MSG.exportPreparing'),
        isComplete: false
      };
      this.showExportMenu = false;
      this.cdr.markForCheck();

      const columns = [
        'BO - Date',
        'BO - Agence',
        'BO - Service',
        'BO - Montant',
        'BO - Token',
        'BO - Pays',
        'BO - ENV',
        'BO - Telephone',
        'BO - Statut BO',
        'PARTNER - Transaction ID',
        'PARTNER - Date',
        'PARTNER - Montant',
        'PARTNER - ID Annulation',
        'PARTNER - Telephone',
        'PARTNER - Statut traitement',
        'PARTNER - Statut Part'
      ];

      const rows: Record<string, unknown>[] = source.map(match => {
        const annulationId = this.getPartnerValue(match, 'ID Annulation');
        return {
          'BO - Date': this.getBoValue(match, 'Date'),
          'BO - Agence': this.getBoValue(match, 'Agence'),
          'BO - Service': this.getBoValue(match, 'Service'),
          'BO - Montant': this.getBoValue(match, 'Montant'),
          'BO - Token': this.getBoValue(match, 'Token'),
          'BO - Pays': this.getBoValue(match, 'Pays'),
          'BO - ENV': this.getBoValue(match, 'ENV'),
          'BO - Telephone': this.getBoValue(match, 'Telephone'),
          'BO - Statut BO': this.getBoValue(match, 'Statut BO'),
          'PARTNER - Transaction ID': this.getPartnerValue(match, 'Transaction ID'),
          'PARTNER - Date': this.getPartnerValue(match, 'Date'),
          'PARTNER - Montant': this.getPartnerValue(match, 'Montant'),
          'PARTNER - ID Annulation': annulationId,
          'PARTNER - Telephone': this.getPartnerValue(match, 'Telephone'),
          'PARTNER - Statut traitement': annulationId && annulationId.trim() ? 'OK' : 'En cours',
          'PARTNER - Statut Part': this.getPartnerValue(match, 'Statut Part')
        };
      });

      const fileName = `suivi_trx_a_annuler_${new Date().toISOString().split('T')[0]}.xlsx`;

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
          } else if (progress.message.includes('Erreur')) {
            this.popupService.showError(this.t('MSG.exportError'));
          }
          this.cdr.markForCheck();
        }
      });

      await this.exportOptimizationService.exportExcelOptimized(rows, columns, fileName, {
        chunkSize: 3000,
        useWebWorker: true,
        enableCompression: true
      });

    } catch (error) {
      console.error('Erreur lors de l\'export:', error);
      this.isExporting = false;
      this.popupService.showError(this.t('MSG.exportMatchesError'));
      this.cdr.markForCheck();
    }
  }

  downloadTemplate(): void {
    const columns = [
      'BO - Date',
      'BO - Agence',
      'BO - Service',
      'BO - Montant',
      'BO - Token',
      'BO - Pays',
      'BO - ENV',
      'BO - Telephone',
      'BO - Statut BO',
      'PARTNER - Transaction ID',
      'PARTNER - Date',
      'PARTNER - Montant',
      'PARTNER - ID Annulation',
      'PARTNER - Telephone',
      'PARTNER - Statut traitement',
      'PARTNER - Statut Part'
    ];
    const rows: Record<string, unknown>[] = [{
      'BO - Date': '',
      'BO - Agence': '',
      'BO - Service': '',
      'BO - Montant': '',
      'BO - Token': '',
      'BO - Pays': '',
      'BO - ENV': '',
      'BO - Telephone': '',
      'BO - Statut BO': '',
      'PARTNER - Transaction ID': '',
      'PARTNER - Date': '',
      'PARTNER - Montant': '',
      'PARTNER - ID Annulation': '',
      'PARTNER - Telephone': '',
      'PARTNER - Statut traitement': 'En cours',
      'PARTNER - Statut Part': ''
    }];
    const fileName = `modele_suivi_trx_a_annuler.xlsx`;
    this.exportOptimizationService.exportExcelOptimized(rows, columns, fileName, {
      chunkSize: 1000,
      useWebWorker: false,
      enableCompression: false
    }).catch((error) => {
      console.error('Erreur lors du téléchargement du modèle:', error);
      this.popupService.showError(this.t('MSG.exportError'));
    });
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

  private getOriginalKey(record: Record<string, any>, correctedKey: string): string {
    const keys = Object.keys(record);
    return keys.find(key => fixGarbledCharacters(key) === correctedKey) || correctedKey;
  }
}
