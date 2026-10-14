import { Component, OnInit, OnDestroy, ElementRef, ViewChild } from '@angular/core';
import { SharedUiModule } from '../../shared/shared-ui.module';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Subscription, firstValueFrom } from 'rxjs';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import {
  OPPART_SOURCE_MANUEL,
  OPPART_STATUT_EN_COURS,
  OPPART_STATUT_OK,
  Oppart,
  OppartAggregateMatch,
  OppartFilter,
  OppartImportPreviewRow,
  OppartMatchPair,
  OppartUploadResult,
  OppartValidationResult
} from '../../models/oppart.model';
import { OppartService } from '../../services/oppart.service';
import { PopupService } from '../../services/popup.service';
import * as XLSX from 'xlsx';
import { TranslateModule } from '@ngx-translate/core';
import { I18nService } from '../../services/i18n/i18n.service';
import { SheetHeaderMap, translateSheetHeaders } from '../../utils/sheet-headers.util';

/** Contexte de la recherche de sous-ensembles : garantit que la recherche se termine. */
interface AggregateSearchCtx {
  nodes: number;
  budget: number;
  truncated: boolean;
}

/**
 * Un groupe de lignes liées (même Token), découpé en deux côtés pour le PDF :
 * à gauche les lignes de la source la plus fréquente, à droite toutes les autres.
 */
interface LinkedGroupView {
  token: string;
  client: string;
  pays: string;
  /** Nombre de Type_OP / pays / client distincts dans le groupe (1 = homogène). */
  distinctClients: string[];
  distinctTypes: string[];
  distinctPays: string[];
  /**
   * Libellé d'opération pour le titre du PDF.
   * Ex: un groupe de COMPENSE_BO + COMPENSE_PART donne « COMPENSE ».
   */
  libelleOperation: string;
  /** Source la plus fréquente : ses lignes remplissent la colonne de gauche. */
  mainSource: string;
  mainLines: Oppart[];
  mainTotal: number;
  /** Toutes les autres lignes du groupe. */
  otherLines: Oppart[];
  otherTotal: number;
  otherSources: string[];
  /** otherTotal - mainTotal. */
  solde: number;
  dateDebut: string;
  dateFin: string;
}

/**
 * Clés techniques (français, elles servent de repère de mise en forme) ->
 * libellés affichés dans l'export Excel. Voir translateSheetHeaders().
 */
const OPPART_EXPORT_HEADERS: SheetHeaderMap = {
  'ID': 'OPL.exportHeaderID',
  'Client': 'OPL.exportHeaderClient',
  'Type_OP': 'OPL.exportHeaderTypeOp',
  'Montant': 'OPL.exportHeaderAmount',
  'Date': 'OPL.exportHeaderDate',
  'ID Transaction': 'OPL.exportHeaderTransactionId',
  'Pays': 'OPL.exportHeaderCountry',
  'Source': 'OPL.exportHeaderSource',
  'Statut': 'OPL.exportHeaderStatus',
  'Token': 'OPL.exportHeaderToken',
  'Créé le': 'OPL.exportHeaderCreatedAt',
  'Mis à jour le': 'OPL.exportHeaderUpdatedAt'
};

@Component({
  selector: 'app-oppart-list',
  standalone: true,
  imports: [TranslateModule, SharedUiModule],
  templateUrl: './oppart-list.component.html',
  styleUrls: ['./oppart-list.component.scss']
})
export class OppartListComponent implements OnInit, OnDestroy {
  readonly STATUT_EN_COURS = OPPART_STATUT_EN_COURS;
  readonly STATUT_OK = OPPART_STATUT_OK;

  opparts: Oppart[] = [];
  filteredOpparts: Oppart[] = [];
  isLoading = false;
  currentPage = 1;
  pageSize = 10;
  totalPages = 1;
  Math = Math;

  // Filtres
  filterForm: FormGroup;
  clients: string[] = [];
  typeOps: string[] = [];
  pays: string[] = [];
  sources: string[] = [];
  /** Sources proposées dans le modal de création/édition (saisie libre acceptée). */
  sourceOptions: string[] = [OPPART_SOURCE_MANUEL];

  // Export PDF des lignes liées
  isExportingPdf = false;
  /** Racine offscreen capturée par html2canvas (1 bloc = 1 groupe lié). */
  @ViewChild('pdfLinkedRoot') pdfLinkedRootRef?: ElementRef<HTMLElement>;

  // Import de fichier
  @ViewChild('importFileInput') importFileInputRef?: ElementRef<HTMLInputElement>;
  isImportPanelOpen = false;
  isValidatingImport = false;
  isUploadingImport = false;
  selectedImportFile: File | null = null;
  validationResult: OppartValidationResult | null = null;
  uploadResult: OppartUploadResult | null = null;
  importErrors: string[] = [];
  /** Extensions acceptées par le sélecteur de fichier. */
  readonly importFileAccept = '.csv,.tsv,.txt,.xls,.xlsx,.xlsm';

  // Recherche de correspondance
  matchForm: FormGroup;
  matchPairs: OppartMatchPair[] = [];
  hasSearchedMatch = false;
  linkingPairKey: string | null = null;
  /** true si la liaison de la sélection multiple est en cours. */
  isLinkingSelection = false;
  /** Correspondances par agrégation : somme de N lignes = 1 ligne. */
  aggregateMatches: OppartAggregateMatch[] = [];
  /** Groupes ignorés car trop volumineux pour la recherche de somme. */
  aggregateSkippedGroups = 0;
  /** true si la recherche a été interrompue par le budget de calcul. */
  aggregateTruncated = false;
  /** Nombre max de lignes additionnées dans une correspondance par agrégation. */
  readonly maxAggregateLines = 12;
  /** Au-delà, un groupe est ignoré (la somme explose combinatoirement). */
  readonly maxAggregatePool = 18;

  // Formulaire de création/édition
  editForm: FormGroup;
  showEditModal = false;
  editingOppart: Oppart | null = null;
  isSaving = false;

  // Sélection multiple
  selectedItems: Set<number> = new Set();
  isSelectAll = false;
  isSelectionMode = false;

  // Statistiques (côté client, sur la liste filtrée)
  stats = {
    total: 0,
    montantTotal: 0,
    clientCount: 0,
    enCoursCount: 0,
    okCount: 0
  };

  private subscription = new Subscription();

  constructor(
    private oppartService: OppartService,
    private fb: FormBuilder,
    private popupService: PopupService
  ) {
    this.filterForm = this.fb.group({
      client: [''],
      typeOp: [''],
      pays: [''],
      source: [''],
      statut: [''],
      token: [''],
      dateDebut: [''],
      dateFin: [''],
      montantMin: [''],
      montantMax: ['']
    });

    this.matchForm = this.fb.group({
      tolerance: [0, [Validators.min(0)]],
      /** Recherche par somme : autorise des lignes de Types_OP différents dans un même groupe. */
      relaxedTypes: [false]
    });

    this.editForm = this.fb.group({
      client: ['', Validators.required],
      typeOp: [''],
      montant: [0, [Validators.required, Validators.min(0)]],
      dateOperation: [''],
      idTransaction: [''],
      pays: [''],
      source: [''],
      statut: [OPPART_STATUT_EN_COURS]
    });
  }

  ngOnInit(): void {
    this.loadOpparts();
    this.loadFilterOptions();
    this.setupFilterListener();
  }

  ngOnDestroy(): void {
    this.subscription.unsubscribe();
  }

  // ===================== Chargement =====================
  loadOpparts(): void {
    this.isLoading = true;
    this.subscription.add(
      this.oppartService.getOpparts().subscribe({
        next: (data) => {
          this.opparts = data;
          this.filteredOpparts = [...data];
          this.syncSelectionWithFilteredItems();
          this.calculatePagination();
          this.recalculateStats();
          this.resetMatchSearch();
          this.isLoading = false;
        },
        error: (error) => {
          console.error('Erreur lors du chargement des OPPART:', error);
          this.isLoading = false;
        }
      })
    );
  }

