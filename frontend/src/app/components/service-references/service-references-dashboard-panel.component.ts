import { Component, EventEmitter, Input, OnChanges, OnDestroy, OnInit, Output, SimpleChanges } from '@angular/core';
import { FormControl } from '@angular/forms';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';

import {
    ServiceReference,
    ServiceReferenceDashboard,
    ServiceReferenceDashboardDisplayMode,
    ServiceCountryVolume
} from '../../models/service-reference.model';
import { ServiceReferenceService } from '../../services/service-reference.service';

interface ServiceRefDashboardOperatorGroup {
    operateurLabel: string;
    items: ServiceReference[];
}

interface ServiceRefDashboardGroup {
    serviceTypeLabel: string;
    operators: ServiceRefDashboardOperatorGroup[];
}

type DashboardFilterDimension = 'pays' | 'serviceType' | 'operateur' | 'reseau';

@Component({
    selector: 'app-service-references-dashboard-panel',
    templateUrl: './service-references-dashboard-panel.component.html',
    styleUrls: ['./service-references-dashboard-panel.component.scss']
})
export class ServiceReferencesDashboardPanelComponent implements OnInit, OnChanges, OnDestroy {
    @Input() references: ServiceReference[] = [];
    @Input() isLoading = false;
    @Input() showImportHint = false;
    /** Affiche les colonnes détaillées réconciliables / non réconciliables. */
    @Input() showDetailColumns = true;
    /** Charge les données via l'API si aucune référence n'est fournie par le parent. */
    @Input() loadOwnData = false;
    /** Vue compacte (dashboard principal) : KPIs + filtres sur une ligne. */
    @Input() compactLayout = false;
    /** Bouton « Ouvrir les détails » dans la barre de filtres (mode compact). */
    @Input() showOpenDetailsButton = false;
    @Output() openDetails = new EventEmitter<void>();
    @Output() periodMonthsChange = new EventEmitter<number>();

    private readonly destroy$ = new Subject<void>();
    private internalReferences: ServiceReference[] = [];
    private dashboardStats: ServiceReferenceDashboard[] = [];
    private serviceAgencyByCountryService = new Map<string, { volume: number; transactions: number }>();
    /** Clés PAYS|service présentes dans result8rec (rapport de réconciliation). */
    private activeInReportKeys = new Set<string>();
    private statsLoading = false;

    displayMode: ServiceReferenceDashboardDisplayMode = 'nombre';
    readonly displayModeOptions: { value: ServiceReferenceDashboardDisplayMode; label: string }[] = [
        { value: 'nombre', label: 'Count (services)' },
        { value: 'transactions', label: 'Count (transactions)' },
        { value: 'volume', label: 'Volume (FCFA)' }
    ];

    /** Fenêtre glissante agency_summary (0 = toute la période). */
    periodMonths = 3;
    readonly periodMonthsOptions: { value: number; label: string }[] = [
        { value: 1, label: '1 month' },
        { value: 3, label: '3 months' },
        { value: 6, label: '6 months' },
        { value: 12, label: '12 months' },
        { value: 0, label: 'All' }
    ];

    selectedPays: string[] = [];
    selectedServiceTypes: string[] = [];
    selectedOperateurs: string[] = [];
    selectedReseaux: string[] = [];

    paysSearchCtrl = new FormControl('');
    serviceTypeSearchCtrl = new FormControl('');
    operateurSearchCtrl = new FormControl('');
    reseauSearchCtrl = new FormControl('');

    dashboardPaysOptions: string[] = [];
    dashboardServiceTypeOptions: string[] = [];
    dashboardOperateurOptions: string[] = [];
    dashboardReseauOptions: string[] = [];

    filteredPaysOptions: string[] = [];
    filteredServiceTypeOptions: string[] = [];
    filteredOperateurOptions: string[] = [];
    filteredReseauOptions: string[] = [];

    constructor(private serviceReferenceService: ServiceReferenceService) {}

