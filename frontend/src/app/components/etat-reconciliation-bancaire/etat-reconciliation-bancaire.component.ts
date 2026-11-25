import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { forkJoin, of } from 'rxjs';
import { catchError, take } from 'rxjs/operators';
import { ReleveBancaireService } from '../../services/releve-bancaire.service';
import { OperationBancaireService } from '../../services/operation-bancaire.service';
import { OperationBancaire, OperationBancaireAuditStat } from '../../models/operation-bancaire.model';
import { ReleveBancaireRow } from '../../models/releve-bancaire.model';
import { UserService } from '../../services/user.service';
import { TopUsersConfigService, TopUsersConfig, DEFAULT_TOP_USERS_CONFIG, cloneTopUsersConfig } from '../../services/top-users-config.service';
import {
    BankAccountRow,
    BankDayCell,
    BankLine,
    BANK_STATUS_ORDER,
    BankPeriod,
    BankStatus,
    BankStats,
    buildBankAccountRows,
    computePeriodRange,
    computeStats,
    emptyStats,
    formatLocalYmd,
    isWeekendIso,
    listDates,
    parseLocalYmd,
    previousRange,
    sparkHeights,
    toIsoDate
} from './etat-reconciliation-bancaire.util';
import { rankByAverageShare, rankByShare } from '../../utils/top-users-share.util';

type StatusFilter = 'ALL' | BankStatus;

/** Un utilisateur classé dans une catégorie du top banque. */
export interface BankTopUser {
    username: string;
    displayName: string;
    initials: string;
    count: number;
    delta: number;
    barPct: number;
    /** Part (%) de l'utilisateur sur le total de la catégorie, tous pays confondus : donne le rang. */
    sharePct: number;
    /** Classement « moyenne » : lignes, volume et part de chacun (%). */
    lines?: number;
    volume?: number;
    linesPct?: number;
    volumePct?: number;
    photo?: string | null;
}

/** Classement du top banque : par lignes utiles, par volume de ces lignes, ou moyenne des deux parts. */
export type BankTopRanking = 'lignes' | 'volume' | 'moyenne';

/** Une catégorie (colonne) du top banque. */
export interface BankTopCategory {
    key: string;
    titleKey: string;
    actionLabelKey: string;
    accent: string;
    total: number;
    /** Classement « moyenne » : volume total (`total` = lignes). */
    volumeTotal?: number;
    users: BankTopUser[];
}

/**
 * Catégories du top banque. Le classement compte des LIGNES utiles (calculées par le backend,
 * /audit-ranking) et non des actions : agents = lignes importées dont la réconciliation est OK,
 * responsables = lignes validées, clôtures = lignes clôturées. Une ligne importée mais non
 * traitée ne compte pas. `events` = catégorie renvoyée par le backend.
 */
const BANK_TOP_DEFS: Array<{ key: string; titleKey: string; actionLabelKey: string; events: string[]; accent: string }> = [
    { key: 'agents', titleKey: 'EBQ.top.catAgents', actionLabelKey: 'EBQ.top.actAgents', events: ['AGENTS'], accent: '#2563EB' },
    { key: 'rapprochement', titleKey: 'EBQ.top.catRapprochement', actionLabelKey: 'EBQ.top.actRapprochement',
      events: ['RAPPROCHEMENT'], accent: '#7C3AED' },
    { key: 'clotures', titleKey: 'EBQ.top.catClotures', actionLabelKey: 'EBQ.top.actClotures',
      events: ['CLOTURES'], accent: '#0F766E' }
];

/** Au-delà de ce nombre de jours, la grille n'affiche qu'une fenêtre glissante. */
const MAX_INLINE_DAYS = 14;
const WINDOW_SIZE = 7;

/**
 * État de réconciliation bancaire : grille compte bancaire × jour, sur le modèle de la page
 * « État des réconciliations » (transactions). Le statut d'une case (réconcilié, en cours de
 * validation, en cours de clôture, terminé, non réconcilié) est déduit des lignes de relevé du
 * compte à la date comptable et de l'opération bancaire rapprochée (voir le fichier .util.ts).
 */