  loadFilterOptions(): void {
    this.subscription.add(
      this.oppartService.getFilterOptions().subscribe({
        next: (data) => {
          this.clients = data.clients || [];
          this.typeOps = data.typeOps || [];
          this.pays = data.pays || [];
          this.sources = data.sources || [];
          this.buildSourceOptions(this.sources);
        },
        error: (error) => {
          console.error('Erreur lors du chargement des options de filtres:', error);
        }
      })
    );
  }

  /** Sources proposées dans le modal : celles déjà utilisées en base + MANUEL en tête. */
  private buildSourceOptions(knownSources: string[]): void {
    const all = [OPPART_SOURCE_MANUEL, ...(knownSources || [])]
      .map(s => (s || '').trim())
      .filter(s => !!s);
    const seen = new Set<string>();
    this.sourceOptions = all.filter(s => {
      const k = s.toUpperCase();
      if (seen.has(k)) {
        return false;
      }
      seen.add(k);
      return true;
    });
  }

  setupFilterListener(): void {
    this.subscription.add(
      this.filterForm.valueChanges.subscribe(() => {
        this.currentPage = 1;
        this.applyFilters();
      })
    );
  }

  applyFilters(): void {
    const filterValue = this.filterForm.value;
    const filter: OppartFilter = {};

    if (filterValue.client) filter.client = filterValue.client;
    if (filterValue.typeOp) filter.typeOp = filterValue.typeOp;
    if (filterValue.pays) filter.pays = filterValue.pays;
    if (filterValue.source) filter.source = filterValue.source;
    if (filterValue.statut) filter.statut = filterValue.statut;
    if (filterValue.token) filter.token = String(filterValue.token).trim();
    if (filterValue.dateDebut) filter.dateDebut = new Date(filterValue.dateDebut).toISOString().slice(0, 10);
    if (filterValue.dateFin) filter.dateFin = new Date(filterValue.dateFin).toISOString().slice(0, 10);

    const montantMin = filterValue.montantMin ? parseFloat(filterValue.montantMin) : null;
    const montantMax = filterValue.montantMax ? parseFloat(filterValue.montantMax) : null;

    this.isLoading = true;
    this.subscription.add(
      this.oppartService.getOpparts(filter).subscribe({
        next: (data) => {
          let list = data;
          if (montantMin !== null) {
            list = list.filter(op => (op.montant || 0) >= montantMin!);
          }
          if (montantMax !== null) {
            list = list.filter(op => (op.montant || 0) <= montantMax!);
          }
          this.filteredOpparts = list;
          this.syncSelectionWithFilteredItems();
          this.calculatePagination();
          this.recalculateStats();
          this.resetMatchSearch();
          this.isLoading = false;
        },
        error: (error) => {
          console.error('Erreur lors de l\'application des filtres:', error);
          this.isLoading = false;
        }
      })
    );
  }

  clearFilters(): void {
    this.filterForm.reset();
    this.applyFilters();
  }

  // ===================== Statut & Token =====================
  isStatutOk(oppart: Oppart): boolean {
    return (oppart?.statut || OPPART_STATUT_EN_COURS).toUpperCase() === OPPART_STATUT_OK;
  }

  statutLabel(oppart: Oppart): string {
    return this.isStatutOk(oppart) ? 'OK' : I18nService.t('MSG.inProgress');
  }

  hasToken(oppart: Oppart): boolean {
    return !!(oppart?.token && oppart.token.trim());
  }

  /** Bascule manuellement le statut d'une ligne (EN_COURS <-> OK). */
  async toggleStatut(oppart: Oppart): Promise<void> {
    if (!oppart.id) {
      return;
    }
    const target = this.isStatutOk(oppart) ? OPPART_STATUT_EN_COURS : OPPART_STATUT_OK;
    try {
      const updated = await this.oppartService.updateStatut(oppart.id, target).toPromise();
      this.patchLocalOppart(oppart.id!, updated);
      this.showTemporaryMessage('success', I18nService.t('OPL.lignePasseeEnStatut', { id: oppart.id, statut: target === OPPART_STATUT_OK ? 'OK' : I18nService.t('MSG.inProgress') }));
    } catch (error: any) {
      console.error('Erreur lors du changement de statut:', error);
      this.showTemporaryMessage('error', I18nService.t('OPL.errChangementStatut'));
    }
  }

  /** Délier une ligne : le token est supprimé et le statut revient à « En cours ». */
  async unlinkOppart(oppart: Oppart): Promise<void> {
    if (!oppart.id) {
      return;
    }
    const confirmed = await this.popupService.showConfirmDialog(
      I18nService.t('OPL.confirmerDeliaisonMessage', { id: oppart.id, token: oppart.token, statut: I18nService.t('MSG.inProgress') }),
      I18nService.t('OPL.confirmerDeliaisonTitre')
    );
    if (!confirmed) {
      return;
    }

    try {
      const updated = await this.oppartService.unlinkOppart(oppart.id).toPromise();
      this.refreshTokenGroup(oppart.id!);
      this.patchLocalOppart(oppart.id!, updated);
      this.showTemporaryMessage('success', I18nService.t('OPL.ligneDeliee', { id: oppart.id }));
    } catch (error: any) {
      console.error('Erreur lors de la déliaison:', error);
      this.showTemporaryMessage('error', I18nService.t('OPL.errDeliaison'));
    }
  }

  /** Recharge les lignes partageant le même token (la ligne jumelle peut être hors page courante). */
  private refreshTokenGroup(id: number): void {
    const token = this.opparts.find(op => op.id === id)?.token;
    if (!token) {
      return;
    }
    this.subscription.add(
      this.oppartService.getOpparts().subscribe({
        next: (data) => {
          this.opparts = data;
          this.filteredOpparts = data;
          this.recalculateStats();
        },
        error: () => undefined
      })
    );
  }

  private patchLocalOppart(id: number, updated: Partial<Oppart> | null | undefined): void {
    if (!updated) {
      return;
    }
    const apply = (list: Oppart[]) => {
      const idx = list.findIndex(op => op.id === id);
      if (idx >= 0) {
        list[idx] = { ...list[idx], ...updated };
      }
    };
    apply(this.opparts);
    apply(this.filteredOpparts);
    this.recalculateStats();
  }

  // ===================== Recherche de correspondance =====================
  /**
   * Recherche des paires de lignes « En cours » correspondant sur client, type, montant et pays,
   * à l'intérieur des lignes actuellement filtrées du tableau.
   */
  searchMatches(): void {
    const tolerance = Math.abs(Number(this.matchForm.value.tolerance) || 0);

    // Population eligible : lignes filtrées, « En cours », sans token, avec les 4 clés renseignées.
    const candidates = this.matchableCandidates();

    if (candidates.length < 2) {
      this.matchPairs = [];
      this.aggregateMatches = [];
      this.hasSearchedMatch = true;
      this.popupService.showWarning(
        I18nService.t('OPL.pasAssezLignesEligibles', { statut: I18nService.t('MSG.inProgress') })
      );
      return;
    }

    // Regroupement des paires sur client + racine Type_OP + pays
    const groups = this.groupCandidates(candidates, false);

    // Regroupement des sommes : option « types différents autorisés » -> on relâche la
    // racine Type_OP, ce qui permet ex. COMPENSE + AJUSTEMENT_SOLDE = COMPENSE_PART.
    const relaxedTypes = !!this.matchForm.value.relaxedTypes;
    const aggregateGroups = relaxedTypes ? this.groupCandidates(candidates, true) : groups;

    const pairs: OppartMatchPair[] = [];
    const aggregates: OppartAggregateMatch[] = [];
    this.aggregateSkippedGroups = 0;
    this.aggregateTruncated = false;
    const ctx: AggregateSearchCtx = { nodes: 0, budget: 400000, truncated: false };

    for (const group of groups.values()) {
      pairs.push(...this.pairWithinGroup(group, tolerance));
    }
    for (const group of aggregateGroups.values()) {
      aggregates.push(...this.aggregateWithinGroup(group, tolerance, ctx));
    }
    this.aggregateTruncated = ctx.truncated;

    // Écart le plus faible d'abord
    pairs.sort((a, b) => a.ecart - b.ecart || (a.gauche.id! - b.gauche.id!));
    aggregates.sort((a, b) => Math.abs(a.ecart) - Math.abs(b.ecart) || (a.cible.id! - b.cible.id!));
    this.matchPairs = pairs;
    this.aggregateMatches = aggregates;
    this.hasSearchedMatch = true;
  }