    ngOnInit(): void {
        this.paysSearchCtrl.valueChanges.pipe(takeUntil(this.destroy$)).subscribe(() => this.refreshFilteredOptions());
        this.serviceTypeSearchCtrl.valueChanges.pipe(takeUntil(this.destroy$)).subscribe(() => this.refreshFilteredOptions());
        this.operateurSearchCtrl.valueChanges.pipe(takeUntil(this.destroy$)).subscribe(() => this.refreshFilteredOptions());
        this.reseauSearchCtrl.valueChanges.pipe(takeUntil(this.destroy$)).subscribe(() => this.refreshFilteredOptions());

        this.loadDashboardStats();
        this.loadActiveInReportKeys();

        if (this.loadOwnData && !this.references.length) {
            this.fetchReferences();
        } else {
            this.syncReferences();
        }
    }

    ngOnChanges(changes: SimpleChanges): void {
        if (changes['references'] && !this.loadOwnData) {
            this.syncReferences();
        }
    }

    ngOnDestroy(): void {
        this.destroy$.next();
        this.destroy$.complete();
    }

    onDashboardFilterChange(): void {
        this.updateDashboardFilterOptions();
    }

    onDisplayModeChange(): void {
        // Les getters recalculent automatiquement les cartes KPI.
    }

    onOpenDetailsClick(): void {
        this.openDetails.emit();
    }

    get panelLoading(): boolean {
        return this.isLoading || this.statsLoading;
    }

    get isStatsLoading(): boolean {
        return this.statsLoading;
    }

    private fetchReferences(): void {
        this.isLoading = true;
        this.serviceReferenceService.listAll().subscribe({
            next: (refs) => {
                this.internalReferences = refs.sort((a, b) => a.pays.localeCompare(b.pays));
                this.updateDashboardFilterOptions();
                this.isLoading = false;
            },
            error: () => {
                this.isLoading = false;
            }
        });
    }

    private loadDashboardStats(): void {
        this.statsLoading = true;
        this.serviceReferenceService.getDashboardStats(this.periodMonths).subscribe({
            next: (stats) => {
                this.dashboardStats = stats || [];
                this.statsLoading = false;
            },
            error: () => {
                this.dashboardStats = [];
                this.statsLoading = false;
            }
        });
        this.serviceReferenceService.getDashboardServiceVolumes(this.periodMonths).subscribe({
            next: (rows) => {
                this.serviceAgencyByCountryService = this.buildServiceAgencyMap(rows || []);
            },
            error: () => {
                this.serviceAgencyByCountryService = new Map();
            }
        });
    }

    onPeriodChange(): void {
        this.loadDashboardStats();
        this.loadActiveInReportKeys();
        this.periodMonthsChange.emit(this.periodMonths);
    }

    /** Recharge les données du panneau (bouton Actualiser du dashboard). */
    reloadData(): void {
        this.loadDashboardStats();
        this.loadActiveInReportKeys();
        if (this.loadOwnData) {
            this.fetchReferences();
        }
    }

    private loadActiveInReportKeys(): void {
        this.serviceReferenceService.getActiveInAgencyKeys(this.periodMonths).subscribe({
            next: (keys) => {
                this.activeInReportKeys = new Set(keys || []);
            },
            error: () => {
                this.activeInReportKeys = new Set();
            }
        });
    }

    private reportPresenceKey(pays: string, serviceCode: string): string {
        const paysNorm = (pays || '').trim().toUpperCase();
        const serviceNorm = (serviceCode || '').trim().toLowerCase();
        return `${paysNorm}|${serviceNorm}`;
    }

    /** Service référentiel réconciliable présent dans le rapport de réconciliation (result8rec). */
    private isReconciliablePresentInReport(ref: ServiceReference): boolean {
        if (!ref.reconciliable) {
            return false;
        }
        const aliases = [ref.codeService, ref.serviceLabel, ref.codeReco];
        for (const alias of aliases) {
            if (!alias || !String(alias).trim()) {
                continue;
            }
            if (this.activeInReportKeys.has(this.reportPresenceKey(ref.pays, alias))) {
                return true;
            }
        }
        return false;
    }