@Component({
    selector: 'app-etat-reconciliation-bancaire',
    standalone: true,
    imports: [TranslateModule, CommonModule, FormsModule],
    templateUrl: './etat-reconciliation-bancaire.component.html',
    // Le design (topbar, KPI, panneau, tableau, pastilles, modale) est celui de l'état des réconciliations.
    styleUrls: [
        '../etat-reconciliations/etat-reconciliations.component.scss',
        './etat-reconciliation-bancaire.component.scss'
    ]
})
export class EtatReconciliationBancaireComponent implements OnInit {
    private readonly moduleContext = 'BANQUE';

    period: BankPeriod = 'semaine';
    /** « Semaine en cours » sans relevé le lundi : la semaine passée est affichée à la place. */
    weekFallbackToPrevious = false;
    country = '';
    banque = '';
    searchQuery = '';
    statusFilter: StatusFilter = 'ALL';
    anomaliesOnly = false;
    countryTab = 'ALL';

    loading = false;
    error = '';
    /** Opérations bancaires indisponibles : les statuts de traitement (validation, clôture, terminé) sont alors incomplets. */
    operationsUnavailable = false;
    lastRefreshAt: Date | null = null;

    /** Tous les comptes avec leurs jours (période courante + précédente). */
    allRows: BankAccountRow[] = [];
    countries: string[] = [];
    banques: string[] = [];

    days: { date: string; label: string }[] = [];
    visibleDays: { date: string; label: string }[] = [];
    private windowStart = 0;

    stats: BankStats = emptyStats();
    previousStats: BankStats = emptyStats();
    sparkTotal: number[] = [];
    sparkOk: number[] = [];
    sparkValidation: number[] = [];
    sparkCloture: number[] = [];
    sparkTermine: number[] = [];
    sparkKo: number[] = [];

    pageSizeOptions = [10, 25, 50, 100];
    pageSize = 25;
    pageIndex = 0;

    detail: { row: BankAccountRow; cell: BankDayCell } | null = null;

    private rangeStart = '';
    private rangeEnd = '';

    // « Top des utilisateurs » propre à la banque (historique des opérations bancaires)
    topUsersLoading = false;
    topUsersCategories: BankTopCategory[] = [];
    topUsersConfig: TopUsersConfig = cloneTopUsersConfig(DEFAULT_TOP_USERS_CONFIG);
    private topUsersToken = 0;
    /** Classement affiché ; en changer ne recharge pas le serveur. */
    topUsersRanking: BankTopRanking = EtatReconciliationBancaireComponent.readTopUsersRanking();
    private topUsersData: { current: OperationBancaireAuditStat[]; previous: OperationBancaireAuditStat[] } | null = null;
    private static readonly TOP_USERS_RANKING_KEY = 'etatBanque.topUsersRanking';

    private static readTopUsersRanking(): BankTopRanking {
        try {
            const saved = localStorage.getItem(EtatReconciliationBancaireComponent.TOP_USERS_RANKING_KEY);
            return saved === 'volume' || saved === 'moyenne' ? saved : 'lignes';
        } catch {
            return 'lignes';
        }
    }

    setTopUsersRanking(mode: BankTopRanking): void {
        if (mode === this.topUsersRanking) return;
        this.topUsersRanking = mode;
        try { localStorage.setItem(EtatReconciliationBancaireComponent.TOP_USERS_RANKING_KEY, mode); } catch { /* facultatif */ }
        if (!this.topUsersData || !this.topUsersConfig.enabled) return;
        const token = ++this.topUsersToken;
        this.topUsersLoading = true;
        this.attachTopPhotos(this.buildTopCategories(this.topUsersData.current, this.topUsersData.previous), token);
    }
    trackByCategoryKey = (_: number, item: BankTopCategory): string => item.key;
    trackByUsername = (_: number, item: BankTopUser): string => item.username;

    constructor(
        private releveService: ReleveBancaireService,
        private translate: TranslateService,
        private router: Router,
        private operationBancaireService: OperationBancaireService,
        private userService: UserService,
        private topUsersConfigService: TopUsersConfigService
    ) {}

    get topUsersColumns(): string {
        return String(Math.max(1, this.topUsersCategories.length));
    }