  /** Lignes « En cours » du tableau filtré, sans token, avec client / type / pays renseignés. */
  private matchableCandidates(): Oppart[] {
    return (this.filteredOpparts || []).filter(op =>
      !!op.id &&
      !this.isStatutOk(op) &&
      !this.hasToken(op) &&
      this.matchKeyParts(op).every(part => !!part)
    );
  }

  /**
   * Regroupe les lignes candidates. `relaxed = true` ignore la racine Type_OP et ne
   * conserve que client + pays : une somme peut alors mélanger plusieurs Types_OP.
   */
  private groupCandidates(candidates: Oppart[], relaxed: boolean): Map<string, Oppart[]> {
    const groups = new Map<string, Oppart[]>();
    for (const op of candidates) {
      const key = relaxed
        ? [op.client, op.pays].map(v => (v || '').trim().toUpperCase()).join('|')
        : this.matchKeyParts(op).join('|').toUpperCase();
      if (!groups.has(key)) {
        groups.set(key, []);
      }
      groups.get(key)!.push(op);
    }
    return groups;
  }

  // ============== Recherche de correspondance par agrégation (somme) ==============
  /**
   * Détecte, dans un groupe (client + racine Type_OP + pays), les ensembles de lignes
   * dont la somme des montants est égale au montant d'une autre ligne du même groupe.
   * Ex: 7 lignes AIRTEL_PARTNER (43+53+63+73+83+92+93 M) = 1 ligne BO de 500 M.
   */
  private aggregateWithinGroup(
    group: Oppart[],
    tolerance: number,
    ctx: AggregateSearchCtx
  ): OppartAggregateMatch[] {
    const matches: OppartAggregateMatch[] = [];
    if (group.length < 3) {
      return matches;
    }
    if (group.length > this.maxAggregatePool) {
      // Trop de lignes : la combinatoire explose, on saute ce groupe plutôt que figer l'UI.
      this.aggregateSkippedGroups++;
      return matches;
    }

    // Les montants absolus, triés du plus grand au plus petit (indispensable au pruning).
    const byAmountDesc = [...group].sort((a, b) => Math.abs(b.montant || 0) - Math.abs(a.montant || 0));
    const amountsAll = byAmountDesc.map(o => Math.abs(o.montant || 0));

    for (let c = 0; c < byAmountDesc.length; c++) {
      const cible = byAmountDesc[c];
      const target = amountsAll[c];
      if (target === 0) {
        continue;
      }

      // Candidats : toutes les autres lignes du groupe, triées décroissante.
      const pool: Oppart[] = [];
      const poolAmounts: number[] = [];
      for (let k = 0; k < byAmountDesc.length; k++) {
        if (k !== c) {
          pool.push(byAmountDesc[k]);
          poolAmounts.push(amountsAll[k]);
        }
      }
      if (pool.length < 2) {
        continue;
      }

      // Borne haute : même en additionnant les plus grosses lignes autorisées
      // (au plus `maxAggregateLines`), la cible reste hors d'atteinte -> inutile de chercher.
      let maxReach = 0;
      const reachCount = Math.min(this.maxAggregateLines, poolAmounts.length);
      for (let k = 0; k < reachCount; k++) {
        maxReach += poolAmounts[k];
      }
      if (maxReach < target - tolerance) {
        continue;
      }
      // Borne basse : les 2 plus petites lignes restantes doivent rester sous la cible.
      let smallest2 = 0;
      for (let k = pool.length - 1; k >= 0 && smallest2 < 2; k--) {
        smallest2 += poolAmounts[k];
      }
      if (smallest2 > target + tolerance) {
        continue;
      }

      const subset = this.findSubsetSummingTo(pool, poolAmounts, target, tolerance, ctx);
      if (!subset) {
        continue;
      }

      const somme = subset.reduce((acc, o) => acc + Math.abs(o.montant || 0), 0);
      const ids = subset.map(o => o.id!).sort((a, b) => a - b);
      // La cible et toutes les lignes additionnées partagent-elles la même racine Type_OP ?
      const racineCible = OppartListComponent.typeOpRoot(cible.typeOp);
      const typesMelanges = subset.some(o => OppartListComponent.typeOpRoot(o.typeOp) !== racineCible);
      matches.push({
        cible,
        lignes: subset,
        somme,
        montantCible: target,
        ecart: somme - target,
        typesMelanges,
        matchKey: `${cible.id}-${ids.join('.')}`
      });
    }

    return matches;
  }

  /**
   * Cherche le plus petit sous-ensemble de `items` (triés par montant décroissant)
   * dont la somme est égale à `target` à `tolerance` près.
   * Les sous-ensembles sont explorés par taille croissante : on retient donc la
   * décomposition la plus simple (2 lignes avant 3, etc.).
   */
  private findSubsetSummingTo(
    items: Oppart[],
    amounts: number[],
    target: number,
    tolerance: number,
    ctx: AggregateSearchCtx
  ): Oppart[] | null {
    const n = items.length;

    // Montants triés décroissants : tous ceux qui dépassent la cible sont inutilisables
    // (toute somme positive les inclurait). On saute ce préfixe une fois pour toutes.
    let firstUsable = 0;
    while (firstUsable < n && amounts[firstUsable] > target + tolerance) {
      firstUsable++;
    }
    if (n - firstUsable < 2) {
      // Moins de 2 montants utilisables : aucune somme possible.
      return null;
    }

    // Sommes suffixes pour borner le branching factor.
    const suffix = new Array(n + 1).fill(0);
    for (let i = n - 1; i >= 0; i--) {
      suffix[i] = suffix[i + 1] + amounts[i];
    }

    const maxSize = Math.min(this.maxAggregateLines, n);
    const current: Oppart[] = [];
    for (let size = 2; size <= maxSize; size++) {
      const found = this.searchCombinations(items, amounts, suffix, firstUsable, size, 0, target, tolerance, current, ctx);
      if (found) {
        return found;
      }
      if (ctx.nodes >= ctx.budget) {
        ctx.truncated = true;
        return null;
      }
    }
    return null;
  }

  /** Énumère les combinaisons de taille exacte `size` à partir de l'index `start`. */
  private searchCombinations(
    items: Oppart[],
    amounts: number[],
    suffix: number[],
    start: number,
    size: number,
    sum: number,
    target: number,
    tolerance: number,
    current: Oppart[],
    ctx: AggregateSearchCtx
  ): Oppart[] | null {
    if (++ctx.nodes > ctx.budget) {
      return null;
    }
    const needed = size - current.length;
    if (needed === 0) {
      return Math.abs(sum - target) <= tolerance ? [...current] : null;
    }
    const n = items.length;
    if (n - start < needed) {
      return null;
    }
    // Pruning : même en prenant les `needed` plus gros montants restants, la cible
    // est-elle atteignable ? (montants triés décroissants)
    if (sum + (suffix[start] - suffix[start + needed]) < target - tolerance) {
      return null;
    }

    for (let i = start; i <= n - needed; i++) {
      const a = amounts[i];
      if (a <= 0) {
        continue;
      }
      const newSum = sum + a;
      if (newSum > target + tolerance) {
        // Montants décroissants : les suivants sont plus petits et peuvent encore
        // convenir -> on saute CE montant, on n'arrête pas la boucle.
        continue;
      }
      current.push(items[i]);
      const found = this.searchCombinations(items, amounts, suffix, i + 1, size, newSum, target, tolerance, current, ctx);
      current.pop();
      if (found) {
        return found;
      }
      if (ctx.nodes > ctx.budget) {
        return null;
      }
    }
    return null;
  }

