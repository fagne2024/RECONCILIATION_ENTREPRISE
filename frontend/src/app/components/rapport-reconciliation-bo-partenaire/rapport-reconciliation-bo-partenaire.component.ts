import {
  ChangeDetectorRef,
  Component,
  ElementRef,
  OnDestroy,
  OnInit,
  ViewChild
} from '@angular/core';
import { Router } from '@angular/router';
import { TranslateService } from '@ngx-translate/core';
import { HttpClient, HttpErrorResponse, HttpHeaders, HttpParams } from '@angular/common/http';
import { FormControl } from '@angular/forms';
import { forkJoin, Observable, of, Subscription, throwError } from 'rxjs';
import { catchError, debounceTime, map, switchMap } from 'rxjs/operators';
import { AppStateService } from '../../services/app-state.service';
import { countriesMatch, countryNameFromCode } from '../../utils/country-codes.util';
import { EcartBoSummary, EcartBoSummaryService } from '../../services/ecart-bo-summary.service';
import { DashboardService, ReleveManualRangeRow } from '../../services/dashboard.service';
import {
  RECONCILIATION_ENV_OPTIONS,
  normalizeReconciliationReportEnv
} from '../../constants/reconciliation-env-options';
import { BO_PARTENAIRE_SERVICE_GROUP_TOKENS } from '../../constants/bo-partenaire-service-group-tokens';
import { PopupService } from '../../services/popup.service';
import { BoPartenaireReportCacheService } from '../../services/bo-partenaire-report-cache.service';
import { BoPartenaireResult8Row } from '../../services/bo-partenaire-aggregation.service';
import {
  auditSnapshotStatutClass as statutAuditPillClassFn,
  auditSnapshotTraitementClass as traitementAuditPillClassFn,
  resolveTraitementKind,
  traitementDisplayLabel,
  statutFromTraitementDisplayLabel
} from '../../shared/result8rec-audit-display';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import * as XLSX from 'xlsx';

/** Entrées GET /api/result8rec/{id}/audit-history (même modèle que le rapport réconciliation détaillé). */
interface Result8RecAuditEntry {
  id: number;
  actionType: string;
  username?: string;
  traitementSnapshot?: string;
  statusSnapshot?: string;
  detail?: string;
  createdAt?: string;
}

/** Historique affiché sous le tableau : regroupement par service rapport, puis par ligne result8rec. */
export interface AuditSectionByService {
  serviceName: string;
  lignes: Array<{
    id: number;
    subtitle: string;
    entries: Result8RecAuditEntry[];
  }>;
}

interface Result8Row {
  id?: number;
  date: string;
  service: string;
  country: string;
  env?: string;
  agency?: string;
  totalTransactions: number;
  totalVolume: number;
  matches?: number;
  boOnly?: number;
  partnerOnly?: number;
  mismatches?: number;
  status: string;
  traitement?: string;
  username?: string;
  glpiId?: string;
}

/** Une ligne = un service ; montants alignés sur le relevé (rapport + manuel + écarts partenaire J±1). */
export interface BoPartenaireRow {
  service: string;
  /** Libellé dominant issu des lignes result8rec (même source que le rapport). */
  traitement: string;
  boNombre: number;
  boVolume: number;
  partenaireNombre: number;
  partenaireVolume: number;
  /** (BO − Partenaire) − J-1 + J+1 (mêmes J±1 que les colonnes Décalage). */
  ecartNombre: number;
  /** (BO − Partenaire) − J-1 + J+1 (mêmes J±1 que les colonnes Décalage). */
  ecartVolume: number;
  tauxVolume: number | null;
  /** Écarts plateforme Partenaire, date veille du rapport (relevé J-1). */
  decalageJm1Nombre: number;
  decalageJm1Volume: number;
  /** Écarts plateforme Partenaire, date du rapport (relevé J+1). */
  decalageJp1Nombre: number;
  decalageJp1Volume: number;
  /**
   * Ids result8rec du périmètre courant pour ce service (plusieurs lignes si multi-agences / dates).
   * Utilisés pour charger l’historique d’audit.
   */
  result8recIds?: number[];
}

/** Regroupement tableau (même pays / ENV filtre : services liés par une sous-chaîne commune). */
export interface BoPartenaireTableGroup {
  id: string;
  label: string;
  members: BoPartenaireRow[];
  aggregate: BoPartenaireRow;
}

export type BoPartenaireDisplayLine =
  | { type: 'single'; row: BoPartenaireRow }
  | {
      type: 'group-header';
      id: string;
      label: string;
      aggregate: BoPartenaireRow;
      count: number;
    }
  | { type: 'group-detail'; groupId: string; row: BoPartenaireRow };

@Component({
  selector: 'app-rapport-reconciliation-bo-partenaire',
  templateUrl: './rapport-reconciliation-bo-partenaire.component.html',
  styleUrls: ['./rapport-reconciliation-bo-partenaire.component.scss']
})
export class RapportReconciliationBoPartenaireComponent implements OnInit, OnDestroy {
  readonly envOptions: string[] = ['ALL', ...RECONCILIATION_ENV_OPTIONS];
  private static readonly ALL_COUNTRIES = 'ALL';

  loading = false;
  /** Relevé manuel en arrière-plan (le tableau reste visible). */
  manualLoading = false;
  error: string | null = null;
  emptyScopeHint: string | null = null;

  selectedCountry = RapportReconciliationBoPartenaireComponent.ALL_COUNTRIES;
  /** Évite d’écraser un choix explicite « Tous les pays » après le premier chargement. */
  private countryAutoSelected = false;
  /** Borne inclusive du filtre période (format `yyyy-MM-dd` pour `<input type="date">`). */
  dateDebut = '';
  dateFin = '';
  selectedEnv = 'ALL';

  countries: string[] = [];
  /** Services disponibles pour le périmètre pays / date / ENV (liste du filtre multiple). */
  availableServices: string[] = [];
  /** Options affichées dans le select (filtrées par la recherche). */
  filteredServicesForSelect: string[] = [];
  /** Vide = tous les services du périmètre (quand la recherche est vide). */
  selectedServices: string[] = [];

  /** Recherche dans la liste des services (sélection = tous les résultats correspondants en temps réel). */
  serviceSearchCtrl = new FormControl<string>('', { nonNullable: true });

  commentaire = '';

  utilisateurLigneRapport = '';

  serviceRows: BoPartenaireRow[] = [];

  /** Blocs groupe / singleton pour le tableau (recalculé depuis `serviceRows`). */
  tableDisplayBlocks: BoPartenaireTableGroup[] = [];
  /** Lignes à parcourir dans le template (simple, en-tête de groupe, détail). */
  displayLines: BoPartenaireDisplayLine[] = [];
  /** Identifiants de groupes multi-services dont le détail est affiché. */
  expandedGroupIds = new Set<string>();

  /** Lignes du tableau avec panneau historique déplié (clés d’affichage uniques). */
  private readonly expandedAuditKeys = new Set<string>();
  /** Une entrée par id result8rec après chargement (sans fusion chronologique inter-lignes). */
  private readonly auditHistoryByRecId = new Map<number, Result8RecAuditEntry[]>();
  /** Empreinte d’ensemble d’ids → chargement terminé avec succès. */
  private readonly auditLoadedFingerprints = new Set<string>();
  private readonly auditLoadingFingerprints = new Set<string>();
  /** Métadonnées rapport pour libellés (service, agence, date) par id result8rec. */
  private readonly metaByResult8RecId = new Map<number, { service: string; agency: string; date: string; env?: string }>();

  readonly auditHistoryColspan = 15;

  readonly auditSnapshotTraitementClass = traitementAuditPillClassFn;
  readonly auditSnapshotStatutClass = statutAuditPillClassFn;

  /**
   * Tokens de regroupement (plus long d’abord) : le libellé affiché est exactement celui de la constante
   * (ex. CASHINOM), pas un extrait du nom de service.
   */
  private readonly serviceGroupTokensSorted = [...BO_PARTENAIRE_SERVICE_GROUP_TOKENS].sort(
    (a, b) => b.length - a.length
  );

  totalBoNombre = 0;
  totalBoVolume = 0;
  totalMatchesBo = 0;
  totalPartNombre = 0;
  totalPartVolume = 0;
  totalDecJm1Nombre = 0;
  totalDecJm1Volume = 0;
  totalDecJp1Nombre = 0;
  totalDecJp1Volume = 0;
  servicesAvecEcart = 0;
  totalServices = 0;

  /**
   * Sous-en-têtes (comme les colonnes Écarts BO / Partenaire du rapport) :
   * total boOnly / partnerOnly sur le périmètre affiché → « N en cours » ou « Effectif ».
   */
  /** Écarts en cours (bruts) ; les sous-en-têtes sont recalculés à chaque rendu. */
  ecartBoOnlyCount = 0;
  ecartPartnerOnlyCount = 0;

  get statutEcartBoEntete(): string {
    return this.libelleStatutEcartFromCount(this.ecartBoOnlyCount);
  }

  get statutEcartPartenaireEntete(): string {
    return this.libelleStatutEcartFromCount(this.ecartPartnerOnlyCount);
  }

  isExportingPdf = false;
  isExportingExcel = false;

  @ViewChild('rrbpPdfExportContent') pdfExportContentRef?: ElementRef<HTMLDivElement>;

  private subs = new Subscription();
  private rawReport: Result8Row[] = [];
  private ecartAll: EcartBoSummary[] = [];
  private manualRows: ReleveManualRangeRow[] = [];
  private readonly numberFormatter = new Intl.NumberFormat('fr-FR');