    private loadTopUsers(): void {
        const token = ++this.topUsersToken;
        this.topUsersLoading = true;
        this.topUsersConfigService.load().pipe(take(1)).subscribe(cfg => {
            if (token !== this.topUsersToken) return;
            this.topUsersConfig = cfg;
            if (!cfg.enabled) {
                this.topUsersCategories = [];
                this.topUsersLoading = false;
                return;
            }
            const prev = previousRange(this.rangeStart, this.rangeEnd);
            forkJoin({
                current: this.operationBancaireService.getAuditRanking(this.rangeStart, this.rangeEnd)
                    .pipe(catchError(() => of([] as OperationBancaireAuditStat[]))),
                previous: this.operationBancaireService.getAuditRanking(prev.start, prev.end)
                    .pipe(catchError(() => of([] as OperationBancaireAuditStat[])))
            }).pipe(take(1)).subscribe(({ current, previous }) => {
                if (token !== this.topUsersToken) return;
                this.topUsersData = { current: current || [], previous: previous || [] };
                this.attachTopPhotos(this.buildTopCategories(current || [], previous || []), token);
            });
        });
    }

    /** Par catégorie puis utilisateur : nombre de lignes utiles, ou leur volume si `byVolume`. */
    private aggregateTop(stats: OperationBancaireAuditStat[], byVolume = false): Record<string, Map<string, number>> {
        const result: Record<string, Map<string, number>> = {};
        BANK_TOP_DEFS.forEach(d => result[d.key] = new Map<string, number>());
        for (const st of stats) {
            const username = (st?.username || '').trim();
            const count = byVolume ? Math.abs(Number(st?.volume) || 0) : Number(st?.count) || 0;
            if (!username || count <= 0) continue;
            const action = (st.actionType || '').trim().toUpperCase();
            for (const d of BANK_TOP_DEFS) {
                if (d.events.includes(action)) {
                    const m = result[d.key];
                    m.set(username, (m.get(username) || 0) + count);
                }
            }
        }
        return result;
    }

    private buildTopCategories(current: OperationBancaireAuditStat[], previous: OperationBancaireAuditStat[]): BankTopCategory[] {
        const limit = Math.max(1, Number(this.topUsersConfig.topN) || 3);
        if (this.topUsersRanking === 'moyenne') {
            return this.buildTopCategoriesAverage(current, previous, limit);
        }
        const byVolume = this.topUsersRanking === 'volume';
        const counts = this.aggregateTop(current, byVolume);
        const prevCounts = this.aggregateTop(previous, byVolume);
        return BANK_TOP_DEFS.map(def => {
            const perUser = counts[def.key];
            const prevPerUser = prevCounts[def.key];
            // Le classement banque (/audit-ranking) couvre déjà tous les pays : le total de la
            // catégorie est la somme des lignes, et la part de chacun sur ce total donne le rang.
            const total = Math.round(Array.from(perUser.values()).reduce((a, b) => a + b, 0));
            const ranked = rankByShare(perUser, total);
            const max = ranked.reduce((m, e) => Math.max(m, e.count), 0);
            return {
                key: def.key,
                titleKey: def.titleKey,
                actionLabelKey: def.actionLabelKey,
                accent: def.accent,
                total,
                users: ranked.slice(0, limit).map(e => ({
                    username: e.username,
                    displayName: this.formatUsername(e.username),
                    initials: this.usernameInitials(e.username),
                    count: Math.round(e.count),
                    delta: Math.round(e.count - (prevPerUser.get(e.username) || 0)),
                    barPct: max > 0 ? Math.round((e.count / max) * 100) : 0,
                    sharePct: e.sharePct,
                    photo: null
                }))
            };
        });
    }