  /** Lie toutes les lignes d'une correspondance par agrégation sous un token commun. */
  async linkAggregateMatch(match: OppartAggregateMatch): Promise<void> {
    const ids = [match.cible.id, ...match.lignes.map(l => l.id)]
      .filter((id): id is number => typeof id === 'number');
    if (ids.length < 2) {
      return;
    }
    this.linkingPairKey = match.matchKey;
    try {
      const res = await firstValueFrom(this.oppartService.linkOppartsByIds(ids));
      if (!res?.success) {
        this.showTemporaryMessage('error', res?.message || I18nService.t('OPL.liaisonImpossible'));
        return;
      }
      const token = res.token || '';
      (res.opparts || []).forEach(op => {
        if (op.id) {
          this.patchLocalOppart(op.id, op);
        }
      });
      // Les propositions qui réutilisent une de ces lignes ne sont plus valables.
      const linked = new Set(ids);
      this.aggregateMatches = this.aggregateMatches.filter(m => !this.aggregateUsesAny(m, linked));
      this.matchPairs = this.matchPairs.filter(p => !linked.has(p.gauche.id!) && !linked.has(p.droite.id!));
      this.popupService.showSuccess(
        I18nService.t('OPL.aggregateLiees', { count: ids.length, token, somme: this.formatMontant(match.somme), ligne: match.cible.id })
      );
    } catch (error: any) {
      console.error('Erreur lors de la liaison par agrégation:', error);
      this.showTemporaryMessage('error', I18nService.t('OPL.errLiaisonLignes'));
    } finally {
      this.linkingPairKey = null;
    }
  }

  private aggregateUsesAny(match: OppartAggregateMatch, ids: Set<number>): boolean {
    return ids.has(match.cible.id!) || match.lignes.some(l => ids.has(l.id!));
  }

  isAggregateLinked(match: OppartAggregateMatch): boolean {
    return this.linkingPairKey === match.matchKey;
  }

  /** Appariement glouton : pour chaque ligne, on prend la plus proche encore disponible. */
  private pairWithinGroup(group: Oppart[], tolerance: number): OppartMatchPair[] {
    const pool = [...group];
    const pairs: OppartMatchPair[] = [];

    while (pool.length > 1) {
      let bestIdxB = -1;
      let bestEcart = Number.POSITIVE_INFINITY;

      // On compare la 1re ligne disponible avec toutes les autres.
      for (let j = 1; j < pool.length; j++) {
        const ecart = Math.abs((pool[0].montant || 0) - (pool[j].montant || 0));
        if (ecart < bestEcart) {
          bestEcart = ecart;
          bestIdxB = j;
        }
      }

      if (bestIdxB < 0 || bestEcart > tolerance) {
        // Aucun partner acceptable : cette ligne reste non appariée.
        pool.splice(0, 1);
        continue;
      }

      const gauche = pool[0];
      const droite = pool[bestIdxB];
      pairs.push({
        gauche,
        droite,
        ecart: bestEcart,
        pairKey: `${gauche.id}-${droite.id}`
      });

      // Retire les 2 lignes appariées.
      pool.splice(bestIdxB, 1);
      pool.splice(0, 1);
    }

    return pairs;
  }

  private matchKeyParts(oppart: Oppart): [string, string, string] {
    return [
      (oppart.client || '').trim().toUpperCase(),
      OppartListComponent.typeOpRoot(oppart.typeOp),
      (oppart.pays || '').trim().toUpperCase()
    ];
  }

  /**
   * Racine d'un Type_OP pour la comparaison : la partie avant le premier « _ ».
   * Ex: COMPENSE_BO et COMPENSE_PART partagent la racine COMPENSE.
   * Un type sans « _ » (ex: REMBOURSEMENT MOOV) reste inchangé.
   */
  static typeOpRoot(typeOp: string | null | undefined): string {
    const v = (typeOp || '').trim().toUpperCase();
    const idx = v.indexOf('_');
    return (idx > 0 ? v.slice(0, idx) : v).trim();
  }

  /**
   * Libellé d'opération pour les titres : les racines distinctes des Type_OP du groupe.
   * COMPENSE_BO et COMPENSE_PART partagent la racine COMPENSE, donc un seul libellé.
   * Plusieurs racines (ex. COMPENSE + AJUSTEMENT) sont séparées par « + ».
   */
  static libelleOperation(roots: string[]): string {
    if (!roots.length) {
      return I18nService.t('OPL.operations');
    }
    // Tri alphabétique : le titre ne doit pas dépendre de l'ordre des lignes en base.
    return [...roots].sort().join(' + ');
  }

  /** Lie la paire validée : token commun + statut OK sur les 2 lignes. */
  async linkMatchPair(pair: OppartMatchPair): Promise<void> {
    if (!pair.gauche.id || !pair.droite.id) {
      return;
    }
    this.linkingPairKey = pair.pairKey;
    try {
      const res = await this.oppartService.linkOpparts(pair.gauche.id, pair.droite.id).toPromise();
      if (!res?.success) {
        this.showTemporaryMessage('error', res?.message || I18nService.t('OPL.liaisonImpossible'));
        return;
      }
      const token = res.token || '';
      (res.opparts || []).forEach(op => {
        if (op.id) {
          this.patchLocalOppart(op.id, op);
        }
      });
      this.matchPairs = this.matchPairs.filter(p => p.pairKey !== pair.pairKey);
      this.popupService.showSuccess(
        I18nService.t('OPL.paireLiee', { gauche: pair.gauche.id, droite: pair.droite.id, token })
      );
    } catch (error: any) {
      console.error('Erreur lors de la liaison:', error);
      this.showTemporaryMessage('error', I18nService.t('OPL.errLiaisonLignes'));
    } finally {
      this.linkingPairKey = null;
    }
  }

  isPairLinked(pair: OppartMatchPair): boolean {
    return this.linkingPairKey === pair.pairKey;
  }

  resetMatchSearch(): void {
    this.matchPairs = [];
    this.aggregateMatches = [];
    this.aggregateSkippedGroups = 0;
    this.aggregateTruncated = false;
    this.hasSearchedMatch = false;
  }

  private get nbMatchables(): number {
    return this.matchableCandidates().length;
  }

  get canSearchMatch(): boolean {
    return this.nbMatchables >= 2;
  }

  // ===================== Statistiques =====================
  private recalculateStats(): void {
    const items = this.filteredOpparts || [];
    let montantTotal = 0;
    let enCoursCount = 0;
    let okCount = 0;
    const clientSet = new Set<string>();
    for (const it of items) {
      montantTotal += (it.montant || 0);
      if (it.client) clientSet.add(it.client);
      if (this.isStatutOk(it)) {
        okCount++;
      } else {
        enCoursCount++;
      }
    }
    this.stats = {
      total: items.length,
      montantTotal,
      clientCount: clientSet.size,
      enCoursCount,
      okCount
    };
  }

  // ===================== Pagination =====================
  calculatePagination(): void {
    this.currentPage = 1;
    this.totalPages = Math.ceil((this.filteredOpparts || []).length / this.pageSize);
    if (this.totalPages === 0) {
      this.totalPages = 1;
    }
  }

  get pagedOpparts(): Oppart[] {
    const startIndex = (this.currentPage - 1) * this.pageSize;
    return (this.filteredOpparts || []).slice(startIndex, startIndex + this.pageSize);
  }

  nextPage() {
    if (this.currentPage < this.totalPages) {
      this.currentPage++;
    }
  }

  prevPage() {
    if (this.currentPage > 1) {
      this.currentPage--;
    }
  }

  goToPage(page: number) {
    if (page >= 1 && page <= this.totalPages) {
      this.currentPage = page;
    }
  }

  getVisiblePages(): number[] {
    const pages: number[] = [];
    const maxVisible = 5;
    const start = Math.max(1, this.currentPage - Math.floor(maxVisible / 2));
    const end = Math.min(this.totalPages, start + maxVisible - 1);
    for (let i = start; i <= end; i++) {
      pages.push(i);
    }
    return pages;
  }