  /** Dernier périmètre chargé pour /manual-trx/range (évite un appel HTTP à chaque frappe). */
  private lastManualFetchKey = '';
  /** Dernier périmètre chargé pour result8rec + écarts (évite de charger toute la table à chaque affichage). */
  private lastReportFetchKey = '';
  private loadSeq = 0;
  private manualFetchSub?: Subscription;
  /** Pays autorisés (API /api/result8rec/filters), indépendamment du pays affiché par défaut. */
  private countriesFromFilters: string[] = [];
  /** Contexte du dernier filtre rapport (recalcul tableau sans HTTP si seule la recherche change). */
  private lastFilteredRows: Result8Row[] = [];
  private lastEnvNorm: string | null = null;

  constructor(
    private http: HttpClient,
    private router: Router,
    private cdr: ChangeDetectorRef,
    private appState: AppStateService,
    private ecartBoSummaryService: EcartBoSummaryService,
    private dashboardService: DashboardService,
    private popupService: PopupService,
    private reportCache: BoPartenaireReportCacheService,
    private translate: TranslateService
  ) {}

  private t(key: string, params?: any): string {
    return this.translate.instant(key, params) as string;
  }

  /** Traducteur transmis aux helpers partagés (le `this` doit rester lié). */
  private displayT = (key: string): string => this.t(key);

  ngOnInit(): void {
    const def = this.toYmd(this.addCalendarDays(new Date(), -1));
    this.dateDebut = def;
    this.dateFin = def;
    this.subs.add(
      this.serviceSearchCtrl.valueChanges.subscribe(() => {
        this.onServiceSearchTextChanged();
      })
    );
    this.subs.add(
      this.appState.dataUpdate$.pipe(debounceTime(500)).subscribe(() => {
        this.lastReportFetchKey = '';
        this.lastManualFetchKey = '';
        if (!this.loading) {
          this.loadDonnees();
        }
      })
    );
    this.subs.add(
      this.appState.ensureUserPaysScope().pipe(
        switchMap(() =>
          this.dashboardService.getReconciliationFilters().pipe(
            catchError(() =>
              of({ countries: [] as string[], services: [], countryServices: {} })
            )
          )
        ),
        catchError(() => of({ countries: [] as string[], services: [], countryServices: {} }))
      ).subscribe((filters) => {
        this.countriesFromFilters = (filters?.countries || [])
          .map((c) => (c || '').trim())
          .filter(Boolean);
        this.refreshCountriesList();
        this.loadDonnees();
      })
    );
  }

  ngOnDestroy(): void {
    this.manualFetchSub?.unsubscribe();
    this.subs.unsubscribe();
  }

  get displayUserName(): string {
    const u = (this.utilisateurLigneRapport || '').trim();
    if (u) {
      return u;
    }
    return this.appState.getUsername() || '—';
  }

  /** Aligne les valeurs du multi-select avec les options (espaces / Material). */
  compareServiceOption(v1: unknown, v2: unknown): boolean {
    return String(v1 ?? '').trim() === String(v2 ?? '').trim();
  }

  trackByString(_: number, value: string): string {
    return value;
  }

  trackByDisplayLine(_: number, line: BoPartenaireDisplayLine): string {
    if (line.type === 'single') {
      return `single:${line.row.service}`;
    }
    if (line.type === 'group-header') {
      return `group:${line.id}`;
    }
    return `detail:${line.groupId}:${line.row.service}`;
  }

  trackByAuditServiceSection(_: number, section: AuditSectionByService): string {
    return section.serviceName;
  }

  trackByAuditLine(_: number, line: { id: number }): number {
    return line.id;
  }

  trackByAuditEntry(_: number, entry: Result8RecAuditEntry): number {
    return entry.id;
  }

  get subtitle(): string {
    const pays = this.selectedCountry || '—';
    const env = this.selectedEnv === 'ALL' ? this.t('RBP.th.boAllEnvs') : this.selectedEnv;
    const r = this.getNormalizedDateRange();
    return r
      ? this.t('RBP.subtitle.range', {
          country: pays,
          start: this.formatFrShort(r.start),
          end: this.formatFrShort(r.end),
          env
        })
      : this.t('RBP.subtitle.noRange', { country: pays, env });
  }

  /** KPI + pied de tableau : même formule que la colonne Écart (−J-1 +J+1). */
  get totalEcartNombreAjuste(): number {
    return (
      this.totalBoNombre -
      this.totalPartNombre -
      this.totalDecJm1Nombre +
      this.totalDecJp1Nombre
    );
  }

  get totalEcartVolumeAjuste(): number {
    return (
      this.totalBoVolume -
      this.totalPartVolume -
      this.totalDecJm1Volume +
      this.totalDecJp1Volume
    );
  }

  retourRapport(): void {
    this.router.navigate(['/reconciliation-report']);
  }

  ouvrirControleInterne(): void {
    const range = this.getNormalizedDateRange();
    const year = range?.start.substring(0, 4) ?? String(new Date().getFullYear());
    let month: string | undefined;
    if (range && range.start.substring(0, 7) === range.end.substring(0, 7)) {
      month = range.start.substring(5, 7);
    }

    if (range && this.selectedCountry) {
      this.reportCache.publish({
        rawReport: this.toCacheReportRows(this.rawReport),
        ecartAll: this.ecartAll,
        manualRows: this.manualRows,
        dateDebut: range.start,
        dateFin: range.end,
        selectedCountry: this.selectedCountry,
        selectedEnv: this.selectedEnv
      });
    }

    const serviceParam =
      this.selectedServices.length === 1 ? this.selectedServices[0] : undefined;

    this.router.navigate(['/controle-interne-bo-partenaire'], {
      queryParams: {
        country: this.selectedCountry || undefined,
        env: this.selectedEnv || undefined,
        year,
        month: month || undefined,
        dateDebut: range?.start,
        dateFin: range?.end,
        service: serviceParam
      }
    });
  }

  private toCacheReportRows(rows: Result8Row[]): BoPartenaireResult8Row[] {
    return rows.map((r) => ({
      id: r.id,
      date: r.date,
      service: r.service,
      country: r.country,
      env: r.env,
      totalTransactions: r.totalTransactions,
      totalVolume: r.totalVolume,
      traitement: r.traitement,
      glpiId: (r as Result8Row & { glpiId?: string }).glpiId
    }));
  }

  appliquerFiltres(): void {
    if (this.shouldReloadRemoteData()) {
      this.loadDonnees();
      return;
    }
    this.rebuildTable();
    const range = this.getNormalizedDateRange();
    if (range) {
      this.loadDecalagesForRange(this.buildEcartFilterForRange(range), this.loadSeq);
    }
  }

  /** Recharge result8rec + écarts + relevé manuel sans réinitialiser pays, dates, ENV ni services. */
  refreshRapportData(): void {
    if (this.loading) {
      return;
    }
    this.lastReportFetchKey = '';
    this.lastManualFetchKey = '';
    this.loadDonnees();
  }

  private buildManualFetchKey(dateStart: string, dateEnd: string): string {
    const svc = [...this.availableServices].sort().join('\u001e');
    return `${dateStart}|${dateEnd}|${this.selectedCountry}|${this.selectedEnv}|${svc}`;
  }

  private buildReportFetchKey(dateStart: string, dateEnd: string): string {
    return `${dateStart}|${dateEnd}`;
  }

  private shouldReloadRemoteData(): boolean {
    const range = this.getNormalizedDateRange();
    if (!range) {
      return false;
    }
    return this.buildReportFetchKey(range.start, range.end) !== this.lastReportFetchKey;
  }

  /** Période normalisée (inclusive) ; échange début/fin si besoin. */
  private getNormalizedDateRange(): { start: string; end: string } | null {
    let a = this.formatDateForSearch(this.dateDebut);
    let b = this.formatDateForSearch(this.dateFin);
    if (!a || !b) {
      return null;
    }
    if (a > b) {
      const t = a;
      a = b;
      b = t;
    }
    return { start: a, end: b };
  }

