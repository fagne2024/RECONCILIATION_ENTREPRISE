import { Component, OnInit, OnDestroy, ViewChild, ElementRef } from '@angular/core';
import { Router, NavigationEnd } from '@angular/router';
import { catchError, filter, finalize, take } from 'rxjs/operators';
import { forkJoin, of, Subscription } from 'rxjs';
import { ServiceReferencesDashboardPanelComponent } from '../service-references/service-references-dashboard-panel.component';
import {
    DashboardService,
    DashboardMetrics,
    DetailedMetrics,
    TransactionCreatedStats,
    ServiceStat,
    ReleveManualRangeRow
} from '../../services/dashboard.service';
import { AppStateService } from '../../services/app-state.service';
import * as XLSX from 'xlsx';
import { ChartConfiguration } from 'chart.js';
import { AgencySummaryService } from '../../services/agency-summary.service';
import { OperationService } from '../../services/operation.service';
import { OperationBancaireService } from '../../services/operation-bancaire.service';
import { ReleveBancaireService } from '../../services/releve-bancaire.service';
import { OperationBancaire } from '../../models/operation-bancaire.model';
import { ReleveBancaireRow } from '../../models/releve-bancaire.model';
import { CompteService } from '../../services/compte.service';
import { DashboardReconciliationService, Result8RecData } from '../../services/dashboard-reconciliation.service';
import { TranslateService } from '@ngx-translate/core';
import { MatSelectModule } from '@angular/material/select';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatOptionModule } from '@angular/material/core';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { FormControl } from '@angular/forms';
import { Chart } from 'chart.js';
import ChartDataLabels from 'chartjs-plugin-datalabels';
import { MatSelect } from '@angular/material/select';
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
import { countriesMatch, countryDisplayLabel, countryNameFromCode, countryNamesFromCodes, normalizeCountryFilterOptions } from '../../utils/country-codes.util';

export type DashboardMetric = 'volume' | 'transactions' | 'revenu';

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

// Correction du type FilterOptions pour rendre 'banques' optionnel
interface FilterOptions {
  agencies: string[];
  services: string[];
  countries: string[];
  banques?: string[];
  timeFilters: string[];
}

// ——— Vue Banque du dashboard (réconciliation bancaire) ———
/** Taux de rapprochement d'une journée : lignes OK / total de la journée. */
interface BanqueDailyRate {
    date: string;
    ok: number;
    total: number;
    taux: number;
}

/** Origine d'un écart : nombre de lignes non rapprochées par source (banque / BO). */
interface BanqueOrigin {
    label: string;
    value: number;
}

/** Ligne du tableau « Relevés bancaires ». */
interface BanqueStatementRow {
    banque: string;
    releve: string;
    lignes: number;
    ok: number;
    taux: number;
    ecartNet: number;
}

/** Tranche d'ancienneté des lignes non rapprochées. */
interface BanqueAgingBucket {
    label: string;
    value: number;
}

/** Agrégats de la vue Banque, calculés côté client. */
interface BanqueDashboardStats {
    /** Écart net = somme des montants BO − somme des montants relevés. */
    ecartNet: number;
    totalBo: number;
    totalBanque: number;
    boTotal: number;
    boOk: number;
    revTotal: number;
    revOk: number;
    tauxGlobal: number;
    daily: BanqueDailyRate[];
    origins: BanqueOrigin[];
    statements: BanqueStatementRow[];
    aging: BanqueAgingBucket[];
}

@Component({
    selector: 'app-dashboard',
    templateUrl: './dashboard.component.html',
    styleUrls: ['./dashboard.component.scss'],
})
export class DashboardComponent implements OnInit, OnDestroy {
    public ChartDataLabels = ChartDataLabels;
    totalReconciliations: number = 0;
    totalFiles: number = 0;
    lastActivity: string = '';
    /** Date ISO renvoyée par l'API ; la mise en forme relative est faite ici. */
    lastActivityDate: string = '';
    todayReconciliations: number = 0;
    /** Réconciliations aujourd'hui : un seul enregistrement compté. */
    get todayReconciliationsDisplay(): number {
        return this.todayReconciliations || 0;
    }
    /** Fichiers traités : comptés 2 fois l'enregistrement. */
    get totalFilesDisplay(): number {
        return (this.totalFiles || 0) * 2;
    }
    loading: boolean = true;
    /** Actualisation manuelle en cours (bouton Actualiser). */
    refreshing = false;
    private dashboardMountedAt = Date.now();
    private lastNavigationRefreshAt = 0;
    private readonly navigationRefreshTTLMs = 30000;
    error: string | null = null;

    // Métriques détaillées
    detailedMetrics: DetailedMetrics | null = null;
    detailedLoading: boolean = false;
    detailedError: string | null = null;
    
    // Statistiques filtrées pour l'affichage
    filteredOperationStats: any[] = [];
    filteredFrequencyStats: any[] = [];

  trackByIndex = (index: number): number => index;

  trackByValue = (index: number, value: any): any => value;

  trackByDate = (index: number, item: { date?: string }): string => item?.date ?? String(index);

  trackByTitle = (index: number, item: { title?: string | null }): string => item?.title ?? String(index);

    // Statistiques des transactions créées
    transactionCreatedStats: TransactionCreatedStats | null = null;
    transactionCreatedLoading: boolean = false;
    transactionCreatedError: string | null = null;

    // Affichage section du bas (Transactions créées par service)
    showBottomSection: boolean = false;

    // Masquer / afficher les sections du dashboard (comme Transactions créées par service)
    showServiceRefSection: boolean = true;
    showReconciliationSection: boolean = true;
    showMetricsSection: boolean = true;
    showSummaryBarSection: boolean = true;
    showDetailedMetricsSection: boolean = true;

    // Filtre d'affichage du dashboard : transactions (affichage actuel) ou banque
    dashboardView: 'transaction' | 'banque' = 'transaction';

    // Vue Banque : données chargées à la première bascule (rafraîchie toutes les 60 s)
    banqueLoading = false;
    banqueError: string | null = null;
    banqueLoadedAt = 0;
    banqueStats: BanqueDashboardStats | null = null;
    banqueRateChartData: any = { labels: [], datasets: [] };
    banqueRateChartOptions: any = {};
    banqueOriginChartData: any = { labels: [], datasets: [] };
    banqueOriginChartOptions: any = {};

    // Filtre pays de la vue Banque ('' = tous les pays)
    banquePays = '';
    banquePaysOptions: string[] = [];
    private banqueAllOperations: OperationBancaire[] = [];
    private banqueAllReleves: ReleveBancaireRow[] = [];
    /** Noms de pays canônes utilisés pour déduire le pays d'un nom de banque. */
    private readonly banqueCountryNames = countryNamesFromCodes([
        'CM', 'CI', 'SN', 'BF', 'ML', 'BJ', 'NE', 'TD', 'TG', 'GA', 'GN', 'KE', 'MZ', 'NG',
        'CF', 'CG', 'CD', 'GQ', 'ST', 'AO', 'GW', 'SL', 'LR', 'GH', 'MR', 'GM', 'CV'
    ]);

    private readonly banqueOriginPalette = ['#388e3c', '#f59e0b', '#17a2b8', '#f57c00', '#7e57c2', '#455a64', '#c62828'];

    setDashboardView(view: 'transaction' | 'banque'): void {
        if (this.dashboardView === view) { return; }
        this.dashboardView = view;
        if (view === 'banque') {
            this.loadBanqueDashboard();
        }
    }

    /** Recharge la vue Banque (bouton Réessayer). */
    reloadBanqueDashboard(): void {
        this.banqueLoadedAt = 0;
        this.loadBanqueDashboard(true);
    }

    /** Plus grand bloc d'ancienneté, pour dimensionner les barres (0-100 %). */
    get banqueAgingMax(): number {
        const buckets = this.banqueStats ? this.banqueStats.aging : [];
        return Math.max(1, ...buckets.map(bucket => bucket.value));
    }

    /** Vrai si au moins une ligne non rapprochée existe dans l'un des tranches d'ancienneté. */
    get banqueHasAging(): boolean {
        const buckets = this.banqueStats ? this.banqueStats.aging : [];
        return buckets.some(bucket => bucket.value > 0);
    }

    /** Recalcule les agrégats de la vue Banque après changement de pays. */
    onBanquePaysChange(): void {
        if (!this.banqueAllOperations.length && !this.banqueAllReleves.length) { return; }
        this.applyBanqueFilters();
    }

    /** Applique le filtre pays aux données brutes, puis recalcule sections et graphiques. */
    private applyBanqueFilters(): void {
        const selected = (this.banquePays || '').trim();
        const operations = selected
            ? this.banqueAllOperations.filter(op => countriesMatch(this.banqueOpCountry(op), selected))
            : this.banqueAllOperations;
        const releves = selected
            ? this.banqueAllReleves.filter(row => countriesMatch(this.banqueReleveCountry((row as any).banque), selected))
            : this.banqueAllReleves;
        this.banqueStats = this.computeBanqueStats(operations, releves);
        this.refreshBanqueCharts();
    }

    /** Pays présents dans les données (opérations + relevés), normalisés et triés. */
    private buildBanquePaysOptions(): string[] {
        const labels: string[] = [];
        this.banqueAllOperations.forEach(op => {
            const label = this.banqueOpCountry(op);
            if (label) { labels.push(label); }
        });
        this.banqueAllReleves.forEach(row => {
            const label = this.banqueReleveCountry((row as any).banque);
            if (label) { labels.push(label); }
        });
        return normalizeCountryFilterOptions(labels);
    }

    /** Libellé pays canonique d'une opération BO (champ pays, sinon codePays). */
    private banqueOpCountry(op: OperationBancaire): string {
        const raw = ((op && op.pays) || '').toString().trim();
        const code = ((op && (op as any).codePays) || '').toString().trim();
        const value = raw || code;
        return value ? countryDisplayLabel(value) : '';
    }