  // ===================== Formulaires =====================
  openCreateModal(): void {
    this.editingOppart = null;
    this.editForm.reset({
      client: '',
      typeOp: '',
      montant: 0,
      dateOperation: '',
      idTransaction: '',
      pays: '',
      source: OPPART_SOURCE_MANUEL,
      statut: OPPART_STATUT_EN_COURS
    });
    this.showEditModal = true;
  }

  openEditModal(oppart: Oppart): void {
    this.editingOppart = oppart;
    this.editForm.reset({
      client: oppart.client || '',
      typeOp: oppart.typeOp || '',
      montant: oppart.montant || 0,
      dateOperation: this.toDateTimeLocal(oppart.dateOperation),
      idTransaction: oppart.idTransaction || '',
      pays: oppart.pays || '',
      source: oppart.source || '',
      statut: this.isStatutOk(oppart) ? OPPART_STATUT_OK : OPPART_STATUT_EN_COURS
    });
    this.showEditModal = true;
  }

  closeEditModal(): void {
    if (this.isSaving) {
      return;
    }
    this.hideEditModal();
  }

  /** Ferme le modal sans garde : utilisé après une sauvegarde réussie. */
  private hideEditModal(): void {
    this.showEditModal = false;
    this.editingOppart = null;
    this.editForm.reset();
  }

  private toDateTimeLocal(input: string): string {
    if (!input) {
      return '';
    }
    const d = new Date(input);
    if (!isNaN(d.getTime())) {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      const h = String(d.getHours()).padStart(2, '0');
      const mi = String(d.getMinutes()).padStart(2, '0');
      return `${y}-${m}-${day}T${h}:${mi}`;
    }
    const s = input.replace(' ', 'T');
    return s.slice(0, 16);
  }

  private optDateForApi(value: string): string {
    if (!value) {
      return '';
    }
    return value.replace('T', ' ');
  }

  async saveOppart(): Promise<void> {
    if (!this.editForm.valid) {
      await this.popupService.showWarning(I18nService.t('OPL.champsObligatoires'), I18nService.t('OPL.formulaireInvalide'));
      return;
    }

    const formValue = this.editForm.value;
    const payload: any = {
      client: (formValue.client || '').trim(),
      typeOp: (formValue.typeOp || '').trim(),
      montant: Math.abs(Number(formValue.montant) || 0),
      dateOperation: this.optDateForApi(formValue.dateOperation || ''),
      idTransaction: (formValue.idTransaction || '').trim(),
      pays: (formValue.pays || '').trim(),
      source: (formValue.source || '').trim(),
      statut: formValue.statut === OPPART_STATUT_OK ? OPPART_STATUT_OK : OPPART_STATUT_EN_COURS
    };
    if (!payload.dateOperation || payload.dateOperation.trim() === '') {
      delete payload.dateOperation;
    }

    this.isSaving = true;
    try {
      const isUpdate = !!(this.editingOppart && this.editingOppart.id);
      if (isUpdate) {
        await this.oppartService.updateOppart(this.editingOppart!.id!, payload).toPromise();
      } else {
        await this.oppartService.createOppart(payload).toPromise();
      }
      // Ferme le modal avant le popup de succès, sinon les 2 se superposent.
      this.hideEditModal();
      this.isSaving = false;
      this.loadOpparts();
      await this.popupService.showSuccess(
        isUpdate ? `✅ ${I18nService.t('OPL.opMajSucces')}` : `✅ ${I18nService.t('OPL.opCreeSucces')}`
      );
    } catch (error: any) {
      console.error('Erreur lors de la sauvegarde OPPART:', error);
      let errorMessage = I18nService.t('OPL.errSauvegardeOp');
      if (error?.error?.message) {
        errorMessage += `\n${error.error.message}`;
      } else if (error?.message) {
        errorMessage += `\n${error.message}`;
      }
      await this.popupService.showError(errorMessage);
    } finally {
      this.isSaving = false;
    }
  }

  // ===================== Suppression =====================
  async deleteOppart(id: number): Promise<void> {
    const confirmed = await this.popupService.showConfirmDialog(
      I18nService.t('OPL.confirmerSuppressionUne'),
      I18nService.t('OPL.confirmerSuppressionTitre')
    );
    if (!confirmed) {
      return;
    }

    this.isLoading = true;
    this.subscription.add(
      this.oppartService.deleteOppart(id).subscribe({
        next: (success) => {
          if (success) {
            this.opparts = this.opparts.filter(op => op.id !== id);
            this.filteredOpparts = this.filteredOpparts.filter(op => op.id !== id);
            this.calculatePagination();
            this.recalculateStats();
            this.showTemporaryMessage('success', I18nService.t('OPL.ligneSupprimee'));
          } else {
            this.showTemporaryMessage('error', I18nService.t('OPL.errSuppression'));
          }
          this.isLoading = false;
        },
        error: (error) => {
          console.error('Erreur lors de la suppression:', error);
          this.showTemporaryMessage('error', I18nService.t('OPL.errSuppression'));
          this.isLoading = false;
        }
      })
    );
  }

  async deleteSelected(): Promise<void> {
    if (this.selectedItems.size === 0) {
      await this.popupService.showWarning(I18nService.t('OPL.aucuneLigneSelectionnee'), I18nService.t('MSG.selectionRequiredTitle'));
      return;
    }

    const count = this.selectedItems.size;
    const confirmed = await this.popupService.showConfirmDialog(
      I18nService.t('OPL.confirmerSuppressionMultiple', { count }),
      I18nService.t('OPL.confirmerSuppressionTitre')
    );
    if (!confirmed) {
      return;
    }

    const ids = Array.from(this.selectedItems);
    this.isLoading = true;
    this.subscription.add(
      this.oppartService.deleteOpparts(ids).subscribe({
        next: (res) => {
          this.opparts = this.opparts.filter(op => !op.id || !this.selectedItems.has(op.id));
          this.filteredOpparts = this.filteredOpparts.filter(op => !op.id || !this.selectedItems.has(op.id));
          this.clearSelection();
          this.calculatePagination();
          this.recalculateStats();
          const msg = res?.deletedCount ? I18nService.t('OPL.supprimes', { count: res.deletedCount }) : I18nService.t('OPL.suppressionTerminee');
          this.showTemporaryMessage(res?.success ? 'success' : 'error', msg);
          this.isLoading = false;
        },
        error: (error) => {
          console.error('Erreur suppression en masse OPPART:', error);
          this.showTemporaryMessage('error', I18nService.t('OPL.errSuppressionMasse'));
          this.isLoading = false;
        }
      })
    );
  }

  // ===================== Sélection multiple =====================
  toggleSelectionMode(): void {
    this.isSelectionMode = !this.isSelectionMode;
    if (!this.isSelectionMode) {
      this.clearSelection();
    }
  }

  toggleSelectAll(): void {
    if (this.isSelectAll) {
      this.clearSelection();
    } else {
      this.selectAll();
    }
  }

  selectAll(): void {
    this.selectedItems.clear();
    this.filteredOpparts.forEach(item => {
      if (item.id) {
        this.selectedItems.add(item.id);
      }
    });
    this.isSelectAll = true;
  }

  clearSelection(): void {
    this.selectedItems.clear();
    this.isSelectAll = false;
  }

  toggleItemSelection(item: Oppart): void {
    if (item.id) {
      if (this.selectedItems.has(item.id)) {
        this.selectedItems.delete(item.id);
      } else {
        this.selectedItems.add(item.id);
      }
      this.updateSelectAllState();
    }
  }

  // ===================== Liaison manuelle d'une sélection =====================
  /** Lignes actuellement sélectionnées dans le tableau, dans l'ordre d'affichage. */
  get selectedOppartsList(): Oppart[] {
    const ids = Array.from(this.selectedItems);
    return (this.filteredOpparts || []).filter(op => op.id && ids.includes(op.id));
  }

  /** Somme des montants des lignes sélectionnées. */
  get selectedTotal(): number {
    return this.selectedOppartsList.reduce((acc, op) => acc + Math.abs(op.montant || 0), 0);
  }