    private countReconciliablePresentInReport(): number {
        return this.dashboardFilteredRefs.filter((ref) => this.isReconciliablePresentInReport(ref)).length;
    }

    private buildServiceAgencyMap(rows: ServiceCountryVolume[]): Map<string, { volume: number; transactions: number }> {
        const map = new Map<string, { volume: number; transactions: number }>();
        for (const row of rows) {
            const key = this.serviceVolumeKey(row.country, row.service);
            const existing = map.get(key) ?? { volume: 0, transactions: 0 };
            existing.volume += Number(row.volume || 0);
            existing.transactions += Number(row.transactions || 0);
            map.set(key, existing);
        }
        return map;
    }

    private serviceVolumeKey(pays: string, service: string): string {
        return `${(pays || '').trim().toUpperCase()}|${this.norm(service)}`;
    }

    private findReferenceForAgencyService(pays: string, agencyService: string): ServiceReference | undefined {
        const paysNorm = this.norm(pays);
        const serviceNorm = this.norm(agencyService);
        return this.dashboardFilteredRefs.find((ref) => {
            if (this.norm(ref.pays) !== paysNorm) {
                return false;
            }
            return (
                this.norm(ref.codeService) === serviceNorm ||
                this.norm(ref.serviceLabel) === serviceNorm ||
                this.norm(ref.codeReco) === serviceNorm
            );
        });
    }

    /** Volume ou transactions agency rattachés au référentiel selon Réconciliable = OUI / NON. */
    private sumReferentialAgencyMetric(reconciliable: boolean, field: 'volume' | 'transactions'): number {
        let sum = 0;
        for (const [key, stats] of this.serviceAgencyByCountryService.entries()) {
            const sep = key.indexOf('|');
            if (sep <= 0) {
                continue;
            }
            const pays = key.slice(0, sep);
            const agencyService = key.slice(sep + 1);
            if (this.selectedPays.length && !this.selectedPays.some((p) => this.norm(p) === this.norm(pays))) {
                continue;
            }
            const ref = this.findReferenceForAgencyService(pays, agencyService);
            if (ref && ref.reconciliable === reconciliable) {
                sum += stats[field];
            }
        }
        return sum;
    }

    private syncReferences(): void {
        this.internalReferences = [...(this.references || [])];
        this.updateDashboardFilterOptions();
    }

    private get activeReferences(): ServiceReference[] {
        return this.loadOwnData ? this.internalReferences : this.references;
    }

    private norm(s: string | undefined | null): string {
        return (s ?? '').trim().toLowerCase();
    }

    private matchesMulti(selected: string[], value: string | undefined | null): boolean {
        if (!selected.length) {
            return true;
        }
        const v = this.norm(value);
        return selected.some((item) => this.norm(item) === v);
    }

    private matchesDashboardFilter(ref: ServiceReference, exclude: DashboardFilterDimension | null): boolean {
        if (exclude !== 'pays' && !this.matchesMulti(this.selectedPays, ref.pays)) {
            return false;
        }
        if (exclude !== 'serviceType' && !this.matchesMulti(this.selectedServiceTypes, ref.serviceType)) {
            return false;
        }
        if (exclude !== 'operateur' && !this.matchesMulti(this.selectedOperateurs, ref.operateur)) {
            return false;
        }
        if (exclude !== 'reseau' && !this.matchesMulti(this.selectedReseaux, ref.reseau)) {
            return false;
        }
        return true;
    }

    private get filteredDashboardStats(): ServiceReferenceDashboard[] {
        if (!this.selectedPays.length) {
            return this.dashboardStats;
        }
        return this.dashboardStats.filter((row) =>
            this.selectedPays.some((p) => this.norm(p) === this.norm(row.country))
        );
    }

    private sumStats(field: keyof ServiceReferenceDashboard): number {
        return this.filteredDashboardStats.reduce((sum, row) => sum + Number(row[field] || 0), 0);
    }

