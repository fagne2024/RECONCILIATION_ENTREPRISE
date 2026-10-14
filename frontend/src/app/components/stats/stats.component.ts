import { Component, OnInit, OnDestroy, ViewChild } from '@angular/core';
import { SharedUiModule } from '../../shared/shared-ui.module';
import { AppStateService } from '../../services/app-state.service';
import { DataNormalizationService } from '../../services/data-normalization.service';
import { FormBuilder, FormGroup, FormControl } from '@angular/forms';
import { Subscription } from 'rxjs';
import { Router } from '@angular/router';
import { AgencySummaryService } from '../../services/agency-summary.service';
import * as ExcelJS from 'exceljs';
// @ts-ignore
import * as FileSaver from 'file-saver';
import { MatSelect } from '@angular/material/select';
import { ModernPopupComponent, PopupConfig } from '../modern-popup/modern-popup.component';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import { normalizeCountryFilterOptions, matchesCountryFilter, countriesMatch } from '../../utils/country-codes.util';
import { TranslateModule } from '@ngx-translate/core';

interface AggregatedStatRow {
    agency: string;
    service: string;
    country: string;
    date: string;
    totalVolume: number;
    recordCount: number;
    ids: number[];
}

interface AgencyReportCell {
    volume: number;
    count: number;
}

interface AgencyReportRow {
    agency: string;
    totalVolume: number;
    totalCount: number;
    activeDays: number;
    daily: { [dateKey: string]: AgencyReportCell };
}

type VariationFilter = 'all' | 'up' | 'dn' | 'eq' | 'na';

interface VariationViewModel {
    cls: 'up' | 'dn' | 'eq' | 'na';
    icon: string;
    label: string;
    pct: number | null;
    barWidth: number;
    hint: string;
    captionDash: boolean;
    volJ1Fmt: string;
    deltaFmt: string | null;
}

@Component({
    selector: 'app-stats',
    standalone: true,
    imports: [TranslateModule, SharedUiModule],
    templateUrl: './stats.component.html',
    styleUrls: ['./stats.component.scss']
})
export class StatsComponent implements OnInit, OnDestroy {
    private readonly BATCH_SIZE = 1000;
    private readonly BATCH_DELAY = 20;
    private readonly CACHE_EXPIRY = 5 * 60 * 1000;

    filterForm: FormGroup;
    agencySummaries: any[] = [];
    filteredData: any[] = [];
    aggregatedStatsCache: AggregatedStatRow[] = [];
    visibleAggregatedStatsCache: AggregatedStatRow[] = [];
    pagedStatsCache: AggregatedStatRow[] = [];
    totalRecordsCache: number = 0;
    totalVolumeCache: number = 0;
    statsPage: number = 1;
    statsPageSize: number = 10;
    /** Affiche toutes les lignes agrégées du tableau sans pagination (bouton « Voir plus »). */
    showAllStatsTableRows = false;
    isLoading: boolean = false;
    showAllStatsHistory: boolean = false;
    errorMessage: string | null = null;
    showAgencyReport: boolean = false;
    reportMode: 'both' | 'vol' | 'trx' = 'both';
    reportSearchTerm: string = '';
    reportSelectedAgency: string = 'all';
    reportDateKeys: string[] = [];
    reportRows: AgencyReportRow[] = [];
    reportAgencyOptions: string[] = [];
    visibleReportRows: AgencyReportRow[] = [];
    visibleReportTotalsByDate: { [dateKey: string]: AgencyReportCell } = {};
    visibleReportSummary = {
        totalVolume: 0,
        totalCount: 0,
        activeAgencies: 0,
        avgVolumePerDay: 0,
        peakDayKey: '',
        peakDayVolume: 0
    };

    private cache: {
        [key: string]: {
            data: any[];
            timestamp: number;
        }
    } = {};

    private subscription: Subscription = new Subscription();
    private lastStatsFetchKey = '';

    // Ajout des contrôles de recherche et des variables de sélection
    agenceSearchCtrl = new FormControl('');
    serviceSearchCtrl = new FormControl('');
    paysSearchCtrl = new FormControl('');
    // Supprimer selectedAgency, selectedService, selectedCountry
    filteredAgencies: string[] = [];
    filteredServices: string[] = [];
    filteredCountries: string[] = [];

    // Variables pour la sélection multiple
    selectedSummaries: Set<any> = new Set();
    allSelected: boolean = false;
    selectedSummaryIds: Set<string> = new Set(); // Pour identifier les statistiques sélectionnées par leur clé unique

    showVariation: boolean = true;
    /** Largeur de la colonne « variation » (curseur px, 50–360). */
    variationColumnWidthPx = 260;
    private aggregatedIndexByDateKey: Map<string, AggregatedStatRow> = new Map();

    @ViewChild('agenceSelect') agenceSelect!: MatSelect;
    @ViewChild('serviceSelect') serviceSelect!: MatSelect;
    @ViewChild('paysSelect') paysSelect!: MatSelect;

    constructor(
        private appStateService: AppStateService,
        private dataNormalizationService: DataNormalizationService,
        private fb: FormBuilder,
        private router: Router,
        private agencySummaryService: AgencySummaryService
    ) {
        this.filterForm = this.fb.group({
            agency: [[]],
            service: [[]],
            country: [[]],
            startDate: [''],
            endDate: [''],
            referenceDate: [''],
            variationFilter: ['all' as VariationFilter]
        });
    }

    async ngOnInit() {
        console.log('StatsComponent initialisé');
        this.filterForm = this.fb.group({
            agency: [[]],
            service: [[]],
            country: [[]],
            startDate: [''],
            endDate: [''],
            referenceDate: [''],
            variationFilter: ['all' as VariationFilter]
        });

        const initialRange = this.currentMonthDateRange();
        this.filterForm.patchValue(
            {
                startDate: initialRange.startDate,
                endDate: initialRange.endDate
            },
            { emitEvent: false }
        );

        // Ajouter des listeners pour les changements de filtres
        this.filterForm.valueChanges.subscribe(() => {
            this.applyFilters();
        });

        this.loadData();

        // Initialisation des listes filtrées
        // SUPPRIMER l'initialisation des listes filtrées ici
        // this.filteredAgencies = this.getAllAgencies();
        // this.filteredServices = this.getAllServices();
        // this.filteredCountries = this.getAllCountries();
        this.agenceSearchCtrl.setValue('');
        this.serviceSearchCtrl.setValue('');
        this.paysSearchCtrl.setValue('');
        // Gestion de la recherche dynamique
        this.agenceSearchCtrl.valueChanges.subscribe((search: string | null) => {
            const s = (search || '').toLowerCase();
            const availableAgencies = this.getFilteredAgencies();
            this.filteredAgencies = availableAgencies.filter(a => a.toLowerCase().includes(s));
            if (this.filteredAgencies.length === 1 && !this.filterForm.value.agency.includes(this.filteredAgencies[0])) {
                this.filterForm.controls['agency'].setValue([this.filteredAgencies[0]]);
                // Fermer automatiquement le dropdown après sélection
                setTimeout(() => {
                    if (this.agenceSelect) { this.agenceSelect.close(); }
                }, 100);
                this.onFilterChange();
            }
        });
        this.serviceSearchCtrl.valueChanges.subscribe((search: string | null) => {
            const s = (search || '').toLowerCase();
            const availableServices = this.getFilteredServices();
            this.filteredServices = availableServices.filter(a => a.toLowerCase().includes(s));
            if (this.filteredServices.length === 1 && !this.filterForm.value.service.includes(this.filteredServices[0])) {
                this.filterForm.controls['service'].setValue([this.filteredServices[0]]);
                // Fermer automatiquement le dropdown après sélection
                setTimeout(() => {
                    if (this.serviceSelect) { this.serviceSelect.close(); }
                }, 100);
                this.onFilterChange();
            }
        });
        this.paysSearchCtrl.valueChanges.subscribe((search: string | null) => {
            const s = (search || '').toLowerCase();
            const availableCountries = this.getFilteredCountries();
            this.filteredCountries = availableCountries.filter(a => a.toLowerCase().includes(s));
            if (this.filteredCountries.length === 1 && !this.filterForm.value.country.includes(this.filteredCountries[0])) {
                this.filterForm.controls['country'].setValue([this.filteredCountries[0]]);
                // Fermer automatiquement le dropdown après sélection
                setTimeout(() => {
                    if (this.paysSelect) { this.paysSelect.close(); }
                }, 100);
                this.onFilterChange();
            }
        });
    }