    /**
     * Classement « moyenne » : rang = (part en lignes + part en volume) / 2, sur le total de la
     * catégorie. L'évolution est l'écart, en points, avec la moyenne de la période précédente.
     */
    private buildTopCategoriesAverage(
        current: OperationBancaireAuditStat[],
        previous: OperationBancaireAuditStat[],
        limit: number
    ): BankTopCategory[] {
        const lines = this.aggregateTop(current);
        const vols = this.aggregateTop(current, true);
        const prevLines = this.aggregateTop(previous);
        const prevVols = this.aggregateTop(previous, true);
        const sum = (m: Map<string, number>): number => Array.from(m.values()).reduce((a, b) => a + b, 0);
        return BANK_TOP_DEFS.map(def => {
            const total = sum(lines[def.key]);
            const volumeTotal = sum(vols[def.key]);
            const ranked = rankByAverageShare(lines[def.key], total, vols[def.key], volumeTotal);
            const prevPct = new Map(rankByAverageShare(
                prevLines[def.key], sum(prevLines[def.key]), prevVols[def.key], sum(prevVols[def.key])
            ).map(r => [r.username, r.exactPct]));
            const max = ranked.reduce((m, e) => Math.max(m, e.exactPct), 0);
            return {
                key: def.key,
                titleKey: def.titleKey,
                actionLabelKey: def.actionLabelKey,
                accent: def.accent,
                total,
                volumeTotal: Math.round(volumeTotal),
                users: ranked.slice(0, limit).map(e => ({
                    username: e.username,
                    displayName: this.formatUsername(e.username),
                    initials: this.usernameInitials(e.username),
                    count: e.services,
                    delta: Math.round((e.exactPct - (prevPct.get(e.username) || 0)) * 10) / 10,
                    barPct: max > 0 ? Math.round((e.exactPct / max) * 100) : 0,
                    sharePct: e.sharePct,
                    lines: e.services,
                    volume: Math.round(e.volume),
                    linesPct: e.servicesPct,
                    volumePct: e.volumePct,
                    photo: null
                }))
            };
        });
    }

    private formatUsername(username: string): string {
        const parts = (username || '').trim().split(/[._\-\s]+/).filter(Boolean);
        return parts.length ? parts.map(p => p.charAt(0).toUpperCase() + p.slice(1)).join(' ') : (username || '');
    }

    private usernameInitials(username: string): string {
        const parts = (username || '').trim().split(/[._\-\s]+/).filter(Boolean);
        return parts.length ? parts.slice(0, 2).map(p => p.charAt(0).toUpperCase()).join('') : (username || '?').charAt(0).toUpperCase();
    }

    private attachTopPhotos(categories: BankTopCategory[], token: number): void {
        const usernames = Array.from(new Set(categories.flatMap(c => c.users.map(u => u.username)).filter(Boolean)));
        if (!usernames.length) {
            this.topUsersCategories = categories;
            this.topUsersLoading = false;
            return;
        }
        this.userService.getUserPhotos(usernames).pipe(take(1)).subscribe({
            next: (photos) => {
                if (token !== this.topUsersToken) return;
                this.topUsersCategories = categories.map(c => ({
                    ...c, users: c.users.map(u => ({ ...u, photo: photos?.[u.username] ?? null }))
                }));
                this.topUsersLoading = false;
            },
            error: () => {
                if (token !== this.topUsersToken) return;
                this.topUsersCategories = categories;
                this.topUsersLoading = false;
            }
        });
    }

    onTopUserPhotoError(user: BankTopUser): void {
        user.photo = null;
    }

    ngOnInit(): void {
        this.load();
    }

    private t(key: string, params?: Record<string, unknown>): string {
        return this.translate.instant(key, params) as string;
    }

    // ---------------------------------------------------------------- Chargement

    onPeriodChange(): void {
        this.windowStart = 0;
        this.load();
    }

    load(): void {
        const current = computePeriodRange(this.period);
        // « Semaine en cours » : si aucun relevé le lundi, on affiche la semaine passée (lundi → dimanche).
        const fallback = this.period === 'semaine' ? computePeriodRange('semaine_passee') : null;
        const earliest = fallback ?? current;
        const prev = previousRange(earliest.start, earliest.end);
        this.rangeStart = current.start;
        this.rangeEnd = current.end;
        this.weekFallbackToPrevious = false;
        this.loading = true;
        this.error = '';

        this.operationsUnavailable = false;

        forkJoin({
            releves: this.releveService.list({ dateDebut: prev.start, dateFin: current.end, dateField: 'comptable' }, this.moduleContext),
            // Les opérations donnent le niveau de traitement (validation, clôture, terminé).
            operations: this.operationBancaireService.getAllOperationsBancaires(this.moduleContext).pipe(
                catchError(() => {
                    this.operationsUnavailable = true;
                    return of([] as OperationBancaire[]);
                })
            )
        }).subscribe({
            next: ({ releves, operations }) => {
                this.allRows = buildBankAccountRows(
                    Array.isArray(releves) ? (releves as ReleveBancaireRow[]) : [],
                    Array.isArray(operations) ? operations : []
                );
                this.weekFallbackToPrevious = !!fallback && !this.allRows.some(r => !!r.days[current.start]);
                const range = this.weekFallbackToPrevious && fallback ? fallback : current;
                this.rangeStart = range.start;
                this.rangeEnd = range.end;
                this.loadTopUsers();
                this.countries = Array.from(new Set(this.allRows.map(r => r.country).filter(Boolean))).sort();
                this.banques = Array.from(new Set(this.allRows.map(r => r.banque).filter(Boolean))).sort();
                if (this.country && !this.countries.includes(this.country)) {
                    this.country = '';
                }
                if (this.banque && !this.banques.includes(this.banque)) {
                    this.banque = '';
                }
                this.buildDays();
                this.recompute();
                this.lastRefreshAt = new Date();
                this.loading = false;
            },
            error: (err) => {
                this.loading = false;
                this.error = err?.error?.message || this.t('EBQ.loadError');
                this.loadTopUsers();
            }
        });
    }