  /** Nombre de Type_OP / pays distincts dans la sélection (indicateur de mélange). */
  get selectedMixedInfo(): { types: string[]; pays: string[]; clients: string[] } {
    const list = this.selectedOppartsList;
    const uniq = (values: string[]) => Array.from(new Set(values.filter(v => !!v)));
    return {
      clients: uniq(list.map(o => (o.client || '').trim().toUpperCase())),
      types: uniq(list.map(o => OppartListComponent.typeOpRoot(o.typeOp))),
      pays: uniq(list.map(o => (o.pays || '').trim().toUpperCase()))
    };
  }

  /**
   * Lie manuellement toutes les lignes cochées du tableau sous un même token.
   * Aucune vérification de somme n'est imposée : c'est une validation manuelle,
   * mais le récapitulatif des montants est affiché avant confirmation.
   */
  async linkSelected(): Promise<void> {
    const list = this.selectedOppartsList;
    const ids = list.map(o => o.id!).filter(id => typeof id === 'number');
    if (ids.length < 2) {
      this.popupService.showWarning(I18nService.t('OPL.min2LignesALier'));
      return;
    }

    const total = list.reduce((acc, op) => acc + Math.abs(op.montant || 0), 0);
    const mixed = this.selectedMixedInfo;
    const dejaLiees = list.filter(o => this.hasToken(o)).length;
    const idList = ids.slice().sort((a, b) => a - b).join(', ');

    const alertes: string[] = [];
    if (mixed.clients.length > 1) {
      alertes.push(`• ${I18nService.t('OPL.alerteClientsDifferents', { clients: mixed.clients.join(', ') })}`);
    }
    if (mixed.types.length > 1) {
      alertes.push(`• ${I18nService.t('OPL.alerteTypesDifferents', { types: mixed.types.join(', ') })}`);
    }
    if (mixed.pays.length > 1) {
      alertes.push(`• ${I18nService.t('OPL.alertePaysDifferents', { pays: mixed.pays.join(', ') })}`);
    }
    if (dejaLiees > 0) {
      alertes.push(`• ${I18nService.t('OPL.alerteDejaLiees', { count: dejaLiees })}`);
    }

    const message =
      I18nService.t('OPL.liaisonManuelleIntro', { count: ids.length }) +
      I18nService.t('OPL.liaisonManuelleLignes', { ids: idList }) +
      I18nService.t('OPL.liaisonManuelleSomme', { somme: this.formatMontant(total) }) +
      (alertes.length ? I18nService.t('OPL.liaisonManuelleAttention') + `${alertes.join('\n')}\n\n` : '') +
      I18nService.t('OPL.liaisonManuelleStatut', { count: ids.length });

    const confirmed = await this.popupService.showConfirm(message, I18nService.t('OPL.liaisonManuelleTitre'));
    if (!confirmed) {
      return;
    }

    this.isLinkingSelection = true;
    try {
      const res = await firstValueFrom(this.oppartService.linkOppartsByIds(ids));
      if (!res?.success) {
        this.showTemporaryMessage('error', res?.message || I18nService.t('OPL.liaisonImpossible'));
        return;
      }
      (res.opparts || []).forEach(op => {
        if (op.id) {
          this.patchLocalOppart(op.id, op);
        }
      });
      const token = res.token || '';
      this.clearSelection();
      // Les propositions automatiques qui réutilisent ces lignes ne sont plus valables.
      const linked = new Set(ids);
      this.aggregateMatches = this.aggregateMatches.filter(m => !this.aggregateUsesAny(m, linked));
      this.matchPairs = this.matchPairs.filter(p => !linked.has(p.gauche.id!) && !linked.has(p.droite.id!));
      this.popupService.showSuccess(
        I18nService.t('OPL.liaisonSelectionSucces', { count: ids.length, token, somme: this.formatMontant(total) })
      );
    } catch (error: any) {
      console.error('Erreur lors de la liaison de la sélection:', error);
      this.showTemporaryMessage('error', I18nService.t('OPL.errLiaisonSelection'));
    } finally {
      this.isLinkingSelection = false;
    }
  }

  // ===================== Export PDF des lignes liées =====================
  /**
   * Groupe les lignes porteuses d'un Token (donc liées) et les découpe en deux côtés :
   * à gauche la source la plus fréquente, à droite toutes les autres.
   * Un groupe = une page du PDF.
   *
   * Mémoïsé : le getter est appelé plusieurs fois par cycle de détection
   * (état du bouton, libellé et *ngFor) et le calcul trie et alloue.
   */
  /**
   * Groupes de lignes liées (Token) présents dans le filtre courant.
   * Source unique pour l'export PDF et pour ses compteurs : un filtre confine
   * donc réellement les données, et le nombre annoncé sur le bouton est celui
   * qui sera réellement exporté.
   */
  get linkedGroups(): LinkedGroupView[] {
    const rows = this.filteredOpparts || [];
    const signature = this.linkedGroupsSignature(rows);
    if (this.linkedGroupsCache && this.linkedGroupsCache.signature === signature) {
      return this.linkedGroupsCache.value;
    }
    const value = this.computeLinkedGroups(rows);
    this.linkedGroupsCache = { signature, value };
    return value;
  }

  private linkedGroupsCache: { signature: string; value: LinkedGroupView[] } | null = null;

  /** Empreinte légère : change dès qu'un Token, un montant ou un nombre de ligne change. */
  private linkedGroupsSignature(rows: Oppart[]): string {
    const tokens = new Set<string>();
    let linkedCount = 0;
    let montantSum = 0;
    for (const op of rows) {
      const t = (op.token || '').trim();
      if (!t) {
        continue;
      }
      tokens.add(t);
      linkedCount++;
      montantSum += Math.abs(op.montant || 0);
    }
    return `${Array.from(tokens).sort().join('|')}#${linkedCount}#${montantSum}`;
  }

  private computeLinkedGroups(rows: Oppart[]): LinkedGroupView[] {
    const parToken = new Map<string, Oppart[]>();
    for (const op of rows) {
      if (!this.hasToken(op)) {
        continue;
      }
      const token = (op.token || '').trim();
      if (!parToken.has(token)) {
        parToken.set(token, []);
      }
      parToken.get(token)!.push(op);
    }

    const groupes: LinkedGroupView[] = [];
    for (const [token, lignes] of parToken) {
      if (lignes.length < 2) {
        // Un token orphelin sur une seule ligne n'est pas un rapprochement.
        continue;
      }

      // Source la plus fréquente ; à égalité, la plus forte en montant, puis alphabétique.
      const parSource = new Map<string, Oppart[]>();
      for (const l of lignes) {
        const src = (l.source || '').trim() || 'NON RENSEIGNÉ';
        if (!parSource.has(src)) {
          parSource.set(src, []);
        }
        parSource.get(src)!.push(l);
      }
      const sourcesTriees = Array.from(parSource.entries()).sort((a, b) =>
        b[1].length - a[1].length ||
        this.sommeDe(b[1]) - this.sommeDe(a[1]) ||
        a[0].localeCompare(b[0])
      );
      const mainSource = sourcesTriees[0][0];
      const mainLines = this.trierPourPdf(sourcesTriees[0][1]);
      const otherLines = this.trierPourPdf(
        sourcesTriees.slice(1).flatMap(([, ls]) => ls)
      );
      const mainTotal = this.sommeDe(mainLines);
      const otherTotal = this.sommeDe(otherLines);

      const dates = lignes
        .map(l => l.dateOperation)
        .filter((d): d is string => !!d)
        .map(d => new Date(d).getTime())
        .filter(t => !isNaN(t));

      const distinct = (values: string[]) => Array.from(new Set(values.filter(v => !!v)));
      const distinctTypes = distinct(lignes.map(l => OppartListComponent.typeOpRoot(l.typeOp)));
      groupes.push({
        token,
        client: distinct(lignes.map(l => (l.client || '').trim().toUpperCase())).join(' / ') || '-',
        pays: distinct(lignes.map(l => (l.pays || '').trim().toUpperCase())).join(' / ') || '-',
        distinctClients: distinct(lignes.map(l => (l.client || '').trim().toUpperCase())),
        distinctTypes,
        distinctPays: distinct(lignes.map(l => (l.pays || '').trim().toUpperCase())),
        libelleOperation: OppartListComponent.libelleOperation(distinctTypes),
        mainSource,
        mainLines,
        mainTotal,
        otherLines,
        otherTotal,
        otherSources: sourcesTriees.slice(1).map(([src]) => src),
        solde: otherTotal - mainTotal,
        dateDebut: dates.length ? new Date(Math.min(...dates)).toLocaleDateString('fr-FR') : '-',
        dateFin: dates.length ? new Date(Math.max(...dates)).toLocaleDateString('fr-FR') : '-'
      });
    }

    return groupes;
  }

