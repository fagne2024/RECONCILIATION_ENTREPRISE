import { Component, OnInit, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { switchMap, take } from 'rxjs/operators';
import {
    DashboardService,
    ReleveManualRangeRow
} from '../../services/dashboard.service';
import { ChartConfiguration } from 'chart.js';
import { DashboardReconciliationService, Result8RecData, RecoJ1BlockingComment, RecoAuditActionStat } from '../../services/dashboard-reconciliation.service';
import {
  RECONCILIATION_ENV_OPTIONS,
  normalizeReconciliationReportEnv
} from '../../constants/reconciliation-env-options';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import {
    resolveTraitementKind,
    TraitementKind
} from '../../shared/result8rec-audit-display';
import { countriesMatch, countryDisplayLabel, normalizeCountryFilterOptions } from '../../utils/country-codes.util';
import { UserService } from '../../services/user.service';
import {
    TopUsersConfigService,
    TopUsersConfig,
    TopUsersCategoryConfig,
    DEFAULT_TOP_USERS_CONFIG,
    BUILTIN_CATEGORY_KEYS,
    cloneTopUsersConfig
} from '../../services/top-users-config.service';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { forkJoin, of } from 'rxjs';
import { catchError } from 'rxjs/operators';

type RecoSummaryStatus = 'RECONCILIE' | 'NON_RECONCILIE' | 'EN_COURS' | 'NON_RECONCILIE';

type RecoStatusFilter =
    | 'ALL'
    | 'RECONCILIE'
    | 'EN_COURS_VALIDATION'
    | 'EN_COURS_CLOTURE'
    | 'EN_COURS_TRAITEMENT'
    | 'NON_RECONCILIE';

interface RecoDayCell {
    date: string;
    status: RecoSummaryStatus;
    ticketId: string;
    env: string;
    traitementKind?: TraitementKind;
    service?: string;
    country?: string;
    requiresJ1BlockingComment?: boolean;
    blockingComment?: string;
    blockingCommentBy?: string;
}

/** Agrégat affiché dans la popup Statistiques réconciliation (nombres + volumes + %). */
export interface TransactStatsSnapshot {
    correspondance: number;
    transactionDenoue: number;
    transactionEchec: number;
    totalReference: number;
    pctCorrespondance: number;
    pctDenoue: number;
    pctEchec: number;
    correspondanceVolume: number;
    transactionDenoueVolume: number;
    transactionEchecVolume: number;
    totalReferenceVolume: number;
    pctCorrespondanceVolume: number;
    pctDenoueVolume: number;
    pctEchecVolume: number;
}

export type TopUserCategoryKey = string;

/** Un utilisateur classé dans une catégorie du « Top des utilisateurs ». */
export interface TopUserEntry {
    username: string;
    displayName: string;
    initials: string;
    count: number;
    delta: number;
    barPct: number;
    photo?: string | null;
}

/** Une catégorie (colonne) du « Top des utilisateurs ». */
export interface TopUserCategory {
    key: string;
    titleKey: string;
    actionLabelKey: string;
    /** Titre personnalisé (Configuration > Top utilisateurs) ; sinon traduction. */
    customTitle?: string | null;
    /** Libellé d'action personnalisé ; sinon traduction. */
    customActionLabel?: string | null;
    accent: string;
    total: number;
    users: TopUserEntry[];
}
@Component({
    selector: 'app-etat-reconciliations',
    standalone: true,
    imports: [TranslateModule, CommonModule, FormsModule, ReactiveFormsModule],
    templateUrl: './etat-reconciliations.component.html',
    styleUrls: ['./etat-reconciliations.component.scss']
})
export class EtatReconciliationsComponent implements OnInit {
    private readonly moduleContext = 'Résultats';

    summaryPeriod: 'jour' | 'semaine' | 'semaine_passee' | '7_jours' | '30_jours' | 'mois' | 'trimestre' | 'semestre' | 'annee' = 'semaine';

    reconciliationSummaryEnv: string = 'BET';
    reconciliationSummaryCountry: string = '';
    reconciliationSummaryCountries: string[] = [];
    reconciliationSummaryService: string = '';
    reconciliationSummaryServices: string[] = [];
    readonly reconciliationEnvOptions: string[] = ['ALL', ...RECONCILIATION_ENV_OPTIONS];
    get recoValidatedStatusLabel(): string {
        return this.t('ETA.status.reconciled');
    }

    get recoValidatedStatusLabelPlural(): string {
        return this.t('ETA.statusPlural');
    }

    get recoValidatedRateLabel(): string {
        return this.t('ETA.reconciledRateLabel');
    }
    reconciliationSummaryLoading: boolean = false;
    reconciliationSummaryLoadingMore = false;
    private recoSummaryLoadToken = 0;
    reconciliationSummaryError: string | null = null;
    reconciliationSummaryRows: {
        service: string;
        label?: string;
        country?: string;
        days: RecoDayCell[];
    }[] = [];
    weekDays: { label: string; date: string }[] = [];
    visibleWeekDays: { label: string; date: string }[] = [];

    // « Top des utilisateurs » : classement calculé depuis l'audit result8rec.
    topUsersLoading = false;
    topUsersCategories: TopUserCategory[] = [];
    /** Réglages affichés (Configuration > Top utilisateurs). */
    topUsersConfig: TopUsersConfig = cloneTopUsersConfig(DEFAULT_TOP_USERS_CONFIG);
    private topUsersLoadToken = 0;

  trackByIndex = (index: number): number => index;

  trackByValue = (index: number, value: any): any => value;

  trackByDate = (index: number, item: { date?: string }): string => item?.date ?? String(index);

  trackById = (index: number, item: { id?: string }): string => item?.id ?? String(index);

  trackByCategoryKey = (index: number, item: TopUserCategory): string => item?.key ?? String(index);

  trackByUsername = (index: number, item: TopUserEntry): string => item?.username ?? String(index);

  /** Nombre de colonnes du bloc Top (1..3) — utilisé par la grille CSS. */
  get topUsersColumns(): string {
    return String(Math.max(1, this.topUsersCategories.length));
  }
    private visibleDayIndices: number[] = [];
    recoStats = {
        total: 0,
        reconcilie: 0,
        enCours: 0,
        enCoursSupport: 0,
        enCoursCdo: 0,
        enCoursGroup: 0,
        nonReco: 0,
        tauxReconcilie: 0
    };
    reconciliationStatusFilter: RecoStatusFilter = 'ALL';
    reconciliationPageIndex: number = 0;
    reconciliationPageSize = 10;
    readonly reconciliationPageSizeOptions = [5, 10, 20, 50];
    serviceSearchQuery = '';
    sortServiceAsc = true;
    weekendFocusActive = false;
    countryTabFilter = 'ALL';
    anomaliesOnlyFilter = false;
    inlineCommentsMode = false;
    lastRefreshAt: Date | null = null;
    chartHoverIndex: number | null = null;
    previousRecoStats = {
        total: 0,
        reconcilie: 0,
        enCours: 0,
        enCoursSupport: 0,
        enCoursCdo: 0,
        enCoursGroup: 0,
        nonReco: 0,
        tauxReconcilie: 0
    };
    @ViewChild('detailTablePanel') detailTablePanelRef?: ElementRef<HTMLElement>;

    private j1BlockingComments = new Map<string, RecoJ1BlockingComment>();
    blockingCommentModalOpen = false;
    blockingCommentDraft = '';
    blockingCommentSaving = false;
    blockingCommentError: string | null = null;
    blockingCommentTarget: RecoDayCell | null = null;
    blockingCommentRowMeta: { service: string; country: string; env: string } | null = null;
    /** Commentaire enregistré de la case ouverte (porte l'état de la relance e-mail). */
    blockingCommentStored: RecoJ1BlockingComment | null = null;
    mailRecipientsDraft = '';
    mailCcDraft = '';
    mailAlertBusy = false;
    mailAlertMessage: string | null = null;
    // Popup "Vue semaine" (État des réconciliations)
    recoViewModalOpen: boolean = false;
    recoViewWeekStart: string = ''; // Lundi de la semaine affichée (YYYY-MM-DD)
    /** Période réelle filtrée (inclusif), peut dépasser une semaine civile. */
    recoViewPeriodStart = '';
    recoViewPeriodEnd = '';
    recoViewWeekDays: { label: string; date: string }[] = [];
    recoViewRows: {
        service: string;
        label?: string;
        country?: string;
        days: RecoDayCell[];
    }[] = [];
    // Filtres du popup Vue semaine
    recoViewCountry: string = '';
    /** Services sélectionnés (vide = tous). */
    recoViewSelectedServices: string[] = [];
    /** ENV du popup (indépendant du bloc principal) : cloisonne les services et les lignes. */
    recoViewEnv: string = 'BET';
    /** Options ENV du popup = liste métier + ENV réellement présents dans result8rec (cloisonnement affichable). */
    recoViewEnvSelectOptions: string[] = ['ALL', ...RECONCILIATION_ENV_OPTIONS];
    /** Services présents dans result8rec pour le couple pays + ENV courants du popup. */
    recoViewServiceOptions: string[] = [];
    recoViewSelectedDay: string = ''; // YYYY-MM-DD (vide = tous les jours)
    recoViewLoading: boolean = false;
    recoViewLoadingMore = false;
    private recoViewLoadToken = 0;
    recoViewError: string | null = null;
    recoViewStats = {
        total: 0,
        reconcilie: 0,
        enCours: 0,
        enCoursSupport: 0,
        enCoursCdo: 0,
        enCoursGroup: 0,
        nonReco: 0,
        tauxReconcilie: 0
    };
    @ViewChild('recoViewExportContent') recoViewExportContentRef!: ElementRef<HTMLDivElement>;
    @ViewChild('transactStatsExportContent') transactStatsExportContentRef!: ElementRef<HTMLDivElement>;

    /** Popup « Statistiques réconciliation » (agrégats result8rec, mêmes filtres que la vue semaine) */
    transactStatsModalOpen = false;
    transactStatsWeekStart = '';
    transactStatsPeriodStart = '';
    transactStatsPeriodEnd = '';
    transactStatsWeekDays: { label: string; date: string }[] = [];
    transactStatsCountry = '';
    /** Services sélectionnés (vide = tous). */
    transactStatsSelectedServices: string[] = [];
    transactStatsEnv = 'BET';
    transactStatsSelectedDay = '';
    transactStatsEnvSelectOptions: string[] = ['ALL', ...RECONCILIATION_ENV_OPTIONS];
    transactStatsServiceOptions: string[] = [];
    transactStatsLoading = false;
    transactStatsLoadingMore = false;
    private transactStatsLoadToken = 0;
    transactStatsError: string | null = null;
    /** Total sur le périmètre filtré (toujours renseigné). */
    transactStats: TransactStatsSnapshot = {
        correspondance: 0,
        transactionDenoue: 0,
        transactionEchec: 0,
        totalReference: 0,
        pctCorrespondance: 0,
        pctDenoue: 0,
        pctEchec: 0,
        correspondanceVolume: 0,
        transactionDenoueVolume: 0,
        transactionEchecVolume: 0,
        totalReferenceVolume: 0,
        pctCorrespondanceVolume: 0,
        pctDenoueVolume: 0,
        pctEchecVolume: 0
    };
    /** Détail par service lorsque ≥ 2 services sont sélectionnés. */
    transactStatsPerService: { service: string; stats: TransactStatsSnapshot }[] = [];

    // Graphiques État des réconciliations (donut + évolution par jour)
    recoDonutChartData: ChartConfiguration<'doughnut'>['data'] = { labels: [], datasets: [] };
    recoDonutChartOptions: ChartConfiguration<'doughnut'>['options'] = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: { position: 'bottom' },
            title: { display: true, text: this.t('ETA.statusDistribution') },
            // Évite tout conflit avec chartjs-plugin-datalabels (graphiques métriques détaillées).
            datalabels: { display: false }
        }
    };
    recoEvolutionChartData: ChartConfiguration<'bar'>['data'] = { labels: [], datasets: [] };
    recoEvolutionChartOptions: ChartConfiguration<'bar'>['options'] = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: { position: 'top' },
            title: { display: true, text: this.t('ETA.evolutionByDay') },
            datalabels: { display: false }
        },
        scales: {
            x: { stacked: true },
            y: { stacked: true, beginAtZero: true }
        }
    };
    constructor(
        private dashboardService: DashboardService,
        private dashboardReconciliationService: DashboardReconciliationService,
        private userService: UserService,
        private topUsersConfigService: TopUsersConfigService,
        private translate: TranslateService
    ) {}

    private t(key: string, params?: any): string {
        return this.translate.instant(key, params) as string;
    }

    /** Noms de jours abrégés localisés, indexés par getDay() (0 = dimanche). */
    private shortDayNames(): string[] {
        return [0, 1, 2, 3, 4, 5, 6].map(i => this.t('DOW.' + i));
    }

    ngOnInit(): void {
        if (!this.reconciliationSummaryEnv) {
            this.reconciliationSummaryEnv = 'BET';
        }
        this.loadFilterOptions();
        this.loadReconciliationSummary();
    }

    onSummaryPeriodChange(): void {
        this.loadReconciliationSummary();
    }

    get summaryPeriodSubtitle(): string {
        const label = this.t('ETA.period.' + this.summaryPeriod) || this.t('ETA.period.semaine');
        return this.t('ETA.periodPrefix') + label;
    }

    private loadFilterOptions(): void {
        this.dashboardService.getReconciliationFilters().subscribe({
            next: (filters) => {
                this.reconciliationSummaryCountries = normalizeCountryFilterOptions(filters.countries || []);
                this.reconciliationSummaryServices = filters.services || [];
            },
            error: (err) => {
                console.error('Erreur lors du chargement des filtres de réconciliation:', err);
            }
        });
    }

    /** Date locale YYYY-MM-DD (évite le décalage fuseau de `new Date('YYYY-MM-DD')`). */
    private formatLocalYmd(d: Date): string {
        const y = d.getFullYear();
        const m = (d.getMonth() + 1).toString().padStart(2, '0');
        const day = d.getDate().toString().padStart(2, '0');
        return `${y}-${m}-${day}`;
    }

    /** Partie date YYYY-MM-DD depuis result8rec (ignore l’heure si présente). */
    private extractResult8DateOnly(raw: string | undefined | null): string | null {
        const part = (raw || '').trim().split(/[\sT]/)[0];
        return /^\d{4}-\d{2}-\d{2}$/.test(part) ? part : null;
    }

    /** Champ env tel que renvoyé par l’API (camelCase ou variante). */
    private getResult8RecItemEnv(item: Result8RecData): string {
        const anyItem = item as Result8RecData & { env_code?: string | null };
        const v = item.env ?? item.envCode ?? anyItem.env_code;
        return v != null ? String(v).trim() : '';
    }

    /** Options du sélecteur ENV du popup : ALL + ENV connus + toute valeur présente en base. */
    private buildRecoViewEnvSelectOptions(data: Result8RecData[]): string[] {
        const opts = new Set<string>(['ALL', ...RECONCILIATION_ENV_OPTIONS]);
        data.forEach(row => {
            const k = this.reconciliationEnvStrictKey(this.getResult8RecItemEnv(row));
            opts.add(k);
        });
        return Array.from(opts).sort((a, b) => {
            if (a === 'ALL') {
                return -1;
            }
            if (b === 'ALL') {
                return 1;
            }
            return a.localeCompare(b, 'fr');
        });
    }

    /**
     * Filtre env : ALL = pas de filtre ; T-E (TOTAL) = agrégat seul ;
     * BET/HT/... = cet env ou lignes TOTAL (sauvegardes sans env explicite).
     */
    private matchesReconciliationEnv(itemEnv: string | undefined | null, targetEnv: string): boolean {
        const te = (targetEnv || 'ALL').trim() || 'ALL';
        if (te === 'ALL') {
            return true;
        }
        const ie = ((itemEnv || '').trim() || 'TOTAL');
        if (te === 'TOTAL') {
            return ie === 'TOTAL';
        }
        return ie === te || ie === 'TOTAL';
    }

    /**
     * Filtre ENV pour « État des réconciliations » : dès qu’un ENV précis est choisi,
     * cloisonnement strict (pas de mélange T-E / BET / HT sur les services et lignes).
     */
    private matchesRecoSummaryEnv(itemEnv: string | undefined | null, targetEnv: string): boolean {
        const te = (targetEnv || 'ALL').trim() || 'ALL';
        if (te === 'ALL') {
            return true;
        }
        return this.matchesReconciliationEnvStrict(itemEnv, targetEnv);
    }

    /**
     * Clé ENV pour cloisonnement strict (popup vue semaine) : vide / TOTAL / T-E → agrégat T-E uniquement ;
     * pas de rattachement des agrégats à BET, HT, etc.
     */
    private reconciliationEnvStrictKey(env?: string | null): string {
        const raw = (env ?? '').trim();
        if (!raw) {
            return 'T-E';
        }
        const u = raw.toUpperCase();
        if (u === 'TOTAL' || u === 'T-E') {
            return 'T-E';
        }
        return u;
    }

    /**
     * Filtre ENV strict : une ligne n’apparaît pour BET que si son env est explicitement BET (idem pour HT, …).
     * T-E regroupe uniquement lignes sans env explicite, TOTAL ou T-E. ALL = pas de filtre.
     */
    private matchesReconciliationEnvStrict(itemEnv: string | undefined | null, targetEnv: string): boolean {
        const te = (targetEnv || 'ALL').trim() || 'ALL';
        if (te === 'ALL') {
            return true;
        }
        return this.reconciliationEnvStrictKey(itemEnv) === this.reconciliationEnvStrictKey(targetEnv);
    }

    /** Traitement considéré comme « Terminé » (casse / accents). */
    private isTraitementTermineLabel(traitement?: string | null): boolean {
        const n = (traitement || '')
            .trim()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toLowerCase();
        return n === 'termine';
    }

    private readonly traitementKindPriority: Record<TraitementKind, number> = {
        none: 0,
        support: 1,
        cdo: 2,
        group: 3,
        termine: 4
    };

    /** Niveau de traitement le plus avancé parmi les lignes non terminées. */
    private resolveDominantTraitementKind(
        lines: { traitement?: string | null }[]
    ): TraitementKind {
        let best: TraitementKind = 'support';
        let bestPriority = 0;
        for (const line of lines) {
            if (this.isTraitementTermineLabel(line.traitement)) {
                continue;
            }
            const kind = resolveTraitementKind(line.traitement);
            const priority = this.traitementKindPriority[kind] ?? 0;
            if (priority > bestPriority) {
                bestPriority = priority;
                best = kind === 'none' ? 'support' : kind;
            }
        }
        return bestPriority === 0 ? 'support' : best;
    }

    private buildRecoDayCellStatus(
        matchingForDay: Result8RecData[],
        dayDate: string,
        env: string
    ): RecoDayCell {
        let status: RecoSummaryStatus;
        let ticketId = '';
        let traitementKind: TraitementKind | undefined;

        if (!matchingForDay.length) {
            status = 'NON_RECONCILIE';
        } else {
            const anyNotTermine = matchingForDay.some(
                (line) => !this.isTraitementTermineLabel(line.traitement)
            );
            if (anyNotTermine) {
                status = 'EN_COURS';
                traitementKind = this.resolveDominantTraitementKind(matchingForDay);
            } else {
                status = 'RECONCILIE';
            }
            const ticketLine = matchingForDay.find(
                (line) => (line.glpiId || '').trim().length > 0
            );
            ticketId = ticketLine ? (ticketLine.glpiId || '') : '';
        }

        return { date: dayDate, status, ticketId, env, traitementKind };
    }

    /** Réconciliation validée & clôturée (tous traitements terminés). */
    private isRecoValidatedAndClosed(day: RecoDayCell): boolean {
        return day.status === 'RECONCILIE';
    }

    /** J+2 atteint : date du jour ≥ J+2 par rapport à la date de réconciliation. */
    isJ1CommentRequired(day: RecoDayCell): boolean {
        if (!day?.date || this.isRecoValidatedAndClosed(day)) {
            return false;
        }
        const jPlus2 = this.addDaysToIsoDate(day.date, 2);
        const today = this.formatLocalYmd(new Date());
        return today >= jPlus2;
    }

    /** Affiche le commentaire de blocage uniquement si la reco n'est pas encore clôturée. */
    shouldShowBlockingComment(day: RecoDayCell): boolean {
        return this.isJ1CommentRequired(day);
    }

    getJ1CommentForCell(
        day: RecoDayCell,
        row: { service: string; country?: string; label?: string }
    ): RecoJ1BlockingComment | null {
        if (this.isRecoValidatedAndClosed(day)) {
            return null;
        }
        const env = this.resolveDayCellEnv(day);
        const key = this.buildBlockingCommentKey(day.date, row.service, this.resolveRowCountry(row), env);
        return this.j1BlockingComments.get(key) || null;
    }

    getJ1CommentText(day: RecoDayCell, row: { service: string; country?: string; label?: string }): string {
        if (this.isRecoValidatedAndClosed(day)) {
            return '';
        }
        const stored = this.getJ1CommentForCell(day, row);
        return (stored?.commentText || day.blockingComment || '').trim();
    }

    private resolveDayCellEnv(day: RecoDayCell): string {
        const fromDay = (day.env || '').trim();
        if (fromDay && fromDay !== 'ALL') {
            return fromDay;
        }
        const filter = (this.reconciliationSummaryEnv || 'ALL').trim() || 'ALL';
        return filter === 'ALL' ? '' : filter;
    }

    private buildBlockingCommentKey(recoDate: string, service: string, country: string, env: string): string {
        const envKey = this.reconciliationEnvStrictKey(env);
        const countryKey = (country || '').trim().toUpperCase();
        return `${recoDate}|${service}|${countryKey}|${envKey}`;
    }

    private enrichDayCell(
        day: RecoDayCell,
        service: string,
        country: string,
        env: string
    ): RecoDayCell {
        const requiresJ1BlockingComment = this.isJ1CommentRequired(day);
        const stored = this.isRecoValidatedAndClosed(day)
            ? null
            : this.j1BlockingComments.get(
                this.buildBlockingCommentKey(day.date, service, country, env)
            );
        return {
            ...day,
            service,
            country,
            requiresJ1BlockingComment,
            blockingComment: stored?.commentText,
            blockingCommentBy: stored?.updatedBy
        };
    }

    private reapplyBlockingCommentsToRows(): void {
        if (!this.reconciliationSummaryRows.length) {
            return;
        }
        const targetEnv = (this.reconciliationSummaryEnv || 'ALL').trim() || 'ALL';
        this.reconciliationSummaryRows = this.reconciliationSummaryRows.map(row => ({
            ...row,
            days: row.days.map(day => this.enrichDayCell(
                day,
                row.service,
                row.country || '',
                this.resolveDayCellEnv(day) || (targetEnv === 'ALL' ? '' : targetEnv)
            ))
        }));
    }

    private loadJ1BlockingCommentsForPeriod(ctx: { periodStartStr: string; periodEndExclusiveStr: string }): void {
        const endInclusive = this.addDaysToIsoDate(ctx.periodEndExclusiveStr, -1);
        this.dashboardReconciliationService
            .getJ1BlockingComments(ctx.periodStartStr, endInclusive, this.moduleContext)
            .pipe(take(1))
            .subscribe({
                next: (rows) => {
                    this.j1BlockingComments.clear();
                    (rows || []).forEach(row => {
                        const key = this.buildBlockingCommentKey(
                            row.recoDate,
                            row.service,
                            row.country,
                            row.env
                        );
                        this.j1BlockingComments.set(key, row);
                    });
                    this.reapplyBlockingCommentsToRows();
                },
                error: (err) => console.warn('Chargement commentaires J+2:', err)
            });
    }

    get missingJ1BlockingCommentsCount(): number {
        let count = 0;
        this.reconciliationSummaryRows.forEach(row => {
            row.days.forEach(day => {
                if (this.isJ1CommentRequired(day) && !this.getJ1CommentText(day, row)) {
                    count++;
                }
            });
        });
        return count;
    }

    get paginationLabel(): string {
        const rows = this.getFilteredReconciliationSummaryRows();
        if (!rows.length) {
            return this.t('ETA.pagination.zero');
        }
        const start = this.reconciliationPageIndex * this.reconciliationPageSize + 1;
        const end = Math.min(rows.length, start + this.reconciliationPageSize - 1);
        return this.t('ETA.pagination.range', { start, end, total: rows.length });
    }

    onPageSizeChange(): void {
        this.reconciliationPageIndex = 0;
    }

    private resolveRowCountry(row: { service: string; country?: string; label?: string }): string {
        const direct = (row.country || '').trim();
        if (direct) {
            return direct.toUpperCase();
        }
        const parsed = this.parseServiceRowLabel(row.label || row.service);
        return (parsed.code || '').trim().toUpperCase();
    }

    openBlockingCommentModal(day: RecoDayCell, row: { service: string; country?: string; label?: string }): void {
        if (!this.shouldShowBlockingComment(day)) {
            return;
        }
        const country = this.resolveRowCountry(row);
        if (!country) {
            this.blockingCommentError = this.t('ETA.error.countryNotFound');
        }
        const env = this.resolveDayCellEnv(day) || 'T-E';
        this.blockingCommentTarget = day;
        this.blockingCommentRowMeta = {
            service: row.service,
            country,
            env
        };
        this.blockingCommentDraft = this.getJ1CommentText(day, row);
        this.blockingCommentStored = this.getJ1CommentForCell(day, row);
        this.mailRecipientsDraft = (this.blockingCommentStored?.mailRecipients || []).join(', ');
        this.mailCcDraft = (this.blockingCommentStored?.mailCcRecipients || []).join(', ');
        this.mailAlertMessage = null;
        this.blockingCommentError = null;
        this.blockingCommentModalOpen = true;
    }

    closeBlockingCommentModal(): void {
        this.blockingCommentModalOpen = false;
        this.blockingCommentTarget = null;
        this.blockingCommentRowMeta = null;
        this.blockingCommentDraft = '';
        this.blockingCommentError = null;
        this.blockingCommentStored = null;
        this.mailRecipientsDraft = '';
        this.mailCcDraft = '';
        this.mailAlertMessage = null;
    }

    get isMailAlertActive(): boolean {
        return !!this.blockingCommentStored?.mailAlertActive;
    }

    /** Raison d'arrêt automatique de la relance (statut changé, commentaire absent), si elle n'est plus active. */
    get mailAlertStoppedLabel(): string {
        const stored = this.blockingCommentStored;
        if (!stored || stored.mailAlertActive !== false || !stored.mailStoppedReason) {
            return '';
        }
        switch (stored.mailStoppedReason) {
            case 'STATUT_CHANGE':
                return this.t('ETA.mail.stoppedStatusChanged');
            case 'COMMENTAIRE_ABSENT':
                return this.t('ETA.mail.stoppedNoComment');
            default:
                return this.t('ETA.mail.stoppedManual');
        }
    }

    formatMailDateTime(iso?: string | null): string {
        if (!iso) {
            return '';
        }
        const d = new Date(iso);
        return isNaN(d.getTime())
            ? iso
            : d.toLocaleString(this.translate.currentLang || 'fr', { dateStyle: 'short', timeStyle: 'short' });
    }

    private buildBlockingCommentPayload(): RecoJ1BlockingComment | null {
        const text = (this.blockingCommentDraft || '').trim();
        if (!text) {
            this.blockingCommentError = this.t('ETA.error.commentRequired');
            return null;
        }
        if (!this.blockingCommentTarget || !this.blockingCommentRowMeta) {
            return null;
        }
        if (!this.blockingCommentRowMeta.country) {
            this.blockingCommentError = this.t('ETA.error.countryRequired');
            return null;
        }
        return {
            recoDate: this.blockingCommentTarget.date,
            service: this.blockingCommentRowMeta.service,
            country: this.blockingCommentRowMeta.country,
            env: this.blockingCommentRowMeta.env,
            commentText: text
        };
    }

    private storeJ1Comment(saved: RecoJ1BlockingComment): void {
        const key = this.buildBlockingCommentKey(saved.recoDate, saved.service, saved.country, saved.env);
        this.j1BlockingComments.set(key, saved);
        this.reapplyBlockingCommentsToRows();
        if (this.blockingCommentModalOpen) {
            this.blockingCommentStored = saved;
        }
    }

    hasActiveMailAlert(day: RecoDayCell, row: { service: string; country?: string; label?: string }): boolean {
        return !!this.getJ1CommentForCell(day, row)?.mailAlertActive;
    }

    private parseMailRecipients(value: string): string[] {
        return (value || '')
            .split(/[,;\s]+/)
            .map(r => r.trim().toLowerCase())
            .filter(r => !!r);
    }

    private sameRecipients(a: string[], b: string[]): boolean {
        const norm = (list: string[]) => [...new Set(list.map(r => r.trim().toLowerCase()))].sort().join(',');
        return norm(a) === norm(b);
    }

    stopBlockingCommentMail(): void {
        const stored = this.blockingCommentStored;
        if (!stored) {
            return;
        }
        this.mailAlertBusy = true;
        this.blockingCommentError = null;
        this.mailAlertMessage = null;
        this.dashboardReconciliationService
            .stopJ1MailAlert(
                { recoDate: stored.recoDate, service: stored.service, country: stored.country, env: stored.env },
                this.moduleContext
            )
            .pipe(take(1))
            .subscribe({
                next: (saved) => {
                    this.storeJ1Comment(saved);
                    this.mailAlertMessage = this.t('ETA.mail.stoppedManual');
                    this.mailAlertBusy = false;
                },
                error: (err) => {
                    console.error('Erreur arrêt relance e-mail:', err);
                    this.blockingCommentError = err?.error?.message || this.t('ETA.mail.stopFailed');
                    this.mailAlertBusy = false;
                }
            });
    }

    /**
     * Enregistre le commentaire. Si des destinataires sont renseignés, l'e-mail part aussitôt et la relance
     * quotidienne s'active ; rien n'est renvoyé si la relance est déjà active avec le même texte et les mêmes destinataires.
     */
    saveBlockingComment(): void {
        const payload = this.buildBlockingCommentPayload();
        if (!payload) {
            return;
        }
        const recipients = this.parseMailRecipients(this.mailRecipientsDraft);
        const ccRecipients = this.parseMailRecipients(this.mailCcDraft).filter(r => !recipients.includes(r));
        if (!recipients.length && ccRecipients.length) {
            this.blockingCommentError = this.t('ETA.mail.ccWithoutRecipients');
            return;
        }
        const stored = this.blockingCommentStored;
        const alreadySent = !!stored?.mailAlertActive
            && (stored.commentText || '').trim() === payload.commentText
            && this.sameRecipients(stored.mailRecipients || [], recipients)
            && this.sameRecipients(stored.mailCcRecipients || [], ccRecipients);
        const sendMail = recipients.length > 0 && !alreadySent;
        let commentSaved = false;

        this.blockingCommentSaving = true;
        this.blockingCommentError = null;
        this.mailAlertMessage = null;
        this.dashboardReconciliationService
            .saveJ1BlockingComment(payload, this.moduleContext)
            .pipe(
                take(1),
                switchMap((saved) => {
                    commentSaved = true;
                    this.storeJ1Comment(saved);
                    return sendMail
                        ? this.dashboardReconciliationService.activateJ1MailAlert(
                            { recoDate: saved.recoDate, service: saved.service, country: saved.country, env: saved.env, recipients, ccRecipients },
                            this.moduleContext
                        )
                        : of(saved);
                })
            )
            .subscribe({
                next: (saved) => {
                    this.storeJ1Comment(saved);
                    this.blockingCommentSaving = false;
                    if (sendMail && saved.mailLastError) {
                        this.mailAlertMessage = this.t('ETA.mail.sentPartial', { error: saved.mailLastError });
                        return;
                    }
                    this.closeBlockingCommentModal();
                },
                error: (err) => {
                    console.error('Erreur sauvegarde commentaire J+2 / envoi e-mail:', err);
                    const apiMessage = err?.error?.message;
                    this.blockingCommentError = commentSaved
                        ? this.t('ETA.mail.savedButSendFailed', { error: apiMessage || this.t('ETA.mail.sendFailed') })
                        : apiMessage || this.t('ETA.error.saveFailed');
                    this.blockingCommentSaving = false;
                }
            });
    }

    getStatusPillNgClass(day: RecoDayCell): Record<string, boolean> {
        return {
            'status-ok': day.status === 'RECONCILIE',
            'status-nok': day.status === 'NON_RECONCILIE',
            'status-en-cours': day.status === 'EN_COURS' && day.traitementKind === 'support',
            'status-en-cours-cdo': day.status === 'EN_COURS' && day.traitementKind === 'cdo',
            'status-en-cours-group': day.status === 'EN_COURS' && day.traitementKind === 'group',
            'status-en-cours-default':
                day.status === 'EN_COURS' &&
                day.traitementKind !== 'support' &&
                day.traitementKind !== 'cdo' &&
                day.traitementKind !== 'group'
        };
    }

    getStatusPillLabel(day: RecoDayCell): string {
        if (day.status === 'RECONCILIE') {
            return this.recoValidatedStatusLabel;
        }
        if (day.status === 'NON_RECONCILIE') {
            return this.t('ETA.status.notReconciled');
        }
        if (day.status === 'EN_COURS') {
            switch (day.traitementKind) {
                case 'group':
                    return this.t('ETA.status.closing');
                case 'cdo':
                    return this.t('ETA.status.validating');
                case 'support':
                    return this.t('ETA.status.processing');
                default:
                    return this.t('ETA.status.inProgress');
            }
        }
        return this.t('ETA.status.notReconciled');
    }

    private updateVisibleDaysWindow() {
        if (!this.weekDays || this.weekDays.length === 0) {
            this.visibleWeekDays = [];
            this.visibleDayIndices = [];
            return;
        }

        const maxInlineDays = 14;
        if (this.weekDays.length <= maxInlineDays) {
            this.visibleDayIndices = this.weekDays.map((_, i) => i);
            this.visibleWeekDays = [...this.weekDays];
            return;
        }

        // Périodes longues : fenêtre glissante de 7 jours jusqu'à J-1
        const reference = new Date();
        reference.setDate(reference.getDate() - 1);
        const refDateStr = this.formatLocalYmd(reference);

        let endIndex = this.weekDays.findIndex(day => day.date === refDateStr);
        if (endIndex === -1) {
            endIndex = this.weekDays.length - 1;
        }

        const windowSize = 7;
        const startIndex = Math.max(0, endIndex - (windowSize - 1));
        this.visibleDayIndices = [];
        for (let i = startIndex; i <= endIndex && i < this.weekDays.length; i++) {
            this.visibleDayIndices.push(i);
        }

        this.visibleWeekDays = this.visibleDayIndices.map(i => this.weekDays[i]);
    }

    getVisibleDays(row: { days: { date: string; status: any; ticketId: string; env: string; }[] }) {
        if (!row || !row.days) {
            return [];
        }
        if (!this.visibleDayIndices || this.visibleDayIndices.length === 0) {
            return row.days;
        }
        return this.visibleDayIndices
            .map(index => row.days[index])
            .filter(day => !!day);
    }

    private readonly recoChartColors = {
        reconcilie: '#388e3c',
        enCoursSupport: '#f59e0b',
        enCoursCdo: '#17a2b8',
        enCoursGroup: '#4ade80',
        nonReco: '#f57c00'
    };

    private countEnCoursKind(day: RecoDayCell): 'support' | 'cdo' | 'group' {
        if (day.traitementKind === 'cdo' || day.traitementKind === 'group') {
            return day.traitementKind;
        }
        return 'support';
    }

    private dayMatchesStatusFilter(day: RecoDayCell, filter: RecoStatusFilter): boolean {
        if (filter === 'ALL') {
            return true;
        }
        if (filter === 'RECONCILIE') {
            return day.status === 'RECONCILIE';
        }
        if (filter === 'NON_RECONCILIE') {
            return day.status === 'NON_RECONCILIE';
        }
        if (day.status !== 'EN_COURS') {
            return false;
        }
        const kind = this.countEnCoursKind(day);
        if (filter === 'EN_COURS_VALIDATION') {
            return kind === 'cdo';
        }
        if (filter === 'EN_COURS_CLOTURE') {
            return kind === 'group';
        }
        if (filter === 'EN_COURS_TRAITEMENT') {
            return kind === 'support';
        }
        return false;
    }

    /**
     * Taux de couverture de la semaine en cours (lun → J-1) :
     * (services × jours saisis) / (services × jours attendus).
     * Ex. lundi seul tout saisi → 100 % ; mardi ouvert sans saisie → 50 %.
     */
    private computeWeeklyReconciliationRate(
        total: number,
        reconcilie: number,
        enCours: number
    ): number {
        if (total <= 0) {
            return 0;
        }
        const setCount = reconcilie + enCours;
        return (setCount * 100) / total;
    }

    /** Taux affiché : couverture semaine (saisi = réconcilié + en cours). */
    get recoCoverageRatePercent(): number {
        return this.computeWeeklyReconciliationRate(
            this.recoStats.total,
            this.recoStats.reconcilie,
            this.recoStats.enCours
        );
    }

    /** Nombre de cases saisies (réconcilié + en cours) — aligné sur le taux réconcilié. */
    get recoCoverageCount(): number {
        return this.recoStats.reconcilie + this.recoStats.enCours;
    }

    getRecoViewCoverageCount(): number {
        return this.recoViewStats.reconcilie + this.recoViewStats.enCours;
    }

    getRecoViewCoverageRatePercent(): number {
        return this.computeWeeklyReconciliationRate(
            this.recoViewStats.total,
            this.recoViewStats.reconcilie,
            this.recoViewStats.enCours
        );
    }

    private computeReconciliationStats() {
        let total = 0;
        let reconcilie = 0;
        let enCours = 0;
        let enCoursSupport = 0;
        let enCoursCdo = 0;
        let enCoursGroup = 0;
        let nonReco = 0;

        this.reconciliationSummaryRows.forEach(row => {
            row.days.forEach(day => {
                if (!day || !day.status) {
                    return;
                }
                total++;
                if (day.status === 'RECONCILIE') {
                    reconcilie++;
                } else if (day.status === 'EN_COURS') {
                    enCours++;
                    switch (this.countEnCoursKind(day)) {
                        case 'group':
                            enCoursGroup++;
                            break;
                        case 'cdo':
                            enCoursCdo++;
                            break;
                        default:
                            enCoursSupport++;
                            break;
                    }
                } else if (day.status === 'NON_RECONCILIE') {
                    nonReco++;
                }
            });
        });

        const taux = this.computeWeeklyReconciliationRate(total, reconcilie, enCours);

        this.recoStats = {
            total,
            reconcilie,
            enCours,
            enCoursSupport,
            enCoursCdo,
            enCoursGroup,
            nonReco,
            tauxReconcilie: taux
        };
        this.updateRecoChartsData();
    }

    /** Met à jour les données des graphiques donut et évolution par jour. */
    private updateRecoChartsData(): void {
        const s = this.recoStats;
        const c = this.recoChartColors;
        const coverage = s.reconcilie + s.enCours;
        this.recoDonutChartData = {
            labels: [
                this.recoValidatedStatusLabel,
                this.t('ETA.status.processing'),
                this.t('ETA.status.validating'),
                this.t('ETA.status.closing'),
                this.t('ETA.status.notReconciled')
            ],
            datasets: [{
                data: [
                    coverage,
                    0,
                    0,
                    0,
                    s.nonReco
                ],
                backgroundColor: [
                    c.reconcilie,
                    c.enCoursSupport,
                    c.enCoursCdo,
                    c.enCoursGroup,
                    c.nonReco
                ],
                borderWidth: 0
            }]
        };
        const evolution = this.getRecoEvolutionByDay();
        this.recoEvolutionChartData = {
            labels: evolution.labels,
            datasets: [
                { label: this.recoValidatedStatusLabel, data: evolution.reconcilie, backgroundColor: c.reconcilie, stack: 'stack1' },
                { label: this.t('ETA.status.processing'), data: evolution.enCoursSupport, backgroundColor: c.enCoursSupport, stack: 'stack1' },
                { label: this.t('ETA.status.validating'), data: evolution.enCoursCdo, backgroundColor: c.enCoursCdo, stack: 'stack1' },
                { label: this.t('ETA.status.closing'), data: evolution.enCoursGroup, backgroundColor: c.enCoursGroup, stack: 'stack1' },
                { label: this.t('ETA.status.notReconciled'), data: evolution.nonReco, backgroundColor: c.nonReco, stack: 'stack1' }
            ]
        };
    }

    /** Retourne les totaux par jour pour le graphique évolution (Lun, Mar, ...). */
    private getRecoEvolutionByDay(): {
        labels: string[];
        reconcilie: number[];
        enCoursSupport: number[];
        enCoursCdo: number[];
        enCoursGroup: number[];
        nonReco: number[];
    } {
        const labels: string[] = [];
        const reconcilie: number[] = [];
        const enCoursSupport: number[] = [];
        const enCoursCdo: number[] = [];
        const enCoursGroup: number[] = [];
        const nonReco: number[] = [];
        if (!this.weekDays.length || !this.reconciliationSummaryRows.length) {
            return { labels, reconcilie, enCoursSupport, enCoursCdo, enCoursGroup, nonReco };
        }
        const dayNames = this.shortDayNames();
        this.weekDays.forEach((dayInfo, dayIndex) => {
            labels.push(dayNames[dayIndex] || dayInfo.label.split(' ')[0]);
            let r = 0;
            let es = 0;
            let ec = 0;
            let eg = 0;
            let n = 0;
            this.reconciliationSummaryRows.forEach(row => {
                const day = row.days[dayIndex];
                if (!day || !day.status) {
                    return;
                }
                if (day.status === 'RECONCILIE') {
                    r++;
                } else if (day.status === 'EN_COURS') {
                    switch (this.countEnCoursKind(day)) {
                        case 'group':
                            eg++;
                            break;
                        case 'cdo':
                            ec++;
                            break;
                        default:
                            es++;
                            break;
                    }
                } else {
                    n++;
                }
            });
            reconcilie.push(r);
            enCoursSupport.push(es);
            enCoursCdo.push(ec);
            enCoursGroup.push(eg);
            nonReco.push(n);
        });
        return { labels, reconcilie, enCoursSupport, enCoursCdo, enCoursGroup, nonReco };
    }

    getPagedReconciliationRows() {
        const rows = this.getFilteredReconciliationSummaryRows();
        if (!rows || !rows.length) {
            return [];
        }
        const start = this.reconciliationPageIndex * this.reconciliationPageSize;
        return rows.slice(start, start + this.reconciliationPageSize);
    }

    getReconciliationTotalPages(): number {
        const rows = this.getFilteredReconciliationSummaryRows();
        if (!rows || !rows.length) {
            return 1;
        }
        return Math.max(1, Math.ceil(rows.length / this.reconciliationPageSize));
    }

    nextReconciliationPage() {
        const totalPages = this.getReconciliationTotalPages();
        if (this.reconciliationPageIndex < totalPages - 1) {
            this.reconciliationPageIndex++;
        }
    }

    prevReconciliationPage() {
        if (this.reconciliationPageIndex > 0) {
            this.reconciliationPageIndex--;
        }
    }

    canGoPrevDays(): boolean {
        return this.visibleDayIndices.length > 0 && this.visibleDayIndices[0] > 0;
    }

    canGoNextDays(): boolean {
        return this.visibleDayIndices.length > 0 &&
            this.visibleDayIndices[this.visibleDayIndices.length - 1] < this.weekDays.length - 1;
    }

    nextDaysWindow() {
        if (!this.canGoNextDays()) {
            return;
        }
        this.visibleDayIndices = this.visibleDayIndices.map(i => i + 1).filter(i => i < this.weekDays.length);
        this.visibleWeekDays = this.visibleDayIndices.map(i => this.weekDays[i]);
    }

    prevDaysWindow() {
        if (!this.canGoPrevDays()) {
            return;
        }
        this.visibleDayIndices = this.visibleDayIndices.map(i => i - 1).filter(i => i >= 0);
        this.visibleWeekDays = this.visibleDayIndices.map(i => this.weekDays[i]);
    }
    private buildReconciliationSummaryPeriodContext(): {
        periodStartStr: string;
        periodEndExclusiveStr: string;
        eligibilityStartStr: string;
        fetchStartStr: string;
        fetchEndInclusiveStr: string;
    } {
        const reference = new Date();
        reference.setDate(reference.getDate() - 1);

        let periodStart = new Date(reference);
        let periodEnd = new Date(reference);
        let capWeekDisplayToJ1 = false;

        switch (this.summaryPeriod) {
            case 'jour': {
                periodStart = new Date(reference);
                periodStart.setHours(0, 0, 0, 0);
                periodEnd = new Date(periodStart);
                periodEnd.setDate(periodStart.getDate() + 1);
                break;
            }
            case '7_jours': {
                periodStart = new Date(reference);
                periodStart.setHours(0, 0, 0, 0);
                periodStart.setDate(periodStart.getDate() - 6);
                periodEnd = new Date(reference);
                periodEnd.setHours(0, 0, 0, 0);
                periodEnd.setDate(periodEnd.getDate() + 1);
                break;
            }
            case '30_jours': {
                periodStart = new Date(reference);
                periodStart.setHours(0, 0, 0, 0);
                periodStart.setDate(periodStart.getDate() - 29);
                periodEnd = new Date(reference);
                periodEnd.setHours(0, 0, 0, 0);
                periodEnd.setDate(periodEnd.getDate() + 1);
                break;
            }
            case 'semaine_passee': {
                const currentDay = reference.getDay();
                const diffToMonday = (currentDay === 0 ? -6 : 1) - currentDay;
                const thisWeekStart = new Date(reference);
                thisWeekStart.setDate(reference.getDate() + diffToMonday);
                thisWeekStart.setHours(0, 0, 0, 0);
                periodStart = new Date(thisWeekStart);
                periodStart.setDate(thisWeekStart.getDate() - 7);
                periodEnd = new Date(periodStart);
                periodEnd.setDate(periodStart.getDate() + 7);
                break;
            }
            case 'mois': {
                periodStart = new Date(reference.getFullYear(), reference.getMonth(), 1);
                periodEnd = new Date(reference.getFullYear(), reference.getMonth() + 1, 1);
                break;
            }
            case 'trimestre': {
                const currentQuarter = Math.floor(reference.getMonth() / 3);
                const startMonth = currentQuarter * 3;
                periodStart = new Date(reference.getFullYear(), startMonth, 1);
                periodEnd = new Date(reference.getFullYear(), startMonth + 3, 1);
                break;
            }
            case 'semestre': {
                const currentSemester = Math.floor(reference.getMonth() / 6);
                const startMonth = currentSemester * 6;
                periodStart = new Date(reference.getFullYear(), startMonth, 1);
                periodEnd = new Date(reference.getFullYear(), startMonth + 6, 1);
                break;
            }
            case 'annee': {
                periodStart = new Date(reference.getFullYear(), 0, 1);
                periodEnd = new Date(reference.getFullYear() + 1, 0, 1);
                break;
            }
            case 'semaine':
            default: {
                capWeekDisplayToJ1 = true;
                const currentDay = reference.getDay();
                const diffToMonday = (currentDay === 0 ? -6 : 1) - currentDay;
                periodStart = new Date(reference);
                periodStart.setDate(reference.getDate() + diffToMonday);
                periodStart.setHours(0, 0, 0, 0);
                periodEnd = new Date(periodStart);
                periodEnd.setDate(periodStart.getDate() + 7);
                break;
            }
        }

        const refExclusiveEnd = new Date(reference);
        refExclusiveEnd.setHours(0, 0, 0, 0);
        refExclusiveEnd.setDate(refExclusiveEnd.getDate() + 1);
        let maxExclusiveEnd: Date;
        if (capWeekDisplayToJ1) {
            maxExclusiveEnd = refExclusiveEnd;
        } else {
            const todayStart = new Date();
            todayStart.setHours(0, 0, 0, 0);
            maxExclusiveEnd = new Date(todayStart);
            maxExclusiveEnd.setDate(todayStart.getDate() + 1);
        }
        if (periodEnd.getTime() > maxExclusiveEnd.getTime()) {
            periodEnd = maxExclusiveEnd;
        }
        if (periodStart.getTime() >= periodEnd.getTime()) {
            periodEnd = new Date(periodStart);
            periodEnd.setDate(periodStart.getDate() + 1);
        }

        this.weekDays = [];
        const totalDays = Math.round(
            (periodEnd.getTime() - periodStart.getTime()) / (24 * 60 * 60 * 1000)
        );
        const dayNames = this.shortDayNames();
        for (let i = 0; i < totalDays; i++) {
            const d = new Date(periodStart);
            d.setDate(periodStart.getDate() + i);
            const y = d.getFullYear();
            const m = (d.getMonth() + 1).toString().padStart(2, '0');
            const day = d.getDate().toString().padStart(2, '0');
            const dateStr = `${y}-${m}-${day}`;
            const dow = d.getDay();
            const label = `${dayNames[(dow + 6) % 7]} ${day}/${m}`;
            this.weekDays.push({ label, date: dateStr });
        }
        this.updateVisibleDaysWindow();

        const periodStartStr = this.formatLocalYmd(periodStart);
        const periodEndExclusiveStr = this.formatLocalYmd(periodEnd);
        let eligibilityStartStr = periodStartStr;
        if (
            this.summaryPeriod === 'semaine' ||
            this.summaryPeriod === 'jour' ||
            this.summaryPeriod === '7_jours' ||
            this.summaryPeriod === '30_jours'
        ) {
            const elig = new Date(periodStart);
            elig.setDate(periodStart.getDate() - 7);
            eligibilityStartStr = this.formatLocalYmd(elig);
        }

        const fetchEndInclusiveStr = this.addDaysToIsoDate(periodEndExclusiveStr, -1);

        return {
            periodStartStr,
            periodEndExclusiveStr,
            eligibilityStartStr,
            fetchStartStr: eligibilityStartStr,
            fetchEndInclusiveStr
        };
    }

    private processReconciliationSummaryData(
        data: Result8RecData[],
        ctx: {
            periodStartStr: string;
            periodEndExclusiveStr: string;
            eligibilityStartStr: string;
        }
    ): void {
        const targetEnv = this.reconciliationSummaryEnv || 'ALL';
        const targetCountry = this.reconciliationSummaryCountry || '';
        const targetCountryDisplay = targetCountry ? countryDisplayLabel(targetCountry) : '';
        const selectedService = (this.reconciliationSummaryService || '').trim();
        const { periodStartStr, periodEndExclusiveStr, eligibilityStartStr } = ctx;

        const servicesSet = new Set<string>();
        data.forEach(item => {
            if (!item.service) return;
            if (!this.matchesRecoSummaryEnv(item.env, targetEnv)) return;
            if (targetCountryDisplay && !countriesMatch(item.country, targetCountryDisplay)) return;
            servicesSet.add(item.service);
        });

        const lastOkDateByKey: Record<string, string | null> = {};
        data.forEach(item => {
            if (!item.service) return;
            if (!this.matchesRecoSummaryEnv(item.env, targetEnv)) return;
            if (targetCountryDisplay && !countriesMatch(item.country, targetCountryDisplay)) return;
            const c = countryDisplayLabel(item.country);
            if (!c) return;
            const dateOnly = this.extractResult8DateOnly(item.date);
            if (!dateOnly) return;
            const isOk = (item.status || '').trim().toUpperCase() === 'OK';
            if (!isOk) return;
            const key = `${item.service}||${c}`;
            const prev = lastOkDateByKey[key];
            if (!prev || dateOnly > prev) {
                lastOkDateByKey[key] = dateOnly;
            }
        });

        const allServicesForFilter = Array.from(servicesSet).sort();
        this.reconciliationSummaryServices = allServicesForFilter;
        if (selectedService && !this.reconciliationSummaryServices.includes(selectedService)) {
            this.reconciliationSummaryService = '';
        }

        type RowKey = { service: string; country: string; label: string };
        const rowKeys: RowKey[] = [];
        if (targetCountryDisplay) {
            const services = this.reconciliationSummaryService
                ? allServicesForFilter.filter(s => s === this.reconciliationSummaryService)
                : allServicesForFilter;
            services.forEach(s => rowKeys.push({ service: s, country: targetCountryDisplay, label: s }));
        } else {
            const byServiceCountry = new Map<string, Set<string>>();
            data.forEach(item => {
                if (!item.service) return;
                if (!this.matchesRecoSummaryEnv(item.env, targetEnv)) return;
                const c = countryDisplayLabel(item.country);
                if (!c) return;
                if (this.reconciliationSummaryService && item.service !== this.reconciliationSummaryService) return;
                if (!byServiceCountry.has(item.service)) byServiceCountry.set(item.service, new Set<string>());
                byServiceCountry.get(item.service)!.add(c);
            });
            Array.from(byServiceCountry.entries())
                .sort((a, b) => a[0].localeCompare(b[0]))
                .forEach(([service, countries]) => {
                    Array.from(countries).sort().forEach(c => {
                        rowKeys.push({ service, country: c, label: `${service} (${c})` });
                    });
                });
        }

        const hasActivityInPeriodByKey: Record<string, boolean> = {};
        data.forEach(item => {
            if (!item.service) return;
            if (!this.matchesRecoSummaryEnv(item.env, targetEnv)) return;
            const c = countryDisplayLabel(item.country);
            if (targetCountryDisplay && !countriesMatch(c, targetCountryDisplay)) return;
            const dateOnly = this.extractResult8DateOnly(item.date);
            if (!dateOnly) return;
            if (dateOnly < periodStartStr || dateOnly >= periodEndExclusiveStr) return;
            const key = `${item.service}||${c}`;
            hasActivityInPeriodByKey[key] = true;
        });
        const effectiveRowKeys = rowKeys.filter(k => {
            const lastRecoStr = lastOkDateByKey[`${k.service}||${k.country}`] || null;
            const key = `${k.service}||${k.country}`;
            const hasActivity = !!hasActivityInPeriodByKey[key];
            return hasActivity || (!!lastRecoStr && lastRecoStr >= eligibilityStartStr);
        });

        const rows: {
            service: string;
            label?: string;
            country?: string;
            days: {
                date: string;
                status: 'RECONCILIE' | 'NON_RECONCILIE' | 'EN_COURS' | 'NON_RECONCILIE';
                ticketId: string;
                env: string;
            }[];
        }[] = [];

        effectiveRowKeys.forEach(({ service: serviceName, country: rowCountry, label }) => {
            const dayStatuses = this.weekDays.map(dayInfo => {
                const matchingForDay = data.filter(item => {
                    if (!item.service || item.service !== serviceName) return false;
                    if (!this.matchesRecoSummaryEnv(item.env, targetEnv)) return false;
                    if (!item.date) return false;
                    if (rowCountry && !countriesMatch(item.country, rowCountry)) return false;
                    const dateOnly = this.extractResult8DateOnly(item.date);
                    return dateOnly === dayInfo.date;
                });

                const cellEnv = matchingForDay.length > 0
                    ? this.getResult8RecItemEnv(matchingForDay[0])
                    : (targetEnv === 'ALL' ? '' : targetEnv);
                const cell = this.buildRecoDayCellStatus(matchingForDay, dayInfo.date, cellEnv);
                return this.enrichDayCell(cell, serviceName, rowCountry, cellEnv);
            });

            rows.push({
                service: serviceName,
                label,
                country: rowCountry,
                days: dayStatuses
            });
        });

        this.reconciliationSummaryRows = rows;
        this.reapplyBlockingCommentsToRows();
        this.reconciliationPageIndex = 0;
        this.computeReconciliationStats();
    }

    /**
     * Charge le résumé "État des réconciliations" à partir de result8rec
     * pour la date + environnement sélectionnés.
     */
    loadReconciliationSummary(): void {
        this.reconciliationSummaryError = null;
        this.reconciliationSummaryLoading = true;
        this.reconciliationSummaryLoadingMore = false;
        this.topUsersLoading = true;
        this.reconciliationSummaryRows = [];
        this.reconciliationPageIndex = 0;
        const token = ++this.recoSummaryLoadToken;

        const ctx = this.buildReconciliationSummaryPeriodContext();

        this.dashboardReconciliationService.loadResult8RecProgressive(
            ctx.fetchStartStr,
            ctx.fetchEndInclusiveStr,
            (data, isFirst, isComplete) => {
                if (token !== this.recoSummaryLoadToken) {
                    return;
                }
                try {
                    this.processReconciliationSummaryData(data, ctx);
                    if (isFirst) {
                        this.reconciliationSummaryLoading = false;
                    }
                    this.reconciliationSummaryLoadingMore = !isComplete;
                    if (isComplete) {
                        this.lastRefreshAt = new Date();
                        this.loadJ1BlockingCommentsForPeriod(ctx);
                        this.loadPreviousPeriodStats(token);
                        this.loadTopUsers(ctx);
                    }
                } catch (e: unknown) {
                    console.error('Erreur lors du calcul du résumé des réconciliations:', e);
                    this.reconciliationSummaryError = this.t('ETA.error.loadSummary');
                    this.reconciliationSummaryLoading = false;
                    this.reconciliationSummaryLoadingMore = false;
                    this.topUsersLoading = false;
                }
            },
            this.moduleContext,
            () => token !== this.recoSummaryLoadToken
        ).catch(err => {
            if (token !== this.recoSummaryLoadToken) {
                return;
            }
            console.error('Erreur lors du chargement des données result8rec pour le résumé:', err);
                    this.reconciliationSummaryError = this.t('ETA.error.loadSummary');
            this.reconciliationSummaryLoading = false;
            this.reconciliationSummaryLoadingMore = false;
            this.topUsersLoading = false;
        });
    }

    /** Palette de couleurs affectée aux catégories par leur ordre d'affichage. */
    private readonly topUserPalette: string[] = [
        '#2563EB', '#7C3AED', '#0F766E', '#B7791F', '#C0392B',
        '#0EA5E9', '#DB2777', '#65A30D', '#7C2D12', '#4F46E5',
        '#0891B2', '#9333EA'
    ];

    private accentForIndex(index: number): string {
        return this.topUserPalette[index % this.topUserPalette.length];
    }

    /**
     * Charge le classement « Top 3 des utilisateurs » depuis les actions d'audit
     * result8rec, sur la période et le périmètre (pays / service / ENV) affichés.
     */
    private loadTopUsers(ctx: { periodStartStr: string; periodEndExclusiveStr: string }): void {
        const token = ++this.topUsersLoadToken;
        this.topUsersLoading = true;

        // Réglages (Configuration > Top utilisateurs) : chargés avant de calculer.
        this.topUsersConfigService.load().pipe(take(1)).subscribe(cfg => {
            this.topUsersConfig = cfg;
            if (token !== this.topUsersLoadToken) {
                return;
            }
            if (!cfg.enabled) {
                this.topUsersCategories = [];
                this.topUsersLoading = false;
                return;
            }

            const start = ctx.periodStartStr;
            const endInclusive = this.topUsersEndInclusive(ctx.periodEndExclusiveStr);
            const opts = {
                country: this.reconciliationSummaryCountry || undefined,
                service: this.reconciliationSummaryService || undefined,
                env: this.reconciliationSummaryEnv && this.reconciliationSummaryEnv !== 'ALL'
                    ? this.reconciliationSummaryEnv
                    : undefined
            };
            const prev = this.previousPeriodRange(start, endInclusive);

            forkJoin({
                current: this.dashboardReconciliationService
                    .getAuditActionsSummary(start, endInclusive, opts, this.moduleContext)
                    .pipe(catchError(() => of([] as RecoAuditActionStat[]))),
                previous: this.dashboardReconciliationService
                    .getAuditActionsSummary(prev.start, prev.end, opts, this.moduleContext)
                    .pipe(catchError(() => of([] as RecoAuditActionStat[])))
            })
                .pipe(take(1))
                .subscribe(({ current, previous }) => {
                    if (token !== this.topUsersLoadToken) {
                        return;
                    }
                    const categories = this.buildTopUserCategories(current || [], previous || []);
                    this.loadTopUserPhotos(categories, token);
                });
        });
    }

    /**
     * Fin inclusive du classement : les lignes J-1 sont traitées le jour J, donc une
     * période qui va jusqu'à J-1 est prolongée jusqu'à aujourd'hui inclus. Une période
     * entièrement passée (ex. semaine passée) garde sa borne.
     */
    private topUsersEndInclusive(periodEndExclusiveIso: string): string {
        const periodEndInclusive = this.addDaysToIsoDate(periodEndExclusiveIso, -1);
        const todayIso = this.formatLocalYmd(new Date());
        const reachesReferenceDay = periodEndExclusiveIso >= todayIso;
        return reachesReferenceDay && periodEndInclusive < todayIso ? todayIso : periodEndInclusive;
    }

    /** Période précédente de même longueur (bornes inclusives YYYY-MM-DD). */
    private previousPeriodRange(startIso: string, endInclusiveIso: string): { start: string; end: string } {
        const [sy, sm, sd] = startIso.split('-').map(Number);
        const [ey, em, ed] = endInclusiveIso.split('-').map(Number);
        if ([sy, sm, sd, ey, em, ed].some(n => isNaN(n))) {
            return { start: startIso, end: endInclusiveIso };
        }
        const startDate = new Date(sy, sm - 1, sd);
        const endDate = new Date(ey, em - 1, ed);
        if (endDate < startDate) {
            return { start: startIso, end: endInclusiveIso };
        }
        const lengthDays = Math.round((endDate.getTime() - startDate.getTime()) / (24 * 60 * 60 * 1000)) + 1;
        const prevEnd = new Date(startDate);
        prevEnd.setDate(startDate.getDate() - 1);
        const prevStart = new Date(prevEnd);
        prevStart.setDate(prevEnd.getDate() - (lengthDays - 1));
        return { start: this.formatLocalYmd(prevStart), end: this.formatLocalYmd(prevEnd) };
    }

    /** Construit les catégories configurées (Configuration > Top utilisateurs) et leur top N. */
    private buildTopUserCategories(current: RecoAuditActionStat[], previous: RecoAuditActionStat[]): TopUserCategory[] {
        const cfg = this.topUsersConfig;
        const limit = Math.max(1, Number(cfg.topN) || 1);
        const categories: TopUsersCategoryConfig[] = (cfg.categories || []).filter(c => c?.enabled);

        const counts = this.aggregateTopUserCounts(current, categories);
        const prevCounts = this.aggregateTopUserCounts(previous, categories);

        return categories.map((def, index) => {
            const perUser = counts[def.id] || new Map<string, number>();
            const prevPerUser = prevCounts[def.id] || new Map<string, number>();
            const ranked = Array.from(perUser.entries())
                .map(([username, count]) => ({ username, count }))
                .sort((a, b) => b.count - a.count || a.username.localeCompare(b.username, 'fr'));
            const max = ranked.length ? ranked[0].count : 0;
            const users: TopUserEntry[] = ranked.slice(0, limit).map(entry => ({
                username: entry.username,
                displayName: this.formatUsernameDisplay(entry.username),
                initials: this.usernameInitials(entry.username),
                count: entry.count,
                delta: entry.count - (prevPerUser.get(entry.username) || 0),
                barPct: max > 0 ? Math.round((entry.count / max) * 100) : 0,
                photo: null
            }));
            const total = Array.from(perUser.values()).reduce((sum, v) => sum + v, 0);
            const builtin = BUILTIN_CATEGORY_KEYS[def.id];
            return {
                key: def.id,
                titleKey: builtin ? builtin.titleKey : '',
                actionLabelKey: builtin ? builtin.actionLabelKey : '',
                customTitle: def.title ?? (builtin ? null : def.id),
                customActionLabel: def.actionLabel ?? null,
                accent: this.accentForIndex(index),
                total,
                users
            };
        });
    }

    /** Regroupe les actions brutes par catégorie configurée puis par utilisateur. */
    private aggregateTopUserCounts(
        stats: RecoAuditActionStat[],
        categories: TopUsersCategoryConfig[]
    ): Record<string, Map<string, number>> {
        const result: Record<string, Map<string, number>> = {};
        for (const category of categories) {
            result[category.id] = new Map<string, number>();
        }
        for (const stat of stats || []) {
            const username = (stat?.username || '').trim();
            const count = Number(stat?.count) || 0;
            if (!username || count <= 0) {
                continue;
            }
            // Critères : (type d'événement + niveau de traitement), combinés en ET.
            const action = this.normalizeAuditToken(stat.actionType);
            const kind = resolveTraitementKind(stat.traitementSnapshot);
            for (const category of categories) {
                const events = category.events || [];
                const levels = category.levels || [];
                const eventMatch = events.length === 0 || events.includes(action);
                const levelMatch = levels.length === 0
                    || (kind !== 'none' && (levels as readonly string[]).includes(kind));
                if (!eventMatch || !levelMatch) {
                    continue;
                }
                const map = result[category.id];
                map.set(username, (map.get(username) || 0) + count);
            }
        }
        return result;
    }

    /** Compare des libellés d'action sans tenir compte des accents / de la casse. */
    private normalizeAuditToken(value?: string | null): string {
        return (value || '')
            .trim()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toUpperCase();
    }

    /** Nom lisible depuis un username technique (ex. yamar.ndao → Yamar Nd...). */
    private formatUsernameDisplay(username: string): string {
        const parts = (username || '').trim().split(/[._\-\s]+/).filter(Boolean);
        if (!parts.length) {
            return username || '';
        }
        return parts
            .map(p => p.charAt(0).toUpperCase() + p.slice(1))
            .join(' ');
    }

    private usernameInitials(username: string): string {
        const parts = (username || '').trim().split(/[._\-\s]+/).filter(Boolean);
        if (!parts.length) {
            return (username || '?').charAt(0).toUpperCase();
        }
        return parts.slice(0, 2).map(p => p.charAt(0).toUpperCase()).join('');
    }

    /** Récupère les photos de profil des utilisateurs classés (sinon initiales). */
    private loadTopUserPhotos(categories: TopUserCategory[], token: number): void {
        const usernames = Array.from(new Set(
            categories.flatMap(cat => cat.users.map(u => u.username)).filter(Boolean)
        ));
        if (!usernames.length) {
            this.topUsersCategories = categories;
            this.topUsersLoading = false;
            return;
        }
        this.userService
            .getUserPhotos(usernames)
            .pipe(take(1))
            .subscribe({
                next: (photos) => {
                    if (token !== this.topUsersLoadToken) {
                        return;
                    }
                    this.topUsersCategories = categories.map(cat => ({
                        ...cat,
                        users: cat.users.map(u => ({ ...u, photo: photos?.[u.username] ?? null }))
                    }));
                    this.topUsersLoading = false;
                },
                error: () => {
                    if (token !== this.topUsersLoadToken) {
                        return;
                    }
                    // Photos facultatives : on conserve les initiales.
                    this.topUsersCategories = categories;
                    this.topUsersLoading = false;
                }
            });
    }

    /** Masque la photo si le data URL est invalide (retombe sur les initiales). */
    onTopUserPhotoError(user: TopUserEntry): void {
        user.photo = null;
    }

    /** Retourne le lundi de la semaine courante au format YYYY-MM-DD
     *  en utilisant la référence métier J-1 (on ne bascule pas sur la
     *  nouvelle semaine tant qu'on n'est pas mardi).
     */
    private getCurrentWeekMonday(): string {
        const today = new Date();
        // Référence = J-1 pour rester sur la semaine précédente le lundi réel
        today.setDate(today.getDate() - 1);
        const currentDay = today.getDay();
        const diffToMonday = (currentDay === 0 ? -6 : 1) - currentDay;
        const monday = new Date(today);
        monday.setDate(today.getDate() + diffToMonday);
        const y = monday.getFullYear();
        const m = (monday.getMonth() + 1).toString().padStart(2, '0');
        const d = monday.getDate().toString().padStart(2, '0');
        return `${y}-${m}-${d}`;
    }

    /** Retourne le lundi de la semaine contenant la date donnée (YYYY-MM-DD). */
    private getMondayOfWeek(dateStr: string): string {
        const [y, mo, day] = dateStr.split('-').map(Number);
        const date = new Date(y, mo - 1, day);
        const dow = date.getDay();
        const diffToMonday = (dow === 0 ? -6 : 1) - dow;
        date.setDate(date.getDate() + diffToMonday);
        const yy = date.getFullYear();
        const mm = (date.getMonth() + 1).toString().padStart(2, '0');
        const dd = date.getDate().toString().padStart(2, '0');
        return `${yy}-${mm}-${dd}`;
    }

    /** Limite de jours pour les popups (performance / lisibilité du tableau). */
    private readonly popupDateRangeMaxDays = 120;

    private addDaysToIsoDate(isoDate: string, deltaDays: number): string {
        const [y, mo, d] = isoDate.split('-').map(Number);
        if (isNaN(y) || isNaN(mo) || isNaN(d)) {
            return isoDate;
        }
        const dt = new Date(y, mo - 1, d);
        dt.setDate(dt.getDate() + deltaDays);
        const yy = dt.getFullYear();
        const mm = (dt.getMonth() + 1).toString().padStart(2, '0');
        const dd = dt.getDate().toString().padStart(2, '0');
        return `${yy}-${mm}-${dd}`;
    }

    /** Jours calendaires entre deux dates ISO (inclus), avec libellés courts. */
    private buildCalendarDaysInclusive(startIso: string, endIso: string): { label: string; date: string }[] {
        const dayNames = this.shortDayNames();
        const [sy, smo, sd] = startIso.split('-').map(Number);
        const [ey, emo, ed] = endIso.split('-').map(Number);
        if ([sy, smo, sd, ey, emo, ed].some(n => isNaN(n))) {
            return [];
        }
        const start = new Date(sy, smo - 1, sd);
        const end = new Date(ey, emo - 1, ed);
        if (start > end) {
            return [];
        }
        const out: { label: string; date: string }[] = [];
        for (const cur = new Date(start); cur <= end; cur.setDate(cur.getDate() + 1)) {
            const yy = cur.getFullYear();
            const mm = (cur.getMonth() + 1).toString().padStart(2, '0');
            const dd = cur.getDate().toString().padStart(2, '0');
            const dateStr = `${yy}-${mm}-${dd}`;
            out.push({ label: `${dayNames[cur.getDay()]} ${dd}/${mm}`, date: dateStr });
        }
        return out;
    }

    private validatePopupPeriod(
        startIso: string,
        endIso: string
    ): { ok: true; start: string; end: string } | { ok: false; message: string } {
        const s = (startIso || '').trim();
        const e = (endIso || '').trim();
        if (!s || !e) {
            return { ok: false, message: 'Indiquez une date de début et une date de fin.' };
        }
        let lo = s;
        let hi = e;
        if (lo > hi) {
            lo = e;
            hi = s;
        }
        const days = this.buildCalendarDaysInclusive(lo, hi);
        if (!days.length) {
            return { ok: false, message: 'Période invalide.' };
        }
        if (days.length > this.popupDateRangeMaxDays) {
            return {
                ok: false,
                message: `L'intervalle ne peut pas dépasser ${this.popupDateRangeMaxDays} jours.`
            };
        }
        return { ok: true, start: lo, end: hi };
    }

    openRecoViewModal(): void {
        this.recoViewWeekStart = this.getCurrentWeekMonday();
        this.recoViewPeriodStart = this.recoViewWeekStart;
        this.recoViewPeriodEnd = this.addDaysToIsoDate(this.recoViewWeekStart, 6);
        // Initialiser les filtres du popup depuis la vue principale
        this.recoViewCountry = this.reconciliationSummaryCountry || '';
        const rs = (this.reconciliationSummaryService || '').trim();
        this.recoViewSelectedServices = rs ? [rs] : [];
        this.recoViewEnv = this.reconciliationSummaryEnv || 'BET';
        this.recoViewEnvSelectOptions = ['ALL', ...RECONCILIATION_ENV_OPTIONS];
        this.recoViewServiceOptions = [];
        this.recoViewSelectedDay = '';
        this.recoViewModalOpen = true;
        this.recoViewError = null;
        this.loadReconciliationSummaryForView();
    }

    /** Libellé option ENV (popup / cohérence avec le bloc principal). */
    formatRecoViewEnvOptionLabel(env: string): string {
        if (env === 'ALL') {
            return 'Tous les ENV';
        }
        if (env === 'TOTAL') {
            return 'T-E';
        }
        return normalizeReconciliationReportEnv(env);
    }

    closeRecoViewModal(): void {
        this.recoViewModalOpen = false;
    }

    async exportRecoViewToPdf(): Promise<void> {
        if (!this.recoViewExportContentRef?.nativeElement) {
            return;
        }
        try {
            const element = this.recoViewExportContentRef.nativeElement;
            const originalOverflow = element.style.overflowY;
            const originalMaxHeight = element.style.maxHeight;
            element.style.overflowY = 'visible';
            element.style.maxHeight = 'none';

            const tableWrapper = element.querySelector('.reco-view-table-wrapper') as HTMLElement | null;
            let twOverflow: string | null = null;
            let twMaxHeight: string | null = null;
            if (tableWrapper) {
                twOverflow = tableWrapper.style.overflow;
                twMaxHeight = tableWrapper.style.maxHeight;
                tableWrapper.style.overflow = 'visible';
                tableWrapper.style.maxHeight = 'none';
            }

            const canvas = await html2canvas(element, {
                scale: 2,
                useCORS: true,
                logging: false,
                backgroundColor: '#ffffff'
            });

            element.style.overflowY = originalOverflow;
            element.style.maxHeight = originalMaxHeight;
            if (tableWrapper) {
                tableWrapper.style.overflow = twOverflow ?? '';
                tableWrapper.style.maxHeight = twMaxHeight ?? '';
            }

            const imgWidth = canvas.width;
            const imgHeight = canvas.height;
            const imgData = canvas.toDataURL('image/png');

            // Créer un PDF dont la taille correspond presque exactement au contenu
            const pdf = new jsPDF('l', 'px', [imgWidth, imgHeight]);
            const pdfW = pdf.internal.pageSize.getWidth();
            const pdfH = pdf.internal.pageSize.getHeight();

            pdf.addImage(imgData, 'PNG', 0, 0, pdfW, pdfH);

            const p0 = (this.recoViewPeriodStart || this.recoViewWeekStart || '').replace(/-/g, '');
            const p1 = (this.recoViewPeriodEnd || '').replace(/-/g, '');
            const fileName = `Etat-reconciliations-${p0}${p1 ? '-' + p1 : ''}.pdf`;
            pdf.save(fileName);
        } catch (e) {
            console.error('Erreur export PDF vue semaine:', e);
        }
    }

    async exportTransactStatsToPdf(): Promise<void> {
        if (!this.transactStatsExportContentRef?.nativeElement) {
            return;
        }
        try {
            const element = this.transactStatsExportContentRef.nativeElement;
            const originalOverflow = element.style.overflowY;
            const originalMaxHeight = element.style.maxHeight;
            element.style.overflowY = 'visible';
            element.style.maxHeight = 'none';

            const canvas = await html2canvas(element, {
                scale: 2,
                useCORS: true,
                logging: false,
                backgroundColor: '#ffffff'
            });

            element.style.overflowY = originalOverflow;
            element.style.maxHeight = originalMaxHeight;

            const imgWidth = canvas.width;
            const imgHeight = canvas.height;
            const imgData = canvas.toDataURL('image/png');
            const pdf = new jsPDF('l', 'px', [imgWidth, imgHeight]);
            const pdfW = pdf.internal.pageSize.getWidth();
            const pdfH = pdf.internal.pageSize.getHeight();
            pdf.addImage(imgData, 'PNG', 0, 0, pdfW, pdfH);

            const t0 = (this.transactStatsPeriodStart || this.transactStatsWeekStart || '').replace(/-/g, '');
            const t1 = (this.transactStatsPeriodEnd || '').replace(/-/g, '');
            const fileName = `Statistiques-reconciliation-${t0}${t1 ? '-' + t1 : ''}.pdf`;
            pdf.save(fileName);
        } catch (e) {
            console.error('Erreur export PDF statistiques réconciliation:', e);
        }
    }

    /** Changement du filtre « Jour » uniquement (ne réinitialise pas le jour choisi). */
    onRecoViewDayChange(): void {
        this.loadReconciliationSummaryForView();
    }

    onRecoViewDateChange(dateStr: string): void {
        if (!dateStr) return;
        this.recoViewWeekStart = this.getMondayOfWeek(dateStr);
        this.recoViewPeriodStart = this.recoViewWeekStart;
        this.recoViewPeriodEnd = this.addDaysToIsoDate(this.recoViewWeekStart, 6);
        this.recoViewSelectedDay = '';
        this.loadReconciliationSummaryForView();
    }

    /** Ajustement manuel de l'intervalle (Du / Au). */
    onRecoViewPeriodRangeChange(): void {
        const s = (this.recoViewPeriodStart || '').trim();
        const e = (this.recoViewPeriodEnd || '').trim();
        if (!s || !e) {
            this.recoViewError = null;
            return;
        }
        const v = this.validatePopupPeriod(s, e);
        if (v.ok === false) {
            this.recoViewError = v.message;
            return;
        }
        this.recoViewPeriodStart = v.start;
        this.recoViewPeriodEnd = v.end;
        this.recoViewWeekStart = this.getMondayOfWeek(v.start);
        this.recoViewSelectedDay = '';
        this.recoViewError = null;
        this.loadReconciliationSummaryForView();
    }

    onRecoViewFiltersChange(): void {
        this.recoViewSelectedDay = '';
        this.loadReconciliationSummaryForView();
    }

    getRecoViewDisplayedDays(): { label: string; date: string }[] {
        if (!this.recoViewSelectedDay) return this.recoViewWeekDays;
        return this.recoViewWeekDays.filter(d => d.date === this.recoViewSelectedDay);
    }

    getRecoViewDisplayedRowDays(row: { days: { date: string }[] }): any[] {
        if (!this.recoViewSelectedDay) return row.days;
        return row.days.filter(d => d.date === this.recoViewSelectedDay);
    }

    loadReconciliationSummaryForView(): void {
        this.recoViewError = null;
        this.recoViewLoading = true;
        this.recoViewLoadingMore = false;
        this.recoViewRows = [];
        this.recoViewWeekDays = [];

        const periodCheck = this.validatePopupPeriod(this.recoViewPeriodStart, this.recoViewPeriodEnd);
        if (periodCheck.ok === false) {
            this.recoViewError = periodCheck.message;
            this.recoViewLoading = false;
            return;
        }
        this.recoViewPeriodStart = periodCheck.start;
        this.recoViewPeriodEnd = periodCheck.end;

        const token = ++this.recoViewLoadToken;

        this.dashboardReconciliationService.loadResult8RecProgressive(
            this.recoViewPeriodStart,
            this.recoViewPeriodEnd,
            (data, isFirst, isComplete) => {
                if (token !== this.recoViewLoadToken) {
                    return;
                }
                try {
                    this.processRecoViewData(data);
                    if (isFirst) {
                        this.recoViewLoading = false;
                    }
                    this.recoViewLoadingMore = !isComplete;
                } catch (e: unknown) {
                    console.error('Erreur vue semaine réconciliations:', e);
                    this.recoViewError = 'Erreur lors du chargement de la vue semaine.';
                    this.recoViewLoading = false;
                    this.recoViewLoadingMore = false;
                }
            },
            this.moduleContext,
            () => token !== this.recoViewLoadToken
        ).catch(err => {
            if (token !== this.recoViewLoadToken) {
                return;
            }
            console.error('Erreur chargement result8rec pour vue semaine:', err);
            this.recoViewError = 'Erreur lors du chargement des données.';
            this.recoViewLoading = false;
            this.recoViewLoadingMore = false;
        });
    }

    /** Construit le tableau de la modale « Vue semaine » à partir des lignes result8rec accumulées. */
    private processRecoViewData(data: Result8RecData[]): void {
        this.recoViewEnvSelectOptions = this.buildRecoViewEnvSelectOptions(data);
        if (!this.recoViewEnvSelectOptions.includes(this.recoViewEnv)) {
            this.recoViewEnv = 'ALL';
        }

        const targetEnv = (this.recoViewEnv || 'ALL').trim() || 'ALL';
        const targetCountry = (this.recoViewCountry || '').trim();
        const targetCountryDisplay = targetCountry ? countryDisplayLabel(targetCountry) : '';

        this.recoViewWeekDays = this.buildCalendarDaysInclusive(
            this.recoViewPeriodStart,
            this.recoViewPeriodEnd
        );
        const weekDates = new Set(this.recoViewWeekDays.map(w => w.date));
        const servicesSet = new Set<string>();
        data.forEach(item => {
            if (!item.service) return;
            if (!this.matchesReconciliationEnvStrict(this.getResult8RecItemEnv(item), targetEnv)) return;
            if (targetCountryDisplay && !countriesMatch(item.country, targetCountryDisplay)) return;
            const dateOnly = this.extractResult8DateOnly(item.date);
            if (!dateOnly || !weekDates.has(dateOnly)) return;
            if (this.recoViewSelectedDay && dateOnly !== this.recoViewSelectedDay) return;
            servicesSet.add(item.service);
        });
        const allServices = Array.from(servicesSet).sort();
        this.recoViewServiceOptions = allServices;
        const sel = (this.recoViewSelectedServices || [])
            .map(s => (s || '').trim())
            .filter(s => s.length > 0);
        this.recoViewSelectedServices = sel.filter(s => allServices.includes(s));
        const effectiveServices = this.recoViewSelectedServices.length
            ? allServices.filter(s => this.recoViewSelectedServices.includes(s))
            : allServices;

        const rows: {
            service: string;
            label?: string;
            country?: string;
            days: {
                date: string;
                status: 'RECONCILIE' | 'NON_RECONCILIE' | 'EN_COURS' | 'NON_RECONCILIE';
                ticketId: string;
                env: string;
            }[];
        }[] = [];

        type RowKey = { service: string; country: string; label: string };
        const rowKeys: RowKey[] = [];
        if (targetCountryDisplay) {
            effectiveServices.forEach(s => rowKeys.push({ service: s, country: targetCountryDisplay, label: s }));
        } else {
            const byServiceCountry = new Map<string, Set<string>>();
            data.forEach(item => {
                if (!item.service) return;
                if (!this.matchesReconciliationEnvStrict(this.getResult8RecItemEnv(item), targetEnv)) return;
                const dateOnly = this.extractResult8DateOnly(item.date);
                if (!dateOnly || !weekDates.has(dateOnly)) return;
                if (this.recoViewSelectedDay && dateOnly !== this.recoViewSelectedDay) return;
                const c = countryDisplayLabel(item.country);
                if (!c) return;
                if (this.recoViewSelectedServices.length && !this.recoViewSelectedServices.includes(item.service)) return;
                if (!byServiceCountry.has(item.service)) byServiceCountry.set(item.service, new Set<string>());
                byServiceCountry.get(item.service)!.add(c);
            });
            Array.from(byServiceCountry.entries())
                .sort((a, b) => a[0].localeCompare(b[0]))
                .forEach(([service, countries]) => {
                    Array.from(countries).sort().forEach(c => {
                        rowKeys.push({ service, country: c, label: `${service} (${c})` });
                    });
                });
        }

        rowKeys.forEach(({ service: serviceName, country: rowCountry, label }) => {
            const dayStatuses = this.recoViewWeekDays.map(dayInfo => {
                const matchingForDay = data.filter(item => {
                    if (!item.service || item.service !== serviceName) return false;
                    if (!this.matchesReconciliationEnvStrict(this.getResult8RecItemEnv(item), targetEnv)) return false;
                    if (!item.date) return false;
                    if (rowCountry && !countriesMatch(item.country, rowCountry)) return false;
                    const dateOnly = this.extractResult8DateOnly(item.date);
                    return dateOnly === dayInfo.date;
                });
                return this.buildRecoDayCellStatus(
                    matchingForDay,
                    dayInfo.date,
                    targetEnv === 'ALL'
                        ? (matchingForDay[0] ? this.getResult8RecItemEnv(matchingForDay[0]) : '')
                        : targetEnv
                );
            });
            rows.push({ service: serviceName, label, country: rowCountry, days: dayStatuses });
        });

        this.recoViewRows = rows;
        this.recoViewStats = this.computeReconciliationStatsFromRows(rows);
    }

    openTransactStatsModal(): void {
        this.transactStatsWeekStart = this.getCurrentWeekMonday();
        this.transactStatsPeriodStart = this.transactStatsWeekStart;
        this.transactStatsPeriodEnd = this.addDaysToIsoDate(this.transactStatsWeekStart, 6);
        this.transactStatsCountry = this.reconciliationSummaryCountry || '';
        const ts = (this.reconciliationSummaryService || '').trim();
        this.transactStatsSelectedServices = ts ? [ts] : [];
        this.transactStatsEnv = this.reconciliationSummaryEnv || 'BET';
        this.transactStatsEnvSelectOptions = ['ALL', ...RECONCILIATION_ENV_OPTIONS];
        this.transactStatsServiceOptions = [];
        this.transactStatsSelectedDay = '';
        this.transactStatsModalOpen = true;
        this.transactStatsError = null;
        this.loadTransactStats();
    }

    closeTransactStatsModal(): void {
        this.transactStatsModalOpen = false;
    }

    onTransactStatsDateChange(dateStr: string): void {
        if (!dateStr) {
            return;
        }
        this.transactStatsWeekStart = this.getMondayOfWeek(dateStr);
        this.transactStatsPeriodStart = this.transactStatsWeekStart;
        this.transactStatsPeriodEnd = this.addDaysToIsoDate(this.transactStatsWeekStart, 6);
        this.transactStatsSelectedDay = '';
        this.loadTransactStats();
    }

    onTransactStatsPeriodRangeChange(): void {
        const s = (this.transactStatsPeriodStart || '').trim();
        const e = (this.transactStatsPeriodEnd || '').trim();
        if (!s || !e) {
            this.transactStatsError = null;
            return;
        }
        const v = this.validatePopupPeriod(s, e);
        if (v.ok === false) {
            this.transactStatsError = v.message;
            return;
        }
        this.transactStatsPeriodStart = v.start;
        this.transactStatsPeriodEnd = v.end;
        this.transactStatsWeekStart = this.getMondayOfWeek(v.start);
        this.transactStatsSelectedDay = '';
        this.transactStatsError = null;
        this.loadTransactStats();
    }

    onTransactStatsFiltersChange(): void {
        this.transactStatsSelectedDay = '';
        this.loadTransactStats();
    }

    /** Sections du modal : détail par service si ≥ 2 choisis, puis ligne total (ou un seul bloc agrégé). */
    get transactStatsDisplayBlocks(): { title: string | null; stats: TransactStatsSnapshot }[] {
        if (this.transactStatsPerService.length >= 2) {
            return [
                ...this.transactStatsPerService.map(({ service, stats }) => ({ title: service, stats })),
                { title: 'Total (sélection)', stats: this.transactStats }
            ];
        }
        return [{ title: null, stats: this.transactStats }];
    }

    /**
     * Statistiques relevé : synthèse (rapport + écart traité), trx traité, trx remboursé.
     * Données : result8rec + releve_manual. Pourcentages : corr. / échec vs (synthèse + remboursés) ; trx traité vs synthèse.
     */
    loadTransactStats(): void {
        this.transactStatsError = null;
        this.transactStatsLoading = true;
        this.transactStatsLoadingMore = false;
        this.transactStatsPerService = [];

        const periodCheck = this.validatePopupPeriod(this.transactStatsPeriodStart, this.transactStatsPeriodEnd);
        if (periodCheck.ok === false) {
            this.transactStatsError = periodCheck.message;
            this.transactStatsLoading = false;
            this.transactStatsPerService = [];
            return;
        }
        this.transactStatsPeriodStart = periodCheck.start;
        this.transactStatsPeriodEnd = periodCheck.end;

        this.transactStatsWeekDays = this.buildCalendarDaysInclusive(
            this.transactStatsPeriodStart,
            this.transactStatsPeriodEnd
        );
        const weekDates = new Set(this.transactStatsWeekDays.map(w => w.date));
        const rangeStart = this.transactStatsPeriodStart;
        const rangeEnd = this.transactStatsPeriodEnd;
        const targetEnv = (this.transactStatsEnv || 'ALL').trim() || 'ALL';
        const targetCountry = (this.transactStatsCountry || '').trim();
        const servicesForApi = [
            ...new Set(
                (this.transactStatsSelectedServices || [])
                    .map(s => (s || '').trim())
                    .filter(s => s.length > 0)
            )
        ];

        const token = ++this.transactStatsLoadToken;
        let manualRows: ReleveManualRangeRow[] = [];
        let manualLoadFailed = false;

        this.dashboardService
            .getReleveManualTrxRange(
                rangeStart,
                rangeEnd,
                targetCountry || undefined,
                servicesForApi.length ? servicesForApi : undefined,
                targetEnv !== 'ALL' ? targetEnv : undefined
            )
            .pipe(take(1))
            .subscribe({
                next: (rows) => {
                    if (token !== this.transactStatsLoadToken) {
                        return;
                    }
                    manualRows = rows || [];
                    if (this.transactStatsLatestRecData.length) {
                        try {
                            this.processTransactStatsData(
                                this.transactStatsLatestRecData,
                                manualRows,
                                weekDates,
                                servicesForApi
                            );
                        } catch (e: unknown) {
                            console.error('Erreur statistiques réconciliation (relevé manuel):', e);
                            this.transactStatsError = 'Erreur lors du calcul des statistiques.';
                            this.transactStatsLoading = false;
                            this.transactStatsLoadingMore = false;
                            this.transactStatsPerService = [];
                        }
                    }
                },
                error: (err) => {
                    if (token !== this.transactStatsLoadToken) {
                        return;
                    }
                    manualLoadFailed = true;
                    console.error('Erreur chargement relevé manuel statistiques réconciliation:', err);
                    this.transactStatsError = 'Erreur lors du chargement des données (rapport ou relevé manuel).';
                    this.transactStatsLoading = false;
                    this.transactStatsLoadingMore = false;
                    this.transactStatsPerService = [];
                }
            });

        this.transactStatsLatestRecData = [];

        this.dashboardReconciliationService.loadResult8RecProgressive(
            rangeStart,
            rangeEnd,
            (data, isFirst, isComplete) => {
                if (token !== this.transactStatsLoadToken || manualLoadFailed) {
                    return;
                }
                try {
                    this.transactStatsLatestRecData = data;
                    this.processTransactStatsData(data, manualRows, weekDates, servicesForApi);
                    if (isFirst) {
                        this.transactStatsLoading = false;
                    }
                    this.transactStatsLoadingMore = !isComplete;
                } catch (e: unknown) {
                    console.error('Erreur statistiques réconciliation:', e);
                    this.transactStatsError = 'Erreur lors du calcul des statistiques.';
                    this.transactStatsLoading = false;
                    this.transactStatsLoadingMore = false;
                    this.transactStatsPerService = [];
                }
            },
            this.moduleContext,
            () => token !== this.transactStatsLoadToken
        ).catch(err => {
            if (token !== this.transactStatsLoadToken) {
                return;
            }
            console.error('Erreur chargement result8rec statistiques réconciliation:', err);
            this.transactStatsError = 'Erreur lors du chargement des données (rapport ou relevé manuel).';
            this.transactStatsLoading = false;
            this.transactStatsLoadingMore = false;
            this.transactStatsPerService = [];
        });
    }

    private transactStatsLatestRecData: Result8RecData[] = [];

    private processTransactStatsData(
        recData: Result8RecData[],
        manualRows: ReleveManualRangeRow[],
        weekDates: Set<string>,
        servicesForApi: string[]
    ): void {
        this.transactStatsEnvSelectOptions = this.buildRecoViewEnvSelectOptions(recData);
        if (!this.transactStatsEnvSelectOptions.includes(this.transactStatsEnv)) {
            this.transactStatsEnv = 'ALL';
        }

        const envEff = (this.transactStatsEnv || 'ALL').trim() || 'ALL';
        const countryEff = (this.transactStatsCountry || '').trim();

        const servicesSet = new Set<string>();
        recData.forEach(item => {
            if (!item.service) {
                return;
            }
            if (!this.matchesReconciliationEnvStrict(this.getResult8RecItemEnv(item), envEff)) {
                return;
            }
            if (countryEff && !countriesMatch(item.country, countryEff)) {
                return;
            }
            const dateOnly = this.extractResult8DateOnly(item.date);
            if (!dateOnly || !weekDates.has(dateOnly)) {
                return;
            }
            if (this.transactStatsSelectedDay && dateOnly !== this.transactStatsSelectedDay) {
                return;
            }
            servicesSet.add(item.service);
        });
        const allServices = Array.from(servicesSet).sort();
        this.transactStatsServiceOptions = allServices;
        this.transactStatsSelectedServices = servicesForApi.filter(s => allServices.includes(s));

        const sel = this.transactStatsSelectedServices;
        const dayEff = this.transactStatsSelectedDay;

        if (sel.length >= 2) {
            this.transactStatsPerService = sel.map(service => ({
                service,
                stats: this.computeTransactStatsSlice(
                    recData,
                    manualRows || [],
                    weekDates,
                    envEff,
                    countryEff,
                    dayEff,
                    [service]
                )
            }));
        } else {
            this.transactStatsPerService = [];
        }

        const filterForTotal = sel.length > 0 ? sel : null;
        this.transactStats = this.computeTransactStatsSlice(
            recData,
            manualRows || [],
            weekDates,
            envEff,
            countryEff,
            dayEff,
            filterForTotal
        );
    }

    /**
     * Agrège synthèse (rapport + manuel), dénoués et remboursés pour un sous-ensemble de services.
     * @param serviceFilter null = tous les services ; sinon uniquement les services listés.
     */
    private computeTransactStatsSlice(
        recData: Result8RecData[],
        manualRows: ReleveManualRangeRow[],
        weekDates: Set<string>,
        envEff: string,
        countryEff: string,
        selectedDay: string,
        serviceFilter: string[] | null
    ): TransactStatsSnapshot {
        const restrictByService = serviceFilter !== null && serviceFilter.length > 0;

        const manualMap = new Map<string, { mn: number; rn: number; mv: number; rv: number }>();
        (manualRows || []).forEach(row => {
            if (!row.date || !weekDates.has(row.date)) {
                return;
            }
            if (selectedDay && row.date !== selectedDay) {
                return;
            }
            if (restrictByService && !serviceFilter!.includes(row.service)) {
                return;
            }
            const k = this.releveStatCompositeKey(row.date, row.service, row.country, row.env);
            const cur = manualMap.get(k) || { mn: 0, rn: 0, mv: 0, rv: 0 };
            cur.mn += Number(row.manualNombre) || 0;
            cur.rn += Number(row.rembourseNombre) || 0;
            cur.mv += Number(row.manualVolume) || 0;
            cur.rv += Number(row.rembourseVolume) || 0;
            manualMap.set(k, cur);
        });

        const rapportMap = new Map<string, { tt: number; tv: number }>();
        recData.forEach(item => {
            if (!item.service) {
                return;
            }
            if (!this.matchesReconciliationEnvStrict(this.getResult8RecItemEnv(item), envEff)) {
                return;
            }
            if (countryEff && !countriesMatch(item.country, countryEff)) {
                return;
            }
            if (restrictByService && !serviceFilter!.includes(item.service)) {
                return;
            }
            const dateOnly = this.extractResult8DateOnly(item.date);
            if (!dateOnly || !weekDates.has(dateOnly)) {
                return;
            }
            if (selectedDay && dateOnly !== selectedDay) {
                return;
            }
            const k = this.releveStatCompositeKey(
                dateOnly,
                item.service,
                (item.country || '').trim(),
                this.getResult8RecItemEnv(item)
            );
            const cur = rapportMap.get(k) || { tt: 0, tv: 0 };
            cur.tt += Number(item.totalTransactions) || 0;
            cur.tv += Number(item.totalVolume) || 0;
            rapportMap.set(k, cur);
        });

        let correspondance = 0;
        let transactionDenoue = 0;
        let transactionEchec = 0;
        let correspondanceVolume = 0;
        let transactionDenoueVolume = 0;
        let transactionEchecVolume = 0;

        const manualRemain = new Map(manualMap);
        rapportMap.forEach((rapport, key) => {
            const man = manualRemain.get(key) || { mn: 0, rn: 0, mv: 0, rv: 0 };
            const mn = man.mn;
            const rn = man.rn;
            const mv = man.mv;
            const rv = man.rv;
            correspondance += rapport.tt + mn;
            transactionDenoue += mn;
            transactionEchec += rn;
            correspondanceVolume += rapport.tv + mv;
            transactionDenoueVolume += mv;
            transactionEchecVolume += rv;
            manualRemain.delete(key);
        });
        manualRemain.forEach(man => {
            correspondance += man.mn;
            transactionDenoue += man.mn;
            transactionEchec += man.rn;
            correspondanceVolume += man.mv;
            transactionDenoueVolume += man.mv;
            transactionEchecVolume += man.rv;
        });

        const totalMajeur = correspondance + transactionEchec;
        const pctMaj = (v: number) => (totalMajeur > 0 ? (v * 100) / totalMajeur : 0);
        const pctDenoueDansSynth =
            correspondance > 0 ? (transactionDenoue * 100) / correspondance : 0;

        const totalMajeurVol = correspondanceVolume + transactionEchecVolume;
        const pctMajVol = (v: number) => (totalMajeurVol > 0 ? (v * 100) / totalMajeurVol : 0);
        const pctDenoueVol =
            correspondanceVolume > 0 ? (transactionDenoueVolume * 100) / correspondanceVolume : 0;

        return {
            correspondance,
            transactionDenoue,
            transactionEchec,
            totalReference: totalMajeur,
            pctCorrespondance: pctMaj(correspondance),
            pctDenoue: pctDenoueDansSynth,
            pctEchec: pctMaj(transactionEchec),
            correspondanceVolume,
            transactionDenoueVolume,
            transactionEchecVolume,
            totalReferenceVolume: totalMajeurVol,
            pctCorrespondanceVolume: pctMajVol(correspondanceVolume),
            pctDenoueVolume: pctDenoueVol,
            pctEchecVolume: pctMajVol(transactionEchecVolume)
        };
    }

    /** Clé alignée relevé : date|service|country|env normalisé (T-E / BET / …). */
    private releveStatCompositeKey(
        dateStr: string,
        service: string,
        country: string,
        envRaw: string | null | undefined
    ): string {
        const env = normalizeReconciliationReportEnv(envRaw ?? '');
        return `${dateStr}|${service}|${country}|${env}`;
    }

    private computeReconciliationStatsFromRows(
        rows: { service: string; days: RecoDayCell[] }[]
    ): {
        total: number;
        reconcilie: number;
        enCours: number;
        enCoursSupport: number;
        enCoursCdo: number;
        enCoursGroup: number;
        nonReco: number;
        tauxReconcilie: number;
    } {
        let total = 0;
        let reconcilie = 0;
        let enCours = 0;
        let enCoursSupport = 0;
        let enCoursCdo = 0;
        let enCoursGroup = 0;
        let nonReco = 0;
        rows.forEach(row => {
            row.days.forEach(day => {
                total++;
                if (day.status === 'RECONCILIE') {
                    reconcilie++;
                } else if (day.status === 'EN_COURS') {
                    enCours++;
                    switch (this.countEnCoursKind(day)) {
                        case 'group':
                            enCoursGroup++;
                            break;
                        case 'cdo':
                            enCoursCdo++;
                            break;
                        default:
                            enCoursSupport++;
                            break;
                    }
                } else {
                    nonReco++;
                }
            });
        });
        const taux = this.computeWeeklyReconciliationRate(total, reconcilie, enCours);
        return {
            total,
            reconcilie,
            enCours,
            enCoursSupport,
            enCoursCdo,
            enCoursGroup,
            nonReco,
            tauxReconcilie: taux
        };
    }

    setReconciliationStatusFilter(status: Exclude<RecoStatusFilter, 'ALL'>): void {
        this.reconciliationStatusFilter =
            this.reconciliationStatusFilter === status ? 'ALL' : status;
    }

    getFilteredReconciliationSummaryRows() {
        let rows = this.reconciliationSummaryRows || [];
        if (this.reconciliationStatusFilter !== 'ALL') {
            const filter = this.reconciliationStatusFilter;
            rows = rows.filter(row =>
                row.days.some(day => this.dayMatchesStatusFilter(day, filter))
            );
        }
        const q = this.serviceSearchQuery.trim().toLowerCase();
        if (q) {
            rows = rows.filter(row => {
                const label = (row.label || row.service || '').toLowerCase();
                return label.includes(q);
            });
        }
        if (this.weekendFocusActive) {
            rows = rows.filter(row =>
                row.days.some(day => this.isWeekendDate(day.date) && day.status === 'NON_RECONCILIE')
            );
        }
        if (this.countryTabFilter !== 'ALL') {
            const tab = this.countryTabFilter.toUpperCase();
            rows = rows.filter(row => this.resolveRowCountry(row).toUpperCase() === tab);
        }
        if (this.anomaliesOnlyFilter) {
            rows = rows.filter(row => this.countRowAnomalyDays(row) > 0);
        }
        return [...rows].sort((a, b) => {
            const av = (a.label || a.service || '').toLowerCase();
            const bv = (b.label || b.service || '').toLowerCase();
            return this.sortServiceAsc ? av.localeCompare(bv, 'fr') : bv.localeCompare(av, 'fr');
        });
    }

    toggleServiceSort(): void {
        this.sortServiceAsc = !this.sortServiceAsc;
    }

    onServiceSearchChange(): void {
        this.reconciliationPageIndex = 0;
    }

    focusWeekendIssues(): void {
        this.weekendFocusActive = true;
        this.reconciliationPageIndex = 0;
        this.detailTablePanelRef?.nativeElement?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    clearWeekendFocus(): void {
        this.weekendFocusActive = false;
    }

    getCountryTabOptions(): { id: string; label: string; count: number }[] {
        const rows = this.reconciliationSummaryRows || [];
        const counts = new Map<string, number>();
        rows.forEach(row => {
            const code = this.resolveRowCountry(row) || '—';
            counts.set(code, (counts.get(code) || 0) + 1);
        });
        const tabs: { id: string; label: string; count: number }[] = [
            { id: 'ALL', label: this.t('ETA.all'), count: rows.length }
        ];
        [...counts.entries()]
            .sort(([a], [b]) => a.localeCompare(b, 'fr'))
            .forEach(([code, count]) => tabs.push({ id: code, label: code, count }));
        return tabs;
    }

    get anomalyRowsCount(): number {
        return (this.reconciliationSummaryRows || []).filter(row => this.countRowAnomalyDays(row) > 0).length;
    }

    countRowAnomalyDays(row: { days: RecoDayCell[] }): number {
        return row.days.filter(day => day.status === 'NON_RECONCILIE').length;
    }

    setCountryTab(tabId: string): void {
        this.countryTabFilter = tabId;
        this.reconciliationPageIndex = 0;
    }

    toggleAnomaliesOnly(): void {
        this.anomaliesOnlyFilter = !this.anomaliesOnlyFilter;
        this.reconciliationPageIndex = 0;
    }

    toggleInlineComments(): void {
        this.inlineCommentsMode = !this.inlineCommentsMode;
    }

    getCellNoteText(day: RecoDayCell, row: { service: string; country?: string; label?: string }): string {
        if (!this.shouldShowBlockingComment(day)) {
            return '';
        }
        const text = this.getJ1CommentText(day, row);
        if (text) {
            const author = this.getJ1CommentForCell(day, row)?.updatedBy;
            return author ? `${author} : ${text}` : text;
        }
        return this.t('ETA.noteRequired');
    }

    hasCellNoteIndicator(day: RecoDayCell, row: { service: string; country?: string; label?: string }): boolean {
        return this.shouldShowBlockingComment(day);
    }

    isCellNoteMissing(day: RecoDayCell, row: { service: string; country?: string; label?: string }): boolean {
        return this.shouldShowBlockingComment(day) && !this.getJ1CommentText(day, row);
    }

    hasCellTicketIndicator(day: RecoDayCell): boolean {
        return day.status === 'RECONCILIE' && !!(day.ticketId || '').trim();
    }

    onInfoDotClick(day: RecoDayCell, row: { service: string; country?: string; label?: string }, event: Event): void {
        event.stopPropagation();
        if (this.shouldShowBlockingComment(day)) {
            this.openBlockingCommentModal(day, row);
            return;
        }
        if (this.hasCellTicketIndicator(day)) {
            this.showTicketOptionsPopup(day.ticketId);
        }
    }

    isWeekendDate(isoDate: string): boolean {
        const [y, m, d] = isoDate.split('-').map(Number);
        if ([y, m, d].some(n => isNaN(n))) {
            return false;
        }
        // Réconciliation faite à J+1 : les dates vendredi/samedi sont traitées le week-end (samedi/dimanche).
        const dow = new Date(y, m - 1, d).getDay();
        return dow === 5 || dow === 6;
    }

    isWeekendColumn(day: { date: string }): boolean {
        return this.isWeekendDate(day.date);
    }

    get weekendAlert(): { title: string; detail: string; weekendLabels: string[] } | null {
        if (!this.weekDays.length || !this.reconciliationSummaryRows.length) {
            return null;
        }
        let weekdayNonReco = 0;
        let weekendNonReco = 0;
        const weekendLabels: string[] = [];
        this.weekDays.forEach((wd, idx) => {
            const isWe = this.isWeekendDate(wd.date);
            if (isWe) {
                weekendLabels.push(wd.label);
            }
            this.reconciliationSummaryRows.forEach(row => {
                const day = row.days[idx];
                if (day?.status === 'NON_RECONCILIE') {
                    if (isWe) {
                        weekendNonReco++;
                    } else {
                        weekdayNonReco++;
                    }
                }
            });
        });
        if (weekendNonReco < 2 || weekendNonReco <= weekdayNonReco) {
            return null;
        }
        const labels = weekendLabels.slice(-2).join(this.t('ETA.weekendAlert.and'));
        return {
            title: this.t('ETA.weekendAlert.title'),
            detail: this.t('ETA.weekendAlert.detail', { labels, weekend: weekendNonReco, weekday: weekdayNonReco }),
            weekendLabels
        };
    }

    get refreshLabel(): string {
        if (!this.lastRefreshAt) {
            return this.t('ETA.refresh.loading');
        }
        const min = Math.max(0, Math.floor((Date.now() - this.lastRefreshAt.getTime()) / 60000));
        if (min < 1) {
            return this.t('ETA.refresh.justNow');
        }
        return this.t('ETA.refresh.minutes', { min });
    }

    get periodRangeLabel(): string {
        if (!this.visibleWeekDays.length) {
            return '';
        }
        const first = this.visibleWeekDays[0].label.split(' ').slice(1).join(' ');
        const last = this.visibleWeekDays[this.visibleWeekDays.length - 1].label.split(' ').slice(1).join(' ');
        return first === last ? first : this.t('ETA.periodRange', { first, last });
    }

    get filteredServiceCount(): number {
        return this.getFilteredReconciliationSummaryRows().length;
    }

    parseServiceRowLabel(label: string): { name: string; code: string } {
        const raw = (label || '').trim();
        const m = raw.match(/^(.+?)\s*\(([^)]+)\)\s*$/);
        if (m) {
            return { name: m[1].trim(), code: m[2].trim() };
        }
        return { name: raw, code: '' };
    }

    getModernPillClass(day: RecoDayCell): string {
        if (day.status === 'RECONCILIE') {
            return 'pill ok';
        }
        if (day.status === 'NON_RECONCILIE') {
            return 'pill ko';
        }
        if (day.traitementKind === 'group') {
            return 'pill closing';
        }
        return 'pill progress';
    }

    onDayPillClick(day: RecoDayCell, row: { service: string; country?: string }): void {
        if (this.shouldShowBlockingComment(day) && !this.getJ1CommentText(day, row)) {
            this.openBlockingCommentModal(day, row);
            return;
        }
        if (day.status === 'RECONCILIE' && day.ticketId) {
            this.showTicketOptionsPopup(day.ticketId);
        }
    }

    getStatusTooltip(day: RecoDayCell, row?: { service: string; country?: string }): string {
        if (row && this.shouldShowBlockingComment(day)) {
            const text = this.getJ1CommentText(day, row);
            if (!text) {
                return this.t('ETA.noteRequiredTooltip');
            }
            const author = this.getJ1CommentForCell(day, row)?.updatedBy || day.blockingCommentBy || this.t('ETA.authorFallback');
            return this.t('ETA.blockingAuthor', { author, text });
        }
        if (day.status === 'RECONCILIE' && day.ticketId) {
            return this.t('ETA.ticketTooltip', { id: day.ticketId });
        }
        if (day.status === 'NON_RECONCILIE') {
            return this.t('ETA.noValidReport');
        }
        return this.getStatusPillLabel(day);
    }

    formatKpiDelta(current: number, previous: number, higherIsBetter = true): { text: string; cls: string } {
        const diff = current - previous;
        if (!previous && !current) {
            return { text: '—', cls: 'stable' };
        }
        if (diff === 0) {
            return { text: '— stable', cls: 'stable' };
        }
        const improved = higherIsBetter ? diff > 0 : diff < 0;
        const sign = diff > 0 ? '▲' : '▼';
        const prefix = diff > 0 ? '+' : '';
        return {
            text: `${sign} ${prefix}${diff} vs période préc.`,
            cls: improved ? 'up' : 'down'
        };
    }

    get evolutionBarDays(): {
        label: string;
        sub: string;
        ok: number;
        progress: number;
        closing: number;
        ko: number;
        weekend: boolean;
        total: number;
        chartProgress: number;
    }[] {
        const evo = this.getRecoEvolutionByDay();
        const displayDays = this.visibleWeekDays.length ? this.visibleWeekDays : this.weekDays;
        return displayDays.map((wd) => {
            const dayIndex = this.weekDays.findIndex(d => d.date === wd.date);
            const i = dayIndex >= 0 ? dayIndex : 0;
            const ok = evo.reconcilie[i] || 0;
            const progress = (evo.enCoursCdo[i] || 0) + (evo.enCoursSupport[i] || 0);
            const closing = evo.enCoursGroup[i] || 0;
            const ko = evo.nonReco[i] || 0;
            const parts = (wd.label || '').split(' ');
            return {
                label: parts[0] || '',
                sub: parts.slice(1).join(' ') || `${wd.date.slice(8, 10)}/${wd.date.slice(5, 7)}`,
                ok,
                progress,
                closing,
                ko,
                weekend: this.isWeekendDate(wd.date),
                total: ok + progress + closing + ko,
                chartProgress: progress + closing
            };
        });
    }

    get chartServiceTotal(): number {
        return this.reconciliationSummaryRows.length || 0;
    }

    get evolutionBarMax(): number {
        const totals = this.evolutionBarDays.map(d => d.total);
        return Math.max(1, ...totals, 0);
    }

    readonly evolutionChartStackHeightPx = 168;

    barSegmentHeight(count: number): number {
        if (!count) {
            return 0;
        }
        return Math.max(4, Math.round((count / this.evolutionBarMax) * this.evolutionChartStackHeightPx));
    }

    getSparkHeights(values: number[]): number[] {
        const max = Math.max(1, ...values);
        return values.map(v => Math.max(2, Math.round((v / max) * 20)));
    }

    get sparkTotal(): number[] {
        return this.getSparkHeights(this.evolutionBarDays.map(d => d.total));
    }

    get sparkOk(): number[] {
        return this.getSparkHeights(this.evolutionBarDays.map(d => d.ok));
    }

    get sparkProgress(): number[] {
        return this.getSparkHeights(this.evolutionBarDays.map(d => d.progress));
    }

    get sparkKo(): number[] {
        return this.getSparkHeights(this.evolutionBarDays.map(d => d.ko));
    }

    get sparkClosing(): number[] {
        return this.getSparkHeights(this.evolutionBarDays.map(d => d.closing));
    }

    exportTableCsv(): void {
        const rows = this.getFilteredReconciliationSummaryRows();
        const days = this.visibleWeekDays;
        const header = ['Service', ...days.map(d => d.label)];
        const lines = [header.join(';')];
        rows.forEach(row => {
            const visible = this.getVisibleDays(row);
            const cells = [
                (row.label || row.service || '').replace(/;/g, ','),
                ...visible.map(day => this.getStatusPillLabel(day).replace(/;/g, ','))
            ];
            lines.push(cells.join(';'));
        });
        const blob = new Blob(['\uFEFF' + lines.join('\n')], { type: 'text/csv;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `etat-reconciliations-${this.formatLocalYmd(new Date())}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    }

    private backupSummaryState() {
        return {
            rows: this.reconciliationSummaryRows,
            stats: { ...this.recoStats },
            weekDays: [...this.weekDays],
            visibleWeekDays: [...this.visibleWeekDays],
            visibleDayIndices: [...this.visibleDayIndices],
            pageIndex: this.reconciliationPageIndex
        };
    }

    private restoreSummaryState(backup: ReturnType<typeof this.backupSummaryState>): void {
        this.reconciliationSummaryRows = backup.rows;
        this.recoStats = { ...backup.stats };
        this.weekDays = backup.weekDays;
        this.visibleWeekDays = backup.visibleWeekDays;
        this.visibleDayIndices = backup.visibleDayIndices;
        this.reconciliationPageIndex = backup.pageIndex;
        this.updateRecoChartsData();
    }

    private loadPreviousPeriodStats(token: number): void {
        const span = this.weekDays.length;
        if (!span) {
            return;
        }
        const ctx = this.buildReconciliationSummaryPeriodContext();
        const prevEnd = this.addDaysToIsoDate(ctx.periodStartStr, -1);
        const prevStart = this.addDaysToIsoDate(prevEnd, -(span - 1));
        const prevCtx = {
            periodStartStr: prevStart,
            periodEndExclusiveStr: this.addDaysToIsoDate(prevEnd, 1),
            eligibilityStartStr: this.addDaysToIsoDate(prevStart, -7)
        };

        this.dashboardReconciliationService.loadResult8RecProgressive(
            prevCtx.eligibilityStartStr,
            prevEnd,
            (data, _isFirst, isComplete) => {
                if (!isComplete || token !== this.recoSummaryLoadToken) {
                    return;
                }
                const backup = this.backupSummaryState();
                this.weekDays = this.buildCalendarDaysInclusive(prevStart, prevEnd);
                this.visibleDayIndices = this.weekDays.map((_, i) => i);
                this.visibleWeekDays = [...this.weekDays];
                try {
                    this.processReconciliationSummaryData(data, prevCtx);
                    this.previousRecoStats = { ...this.recoStats };
                } catch (e) {
                    console.warn('Comparaison période précédente ignorée:', e);
                } finally {
                    this.restoreSummaryState(backup);
                }
            },
            this.moduleContext,
            () => token !== this.recoSummaryLoadToken
        ).catch(() => undefined);
    }

    getGlpiTicketUrl(ticketId: string): string {
      return `https://glpi.intouchgroup.net/glpi/public/front/ticket.form.php?id=${ticketId}`;
    }

    getBometierTicketUrl(ticketId: string): string {
      return `https://bometier.gutouch.net/details-ticket/${ticketId}`;
    }

    async showTicketOptionsPopup(ticketId: string): Promise<void> {
      const normalizedTicketId = (ticketId || '').trim();
      if (!normalizedTicketId) {
        return;
      }

      const message = this.t('ETA.ticket.choosePlatform', { id: normalizedTicketId });
      const title = this.t('ETA.ticket.title');

      const overlay = document.createElement('div');
      overlay.className = 'modern-popup-overlay';
      overlay.innerHTML = `
          <div class="modern-popup popup-type-info">
              <div class="popup-header">
                  <div class="popup-title-wrapper">
                      <span class="popup-icon">🎫</span>
                      <h3 class="popup-title">${title}</h3>
                  </div>
                  <button class="popup-close" aria-label="${this.t('COMMON.actions.close')}">×</button>
              </div>
              <div class="popup-content">
                  <p class="popup-message">${message}</p>
              </div>
              <div class="popup-actions popup-actions-two-buttons">
                  <button class="popup-btn popup-btn-glpi">
                      🔵 GLPI
                  </button>
                  <button class="popup-btn popup-btn-bometier">
                      🟢 BOMETIER
                  </button>
              </div>
          </div>
      `;

      const style = document.createElement('style');
      style.textContent = `
          .modern-popup-overlay {
              position: fixed;
              top: 0;
              left: 0;
              width: 100%;
              height: 100%;
              background: rgba(0, 0, 0, 0.6);
              backdrop-filter: blur(4px);
              display: flex;
              justify-content: center;
              align-items: center;
              z-index: var(--z-modal);
              animation: fadeIn 0.25s cubic-bezier(0.4, 0, 0.2, 1);
          }
          .modern-popup {
              background: white;
              border-radius: 16px;
              box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3), 0 0 0 1px rgba(0, 0, 0, 0.05);
              max-width: 450px;
              width: 90%;
              animation: slideIn 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
              overflow: hidden;
              border-top: 4px solid #007bff;
          }
          .popup-header {
              display: flex;
              justify-content: space-between;
              align-items: center;
              padding: 24px 24px 16px 24px;
              background: linear-gradient(135deg, #f8f9fa 0%, #ffffff 100%);
          }
          .popup-title-wrapper {
              display: flex;
              align-items: center;
              gap: 12px;
          }
          .popup-icon {
              font-size: 24px;
              line-height: 1;
          }
          .popup-title {
              margin: 0;
              font-size: 20px;
              font-weight: 700;
              color: #212529;
          }
          .popup-close {
              background: rgba(0, 0, 0, 0.05);
              border: none;
              font-size: 22px;
              cursor: pointer;
              color: #6c757d;
              padding: 0;
              width: 32px;
              height: 32px;
              display: flex;
              align-items: center;
              justify-content: center;
              border-radius: 50%;
              transition: all 0.2s;
          }
          .popup-close:hover {
              background: rgba(0, 0, 0, 0.1);
              color: #212529;
              transform: rotate(90deg);
          }
          .popup-content {
              padding: 20px 24px;
          }
          .popup-message {
              margin: 0;
              color: #495057;
              line-height: 1.6;
              font-size: 15px;
          }
          .popup-actions-two-buttons {
              display: flex;
              justify-content: center;
              gap: 12px;
              padding: 16px 24px 24px 24px;
              background: #f8f9fa;
              border-top: 1px solid #e9ecef;
          }
          .popup-btn {
              padding: 12px 24px;
              border: none;
              border-radius: 8px;
              cursor: pointer;
              font-weight: 600;
              font-size: 14px;
              transition: all 0.2s;
              min-width: 140px;
              box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
          }
          .popup-btn:hover {
              transform: translateY(-1px);
              box-shadow: 0 4px 8px rgba(0, 0, 0, 0.15);
          }
          .popup-btn-glpi {
              background: linear-gradient(135deg, #007bff 0%, #0056b3 100%);
              color: white;
          }
          .popup-btn-glpi:hover {
              background: linear-gradient(135deg, #0056b3 0%, #004085 100%);
          }
          .popup-btn-bometier {
              background: linear-gradient(135deg, #28a745 0%, #1e7e34 100%);
              color: white;
          }
          .popup-btn-bometier:hover {
              background: linear-gradient(135deg, #1e7e34 0%, #155724 100%);
          }
          @keyframes fadeIn {
              from { opacity: 0; }
              to { opacity: 1; }
          }
          @keyframes slideIn {
              from {
                  opacity: 0;
                  transform: translateY(-30px) scale(0.9);
              }
              to {
                  opacity: 1;
                  transform: translateY(0) scale(1);
              }
          }
      `;

      document.head.appendChild(style);
      document.body.appendChild(overlay);
      document.body.style.overflow = 'hidden';

      const cleanup = () => {
          document.body.style.overflow = 'auto';
          document.removeEventListener('keydown', handleEscape);
          if (style.parentNode) {
              style.parentNode.removeChild(style);
          }
          overlay.remove();
      };

      const handleEscape = (e: KeyboardEvent) => {
          if (e.key === 'Escape') {
              cleanup();
          }
      };

      document.addEventListener('keydown', handleEscape);

      overlay.querySelector('.popup-close')?.addEventListener('click', cleanup);
      overlay.addEventListener('click', (e) => {
          if (e.target === overlay) {
              cleanup();
          }
      });

      overlay.querySelector('.popup-btn-glpi')?.addEventListener('click', () => {
          cleanup();
          this.openGlpiTicket(normalizedTicketId);
      });

      overlay.querySelector('.popup-btn-bometier')?.addEventListener('click', () => {
          cleanup();
          this.openBometierTicket(normalizedTicketId);
      });
    }

    // Ouvrir un ticket GLPI existant
    openGlpiTicket(ticketId: string): void {
      const normalizedTicketId = (ticketId || '').trim();
      if (!normalizedTicketId) {
        return;
      }
      const url = this.getGlpiTicketUrl(normalizedTicketId);
      window.open(url, '_blank', 'noopener,noreferrer');
    }

    // Ouvrir un ticket BOMETIER existant
    openBometierTicket(ticketId: string): void {
      const normalizedTicketId = (ticketId || '').trim();
      if (!normalizedTicketId) {
        return;
      }
      const url = this.getBometierTicketUrl(normalizedTicketId);
      window.open(url, '_blank', 'noopener,noreferrer');
    }
}