    updateDashboardFilterOptions(): void {
        const refs = this.activeReferences;
        const uniqueSorted = <T>(arr: T[]) =>
            [...new Set(arr)].sort((a, b) => String(a).localeCompare(String(b), 'fr'));

        this.dashboardPaysOptions = uniqueSorted(
            refs.filter((r) => this.matchesDashboardFilter(r, 'pays')).map((r) => r.pays)
        );
        this.dashboardServiceTypeOptions = uniqueSorted(
            refs
                .filter((r) => this.matchesDashboardFilter(r, 'serviceType'))
                .map((r) => r.serviceType)
                .filter((st): st is string => !!st && String(st).trim().length > 0)
        );
        this.dashboardOperateurOptions = uniqueSorted(
            refs
                .filter((r) => this.matchesDashboardFilter(r, 'operateur'))
                .map((r) => r.operateur)
                .filter((op): op is string => !!op && String(op).trim().length > 0)
        );
        this.dashboardReseauOptions = uniqueSorted(
            refs
                .filter((r) => this.matchesDashboardFilter(r, 'reseau'))
                .map((r) => r.reseau)
                .filter((rs): rs is string => !!rs && String(rs).trim().length > 0)
        );

        this.pruneInvalidSelections();
        this.refreshFilteredOptions();
    }

    private pruneInvalidSelections(): void {
        this.selectedPays = this.selectedPays.filter((p) =>
            this.dashboardPaysOptions.some((opt) => this.norm(opt) === this.norm(p))
        );
        this.selectedServiceTypes = this.selectedServiceTypes.filter((t) =>
            this.dashboardServiceTypeOptions.some((opt) => this.norm(opt) === this.norm(t))
        );
        this.selectedOperateurs = this.selectedOperateurs.filter((o) =>
            this.dashboardOperateurOptions.some((opt) => this.norm(opt) === this.norm(o))
        );
        this.selectedReseaux = this.selectedReseaux.filter((r) =>
            this.dashboardReseauOptions.some((opt) => this.norm(opt) === this.norm(r))
        );
    }

    private refreshFilteredOptions(): void {
        const filterBySearch = (options: string[], search: string | null | undefined) => {
            const term = this.norm(search);
            if (!term) {
                return [...options];
            }
            return options.filter((opt) => this.norm(opt).includes(term));
        };

        this.filteredPaysOptions = filterBySearch(this.dashboardPaysOptions, this.paysSearchCtrl.value);
        this.filteredServiceTypeOptions = filterBySearch(
            this.dashboardServiceTypeOptions,
            this.serviceTypeSearchCtrl.value
        );
        this.filteredOperateurOptions = filterBySearch(this.dashboardOperateurOptions, this.operateurSearchCtrl.value);
        this.filteredReseauOptions = filterBySearch(this.dashboardReseauOptions, this.reseauSearchCtrl.value);
    }

    get dashboardFilteredRefs(): ServiceReference[] {
        return this.activeReferences.filter((r) => this.matchesDashboardFilter(r, null));
    }

    get isVolumeMode(): boolean {
        return this.displayMode === 'volume';
    }

    get isTransactionsMode(): boolean {
        return this.displayMode === 'transactions';
    }

    get cardValueSuffix(): string {
        if (this.isVolumeMode) {
            return ' FCFA';
        }
        if (this.isTransactionsMode) {
            return ' TRX';
        }
        return '';
    }

    /** Total : référentiel (services) ou agrégats agency (volume / transactions). */
    get cardTotalValue(): number {
        if (this.isVolumeMode) {
            return this.sumStats('totalVolume');
        }
        if (this.isTransactionsMode) {
            return this.sumStats('totalTransactions');
        }
        return this.dashboardFilteredRefs.length;
    }

    get cardReconciliableValue(): number {
        if (this.isVolumeMode) {
            return this.sumReferentialAgencyMetric(true, 'volume');
        }
        if (this.isTransactionsMode) {
            return this.sumReferentialAgencyMetric(true, 'transactions');
        }
        return this.dashboardFilteredRefs.filter((r) => r.reconciliable).length;
    }