  private sommeDe(lignes: Oppart[]): number {
    return lignes.reduce((acc, o) => acc + Math.abs(o.montant || 0), 0);
  }

  get todayLabel(): string {
    return new Date().toLocaleString('fr-FR');
  }

  trackByLinkedGroup = (index: number, g: LinkedGroupView): string => g.token;

  trackByLinkedRowIndex = (index: number): number => index;

  /**
   * Aligne les deux côtés ligne à ligne pour le PDF : la colonne la plus longue
   * impose le nombre de lignes, l'autre côté se complète par « — ».
   */
  linkedRowPairs(g: LinkedGroupView): { left: Oppart | null; right: Oppart | null }[] {
    const n = Math.max(g.mainLines.length, g.otherLines.length);
    const rows: { left: Oppart | null; right: Oppart | null }[] = [];
    for (let i = 0; i < n; i++) {
      rows.push({ left: g.mainLines[i] || null, right: g.otherLines[i] || null });
    }
    return rows;
  }

  /** Tri lisible : par date, puis montant décroissant, puis id. */
  private trierPourPdf(lignes: Oppart[]): Oppart[] {
    return [...lignes].sort((a, b) => {
      const ta = a.dateOperation ? new Date(a.dateOperation).getTime() : 0;
      const tb = b.dateOperation ? new Date(b.dateOperation).getTime() : 0;
      if (!isNaN(ta) && !isNaN(tb) && ta !== tb) {
        return ta - tb;
      }
      const ma = Math.abs(a.montant || 0);
      const mb = Math.abs(b.montant || 0);
      if (ma !== mb) {
        return mb - ma;
      }
      return (a.id || 0) - (b.id || 0);
    });
  }

  get canExportLinkedPdf(): boolean {
    return !this.isExportingPdf && this.linkedGroups.length > 0;
  }

  get linkedGroupsCount(): number {
    return this.linkedGroups.length;
  }

  /** Nombre de lignes couvertes par l'export (groupes du filtre courant). */
  get linkedLinesCount(): number {
    return this.linkedGroups.reduce((acc, g) => acc + g.mainLines.length + g.otherLines.length, 0);
  }

  /**
   * Exporte les groupes de lignes liées en PDF, limités au filtre courant.
   * Chaque groupe est un bloc source principale / autres sources avec ses totaux.
   * Les blocs sont flows de haut en bas : autant de groupes que possible tiennent
   * sur une même page, seuls les groupes plus hauts qu'une page sont découpés.
   */
  async exportLinkedPdf(): Promise<void> {
    const groupes = this.linkedGroups;
    if (!groupes.length) {
      this.popupService.showWarning(
        I18nService.t('OPL.aucuneLigneLieeAExporter')
      );
      return;
    }
    // Repli sur une recherche dans le document : @ViewChild peut ne pas avoir été résolu.
    const root = this.pdfLinkedRootRef?.nativeElement
      ?? (document.querySelector('.pdf-linked-root') as HTMLElement | null);
    if (!root) {
      this.popupService.showError(I18nService.t('OPL.zonePdfIntrouvable'));
      return;
    }

    this.isExportingPdf = true;
    try {
      // Laisse Angular rendre les blocs offscreen avant la capture.
      await new Promise(resolve => setTimeout(resolve, 120));

      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const pageW = pdf.internal.pageSize.getWidth();
      const pageH = pdf.internal.pageSize.getHeight();
      const marge = 10;
      const contenuW = pageW - marge * 2;
      const contenuH = pageH - marge * 2;

      const blocs = Array.from(root.querySelectorAll<HTMLElement>('.pdf-linked-block'));
      // jsPDF crée déjà la première page.
      let pageCourante = 1;
      let curseurY = marge;
      const basPage = marge + contenuH;
      // Espace entre deux groupes consécutifs sur une même page, en mm.
      const espacement = 5;

      const nouvellePage = (): void => {
        pdf.addPage();
        pageCourante++;
        curseurY = marge;
      };

      for (const bloc of blocs) {
        const canvas = await html2canvas(bloc, {
          scale: 2,
          useCORS: true,
          logging: false,
          backgroundColor: '#ffffff'
        });
        const ratio = contenuW / canvas.width;
        const hauteurMm = canvas.height * ratio;

        if (hauteurMm > contenuH) {
          // Groupe plus long qu'une page : on le découpe en tranches, une par page.
          if (curseurY > marge) {
            nouvellePage();
          }
          const nbTranches = Math.ceil(hauteurMm / contenuH);
          const parPage = canvas.height / nbTranches;
          for (let t = 0; t < nbTranches; t++) {
            if (t > 0) {
              nouvellePage();
            }
            const tranche = document.createElement('canvas');
            tranche.width = canvas.width;
            tranche.height = Math.min(parPage, canvas.height - t * parPage);
            const ctx = tranche.getContext('2d');
            ctx!.fillStyle = '#ffffff';
            ctx!.fillRect(0, 0, tranche.width, tranche.height);
            ctx!.drawImage(canvas, 0, t * parPage, canvas.width, tranche.height, 0, 0, canvas.width, tranche.height);
            const img = tranche.toDataURL('image/png');
            pdf.addImage(
              img, 'PNG', marge, curseurY,
              contenuW, tranche.height * ratio,
              undefined, 'FAST'
            );
            curseurY = marge;
          }
          continue;
        }

        // Le groupe doit tenir dans l'espace restant de la page courante.
        // L'espacement est compté dans le test, sinon un bloc peut déborder du bas.
        const yCible = curseurY > marge ? curseurY + espacement : curseurY;
        if (yCible + hauteurMm > basPage) {
          nouvellePage();
        } else {
          curseurY = yCible;
        }
        // 'FAST' : sans lui jsPDF stocke le bitmap non compressé (7 Mo au lieu de 170 Ko pour 2 pages).
        pdf.addImage(canvas.toDataURL('image/png'), 'PNG', marge, curseurY, contenuW, hauteurMm, undefined, 'FAST');
        curseurY += hauteurMm;
      }

      // Numérotation des pages
      const total = pdf.getNumberOfPages();
      for (let p = 1; p <= total; p++) {
        pdf.setPage(p);
        pdf.setFontSize(8);
        pdf.setTextColor(150);
        pdf.text(`Page ${p} / ${total}`, pageW - marge, pageH - 4, { align: 'right' });
        pdf.text(`Lignes liees - ${new Date().toLocaleDateString('fr-FR')}`, marge, pageH - 4, { align: 'left' });
      }

      const nomFichier = `Lignes-liees-${this.buildPdfTimestamp()}.pdf`;
      pdf.save(nomFichier);
      this.popupService.showSuccess(
        I18nService.t('OPL.exportPdfSucces', { groupes: groupes.length, lignes: this.linkedLinesCount, pages: total, fichier: nomFichier })
      );
    } catch (error: any) {
      console.error('Erreur lors de l export PDF des lignes liees:', error);
      this.popupService.showError(I18nService.t('OPL.errExportPdf'));
    } finally {
      this.isExportingPdf = false;
    }
  }

  /** Horodatage compact pour le nom de fichier : AAAAMMJJ-HHMMSS. */
  private buildPdfTimestamp(): string {
    const d = new Date();
    const p = (v: number, l = 2) => String(v).padStart(l, '0');
    return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
  }