  private formatFrShort(ymd: string): string {
    const m = ymd.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) {
      return ymd;
    }
    return `${m[3]}/${m[2]}/${m[1]}`;
  }

  private isYmdInRangeInclusive(ymd: string, start: string, end: string): boolean {
    const d = this.formatDateForSearch(ymd);
    return d >= start && d <= end;
  }

  private addCalendarDaysToYmd(ymd: string, days: number): string {
    const base = this.formatDateForSearch(ymd);
    const m = base.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) {
      return base;
    }
    const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    d.setDate(d.getDate() + days);
    return this.toYmd(d);
  }

  /** Jours calendaires de `start` à `end` inclus (ordre croissant). */
  private listYmdInclusive(start: string, end: string): string[] {
    const s = this.formatDateForSearch(start);
    const e = this.formatDateForSearch(end);
    if (!s || !e || s > e) {
      return [];
    }
    const out: string[] = [];
    let cur = s;
    let guard = 0;
    while (cur <= e && guard++ < 500) {
      out.push(cur);
      cur = this.addCalendarDaysToYmd(cur, 1);
    }
    return out;
  }

  /** True si le champ de recherche du multi-select contient du texte. */
  private hasActiveServiceSearch(): boolean {
    return !!(this.serviceSearchCtrl.value || '').trim();
  }

  /**
   * À chaque frappe : la sélection = exactement les services visibles (résultat du filtre).
   * Recherche vidée : [] = tous les services pour le tableau (comportement historique).
   */
  private onServiceSearchTextChanged(): void {
    this.updateFilteredServicesListOnly();
    const q = (this.serviceSearchCtrl.value || '').trim().toLowerCase();
    if (!q) {
      this.selectedServices = [];
    } else {
      this.selectedServices = this.availableServices.filter((s) => s.toLowerCase().includes(q));
    }
    this.cdr.markForCheck();
    this.appliquerFiltres();
  }

  /**
   * Après rechargement des données : si une recherche est active, réaligner la sélection sur les nouveaux matchs.
   * Si recherche vide, ne pas toucher à `selectedServices` (sélection manuelle éventuelle sans filtre).
   */
  private syncSelectedServicesWithActiveSearchAfterReload(): void {
    const q = (this.serviceSearchCtrl.value || '').trim().toLowerCase();
    if (!q) {
      return;
    }
    this.selectedServices = this.availableServices.filter((s) => s.toLowerCase().includes(q));
  }

  /**
   * Filtre la liste affichée dans le panneau du select (sans changer la sélection).
   */
  private updateFilteredServicesListOnly(): void {
    const q = (this.serviceSearchCtrl.value || '').trim().toLowerCase();
    if (!q) {
      this.filteredServicesForSelect = [...this.availableServices];
      return;
    }
    this.filteredServicesForSelect = this.availableServices.filter((s) => s.toLowerCase().includes(q));
  }

  private getServicesToDisplay(): string[] {
    const pick = (s: string) =>
      this.selectedServices.some((sel) => this.compareServiceOption(sel, s));

    if (this.hasActiveServiceSearch()) {
      return this.availableServices.filter(pick);
    }
    if (this.selectedServices.length === 0) {
      return [...this.availableServices];
    }
    return this.availableServices.filter(pick);
  }

  private loadDonnees(): void {
    this.loading = true;
    this.error = null;
    this.emptyScopeHint = null;
    const seq = ++this.loadSeq;
    const range = this.getNormalizedDateRange();
    if (!range) {
      this.rawReport = [];
      this.ecartAll = [];
      this.lastReportFetchKey = '';
      this.rebuildTable();
      this.loading = false;
      return;
    }

    const headers = new HttpHeaders({
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      Pragma: 'no-cache',
      Expires: '0',
      'X-Permission-Module': 'Résultats'
    });
    // Pas de filtre pays côté API : tous les pays du périmètre date sont chargés, filtrage client via selectedCountry.
    const ecartFilter = this.buildEcartFilterForRange(range);

    this.subs.add(
      this.fetchReportRowsForRange(range, headers).subscribe({
        next: (report) => {
          if (seq !== this.loadSeq) {
            return;
          }
          this.rawReport = this.mapReportRows(report);
          this.ecartAll = [];
          this.lastReportFetchKey = this.buildReportFetchKey(range.start, range.end);
          this.refreshCountriesList();
          this.autoSelectCountryAfterLoad(range.start, range.end);

          const range0 = this.getNormalizedDateRange();
          if (range0) {
            if (this.selectedCountry !== RapportReconciliationBoPartenaireComponent.ALL_COUNTRIES) {
              this.adjustCountryIfNoRowsForCurrentSlice(range0.start, range0.end);
            }
            if (this.selectedEnv !== 'ALL') {
              this.adjustEnvIfNoRowsForCurrentSlice(range0.start, range0.end);
            }
          }

          if (
            this.selectedCountry &&
            !this.countRowsForCountryDateRangeEnv(
              this.selectedCountry,
              range.start,
              range.end,
              this.selectedEnv === 'ALL'
                ? null
                : normalizeReconciliationReportEnv(this.selectedEnv)
            )
          ) {
            this.emptyScopeHint = this.t('RBP.emptyScope');
          }

          this.rebuildTable();
          this.loading = false;
          this.cdr.markForCheck();
          this.loadDecalagesForRange(ecartFilter, seq);
        },
        error: (e) => {
          if (seq !== this.loadSeq) {
            return;
          }
          console.error(e);
          this.error = this.resolveLoadError(e);
          this.loading = false;
          this.cdr.markForCheck();
        }
      })
    );
  }

  /** Filtre API écarts J±1 (plateforme Partenaire, fenêtre J-1 → fin de période). */
  private buildEcartFilterForRange(range: { start: string; end: string }): {
    startDate: string;
    endDate: string;
    platform: string;
    env?: string;
    pays?: string;
  } {
    const filter: {
      startDate: string;
      endDate: string;
      platform: string;
      env?: string;
      pays?: string;
    } = {
      startDate: this.subtractCalendarDaysFromYmd(range.start, 1),
      endDate: range.end,
      platform: 'PARTENAIRE'
    };
    if (this.selectedEnv && this.selectedEnv !== 'ALL') {
      filter.env = this.selectedEnv;
    }
    if (
      this.selectedCountry &&
      this.selectedCountry !== RapportReconciliationBoPartenaireComponent.ALL_COUNTRIES
    ) {
      filter.pays = this.selectedCountry;
    }
    return filter;
  }

  /** Au premier chargement, basculer de ALL vers le pays le plus représenté (décalages + tableau). */
  private autoSelectCountryAfterLoad(dateStart: string, dateEnd: string): void {
    if (this.countryAutoSelected) {
      return;
    }
    if (this.selectedCountry !== RapportReconciliationBoPartenaireComponent.ALL_COUNTRIES) {
      this.syncSelectedCountryWithList();
      return;
    }
    const best = this.pickCountryWithMostRowsForDateRange(dateStart, dateEnd);
    if (best) {
      this.selectedCountry = this.resolveCountryLabel(best) || best;
      this.syncSelectedCountryWithList();
      this.countryAutoSelected = true;
      return;
    }
    this.ensureDefaultCountry();
    if (this.selectedCountry && this.selectedCountry !== RapportReconciliationBoPartenaireComponent.ALL_COUNTRIES) {
      this.countryAutoSelected = true;
    }
  }

  private isAllCountriesSelection(country?: string): boolean {
    const value = (country ?? this.selectedCountry ?? '').trim();
    return !value || value === RapportReconciliationBoPartenaireComponent.ALL_COUNTRIES;
  }

  private rowMatchesCountry(row: Result8Row, country: string): boolean {
    if (this.isAllCountriesSelection(country)) {
      return true;
    }
    const rowCountry = (row.country || '').trim();
    if (!rowCountry) {
      return true;
    }
    return countriesMatch(country, rowCountry);
  }

  /** Charge les écarts J±1 en arrière-plan : le tableau s'affiche d'abord, les décalages se mettent à jour ensuite. */
  private loadDecalagesForRange(
    ecartFilter: { startDate: string; endDate: string; platform: string; env?: string; pays?: string },
    seq: number
  ): void {
    this.subs.add(
      this.ecartBoSummaryService
        .getEcartBoSummaries(ecartFilter)
        .pipe(
          catchError((err) => {
            console.warn('Écarts BO summary indisponibles, décalages J±1 à 0', err);
            return of([] as EcartBoSummary[]);
          })
        )
        .subscribe((ecarts) => {
          if (seq !== this.loadSeq) {
            return;
          }
          this.ecartAll = Array.isArray(ecarts) ? ecarts : [];
          this.rebuildTable();
          this.cdr.markForCheck();
        })
    );
  }

  /**
   * Par défaut, on doit démarrer sur un pays qui a des données sur la période.
   * - Si aucun pays sélectionné → choisir celui avec le plus de lignes sur la période.
   * - Si un pays est sélectionné (profil, etc.) mais n’a aucune ligne → basculer sur un pays avec données.
   */
  private adjustCountryIfNoRowsForCurrentSlice(dateStart: string, dateEnd: string): void {
    const current = (this.selectedCountry || '').trim();
    if (!current || current === RapportReconciliationBoPartenaireComponent.ALL_COUNTRIES) {
      return;
    }
    const hasAnyForCurrent =
      current &&
      this.countRowsForCountryDateRangeEnv(current, dateStart, dateEnd, null) > 0;

    if (hasAnyForCurrent) {
      return;
    }

    const best = this.pickCountryWithMostRowsForDateRange(dateStart, dateEnd);
    if (best) {
      this.selectedCountry = best;
      this.syncSelectedCountryWithList();
    }
  }

  private buildReportHttpParams(startDate: string, endDate: string): HttpParams {
    return new HttpParams()
      .set('startDate', startDate)
      .set('endDate', endDate)
      .set('fields', 'slim')
      .set('_t', String(Date.now()));
  }

  /** Charge result8rec jour par jour si besoin (évite le refus 413 sans filtre pays). */
  private fetchReportRowsForRange(
    range: { start: string; end: string },
    headers: HttpHeaders
  ): Observable<any[]> {
    const days = this.listYmdInclusive(range.start, range.end);
    if (days.length <= 1) {
      const day = days[0] || range.start;
      return this.http
        .get<any[]>('/api/result8rec', {
          headers,
          params: this.buildReportHttpParams(day, day)
        })
        .pipe(catchError((err) => throwError(() => err)));
    }
    return forkJoin(
      days.map((day) =>
        this.http
          .get<any[]>('/api/result8rec', {
            headers,
            params: this.buildReportHttpParams(day, day)
          })
          .pipe(catchError(() => of([] as any[])))
      )
    ).pipe(map((chunks) => chunks.flat()));
  }

  private mapReportRows(report: any[]): Result8Row[] {
    if (!Array.isArray(report)) {
      return [];
    }
    return report.map((r) => {
      const anyR = r as Record<string, unknown>;
      const usernameRaw =
        r.username ?? anyR['user_name'] ?? anyR['userName'] ?? anyR['utilisateur'];
      const traitementRaw = r.traitement ?? anyR['traitement'];
      const countryRaw = String(r.country ?? '').trim();
      return {
        id: r.id,
        date: r.date,
        service: r.service,
        country: this.resolveCountryLabel(countryRaw) || countryRaw,
        env: r.env,
        agency: r.agency != null ? String(r.agency) : undefined,
        totalTransactions: Number(r.totalTransactions || r.recordCount || 0) || 0,
        totalVolume: Number(r.totalVolume || 0) || 0,
        matches: Number(r.matches ?? anyR['matches'] ?? 0) || 0,
        boOnly: Number(r.boOnly ?? anyR['bo_only'] ?? 0) || 0,
        partnerOnly: Number(r.partnerOnly ?? anyR['partner_only'] ?? 0) || 0,
        mismatches: Number(r.mismatches ?? anyR['mismatches'] ?? 0) || 0,
        status: (r.status || '').trim(),
        traitement:
          traitementRaw != null && String(traitementRaw).trim()
            ? String(traitementRaw).trim()
            : '',
        username:
          usernameRaw != null && String(usernameRaw).trim() ? String(usernameRaw).trim() : '',
        glpiId: String(r.glpiId ?? anyR['glpiId'] ?? anyR['glpi_id'] ?? '').trim() || undefined
      };
    });
  }

  private ensureDefaultCountry(): void {
    if (this.selectedCountry) {
      this.syncSelectedCountryWithList();
      return;
    }
    const profileNames = this.appState.getProfileCountryNames();
    if (profileNames.length) {
      this.selectedCountry =
        this.resolveCountryLabel(profileNames[0]) || profileNames[0];
      this.syncSelectedCountryWithList();
      return;
    }
    const scope = this.appState.getUserPaysScope();
    if (scope?.codes?.length) {
      this.selectedCountry = this.resolveCountryLabel(scope.codes[0]) || scope.codes[0];
      this.syncSelectedCountryWithList();
      return;
    }
    if (this.countries.length) {
      const preferred = this.countries.find((c) => countriesMatch(c, 'GA'));
      this.selectedCountry = preferred || this.countries[0];
      this.syncSelectedCountryWithList();
    }
  }

  private resolveCountryLabel(value: string | null | undefined): string {
    const trimmed = (value || '').trim();
    if (!trimmed) {
      return '';
    }
    return countryNameFromCode(trimmed) || trimmed;
  }

  /** Libellé affiché dans le filtre pays (jamais de code ISO seul : GA → Gabon, CM → Cameroun). */
  private normalizeCountryForFilter(raw: string | null | undefined): string {
    return this.resolveCountryLabel(raw);
  }

  private syncSelectedCountryWithList(): void {
    if (!this.selectedCountry || !this.countries.length) {
      return;
    }
    const normalized = this.normalizeCountryForFilter(this.selectedCountry);
    const match = this.countries.find((c) => countriesMatch(c, normalized));
    if (match) {
      this.selectedCountry = match;
    } else if (normalized) {
      this.selectedCountry = normalized;
    }
  }

  private refreshCountriesList(): void {
    const set = new Set<string>();
    const addCountry = (raw: string | null | undefined) => {
      const label = this.normalizeCountryForFilter(raw);
      if (label) {
        set.add(label);
      }
    };
    for (const c of this.countriesFromFilters) {
      addCountry(c);
    }
    for (const name of this.appState.getProfileCountryNames()) {
      addCountry(name);
    }
    const scope = this.appState.getUserPaysScope();
    if (scope?.codes?.length) {
      for (const code of scope.codes) {
        addCountry(code);
      }
    }
    for (const row of this.rawReport) {
      addCountry(row.country);
    }
    const sorted = Array.from(set).sort((a, b) => a.localeCompare(b, 'fr'));
    this.countries = [RapportReconciliationBoPartenaireComponent.ALL_COUNTRIES, ...sorted];
  }

  private resolveLoadError(err: unknown): string {
    const e = err as HttpErrorResponse;
    if (e?.status === 413) {
      const body = e.error as { message?: string; error?: string } | null;
      if (body?.error === 'country_required') {
        return this.t('RBP.error.countryRequired');
      }
      return (
        body?.message ||
        this.t('RBP.error.tooMuchData')
      );
    }
    return this.t('RBP.error.load');
  }

  private rebuildTable(): void {
    const range = this.getNormalizedDateRange();
    if (!this.selectedCountry || !range) {
      this.utilisateurLigneRapport = '';
      this.serviceRows = [];
      this.availableServices = [];
      this.filteredServicesForSelect = [];
      this.lastManualFetchKey = '';
      this.resetTotals();
      return;
    }

    const { start: dateStart, end: dateEnd } = range;
    const envNorm =
      this.selectedEnv === 'ALL' ? null : normalizeReconciliationReportEnv(this.selectedEnv);

    const filtered = this.rawReport.filter((row) => {
      if (!this.rowMatchesCountry(row, this.selectedCountry)) {
        return false;
      }
      if (!this.isYmdInRangeInclusive(row.date, dateStart, dateEnd)) {
        return false;
      }
      if (envNorm != null && normalizeReconciliationReportEnv(row.env) !== envNorm) {
        return false;
      }
      return true;
    });

    this.recomputeUtilisateurFromFiltered(filtered);

    const allSvc = new Set<string>();
    for (const row of filtered) {
      if ((row.service || '').trim()) {
        allSvc.add(row.service.trim());
      }
    }
    this.availableServices = Array.from(allSvc).sort((a, b) => a.localeCompare(b, 'fr'));

    this.lastFilteredRows = filtered;
    this.lastEnvNorm = envNorm;

    this.selectedServices = this.selectedServices.filter((s) => this.availableServices.includes(s));
    this.updateFilteredServicesListOnly();
    this.syncSelectedServicesWithActiveSearchAfterReload();

    const servicesToFetch = [...this.availableServices];
    const servicesToDisplay = this.getServicesToDisplay();

    if (servicesToFetch.length === 0) {
      this.manualRows = [];
      this.lastManualFetchKey = '';
      this.computeRows(filtered, dateStart, dateEnd, envNorm, []);
      return;
    }

    const fetchKey = this.buildManualFetchKey(dateStart, dateEnd);
    if (fetchKey === this.lastManualFetchKey) {
      this.computeRows(filtered, dateStart, dateEnd, envNorm, servicesToDisplay);
      return;
    }

    this.computeRows(filtered, dateStart, dateEnd, envNorm, servicesToDisplay);

    this.manualFetchSub?.unsubscribe();
    const manualSeq = this.loadSeq;
    this.manualLoading = true;
    this.manualFetchSub = this.dashboardService
      .getReleveManualTrxRange(
        dateStart,
        dateEnd,
        this.selectedCountry,
        servicesToFetch,
        this.selectedEnv === 'ALL' ? undefined : this.selectedEnv
      )
      .pipe(
        catchError(() => of([] as ReleveManualRangeRow[]))
      )
      .subscribe({
        next: (manual) => {
          if (manualSeq !== this.loadSeq) {
            return;
          }
          this.lastManualFetchKey = fetchKey;
          this.manualRows = Array.isArray(manual) ? manual : [];
          this.computeRows(filtered, dateStart, dateEnd, envNorm, this.getServicesToDisplay());
          this.manualLoading = false;
          this.cdr.markForCheck();
        },
        error: () => {
          if (manualSeq !== this.loadSeq) {
            return;
          }
          this.manualRows = [];
          this.lastManualFetchKey = '';
          this.computeRows(filtered, dateStart, dateEnd, envNorm, this.getServicesToDisplay());
          this.manualLoading = false;
          this.cdr.markForCheck();
        }
      });
  }

  private computeRows(
    filtered: Result8Row[],
    dateStart: string,
    dateEnd: string,
    envNorm: string | null,
    servicesToUse: string[]
  ): void {
    this.clearAuditState();
    this.rebuildResult8RecMetaFromFiltered(filtered);
    const rows: BoPartenaireRow[] = [];
    for (const svc of servicesToUse) {
      const agg = this.aggregatesPourService(svc, filtered, dateStart, dateEnd, envNorm);
      const repLines = this.ligneRapportPourService(filtered, svc, envNorm);
      const traitement = this.dominantTraitementRawValue(repLines.map((l) => l.traitement));
      const result8recIds = [
        ...new Set(
          repLines
            .map((l) => l.id)
            .filter((id): id is number => typeof id === 'number' && id > 0)
        )
      ].sort((a, b) => a - b);
      const ecN =
        agg.boNombre -
        agg.partenaireNombre -
        agg.decalageJm1Nombre +
        agg.decalageJp1Nombre;
      const ecV =
        agg.boVolume -
        agg.partenaireVolume -
        agg.decalageJm1Volume +
        agg.decalageJp1Volume;
      const taux =
        agg.boVolume !== 0
          ? (ecV / agg.boVolume) * 100
          : agg.partenaireVolume !== 0
            ? null
            : 0;
      rows.push({
        service: svc,
        traitement,
        boNombre: agg.boNombre,
        boVolume: agg.boVolume,
        partenaireNombre: agg.partenaireNombre,
        partenaireVolume: agg.partenaireVolume,
        ecartNombre: ecN,
        ecartVolume: ecV,
        tauxVolume: taux,
        decalageJm1Nombre: agg.decalageJm1Nombre,
        decalageJm1Volume: agg.decalageJm1Volume,
        decalageJp1Nombre: agg.decalageJp1Nombre,
        decalageJp1Volume: agg.decalageJp1Volume,
        result8recIds
      });
    }

    rows.sort((a, b) => a.service.localeCompare(b.service, 'fr'));
    this.serviceRows = rows;
    this.rebuildTableViewFromRows();

    this.totalBoNombre = rows.reduce((s, r) => s + r.boNombre, 0);
    this.totalBoVolume = rows.reduce((s, r) => s + r.boVolume, 0);
    this.totalMatchesBo = this.sumMatchesBo(filtered, servicesToUse, envNorm);
    this.totalPartNombre = rows.reduce((s, r) => s + r.partenaireNombre, 0);
    this.totalPartVolume = rows.reduce((s, r) => s + r.partenaireVolume, 0);
    this.totalDecJm1Nombre = rows.reduce((s, r) => s + r.decalageJm1Nombre, 0);
    this.totalDecJm1Volume = rows.reduce((s, r) => s + r.decalageJm1Volume, 0);
    this.totalDecJp1Nombre = rows.reduce((s, r) => s + r.decalageJp1Nombre, 0);
    this.totalDecJp1Volume = rows.reduce((s, r) => s + r.decalageJp1Volume, 0);
    this.totalServices = rows.length;
    this.servicesAvecEcart = rows.filter(
      (r) => Math.abs(r.ecartNombre) > 0.0001 || Math.abs(r.ecartVolume) > 0.0001
    ).length;

    const ec = this.sumReportEcartsBoPartnerForServices(filtered, servicesToUse, envNorm);
    this.ecartBoOnlyCount = ec.boOnly;
    this.ecartPartnerOnlyCount = ec.partnerOnly;
  }

  private resetTotals(): void {
    this.totalBoNombre = 0;
    this.totalBoVolume = 0;
    this.totalMatchesBo = 0;
    this.totalPartNombre = 0;
    this.totalPartVolume = 0;
    this.totalDecJm1Nombre = 0;
    this.totalDecJm1Volume = 0;
    this.totalDecJp1Nombre = 0;
    this.totalDecJp1Volume = 0;
    this.servicesAvecEcart = 0;
    this.totalServices = 0;
    this.ecartBoOnlyCount = 0;
    this.ecartPartnerOnlyCount = 0;
    this.tableDisplayBlocks = [];
    this.displayLines = [];
    this.expandedGroupIds.clear();
    this.clearAuditState();
  }

  /** Classes badge alignées sur le rapport de réconciliation (traitement-*) */
  getTraitementClass(traitement: string): string {
    const kind = resolveTraitementKind(traitement);
    return `rrbp-traitement-badge rrbp-traitement-kind--${kind}`;
  }

  /** Fond coloré de la cellule Traitement (aligné sur la colonne Statut). */
  classeTraitementCell(traitement: string): string {
    const kind = resolveTraitementKind(traitement);
    const base = 'col-traitement rrbp-traitement-cell';
    if (kind === 'none') {
      return `${base} rrbp-traitement-cell--neutre`;
    }
    return `${base} rrbp-traitement-cell--${kind}`;
  }

  /** Catégorie affichée dans la colonne Statut (couleurs + libellé). */
  private resolveStatutKind(
    traitement: string
  ): 'support' | 'cdo' | 'group' | 'termine' | 'none' {
    return resolveTraitementKind(traitement);
  }

  /**
   * Libellé métier affiché dans la colonne Statut (distinct du libellé Traitement).
   */
  libelleStatutFromTraitement(traitement: string): string {
    return statutFromTraitementDisplayLabel(traitement, this.displayT);
  }

  /** Classes pour la cellule Statut (pastille colorée). */
  classeStatutCell(traitement: string): string {
    const k = this.resolveStatutKind(traitement);
    const base = 'col-statut rrbp-statut-cell';
    if (k === 'none') {
      return `${base} rrbp-statut--neutre`;
    }
    return `${base} rrbp-statut--${k}`;
  }

  /** Lignes result8rec pour un service (pays / période déjà dans `filtered`). */
  private ligneRapportPourService(
    filtered: Result8Row[],
    service: string,
    envNorm: string | null
  ): Result8Row[] {
    return filtered.filter(
      (line) =>
        this.strEqual(line.service, service) &&
        (envNorm == null || normalizeReconciliationReportEnv(line.env) === envNorm)
    );
  }

  private sumReportEcartsBoPartnerForServices(
    filtered: Result8Row[],
    serviceNames: string[],
    envNorm: string | null
  ): { boOnly: number; partnerOnly: number } {
    const set = new Set(serviceNames.map((s) => s.trim().toLowerCase()));
    let bo = 0;
    let po = 0;
    for (const line of filtered) {
      if (!set.has((line.service || '').trim().toLowerCase())) {
        continue;
      }
      if (envNorm != null && normalizeReconciliationReportEnv(line.env) !== envNorm) {
        continue;
      }
      bo += Number(line.boOnly || 0);
      po += Number(line.partnerOnly || 0);
    }
    return { boOnly: bo, partnerOnly: po };
  }

  private libelleStatutEcartFromCount(n: number): string {
    return n > 0 ? this.t('RBP.gapHeader.inProgress', { count: n }) : this.t('RBP.gapHeader.total');
  }

  /**
   * Valeur du sous-en-tête pour l'export : le classeur conserve ses libellés
   * français (contrat de colonnes), indépendamment de la langue de l'interface.
   */
  private ecartHeaderLabel(n: number): string {
    return n > 0 ? `${n} en cours` : 'Effectif';
  }

  private sumMatchesBo(
    filtered: Result8Row[],
    servicesToUse: string[],
    envNorm: string | null
  ): number {
    const set = new Set(servicesToUse.map((s) => s.trim().toLowerCase()));
    return filtered.reduce((sum, row) => {
      if (!set.has((row.service || '').trim().toLowerCase())) {
        return sum;
      }
      if (envNorm != null && normalizeReconciliationReportEnv(row.env) !== envNorm) {
        return sum;
      }
      return sum + (Number(row.matches) || 0);
    }, 0);
  }

  displayTraitementLabel(traitement: string): string {
    return traitementDisplayLabel(traitement, this.displayT);
  }

  /**
   * Valeur métier la moins avancée du périmètre (si une ligne est en validation CDO, le service l'est aussi).
   */
  private dominantTraitementRawValue(values: (string | undefined | null)[]): string {
    const cleaned = values
      .map((v) => (v ?? '').trim())
      .filter((v) => v.length > 0 && v !== '—');
    if (!cleaned.length) {
      return '';
    }

    const kindRank: Record<'support' | 'cdo' | 'group' | 'termine' | 'none', number> = {
      support: 4,
      cdo: 3,
      group: 2,
      termine: 1,
      none: 0
    };

    let leastAdvanced = cleaned[0];
    for (const t of cleaned) {
      if (kindRank[resolveTraitementKind(t)] > kindRank[resolveTraitementKind(leastAdvanced)]) {
        leastAdvanced = t;
      }
    }

    return leastAdvanced;
  }

  private dominantTraitementLabel(values: (string | undefined | null)[]): string {
    const raw = this.dominantTraitementRawValue(values);
    return raw ? traitementDisplayLabel(raw, this.displayT) : '—';
  }

  isGroupExpanded(groupId: string): boolean {
    return this.expandedGroupIds.has(groupId);
  }

  toggleServiceGroup(groupId: string, ev?: Event): void {
    ev?.stopPropagation();
    if (this.expandedGroupIds.has(groupId)) {
      this.expandedGroupIds.delete(groupId);
    } else {
      this.expandedGroupIds.add(groupId);
    }
    this.cdr.markForCheck();
  }

  private clearAuditState(): void {
    this.expandedAuditKeys.clear();
    this.auditHistoryByRecId.clear();
    this.auditLoadedFingerprints.clear();
    this.auditLoadingFingerprints.clear();
    this.metaByResult8RecId.clear();
  }

  /** Alimente les libellés pour le regroupement par service (colonnes du rapport). */
  private rebuildResult8RecMetaFromFiltered(filtered: Result8Row[]): void {
    this.metaByResult8RecId.clear();
    for (const r of filtered) {
      if (r.id != null && r.id > 0) {
        this.metaByResult8RecId.set(r.id, {
          service: ((r.service ?? '') as string).trim() || '—',
          agency: ((r.agency ?? '') as string).trim() || '—',
          date: ((r.date ?? '') as string).trim(),
          env: r.env
        });
      }
    }
  }

  private buildAuditHeaders(): HttpHeaders {
    return new HttpHeaders({
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      Pragma: 'no-cache',
      Expires: '0',
      'X-Permission-Module': 'Résultats'
    });
  }

  private auditFingerprint(ids: readonly number[]): string {
    return [...ids]
      .filter((n) => n > 0)
      .sort((a, b) => a - b)
      .join(',');
  }

  auditKeySingle(service: string): string {
    return `s:${service}`;
  }

  auditKeyGroupAggregate(blockId: string): string {
    return `agg:${blockId}`;
  }

  auditKeyGroupDetail(groupId: string, service: string): string {
    return `d:${groupId}:${service}`;
  }

  isAuditExpandedRow(key: string): boolean {
    return this.expandedAuditKeys.has(key);
  }

  toggleAuditRow(key: string, ids: number[] | undefined | null, ev?: Event): void {
    ev?.stopPropagation?.();
    const normalized = [...new Set((ids || []).filter((n) => typeof n === 'number' && n > 0))].sort(
      (a, b) => a - b
    );
    if (!normalized.length) {
      return;
    }
    const fp = this.auditFingerprint(normalized);
    if (this.expandedAuditKeys.has(key)) {
      this.expandedAuditKeys.delete(key);
    } else {
      this.expandedAuditKeys.add(key);
      this.ensureAuditLoaded(fp, normalized);
    }
    this.cdr.markForCheck();
  }

  private ensureAuditLoaded(fingerprint: string, ids: number[]): void {
    if (this.auditLoadedFingerprints.has(fingerprint)) {
      return;
    }
    if (this.auditLoadingFingerprints.has(fingerprint)) {
      return;
    }
    this.auditLoadingFingerprints.add(fingerprint);
    const headers = this.buildAuditHeaders();
    forkJoin(
      ids.map((id) =>
        this.http
          .get<Result8RecAuditEntry[]>(`/api/result8rec/${id}/audit-history`, { headers })
          .pipe(catchError(() => of([] as Result8RecAuditEntry[])))
      )
    ).subscribe({
      next: (chunks) => {
        ids.forEach((id, i) => {
          const raw = chunks[i];
          const arr = Array.isArray(raw) ? raw : [];
          this.auditHistoryByRecId.set(
            id,
            [...arr].sort((a, b) => {
              const ta = a.createdAt || '';
              const tb = b.createdAt || '';
              if (ta !== tb) {
                return ta < tb ? -1 : 1;
              }
              return (a.id ?? 0) - (b.id ?? 0);
            })
          );
        });
        this.auditLoadedFingerprints.add(fingerprint);
        this.auditLoadingFingerprints.delete(fingerprint);
        this.cdr.markForCheck();
      },
      error: () => {
        for (const id of ids) {
          if (!this.auditHistoryByRecId.has(id)) {
            this.auditHistoryByRecId.set(id, []);
          }
        }
        this.auditLoadedFingerprints.add(fingerprint);
        this.auditLoadingFingerprints.delete(fingerprint);
        this.cdr.markForCheck();
      }
    });
  }

  /** Sections prêtes après chargement : d’abord par **service** (nom BO), puis sous-lignes par id result8rec. */
  getAuditSectionsGroupedByService(ids: number[] | undefined | null): AuditSectionByService[] {
    const fp = this.auditFingerprint(ids || []);
    if (!this.auditLoadedFingerprints.has(fp)) {
      return [];
    }
    const idList = [...new Set((ids || []).filter((n) => typeof n === 'number' && n > 0))];
    if (!idList.length) {
      return [];
    }
    const bySvc = new Map<string, number[]>();
    for (const rid of idList) {
      const meta = this.metaByResult8RecId.get(rid);
      const svc = (meta?.service || '—').trim() || '—';
      if (!bySvc.has(svc)) {
        bySvc.set(svc, []);
      }
      bySvc.get(svc)!.push(rid);
    }
    const serviceNames = [...bySvc.keys()].sort((a, b) => a.localeCompare(b, 'fr'));
    return serviceNames.map((serviceName) => {
      const ligneIds = (bySvc.get(serviceName) || []).sort((a, b) => this.compareAuditLineIds(a, b));
      return {
        serviceName,
        lignes: ligneIds.map((id) => ({
          id,
          subtitle: this.buildAuditLigneSubtitle(id),
          entries: [...(this.auditHistoryByRecId.get(id) ?? [])]
        }))
      };
    });
  }

  private compareAuditLineIds(a: number, b: number): number {
    const ma = this.metaByResult8RecId.get(a);
    const mb = this.metaByResult8RecId.get(b);
    const da = (ma?.date || '').localeCompare(mb?.date || '');
    if (da !== 0) {
      return da;
    }
    const ag = (ma?.agency || '').localeCompare(mb?.agency || '', 'fr');
    if (ag !== 0) {
      return ag;
    }
    return a - b;
  }

  buildAuditLigneSubtitle(result8recId: number): string {
    const m = this.metaByResult8RecId.get(result8recId);
    if (!m) {
      return `Ligne #${result8recId}`;
    }
    const dateStr = m.date ? this.formatFrShort(m.date) : '—';
    const ag = m.agency && m.agency !== '—' ? m.agency : '—';
    return `Id ${result8recId} · ${ag} · ${dateStr}`;
  }

  isAuditBatchLoaded(ids: number[] | undefined | null): boolean {
    return this.auditLoadedFingerprints.has(this.auditFingerprint(ids || []));
  }

  isAuditFingerprintLoading(ids: number[] | undefined | null): boolean {
    const fp = this.auditFingerprint(ids || []);
    return this.auditLoadingFingerprints.has(fp);
  }

  formatAuditActionLabel(actionType?: string): string {
    if (!actionType) {
      return '—';
    }
    const m: Record<string, string> = {
      CREATION: this.t('RBP.audit.actions.CREATION'),
      SAUVEGARDE_RESULTAT: this.t('RBP.audit.actions.SAUVEGARDE_RESULTAT'),
      STATUT_OK: this.t('RBP.audit.actions.STATUT_OK'),
      CHANGEMENT_STATUT: this.t('RBP.audit.actions.CHANGEMENT_STATUT'),
      'VALIDATION_TERMINÉ': this.t('RBP.audit.actions.VALIDATION_TERMINÉ'),
      CHANGEMENT_TRAITEMENT: this.t('RBP.audit.actions.CHANGEMENT_TRAITEMENT')
    };
    return m[actionType] || actionType;
  }

  formatAuditInstant(iso?: string | null): string {
    if (!iso) {
      return '—';
    }
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) {
      return String(iso);
    }
    return d.toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' });
  }

  /**
   * Regroupe par tokens explicites (liste `BO_PARTENAIRE_SERVICE_GROUP_TOKENS`) pour le périmètre pays/ENV courant.
   * Libellé = token (ex. CASHINOM), pas un morceau de nom type CASHINOMCM2. Sans token → une ligne par service.
   */
  private rebuildTableViewFromRows(): void {
    if (!this.serviceRows.length) {
      this.tableDisplayBlocks = [];
      this.displayLines = [];
      return;
    }

    const tokenToMembers = new Map<string, BoPartenaireRow[]>();
    const noToken: BoPartenaireRow[] = [];

    for (const r of this.serviceRows) {
      const tok = this.resolveServiceGroupToken(r.service);
      if (tok == null) {
        noToken.push(r);
      } else {
        if (!tokenToMembers.has(tok)) {
          tokenToMembers.set(tok, []);
        }
        tokenToMembers.get(tok)!.push(r);
      }
    }

    const blocks: BoPartenaireTableGroup[] = [];

    for (const tok of BO_PARTENAIRE_SERVICE_GROUP_TOKENS) {
      const members = tokenToMembers.get(tok);
      if (!members?.length) {
        continue;
      }
      members.sort((a, b) => a.service.localeCompare(b.service, 'fr'));
      const id = members.map((m) => m.service).sort().join('\u0001');
      blocks.push({
        id,
        label: tok,
        members,
        aggregate: this.aggregateBoPartenaireRows(members)
      });
    }

    noToken.sort((a, b) => a.service.localeCompare(b.service, 'fr'));
    for (const r of noToken) {
      blocks.push({
        id: r.service,
        label: r.service,
        members: [r],
        aggregate: this.aggregateBoPartenaireRows([r])
      });
    }

    this.tableDisplayBlocks = blocks;

    this.displayLines = [];
    for (const block of this.tableDisplayBlocks) {
      if (block.members.length === 1) {
        this.displayLines.push({ type: 'single', row: block.members[0] });
      } else {
        this.displayLines.push({
          type: 'group-header',
          id: block.id,
          label: block.label,
          aggregate: block.aggregate,
          count: block.members.length
        });
        for (const r of block.members) {
          this.displayLines.push({ type: 'group-detail', groupId: block.id, row: r });
        }
      }
    }
  }

  /** Premier token (liste triée longueur décroissante) contenu dans le nom du service. */
  private resolveServiceGroupToken(serviceName: string): string | null {
    const u = (serviceName || '').toUpperCase();
    for (const t of this.serviceGroupTokensSorted) {
      if (u.includes(t.toUpperCase())) {
        return t;
      }
    }
    return null;
  }

  private aggregateBoPartenaireRows(members: BoPartenaireRow[]): BoPartenaireRow {
    const sum = (fn: (m: BoPartenaireRow) => number) => members.reduce((s, m) => s + fn(m), 0);
    const boNombre = sum((m) => m.boNombre);
    const boVolume = sum((m) => m.boVolume);
    const partenaireNombre = sum((m) => m.partenaireNombre);
    const partenaireVolume = sum((m) => m.partenaireVolume);
    const decJm1Nombre = sum((m) => m.decalageJm1Nombre);
    const decJm1Volume = sum((m) => m.decalageJm1Volume);
    const decJp1Nombre = sum((m) => m.decalageJp1Nombre);
    const decJp1Volume = sum((m) => m.decalageJp1Volume);
    const ecartNombre = boNombre - partenaireNombre - decJm1Nombre + decJp1Nombre;
    const ecartVolume = boVolume - partenaireVolume - decJm1Volume + decJp1Volume;
    const tauxVolume =
      boVolume !== 0
        ? (ecartVolume / boVolume) * 100
        : partenaireVolume !== 0
          ? null
          : 0;
    const mergedDbIds = this.mergeResult8RecIdsFromMembers(members);
    return {
      service: '',
      traitement: this.dominantTraitementRawValue(members.map((m) => m.traitement)),
      boNombre,
      boVolume,
      partenaireNombre,
      partenaireVolume,
      ecartNombre,
      ecartVolume,
      tauxVolume,
      decalageJm1Nombre: decJm1Nombre,
      decalageJm1Volume: decJm1Volume,
      decalageJp1Nombre: decJp1Nombre,
      decalageJp1Volume: decJp1Volume,
      result8recIds: mergedDbIds
    };
  }

  /** Union des ids result8rec des lignes membres (groupe agrégé). */
  private mergeResult8RecIdsFromMembers(members: BoPartenaireRow[]): number[] {
    const s = new Set<number>();
    for (const m of members) {
      for (const id of m.result8recIds || []) {
        if (typeof id === 'number' && id > 0) {
          s.add(id);
        }
      }
    }
    return Array.from(s).sort((a, b) => a - b);
  }

  private aggregatesPourService(
    service: string,
    filtered: Result8Row[],
    dateStart: string,
    dateEnd: string,
    envNorm: string | null
  ): {
    boNombre: number;
    boVolume: number;
    partenaireNombre: number;
    partenaireVolume: number;
    decalageJm1Nombre: number;
    decalageJm1Volume: number;
    decalageJp1Nombre: number;
    decalageJp1Volume: number;
  } {
    const serviceLines = filtered.filter(
      (line) =>
        this.strEqual(line.service, service) &&
        (envNorm == null || normalizeReconciliationReportEnv(line.env) === envNorm)
    );
    const rapportN = serviceLines.reduce((s, l) => s + (l.totalTransactions || 0), 0);
    const rapportV = serviceLines.reduce((s, l) => s + (l.totalVolume || 0), 0);

    const manual = this.sumManualForServiceRange(service, dateStart, dateEnd, envNorm);

    let jp1Nombre = 0;
    let jp1Montant = 0;
    let jm1Nombre = 0;
    let jm1Montant = 0;
    for (const d of this.listYmdInclusive(dateStart, dateEnd)) {
      const j = this.sumEcartPartner(service, d, envNorm);
      jp1Nombre += j.nombre;
      jp1Montant += j.montant;
      const jm = this.sumEcartPartner(service, this.subtractCalendarDaysFromYmd(d, 1), envNorm);
      jm1Nombre += jm.nombre;
      jm1Montant += jm.montant;
    }

    const boNombre = rapportN + manual.manualNombre;
    const boVolume = rapportV + manual.manualVolume;
    const partenaireNombre =
      rapportN + manual.manualNombre + jp1Nombre - jm1Nombre + manual.rembourseNombre;
    const partenaireVolume =
      rapportV + jp1Montant + manual.manualVolume - jm1Montant + manual.rembourseVolume;

    return {
      boNombre,
      boVolume,
      partenaireNombre,
      partenaireVolume,
      decalageJm1Nombre: jm1Nombre,
      decalageJm1Volume: jm1Montant,
      decalageJp1Nombre: jp1Nombre,
      decalageJp1Volume: jp1Montant
    };
  }

  private sumManualForServiceRange(
    service: string,
    dateStart: string,
    dateEnd: string,
    envNorm: string | null
  ): {
    manualNombre: number;
    manualVolume: number;
    rembourseNombre: number;
    rembourseVolume: number;
  } {
    let manualNombre = 0;
    let manualVolume = 0;
    let rembourseNombre = 0;
    let rembourseVolume = 0;
    const cty = (this.selectedCountry || '').trim();

    for (const m of this.manualRows) {
      if (!this.strEqual(m.service, service)) {
        continue;
      }
      if (!this.isYmdInRangeInclusive(m.date, dateStart, dateEnd)) {
        continue;
      }
      if (cty && (m.country || '').trim() && !this.strEqual(m.country, cty)) {
        continue;
      }
      if (envNorm != null) {
        const me = normalizeReconciliationReportEnv(m.env);
        if (me !== envNorm) {
          continue;
        }
      }
      manualNombre += Number(m.manualNombre || 0);
      manualVolume += Number(m.manualVolume || 0);
      rembourseNombre += Number(m.rembourseNombre || 0);
      rembourseVolume += Number(m.rembourseVolume || 0);
    }

    return { manualNombre, manualVolume, rembourseNombre, rembourseVolume };
  }

  private sumEcartPartner(
    service: string,
    dateY: string,
    envKey: string | null
  ): { nombre: number; montant: number } {
    let nombre = 0;
    let montant = 0;
    for (const ecart of this.ecartAll) {
      const ecartDate = this.formatDateForSearch(ecart.dateTransaction);
      if (ecartDate !== dateY) {
        continue;
      }
      if (!this.strEqual(ecart.service, service)) {
        continue;
      }
      if (!this.ecartPaysMatches(ecart)) {
        continue;
      }
      if (!this.isPartenairePlatform(ecart)) {
        continue;
      }
      if (!this.ecartEnvMatches(ecart, envKey)) {
        continue;
      }
      nombre += Number(ecart.nombreTransactions || 0);
      montant += Number(ecart.montantTotal || 0);
    }
    return { nombre, montant };
  }

  private isPartenairePlatform(ecart: EcartBoSummary): boolean {
    return (ecart.env || '').trim().toUpperCase() === 'PARTENAIRE';
  }

  private getEcartEnvCodeRaw(ecart: EcartBoSummary): string {
    const anyE = ecart as EcartBoSummary & { env_code?: string | null };
    const v = ecart.envCode ?? anyE.env_code;
    return v != null ? String(v).trim() : '';
  }

  private ecartEnvMatches(ecart: EcartBoSummary, releveEnvNorm: string | null): boolean {
    if (releveEnvNorm == null) {
      return true;
    }
    const code = this.getEcartEnvCodeRaw(ecart);
    const ecartKey = !code || code.toUpperCase() === 'TOTAL' ? 'T-E' : code;
    return ecartKey.toUpperCase() === releveEnvNorm.toUpperCase();
  }

  private ecartPaysMatches(ecart: EcartBoSummary): boolean {
    if (this.isAllCountriesSelection()) {
      return true;
    }
    const rep = (this.selectedCountry || '').trim();
    const ep = (ecart.pays || '').trim();
    if (!rep) {
      return true;
    }
    if (!ep) {
      return true;
    }
    return countriesMatch(rep, ep);
  }

  private strEqual(a?: string | null, b?: string | null): boolean {
    return (a ?? '').trim().toLowerCase() === (b ?? '').trim().toLowerCase();
  }

  private formatDateForSearch(dateStr: string): string {
    if (!dateStr) {
      return '';
    }
    const dmY = dateStr
      .trim()
      .match(/^(\d{2})[\/.\-](\d{2})[\/.\-](\d{4})$/);
    if (dmY) {
      const dd = dmY[1];
      const mm = dmY[2];
      const yyyy = dmY[3];
      return `${yyyy}-${mm}-${dd}`;
    }
    if (dateStr.includes('T')) {
      return dateStr.split('T')[0];
    }
    if (/^\d{4}-\d{2}-\d{2}/.test(dateStr)) {
      return dateStr.split(' ')[0];
    }
    try {
      const d = new Date(dateStr);
      if (!isNaN(d.getTime())) {
        return this.toYmd(d);
      }
    } catch {
      /* ignore */
    }
    return dateStr;
  }

  private addCalendarDays(d: Date, delta: number): Date {
    const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    x.setDate(x.getDate() + delta);
    return x;
  }

  private pickCountryWithMostRowsForDateRange(start: string, end: string): string {
    const counts = new Map<string, number>();
    for (const row of this.rawReport) {
      if (!this.isYmdInRangeInclusive(row.date, start, end)) {
        continue;
      }
      const c = this.resolveCountryLabel((row.country || '').trim()) || (row.country || '').trim();
      if (!c) {
        continue;
      }
      counts.set(c, (counts.get(c) || 0) + 1);
    }
    let best = '';
    let n = 0;
    for (const [c, v] of counts) {
      if (v > n) {
        best = c;
        n = v;
      }
    }
    return best;
  }

  private countRowsForCountryDateRangeEnv(
    country: string,
    start: string,
    end: string,
    envNorm: string | null
  ): number {
    const c0 = country.trim();
    return this.rawReport.filter((row) => {
      if (!this.rowMatchesCountry(row, c0)) {
        return false;
      }
      if (!this.isYmdInRangeInclusive(row.date, start, end)) {
        return false;
      }
      if (envNorm != null && normalizeReconciliationReportEnv(row.env) !== envNorm) {
        return false;
      }
      return true;
    }).length;
  }

  private adjustEnvIfNoRowsForCurrentSlice(dateStart: string, dateEnd: string): void {
    if (!this.selectedCountry || this.selectedEnv === 'ALL') {
      return;
    }
    const envNorm = normalizeReconciliationReportEnv(this.selectedEnv);
    if (this.countRowsForCountryDateRangeEnv(this.selectedCountry, dateStart, dateEnd, envNorm) > 0) {
      return;
    }
    const dominant = this.inferDominantEnvForCountryDateRange(
      this.selectedCountry.trim(),
      dateStart,
      dateEnd
    );
    if (dominant && dominant !== this.selectedEnv) {
      this.selectedEnv = dominant;
    }
  }

  private inferDominantEnvForCountryDateRange(
    country: string,
    start: string,
    end: string
  ): string | null {
    const freq = new Map<string, number>();
    for (const row of this.rawReport) {
      if (!this.rowMatchesCountry(row, country)) {
        continue;
      }
      if (!this.isYmdInRangeInclusive(row.date, start, end)) {
        continue;
      }
      const k = normalizeReconciliationReportEnv(row.env);
      freq.set(k, (freq.get(k) || 0) + 1);
    }
    let best: string | null = null;
    let n = 0;
    for (const [k, v] of freq) {
      if (v > n) {
        best = k;
        n = v;
      }
    }
    return best;
  }

  private recomputeUtilisateurFromFiltered(filtered: Result8Row[]): void {
    const names = filtered
      .map((r) => (r.username || '').trim())
      .filter((u) => !!u);
    if (names.length === 0) {
      this.utilisateurLigneRapport = '';
      return;
    }
    const freq = new Map<string, number>();
    for (const n of names) {
      freq.set(n, (freq.get(n) || 0) + 1);
    }
    let best = names[0];
    let c = 0;
    for (const [n, v] of freq) {
      if (v > c) {
        best = n;
        c = v;
      }
    }
    const unique = [...new Set(names)].sort((a, b) => a.localeCompare(b, 'fr'));
    if (unique.length > 1 && c < names.length * 0.5) {
      this.utilisateurLigneRapport = unique.join(', ');
    } else {
      this.utilisateurLigneRapport = best;
    }
  }

  private subtractCalendarDaysFromYmd(ymd: string, days: number): string {
    const base = this.formatDateForSearch(ymd);
    const m = base.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) {
      return base;
    }
    const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    d.setDate(d.getDate() - days);
    return this.toYmd(d);
  }

  private toYmd(d: Date): string {
    const y = d.getFullYear();
    const mo = String(d.getMonth() + 1).padStart(2, '0');
    const da = String(d.getDate()).padStart(2, '0');
    return `${y}-${mo}-${da}`;
  }

  formatNombre(n: number): string {
    return this.numberFormatter.format(Math.round(n));
  }

  formatDecalageCell(nombre: number, volume: number): string {
    return `${this.formatNombre(nombre)} · ${this.formatNombre(volume)}`;
  }

  classeEcart(v: number): string {
    if (Math.abs(v) < 0.0001) {
      return 'neutre';
    }
    return v > 0 ? 'positif' : 'negatif';
  }

  libelleTaux(r: BoPartenaireRow): string {
    if (r.tauxVolume === null) {
      return '—';
    }
    return `${r.tauxVolume.toFixed(1)} %`;
  }

  classeTaux(r: BoPartenaireRow): string {
    if (r.tauxVolume === null || Math.abs(r.tauxVolume) < 0.05) {
      return 'neutre';
    }
    return Math.abs(r.tauxVolume) >= 5 ? 'negatif' : 'neutre';
  }

  estEcartNul(v: number): boolean {
    return Math.abs(v) < 0.0001;
  }

  clearServiceFilter(): void {
    this.serviceSearchCtrl.setValue('', { emitEvent: false });
    this.selectedServices = [];
    this.filteredServicesForSelect = [...this.availableServices];
    this.appliquerFiltres();
  }

  /** Afficher « Effacer » si recherche ou sélection explicite. */
  get showClearServicesButton(): boolean {
    return this.hasActiveServiceSearch() || this.selectedServices.length > 0;
  }

  get hasServiceGroups(): boolean {
    return this.tableDisplayBlocks.some((b) => b.members.length > 1);
  }

  get canExportPdf(): boolean {
    return !!(this.selectedCountry && !this.loading && !this.error && this.serviceRows.length > 0);
  }

  get canExportExcel(): boolean {
    return this.canExportPdf;
  }

  private buildExportBaseName(): string {
    const pays = (this.selectedCountry || 'pays').replace(/\s+/g, '-');
    const r = this.getNormalizedDateRange();
    const d0 = (r?.start || this.dateDebut || '').replace(/-/g, '');
    const d1 = (r?.end || this.dateFin || '').replace(/-/g, '');
    const env = (this.selectedEnv || 'ENV').replace(/\s+/g, '-');
    return `Rapport-BO-vs-Partenaire-${pays}-${d0}${d1 && d1 !== d0 ? '-' + d1 : ''}-${env}`;
  }

  private rowToExcelRecord(
    row: BoPartenaireRow,
    serviceLabel: string,
    ligneType: string
  ): Record<string, string | number | null> {
    return {
      'Type ligne': ligneType,
      Service: serviceLabel,
      Traitement: this.displayTraitementLabel(row.traitement),
      Statut: this.libelleStatutFromTraitement(row.traitement),
      'Transactions BO': row.boNombre,
      'Volume BO': row.boVolume,
      'Partenaire Nombre': row.partenaireNombre,
      'Partenaire Volume': row.partenaireVolume,
      'Décalage J-1 Nombre': row.decalageJm1Nombre,
      'Décalage J-1 Volume': row.decalageJm1Volume,
      'Décalage J+1 Nombre': row.decalageJp1Nombre,
      'Décalage J+1 Volume': row.decalageJp1Volume,
      'Écart Nombre': row.ecartNombre,
      'Écart Volume': row.ecartVolume,
      'Taux volume (%)':
        row.tauxVolume != null ? Math.round(row.tauxVolume * 10) / 10 : null
    };
  }

  private buildExcelDataRows(): Record<string, string | number | null>[] {
    const rows: Record<string, string | number | null>[] = [];

    for (const line of this.displayLines) {
      if (line.type === 'single') {
        rows.push(this.rowToExcelRecord(line.row, line.row.service, 'Ligne'));
      } else if (line.type === 'group-header') {
        rows.push(
          this.rowToExcelRecord(
            line.aggregate,
            `${line.label} (${line.count} services)`,
            'Total groupe'
          )
        );
      } else if (line.type === 'group-detail') {
        rows.push(this.rowToExcelRecord(line.row, line.row.service, 'Détail'));
      }
    }

    rows.push({
      'Type ligne': 'Total',
      Service: 'Total',
      Traitement: '—',
      Statut: this.libelleStatutFromTraitement(''),
      'Transactions BO': this.totalBoNombre,
      'Volume BO': this.totalBoVolume,
      'Partenaire Nombre': this.totalPartNombre,
      'Partenaire Volume': this.totalPartVolume,
      'Décalage J-1 Nombre': this.totalDecJm1Nombre,
      'Décalage J-1 Volume': this.totalDecJm1Volume,
      'Décalage J+1 Nombre': this.totalDecJp1Nombre,
      'Décalage J+1 Volume': this.totalDecJp1Volume,
      'Écart Nombre': this.totalEcartNombreAjuste,
      'Écart Volume': this.totalEcartVolumeAjuste,
      'Taux volume (%)': null
    });

    return rows;
  }

  async exportToExcel(): Promise<void> {
    if (!this.canExportExcel || this.isExportingExcel) {
      return;
    }

    this.isExportingExcel = true;
    this.cdr.markForCheck();

    try {
      const wb = XLSX.utils.book_new();
      const dataRows = this.buildExcelDataRows();
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(dataRows), 'Rapport');

      const kpiRows = [
        { Indicateur: 'Transactions BO (nombre)', Valeur: this.totalBoNombre },
        { Indicateur: 'Transactions BO (volume)', Valeur: this.totalBoVolume },
        { Indicateur: 'Transactions correspondantes BO', Valeur: this.totalMatchesBo },
        { Indicateur: 'Partenaire (nombre)', Valeur: this.totalPartNombre },
        { Indicateur: 'Partenaire (volume)', Valeur: this.totalPartVolume },
        { Indicateur: 'Écart nombre (ajusté J±1)', Valeur: this.totalEcartNombreAjuste },
        { Indicateur: 'Écart volume (ajusté J±1)', Valeur: this.totalEcartVolumeAjuste },
        { Indicateur: 'Services avec écart', Valeur: this.servicesAvecEcart },
        { Indicateur: 'Services total', Valeur: this.totalServices },
        { Indicateur: 'Écarts BO (en-tête)', Valeur: this.ecartHeaderLabel(this.ecartBoOnlyCount) },
        { Indicateur: 'Écarts Partenaire (en-tête)', Valeur: this.ecartHeaderLabel(this.ecartPartnerOnlyCount) }
      ];
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(kpiRows), 'Synthèse');

      const meta = [
        {
          Périmètre: this.subtitle,
          Pays: this.selectedCountry,
          'Date début': this.getNormalizedDateRange()?.start || this.dateDebut,
          'Date fin': this.getNormalizedDateRange()?.end || this.dateFin,
          ENV: this.selectedEnv,
          Utilisateur: this.displayUserName,
          Services:
            this.selectedServices.length > 0
              ? this.selectedServices.join(', ')
              : 'Tous (périmètre)',
          Commentaire: this.commentaire || ''
        }
      ];
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(meta), 'Infos');

      const fileName = `${this.buildExportBaseName()}.xlsx`;
      XLSX.writeFile(wb, fileName);
      await this.popupService.showSuccess(
        this.t('RBP.export.downloaded', { file: fileName }),
        this.t('RBP.nav.exportExcel')
      );
    } catch (e) {
      console.error('Erreur export Excel rapport BO vs Partenaire:', e);
      await this.popupService.showError(
        this.t('RBP.export.errorExcel'),
        this.t('POPUP.error')
      );
    } finally {
      this.isExportingExcel = false;
      this.cdr.markForCheck();
    }
  }

  /**
   * Export PDF (même principe que l’état des réconciliations dashboard / relevé : html2canvas + jsPDF paysage).
   * Déploie les groupes de services pour inclure toutes les lignes dans la capture.
   */
  async exportToPdf(): Promise<void> {
    const el = this.pdfExportContentRef?.nativeElement;
    if (!el || !this.canExportPdf) {
      return;
    }

    const expandedBefore = new Set(this.expandedGroupIds);
    for (const b of this.tableDisplayBlocks) {
      if (b.members.length > 1) {
        this.expandedGroupIds.add(b.id);
      }
    }

    this.isExportingPdf = true;
    this.cdr.detectChanges();
    await new Promise<void>((resolve) => setTimeout(resolve, 200));

    const originalOverflow = el.style.overflowY;
    const originalMaxHeight = el.style.maxHeight;
    el.style.overflowY = 'visible';
    el.style.maxHeight = 'none';

    const tableWrap = el.querySelector('.rrbp-table-wrap') as HTMLElement | null;
    let twOverflow: string | null = null;
    let twMaxHeight: string | null = null;
    if (tableWrap) {
      twOverflow = tableWrap.style.overflow;
      twMaxHeight = tableWrap.style.maxHeight;
      tableWrap.style.overflow = 'visible';
      tableWrap.style.maxHeight = 'none';
    }

    try {
      const canvas = await html2canvas(el, {
        scale: 2,
        useCORS: true,
        logging: false,
        backgroundColor: '#f2f0eb'
      });

      const imgWidth = canvas.width;
      const imgHeight = canvas.height;
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF('l', 'px', [imgWidth, imgHeight]);
      const pdfW = pdf.internal.pageSize.getWidth();
      const pdfH = pdf.internal.pageSize.getHeight();
      pdf.addImage(imgData, 'PNG', 0, 0, pdfW, pdfH);

      const fileName = `${this.buildExportBaseName()}.pdf`;
      pdf.save(fileName);
      await this.popupService.showSuccess(
        this.t('RBP.export.downloaded', { file: fileName }),
        this.t('RBP.nav.exportPdf')
      );
    } catch (e) {
      console.error('Erreur export PDF rapport BO vs Partenaire:', e);
      await this.popupService.showError(
        this.t('RBP.export.errorPdf'),
        this.t('POPUP.error')
      );
    } finally {
      el.style.overflowY = originalOverflow;
      el.style.maxHeight = originalMaxHeight;
      if (tableWrap) {
        tableWrap.style.overflow = twOverflow ?? '';
        tableWrap.style.maxHeight = twMaxHeight ?? '';
      }

      this.expandedGroupIds.clear();
      expandedBefore.forEach((id) => this.expandedGroupIds.add(id));
      this.isExportingPdf = false;
      this.cdr.detectChanges();
    }
  }
}