    private buildDays(): void {
        const names = [0, 1, 2, 3, 4, 5, 6].map(i => this.t('DOW.' + i));
        this.days = listDates(this.rangeStart, this.rangeEnd).map(date => {
            const d = parseLocalYmd(date);
            const dd = String(d.getDate()).padStart(2, '0');
            const mm = String(d.getMonth() + 1).padStart(2, '0');
            return { date, label: `${names[d.getDay()]} ${dd}/${mm}` };
        });
        this.windowStart = this.days.length > MAX_INLINE_DAYS ? Math.max(0, this.days.length - WINDOW_SIZE) : 0;
        this.updateVisibleDays();
    }

    private updateVisibleDays(): void {
        this.visibleDays = this.days.length <= MAX_INLINE_DAYS
            ? [...this.days]
            : this.days.slice(this.windowStart, this.windowStart + WINDOW_SIZE);
    }

    /** Statistiques, KPI et mini-histogrammes sur les comptes filtrés (pays / banque / recherche). */
    private recompute(): void {
        const rows = this.baseFilteredRows();
        const prev = previousRange(this.rangeStart, this.rangeEnd);
        this.stats = computeStats(rows, this.rangeStart, this.rangeEnd);
        this.previousStats = computeStats(rows, prev.start, prev.end);

        const perDay = this.days.map(d => computeStats(rows, d.date, d.date));
        const shown = this.visibleDays.map(vd => perDay[this.days.findIndex(d => d.date === vd.date)] || emptyStats());
        this.sparkTotal = sparkHeights(shown.map(s => s.total));
        this.sparkOk = sparkHeights(shown.map(s => s.reconcilie));
        this.sparkValidation = sparkHeights(shown.map(s => s.enCoursValidation));
        this.sparkCloture = sparkHeights(shown.map(s => s.enCoursCloture));
        this.sparkTermine = sparkHeights(shown.map(s => s.termine));
        this.sparkKo = sparkHeights(shown.map(s => s.nonReco));
        this.pageIndex = 0;
    }

    // ---------------------------------------------------------------- Filtres

    /** Filtre cloisonné : seules les banques du pays choisi sont proposées. */
    get banquesDuPays(): string[] {
        if (!this.country) {
            return this.banques;
        }
        return Array.from(new Set(
            this.allRows.filter(r => r.country === this.country).map(r => r.banque).filter(Boolean)
        )).sort();
    }

    onCountryChange(): void {
        if (this.banque && !this.banquesDuPays.includes(this.banque)) {
            this.banque = '';
        }
        this.onFilterChange();
    }

    onFilterChange(): void {
        this.countryTab = 'ALL';
        this.recompute();
    }

    setStatusFilter(status: BankStatus): void {
        this.statusFilter = this.statusFilter === status ? 'ALL' : status;
        this.pageIndex = 0;
    }

    toggleAnomaliesOnly(): void {
        this.anomaliesOnly = !this.anomaliesOnly;
        this.pageIndex = 0;
    }

    setCountryTab(id: string): void {
        this.countryTab = id;
        this.pageIndex = 0;
    }

    /** Comptes retenus par les filtres pays / banque / recherche, avant onglet pays et statut. */
    private baseFilteredRows(): BankAccountRow[] {
        const q = this.searchQuery.trim().toLowerCase();
        return this.allRows.filter(r =>
            (!this.country || r.country === this.country)
            && (!this.banque || r.banque === this.banque)
            && (!q || `${r.label} ${r.code} ${r.banque}`.toLowerCase().includes(q))
            // Seuls les comptes ayant au moins un relevé sur la période courante sont listés.
            && this.days.some(d => !!r.days[d.date]));
    }