    get cardNonReconciliableValue(): number {
        if (this.isVolumeMode) {
            return this.sumReferentialAgencyMetric(false, 'volume');
        }
        if (this.isTransactionsMode) {
            return this.sumReferentialAgencyMetric(false, 'transactions');
        }
        return this.dashboardFilteredRefs.filter((r) => !r.reconciliable).length;
    }

    /** Réconciliés : présents dans le rapport, parmi les réconciliables (mode nombre). */
    get cardReconcilieValue(): number {
        if (this.isVolumeMode) {
            return this.sumStats('reconcilableVolume');
        }
        if (this.isTransactionsMode) {
            return this.sumStats('reconcilableTransactions');
        }
        return this.countReconciliablePresentInReport();
    }

    private get referentialReconciliableCount(): number {
        return this.dashboardFilteredRefs.filter((r) => r.reconciliable).length;
    }

    private get referentialTotalCount(): number {
        return this.dashboardFilteredRefs.length;
    }

    private get apiTotalVolume(): number {
        return this.sumStats('totalVolume');
    }

    private get apiTotalTransactions(): number {
        return this.sumStats('totalTransactions');
    }

    private percent(part: number, total: number): number {
        return total ? Math.round((100 * part) / total) : 0;
    }

    get cardReconciliablePercent(): number {
        if (this.isVolumeMode) {
            return this.percent(this.cardReconciliableValue, this.apiTotalVolume);
        }
        if (this.isTransactionsMode) {
            return this.percent(this.cardReconciliableValue, this.apiTotalTransactions);
        }
        return this.percent(this.cardReconciliableValue, this.referentialTotalCount);
    }

    get cardNonReconciliablePercent(): number {
        if (this.isVolumeMode) {
            return this.percent(this.cardNonReconciliableValue, this.apiTotalVolume);
        }
        if (this.isTransactionsMode) {
            return this.percent(this.cardNonReconciliableValue, this.apiTotalTransactions);
        }
        return this.percent(this.cardNonReconciliableValue, this.referentialTotalCount);
    }

    get cardReconciliePercent(): number {
        if (this.isVolumeMode) {
            return this.percent(this.cardReconcilieValue, this.cardReconciliableValue);
        }
        if (this.isTransactionsMode) {
            return this.percent(this.cardReconcilieValue, this.cardReconciliableValue);
        }
        return this.percent(this.cardReconcilieValue, this.referentialReconciliableCount);
    }

    /** Base du % affiché sous la carte « réconciliés ». */
    get cardReconciliePercentBasisLabel(): string {
        if (this.isVolumeMode) {
            return 'reconcilable volume';
        }
        if (this.isTransactionsMode) {
            return 'reconcilable transactions';
        }
        return this.compactLayout ? 'reconcilable' : 'total reconcilable';
    }

    get cardPercentBasisLabel(): string {
        if (this.isVolumeMode) {
            return 'total volume';
        }
        if (this.isTransactionsMode) {
            return 'total transactions';
        }
        return this.compactLayout ? 'repository' : 'total repository';
    }

    get cardTotalTitle(): string {
        if (this.isVolumeMode) {
            return 'Total volume';
        }
        if (this.isTransactionsMode) {
            return 'Total transactions';
        }
        return 'Total services';
    }

    get cardReconciliableTitle(): string {
        if (this.isVolumeMode) {
            return 'Reconcilable volume';
        }
        if (this.isTransactionsMode) {
            return 'Reconcilable transactions';
        }
        return 'Reconcilable services';
    }

    get cardReconcilieTitle(): string {
        if (this.isVolumeMode) {
            return 'Reconciled volume';
        }
        if (this.isTransactionsMode) {
            return 'Reconciled transactions';
        }
        return 'Reconciled services';
    }

    get cardNonReconciliableTitle(): string {
        if (this.isVolumeMode) {
            return 'Non-reconcilable volume';
        }
        if (this.isTransactionsMode) {
            return 'Non-reconcilable transactions';
        }
        return this.compactLayout ? 'Not reconcilable' : 'Non-reconcilable services';
    }

    get periodLabel(): string {
        if (this.periodMonths === 0) {
            return 'Entire period';
        }
        if (this.periodMonths === 1) {
            return 'Last month';
        }
        return `Last ${this.periodMonths} months`;
    }