    ngOnDestroy() {
        this.subscription.unsubscribe();
    }

    trackByString(_: number, value: string): string {
        return value;
    }

    trackByNumber(_: number, value: number): number {
        return value;
    }

    trackByAggregatedStat(_: number, row: AggregatedStatRow): string {
        return `${row.agency}|${row.service}|${row.country}|${row.date}`;
    }

    private loadData() {
        this.isLoading = true;
        const { filters, key } = this.buildStatsFetchScope();
        this.lastStatsFetchKey = key;
        this.agencySummaryService.getAllSummaries('Statistiques', filters).subscribe({
            next: (data) => {
                console.log('Données reçues de l\'API agency-summary:', key, data);
                this.agencySummaries = data;
                // Initialiser les listes filtrées avec cloisonnement
                this.updateFilteredLists();
                this.applyFilters();
                this.isLoading = false;
            },
            error: async (error) => {
                console.error('Erreur lors du chargement des données:', error);
                this.errorMessage = 'Erreur lors du chargement des données';
                this.isLoading = false;
                await this.showErrorMessage('Erreur lors du chargement des données');
            }
        });
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

    private buildStatsFetchScope(): {
        filters: {
            agencies?: string[];
            services?: string[];
            countries?: string[];
            startDate?: string;
            endDate?: string;
        };
        key: string;
    } {
        const form = this.filterForm.value || {};
        const filters: {
            agencies?: string[];
            services?: string[];
            countries?: string[];
            startDate?: string;
            endDate?: string;
        } = {};
        const agencies = Array.isArray(form.agency) ? form.agency.filter(Boolean) : [];
        const services = Array.isArray(form.service) ? form.service.filter(Boolean) : [];
        const countries = Array.isArray(form.country) ? form.country.filter(Boolean) : [];
        if (agencies.length) {
            filters.agencies = agencies;
        }
        if (services.length) {
            filters.services = services;
        }
        if (countries.length) {
            filters.countries = countries;
        }
        if (form.startDate) {
            filters.startDate = form.startDate;
        }
        if (form.endDate) {
            filters.endDate = form.endDate;
        }
        if (!filters.startDate && !filters.endDate && !this.showAllStatsHistory) {
            const month = this.currentMonthDateRange();
            filters.startDate = month.startDate;
            filters.endDate = month.endDate;
        }

        const key = JSON.stringify({
            agencies: filters.agencies || [],
            services: filters.services || [],
            countries: filters.countries || [],
            startDate: filters.startDate || '',
            endDate: filters.endDate || '',
            all: this.showAllStatsHistory
        });

        return { filters, key };
    }

    private shouldReloadStatsForCurrentScope(): boolean {
        return !this.isLoading && this.buildStatsFetchScope().key !== this.lastStatsFetchKey;
    }

    /** Recharge les données sans réinitialiser les filtres (client, service, pays, dates, variation, rapport). */
    refreshStatsData(): void {
        if (this.isLoading) {
            return;
        }
        this.lastStatsFetchKey = '';
        this.loadData();
    }

    toggleStatsHistoryScope(): void {
        this.showAllStatsHistory = !this.showAllStatsHistory;
        if (!this.showAllStatsHistory) {
            const month = this.currentMonthDateRange();
            this.filterForm.patchValue(
                {
                    startDate: month.startDate,
                    endDate: month.endDate
                },
                { emitEvent: false }
            );
        } else if (this.filterForm.value.startDate || this.filterForm.value.endDate) {
            this.filterForm.patchValue(
                {
                    startDate: '',
                    endDate: ''
                },
                { emitEvent: false }
            );
        }
        this.loadData();
    }

    getFilteredAgencies(): string[] {
        let data = this.agencySummaries;
        // Filtrer par service si sélectionné
        if (this.filterForm.value.service && this.filterForm.value.service.length > 0) {
            data = data.filter(s => this.filterForm.value.service.includes(s.service));
        }
        // Filtrer par pays si sélectionné
        if (this.filterForm.value.country && this.filterForm.value.country.length > 0) {
            data = data.filter(s => matchesCountryFilter(s.country, this.filterForm.value.country));
        }
        const agencies = [...new Set(data.map(s => s.agency))];
        return agencies.sort();
    }

    getFilteredServices(): string[] {
        let data = this.agencySummaries;
        // Filtrer par agence si sélectionnée (cloisonnement principal)
        if (this.filterForm.value.agency && this.filterForm.value.agency.length > 0) {
            data = data.filter(s => this.filterForm.value.agency.includes(s.agency));
        }
        // Filtrer par pays si sélectionné
        if (this.filterForm.value.country && this.filterForm.value.country.length > 0) {
            data = data.filter(s => matchesCountryFilter(s.country, this.filterForm.value.country));
        }
        const services = [...new Set(data.map(s => s.service))];
        return services.sort();
    }

    getFilteredCountries(): string[] {
        let data = this.agencySummaries;
        // Filtrer par agence si sélectionnée (cloisonnement principal)
        if (this.filterForm.value.agency && this.filterForm.value.agency.length > 0) {
            data = data.filter(s => this.filterForm.value.agency.includes(s.agency));
        }
        // Filtrer par service si sélectionné
        if (this.filterForm.value.service && this.filterForm.value.service.length > 0) {
            data = data.filter(s => this.filterForm.value.service.includes(s.service));
        }
        const countries = normalizeCountryFilterOptions(data.map(s => s.country));
        return countries;
    }

    // Harmonisation de la méthode de filtrage
    applyFilters() {
        console.log('applyFilters() appelé');
        console.log('Filtres actuels:', this.filterForm.value);
        console.log('agencySummaries length:', this.agencySummaries.length);

        if (this.shouldReloadStatsForCurrentScope()) {
            this.loadData();
            return;
        }
        
        const filters = this.filterForm.value;
        const startDate = filters.startDate ? this.getStartOfDay(filters.startDate) : null;
        const endDate = filters.endDate ? this.getEndOfDay(filters.endDate) : null;

        this.filteredData = this.agencySummaries.filter(summary => {
            const summaryDate = new Date(summary.date);
            const afterStart = !startDate || summaryDate >= startDate;
            const beforeEnd = !endDate || summaryDate <= endDate;
            const agencyMatch = !filters.agency || filters.agency.length === 0 || filters.agency.includes(summary.agency);
            const serviceMatch = !filters.service || filters.service.length === 0 || filters.service.includes(summary.service);
            const countryMatch = matchesCountryFilter(summary.country, filters.country);
            
            const match = agencyMatch && serviceMatch && countryMatch && afterStart && beforeEnd;
            
            // Log pour diagnostiquer le filtrage par service
            if (filters.service && filters.service.length > 0) {
                console.log('Filtrage service:', {
                    summaryService: summary.service,
                    selectedServices: filters.service,
                    serviceMatch,
                    match
                });
            }
            
            return match;
        });
        
        // Trier par date décroissante (du plus récent au plus ancien)
        this.filteredData.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        this.statsPage = 1;
        this.showAllStatsTableRows = false;
        this.rebuildDerivedData();
        
        console.log('Données après filtrage et tri:', this.filteredData.length);
        console.log('Sample des données filtrées:', this.filteredData.slice(0, 3));
        // totalPages est maintenant un getter, pas besoin de l'assigner manuellement
    }

    toggleVariationColumn(): void {
        this.showVariation = !this.showVariation;
    }

    private getReferenceDateKeyForRow(row: AggregatedStatRow): string | null {
        // Si l'utilisateur force une date de référence, on l'utilise
        const ref = this.filterForm?.value?.referenceDate;
        if (ref) {
            return this.toDateKey(ref);
        }

        // Sinon: "date précédente" = J-1 de la date de la ligne
        const rowKey = this.toDateKey(row.date);
        if (!rowKey) {
            return null;
        }

        const rowDate = new Date(rowKey);
        if (isNaN(rowDate.getTime())) {
            return null;
        }
        rowDate.setDate(rowDate.getDate() - 1);
        return this.toDateKey(rowDate);
    }

    private buildAggregatedIndexByDateKey(rows: AggregatedStatRow[]): Map<string, AggregatedStatRow> {
        const idx = new Map<string, AggregatedStatRow>();
        rows.forEach(r => {
            const dk = this.toDateKey(r.date);
            if (!dk) {
                return;
            }
            idx.set(`${r.agency}|${r.service}|${r.country}|${dk}`, r);
        });
        return idx;
    }

    getVariationForRow(row: AggregatedStatRow): VariationViewModel {
        const refKey = this.getReferenceDateKeyForRow(row);
        const currKey = this.toDateKey(row.date);

        if (!refKey || !currKey) {
            return {
                cls: 'na',
                icon: '•',
                label: 'Nouveau',
                pct: null,
                barWidth: 0,
                hint: 'Aucune date de référence',
                captionDash: true,
                volJ1Fmt: '',
                deltaFmt: null
            };
        }

        const refRow = this.aggregatedIndexByDateKey.get(`${row.agency}|${row.service}|${row.country}|${refKey}`);
        const prev = refRow ? Number(refRow.totalVolume) || 0 : 0;
        const curr = Number(row.totalVolume) || 0;

        const pct = this.pct(curr, prev);
        const cls = this.varClass(pct);
        const icon = this.varIcon(cls);
        const bw = this.barWidth(pct);
        const delta = curr - prev;

        const captionDash = pct === null;

        const hint = captionDash
            ? `Vol. J-1 : —`
            : `Vol. J-1 : ${this.fmtN(prev)} ${(delta >= 0 ? '+' : '')}${this.fmtN(delta)}`;

        const label = pct === null ? 'Nouveau' : (pct === 0 ? 'Stable' : this.fmtP(pct));

        const volJ1Fmt = captionDash ? '' : this.fmtN(prev);
        const deltaFmt =
            captionDash
                ? null
                : `${delta >= 0 ? '+' : '-'}${this.fmtN(Math.abs(delta))}`;

        return {
            cls,
            icon,
            label,
            pct,
            barWidth: bw,
            hint,
            captionDash,
            volJ1Fmt,
            deltaFmt
        };
    }

    private pct(curr: number, prev: number): number | null {
        if (prev === 0 && curr > 0) return null;
        if (prev === 0 && curr === 0) return 0;
        return ((curr - prev) / prev * 100);
    }

    private varClass(p: number | null): 'up' | 'dn' | 'eq' | 'na' {
        if (p === null) return 'na';
        if (p > 0.5) return 'up';
        if (p < -0.5) return 'dn';
        return 'eq';
    }

    private varIcon(cls: 'up' | 'dn' | 'eq' | 'na'): string {
        if (cls === 'up') return '↑';
        if (cls === 'dn') return '↓';
        if (cls === 'na') return '•';
        return '→';
    }

    private barWidth(p: number | null): number {
        if (p === null) return 0;
        return Math.min(100, Math.abs(p) * 2);
    }

    private fmtN(v: number): string {
        // En "fr-FR", le séparateur de milliers peut être un espace insécable fine (U+202F).
        // Pour coller au rendu attendu (ex: "14 200 000"), on normalise en espace simple.
        return (Number(v) || 0)
            .toLocaleString('fr-FR')
            .replace(/\u202F/g, ' ')
            .replace(/\u00A0/g, ' ');
    }

    private fmtP(v: number): string {
        const s = (v >= 0 ? '+' : '') + v.toFixed(1) + '%';
        return s.replace('.', ',');
    }

    private formatDateKeyForUi(dateKey: string): string {
        const [y, m, d] = dateKey.split('-');
        if (!y || !m || !d) return dateKey;
        return `${d}/${m}/${y}`;
    }

    private getStartOfDay(dateValue: string): Date {
        const date = new Date(dateValue);
        date.setHours(0, 0, 0, 0);
        return date;
    }

    private getEndOfDay(dateValue: string): Date {
        const date = new Date(dateValue);
        date.setHours(23, 59, 59, 999);
        return date;
    }

    private toDateKey(dateValue: string | Date | null | undefined): string | null {
        if (!dateValue) {
            return null;
        }

        const date = new Date(dateValue);
        if (isNaN(date.getTime())) {
            return null;
        }

        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }

    private rebuildDerivedData(): void {
        this.aggregatedStatsCache = this.buildAggregatedStats();
        this.aggregatedIndexByDateKey = this.buildAggregatedIndexByDateKey(this.aggregatedStatsCache);
        this.visibleAggregatedStatsCache = this.applyVariationFilter(this.aggregatedStatsCache);
        this.totalRecordsCache = this.visibleAggregatedStatsCache.reduce((total, summary) => total + summary.recordCount, 0);
        this.totalVolumeCache = this.visibleAggregatedStatsCache.reduce((total, summary) => total + summary.totalVolume, 0);
        this.buildAgencyReport();
        this.updateVisibleReportData();

        if (this.statsPage > this.totalPages) {
            this.statsPage = this.totalPages || 1;
        }
        this.updatePagedStatsCache();
    }

    // Méthode appelée lors d'un changement de filtre
    onFilterChange() {
        console.log('=== DÉBUT onFilterChange() ===');
        console.log('filterForm.value:', this.filterForm.value);
        
        // Mettre à jour les listes filtrées pour le cloisonnement
        this.updateFilteredLists();
        
        this.applyFilters();
        
        // Fermer automatiquement les dropdowns après un choix
        setTimeout(() => {
            if (this.agenceSelect) this.agenceSelect.close();
            if (this.serviceSelect) this.serviceSelect.close();
            if (this.paysSelect) this.paysSelect.close();
        }, 100);
        
        console.log('=== FIN onFilterChange() ===');
    }

    // Méthode pour mettre à jour les listes filtrées avec cloisonnement
    updateFilteredLists() {
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
        const currentAgency = this.filterForm.value.agency;
        const currentService = this.filterForm.value.service;
        const currentCountry = this.filterForm.value.country;

        // Nettoyer les services si l'agence a changé
        if (currentService && currentService.length > 0) {
            const validServices = currentService.filter((service: string) => 
                this.filteredServices.includes(service)
            );
            if (validServices.length !== currentService.length) {
                this.filterForm.patchValue({ service: validServices });
            }
        }

        // Nettoyer les pays si l'agence a changé
        if (currentCountry && currentCountry.length > 0) {
            const validCountries = currentCountry.filter((country: string) =>
                this.filteredCountries.some(fc => countriesMatch(fc, country))
            );
            if (validCountries.length !== currentCountry.length) {
                this.filterForm.patchValue({ country: validCountries });
            }
        }

        // Nettoyer les agences si les autres filtres ont changé
        if (currentAgency && currentAgency.length > 0) {
            const validAgencies = currentAgency.filter((agency: string) => 
                this.filteredAgencies.includes(agency)
            );
            if (validAgencies.length !== currentAgency.length) {
                this.filterForm.patchValue({ agency: validAgencies });
            }
        }
    }

    /**
     * Agrège les statistiques en soustrayant les annulations des types d'origine
     */
    private buildAggregatedStats(): AggregatedStatRow[] {
        // Map: { [type]: { volume: number, count: number, agency, service, country, date }[] }
        const aggregation: { [key: string]: any[] } = {};
        // On regroupe par type/service/pays/agence/date
        for (const summary of this.filteredData) {
            const type = summary.service;
            const isAnnulation = type && type.startsWith('annulation_');
            let typeOrigine = type;
            if (isAnnulation) {
                typeOrigine = type.replace('annulation_', '');
            }
            // Clé d'agrégation : type d'origine + agence + pays + date
            const key = `${typeOrigine}|${summary.agency}|${summary.country}|${summary.date}`;
            if (!aggregation[key]) {
                aggregation[key] = [];
            }
            aggregation[key].push({
                ...summary,
                isAnnulation
            });
        }
        
        // Calculer les totaux corrigés
        const result: AggregatedStatRow[] = [];
        for (const key in aggregation) {
            const group = aggregation[key];
            const type = group[0].service;
            // Exclure toutes les annulations sauf annulation_bo
            if (type && type.startsWith('annulation_') && type !== 'annulation_bo') {
                continue;
            }

            // On additionne les volumes et nombres, puis on soustrait les annulations
            let totalVolume = 0;
            let recordCount = 0;
            let agency = group[0].agency;
            let service = group[0].service;
            let country = group[0].country;
            let date = group[0].date;
            let ids: number[] = []; // Collecter tous les IDs du groupe
            
            for (const item of group) {
                if (item.isAnnulation) {
                    totalVolume -= item.totalVolume;
                    recordCount -= item.recordCount;
                } else {
                    totalVolume += item.totalVolume;
                    recordCount += item.recordCount;
                }
                if (item.id) {
                    ids.push(item.id);
                }
            }

            if (recordCount !== 0 || totalVolume !== 0) {
                result.push({ 
                    agency, 
                    service, 
                    country, 
                    date, 
                    totalVolume, 
                    recordCount,
                    ids
                });
            }
        }

        return result.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    }

    getAggregatedStats(): AggregatedStatRow[] {
        return this.visibleAggregatedStatsCache;
    }

    private applyVariationFilter(rows: AggregatedStatRow[]): AggregatedStatRow[] {
        const filter: VariationFilter = (this.filterForm?.value?.variationFilter || 'all') as VariationFilter;
        if (filter === 'all') {
            return rows;
        }
        return rows.filter(r => this.getVariationForRow(r).cls === filter);
    }

    private getReportDateRangeKeys(dataDateKeys: Set<string>): string[] {
        const startDate = this.filterForm.value.startDate;
        const endDate = this.filterForm.value.endDate;

        if (startDate && endDate) {
            const start = this.getStartOfDay(startDate);
            const end = this.getStartOfDay(endDate);
            const keys: string[] = [];
            const cursor = new Date(start);

            while (cursor <= end) {
                const key = this.toDateKey(cursor);
                if (key) {
                    keys.push(key);
                }
                cursor.setDate(cursor.getDate() + 1);
            }

            return keys;
        }

        return Array.from(dataDateKeys).sort();
    }

    private buildAgencyReport(): void {
        const dateKeySet = new Set<string>();
        const rowMap = new Map<string, AgencyReportRow>();

        for (const summary of this.aggregatedStatsCache) {
            const dateKey = this.toDateKey(summary.date);
            if (!dateKey) {
                continue;
            }

            dateKeySet.add(dateKey);

            if (!rowMap.has(summary.agency)) {
                rowMap.set(summary.agency, {
                    agency: summary.agency,
                    totalVolume: 0,
                    totalCount: 0,
                    activeDays: 0,
                    daily: {}
                });
            }

            const row = rowMap.get(summary.agency)!;
            if (!row.daily[dateKey]) {
                row.daily[dateKey] = { volume: 0, count: 0 };
            }

            row.daily[dateKey].volume += Number(summary.totalVolume) || 0;
            row.daily[dateKey].count += Number(summary.recordCount) || 0;
            row.totalVolume += Number(summary.totalVolume) || 0;
            row.totalCount += Number(summary.recordCount) || 0;
        }

        this.reportDateKeys = this.getReportDateRangeKeys(dateKeySet);
        this.reportRows = Array.from(rowMap.values())
            .map(row => ({
                ...row,
                activeDays: this.reportDateKeys.filter(dateKey => {
                    const cell = row.daily[dateKey];
                    return !!cell && (cell.volume !== 0 || cell.count !== 0);
                }).length
            }))
            .sort((a, b) => {
                if (b.totalVolume !== a.totalVolume) {
                    return b.totalVolume - a.totalVolume;
                }
                return a.agency.localeCompare(b.agency);
            });

        this.reportAgencyOptions = this.reportRows.map(row => row.agency);
        if (this.reportSelectedAgency !== 'all' && !this.reportAgencyOptions.includes(this.reportSelectedAgency)) {
            this.reportSelectedAgency = 'all';
        }
    }

    private updateVisibleReportData(): void {
        const search = this.reportSearchTerm.trim().toLowerCase();
        this.visibleReportRows = this.reportRows.filter(row => {
            const matchesAgency = this.reportSelectedAgency === 'all' || row.agency === this.reportSelectedAgency;
            const matchesSearch = !search || row.agency.toLowerCase().includes(search);
            return matchesAgency && matchesSearch;
        });

        const totalsByDate: { [dateKey: string]: AgencyReportCell } = {};
        this.reportDateKeys.forEach(dateKey => {
            totalsByDate[dateKey] = { volume: 0, count: 0 };
        });

        this.visibleReportRows.forEach(row => {
            this.reportDateKeys.forEach(dateKey => {
                const cell = row.daily[dateKey];
                if (!cell) {
                    return;
                }
                totalsByDate[dateKey].volume += cell.volume;
                totalsByDate[dateKey].count += cell.count;
            });
        });

        this.visibleReportTotalsByDate = totalsByDate;

        let peakDayKey = '';
        let peakDayVolume = 0;
        Object.entries(totalsByDate).forEach(([dateKey, totals]) => {
            if (totals.volume > peakDayVolume) {
                peakDayVolume = totals.volume;
                peakDayKey = dateKey;
            }
        });

        const totalVolume = this.visibleReportRows.reduce((sum, row) => sum + row.totalVolume, 0);
        const totalCount = this.visibleReportRows.reduce((sum, row) => sum + row.totalCount, 0);
        this.visibleReportSummary = {
            totalVolume,
            totalCount,
            activeAgencies: this.visibleReportRows.filter(row => row.activeDays > 0).length,
            avgVolumePerDay: this.reportDateKeys.length ? totalVolume / this.reportDateKeys.length : 0,
            peakDayKey,
            peakDayVolume
        };
    }

    toggleAgencyReport(): void {
        this.showAgencyReport = !this.showAgencyReport;

        if (this.showAgencyReport) {
            setTimeout(() => {
                document.getElementById('agency-report-section')?.scrollIntoView({
                    behavior: 'smooth',
                    block: 'start'
                });
            }, 50);
        }
    }

    openAgencyReportPage(): void {
        const filters = this.filterForm.value;
        const queryParams = {
            agency: JSON.stringify(filters.agency || []),
            service: JSON.stringify(filters.service || []),
            country: JSON.stringify(filters.country || []),
            startDate: filters.startDate || '',
            endDate: filters.endDate || ''
        };

        this.router.navigate(['/stats-report'], { queryParams }).catch(error => {
            console.error('Navigation vers /stats-report impossible', error);
        });
    }

    onReportAgencyChange(event: Event): void {
        const value = (event.target as HTMLSelectElement).value;
        this.reportSelectedAgency = value || 'all';
        this.updateVisibleReportData();
    }

    onReportModeChange(event: Event): void {
        const value = (event.target as HTMLSelectElement).value as 'both' | 'vol' | 'trx';
        this.reportMode = value || 'both';
    }

    onReportSearchChange(event: Event): void {
        this.reportSearchTerm = (event.target as HTMLInputElement).value || '';
        this.updateVisibleReportData();
    }

    formatReportDateLabel(dateKey: string): string {
        const [year, month, day] = dateKey.split('-');
        if (!year || !month || !day) {
            return dateKey;
        }
        return `${day}/${month}`;
    }

    formatReportPeriodLabel(): string {
        if (!this.reportDateKeys.length) {
            return 'Aucune période disponible';
        }

        if (this.reportDateKeys.length === 1) {
            return `Période : ${this.reportDateKeys[0].split('-').reverse().join('/')}`;
        }

        const start = this.reportDateKeys[0].split('-').reverse().join('/');
        const end = this.reportDateKeys[this.reportDateKeys.length - 1].split('-').reverse().join('/');
        return `Période du ${start} au ${end}`;
    }

    isTodayReportDate(dateKey: string): boolean {
        return this.toDateKey(new Date()) === dateKey;
    }

    private buildAgencyReportExportRows(): any[] {
        return this.visibleReportRows.map(row => {
            const exportRow: any = {
                Agence: row.agency,
                'Jours actifs': row.activeDays,
                'Volume période': row.totalVolume,
                'Nb période': row.totalCount
            };

            this.reportDateKeys.forEach(dateKey => {
                const label = this.formatReportDateLabel(dateKey);
                const cell = row.daily[dateKey] || { volume: 0, count: 0 };

                if (this.reportMode !== 'trx') {
                    exportRow[`${label} Volume`] = cell.volume;
                }

                if (this.reportMode !== 'vol') {
                    exportRow[`${label} Trx`] = cell.count;
                }
            });

            return exportRow;
        });
    }

    private async promptCustomFileName(defaultBaseName: string, extension: 'xlsx' | 'pdf'): Promise<string | null> {
        const fileName = prompt(`Entrez le nom du fichier (sans l'extension .${extension}) :`, defaultBaseName);

        if (fileName === null) {
            return null;
        }

        const trimmed = fileName.trim() || defaultBaseName;
        return `${trimmed}.${extension}`;
    }

    private getAgencyReportBaseFileName(): string {
        const period = this.reportDateKeys.length
            ? `${this.reportDateKeys[0].replace(/-/g, '')}${this.reportDateKeys.length > 1 ? '_' + this.reportDateKeys[this.reportDateKeys.length - 1].replace(/-/g, '') : ''}`
            : new Date().toISOString().slice(0, 10).replace(/-/g, '');
        return `rapport_agences_${period}`;
    }

    async exportAgencyReportExcel(): Promise<void> {
        if (!this.visibleReportRows.length) {
            await this.showErrorMessage('Aucune donnée disponible pour exporter le rapport agence en Excel');
            return;
        }

        this.isLoading = true;

        try {
            const fileName = await this.promptCustomFileName(this.getAgencyReportBaseFileName(), 'xlsx');
            if (!fileName) {
                return;
            }

            const workbook = new ExcelJS.Workbook();
            const worksheet = workbook.addWorksheet('Rapport agences');

            const rows = this.buildAgencyReportExportRows();
            const headers = Object.keys(rows[0]);

            worksheet.columns = headers.map(header => ({
                header,
                key: header,
                width: header.length > 18 ? 18 : 16
            }));

            worksheet.getRow(1).eachCell(cell => {
                cell.fill = {
                    type: 'pattern',
                    pattern: 'solid',
                    fgColor: { argb: 'FF1A2535' }
                };
                cell.font = { color: { argb: 'FFFFFFFF' }, bold: true };
                cell.alignment = { vertical: 'middle', horizontal: 'center' };
            });

            rows.forEach((row, index) => {
                const excelRow = worksheet.addRow(row);
                if (index % 2 === 1) {
                    excelRow.eachCell(cell => {
                        cell.fill = {
                            type: 'pattern',
                            pattern: 'solid',
                            fgColor: { argb: 'FFF7F9FC' }
                        };
                    });
                }
            });

            const totalRowData: any = {
                Agence: 'TOTAL',
                'Jours actifs': this.visibleReportSummary.activeAgencies,
                'Volume période': this.visibleReportSummary.totalVolume,
                'Nb période': this.visibleReportSummary.totalCount
            };

            this.reportDateKeys.forEach(dateKey => {
                const label = this.formatReportDateLabel(dateKey);
                const totals = this.visibleReportTotalsByDate[dateKey] || { volume: 0, count: 0 };

                if (this.reportMode !== 'trx') {
                    totalRowData[`${label} Volume`] = totals.volume;
                }

                if (this.reportMode !== 'vol') {
                    totalRowData[`${label} Trx`] = totals.count;
                }
            });

            const totalRow = worksheet.addRow(totalRowData);
            totalRow.eachCell(cell => {
                cell.font = { bold: true };
                cell.fill = {
                    type: 'pattern',
                    pattern: 'solid',
                    fgColor: { argb: 'FFE8F0FB' }
                };
            });

            worksheet.columns.forEach(column => {
                column.eachCell?.({ includeEmpty: true }, cell => {
                    if (typeof cell.value === 'number') {
                        cell.numFmt = '#,##0';
                    }
                });
            });

            const buffer = await workbook.xlsx.writeBuffer();
            const blob = new Blob([buffer], {
                type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
            });
            FileSaver.saveAs(blob, fileName);

            await this.showSuccessMessage(`Le fichier ${fileName} a été téléchargé.`);
        } catch (error) {
            console.error('Erreur lors de l\'export Excel du rapport agence:', error);
            await this.showErrorMessage('Erreur lors de l\'export Excel du rapport agence');
        } finally {
            this.isLoading = false;
        }
    }

    async exportAgencyReportPdf(): Promise<void> {
        const element = document.getElementById('agency-report-section') as HTMLElement | null;
        if (!element || !this.visibleReportRows.length) {
            await this.showErrorMessage('Aucune donnée disponible pour exporter le rapport agence en PDF');
            return;
        }

        this.isLoading = true;

        const originalOverflow = element.style.overflow;
        const tableScroll = element.querySelector('.agency-report-table-scroll') as HTMLElement | null;
        const tableScrollOverflow = tableScroll?.style.overflow ?? '';
        const tableScrollMaxHeight = tableScroll?.style.maxHeight ?? '';

        try {
            const fileName = await this.promptCustomFileName(this.getAgencyReportBaseFileName(), 'pdf');
            if (!fileName) {
                return;
            }

            element.style.overflow = 'visible';
            if (tableScroll) {
                tableScroll.style.overflow = 'visible';
                tableScroll.style.maxHeight = 'none';
            }

            await new Promise(resolve => setTimeout(resolve, 200));

            const canvas = await html2canvas(element, {
                scale: 2,
                useCORS: true,
                logging: false,
                backgroundColor: '#ffffff'
            });

            const pdf = new jsPDF({
                orientation: 'landscape',
                unit: 'mm',
                format: 'a4'
            });

            const pdfW = pdf.internal.pageSize.getWidth();
            const pdfH = pdf.internal.pageSize.getHeight();
            const margin = 8;
            const pageW = pdfW - 2 * margin;
            const pageH = pdfH - 2 * margin;
            const imgW = canvas.width;
            const imgH = canvas.height;
            const ratio = pageW / imgW;
            const pageImgHeight = pageH / ratio;

            const pageCanvas = document.createElement('canvas');
            const pageCtx = pageCanvas.getContext('2d');
            pageCanvas.width = imgW;

            const totalPages = Math.ceil(imgH / pageImgHeight);
            for (let page = 0; page < totalPages; page++) {
                const sourceY = page * pageImgHeight;
                const sliceHeight = Math.min(pageImgHeight, imgH - sourceY);
                pageCanvas.height = sliceHeight;

                if (pageCtx) {
                    pageCtx.clearRect(0, 0, imgW, sliceHeight);
                    pageCtx.drawImage(canvas, 0, sourceY, imgW, sliceHeight, 0, 0, imgW, sliceHeight);
                }

                const pageData = pageCanvas.toDataURL('image/png');
                if (page > 0) {
                    pdf.addPage();
                }
                pdf.addImage(pageData, 'PNG', margin, margin, pageW, sliceHeight * ratio);
            }

            pdf.save(fileName);
            await this.showSuccessMessage(`Le fichier ${fileName} a été téléchargé.`);
        } catch (error) {
            console.error('Erreur lors de l\'export PDF du rapport agence:', error);
            await this.showErrorMessage('Erreur lors de l\'export PDF du rapport agence');
        } finally {
            element.style.overflow = originalOverflow;
            if (tableScroll) {
                tableScroll.style.overflow = tableScrollOverflow;
                tableScroll.style.maxHeight = tableScrollMaxHeight;
            }
            this.isLoading = false;
        }
    }

    // Remplacer pagedStats par l'agrégation intelligente
    get pagedStats() {
        return this.pagedStatsCache;
    }

    // Calculer le nombre total de pages
    get totalPages(): number {
        const aggregated = this.getAggregatedStats();
        if (this.showAllStatsTableRows) {
            return 1;
        }
        return Math.max(1, Math.ceil(aggregated.length / this.statsPageSize));
    }

    get canToggleStatsTableExpand(): boolean {
        return this.getAggregatedStats().length > this.statsPageSize;
    }

    toggleShowAllStatsTableRows(): void {
        this.showAllStatsTableRows = !this.showAllStatsTableRows;
        this.statsPage = 1;
        this.updatePagedStatsCache();
    }

    // Adapter les totaux globaux
    getTotalRecords(): number {
        return this.totalRecordsCache;
    }

    getTotalVolume(): number {
        return this.totalVolumeCache;
    }

    private updatePagedStatsCache(): void {
        const aggregated = this.getAggregatedStats();
        if (this.showAllStatsTableRows) {
            this.pagedStatsCache = aggregated.slice();
            return;
        }
        if (this.statsPage > this.totalPages) {
            this.statsPage = this.totalPages;
        }
        if (this.statsPage < 1) {
            this.statsPage = 1;
        }
        const start = (this.statsPage - 1) * this.statsPageSize;
        const end = start + this.statsPageSize;
        this.pagedStatsCache = aggregated.slice(start, end);
    }

    nextStatsPage() {
        if (this.statsPage < this.totalPages) {
            this.statsPage++;
            this.updatePagedStatsCache();
        }
    }

    prevStatsPage() {
        if (this.statsPage > 1) {
            this.statsPage--;
            this.updatePagedStatsCache();
        }
    }

    goToStatsPage(page: number) {
        if (page >= 1 && page <= this.totalPages) {
            this.statsPage = page;
            this.updatePagedStatsCache();
        }
    }

    getVisibleStatsPages(): number[] {
        const maxVisible = 5;
        const pages: number[] = [];
        
        if (this.totalPages <= maxVisible) {
            // Si moins de 5 pages, afficher toutes
            for (let i = 1; i <= this.totalPages; i++) {
                pages.push(i);
            }
        } else {
            // Si plus de 5 pages, afficher intelligemment
            let start = Math.max(1, this.statsPage - 2);
            let end = Math.min(this.totalPages, start + maxVisible - 1);
            
            // Ajuster si on est près de la fin
            if (end - start < maxVisible - 1) {
                start = Math.max(1, end - maxVisible + 1);
            }
            
            for (let i = start; i <= end; i++) {
                pages.push(i);
            }
        }
        
        return pages;
    }

    goBack() {
        console.log('Navigation vers /results');
        try {
            this.router.navigate(['/results']).then(() => {
                console.log('Navigation vers /results réussie');
            }).catch(error => {
                console.error('Erreur lors de la navigation vers /results:', error);
            });
        } catch (error) {
            console.error('Erreur dans goBack():', error);
        }
    }

    startNewReconciliation() {
        console.log('Navigation vers /upload');
        try {
            this.router.navigate(['/upload']).then(() => {
                console.log('Navigation vers /upload réussie');
            }).catch(error => {
                console.error('Erreur lors de la navigation vers /upload:', error);
            });
        } catch (error) {
            console.error('Erreur dans startNewReconciliation():', error);
        }
    }

    goToServiceReferences() {
        this.router.navigate(['/service-references']).catch(error => {
            console.error('Navigation vers le référentiel services impossible', error);
        });
    }

    async exportStats(): Promise<void> {
        await this.exportStatsWorkbook(['detail'], 'statistiques_detail');
    }

    async exportStatsByWeek(): Promise<void> {
        await this.exportStatsWorkbook(['week'], 'statistiques_par_semaine');
    }

    async exportStatsByMonth(): Promise<void> {
        await this.exportStatsWorkbook(['month'], 'statistiques_par_mois');
    }

    /** Export Excel : détail journalier + agrégation par semaine et par mois (3 feuilles). */
    async exportStatsComplete(): Promise<void> {
        await this.exportStatsWorkbook(['detail', 'week', 'month'], 'statistiques_complet');
    }

    private getIsoWeekInfo(dateValue: string | Date): { sortKey: string; label: string } | null {
        const date = new Date(dateValue);
        if (isNaN(date.getTime())) {
            return null;
        }
        const utc = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
        const dayNum = utc.getUTCDay() || 7;
        utc.setUTCDate(utc.getUTCDate() + 4 - dayNum);
        const year = utc.getUTCFullYear();
        const yearStart = new Date(Date.UTC(year, 0, 1));
        const week = Math.ceil((((utc.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
        const sortKey = `${year}-W${String(week).padStart(2, '0')}`;
        return { sortKey, label: `Semaine ${week} (${year})` };
    }

    private getMonthInfo(dateValue: string | Date): { sortKey: string; label: string } | null {
        const dateKey = this.toDateKey(dateValue);
        if (!dateKey) {
            return null;
        }
        const [year, month] = dateKey.split('-');
        const monthIndex = Number(month) - 1;
        const monthNames = [
            'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
            'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'
        ];
        const label = monthIndex >= 0 && monthIndex < 12
            ? `${monthNames[monthIndex]} ${year}`
            : dateKey;
        return { sortKey: `${year}-${month}`, label };
    }

    private buildDailyExportRows(): Record<string, string | number>[] {
        return this.getAggregatedStats().map(item => ({
            Client: item.agency,
            Service: item.service,
            Pays: item.country,
            Période: this.formatDateOnly(item.date),
            Volume: Number(item.totalVolume),
            Transactions: Number(item.recordCount)
        }));
    }

    private buildPeriodExportRows(mode: 'week' | 'month'): Record<string, string | number>[] {
        const bucket = new Map<string, {
            agency: string;
            service: string;
            country: string;
            periodSort: string;
            periodLabel: string;
            volume: number;
            count: number;
        }>();

        for (const item of this.getAggregatedStats()) {
            const period = mode === 'week'
                ? this.getIsoWeekInfo(item.date)
                : this.getMonthInfo(item.date);
            if (!period) {
                continue;
            }
            const key = `${item.agency}|${item.service}|${item.country}|${period.sortKey}`;
            const existing = bucket.get(key);
            if (existing) {
                existing.volume += Number(item.totalVolume) || 0;
                existing.count += Number(item.recordCount) || 0;
            } else {
                bucket.set(key, {
                    agency: item.agency,
                    service: item.service,
                    country: item.country,
                    periodSort: period.sortKey,
                    periodLabel: period.label,
                    volume: Number(item.totalVolume) || 0,
                    count: Number(item.recordCount) || 0
                });
            }
        }

        return Array.from(bucket.values())
            .sort((a, b) => {
                if (b.periodSort !== a.periodSort) {
                    return b.periodSort.localeCompare(a.periodSort);
                }
                return a.agency.localeCompare(b.agency)
                    || a.service.localeCompare(b.service)
                    || a.country.localeCompare(b.country);
            })
            .map(row => ({
                Client: row.agency,
                Service: row.service,
                Pays: row.country,
                Période: row.periodLabel,
                Volume: row.volume,
                Transactions: row.count
            }));
    }

    private writeStatsSheet(
        worksheet: ExcelJS.Worksheet,
        rows: Record<string, string | number>[],
        periodHeader: string
    ): void {
        worksheet.columns = [
            { header: 'Client', key: 'Client', width: 22 },
            { header: 'Service', key: 'Service', width: 22 },
            { header: 'Pays', key: 'Pays', width: 14 },
            { header: periodHeader, key: 'Période', width: 24 },
            { header: 'Volume', key: 'Volume', width: 16, style: { numFmt: '#,##0' } },
            { header: 'Transactions', key: 'Transactions', width: 16, style: { numFmt: '#,##0' } }
        ];

        worksheet.getRow(1).eachCell(cell => {
            cell.fill = {
                type: 'pattern',
                pattern: 'solid',
                fgColor: { argb: 'FF1976D2' }
            };
            cell.font = { color: { argb: 'FFFFFFFF' }, bold: true };
            cell.alignment = { vertical: 'middle', horizontal: 'center' };
        });

        rows.forEach((row, idx) => {
            const excelRow = worksheet.addRow(row);
            if (idx % 2 === 1) {
                excelRow.eachCell(cell => {
                    cell.fill = {
                        type: 'pattern',
                        pattern: 'solid',
                        fgColor: { argb: 'FFE3F2FD' }
                    };
                });
            }
        });

        const totalVolume = rows.reduce((sum, row) => sum + Number(row.Volume), 0);
        const totalTransactions = rows.reduce((sum, row) => sum + Number(row.Transactions), 0);
        const totalRow = worksheet.addRow({
            Client: 'TOTAL',
            Service: '',
            Pays: '',
            Période: '',
            Volume: totalVolume,
            Transactions: totalTransactions
        });
        totalRow.eachCell((cell, colNumber) => {
            cell.font = { bold: true };
            if (colNumber === 1 || colNumber === 5 || colNumber === 6) {
                cell.fill = {
                    type: 'pattern',
                    pattern: 'solid',
                    fgColor: { argb: 'FFB3E5FC' }
                };
            }
        });

        worksheet.columns.forEach(column => {
            column.eachCell?.({ includeEmpty: true }, cell => {
                if (typeof cell.value === 'number') {
                    cell.numFmt = '#,##0';
                }
            });
        });
    }

    private async exportStatsWorkbook(
        sheets: Array<'detail' | 'week' | 'month'>,
        defaultBaseName: string
    ): Promise<void> {
        this.isLoading = true;
        try {
            const hasData = this.getAggregatedStats().length > 0;
            if (!hasData) {
                await this.showErrorMessage('Aucune donnée à exporter');
                return;
            }

            const fileName = await this.promptExportFileName(defaultBaseName);
            if (!fileName) {
                return;
            }

            const workbook = new ExcelJS.Workbook();

            if (sheets.includes('detail')) {
                const ws = workbook.addWorksheet('Par jour');
                this.writeStatsSheet(ws, this.buildDailyExportRows(), 'Date');
            }
            if (sheets.includes('week')) {
                const weekRows = this.buildPeriodExportRows('week');
                if (sheets.length === 1 && !weekRows.length) {
                    await this.showErrorMessage('Aucune donnée à exporter par semaine');
                    return;
                }
                if (weekRows.length) {
                    const ws = workbook.addWorksheet('Par semaine');
                    this.writeStatsSheet(ws, weekRows, 'Semaine');
                }
            }
            if (sheets.includes('month')) {
                const monthRows = this.buildPeriodExportRows('month');
                if (sheets.length === 1 && !monthRows.length) {
                    await this.showErrorMessage('Aucune donnée à exporter par mois');
                    return;
                }
                if (monthRows.length) {
                    const ws = workbook.addWorksheet('Par mois');
                    this.writeStatsSheet(ws, monthRows, 'Mois');
                }
            }

            if (workbook.worksheets.length === 0) {
                await this.showErrorMessage('Aucune feuille à exporter');
                return;
            }

            const buffer = await workbook.xlsx.writeBuffer();
            const blob = new Blob([buffer], {
                type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
            });
            FileSaver.saveAs(blob, fileName);
            await this.showSuccessMessage(`Fichier exporté : ${fileName}`);
        } catch (error) {
            console.error('Erreur lors de l\'export:', error);
            await this.showErrorMessage('Erreur lors de l\'export des données');
        } finally {
            this.isLoading = false;
        }
    }

    private async promptExportFileName(defaultBase: string): Promise<string | null> {
        const timestamp = new Date().toISOString().slice(0, 10);
        const defaultFileName = `${defaultBase}_${timestamp}`;
        const fileName = prompt(`Nom du fichier (sans .xlsx) :`, defaultFileName);
        if (fileName === null) {
            return null;
        }
        const trimmed = (fileName || defaultFileName).trim();
        return trimmed.endsWith('.xlsx') ? trimmed : `${trimmed}.xlsx`;
    }

    private async promptFileName(): Promise<string | null> {
        return this.promptExportFileName('statistiques');
    }

    formatDateWithTime(date: string): string {
        try {
            const dateObj = new Date(date);
            if (isNaN(dateObj.getTime())) {
                return date; // Retourne la date originale si elle n'est pas valide
            }
            
            const formattedDate = dateObj.toLocaleDateString('fr-FR', {
                year: 'numeric',
                month: '2-digit',
                day: '2-digit'
            });
            
            const formattedTime = dateObj.toLocaleTimeString('fr-FR', {
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit'
            });
            
            return `${formattedDate} ${formattedTime}`;
        } catch (error) {
            console.error('Erreur lors du formatage de la date:', error);
            return date; // Retourne la date originale en cas d'erreur
        }
    }

    formatDateOnly(date: string): string {
        try {
            const dateObj = new Date(date);
            if (isNaN(dateObj.getTime())) {
                return date;
            }
            return dateObj.toLocaleDateString('fr-FR', {
                year: 'numeric',
                month: '2-digit',
                day: '2-digit'
            });
        } catch (error) {
            console.error('Erreur lors du formatage de la date:', error);
            return date;
        }
    }

    // Méthodes utilitaires pour récupérer toutes les valeurs uniques
    getAllAgencies(): string[] {
        return Array.from(new Set(this.agencySummaries.map(s => s.agency))).sort();
    }
    getAllServices(): string[] {
        return Array.from(new Set(this.agencySummaries.map(s => s.service))).sort();
    }
    getAllCountries(): string[] {
        return normalizeCountryFilterOptions(this.agencySummaries.map(s => s.country));
    }

    /**
     * Supprime une statistique avec confirmation moderne
     */
    async deleteSummary(summary: any) {
        const confirmMessage = `Êtes-vous sûr de vouloir supprimer cette statistique ?\n\n` +
            `Client: ${summary.agency}\n` +
            `Service: ${summary.service}\n` +
            `Pays: ${summary.country}\n` +
            `Date: ${this.formatDateWithTime(summary.date)}\n` +
            `Volume: ${summary.totalVolume.toLocaleString('fr-FR')}\n` +
            `Transactions: ${summary.recordCount}`;

        const config: PopupConfig = {
            title: 'Confirmation de suppression',
            message: confirmMessage,
            type: 'confirm',
            showCancelButton: true,
            cancelText: 'Annuler',
            confirmText: 'Supprimer'
        };

        try {
            await ModernPopupComponent.showPopup(config);
            
            this.isLoading = true;
            try {
                // Supprimer tous les IDs associés à cette statistique agrégée
                if (summary.ids && summary.ids.length > 0) {
                    const deletePromises = summary.ids.map((id: number) => 
                        this.agencySummaryService.deleteSummary(id, 'Statistiques').toPromise()
                    );
                    await Promise.all(deletePromises);
                } else {
                    throw new Error('Aucun ID trouvé pour cette statistique');
                }
                
                // Recharger les données après suppression
                this.loadData();
                
                // Afficher un message de succès
                await this.showSuccessMessage('Statistique supprimée avec succès');
                
                console.log('Statistique supprimée avec succès');
            } catch (error) {
                console.error('Erreur lors de la suppression:', error);
                await this.showErrorMessage('Erreur lors de la suppression de la statistique');
            } finally {
                this.isLoading = false;
            }
        } catch (error) {
            // L'utilisateur a annulé la suppression
            console.log('Suppression annulée par l\'utilisateur');
        }
    }

    /**
     * Affiche un message de succès avec popup moderne
     */
    private async showSuccessMessage(message: string) {
        const config: PopupConfig = {
            title: 'Succès',
            message: message,
            type: 'success',
            showCancelButton: false,
            confirmText: 'OK'
        };
        await ModernPopupComponent.showPopup(config);
    }

    /**
     * Affiche un message d'erreur avec popup moderne
     */
    private async showErrorMessage(message: string) {
        const config: PopupConfig = {
            title: 'Erreur',
            message: message,
            type: 'error',
            showCancelButton: false,
            confirmText: 'OK'
        };
        await ModernPopupComponent.showPopup(config);
    }

    /**
     * Méthodes pour la sélection multiple
     */
    isSelected(summary: any): boolean {
        const summaryKey = this.getSummaryKey(summary);
        return this.selectedSummaryIds.has(summaryKey);
    }

    toggleSelection(summary: any, event: any) {
        const summaryKey = this.getSummaryKey(summary);
        if (event.target.checked) {
            this.selectedSummaryIds.add(summaryKey);
            this.selectedSummaries.add(summary);
        } else {
            this.selectedSummaryIds.delete(summaryKey);
            this.selectedSummaries.delete(summary);
        }
        this.updateAllSelectedState();
    }

    toggleSelectAll(event: any) {
        if (event.target.checked) {
            // Sélectionner toutes les statistiques de toutes les pages
            const allStats = this.getAggregatedStats();
            allStats.forEach(summary => {
                const summaryKey = this.getSummaryKey(summary);
                this.selectedSummaryIds.add(summaryKey);
                this.selectedSummaries.add(summary);
            });
        } else {
            // Désélectionner toutes les statistiques
            this.selectedSummaryIds.clear();
            this.selectedSummaries.clear();
        }
        this.allSelected = event.target.checked;
    }

    updateAllSelectedState() {
        const allStats = this.getAggregatedStats();
        if (allStats.length === 0) {
            this.allSelected = false;
            return;
        }
        
        // Vérifier si toutes les statistiques de toutes les pages sont sélectionnées
        this.allSelected = allStats.every(summary => {
            const summaryKey = this.getSummaryKey(summary);
            return this.selectedSummaryIds.has(summaryKey);
        });
    }

    /**
     * Génère une clé unique pour une statistique
     */
    private getSummaryKey(summary: any): string {
        return `${summary.agency}|${summary.service}|${summary.country}|${summary.date}`;
    }

    getSelectedCount(): number {
        return this.selectedSummaries.size;
    }

    hasSelectedItems(): boolean {
        return this.selectedSummaries.size > 0;
    }

    /**
     * Supprime toutes les statistiques sélectionnées
     */
    async deleteSelectedSummaries() {
        if (this.selectedSummaries.size === 0) {
            await this.showErrorMessage('Aucune statistique sélectionnée');
            return;
        }

        const selectedArray = Array.from(this.selectedSummaries);
        const confirmMessage = `Êtes-vous sûr de vouloir supprimer ${selectedArray.length} statistique(s) sélectionnée(s) ?\n\n` +
            `Cette action est irréversible.`;

        const config: PopupConfig = {
            title: 'Confirmation de suppression multiple',
            message: confirmMessage,
            type: 'confirm',
            showCancelButton: true,
            cancelText: 'Annuler',
            confirmText: 'Supprimer tout'
        };

        try {
            await ModernPopupComponent.showPopup(config);
            
            this.isLoading = true;
            try {
                // Supprimer toutes les statistiques sélectionnées
                const deletePromises = selectedArray.map(summary => {
                    if (summary.ids && summary.ids.length > 0) {
                        return Promise.all(summary.ids.map((id: number) => 
                            this.agencySummaryService.deleteSummary(id, 'Statistiques').toPromise()
                        ));
                    } else {
                        throw new Error('Aucun ID trouvé pour cette statistique');
                    }
                });
                
                await Promise.all(deletePromises);
                
                // Vider la sélection
                this.selectedSummaries.clear();
                this.allSelected = false;
                
                // Recharger les données après suppression
                this.loadData();
                
                // Afficher un message de succès
                await this.showSuccessMessage(`${selectedArray.length} statistique(s) supprimée(s) avec succès`);
                
                console.log('Statistiques supprimées avec succès');
            } catch (error) {
                console.error('Erreur lors de la suppression:', error);
                await this.showErrorMessage('Erreur lors de la suppression des statistiques');
            } finally {
                this.isLoading = false;
            }
        } catch (error) {
            // L'utilisateur a annulé la suppression
            console.log('Suppression annulée par l\'utilisateur');
        }
    }

    /**
     * Désélectionne toutes les statistiques
     */
    clearSelection() {
        this.selectedSummaries.clear();
        this.selectedSummaryIds.clear();
        this.allSelected = false;
    }
} 