  updateSelectAllState(): void {
    const allFiltered = this.filteredOpparts || [];
    const selectedCount = allFiltered.filter(item => item.id && this.selectedItems.has(item.id)).length;
    this.isSelectAll = selectedCount === allFiltered.length && allFiltered.length > 0;
  }

  private syncSelectionWithFilteredItems(): void {
    if (this.selectedItems.size === 0) {
      this.isSelectAll = false;
      return;
    }
    const allowedIds = new Set(this.filteredOpparts.map(item => item.id).filter((id): id is number => typeof id === 'number'));
    Array.from(this.selectedItems).forEach(id => {
      if (!allowedIds.has(id)) {
        this.selectedItems.delete(id);
      }
    });
    this.updateSelectAllState();
  }

  getSelectedCount(): number {
    return this.selectedItems.size;
  }

  hasSelection(): boolean {
    return this.selectedItems.size > 0;
  }

  isItemSelected(item: Oppart): boolean {
    return item.id ? this.selectedItems.has(item.id) : false;
  }

  // ===================== Affichage =====================
  formatDate(dateString: string): string {
    if (!dateString) {
      return '-';
    }
    const d = new Date(dateString);
    if (isNaN(d.getTime())) {
      return dateString;
    }
    return d.toLocaleString('fr-FR');
  }

  formatMontant(montant: number): string {
    return new Intl.NumberFormat('fr-FR', {
      style: 'currency',
      currency: 'XAF'
    }).format(montant || 0);
  }

  private showTemporaryMessage(type: 'success' | 'error', message: string): void {
    this.popupService.showWarning(message);
  }

  // ===================== Import de fichier =====================

  toggleImportPanel(): void {
    this.isImportPanelOpen = !this.isImportPanelOpen;
    if (!this.isImportPanelOpen) {
      this.resetImportState();
    }
  }

  /** Ouvre le sélecteur de fichier natif. */
  triggerImportInput(): void {
    this.importFileInputRef?.nativeElement.click();
  }

  /** Sélection d'un fichier : relance immédiatement l'analyse pour l'aperçu. */
  onImportFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files && input.files.length ? input.files[0] : null;
    // Vide l'input pour pouvoir re-sélectionner le même fichier ensuite.
    input.value = '';
    if (!file) {
      this.resetImportState();
      return;
    }
    this.selectedImportFile = file;
    this.uploadResult = null;
    this.importErrors = [];
    this.validateImportFile();
  }

  /** Analyse le fichier sans l'enregistrer : remplit l'aperçu et le résumé. */
  validateImportFile(): void {
    if (!this.selectedImportFile) {
      this.importErrors = [I18nService.t('OPL.aucunFichierSelectionne')];
      return;
    }
    this.isValidatingImport = true;
    this.validationResult = null;
    this.uploadResult = null;
    this.importErrors = [];
    this.subscription.add(
      this.oppartService.validateOppartFile(this.selectedImportFile).subscribe({
        next: (result) => {
          this.validationResult = result;
          this.importErrors = result.errors || [];
          this.isValidatingImport = false;
        },
        error: (error) => {
          this.isValidatingImport = false;
          this.importErrors = [this.extractHttpError(error, I18nService.t('OPL.errAnalyseFichier'))];
        }
      })
    );
  }

  /** Importe le fichier analysé, puis recharge la liste. */
  uploadImportFile(): void {
    if (!this.selectedImportFile) {
      this.importErrors = [I18nService.t('OPL.aucunFichierSelectionne')];
      return;
    }
    this.isUploadingImport = true;
    this.uploadResult = null;
    this.subscription.add(
      this.oppartService.uploadOppartFile(this.selectedImportFile).subscribe({
        next: (result) => {
          this.uploadResult = result;
          this.isUploadingImport = false;
          if (result.count > 0) {
            this.popupService.showSuccess(result.message || I18nService.t('OPL.importTermine'));
            this.selectedImportFile = null;
            this.validationResult = null;
            this.loadOpparts();
          } else if (result.duplicates > 0) {
            this.popupService.showWarning(
              result.message || I18nService.t('OPL.lignesDejaPresentes')
            );
            this.selectedImportFile = null;
            this.validationResult = null;
            this.loadOpparts();
          } else {
            this.importErrors = result.errors?.length
              ? result.errors
              : [I18nService.t('OPL.aucuneLigneImportee')];
          }
        },
        error: (error) => {
          this.isUploadingImport = false;
          this.importErrors = [this.extractHttpError(error, I18nService.t('OPL.errImportFichier'))];
        }
      })
    );
  }

  /** Télécharge le modèle XLSX d'import. */
  downloadImportTemplate(): void {
    this.subscription.add(
      this.oppartService.downloadTemplate().subscribe({
        next: (blob) => {
          const url = window.URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = url;
          link.download = 'modele-oppart.xlsx';
          link.click();
          window.URL.revokeObjectURL(url);
          this.showTemporaryMessage('success', I18nService.t('OPL.modeleTelecharge'));
        },
        error: () => {
          this.popupService.showError(I18nService.t('OPL.errTelechargementModele'));
        }
      })
    );
  }

  resetImportState(): void {
    this.selectedImportFile = null;
    this.validationResult = null;
    this.uploadResult = null;
    this.importErrors = [];
    this.isValidatingImport = false;
    this.isUploadingImport = false;
  }

  /** Extrait un message d'erreur exploitable d'une réponse HTTP ou réseau. */
  private extractHttpError(error: any, fallback: string): string {
    const body = error?.error;
    if (typeof body === 'string' && body.trim()) {
      return this.stripHtml(body);
    }
    if (body?.message) {
      return body.message;
    }
    return error?.message || fallback;
  }

  private stripHtml(value: string): string {
    return value.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  }

  /** Lignes d'aperçu à afficher. */
  get importPreviewRows(): OppartImportPreviewRow[] {
    return this.validationResult?.preview || [];
  }

  /** Nombre de lignes réellement insérées : valides moins les doublons. */
  get importableCount(): number {
    const result = this.validationResult;
    if (!result) {
      return 0;
    }
    return Math.max(0, (result.validLines || 0) - (result.duplicates || 0));
  }

  /** Nombre de lignes affichées dans l'aperçu sur le total lu. */
  get importPreviewTruncated(): boolean {
    const total = this.validationResult?.totalReceived ?? 0;
    return total > this.importPreviewRows.length;
  }

  get canUploadImport(): boolean {
    return !!this.selectedImportFile
      && !this.isValidatingImport
      && !this.isUploadingImport
      && this.importableCount > 0;
  }

  get isImportBusy(): boolean {
    return this.isValidatingImport || this.isUploadingImport;
  }

  // ===================== Export =====================
  exportOpparts(): void {
    if (!this.filteredOpparts.length) {
      this.popupService.showWarning(I18nService.t('MSG.noDataToExport'));
      return;
    }

    const exportData = this.filteredOpparts.map(op => ({
      'ID': op.id ?? '',
      'Client': op.client || '',
      'Type_OP': op.typeOp || '',
      'Montant': op.montant || 0,
      'Date': op.dateOperation || '',
      'ID Transaction': op.idTransaction || '',
      'Pays': op.pays || '',
      'Source': op.source || '',
      'Statut': this.statutLabel(op),
      'Token': op.token || '',
      'Crée le': op.createdAt || '',
      'Mis à jour le': op.updatedAt || ''
    }));

    const worksheet = XLSX.utils.json_to_sheet(exportData);
    translateSheetHeaders(worksheet, OPPART_EXPORT_HEADERS);
    const columnWidths = [
      { wch: 8 }, { wch: 22 }, { wch: 14 }, { wch: 14 }, { wch: 20 }, { wch: 22 },
      { wch: 14 }, { wch: 16 }, { wch: 12 }, { wch: 24 }, { wch: 20 }, { wch: 20 }
    ];
    worksheet['!cols'] = columnWidths;

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'OPPART');
    const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
    const blob = new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });

    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `oppart-${new Date().toISOString().split('T')[0]}.xlsx`;
    link.click();
    window.URL.revokeObjectURL(url);

    this.popupService.showSuccess(I18nService.t('OPL.exportReussi', { count: this.filteredOpparts.length }));
  }
}