    /** Libellé pays déduit d'un nom de banque (le relevé n'a pas de champ pays). */
    private banqueReleveCountry(banque?: string | null): string {
        const raw = (banque || '').toString().trim();
        if (!raw) { return ''; }
        const stripAccents = (value: string): string => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
        const normCompact = stripAccents(raw).replace(/[\s'\u2019-]+/g, '');
        // 1) nom de pays présent dans le libellé ("ORANGE MONEY CAMEROUN", "UGB Côte d'Ivoire")
        for (const name of this.banqueCountryNames) {
            const nameCompact = stripAccents(name).replace(/[\s'\u2019-]+/g, '');
            if (nameCompact && normCompact.indexOf(nameCompact) >= 0) { return name; }
        }
        // 2) code ISO sur un jeton du libellé (ex. "/CI", "-CM", "(BF)")
        const tokens = raw.split(/[^A-Za-z]+/).filter(token => token.length >= 2 && token.length <= 3);
        for (const token of tokens) {
            const name = countryNameFromCode(token);
            if (name) { return name; }
        }
        // 3) repli : dernières lettres interprétées comme un code pays
        const letters = raw.replace(/[^A-Za-z]/g, '');
        if (letters.length >= 2) {
            const name = countryNameFromCode(letters.slice(-2));
            if (name) { return name; }
        }
        return '';
    }

    private loadBanqueDashboard(force = false): void {
        const isFresh = this.banqueLoadedAt > 0 && (Date.now() - this.banqueLoadedAt) < 60000;
        if (this.banqueLoading || (this.banqueStats && isFresh && !force)) { return; }
        this.banqueLoading = true;
        this.banqueError = null;
        forkJoin({
            operations: this.operationBancaireService.getAllOperationsBancaires('BANQUE'),
            releves: this.releveBancaireService.list(undefined, 'BANQUE')
        })
            .pipe(finalize(() => { this.banqueLoading = false; }))
            .subscribe({
                next: ({ operations, releves }) => {
                    this.banqueAllOperations = Array.isArray(operations) ? operations : [];
                    this.banqueAllReleves = Array.isArray(releves) ? (releves as ReleveBancaireRow[]) : [];
                    this.banquePaysOptions = this.buildBanquePaysOptions();
                    // Le pays sélectionné n'existe plus ? Retomber sur « Tous les pays ».
                    if (this.banquePays && !this.banquePaysOptions.some(c => countriesMatch(c, this.banquePays))) {
                        this.banquePays = '';
                    }
                    this.banqueLoadedAt = Date.now();
                    this.applyBanqueFilters();
                },
                error: () => {
                    this.banqueStats = null;
                    this.banqueLoadedAt = 0;
                    this.banqueError = this.translate.instant('DASH.banqueLoadError');
                }
            });
    }

    /** Calcule les agrégats de la vue Banque à partir des opérations BO et des lignes de relevé. */
    private computeBanqueStats(operations: OperationBancaire[], releves: ReleveBancaireRow[]): BanqueDashboardStats {
        const isOk = (status?: string | null): boolean => status === 'OK';

        let totalBo = 0;
        let boOk = 0;
        let totalBanque = 0;
        let revOk = 0;

        const dailyMap = new Map<string, { ok: number; total: number }>();
        const originMap = new Map<string, number>();
        const statementMap = new Map<string, BanqueStatementRow>();
        const aging: BanqueAgingBucket[] = [
            { label: '0-7 j', value: 0 },
            { label: '8-30 j', value: 0 },
            { label: '31-90 j', value: 0 },
            { label: '> 90 j', value: 0 }
        ];

        const addDaily = (date: string, ok: boolean): void => {
            if (!date) { return; }
            const entry = dailyMap.get(date) || { ok: 0, total: 0 };
            entry.total++;
            if (ok) { entry.ok++; }
            dailyMap.set(date, entry);
        };
        const bumpOrigin = (label: string): void => {
            originMap.set(label, (originMap.get(label) || 0) + 1);
        };
        const bumpAging = (date: string): void => {
            if (!date) { return; }
            const age = this.banqueAgeDays(date);
            if (age <= 7) { aging[0].value++; }
            else if (age <= 30) { aging[1].value++; }
            else if (age <= 90) { aging[2].value++; }
            else { aging[3].value++; }
        };

        operations.forEach(op => {
            const montant = Number(op.montant) || 0;
            const ok = isOk(op.reconStatus);
            totalBo += montant;
            if (ok) { boOk++; }
            const date = this.banqueDateKey(op.dateOperation);
            addDaily(date, ok);
            if (!ok) {
                bumpOrigin(((op.bo || '').trim()) || this.translate.instant('DASH.banqueOriginBo'));
                bumpAging(date);
            }
        });

        releves.forEach(row => {
            const anyRow = row as any;
            const montant = Number(anyRow.montant) || 0;
            const ok = isOk(anyRow.reconStatus);
            totalBanque += montant;
            if (ok) { revOk++; }
            const date = this.banqueDateKey(anyRow.dateComptable || anyRow.dateValeur);
            addDaily(date, ok);
            if (!ok) {
                bumpOrigin(((anyRow.banque || '').trim()) || this.translate.instant('DASH.banqueOriginBank'));
                bumpAging(date);
            }
            const banque = ((anyRow.banque || '').trim()) || '—';
            const releveLabel = (anyRow.sourceFilename || anyRow.batchId || '').trim() || '—';
            const statementKey = banque + '||' + releveLabel;
            let statement = statementMap.get(statementKey);
            if (!statement) {
                statement = { banque, releve: releveLabel, lignes: 0, ok: 0, taux: 0, ecartNet: 0 };
                statementMap.set(statementKey, statement);
            }
            statement.lignes++;
            if (ok) { statement.ok++; }
            else { statement.ecartNet += montant; }
        });

        const statements = Array.from(statementMap.values());
        statements.forEach(statement => {
            statement.taux = statement.lignes ? (statement.ok / statement.lignes) * 100 : 0;
        });
        statements.sort((a, b) => b.lignes - a.lignes);

        const daily = Array.from(dailyMap.entries())
            .map(([date, value]) => ({
                date,
                ok: value.ok,
                total: value.total,
                taux: value.total ? (value.ok / value.total) * 100 : 0
            }))
            .sort((a, b) => (a.date < b.date ? 1 : -1))
            .slice(0, 14)
            .reverse();

        const originsSorted = Array.from(originMap.entries()).sort((a, b) => b[1] - a[1]);
        const origins: BanqueOrigin[] = originsSorted.slice(0, 6).map(([label, value]) => ({ label, value }));
        const rest = originsSorted.slice(6).reduce((sum, entry) => sum + entry[1], 0);
        if (rest > 0) {
            origins.push({ label: this.translate.instant('DASH.banqueOriginOther'), value: rest });
        }

        const totalLignes = operations.length + releves.length;
        const totalOk = boOk + revOk;
        return {
            ecartNet: totalBo - totalBanque,
            totalBo,
            totalBanque,
            boTotal: operations.length,
            boOk,
            revTotal: releves.length,
            revOk,
            tauxGlobal: totalLignes ? (totalOk / totalLignes) * 100 : 0,
            daily,
            origins,
            statements,
            aging
        };
    }

    /** Construit les configurations des graphiques (ligne + donut) de la vue Banque. */
    private refreshBanqueCharts(): void {
        const stats = this.banqueStats;
        if (!stats) {
            this.banqueRateChartData = { labels: [], datasets: [] };
            this.banqueOriginChartData = { labels: [], datasets: [] };
            return;
        }

        this.banqueRateChartData = {
            labels: stats.daily.map(day => day.date.slice(8, 10) + '/' + day.date.slice(5, 7)),
            datasets: [{
                label: '%',
                data: stats.daily.map(day => Math.round(day.taux * 10) / 10),
                borderColor: '#388e3c',
                backgroundColor: 'rgba(56, 142, 60, 0.25)',
                borderWidth: 2,
                fill: true,
                tension: 0.3,
                pointRadius: 3
            }]
        };
        this.banqueRateChartOptions = {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                title: { display: false },
                datalabels: { display: false }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    max: 100,
                    ticks: { callback: (value: any) => value + ' %' }
                }
            }
        };

        this.banqueOriginChartData = {
            labels: stats.origins.map(origin => origin.label),
            datasets: [{
                data: stats.origins.map(origin => origin.value),
                backgroundColor: stats.origins.map((origin, index) => this.banqueOriginPalette[index % this.banqueOriginPalette.length]),
                borderWidth: 1
            }]
        };
        this.banqueOriginChartOptions = {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { position: 'bottom' },
                title: { display: false },
                datalabels: { display: false }
            }
        };
    }

    /** Normalise une date (string ISO ou Date) en clé AAAA-MM-JJ, '' si illisible. */
    private banqueDateKey(value: any): string {
        if (!value) { return ''; }
        const raw = value instanceof Date ? value.toISOString() : String(value);
        const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
        if (match) { return match[1] + '-' + match[2] + '-' + match[3]; }
        const parsed = new Date(raw);
        if (isNaN(parsed.getTime())) { return ''; }
        return parsed.getFullYear() + '-' + this.banquePad(parsed.getMonth() + 1) + '-' + this.banquePad(parsed.getDate());
    }

    /** Âge en jours (0 minimum) d'une clé AAAA-MM-JJ par rapport à aujourd'hui. */
    private banqueAgeDays(dateKey: string): number {
        const parts = dateKey.split('-');
        if (parts.length !== 3) { return 0; }
        const date = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        return Math.max(0, Math.floor((today.getTime() - date.getTime()) / 86400000));
    }

    private banquePad(value: number): string {
        return value < 10 ? '0' + value : String(value);
    }

    // Modal pour afficher les graphiques en plein écran
    showGraphModal: boolean = false;

    // Modal pour accéder rapidement au relevé (statut des réconciliations)
    showReleveStatusModal: boolean = false;
    releveStatusCountry: string | null = null;
    releveStatusService: string | null = null;
    releveStatusCountries: string[] = [];
    releveStatusServices: string[] = [];
    releveStatusDate: string = '';
    releveStatusEnv: string = 'BET';
    /** Options ENV du popup relevé : même logique que vue semaine / statistiques (données result8rec). */
    releveStatusEnvSelectOptions: string[] = ['ALL', ...RECONCILIATION_ENV_OPTIONS];
    releveStatusError: string | null = null;
    private reconciliationCountryServices: { [country: string]: string[] } | null = null;
    /** Pays -> clé ENV stricte -> services (cloisonnement pour les listes déroulantes). */
    private reconciliationCountryEnvServices: { [country: string]: { [envKey: string]: string[] } } | null = null;

    // Résultat du contrôle de statut pour le relevé
    showReleveStatusResultModal: boolean = false;
    releveStatusResultLoading: boolean = false;
    releveStatusAllOk: boolean = false;
    releveStatusLines: Result8RecData[] = [];

    // Résumé "État des réconciliations" (bloc de gauche)
    reconciliationSummaryDate: string = ''; // utilisé pour initialiser, mais le calcul se fait sur "cette semaine"
    reconciliationSummaryEnv: string = 'BET';
    reconciliationSummaryCountry: string = '';
    reconciliationSummaryCountries: string[] = [];
    reconciliationSummaryService: string = '';
    reconciliationSummaryServices: string[] = [];
    readonly reconciliationEnvOptions: string[] = ['ALL', ...RECONCILIATION_ENV_OPTIONS];
    readonly recoValidatedStatusLabel = 'Reconciled';
    readonly recoValidatedStatusLabelPlural = 'Reconciled';
    readonly recoValidatedRateLabel = 'Reconciliation rate';
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
    readonly reconciliationPageSize: number = 3;
    private allReconciliationServices: string[] = [];

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
            title: { display: true, text: 'RÉPARTITION PAR STATUT' },
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
            title: { display: true, text: 'ÉVOLUTION PAR JOUR' },
            datalabels: { display: false }
        },
        scales: {
            x: { stacked: true },
            y: { stacked: true, beginAtZero: true }
        }
    };

    // Filtres
    selectedAgency: string[] = [];
    selectedService: string[] = [];
    selectedCountry: string[] = [];
    /** Période calendaire des graphiques / métriques détaillées / opérations (alignée sur la semaine en cours par défaut). */
    selectedTimeFilter: string = 'Cette semaine';
    startDate: string = '';
    endDate: string = '';
    showAllData: boolean = false; // Flag pour afficher toutes les données
    // selectedBanque: string = 'Tous'; // supprimé

    // Listes pour les filtres
    filterOptions: FilterOptions | null = null;
    showCustomDateInputs: boolean = false;

    // Graphique à barres
    barChartData: any = { labels: [], datasets: [] };
    barChartOptions: any = {
      responsive: true,
      plugins: {
        legend: { display: true, position: 'top' },
        title: { display: true, text: '' },
        datalabels: {
          font: { weight: 'bold' },
          color: 'black',
          formatter: (value: any, context: any) => {
            if (value == null || context?.dataset == null) {
              return '';
            }
            // Si le metric sélectionné est 'volume' ou 'revenu', formater sans décimales
            if (context && context.chart && context.chart.config && context.chart.config._config &&
                (context.chart.config._config.options?.plugins?.title?.text?.toLowerCase().includes('volume') ||
                 context.chart.config._config.options?.plugins?.title?.text?.toLowerCase().includes('revenu'))
            ) {
              return Number(value).toLocaleString('fr-FR', { maximumFractionDigits: 0 });
            }
            // Sinon, séparer les milliers mais garder la valeur telle quelle
            return Number(value).toLocaleString('fr-FR');
          }
        }
      },
      scales: {
        y: {
          beginAtZero: false,
          min: 1,
          type: 'logarithmic',
          ticks: {
            callback: function(value: number) {
              if (value === 1) return '1';
              if (value >= 1000000) return (value/1000000) + 'M';
              if (value >= 1000) return (value/1000) + 'k';
              return value;
            }
          }
        }
      }
    };

    /**
     * Filtre les types d'opérations à afficher sur les graphiques.
     * Exclut tous les types commençant par 'annulation_' sauf 'annulation_bo'.
     * Exclut également les ajustements, transactions créées, dépôts et versements.
     * @param typeOperation Le type d'opération à vérifier.
     * @returns `true` si le type doit être inclus, `false` sinon.
     */
    private shouldIncludeOperation(typeOperation: string | null | undefined): boolean {
        if (!typeOperation) {
            return true; // Inclure par défaut si le type est manquant
        }
        const lowerCaseType = typeOperation.toLowerCase();
        
        // Exclure les annulations sauf annulation_bo
        if (lowerCaseType.startsWith('annulation_')) {
            return lowerCaseType === 'annulation_bo';
        }
        
        // Exclure les ajustements, transactions créées, dépôts, versements et virements
        if (lowerCaseType === 'ajustement' || 
            lowerCaseType === 'transaction_cree' ||
            lowerCaseType === 'depot' ||
            lowerCaseType === 'dépôt' ||
            lowerCaseType === 'versement' ||
            lowerCaseType === 'virement') {
            return false;
        }
        
        return true;
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
            return 'Not reconciled';
        }
        if (day.status === 'EN_COURS') {
            switch (day.traitementKind) {
                case 'group':
                    return 'Closing in progress';
                case 'cdo':
                    return 'Validation in progress';
                case 'support':
                    return 'Processing';
                default:
                    return 'In progress...';
            }
        }
        return 'Not reconciled';
    }

    private updateVisibleDaysWindow() {
        if (!this.weekDays || this.weekDays.length === 0) {
            this.visibleWeekDays = [];
            this.visibleDayIndices = [];
            return;
        }

        // On utilise J-1 comme jour de référence pour la fenêtre de 3 jours
        const reference = new Date();
        reference.setDate(reference.getDate() - 1);
        const y = reference.getFullYear();
        const m = (reference.getMonth() + 1).toString().padStart(2, '0');
        const d = reference.getDate().toString().padStart(2, '0');
        const refDateStr = `${y}-${m}-${d}`;

        let endIndex = this.weekDays.findIndex(day => day.date === refDateStr);

        if (endIndex === -1) {
            // Si le jour de référence n'est pas dans la semaine (cas extrême),
            // on prend simplement les 3 derniers jours de la semaine.
            endIndex = this.weekDays.length - 1;
        }

        // La fenêtre doit contenir 3 jours maximum, en terminant par endIndex
        const startIndex = Math.max(0, endIndex - 2);
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
                'Processing',
                'Validation in progress',
                'Closing in progress',
                'Not reconciled'
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
                { label: 'Processing', data: evolution.enCoursSupport, backgroundColor: c.enCoursSupport, stack: 'stack1' },
                { label: 'Validation in progress', data: evolution.enCoursCdo, backgroundColor: c.enCoursCdo, stack: 'stack1' },
                { label: 'Closing in progress', data: evolution.enCoursGroup, backgroundColor: c.enCoursGroup, stack: 'stack1' },
                { label: 'Not reconciled', data: evolution.nonReco, backgroundColor: c.nonReco, stack: 'stack1' }
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
        const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
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

    lineChartOptions: any = {
      responsive: true,
      plugins: {
        legend: { display: true, position: 'top' },
        title: { display: true, text: '' },
        datalabels: { display: false } // Empêche l'affichage des valeurs sur les courbes
      },
      elements: {
        line: {
          tension: 0.4, // Lignes plus fluides
          borderJoinStyle: 'round',
          spanGaps: true // Relie tous les points même avec des données manquantes
        },
        point: {
          radius: 4,
          hoverRadius: 6,
          hoverBorderWidth: 2
        }
      },
      scales: {
        y: {
          type: 'logarithmic',
          beginAtZero: true,
          min: 1,
          ticks: {
            callback: function(value: number) {
              if (value === 1) return '1';
              if (value >= 1000000) return (value/1000000) + 'M';
              if (value >= 1000) return (value/1000) + 'k';
              return value;
            }
          }
        }
      }
    };
    selectedMetric: DashboardMetric = 'volume';
    agencySummaryData: any[] = [];
    allOperations: any[] = [];
    selectedChartType: 'bar' | 'line' = 'bar';
    lineChartData: any = { labels: [], datasets: [] };
    // Supprimer toute gestion de lineChartPlugins et ChartDataLabels pour les courbes

    totalVolume: number = 0;
    totalTransactions: number = 0;
    totalClients: number = 0;

    // Période pour les métriques rapides (semaine, mois, trimestre, semestre, annee)
    metricsPeriod: 'jour' | 'semaine' | 'semaine_passee' | '7_jours' | '30_jours' | 'mois' | 'trimestre' | 'semestre' | 'annee' = 'semaine';

    // Soldes par compte pour la bande défilante
    accountBalances: Array<{accountName: string, countryCode: string, balance: number, flag: string}> = [];
    bannerTitle: string = '💰 Soldes des comptes clients';

    // Ajout d'une fonction utilitaire pour filtrer par période
    private filterByPeriod<T extends { date?: string; dateOperation?: string }>(data: T[]): T[] {
      // Si showAllData est activé, retourner toutes les données sans filtre
      if (this.showAllData) {
        return data;
      }
      
      const today = new Date();
      let start: Date | null = null;
      let end: Date | null = null;

      if (this.selectedTimeFilter === 'Aujourd\'hui') {
        // "Aujourd'hui" doit être considéré comme j-1 (hier)
        const yesterday = new Date(today);
        yesterday.setDate(today.getDate() - 1);
        start = new Date(yesterday.getFullYear(), yesterday.getMonth(), yesterday.getDate());
        end = new Date(yesterday.getFullYear(), yesterday.getMonth(), yesterday.getDate() + 1);
      } else if (this.selectedTimeFilter === 'Cette semaine') {
        // Trouver le lundi de la semaine en cours
        const currentDay = today.getDay(); // 0 (dimanche) à 6 (samedi)
        const diffToMonday = (currentDay === 0 ? -6 : 1) - currentDay;
        start = new Date(today);
        start.setDate(today.getDate() + diffToMonday);
        start.setHours(0, 0, 0, 0);
        end = new Date(start);
        end.setDate(start.getDate() + 7);
      } else if (this.selectedTimeFilter === 'Ce mois') {
        start = new Date(today.getFullYear(), today.getMonth(), 1);
        end = new Date(today.getFullYear(), today.getMonth() + 1, 1);
      } else if (this.selectedTimeFilter === 'Mois passé') {
        const lastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
        const lastMonthEnd = new Date(today.getFullYear(), today.getMonth(), 0);
        start = new Date(lastMonth.getFullYear(), lastMonth.getMonth(), 1);
        end = new Date(lastMonthEnd.getFullYear(), lastMonthEnd.getMonth() + 1, 1);
      } else if (this.selectedTimeFilter === 'Cette année') {
        start = new Date(today.getFullYear(), 0, 1); // 1er janvier de cette année
        end = new Date(today.getFullYear(), 11, 31); // 31 décembre de cette année
      } else if (this.selectedTimeFilter === 'Année dernière') {
        start = new Date(today.getFullYear() - 1, 0, 1); // 1er janvier de l'année dernière
        end = new Date(today.getFullYear() - 1, 11, 31); // 31 décembre de l'année dernière
      } else if (this.selectedTimeFilter === 'Personnalisé' && this.startDate && this.endDate) {
        start = new Date(this.startDate);
        start.setHours(0, 0, 0, 0);
        end = new Date(this.endDate);
        end.setHours(0, 0, 0, 0);
        end.setDate(end.getDate() + 1); // inclure la date de fin
      }

      if (!start || !end) {
        return data;
      }
      
      // Normaliser toutes les dates de début et de fin à minuit pour une comparaison cohérente
      if (start) {
        start.setHours(0, 0, 0, 0);
      }
      if (end) {
        end.setHours(0, 0, 0, 0);
      }

      return data.filter((item: any) => {
        const dateStr = item.date || item.dateOperation;
        if (!dateStr) return false;
        
        const dateOnly = dateStr.split('T')[0];
        const [year, month, day] = dateOnly.split('-').map(Number);
        const date = new Date(year, month - 1, day);
        date.setHours(0, 0, 0, 0);
        
        const normalizedStart = new Date(start!);
        normalizedStart.setHours(0, 0, 0, 0);
        const normalizedEnd = new Date(end!);
        normalizedEnd.setHours(0, 0, 0, 0);
        
        return date >= normalizedStart && date < normalizedEnd;
      });
    }

    updateBarChartData() {
      // Palette de couleurs standard (10 couleurs)
      const colorList = [
        '#1976d2', '#388e3c', '#fbc02d', '#d32f2f', '#7b1fa2',
        '#0288d1', '#c2185b', '#ffa000', '#388e3c', '#455a64'
      ];
      // Fonction pour générer une couleur aléatoire
      const randomColor = () => '#' + Math.floor(Math.random()*16777215).toString(16).padStart(6, '0');
      // Les données sont déjà filtrées lors du chargement
      const agencySummaryFiltered = this.agencySummaryData;
      const operationsFiltered = this.allOperations;
      const normalize = (str: string) => (str || '').toLowerCase().normalize('NFD').replace(/[ \u0300-\u036f]/g, '');

      if (this.selectedMetric === 'transactions') {
        // Bar chart : répartition par service
        const excludedTypes = ['annulation_bo', 'ajustement', 'transaction_cree', 'depot', 'dépôt', 'versement', 'virement'];
        // On filtre explicitement par agence (client) sélectionnée pour la courbe
        let filteredAgencySummary = agencySummaryFiltered
            .filter(s => !excludedTypes.includes((s.typeOperation || '').toLowerCase()))
            .filter(s => this.shouldIncludeOperation(s.typeOperation));

        if (this.selectedAgency && this.selectedAgency.length > 0) {
          filteredAgencySummary = filteredAgencySummary.filter(s => this.selectedAgency.map(normalize).includes(normalize(s.agency)));
        }
        const aggregation: { [service: string]: number } = {};
        filteredAgencySummary.forEach((s: any) => {
          if (!aggregation[s.service]) aggregation[s.service] = 0;
          aggregation[s.service] += Number(s.recordCount) || 0;
        });
        const barLabels = Object.keys(aggregation);
        // Couleurs : palette standard
        const barColors = barLabels.map((label, idx) => colorList[idx % colorList.length]);
        // Correction : un dataset par service
        const barDatasets = barLabels.map((label, idx) => ({
          label: label,
          data: [aggregation[label]],
          backgroundColor: barColors[idx],
          borderRadius: 6
        }));
        // Sans datasets, ne pas garder labels: [''] — sinon ChartDataLabels plante (afterDatasetsDraw / _labels).
        this.barChartData =
          barDatasets.length > 0
            ? { labels: [''], datasets: barDatasets }
            : { labels: [], datasets: [] };
        this.barChartOptions.plugins.legend.display = true;
        this.barChartOptions.plugins.title.text = "Nombre de transactions par service (toutes agences)";

        // Line chart : évolution par service et par date (filtrée par agence)
        const allServices = Array.from(new Set(filteredAgencySummary.map(s => s.service)));
        const allDates = Array.from(new Set(filteredAgencySummary.map(s => s.date))).sort();
        const datasets = allServices.map((service, idx) => {
          const data = allDates.map(date => {
            const found = filteredAgencySummary.find(s => s.service === service && s.date === date);
            return found ? Number(found.recordCount) : 0;
          });
          const color = colorList[idx % colorList.length];
          return {
            data,
            label: service,
            borderColor: color,
            backgroundColor: color + '33', // couleur semi-transparente
            fill: true,
            tension: 0.4,
            spanGaps: true, // Relie tous les points même avec des données manquantes
            pointRadius: 4,
            pointBackgroundColor: color,
            pointBorderColor: color,
            borderWidth: 2
          };
        });
        this.lineChartData = {
          labels: allDates,
          datasets
        };
        return;
      } else if (this.selectedMetric === 'revenu') {
        // Bar chart : volume des frais par service (tous les FRAIS_TRANSACTION, crédit et débit)
        const excludedTypes = ['annulation_bo', 'ajustement', 'transaction_cree', 'depot', 'dépôt', 'versement', 'virement'];
        let filteredOperations = operationsFiltered
            .filter(op => !excludedTypes.includes((op.typeOperation || '').toLowerCase()))
            .filter(op => this.shouldIncludeOperation(op.typeOperation));

        filteredOperations = filteredOperations.filter(op => !excludedTypes.includes((op.typeOperation || '').toLowerCase()));
        const normalize = (str: string) => (str || '').toLowerCase().normalize('NFD').replace(/[ \u0300-\u036f]/g, '');
        let allServices = Array.from(new Set(filteredOperations
          .filter((op: any) => (op.typeOperation || '').toLowerCase() === 'frais_transaction' && op.service)
          .map((op: any) => op.service)));
        if (this.selectedService && this.selectedService.length > 0) {
          const normalizedSelected = this.selectedService.map(normalize);
          allServices = allServices.filter(s => normalizedSelected.includes(normalize(s)));
        }
        // Bar chart : somme des montants par service
        const aggregation: { [service: string]: number } = {};
        filteredOperations.forEach((op: any) => {
          if ((op.typeOperation || '').toLowerCase() === 'frais_transaction' && op.service) {
            if (!aggregation[op.service]) aggregation[op.service] = 0;
            aggregation[op.service] += Number(op.montant) || 0;
          }
        });
        const barLabels = Object.keys(aggregation);
        const barColors = barLabels.map((label, idx) => colorList[idx % colorList.length]);
        const barDatasets = barLabels.map((label, idx) => ({
          label: label,
          data: [aggregation[label]],
          backgroundColor: barColors[idx],
          borderRadius: 6
        }));
        this.barChartData =
          barDatasets.length > 0
            ? { labels: [''], datasets: barDatasets }
            : { labels: [], datasets: [] };
        this.barChartOptions.plugins.legend.display = true;
        this.barChartOptions.plugins.title.text = "Volume des revenus (frais) par service";

        // Line chart : évolution du volume des revenus par service et par date
        const allServicesLine = Array.from(new Set(filteredOperations
          .filter((op: any) => (op.typeOperation || '').toLowerCase() === 'frais_transaction' && op.service)
          .map((op: any) => op.service)));
        const allDatesLine = Array.from(new Set(filteredOperations
          .filter((op: any) => (op.typeOperation || '').toLowerCase() === 'frais_transaction' && op.dateOperation)
          .map((op: any) => op.dateOperation.split('T')[0]))).sort();
        const datasetsLine = allServicesLine.map((service: string, idx: number) => {
          const data = allDatesLine.map((date: string) => {
            // Somme des montants pour ce service et cette date
            return filteredOperations
              .filter((op: any) => op.service === service && (op.typeOperation || '').toLowerCase() === 'frais_transaction' && op.dateOperation && op.dateOperation.split('T')[0] === date)
              .reduce((sum, op) => sum + Number(op.montant), 0);
          });
          const color = colorList[idx % colorList.length];
          return {
            data,
            label: service,
            borderColor: color,
            backgroundColor: color + '33',
            fill: true,
            tension: 0.4,
            spanGaps: true, // Relie tous les points même avec des données manquantes
            pointRadius: 4,
            pointBackgroundColor: color,
            pointBorderColor: color,
            borderWidth: 2
          };
        });
        this.lineChartData = {
          labels: allDatesLine,
          datasets: datasetsLine
        };
        return;
      } else if (this.selectedMetric === 'volume') {
        // Bar chart : volume total par type d'opération
        if (!this.detailedMetrics?.operationStats) {
            this.barChartData = { labels: [], datasets: [] };
            this.lineChartData = { labels: [], datasets: [] };
            return;
        }
        const excludedTypes2 = ['annulation_bo', 'ajustement', 'transaction_cree', 'depot', 'dépôt', 'versement', 'virement'];
        let filteredOperations = operationsFiltered
            .filter(op => !excludedTypes2.includes((op.typeOperation || '').toLowerCase()))
            .filter(op => this.shouldIncludeOperation(op.typeOperation));
            
        // Correction : appliquer le filtre service si sélectionné
        if (this.selectedService && this.selectedService.length > 0) {
          const normalize = (str: string) => (str || '').toLowerCase().normalize('NFD').replace(/[ \u0300-\u036f]/g, '');
          const normalizedSelected = this.selectedService.map(normalize);
          filteredOperations = filteredOperations.filter(op => op.service && normalizedSelected.includes(normalize(op.service)));
        }
        // On n'applique plus de filtrage par client ici
        const filteredStats = this.detailedMetrics.operationStats
            .filter(s => !excludedTypes2.includes((s.operationType || '').toLowerCase()))
            .filter(s => this.shouldIncludeOperation(s.operationType));

        // Correction : chaque type devient un dataset distinct, mais sur les opérations filtrées
        const allTypes = Array.from(new Set(filteredOperations.map((op: any) => op.typeOperation)));
        const allDates = Array.from(new Set(filteredOperations
          .filter((op: any) => op.dateOperation)
          .map((op: any) => op.dateOperation.split('T')[0]))).sort();
        const barDatasets = allTypes.map((type: string, idx: number) => ({
          label: type ? type : '(Type inconnu)',
          data: [filteredOperations
            .filter((op: any) => op.typeOperation === type)
            .reduce((sum, op) => sum + Number(op.montant), 0)
          ],
          backgroundColor: colorList[idx % colorList.length],
          borderRadius: 6
        }));
        this.barChartData =
          barDatasets.length > 0
            ? { labels: [''], datasets: barDatasets }
            : { labels: [], datasets: [] };
        this.barChartOptions.plugins.legend.display = true;
        this.barChartOptions.plugins.title.text = "Volume total par type d'opération";

        // Line chart : évolution du volume total par type d'opération et par date
        const datasets = allTypes.map((type, idx) => {
          const data = allDates.map(date => {
            // Correction : somme de tous les montants pour ce type et cette date, sur les opérations filtrées
            return filteredOperations
              .filter(op => op.typeOperation === type && op.dateOperation && op.dateOperation.split('T')[0] === date)
              .reduce((sum, op) => sum + Number(op.montant), 0);
          });
          const color = colorList[idx % colorList.length];
          return {
            data,
            label: type,
            borderColor: color,
            backgroundColor: color + '33',
            fill: true,
            tension: 0.4,
            spanGaps: true, // Relie tous les points même avec des données manquantes
            pointRadius: 4,
            pointBackgroundColor: color,
            pointBorderColor: color,
            borderWidth: 2
          };
        });
        this.lineChartData = {
          labels: allDates,
          datasets
        };
        return;
      }
    }

    private routerSubscription: Subscription = new Subscription();
    private dataUpdateSubscription: Subscription = new Subscription();

    agenceSearchCtrl = new FormControl('');
    serviceSearchCtrl = new FormControl('');
    paysSearchCtrl = new FormControl('');
    filteredAgencies: string[] = [];
    filteredServices: string[] = [];
    filteredCountries: string[] = [];
    // filteredBanques: string[] = []; // supprimé

    @ViewChild('agencySelect') agencySelect!: MatSelect;
    @ViewChild('serviceSelect') serviceSelect!: MatSelect;
    @ViewChild('countrySelect') countrySelect!: MatSelect;
    @ViewChild('serviceRefPanel') serviceRefPanel?: ServiceReferencesDashboardPanelComponent;

    // SUPPRIMER testMulti et testOptions

    // Ajout des compteurs pour la barre récapitulative
    get totalClientsCount(): number {
      return (this.filteredAgencies?.filter(a => a !== 'Tous').length) || 0;
    }
    get totalServicesCount(): number {
      return (this.filteredServices?.filter(s => s !== 'Tous').length) || 0;
    }
    get totalCountriesCount(): number {
      return (this.filteredCountries?.filter(p => p !== 'Tous').length) || 0;
    }

    constructor(
        private router: Router,
        private dashboardService: DashboardService,
        private appStateService: AppStateService,
        private agencySummaryService: AgencySummaryService,
        private operationService: OperationService,
        private compteService: CompteService,
        private dashboardReconciliationService: DashboardReconciliationService,
        private operationBancaireService: OperationBancaireService,
        private releveBancaireService: ReleveBancaireService,
        private translate: TranslateService
    ) {}

    /**
     * Ouvre le popup "Voir le statut des réconciliations"
     */
    /** Ouvre la page Références services en mode dashboard (liste réconciliables / non réconciliables). */
    openServiceReferencesDashboard(): void {
        this.router
            .navigate(['/service-references'], { queryParams: { dashboard: '1' } })
            .catch(() => {});
    }

    openReleveStatusModal(): void {
        this.releveStatusError = null;
        this.releveStatusCountry = this.releveStatusCountries && this.releveStatusCountries.length ? this.releveStatusCountries[0] : null;
        this.releveStatusService = null;
        this.releveStatusDate = '';
        this.releveStatusEnv = 'BET';
        this.showReleveStatusModal = true;
        // Mettre à jour la liste des services disponibles selon le pays pré-sélectionné
        if (this.releveStatusCountry) {
            this.updateReleveStatusServices();
        }
    }

    /** Quand l’ENV change dans le popup relevé, recalculer les services cloisonnés. */
    onReleveStatusEnvChange(): void {
        this.updateReleveStatusServices();
    }

    /**
     * Ferme le popup de statut des réconciliations
     */
    closeReleveStatusModal(): void {
        this.showReleveStatusModal = false;
    }

    /**
     * Met à jour ENV + services du popup relevé depuis result8rec (pays, date optionnelle, cloisonnement strict ENV),
     * comme les modales Vue semaine et Statistiques réconciliation.
     */
    updateReleveStatusServices(): void {
        this.refreshReleveStatusEnvAndServices();
    }

    /** Après changement de date : réduit les ENV / services aux lignes de ce jour pour le pays choisi. */
    onReleveStatusDateChange(): void {
        this.refreshReleveStatusEnvAndServices();
    }

    private refreshReleveStatusEnvAndServices(): void {
        if (!this.releveStatusCountry) {
            this.releveStatusEnvSelectOptions = ['ALL', ...RECONCILIATION_ENV_OPTIONS];
            this.releveStatusServices = [];
            if (this.releveStatusService) {
                this.releveStatusService = null;
            }
            return;
        }

        const country = this.releveStatusCountry!;
        const dateOnly = (this.releveStatusDate || '').trim();
        const request$ = dateOnly
            ? this.dashboardReconciliationService.getResult8RecDataForDate(dateOnly, 'Dashboard')
            : this.dashboardReconciliationService.getResult8RecDataScoped(undefined, undefined, 'Dashboard');

        request$
            .pipe(take(1))
            .subscribe({
                next: data => {
                    const rowsForScope = (data || []).filter(item => {
                        if (!item.country || !countriesMatch(item.country, country)) {
                            return false;
                        }
                        if (!dateOnly) {
                            return true;
                        }
                        const itemDateStr = this.extractResult8DateOnly(item.date);
                        return itemDateStr === dateOnly;
                    });

                    this.releveStatusEnvSelectOptions = this.buildRecoViewEnvSelectOptions(rowsForScope);
                    if (!this.releveStatusEnvSelectOptions.includes(this.releveStatusEnv)) {
                        this.releveStatusEnv = 'ALL';
                    }

                    const targetEnv = (this.releveStatusEnv || 'ALL').trim() || 'ALL';
                    const servicesSet = new Set<string>();
                    rowsForScope.forEach(item => {
                        if (!item.service) {
                            return;
                        }
                        if (!this.matchesReconciliationEnvStrict(this.getResult8RecItemEnv(item), targetEnv)) {
                            return;
                        }
                        const upper = item.service.toUpperCase();
                        if (upper.startsWith('AUCAT')) {
                            return;
                        }
                        servicesSet.add(item.service);
                    });

                    this.releveStatusServices = Array.from(servicesSet).sort();
                    if (this.releveStatusService && !this.releveStatusServices.includes(this.releveStatusService)) {
                        this.releveStatusService = null;
                    }
                },
                error: err => {
                    console.error('Erreur refresh options relevé statut (result8rec):', err);
                    this.updateReleveStatusServicesFallback();
                }
            });
    }

    /** Secours si result8rec indisponible (ancienne logique filtres / pays). */
    private updateReleveStatusServicesFallback(): void {
        if (!this.releveStatusCountry) {
            return;
        }
        const servicesSet = new Set<string>();
        const country = this.releveStatusCountry;
        const env = (this.releveStatusEnv || 'ALL').trim() || 'ALL';
        const perEnv = this.reconciliationCountryEnvServices?.[country];

        const addSvc = (s: string) => {
            if (!s || typeof s !== 'string') return;
            const upper = s.toUpperCase();
            if (upper.startsWith('AUCAT')) return;
            servicesSet.add(s);
        };

        if (perEnv && Object.keys(perEnv).length > 0) {
            if (env !== 'ALL') {
                const envKey = this.reconciliationEnvStrictKey(env);
                (perEnv[envKey] || []).forEach(addSvc);
            } else {
                Object.values(perEnv).forEach(arr => (arr || []).forEach(addSvc));
            }
        }

        if (servicesSet.size === 0 && this.reconciliationCountryServices && this.reconciliationCountryServices[country]) {
            this.reconciliationCountryServices[country].forEach(addSvc);
        } else if (servicesSet.size === 0 && this.filterOptions?.services) {
            this.filterOptions.services.forEach(addSvc);
        }

        this.releveStatusServices = Array.from(servicesSet).sort();
        if (this.releveStatusService && !this.releveStatusServices.includes(this.releveStatusService)) {
            this.releveStatusService = null;
        }
    }

    /**
     * Valide les critères saisis et redirige vers la page de rapport
     * avec les paramètres nécessaires pour ouvrir directement le relevé.
     */
    confirmReleveStatus(): void {
        this.releveStatusError = null;

        if (!this.releveStatusCountry || !this.releveStatusService || !this.releveStatusDate) {
            this.releveStatusError = 'Veuillez sélectionner le pays, le service et la date.';
            return;
        }

        const env = this.releveStatusEnv || 'ALL';

        this.showReleveStatusModal = false;

        // Lancer le contrôle des statuts pour ce pays/service/date
        this.checkReleveStatusInDashboard(env);
    }

    /**
     * Vérifie, pour le pays / service / date choisis, si toutes les lignes
     * result8rec sont à statut OK. Si oui, affiche un mini-relevé dans un popup,
     * sinon affiche un message "Réconciliation en cours".
     */
    private checkReleveStatusInDashboard(env: string): void {
        this.releveStatusResultLoading = true;
        this.showReleveStatusResultModal = true;
        this.releveStatusAllOk = false;
        this.releveStatusLines = [];

        this.dashboardReconciliationService.getResult8RecDataForDate(this.releveStatusDate!, 'Dashboard')
            .pipe(take(1))
            .subscribe({
                next: (data) => {
                    const targetCountry = this.releveStatusCountry!;
                    const targetService = this.releveStatusService!;
                    const targetDateStr = this.releveStatusDate!;
                    const targetEnv = env || 'ALL';

                    const targetDate = new Date(targetDateStr);
                    targetDate.setHours(0, 0, 0, 0);

                    const matching = (data || []).filter(item => {
                        if (!item.country || !item.service || !item.date) return false;
                        if (!countriesMatch(item.country, targetCountry)) return false;
                        if (item.service !== targetService) return false;
                        if (!this.matchesReconciliationEnvStrict(this.getResult8RecItemEnv(item), targetEnv)) {
                            return false;
                        }

                        const itemDateStr = (item.date || '').split(' ')[0];
                        const itemDate = new Date(itemDateStr);
                        if (isNaN(itemDate.getTime())) return false;
                        itemDate.setHours(0, 0, 0, 0);

                        return itemDate.getTime() === targetDate.getTime();
                    });

                    this.releveStatusLines = matching;

                    if (!matching.length) {
                        this.releveStatusAllOk = false;
                    } else {
                        const allOk = matching.every(
                            line => (line.status || '').trim().toUpperCase() === 'OK'
                        );
                        this.releveStatusAllOk = allOk;
                    }

                    this.releveStatusResultLoading = false;
                },
                error: (err) => {
                    console.error('Erreur lors du chargement des données result8rec pour le relevé:', err);
                    this.releveStatusLines = [];
                    this.releveStatusAllOk = false;
                    this.releveStatusResultLoading = false;
                }
            });
    }

    getReleveStatusTotalTransactions(): number {
        if (!this.releveStatusLines || !this.releveStatusLines.length) {
            return 0;
        }
        return this.releveStatusLines
            .map(l => l.totalTransactions || 0)
            .reduce((sum, v) => sum + v, 0);
    }

    getReleveStatusTotalVolume(): number {
        if (!this.releveStatusLines || !this.releveStatusLines.length) {
            return 0;
        }
        return this.releveStatusLines
            .map(l => l.totalVolume || 0)
            .reduce((sum, v) => sum + v, 0);
    }

    /**
     * Ouvre la page de rapport détaillé pour le pays / service / date choisis,
     * avec ouverture directe du relevé de service.
     */
    openReleveDetail(): void {
        if (!this.releveStatusCountry || !this.releveStatusService || !this.releveStatusDate) {
            return;
        }
        const env = this.releveStatusEnv || 'ALL';
        this.showReleveStatusResultModal = false;
        this.router.navigate(['/reconciliation-report'], {
            queryParams: {
                country: this.releveStatusCountry,
                service: this.releveStatusService,
                date: this.releveStatusDate,
                env,
                openReleve: '1'
            }
        });
    }

    ngOnInit() {
        this.loadDashboardData();
        if (!this.reconciliationSummaryEnv) {
            this.reconciliationSummaryEnv = 'BET';
        }
        this.loadReconciliationSummary();
        this.loadFilterOptions();
        this.loadAgencySummaryData();
        this.loadAllOperations();
        
        // Charger les métriques détaillées après un court délai pour s'assurer que les autres données sont chargées
        setTimeout(() => {
            this.loadDetailedMetrics();
            this.loadTransactionCreatedStats();
        }, 500);
        
        // Écouter les changements de route pour recharger les données quand on revient sur le dashboard
        this.routerSubscription = this.router.events.pipe(
            filter(event => event instanceof NavigationEnd)
        ).subscribe((event) => {
            if (event instanceof NavigationEnd) {
                const path = (event.urlAfterRedirects || event.url || '').split('?')[0];
                if (path === '/' || path === '/dashboard') {
                    // Évite un double chargement juste après l'initialisation du composant
                    if (Date.now() - this.dashboardMountedAt < 1500) {
                        return;
                    }
                    // Évite de refetch tout le dashboard à chaque navigation aller-retour (TTL 30s)
                    const navigationTime = Date.now();
                    if (navigationTime - this.lastNavigationRefreshAt < this.navigationRefreshTTLMs) {
                        return;
                    }
                    this.lastNavigationRefreshAt = navigationTime;
                    this.refreshMetrics();
                }
            }
        });

        // Écouter les notifications de mise à jour de données
        this.dataUpdateSubscription = this.appStateService.dataUpdate$.subscribe(needsUpdate => {
            if (needsUpdate) {
                this.refreshMetrics();
                // Marquer que les données ont été rafraîchies
                this.appStateService.markDataRefreshed();
            }
        });

        // Gestionnaire de clic global pour fermer les dropdowns
        document.addEventListener('click', this.handleGlobalClick.bind(this));

        const normalize = (str: string) => (str || '').toLowerCase().normalize('NFD').replace(/[ \u0300-\u036f]/g, '');
        this.agenceSearchCtrl.valueChanges.subscribe(search => {
          const s = (search || '');
          const availableAgencies = this.getFilteredAgencies();
          this.filteredAgencies = availableAgencies.filter(a => normalize(a).includes(normalize(s)));
        });
        this.serviceSearchCtrl.valueChanges.subscribe(search => {
          const s = (search || '').toLowerCase();
          const availableServices = this.getFilteredServices();
          this.filteredServices = availableServices.filter(a => a.toLowerCase().includes(s));
        });
        this.paysSearchCtrl.valueChanges.subscribe(search => {
          const s = (search || '').toLowerCase();
          const availableCountries = this.getFilteredCountries();
          this.filteredCountries = availableCountries.filter(a => a.toLowerCase().includes(s));
        });

        // Sélection automatique agence si un seul résultat dans la recherche
        this.agenceSearchCtrl.valueChanges.subscribe((search: string | null) => {
            const availableAgencies = this.getFilteredAgencies();
            const filtered = availableAgencies.filter(agency =>
                agency.toLowerCase().includes((search || '').toLowerCase())
            );
            // Si un seul résultat et qu'il n'est pas déjà sélectionné
            if (filtered.length === 1 && !this.selectedAgency.includes(filtered[0])) {
                this.selectedAgency = [filtered[0]];
                if (this.agencySelect) { this.agencySelect.close(); }
                this.onFilterChange();
            }
        });
        // Sélection automatique service si un seul résultat dans la recherche
        this.serviceSearchCtrl.valueChanges.subscribe((search: string | null) => {
            const availableServices = this.getFilteredServices();
            const filtered = availableServices.filter(service =>
                service.toLowerCase().includes((search || '').toLowerCase())
            );
            if (filtered.length === 1 && !this.selectedService.includes(filtered[0])) {
                this.selectedService = [filtered[0]];
                if (this.serviceSelect) { this.serviceSelect.close(); }
                this.onFilterChange();
            }
        });
        // Sélection automatique pays si un seul résultat dans la recherche (désactivée pour éviter l'auto-sélection de "CM")
        // this.paysSearchCtrl.valueChanges.subscribe((search: string | null) => {
        //     const availableCountries = this.getFilteredCountries();
        //     const filtered = availableCountries.filter(country =>
        //         country.toLowerCase().includes((search || '').toLowerCase())
        //     );
        //     if (filtered.length === 1 && !this.selectedCountry.includes(filtered[0])) {
        //         this.selectedCountry = [filtered[0]];
        //         if (this.countrySelect) { this.countrySelect.close(); }
        //         this.onFilterChange();
        //     }
        // });
    }

    ngOnDestroy() {
        this.routerSubscription.unsubscribe();
        this.dataUpdateSubscription.unsubscribe();
        document.removeEventListener('click', this.handleGlobalClick.bind(this));
    }

    private handleGlobalClick(event: MouseEvent): void {
        // Fermer les dropdowns si on clique en dehors
        const target = event.target as HTMLElement;
        if (!target.closest('.custom-select-container')) {
            // Les dropdowns personnalisés n'existent plus, on peut supprimer cette logique
        }
    }

    /**
     * Lorsque la période des métriques rapides change,
     * on recharge à la fois les métriques et l'état des réconciliations
     * pour garder les deux sections synchronisées.
     */
    onMetricsPeriodChange(): void {
        this.loadDashboardData();
        this.loadReconciliationSummary();
    }

    private loadDashboardData(manageLoading = true) {
        if (manageLoading) {
            this.loading = true;
        }
        this.error = null;

        this.dashboardService.getDashboardMetrics(this.metricsPeriod).subscribe({
            next: (metrics: DashboardMetrics) => {
                this.applyDashboardMetrics(metrics);
                if (manageLoading) {
                    this.loading = false;
                }
            },
            error: (error) => {
                console.error('Error loading dashboard data:', error);
                this.error = 'Erreur lors du chargement des données';
                if (manageLoading) {
                    this.loading = false;
                }
            }
        });
    }

    private applyDashboardMetrics(metrics: DashboardMetrics): void {
        this.totalReconciliations = metrics.totalReconciliations;
        this.totalFiles = metrics.totalFiles;
        this.lastActivity = metrics.lastActivity;
        this.lastActivityDate = metrics.lastActivityDate ?? '';
        this.todayReconciliations = metrics.todayReconciliations;
    }

    /**
     * Libellé de la dernière activité, calculé côté client pour suivre la langue
     * de l'interface. Dans le métier réconciliation la référence temporelle est
     * J-1 : « aujourd'hui » vaut donc J-1 et « hier » J-2.
     */
    get lastActivityLabel(): string {
        if (this.loading) {
            return this.translate.instant('MSG.loading');
        }
        if (!this.lastActivityDate) {
            return this.translate.instant('DASH.lastActivityNone');
        }

        const today = this.parseIsoDate(new Date());
        if (!today) {
            return this.translate.instant('DASH.lastActivityNone');
        }

        const reference = this.addDays(today, -1);
        const date = this.parseIsoDate(new Date(this.lastActivityDate + 'T00:00:00'));
        if (!reference || !date) {
            return this.translate.instant('DASH.lastActivityNone');
        }

        if (this.toDayKey(date) === this.toDayKey(reference)) {
            return this.translate.instant('DASH.lastActivityToday');
        }

        const daysDiff = Math.round(
            (this.toDayKey(reference) - this.toDayKey(date)) / 86400000
        );
        if (daysDiff <= 1) {
            return this.translate.instant('DASH.lastActivityYesterday');
        }
        if (daysDiff < 7) {
            return this.translate.instant(
                daysDiff === 1 ? 'DASH.lastActivityDaysAgo' : 'DASH.lastActivityDaysAgoPlural',
                { count: daysDiff }
            );
        }
        const weeks = Math.floor(daysDiff / 7);
        return this.translate.instant(
            weeks === 1 ? 'DASH.lastActivityWeeksAgo' : 'DASH.lastActivityWeeksAgoPlural',
            { count: weeks }
        );
    }

    private parseIsoDate(value: Date): Date | null {
        return isNaN(value.getTime()) ? null : value;
    }

    private toDayKey(value: Date): number {
        return Date.UTC(value.getFullYear(), value.getMonth(), value.getDate());
    }

    private addDays(value: Date | null, days: number): Date | null {
        if (!value) {
            return null;
        }
        const result = new Date(value.getTime());
        result.setDate(result.getDate() + days);
        return result;
    }

    private getDashboardFilterParams(): {
        agencies?: string[];
        services?: string[];
        countries?: string[];
        timeFilter?: string;
        startDate?: string;
        endDate?: string;
    } {
        const agencies = this.selectedAgency.length === 0 ? undefined : this.selectedAgency;
        const services = this.selectedService.length === 0 ? undefined : this.selectedService;
        const countries = this.selectedCountry.length === 0 ? undefined : this.selectedCountry;
        const timeFilter = this.showAllData
            ? undefined
            : (this.selectedTimeFilter !== 'Tous' ? this.selectedTimeFilter : undefined);
        return {
            agencies,
            services,
            countries,
            timeFilter,
            startDate: this.startDate || undefined,
            endDate: this.endDate || undefined
        };
    }

    get isRefreshButtonBusy(): boolean {
        return this.refreshing;
    }

    /**
     * Initialise la date / env par défaut pour le bloc "État des réconciliations"
     * puis déclenche un premier chargement du résumé.
     */
    private initReconciliationSummaryDefaults(): void {
        if (!this.reconciliationSummaryEnv) {
            this.reconciliationSummaryEnv = 'BET';
        }
        if (this.reconciliationSummaryCountries && this.reconciliationSummaryCountries.length && !this.reconciliationSummaryCountry) {
            // Par défaut, pas de filtre pays (tous), mais on pourrait choisir le premier si besoin
            this.reconciliationSummaryCountry = '';
        }
        if (!this.reconciliationSummaryService) {
            this.reconciliationSummaryService = '';
        }
        this.loadReconciliationSummary();
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

        switch (this.metricsPeriod) {
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
        const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
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
            this.metricsPeriod === 'semaine' ||
            this.metricsPeriod === 'jour' ||
            this.metricsPeriod === '7_jours' ||
            this.metricsPeriod === '30_jours'
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

                return this.buildRecoDayCellStatus(matchingForDay, dayInfo.date, targetEnv);
            });

            rows.push({
                service: serviceName,
                label,
                country: rowCountry,
                days: dayStatuses
            });
        });

        this.reconciliationSummaryRows = rows;
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
        this.reconciliationSummaryRows = [];
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
                } catch (e: unknown) {
                    console.error('Erreur lors du calcul du résumé des réconciliations:', e);
                    this.reconciliationSummaryError = 'Erreur lors du chargement de l’état des réconciliations.';
                    this.reconciliationSummaryLoading = false;
                    this.reconciliationSummaryLoadingMore = false;
                }
            },
            'Dashboard',
            () => token !== this.recoSummaryLoadToken
        ).catch(err => {
            if (token !== this.recoSummaryLoadToken) {
                return;
            }
            console.error('Erreur lors du chargement des données result8rec pour le résumé:', err);
            this.reconciliationSummaryError = 'Erreur lors du chargement de l’état des réconciliations.';
            this.reconciliationSummaryLoading = false;
            this.reconciliationSummaryLoadingMore = false;
        });
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
        const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
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
            return this.translate.instant('FILT.allEnvs');
        }
        if (env === 'TOTAL') {
            return this.translate.instant('FILT.totalEnvs');
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
            'Dashboard',
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
            'Dashboard',
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
        if (!this.reconciliationSummaryRows || this.reconciliationStatusFilter === 'ALL') {
            return this.reconciliationSummaryRows;
        }
        const filter = this.reconciliationStatusFilter;
        return this.reconciliationSummaryRows.filter(row =>
            row.days.some(day => this.dayMatchesStatusFilter(day, filter))
        );
    }

    private loadFilterOptions() {
        this.dashboardService.getFilterOptions().subscribe({
            next: (options: FilterOptions) => {
                this.filterOptions = options;
                // Initialiser immédiatement les listes filtrées avec les données disponibles
                this.filteredAgencies = options.agencies || [];
                this.filteredServices = options.services || [];
                this.filteredCountries = options.countries || [];
                
                // Mettre à jour les listes filtrées avec cloisonnement après chargement des données
                setTimeout(() => {
                    this.updateFilteredLists();
                }, 100);
                setTimeout(() => {
                    this.agenceSearchCtrl.setValue('');
                    this.serviceSearchCtrl.setValue('');
                    this.paysSearchCtrl.setValue('');
                }, 0);
                this.selectedAgency = [];
                this.selectedService = [];
                this.selectedCountry = [];
                this.onFilterChange();
            },
            error: (error) => {
                console.error('Error loading filter options:', error);
                // Fallback to default values sans 'Tous'
                this.filterOptions = {
                    agencies: [],
                    services: [],
                    countries: [],
                    timeFilters: ['Aujourd\'hui', 'Cette semaine', 'Ce mois', 'Cette année', 'Année dernière', 'Personnalisé']
                };
                // Initialiser immédiatement les listes filtrées
                this.filteredAgencies = this.filterOptions.agencies;
                this.filteredServices = this.filterOptions.services;
                this.filteredCountries = this.filterOptions.countries;
                
                setTimeout(() => {
                    this.updateFilteredLists();
                }, 100);
                setTimeout(() => {
                    this.agenceSearchCtrl.setValue('');
                    this.serviceSearchCtrl.setValue('');
                    this.paysSearchCtrl.setValue('');
                }, 0);
            }
        });

        // Charger en parallèle les pays/services distincts depuis result8rec pour le popup de statut
        this.dashboardService.getReconciliationFilters().subscribe({
            next: (filters) => {
                // Ces listes servent de base pour le cloisonnement du popup
                this.reconciliationCountryServices = filters.countryServices || {};
                this.reconciliationCountryEnvServices = filters.countryEnvServices || {};
                this.releveStatusCountries = normalizeCountryFilterOptions(filters.countries || []);
                this.allReconciliationServices = filters.services || [];
                this.reconciliationSummaryCountries = normalizeCountryFilterOptions(filters.countries || []);
                this.reconciliationSummaryServices = filters.services || [];

                if (!this.reconciliationSummaryCountries.length) {
                    this.reconciliationSummaryCountries = normalizeCountryFilterOptions(filters.countries || []);
                }
            },
            error: (err) => {
                console.error('Erreur lors du chargement des filtres de réconciliation:', err);
            }
        });
    }

    private loadDetailedMetrics() {
        this.detailedLoading = true;
        this.detailedError = null;
        const params = this.getDashboardFilterParams();

        this.dashboardService.getDetailedMetrics(
            params.agencies,
            params.services,
            params.countries,
            params.timeFilter,
            params.startDate,
            params.endDate
        ).subscribe({
            next: (metrics: DetailedMetrics) => {
                this.applyDetailedMetrics(metrics);
            },
            error: () => {
                this.clearDetailedMetrics('Aucune donnée pour ce pays');
            }
        });
    }

    private applyDetailedMetrics(metrics: DetailedMetrics | null | undefined): void {
        if (!metrics || (Array.isArray(metrics) && metrics.length === 0) ||
            (typeof metrics === 'object' && Object.keys(metrics).length === 0)) {
            this.clearDetailedMetrics('Aucune donnée pour ce pays');
            return;
        }
        this.detailedMetrics = metrics;
        this.detailedLoading = false;
        this.detailedError = null;
        this.filterOperationStats();
        this.updateBarChartData();
    }

    private clearDetailedMetrics(message: string): void {
        this.detailedMetrics = null;
        this.filteredOperationStats = [];
        this.filteredFrequencyStats = [];
        this.barChartData = { labels: [], datasets: [] };
        this.lineChartData = { labels: [], datasets: [] };
        this.detailedError = message;
        this.detailedLoading = false;
        this.updateBarChartData();
    }

    /**
     * Filtre les statistiques par type d'opération pour exclure DEPOT et VERSEMENT
     */
    private filterOperationStats() {
        if (!this.detailedMetrics) {
            this.filteredOperationStats = [];
            this.filteredFrequencyStats = [];
            return;
        }

        // Filtrer les statistiques par type d'opération
        this.filteredOperationStats = (this.detailedMetrics.operationStats || []).filter(stat => {
            if (!stat.operationType) return true;
            const lowerCaseType = stat.operationType.toLowerCase();
            
            // Exclure les types non désirés
            return !(lowerCaseType === 'depot' || 
                    lowerCaseType === 'dépôt' || 
                    lowerCaseType === 'versement' ||
                    lowerCaseType === 'virement' ||
                    lowerCaseType === 'ajustement' ||
                    lowerCaseType === 'transaction_cree' ||
                    (lowerCaseType.startsWith('annulation_') && lowerCaseType !== 'annulation_bo'));
        });

        // Filtrer les statistiques de fréquence
        this.filteredFrequencyStats = (this.detailedMetrics.frequencyStats || []).filter(stat => {
            if (!stat.operationType) return true;
            const lowerCaseType = stat.operationType.toLowerCase();
            
            // Exclure les types non désirés
            return !(lowerCaseType === 'depot' || 
                    lowerCaseType === 'dépôt' || 
                    lowerCaseType === 'versement' ||
                    lowerCaseType === 'virement' ||
                    lowerCaseType === 'ajustement' ||
                    lowerCaseType === 'transaction_cree' ||
                    (lowerCaseType.startsWith('annulation_') && lowerCaseType !== 'annulation_bo'));
        });
        const result = {
            original: this.detailedMetrics.operationStats?.length || 0,
            filtered: this.filteredOperationStats.length,
            excluded: (this.detailedMetrics.operationStats || []).filter(stat => {
                if (!stat.operationType) return false;
                const lowerCaseType = stat.operationType.toLowerCase();
                return (lowerCaseType === 'depot' || 
                        lowerCaseType === 'dépôt' || 
                        lowerCaseType === 'versement' ||
                        lowerCaseType === 'virement' ||
                        lowerCaseType === 'ajustement' ||
                        lowerCaseType === 'transaction_cree' ||
                        (lowerCaseType.startsWith('annulation_') && lowerCaseType !== 'annulation_bo'));
            }).map(stat => stat.operationType)
        };
    }

    private loadTransactionCreatedStats() {
        this.transactionCreatedLoading = true;
        this.transactionCreatedError = null;
        const params = this.getDashboardFilterParams();

        this.dashboardService.getTransactionCreatedStats(
            params.agencies,
            params.services,
            params.countries,
            params.timeFilter,
            params.startDate,
            params.endDate
        ).subscribe({
            next: (stats: TransactionCreatedStats) => {
                this.applyTransactionCreatedStats(stats);
            },
            error: (error) => {
                console.error('Error loading transaction created stats:', error);
                this.transactionCreatedError = 'Erreur lors du chargement des statistiques des transactions créées';
                this.transactionCreatedLoading = false;
            }
        });
    }

    private applyTransactionCreatedStats(stats: TransactionCreatedStats | null | undefined): void {
        this.transactionCreatedStats = stats ?? null;
        this.transactionCreatedLoading = false;
        this.transactionCreatedError = null;
    }

    filteredAgencySummary: any[] = [];

    updateDashboardIndicators() {
      // Période : déjà appliquée dans loadAgencySummaryData (filterByPeriod) ; ne pas filtrer avec startsWith sur l’ISO date.
      const agencySummaryFiltered = this.agencySummaryData.filter((s: any) =>
        (this.selectedAgency?.length === 0 || this.selectedAgency?.includes(s.agency)) &&
        (this.selectedService?.length === 0 || this.selectedService?.includes(s.service)) &&
        (this.selectedCountry?.length === 0 || this.selectedCountry?.includes(s.pays))
      );
      this.filteredAgencySummary = agencySummaryFiltered;
      // Volume total
      this.totalVolume = agencySummaryFiltered.reduce((sum: number, s: any) => sum + (Number(s.totalVolume) || 0), 0);
      // Nombre de transactions
      this.totalTransactions = agencySummaryFiltered.reduce((sum: number, s: any) => sum + (Number(s.recordCount) || 0), 0);
      // Nombre de clients (si champ client ou unique agency/service)
      this.totalClients = new Set(agencySummaryFiltered.map((s: any) => s.agency + '|' + s.service)).size;
      // Autres indicateurs à adapter si besoin
    }

    onFilterChange() {
        // Mettre à jour les listes filtrées pour le cloisonnement
        this.updateFilteredLists();
        
        this.loadAgencySummaryData();
        this.loadAllOperations();
        this.updateDashboardIndicators();
        // Recharger les métriques détaillées avec les nouveaux filtres
        this.loadDetailedMetrics();
        this.loadTransactionCreatedStats();
        // Mettre à jour les graphiques
        this.updateBarChartData();
        
        // Fermer automatiquement les dropdowns après un choix
        setTimeout(() => {
            if (this.agencySelect) this.agencySelect.close();
            if (this.serviceSelect) this.serviceSelect.close();
            if (this.countrySelect) this.countrySelect.close();
        }, 100);
    }

    // Méthode pour mettre à jour les listes filtrées avec cloisonnement
    updateFilteredLists() {
        // S'assurer qu'on a des données avant de filtrer
        if (!this.agencySummaryData || this.agencySummaryData.length === 0) {
            // Si pas de données agencySummaryData, utiliser filterOptions
            if (this.filterOptions) {
                this.filteredAgencies = this.filterOptions.agencies || [];
                this.filteredServices = this.filterOptions.services || [];
                this.filteredCountries = this.filterOptions.countries || [];
            }
            return;
        }
        
        // Mettre à jour les services disponibles selon l'agence sélectionnée
        this.filteredServices = this.getFilteredServices();
        
        // Mettre à jour les pays disponibles selon l'agence sélectionnée
        this.filteredCountries = this.getFilteredCountries();
        
        // Mettre à jour les agences disponibles selon les autres filtres
        this.filteredAgencies = this.getFilteredAgencies();
        
        // Nettoyer les sélections qui ne sont plus valides
        this.cleanInvalidSelections();
    }

    // Méthode pour nettoyer les sélections invalides
    cleanInvalidSelections() {
        const currentAgency = this.selectedAgency;
        const currentService = this.selectedService;
        const currentCountry = this.selectedCountry;

        // Nettoyer les services si l'agence a changé
        if (currentService && currentService.length > 0) {
            const validServices = currentService.filter((service: string) => 
                this.filteredServices.includes(service)
            );
            if (validServices.length !== currentService.length) {
                this.selectedService = validServices;
            }
        }

        // Nettoyer les pays si l'agence a changé
        if (currentCountry && currentCountry.length > 0) {
            const validCountries = currentCountry.filter((country: string) => 
                this.filteredCountries.includes(country)
            );
            if (validCountries.length !== currentCountry.length) {
                this.selectedCountry = validCountries;
            }
        }

        // Nettoyer les agences si les autres filtres ont changé
        if (currentAgency && currentAgency.length > 0) {
            const validAgencies = currentAgency.filter((agency: string) => 
                this.filteredAgencies.includes(agency)
            );
            if (validAgencies.length !== currentAgency.length) {
                this.selectedAgency = validAgencies;
            }
        }
    }

    // Méthodes de filtrage avec cloisonnement
    getFilteredAgencies(): string[] {
        // Utiliser les données disponibles : agencySummaryData ou filterOptions
        let data = this.agencySummaryData && this.agencySummaryData.length > 0 
            ? this.agencySummaryData 
            : (this.filterOptions?.agencies || []).map(agency => ({ agency, service: '', country: '' }));
        
        // Filtrer par service si sélectionné
        if (this.selectedService && this.selectedService.length > 0) {
            data = data.filter(s => this.selectedService.includes(s.service));
        }
        // Filtrer par pays si sélectionné
        if (this.selectedCountry && this.selectedCountry.length > 0) {
            data = data.filter(s => this.selectedCountry.includes(s.country));
        }
        const agencies = [...new Set(data.map(s => s.agency))];
        return agencies.sort();
    }

    getFilteredServices(): string[] {
        // Utiliser les données disponibles : agencySummaryData ou filterOptions
        let data = this.agencySummaryData && this.agencySummaryData.length > 0 
            ? this.agencySummaryData 
            : (this.filterOptions?.services || []).map(service => ({ agency: '', service, country: '' }));
        
        // Filtrer par agence si sélectionnée (cloisonnement principal)
        if (this.selectedAgency && this.selectedAgency.length > 0) {
            data = data.filter(s => this.selectedAgency.includes(s.agency));
        }
        // Filtrer par pays si sélectionné
        if (this.selectedCountry && this.selectedCountry.length > 0) {
            data = data.filter(s => this.selectedCountry.includes(s.country));
        }
        const services = [...new Set(data.map(s => s.service))];
        return services.sort();
    }

    getFilteredCountries(): string[] {
        // Utiliser les données disponibles : agencySummaryData ou filterOptions
        let data = this.agencySummaryData && this.agencySummaryData.length > 0 
            ? this.agencySummaryData 
            : (this.filterOptions?.countries || []).map(country => ({ agency: '', service: '', country }));
        
        // Filtrer par agence si sélectionnée (cloisonnement principal)
        if (this.selectedAgency && this.selectedAgency.length > 0) {
            data = data.filter(s => this.selectedAgency.includes(s.agency));
        }
        // Filtrer par service si sélectionné
        if (this.selectedService && this.selectedService.length > 0) {
            data = data.filter(s => this.selectedService.includes(s.service));
        }
        const countries = [...new Set(data.map(s => s.country))];
        return countries.sort();
    }

    onTimeFilterChange() {
        if (this.selectedTimeFilter === 'Personnalisé') {
            this.showCustomDateInputs = true;
        } else {
            this.showCustomDateInputs = false;
            this.startDate = '';
            this.endDate = '';
        }
        this.onFilterChange();
    }

    onAgencyChange() {
        this.onFilterChange();
    }

    onServiceChange() {
        this.onFilterChange();
    }

    onCountryChange() {
        this.onFilterChange();
    }

    toggleAllAgencies(event: any) {
      if (event.target.checked) {
        this.selectedAgency = [];
      }
      this.onFilterChange();
    }
    onAgencyCheckboxChange(agency: string, event: any) {
      if (event.target.checked) {
        if (!this.selectedAgency?.includes(agency)) {
          this.selectedAgency = [...(this.selectedAgency || []), agency];
        }
      } else {
        this.selectedAgency = (this.selectedAgency || []).filter(a => a !== agency);
        if (!this.selectedAgency || this.selectedAgency.length === 0) {
          this.selectedAgency = [];
        }
      }
      this.onFilterChange();
    }
    toggleAllServices(event: any) {
      if (event.target.checked) {
        this.selectedService = [];
      }
      this.onFilterChange();
    }
    onServiceCheckboxChange(service: string, event: any) {
      if (event.target.checked) {
        if (!this.selectedService?.includes(service)) {
          this.selectedService = [...(this.selectedService || []), service];
        }
      } else {
        this.selectedService = (this.selectedService || []).filter(s => s !== service);
        if (!this.selectedService || this.selectedService.length === 0) {
          this.selectedService = [];
        }
      }
      this.onFilterChange();
    }
    toggleAllCountries(event: any) {
      if (event.target.checked) {
        this.selectedCountry = [];
      }
      this.onFilterChange();
    }
    onCountryCheckboxChange(country: string, event: any) {
      if (event.target.checked) {
        if (!this.selectedCountry?.includes(country)) {
          this.selectedCountry = [...(this.selectedCountry || []), country];
        }
      } else {
        this.selectedCountry = (this.selectedCountry || []).filter(c => c !== country);
        if (!this.selectedCountry || this.selectedCountry.length === 0) {
          this.selectedCountry = [];
        }
      }
      this.onFilterChange();
    }

    getFrequencyPercentage(frequency: number): number {
        if (!this.filteredFrequencyStats || this.filteredFrequencyStats.length === 0) {
            return 0;
        }
        
        const maxFrequency = Math.max(...this.filteredFrequencyStats.map(f => f.frequency));
        return maxFrequency > 0 ? (frequency / maxFrequency) * 100 : 0;
    }

    refreshMetrics() {
        if (this.refreshing) {
            return;
        }

        this.refreshing = true;
        this.loading = true;
        this.error = null;
        this.detailedLoading = true;
        this.transactionCreatedLoading = true;

        const params = this.getDashboardFilterParams();

        forkJoin({
            metrics: this.dashboardService.getDashboardMetrics(this.metricsPeriod).pipe(
                catchError((error) => {
                    console.error('Error loading dashboard data:', error);
                    this.error = 'Erreur lors du chargement des données';
                    return of(null);
                })
            ),
            detailed: this.dashboardService.getDetailedMetrics(
                params.agencies,
                params.services,
                params.countries,
                params.timeFilter,
                params.startDate,
                params.endDate
            ).pipe(
                catchError(() => {
                    this.clearDetailedMetrics('Aucune donnée pour ce pays');
                    return of(null);
                })
            ),
            transactionCreated: this.dashboardService.getTransactionCreatedStats(
                params.agencies,
                params.services,
                params.countries,
                params.timeFilter,
                params.startDate,
                params.endDate
            ).pipe(
                catchError((error) => {
                    console.error('Error loading transaction created stats:', error);
                    this.transactionCreatedError =
                        'Erreur lors du chargement des statistiques des transactions créées';
                    this.transactionCreatedLoading = false;
                    return of(null);
                })
            )
        }).pipe(
            finalize(() => {
                this.loading = false;
                this.refreshing = false;
            })
        ).subscribe(({ metrics, detailed, transactionCreated }) => {
            if (metrics) {
                this.applyDashboardMetrics(metrics);
            }
            if (detailed) {
                this.applyDetailedMetrics(detailed);
            }
            if (transactionCreated) {
                this.applyTransactionCreatedStats(transactionCreated);
            }
        });

        // Résumé réconciliation (flux progressif, chargé en parallèle)
        this.loadReconciliationSummary();
        this.serviceRefPanel?.reloadData();
    }

    startNewReconciliation() {
        this.router.navigate(['/upload']);
    }

    goToStats() {
        console.log('Navigation vers les statistiques');
        this.router.navigate(['/stats']);
    }

    goToResults() {
        this.router.navigate(['/results']);
    }

    getAverageTransactionsPerPeriod(): string {
        if (!this.detailedMetrics) return '0';
        return this.detailedMetrics.averageTransactions?.toLocaleString() ?? '0';
    }


    resetFilters() {
        this.selectedAgency = [];
        this.selectedService = [];
        this.selectedCountry = [];
        this.selectedTimeFilter = 'Cette semaine';
        this.startDate = '';
        this.endDate = '';
        this.showCustomDateInputs = false;
        this.showAllData = false; // Réinitialiser aussi le flag "Voir plus"
        this.loadDetailedMetrics();
        this.loadTransactionCreatedStats();
        this.updateBarChartData();
    }
    
    toggleShowAllData() {
        this.showAllData = !this.showAllData;
        this.onFilterChange();
    }

    exportDetailedMetricsExcel() {
        if (!this.detailedMetrics) return;
        const wb = XLSX.utils.book_new();

        // 1. Feuille Métriques principales avec couleurs
        const mainMetrics = [
            ['Métrique', 'Valeur'],
            ['Volume Total', this.detailedMetrics.totalVolume],
            ['Transactions', this.detailedMetrics.totalTransactions],
            ['Clients', this.detailedMetrics.totalClients],
            ['Transaction moyenne/Jour', this.getAverageTransactionsPerPeriod()],
            ['Volume Moyen/Jour', this.detailedMetrics.averageVolume],
            ['Frais moyen/Jour', this.detailedMetrics.averageFeesPerDay],
        ];
        const wsMain = XLSX.utils.aoa_to_sheet(mainMetrics);
        
        // Appliquer des styles et couleurs
        wsMain['!cols'] = [{ width: 25 }, { width: 20 }];
        
        // Style pour l'en-tête
        if (wsMain['A1']) {
            wsMain['A1'].s = {
                fill: { fgColor: { rgb: "4F81BD" } },
                font: { color: { rgb: "FFFFFF" }, bold: true },
                alignment: { horizontal: "center" }
            };
        }
        if (wsMain['B1']) {
            wsMain['B1'].s = {
                fill: { fgColor: { rgb: "4F81BD" } },
                font: { color: { rgb: "FFFFFF" }, bold: true },
                alignment: { horizontal: "center" }
            };
        }
        
        // Styles pour les métriques
        for (let i = 2; i <= mainMetrics.length; i++) {
            const cellA = wsMain[`A${i}`];
            const cellB = wsMain[`B${i}`];
            
            if (cellA) {
                cellA.s = {
                    fill: { fgColor: { rgb: "E7E6E6" } },
                    font: { bold: true },
                    alignment: { horizontal: "left" }
                };
            }
            
            if (cellB) {
                cellB.s = {
                    fill: { fgColor: { rgb: "F2F2F2" } },
                    font: { color: { rgb: "000000" } },
                    alignment: { horizontal: "right" },
                    numFmt: i === 2 || i === 5 || i === 6 ? "#,##0" : "0"
                };
            }
        }
        
        XLSX.utils.book_append_sheet(wb, wsMain, 'Métriques');

        // 2. Feuille Statistiques par type d'opération avec couleurs
        if (this.filteredOperationStats && this.filteredOperationStats.length > 0) {
            const opHeader = ['Type d\'opération', 'Transactions', 'Volume total', 'Volume moyen'];
            const opData = this.filteredOperationStats.map(stat => [
                stat.operationType,
                stat.transactionCount,
                stat.totalVolume,
                stat.averageVolume
            ]);
            const wsOp = XLSX.utils.aoa_to_sheet([opHeader, ...opData]);
            
            // Appliquer des styles
            wsOp['!cols'] = [{ width: 20 }, { width: 15 }, { width: 18 }, { width: 18 }];
            
            // Style pour l'en-tête
            for (let col = 0; col < opHeader.length; col++) {
                const cell = wsOp[XLSX.utils.encode_cell({ r: 0, c: col })];
                if (cell) {
                    cell.s = {
                        fill: { fgColor: { rgb: "70AD47" } },
                        font: { color: { rgb: "FFFFFF" }, bold: true },
                        alignment: { horizontal: "center" }
                    };
                }
            }
            
            // Styles pour les données
            for (let row = 1; row <= opData.length; row++) {
                for (let col = 0; col < opHeader.length; col++) {
                    const cell = wsOp[XLSX.utils.encode_cell({ r: row, c: col })];
                    if (cell) {
                        const isEven = row % 2 === 0;
                        cell.s = {
                            fill: { fgColor: { rgb: isEven ? "F2F2F2" : "FFFFFF" } },
                            font: { color: { rgb: "000000" } },
                            alignment: { horizontal: col === 0 ? "left" : "right" },
                            numFmt: col >= 1 ? "#,##0" : "0"
                        };
                    }
                }
            }
            
            XLSX.utils.book_append_sheet(wb, wsOp, 'Stats opérations');
        }

        // 3. Feuille Fréquence avec couleurs
        if (this.filteredFrequencyStats && this.filteredFrequencyStats.length > 0) {
            const freqHeader = ['Type d\'opération', 'Fréquence'];
            const freqData = this.filteredFrequencyStats.map(stat => [
                stat.operationType,
                stat.frequency
            ]);
            const wsFreq = XLSX.utils.aoa_to_sheet([freqHeader, ...freqData]);
            
            // Appliquer des styles
            wsFreq['!cols'] = [{ width: 20 }, { width: 15 }];
            
            // Style pour l'en-tête
            for (let col = 0; col < freqHeader.length; col++) {
                const cell = wsFreq[XLSX.utils.encode_cell({ r: 0, c: col })];
                if (cell) {
                    cell.s = {
                        fill: { fgColor: { rgb: "FFC000" } },
                        font: { color: { rgb: "000000" }, bold: true },
                        alignment: { horizontal: "center" }
                    };
                }
            }
            
            // Styles pour les données
            for (let row = 1; row <= freqData.length; row++) {
                for (let col = 0; col < freqHeader.length; col++) {
                    const cell = wsFreq[XLSX.utils.encode_cell({ r: row, c: col })];
                    if (cell) {
                        const isEven = row % 2 === 0;
                        cell.s = {
                            fill: { fgColor: { rgb: isEven ? "FFF2CC" : "FFFFFF" } },
                            font: { color: { rgb: "000000" } },
                            alignment: { horizontal: col === 0 ? "left" : "right" },
                            numFmt: col === 1 ? "0" : "0"
                        };
                    }
                }
            }
            
            XLSX.utils.book_append_sheet(wb, wsFreq, 'Fréquence');
        }

        // 4. Feuille de résumé avec filtres appliqués
        const summaryData = [
            ['Rapport des Métriques Détaillées'],
            [''],
            ['Filtres appliqués:'],
            ['Agences', this.selectedAgency?.join(', ') || 'Tous'],
            ['Services', this.selectedService?.join(', ') || 'Tous'],
            ['Pays', this.selectedCountry?.join(', ') || 'Tous'],
            // ['Banque', this.selectedBanque], // supprimé
            ['Période', this.selectedTimeFilter],
            [''],
            ['Date de génération', new Date().toLocaleString('fr-FR')]
        ];
        
        const wsSummary = XLSX.utils.aoa_to_sheet(summaryData);
        
        // Ajuster les largeurs de colonnes selon le contenu
        const maxLabelLength = Math.max(...summaryData.map(row => row[0]?.toString().length || 0));
        const maxValueLength = Math.max(...summaryData.map(row => row[1]?.toString().length || 0));
        
        wsSummary['!cols'] = [
            { width: Math.max(maxLabelLength + 2, 15) }, // Label + marge
            { width: Math.max(maxValueLength + 2, 30) }  // Valeur + marge
        ];
        
        // Style pour le titre
        if (wsSummary['A1']) {
            wsSummary['A1'].s = {
                fill: { fgColor: { rgb: "4472C4" } },
                font: { color: { rgb: "FFFFFF" }, bold: true, size: 14 },
                alignment: { horizontal: "center", vertical: "center" }
            };
            // Fusionner les cellules pour le titre
            wsSummary['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 1 } }];
        }
        
        // Style pour "Filtres appliqués"
        if (wsSummary['A3']) {
            wsSummary['A3'].s = {
                fill: { fgColor: { rgb: "E7E6E6" } },
                font: { bold: true, size: 12 },
                alignment: { horizontal: "left", vertical: "center" }
            };
            // Fusionner les cellules pour "Filtres appliqués"
            wsSummary['!merges'] = wsSummary['!merges'] || [];
            wsSummary['!merges'].push({ s: { r: 2, c: 0 }, e: { r: 2, c: 1 } });
        }
        
        // Styles pour les filtres
        for (let i = 4; i <= 7; i++) {
            const cellA = wsSummary[`A${i}`];
            const cellB = wsSummary[`B${i}`];
            
            if (cellA) {
                cellA.s = {
                    fill: { fgColor: { rgb: "F8F9FA" } },
                    font: { bold: true },
                    alignment: { horizontal: "left", vertical: "center" },
                    border: { 
                        right: { style: "thin", color: { rgb: "CCCCCC" } }
                    }
                };
            }
            
            if (cellB) {
                cellB.s = {
                    fill: { fgColor: { rgb: "FFFFFF" } },
                    font: { color: { rgb: "333333" } },
                    alignment: { horizontal: "left", vertical: "center" },
                    border: { 
                        left: { style: "thin", color: { rgb: "CCCCCC" } }
                    }
                };
            }
        }
        
        // Style pour la date de génération
        if (wsSummary['A9']) {
            wsSummary['A9'].s = {
                fill: { fgColor: { rgb: "E7E6E6" } },
                font: { bold: true, italic: true },
                alignment: { horizontal: "left", vertical: "center" }
            };
        }
        if (wsSummary['B9']) {
            wsSummary['B9'].s = {
                fill: { fgColor: { rgb: "F2F2F2" } },
                font: { italic: true, color: { rgb: "666666" } },
                alignment: { horizontal: "left", vertical: "center" }
            };
        }
        
        XLSX.utils.book_append_sheet(wb, wsSummary, 'Résumé');

        XLSX.writeFile(wb, 'metriques_detaillees.xlsx');
    }

    loadAgencySummaryData() {
      const normalize = (str: string) => (str || '').toLowerCase().normalize('NFD').replace(/[ \u0300-\u036f]/g, '');
      const agencies = this.selectedAgency?.length === 0 ? undefined : this.selectedAgency;
      const services = this.selectedService?.length === 0 ? undefined : this.selectedService;
      const countries = this.selectedCountry?.length === 0 ? undefined : this.selectedCountry;
      this.agencySummaryService.getAllSummaries().subscribe({
        next: (data: any[]) => {
          this.agencySummaryData = data.filter((item: any) => {
            const agencyMatch = !agencies || agencies.map(normalize).includes(normalize(item.agency));
            const serviceMatch = !services || services.includes(item.service);
            const countryMatch = !countries || countries.includes(item.pays);
            return agencyMatch && serviceMatch && countryMatch;
          });
          this.agencySummaryData = this.filterByPeriod(this.agencySummaryData);
          
          // Trier par date décroissante (du plus récent au plus ancien)
          this.agencySummaryData.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
          
          // Mettre à jour les listes filtrées avec cloisonnement après chargement des données
          this.updateFilteredLists();
          
          this.updateDashboardIndicators();
          this.updateBarChartData();
        },
        error: (err) => {
          this.agencySummaryData = [];
          this.updateDashboardIndicators();
          this.updateBarChartData();
        }
      });
    }

    loadAllOperations() {
      const normalize = (str: string) => (str || '').toLowerCase().normalize('NFD').replace(/[ \u0300-\u036f]/g, '');
      const agencies = this.selectedAgency?.length === 0 ? undefined : this.selectedAgency;
      const services = this.selectedService?.length === 0 ? undefined : this.selectedService;
      const countries = this.selectedCountry?.length === 0 ? undefined : this.selectedCountry;
      this.operationService.getAllOperations().subscribe({
        next: (ops: any[]) => {
          // Filtrage par client AVANT la période
          let filteredByClient = ops;
          if (agencies && agencies.length > 0) {
            const normalizedAgencies = agencies.map(normalize);
            filteredByClient = ops.filter((item: any) => normalizedAgencies.includes(normalize(item.codeProprietaire)));
          }
          // Puis filtrage par période
          this.allOperations = this.filterByPeriod(filteredByClient);
          this.updateBarChartData();
        },
        error: (err) => {
          console.error('Error in loadAllOperations:', err);
          this.allOperations = [];
          this.updateBarChartData();
        }
      });
    }

    onBarClick(event: any) {
      if (event.active && event.active.length > 0) {
        const chartElement = event.active[0];
        let label = '';
        // Pour le mode volume, chaque dataset a un label, sinon c'est dans labels
        if (this.selectedMetric === 'volume') {
          label = this.barChartData.datasets[chartElement.datasetIndex]?.label || '';
        } else {
          label = this.barChartData.labels[chartElement.index] || '';
        }
        alert('Vous avez cliqué sur : ' + label);
      }
    }

    // Fonction pour obtenir le drapeau d'un pays basé sur son code
    getCountryFlag(countryCode: string): string {
      const flagMap: {[key: string]: string} = {
        // Afrique Centrale
        'CM': '🇨🇲', // Cameroun
        'CF': '🇨🇫', // Centrafrique
        'TD': '🇹🇩', // Tchad
        'CG': '🇨🇬', // Congo
        'CD': '🇨🇩', // RDC (Congo Démocratique)
        'GQ': '🇬🇶', // Guinée Équatoriale
        'GA': '🇬🇦', // Gabon
        'ST': '🇸🇹', // Sao Tomé-et-Principe
        'AO': '🇦🇴', // Angola
        
        // Afrique de l'Ouest
        'CI': '🇨🇮', // Côte d'Ivoire
        'BF': '🇧🇫', // Burkina Faso
        'SN': '🇸🇳', // Sénégal
        'TG': '🇹🇬', // Togo
        'BJ': '🇧🇯', // Bénin
        'ML': '🇲🇱', // Mali
        'NE': '🇳🇪', // Niger
        'GN': '🇬🇳', // Guinée
        'GW': '🇬🇼', // Guinée-Bissau
        'SL': '🇸🇱', // Sierra Leone
        'LR': '🇱🇷', // Liberia
        'GH': '🇬🇭', // Ghana
        'NG': '🇳🇬', // Nigeria
        'MR': '🇲🇷', // Mauritanie
        'GM': '🇬🇲', // Gambie
        'CV': '🇨🇻', // Cap-Vert
        
        // Afrique de l'Est
        'KE': '🇰🇪', // Kenya
        'TZ': '🇹🇿', // Tanzanie
        'UG': '🇺🇬', // Ouganda
        'RW': '🇷🇼', // Rwanda
        'BI': '🇧🇮', // Burundi
        'ET': '🇪🇹', // Éthiopie
        'SO': '🇸🇴', // Somalie
        'DJ': '🇩🇯', // Djibouti
        'ER': '🇪🇷', // Érythrée
        'SS': '🇸🇸', // Soudan du Sud
        'SD': '🇸🇩', // Soudan
        'SC': '🇸🇨', // Seychelles
        'MU': '🇲🇺', // Maurice
        'KM': '🇰🇲', // Comores
        'MG': '🇲🇬', // Madagascar
        
        // Afrique du Nord
        'MA': '🇲🇦', // Maroc
        'DZ': '🇩🇿', // Algérie
        'TN': '🇹🇳', // Tunisie
        'LY': '🇱🇾', // Libye
        'EG': '🇪🇬', // Égypte
        'EH': '🇪🇭', // Sahara Occidental
        
        // Afrique Australe
        'ZA': '🇿🇦', // Afrique du Sud
        'NA': '🇳🇦', // Namibie
        'BW': '🇧🇼', // Botswana
        'ZW': '🇿🇼', // Zimbabwe
        'ZM': '🇿🇲', // Zambie
        'MW': '🇲🇼', // Malawi
        'MZ': '🇲🇿', // Mozambique
        'SZ': '🇸🇿', // Eswatini
        'LS': '🇱🇸', // Lesotho
        
        // Europe
        'FR': '🇫🇷', // France
        'GB': '🇬🇧', // Royaume-Uni
        'DE': '🇩🇪', // Allemagne
        'IT': '🇮🇹', // Italie
        'ES': '🇪🇸', // Espagne
        'PT': '🇵🇹', // Portugal
        'BE': '🇧🇪', // Belgique
        'NL': '🇳🇱', // Pays-Bas
        'CH': '🇨🇭', // Suisse
        'AT': '🇦🇹', // Autriche
        'GR': '🇬🇷', // Grèce
        'PL': '🇵🇱', // Pologne
        'RO': '🇷🇴', // Roumanie
        'CZ': '🇨🇿', // République Tchèque
        'SE': '🇸🇪', // Suède
        'NO': '🇳🇴', // Norvège
        'DK': '🇩🇰', // Danemark
        'FI': '🇫🇮', // Finlande
        'IE': '🇮🇪', // Irlande
        'RU': '🇷🇺', // Russie
        'UA': '🇺🇦', // Ukraine
        
        // Amériques
        'US': '🇺🇸', // États-Unis
        'CA': '🇨🇦', // Canada
        'MX': '🇲🇽', // Mexique
        'BR': '🇧🇷', // Brésil
        'AR': '🇦🇷', // Argentine
        'CL': '🇨🇱', // Chili
        'CO': '🇨🇴', // Colombie
        'PE': '🇵🇪', // Pérou
        'VE': '🇻🇪', // Venezuela
        
        // Asie
        'CN': '🇨🇳', // Chine
        'JP': '🇯🇵', // Japon
        'IN': '🇮🇳', // Inde
        'KR': '🇰🇷', // Corée du Sud
        'SA': '🇸🇦', // Arabie Saoudite
        'AE': '🇦🇪', // Émirats Arabes Unis
        'TR': '🇹🇷', // Turquie
        'IL': '🇮🇱', // Israël
        'TH': '🇹🇭', // Thaïlande
        'VN': '🇻🇳', // Vietnam
        'SG': '🇸🇬', // Singapour
        'MY': '🇲🇾', // Malaisie
        'ID': '🇮🇩', // Indonésie
        'PH': '🇵🇭', // Philippines
        'PK': '🇵🇰', // Pakistan
        'BD': '🇧🇩', // Bangladesh
        'LK': '🇱🇰', // Sri Lanka
        
        // Océanie
        'AU': '🇦🇺', // Australie
        'NZ': '🇳🇿', // Nouvelle-Zélande
        
        // Moyen-Orient
        'LB': '🇱🇧', // Liban
        'JO': '🇯🇴', // Jordanie
        'SY': '🇸🇾', // Syrie
        'IQ': '🇮🇶', // Irak
        'IR': '🇮🇷', // Iran
        'KW': '🇰🇼', // Koweït
        'QA': '🇶🇦', // Qatar
        'BH': '🇧🇭', // Bahreïn
        'OM': '🇴🇲', // Oman
        'YE': '🇾🇪', // Yémen
        
        // Autres zones
        'HT': '🇭🇹', // Haïti
      };
      return flagMap[countryCode?.toUpperCase()] || '🌍';
    }

    // Fonction pour extraire le code pays du nom du compte
    private extractCountryCodeFromAccountName(accountName: string): string {
      // Chercher les préfixes de pays dans le nom du compte
      const upperName = accountName.toUpperCase();
      console.log('[EXTRACT] Extraction pour:', accountName, '->', upperName);
      
      // Mapping des préfixes vers les codes pays
      const prefixMap: {[key: string]: string} = {
        'CI_': 'CI',
        'CM_': 'CM',
        'BF_': 'BF',
        'SN_': 'SN',
        'TG_': 'TG',
        'BJ_': 'BJ',
        'ML_': 'ML',
        'NE_': 'NE',
        'GN_': 'GN',
        'CD_': 'CD',
        'CG_': 'CG',
        'GA_': 'GA',
        'TD_': 'TD',
        'CF_': 'CF',
        'GQ_': 'GQ',
      };
      
      // Chercher un préfixe correspondant
      for (const [prefix, code] of Object.entries(prefixMap)) {
        if (upperName.startsWith(prefix)) {
          console.log('[EXTRACT] Trouvé préfixe:', prefix, '-> code:', code);
          return code;
        }
      }
      
      // Chercher les suffixes de pays dans le nom du compte (plus spécifique)
      const suffixMap: {[key: string]: string} = {
        'CM': 'CM',
        'CI': 'CI',
        'BF': 'BF',
        'SN': 'SN',
        'TG': 'TG',
        'BJ': 'BJ',
        'ML': 'ML',
        'NE': 'NE',
        'GN': 'GN',
      };
      
      // Chercher d'abord les suffixes exacts (plus précis)
      for (const [suffix, code] of Object.entries(suffixMap)) {
        if (upperName.endsWith(suffix)) {
          console.log('[EXTRACT] Trouvé suffixe exact:', suffix, '-> code:', code);
          return code;
        }
      }
      
      // Ensuite chercher les suffixes dans le nom (moins précis)
      for (const [suffix, code] of Object.entries(suffixMap)) {
        if (upperName.includes(suffix) && !upperName.startsWith(suffix + '_')) {
          console.log('[EXTRACT] Trouvé suffixe dans nom:', suffix, '-> code:', code);
          return code;
        }
      }
      
      console.log('[EXTRACT] Aucun code pays trouvé pour:', accountName);
      return '';
    }

    // Fonction pour charger les soldes par compte (DEPUIS LES COMPTES DIRECTEMENT)
    loadAccountBalances() {
      // Récupérer TOUS les comptes depuis le service Compte
      this.compteService.getAllComptes().subscribe({
        next: (comptes: any[]) => {
          console.log('[BALANCES] Comptes reçus:', comptes.length, 'comptes');
          const comptesRecents = comptes.filter(compte => this.isUpdatedWithinLastTwoWeeks(compte.dateDerniereMaj));
          console.log('[BALANCES] Comptes mis à jour sur 2 semaines:', comptesRecents.length, 'comptes');
          
          // Filtrer les comptes clients (avec un solde > 0 et de type "client")
          const comptesClients = comptesRecents.filter(compte => {
            const hasSolde = compte.solde && compte.solde > 0;
            const isClientType = compte.type === 'client' || compte.categorie === 'client';
            
            console.log('[BALANCES] Compte:', compte.numeroCompte, 
              '- Type:', compte.type, 
              '- Catégorie:', compte.categorie, 
              '- Solde:', compte.solde,
              '- Est client:', isClientType);
            
            return hasSolde && isClientType;
          });
          
          console.log('[BALANCES] Comptes clients avec solde:', comptesClients.length, 'comptes');
          
          // Si aucun compte client trouvé, afficher tous les comptes avec solde > 0
          if (comptesClients.length === 0) {
            console.log('[BALANCES] ⚠️ Aucun compte client trouvé, affichage de tous les comptes avec solde');
            const allComptesWithSolde = comptesRecents.filter(compte => compte.solde && compte.solde > 0);
            console.log('[BALANCES] Comptes avec solde (tous types):', allComptesWithSolde.length, 'comptes');
            
            // Convertir tous les comptes avec solde
            this.accountBalances = allComptesWithSolde.map(compte => {
              const accountName = compte.numeroCompte || compte.codeProprietaire;
              let country = compte.pays;
              
              if (!country || country.trim() === '') {
                country = this.extractCountryCodeFromAccountName(accountName);
              }
              
              return {
                accountName: accountName,
                countryCode: country || '',
                balance: compte.solde || 0,
                flag: this.getCountryFlag(country || '')
              };
            });
            
            this.bannerTitle = '💰 Soldes de tous les comptes';
          } else {
            // Convertir en format pour l'affichage
            this.accountBalances = comptesClients.map(compte => {
              const accountName = compte.numeroCompte || compte.codeProprietaire;
              let country = compte.pays;
              
              // Si le code pays n'est pas dans les données, l'extraire du nom du compte
              if (!country || country.trim() === '') {
                console.log('[BALANCES] Pays manquant pour:', accountName, '- extraction depuis le nom');
                country = this.extractCountryCodeFromAccountName(accountName);
                console.log('[BALANCES] Pays extrait:', country, 'pour:', accountName);
              } else {
                console.log('[BALANCES] Pays trouvé dans données:', country, 'pour:', accountName);
              }
              
              return {
                accountName: accountName,
                countryCode: country || '',
                balance: compte.solde || 0,
                flag: this.getCountryFlag(country || '')
              };
            });
            
            this.bannerTitle = '💰 Soldes des comptes clients';
          }
          
          // Filtrer les comptes avec solde > 0
          this.accountBalances = this.accountBalances.filter(b => b.balance > 0);
          
          // Trier par solde décroissant
          this.accountBalances.sort((a, b) => b.balance - a.balance);
          
          console.log('[BALANCES] Nombre de comptes après filtrage:', this.accountBalances.length);
          console.log('[BALANCES] Tous les comptes avec codes pays:', this.accountBalances.map(b => 
            `${b.flag} [${b.countryCode}] ${b.accountName}: ${b.balance.toLocaleString()}`
          ));
          
          
          // Dupliquer pour effet de boucle infinie
          this.accountBalances = [...this.accountBalances, ...this.accountBalances];
          
          console.log('[BALANCES] Total items dans la bande (avec duplication):', this.accountBalances.length);
        },
        error: (err) => {
          console.error('Erreur lors du chargement des soldes:', err);
          // Fallback: essayer avec agencySummaryService
          this.loadAccountBalancesFromSummary();
        }
      });
    }
    
    // Méthode de fallback utilisant agencySummaryService
    // NOTE: Cette méthode ne peut pas filtrer par type d'opération car agencySummaryService
    // ne fournit pas le détail des types d'opérations, seulement les totaux par agence
    private loadAccountBalancesFromSummary() {
      this.agencySummaryService.getAllSummaries().subscribe({
        next: (data: any[]) => {
          console.log('[BALANCES FALLBACK] Données reçues:', data.length, 'enregistrements');
          const recentData = data.filter(item => this.isUpdatedWithinLastTwoWeeks(item.date));
          console.log('[BALANCES FALLBACK] Données récentes (2 semaines):', recentData.length, 'enregistrements');
          
          const balancesByAccount: {[key: string]: {balance: number, countryCode: string}} = {};
          
          recentData.forEach((item: any) => {
            const accountName = item.agency;
            let country = item.pays || item.country;
            
            if (accountName && accountName.trim() !== '') {
              // Si le code pays n'est pas dans les données, l'extraire du nom du compte
              if (!country || country.trim() === '') {
                country = this.extractCountryCodeFromAccountName(accountName);
              }
              
              if (!balancesByAccount[accountName]) {
                balancesByAccount[accountName] = {
                  balance: 0,
                  countryCode: country || ''
                };
              }
              balancesByAccount[accountName].balance += Number(item.totalVolume) || 0;
              if (!balancesByAccount[accountName].countryCode && country) {
                balancesByAccount[accountName].countryCode = country;
              }
            }
          });
          
          this.accountBalances = Object.keys(balancesByAccount)
            .map(accountName => ({
              accountName: accountName,
              countryCode: balancesByAccount[accountName].countryCode,
              balance: balancesByAccount[accountName].balance,
              flag: this.getCountryFlag(balancesByAccount[accountName].countryCode)
            }))
            .filter(b => b.balance > 0);
          
          this.accountBalances.sort((a, b) => b.balance - a.balance);
          this.accountBalances = [...this.accountBalances, ...this.accountBalances];
          
          console.log('[BALANCES FALLBACK] Comptes chargés:', this.accountBalances.length / 2);
          console.log('[BALANCES FALLBACK] Tous les comptes avec codes pays:', this.accountBalances.slice(0, this.accountBalances.length / 2).map(b => 
            `${b.flag} [${b.countryCode}] ${b.accountName}: ${b.balance.toLocaleString()}`
          ));
        },
        error: (err) => {
          console.error('Erreur lors du chargement des soldes (fallback):', err);
        }
      });
    }

    private isUpdatedWithinLastTwoWeeks(dateValue?: string): boolean {
      if (!dateValue) {
        return false;
      }

      const updatedAt = new Date(dateValue);
      if (isNaN(updatedAt.getTime())) {
        return false;
      }

      const now = new Date();
      const threshold = new Date(now);
      threshold.setDate(now.getDate() - 14);
      return updatedAt >= threshold && updatedAt <= now;
    }

    // Fonction pour calculer la durée d'animation en fonction du nombre de comptes
    getScrollDuration(): number {
      // Diviser par 2 car on a dupliqué les comptes
      const uniqueAccountsCount = this.accountBalances.length / 2;
      // Durée de base: 60s, puis ajouter 3s par compte supplémentaire
      // Minimum 60s, maximum 300s (5 minutes)
      const duration = Math.min(300, Math.max(60, 60 + (uniqueAccountsCount - 5) * 3));
      return duration;
    }

    // Fonction pour obtenir le nom complet du pays
    getCountryName(countryCode: string): string {
      const countryNames: {[key: string]: string} = {
        // Afrique Centrale
        'CM': 'Cameroun', 'CF': 'Centrafrique', 'TD': 'Tchad', 'CG': 'Congo',
        'CD': 'RDC', 'GQ': 'Guinée Équatoriale', 'GA': 'Gabon', 'ST': 'Sao Tomé', 'AO': 'Angola',
        
        // Afrique de l'Ouest
        'CI': 'Côte d\'Ivoire', 'BF': 'Burkina Faso', 'SN': 'Sénégal', 'TG': 'Togo',
        'BJ': 'Bénin', 'ML': 'Mali', 'NE': 'Niger', 'GN': 'Guinée', 'GW': 'Guinée-Bissau',
        'SL': 'Sierra Leone', 'LR': 'Liberia', 'GH': 'Ghana', 'NG': 'Nigeria',
        'MR': 'Mauritanie', 'GM': 'Gambie', 'CV': 'Cap-Vert',
        
        // Afrique de l'Est
        'KE': 'Kenya', 'TZ': 'Tanzanie', 'UG': 'Ouganda', 'RW': 'Rwanda', 'BI': 'Burundi',
        'ET': 'Éthiopie', 'SO': 'Somalie', 'DJ': 'Djibouti', 'ER': 'Érythrée',
        'SS': 'Soudan du Sud', 'SD': 'Soudan', 'SC': 'Seychelles', 'MU': 'Maurice',
        'KM': 'Comores', 'MG': 'Madagascar',
        
        // Afrique du Nord
        'MA': 'Maroc', 'DZ': 'Algérie', 'TN': 'Tunisie', 'LY': 'Libye', 'EG': 'Égypte',
        'EH': 'Sahara Occidental',
        
        // Afrique Australe
        'ZA': 'Afrique du Sud', 'NA': 'Namibie', 'BW': 'Botswana', 'ZW': 'Zimbabwe',
        'ZM': 'Zambie', 'MW': 'Malawi', 'MZ': 'Mozambique', 'SZ': 'Eswatini', 'LS': 'Lesotho',
        
        // Europe
        'FR': 'France', 'GB': 'Royaume-Uni', 'DE': 'Allemagne', 'IT': 'Italie',
        'ES': 'Espagne', 'PT': 'Portugal', 'BE': 'Belgique', 'NL': 'Pays-Bas',
        'CH': 'Suisse', 'AT': 'Autriche', 'GR': 'Grèce', 'PL': 'Pologne',
        'RO': 'Roumanie', 'CZ': 'Rép. Tchèque', 'SE': 'Suède', 'NO': 'Norvège',
        'DK': 'Danemark', 'FI': 'Finlande', 'IE': 'Irlande', 'RU': 'Russie', 'UA': 'Ukraine',
        
        // Amériques
        'US': 'États-Unis', 'CA': 'Canada', 'MX': 'Mexique', 'BR': 'Brésil',
        'AR': 'Argentine', 'CL': 'Chili', 'CO': 'Colombie', 'PE': 'Pérou', 'VE': 'Venezuela',
        
        // Asie
        'CN': 'Chine', 'JP': 'Japon', 'IN': 'Inde', 'KR': 'Corée du Sud',
        'SA': 'Arabie Saoudite', 'AE': 'Émirats', 'TR': 'Turquie', 'IL': 'Israël',
        'TH': 'Thaïlande', 'VN': 'Vietnam', 'SG': 'Singapour', 'MY': 'Malaisie',
        'ID': 'Indonésie', 'PH': 'Philippines', 'PK': 'Pakistan', 'BD': 'Bangladesh', 'LK': 'Sri Lanka',
        
        // Océanie
        'AU': 'Australie', 'NZ': 'Nouvelle-Zélande',
        
        // Moyen-Orient
        'LB': 'Liban', 'JO': 'Jordanie', 'SY': 'Syrie', 'IQ': 'Irak', 'IR': 'Iran',
        'KW': 'Koweït', 'QA': 'Qatar', 'BH': 'Bahreïn', 'OM': 'Oman', 'YE': 'Yémen',
        
        // Autres
        'HT': 'Haïti',
      };
      return countryNames[countryCode?.toUpperCase()] || countryCode;
    }

    getGlpiTicketUrlFromDashboard(ticketId: string): string {
      return `https://glpi.intouchgroup.net/glpi/public/front/ticket.form.php?id=${ticketId}`;
    }

    getBometierTicketUrlFromDashboard(ticketId: string): string {
      return `https://bometier.gutouch.net/details-ticket/${ticketId}`;
    }

    async showTicketOptionsPopupFromDashboard(ticketId: string): Promise<void> {
      const normalizedTicketId = (ticketId || '').trim();
      if (!normalizedTicketId) {
        return;
      }

      const message = `Choisissez la plateforme pour ouvrir le ticket ${normalizedTicketId}:`;
      const title = 'Ouvrir le ticket';

      const overlay = document.createElement('div');
      overlay.className = 'modern-popup-overlay';
      overlay.innerHTML = `
          <div class="modern-popup popup-type-info">
              <div class="popup-header">
                  <div class="popup-title-wrapper">
                      <span class="popup-icon">🎫</span>
                      <h3 class="popup-title">${title}</h3>
                  </div>
                  <button class="popup-close" aria-label="Fermer">×</button>
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
          this.openGlpiTicketFromDashboard(normalizedTicketId);
      });

      overlay.querySelector('.popup-btn-bometier')?.addEventListener('click', () => {
          cleanup();
          this.openBometierTicketFromDashboard(normalizedTicketId);
      });
    }

    // Ouvrir un ticket GLPI existant
    openGlpiTicketFromDashboard(ticketId: string): void {
      const normalizedTicketId = (ticketId || '').trim();
      if (!normalizedTicketId) {
        return;
      }
      const url = this.getGlpiTicketUrlFromDashboard(normalizedTicketId);
      window.open(url, '_blank', 'noopener,noreferrer');
    }

    // Ouvrir un ticket BOMETIER existant
    openBometierTicketFromDashboard(ticketId: string): void {
      const normalizedTicketId = (ticketId || '').trim();
      if (!normalizedTicketId) {
        return;
      }
      const url = this.getBometierTicketUrlFromDashboard(normalizedTicketId);
      window.open(url, '_blank', 'noopener,noreferrer');
    }

    // Méthodes pour gérer le modal des graphiques
    openGraphModal(): void {
        this.showGraphModal = true;
    }

    closeGraphModal(): void {
        this.showGraphModal = false;
    }
} 