    get dashboardTotalCardSubtitle(): string {
        let base: string;
        if (this.isVolumeMode) {
            if (!this.selectedPays.length) {
                base = 'Aggregated volume · all countries';
            } else if (this.selectedPays.length === 1) {
                base = `Volume · ${this.selectedPays[0]}`;
            } else {
                base = `Volume · ${this.selectedPays.length} countries`;
            }
        } else if (this.isTransactionsMode) {
            if (!this.selectedPays.length) {
                base = 'Aggregated transactions · all countries';
            } else if (this.selectedPays.length === 1) {
                base = `Transactions · ${this.selectedPays[0]}`;
            } else {
                base = `Transactions · ${this.selectedPays.length} countries`;
            }
        } else if (!this.selectedPays.length) {
            base = 'All countries';
        } else if (this.selectedPays.length === 1) {
            base = `Country: ${this.selectedPays[0]}`;
        } else {
            base = `${this.selectedPays.length} countries selected`;
        }
        return `${base} · ${this.periodLabel}`;
    }

    get dashboardReconciliableCount(): number {
        return this.dashboardFilteredRefs.filter((r) => r.reconciliable).length;
    }

    get dashboardNonReconciliableCount(): number {
        return this.dashboardFilteredRefs.filter((r) => !r.reconciliable).length;
    }

    get dashboardReconciliablePercent(): number {
        return this.percent(this.dashboardReconciliableCount, this.dashboardFilteredRefs.length);
    }

    get dashboardNonReconciliablePercent(): number {
        return this.percent(this.dashboardNonReconciliableCount, this.dashboardFilteredRefs.length);
    }

    get groupedDashboardReconciliable(): ServiceRefDashboardGroup[] {
        return this.buildServiceRefGroups(this.dashboardFilteredRefs.filter((r) => r.reconciliable));
    }

    get groupedDashboardNonReconciliable(): ServiceRefDashboardGroup[] {
        return this.buildServiceRefGroups(this.dashboardFilteredRefs.filter((r) => !r.reconciliable));
    }

    private buildServiceRefGroups(refs: ServiceReference[]): ServiceRefDashboardGroup[] {
        const byType = new Map<string, Map<string, ServiceReference[]>>();
        for (const ref of refs) {
            const typeKey = (ref.serviceType || '').trim().toUpperCase() || '(SANS TYPE)';
            const opKey = (ref.operateur || '').trim().toUpperCase() || '(SANS OPÉRATEUR)';
            if (!byType.has(typeKey)) {
                byType.set(typeKey, new Map());
            }
            const opMap = byType.get(typeKey)!;
            if (!opMap.has(opKey)) {
                opMap.set(opKey, []);
            }
            opMap.get(opKey)!.push(ref);
        }
        const types = [...byType.keys()].sort((a, b) => a.localeCompare(b, 'fr'));
        return types.map((serviceTypeLabel) => {
            const opMap = byType.get(serviceTypeLabel)!;
            const ops = [...opMap.keys()].sort((a, b) => a.localeCompare(b, 'fr'));
            return {
                serviceTypeLabel,
                operators: ops.map((operateurLabel) => ({
                    operateurLabel,
                    items: (opMap.get(operateurLabel) || []).sort((a, b) =>
                        a.codeService.localeCompare(b.codeService, undefined, { sensitivity: 'base' })
                    )
                }))
            };
        });
    }

    isReferenceActive(ref: ServiceReference): boolean {
        return String(ref.status || 'ACTIF').toUpperCase() !== 'INACTIF';
    }

    trackDashboardGroup(_index: number, g: ServiceRefDashboardGroup): string {
        return g.serviceTypeLabel;
    }

    trackDashboardOp(_index: number, o: ServiceRefDashboardOperatorGroup): string {
        return o.operateurLabel;
    }

    trackDashboardRef(_index: number, r: ServiceReference): string {
        return r.id != null ? String(r.id) : `${r.pays}|${r.codeService}|${r.codeReco}`;
    }
}