    get filteredRows(): BankAccountRow[] {
        return this.baseFilteredRows().filter(r => {
            if (this.countryTab !== 'ALL' && r.country !== this.countryTab) {
                return false;
            }
            if (this.anomaliesOnly && this.countAnomalyDays(r) === 0) {
                return false;
            }
            if (this.statusFilter !== 'ALL' && !this.days.some(d => r.days[d.date]?.status === this.statusFilter)) {
                return false;
            }
            return true;
        });
    }

    get countryTabs(): { id: string; label: string; count: number }[] {
        const base = this.baseFilteredRows();
        const tabs = [{ id: 'ALL', label: this.t('EBQ.allCountries'), count: base.length }];
        const counts = new Map<string, number>();
        base.forEach(r => counts.set(r.country, (counts.get(r.country) || 0) + 1));
        Array.from(counts.keys()).sort().forEach(c => tabs.push({ id: c, label: c || '—', count: counts.get(c)! }));
        return tabs;
    }

    // ---------------------------------------------------------------- Grille

    get pagedRows(): BankAccountRow[] {
        const start = this.pageIndex * this.pageSize;
        return this.filteredRows.slice(start, start + this.pageSize);
    }

    get totalPages(): number {
        return Math.max(1, Math.ceil(this.filteredRows.length / this.pageSize));
    }

    get paginationLabel(): string {
        const total = this.filteredRows.length;
        if (!total) {
            return '';
        }
        const from = this.pageIndex * this.pageSize + 1;
        return `${from}–${Math.min(total, from + this.pageSize - 1)} / ${total}`;
    }

    onPageSizeChange(): void {
        this.pageIndex = 0;
    }

    prevPage(): void {
        this.pageIndex = Math.max(0, this.pageIndex - 1);
    }

    nextPage(): void {
        this.pageIndex = Math.min(this.totalPages - 1, this.pageIndex + 1);
    }

    canGoPrevDays(): boolean {
        return this.days.length > MAX_INLINE_DAYS && this.windowStart > 0;
    }

    canGoNextDays(): boolean {
        return this.days.length > MAX_INLINE_DAYS && this.windowStart + WINDOW_SIZE < this.days.length;
    }

    prevDaysWindow(): void {
        if (this.canGoPrevDays()) {
            this.windowStart = Math.max(0, this.windowStart - WINDOW_SIZE);
            this.updateVisibleDays();
            this.recompute();
        }
    }

    nextDaysWindow(): void {
        if (this.canGoNextDays()) {
            this.windowStart = Math.min(this.days.length - WINDOW_SIZE, this.windowStart + WINDOW_SIZE);
            this.updateVisibleDays();
            this.recompute();
        }
    }

    cell(row: BankAccountRow, date: string): BankDayCell | undefined {
        return row.days[date];
    }

    isWeekend(date: string): boolean {
        return isWeekendIso(date);
    }

    /** Jours de la période à traiter : au moins une ligne non réconciliée, hors aujourd'hui. */
    countAnomalyDays(row: BankAccountRow): number {
        const today = formatLocalYmd(new Date());
        return this.days.filter(d => {
            const c = row.days[d.date];
            return !!c && c.status === 'NON_RECONCILIE' && d.date < today;
        }).length;
    }

    get anomalyRowsCount(): number {
        return this.baseFilteredRows().filter(r => this.countAnomalyDays(r) > 0).length;
    }

    pillClass(status: BankStatus): string {
        switch (status) {
            case 'RECONCILIE': return 'pill ok';
            case 'EN_COURS_VALIDATION': return 'pill progress';
            case 'EN_COURS_CLOTURE': return 'pill closing';
            case 'TERMINE': return 'pill done';
            default: return 'pill ko';
        }
    }

    statusLabel(status: BankStatus): string {
        switch (status) {
            case 'RECONCILIE': return this.t('EBQ.status.reconciled');
            case 'EN_COURS_VALIDATION': return this.t('EBQ.status.validating');
            case 'EN_COURS_CLOTURE': return this.t('EBQ.status.closing');
            case 'TERMINE': return this.t('EBQ.status.done');
            default: return this.t('EBQ.status.notReconciled');
        }
    }

    /** Répartition des lignes du jour par statut, du moins au plus avancé. */
    cellBreakdown(cell: BankDayCell): { status: BankStatus; count: number }[] {
        return BANK_STATUS_ORDER
            .map(status => ({ status, count: cell.counts[status] }))
            .filter(e => e.count > 0);
    }

    cellTooltip(cell: BankDayCell): string {
        return this.cellBreakdown(cell).map(e => e.count + ' ' + this.statusLabel(e.status)).join(' · ');
    }

    formatKpiDelta(current: number, previous: number, higherIsBetter = true): { text: string; cls: string } {
        const diff = current - previous;
        if (!previous && !current) {
            return { text: '—', cls: 'stable' };
        }
        if (diff === 0) {
            return { text: this.t('EBQ.kpiStable'), cls: 'stable' };
        }
        const improved = higherIsBetter ? diff > 0 : diff < 0;
        return {
            text: this.t('EBQ.kpiDelta', { sign: diff > 0 ? '▲' : '▼', diff: (diff > 0 ? '+' : '') + diff }),
            cls: improved ? 'up' : 'down'
        };
    }

    get periodSubtitle(): string {
        const key = this.period === 'semaine' && this.weekFallbackToPrevious ? 'semaine_fallback' : this.period;
        const label = this.t('ETA.period.' + key) || this.t('ETA.period.semaine');
        return this.t('ETA.periodPrefix') + label;
    }

    get periodRangeLabel(): string {
        return this.rangeStart && this.rangeEnd
            ? `${this.displayDate(this.rangeStart)} – ${this.displayDate(this.rangeEnd)}`
            : '';
    }

    get refreshLabel(): string {
        if (!this.lastRefreshAt) {
            return this.t('ETA.refresh.loading');
        }
        const min = Math.max(0, Math.floor((Date.now() - this.lastRefreshAt.getTime()) / 60000));
        return min < 1 ? this.t('ETA.refresh.justNow') : this.t('ETA.refresh.minutes', { min });
    }

    displayDate(iso: string): string {
        const [y, m, d] = iso.split('-');
        return `${d}/${m}/${y}`;
    }

    trackByKey(_: number, row: BankAccountRow): string {
        return row.key;
    }

    trackByDate(_: number, d: { date: string }): string {
        return d.date;
    }

    trackByIndex(i: number): number {
        return i;
    }

    trackById(_: number, tab: { id: string }): string {
        return tab.id;
    }

    // ---------------------------------------------------------------- Détail d'une case

    openDetail(row: BankAccountRow, cell: BankDayCell | undefined): void {
        if (cell) {
            this.detail = { row, cell };
        }
    }

    closeDetail(): void {
        this.detail = null;
    }

    lineAmount(l: BankLine): number | null {
        const line = l.row;
        if (line.montant !== undefined && line.montant !== null) {
            return line.montant;
        }
        const credit = line.credit || 0;
        const debit = line.debit || 0;
        return credit || debit ? credit - debit : null;
    }

    openBanque(): void {
        this.router.navigate(['/banque']);
    }

    // ---------------------------------------------------------------- Export

    exportCsv(): void {
        const rows = this.filteredRows;
        if (!rows.length) {
            return;
        }
        const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;
        const header = [this.t('EBQ.col.account'), this.t('EBQ.col.accountNumber'), this.t('EBQ.col.bank'), this.t('LBL.countryLabel'),
            ...this.days.map(d => d.label)];
        const lines = [header.map(esc).join(';')];
        rows.forEach(r => {
            lines.push([
                r.label, r.code, r.banque, r.country,
                ...this.days.map(d => {
                    const c = r.days[d.date];
                    return c ? this.statusLabel(c.status) + (c.total > 1 ? ' (' + this.cellTooltip(c) + ')' : '') : '';
                })
            ].map(v => esc(String(v))).join(';'));
        });
        const blob = new Blob(['﻿' + lines.join('\n')], { type: 'text/csv;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `etat-reconciliation-bancaire-${formatLocalYmd(new Date())}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    }

    /** Exposé pour le gabarit : date comptable d'une ligne. */
    lineDate(line: ReleveBancaireRow): string {
        const iso = toIsoDate(line.dateComptable);
        return iso ? this.displayDate(iso) : '';
    }
}
