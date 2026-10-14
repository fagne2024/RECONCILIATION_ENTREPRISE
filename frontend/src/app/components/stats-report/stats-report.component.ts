import { ChangeDetectorRef, Component, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { SharedUiModule } from '../../shared/shared-ui.module';
import { FormBuilder, FormControl, FormGroup } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { AgencySummaryService } from '../../services/agency-summary.service';
import { MatSelect } from '@angular/material/select';
import { ModernPopupComponent, PopupConfig } from '../modern-popup/modern-popup.component';
import * as ExcelJS from 'exceljs';
import { ChartConfiguration, ChartData } from 'chart.js';
// @ts-ignore
import * as FileSaver from 'file-saver';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import { normalizeCountryFilterOptions, matchesCountryFilter, countriesMatch } from '../../utils/country-codes.util';
import { TranslateModule, TranslateService } from '@ngx-translate/core';

interface AggregatedStatRow {
  agency: string;
  service: string;
  country: string;
  date: string;
  totalVolume: number;
  recordCount: number;
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

@Component({
  selector: 'app-stats-report',
  standalone: true,
  imports: [TranslateModule, SharedUiModule],
  templateUrl: './stats-report.component.html',
  styleUrls: ['./stats-report.component.scss']
})
export class StatsReportComponent implements OnInit, OnDestroy {
  private readonly CHART_COLORS = ['#2b6cb0', '#6b8f4e', '#d2783e', '#4b76ad', '#2a8398', '#8d5f16', '#7b4397', '#8b3d57', '#5d7f32'];

  filterForm: FormGroup;
  agencySummaries: any[] = [];
  filteredData: any[] = [];
  aggregatedStatsCache: AggregatedStatRow[] = [];
  isLoading: boolean = false;
  errorMessage: string | null = null;

  reportMode: 'both' | 'vol' | 'trx' = 'both';
  reportSearchTerm: string = '';
  reportSelectedAgency: string = 'all';
  reportDateKeys: string[] = [];
  reportRows: AgencyReportRow[] = [];
  reportAgencyOptions: string[] = [];
  visibleReportRows: AgencyReportRow[] = [];
  pagedVisibleReportRows: AgencyReportRow[] = [];
  visibleReportTotalsByDate: { [dateKey: string]: AgencyReportCell } = {};
  reportPage: number = 1;
  reportPageSize: number = 10;
  isExportingPdf: boolean = false;
  showGraphSection: boolean = false;
  graphView: 'global' | 'agency' | 'market' = 'global';
  graphMetric: 'volume' | 'count' = 'volume';
  graphSelectedAgency: string = '';
  tableDensity: 'compact' | 'large' = 'large';
  visibleReportSummary = {
    totalVolume: 0,
    totalCount: 0,
    activeAgencies: 0,
    avgVolumePerDay: 0,
    peakDayKey: '',
    peakDayVolume: 0
  };

  agenceSearchCtrl = new FormControl('');
  serviceSearchCtrl = new FormControl('');
  paysSearchCtrl = new FormControl('');
  filteredAgencies: string[] = [];
  filteredServices: string[] = [];
  filteredCountries: string[] = [];

  @ViewChild('agenceSelect') agenceSelect!: MatSelect;
  @ViewChild('serviceSelect') serviceSelect!: MatSelect;
  @ViewChild('paysSelect') paysSelect!: MatSelect;

  globalTrendChartData: ChartData<'bar'> = { labels: [], datasets: [] };
  cumulativeChartData: ChartData<'line'> = { labels: [], datasets: [] };
  weeklyTrendChartData: ChartData<'bar'> = { labels: [], datasets: [] };
  agencyDailyChartData: ChartData<'bar'> = { labels: [], datasets: [] };
  agencyCumulativeChartData: ChartData<'line'> = { labels: [], datasets: [] };
  marketShareChartData: ChartData<'doughnut'> = { labels: [], datasets: [] };
  marketRankingChartData: ChartData<'bar'> = { labels: [], datasets: [] };

  graphBarOptions: ChartConfiguration<'bar'>['options'] = this.createBarChartOptions();
  graphHorizontalBarOptions: ChartConfiguration<'bar'>['options'] = this.createBarChartOptions(true);
  graphLineOptions: ChartConfiguration<'line'>['options'] = this.createLineChartOptions();
  graphDoughnutOptions: ChartConfiguration<'doughnut'>['options'] = this.createDoughnutChartOptions();

  private subscription: Subscription = new Subscription();

  constructor(
    private fb: FormBuilder,
    private cdr: ChangeDetectorRef,
    private route: ActivatedRoute,
    private router: Router,
    private agencySummaryService: AgencySummaryService,
    private translate: TranslateService
  ) {
    this.filterForm = this.fb.group({
      agency: [[]],
      service: [[]],
      country: [[]],
      periodType: ['week'],
      startDate: [''],
      endDate: ['']
    });
  }

  ngOnInit(): void {
    this.restoreFiltersFromQueryParams();
    this.initSearchControls();
    this.loadData();
  }

  ngOnDestroy(): void {
    this.subscription.unsubscribe();
  }

  private initSearchControls(): void {
    this.subscription.add(
      this.agenceSearchCtrl.valueChanges.subscribe((search: string | null) => {
        const s = (search || '').toLowerCase();
        this.filteredAgencies = this.getFilteredAgencies().filter(a => a.toLowerCase().includes(s));
      })
    );

    this.subscription.add(
      this.serviceSearchCtrl.valueChanges.subscribe((search: string | null) => {
        const s = (search || '').toLowerCase();
        this.filteredServices = this.getFilteredServices().filter(a => a.toLowerCase().includes(s));
      })
    );

    this.subscription.add(
      this.paysSearchCtrl.valueChanges.subscribe((search: string | null) => {
        const s = (search || '').toLowerCase();
        this.filteredCountries = this.getFilteredCountries().filter(a => a.toLowerCase().includes(s));
      })
    );
  }

  private loadData(): void {
    this.isLoading = true;
    this.agencySummaryService.getAllSummaries('Statistiques').subscribe({
      next: (data) => {
        this.agencySummaries = data || [];
        this.updateFilteredLists();
        this.applyDefaultPeriodFromData();
        this.applyFilters();
        this.isLoading = false;
      },
      error: async (error) => {
        console.error('Erreur lors du chargement des données du rapport:', error);
        this.errorMessage = this.translateKey('SRP.loadError');
        this.isLoading = false;
        await this.showErrorMessage(this.translateKey('SRP.loadErrorReport'));
      }
    });
  }

  private parseArrayParam(value: string | null): string[] {
    if (!value) {
      return [];
    }

    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed.filter(item => typeof item === 'string') : [];
    } catch {
      return [];
    }
  }

  private inferPeriodType(startDate: string, endDate: string): 'week' | 'month' {
    if (!startDate || !endDate) {
      return 'week';
    }

    const start = this.getStartOfDay(startDate);
    const end = this.getStartOfDay(endDate);
    const diffDays = Math.round((end.getTime() - start.getTime()) / 86400000) + 1;
    const isFullMonth =
      start.getDate() === 1 &&
      end.getDate() === new Date(end.getFullYear(), end.getMonth() + 1, 0).getDate() &&
      start.getMonth() === end.getMonth() &&
      start.getFullYear() === end.getFullYear();

    return isFullMonth || diffDays > 7 ? 'month' : 'week';
  }

  private restoreFiltersFromQueryParams(): void {
    const params = this.route.snapshot.queryParamMap;
    const agency = this.parseArrayParam(params.get('agency'));
    const service = this.parseArrayParam(params.get('service'));
    const country = this.parseArrayParam(params.get('country'));
    const startDate = params.get('startDate') || '';
    const endDate = params.get('endDate') || '';
    const periodType = startDate && endDate
      ? this.inferPeriodType(startDate, endDate)
      : 'week';

    this.filterForm.patchValue({
      agency,
      service,
      country,
      periodType,
      startDate,
      endDate
    }, { emitEvent: false });
  }

  getFilteredAgencies(): string[] {
    let data = this.agencySummaries;
    if (this.filterForm.value.service?.length > 0) {
      data = data.filter((s: any) => this.filterForm.value.service.includes(s.service));
    }
    if (this.filterForm.value.country?.length > 0) {
      data = data.filter((s: any) => matchesCountryFilter(s.country, this.filterForm.value.country));
    }
    return [...new Set(data.map((s: any) => s.agency))].sort();
  }

  getFilteredServices(): string[] {
    let data = this.agencySummaries;
    if (this.filterForm.value.agency?.length > 0) {
      data = data.filter((s: any) => this.filterForm.value.agency.includes(s.agency));
    }
    if (this.filterForm.value.country?.length > 0) {
      data = data.filter((s: any) => matchesCountryFilter(s.country, this.filterForm.value.country));
    }
    return [...new Set(data.map((s: any) => s.service))].sort();
  }

  getFilteredCountries(): string[] {
    let data = this.agencySummaries;
    if (this.filterForm.value.agency?.length > 0) {
      data = data.filter((s: any) => this.filterForm.value.agency.includes(s.agency));
    }
    if (this.filterForm.value.service?.length > 0) {
      data = data.filter((s: any) => this.filterForm.value.service.includes(s.service));
    }
    return normalizeCountryFilterOptions(data.map((s: any) => s.country));
  }

  updateFilteredLists(): void {
    this.filteredServices = this.getFilteredServices();
    this.filteredCountries = this.getFilteredCountries();
    this.filteredAgencies = this.getFilteredAgencies();
    this.cleanInvalidSelections();
  }

  cleanInvalidSelections(): void {
    const currentAgency = this.filterForm.value.agency || [];
    const currentService = this.filterForm.value.service || [];
    const currentCountry = this.filterForm.value.country || [];

    const validServices = currentService.filter((service: string) => this.filteredServices.includes(service));
    const validCountries = currentCountry.filter((country: string) =>
      this.filteredCountries.some(fc => countriesMatch(fc, country))
    );
    const validAgencies = currentAgency.filter((agency: string) => this.filteredAgencies.includes(agency));

    if (validServices.length !== currentService.length ||
        validCountries.length !== currentCountry.length ||
        validAgencies.length !== currentAgency.length) {
      this.filterForm.patchValue({
        agency: validAgencies,
        service: validServices,
        country: validCountries
      }, { emitEvent: false });
    }
  }

  onFilterChange(): void {
    this.updateFilteredLists();
    this.applyFilters();

    setTimeout(() => {
      if (this.agenceSelect) this.agenceSelect.close();
      if (this.serviceSelect) this.serviceSelect.close();
      if (this.paysSelect) this.paysSelect.close();
    }, 100);
  }

  onPeriodTypeChange(): void {
    const reference = this.filterForm.value.endDate
      ? this.getStartOfDay(this.filterForm.value.endDate)
      : this.getLatestAvailableDate() || new Date();

    this.applyPeriodPreset(this.filterForm.value.periodType || 'week', reference);
    this.onFilterChange();
  }

  applyFilters(): void {
    const filters = this.filterForm.value;
    const startDate = filters.startDate ? this.getStartOfDay(filters.startDate) : null;
    const endDate = filters.endDate ? this.getEndOfDay(filters.endDate) : null;

    this.filteredData = this.agencySummaries.filter((summary: any) => {
      const summaryDate = new Date(summary.date);
      const afterStart = !startDate || summaryDate >= startDate;
      const beforeEnd = !endDate || summaryDate <= endDate;
      const agencyMatch = !filters.agency?.length || filters.agency.includes(summary.agency);
      const serviceMatch = !filters.service?.length || filters.service.includes(summary.service);
      const countryMatch = matchesCountryFilter(summary.country, filters.country);

      return agencyMatch && serviceMatch && countryMatch && afterStart && beforeEnd;
    });

    this.filteredData.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    this.rebuildDerivedData();
  }

  private getLatestAvailableDate(): Date | null {
    if (!this.agencySummaries.length) {
      return null;
    }

    const timestamps = this.agencySummaries
      .map((item: any) => new Date(item.date).getTime())
      .filter((value: number) => !isNaN(value));

    if (!timestamps.length) {
      return null;
    }

    return new Date(Math.max(...timestamps));
  }

  private applyDefaultPeriodFromData(): void {
    if (this.filterForm.value.startDate && this.filterForm.value.endDate) {
      return;
    }

    const latestDate = this.getLatestAvailableDate();
    if (!latestDate) {
      return;
    }
    this.applyPeriodPreset(this.filterForm.value.periodType || 'week', latestDate);
  }

  private applyPeriodPreset(periodType: 'week' | 'month', referenceDate: Date): void {
    const end = new Date(referenceDate);
    const start = new Date(referenceDate);

    if (periodType === 'month') {
      start.setDate(1);
      end.setMonth(end.getMonth() + 1, 0);
    } else {
      start.setDate(end.getDate() - 6);
    }

    this.filterForm.patchValue({
      startDate: this.toInputDate(start),
      endDate: this.toInputDate(end)
    }, { emitEvent: false });
  }

  private toInputDate(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
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
    this.buildAgencyReport();
    this.updateVisibleReportData();
  }

  private formatCompactNumber(value: number): string {
    try {
      return new Intl.NumberFormat('fr-FR', {
        notation: 'compact',
        maximumFractionDigits: 1
      }).format(value);
    } catch {
      return value.toLocaleString('fr-FR');
    }
  }

  private createBarChartOptions(horizontal = false): ChartConfiguration<'bar'>['options'] {
    return {
      responsive: true,
      maintainAspectRatio: false,
      indexAxis: horizontal ? 'y' : 'x',
      plugins: {
        legend: {
          display: false
        },
        tooltip: {
          callbacks: {
            label: (context) => `${context.dataset.label || this.translateKey('SRP.chartValueFallback')} : ${Number(context.parsed[horizontal ? 'x' : 'y'] || 0).toLocaleString(this.currentLocale())}`
          }
        }
      },
      scales: {
        x: {
          ticks: {
            color: '#6b6257',
            font: { size: 11, weight: '600' },
            callback: (value) => horizontal ? this.formatCompactNumber(Number(value)) : value as any
          },
          grid: { color: '#e8ecef' }
        },
        y: {
          beginAtZero: true,
          ticks: {
            color: '#6b6257',
            font: { size: 11, weight: '600' },
            callback: (value) => horizontal ? value as any : this.formatCompactNumber(Number(value))
          },
          grid: { color: '#e8ecef' }
        }
      }
    };
  }

  private createLineChartOptions(): ChartConfiguration<'line'>['options'] {
    return {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'top',
          labels: {
            color: '#4b433a',
            font: { size: 11, weight: '600' }
          }
        },
        tooltip: {
          callbacks: {
            label: (context) => `${context.dataset.label || this.translateKey('SRP.chartValueFallback')} : ${Number(context.parsed.y || 0).toLocaleString(this.currentLocale())}`
          }
        }
      },
      scales: {
        x: {
          ticks: {
            color: '#6b6257',
            font: { size: 11, weight: '600' }
          },
          grid: { color: '#edf0f4' }
        },
        y: {
          beginAtZero: true,
          ticks: {
            color: '#6b6257',
            font: { size: 11, weight: '600' },
            callback: (value) => this.formatCompactNumber(Number(value))
          },
          grid: { color: '#edf0f4' }
        }
      }
    };
  }

  private createDoughnutChartOptions(): ChartConfiguration<'doughnut'>['options'] {
    return {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'bottom',
          labels: {
            color: '#4b433a',
            font: { size: 12, weight: '600' },
            boxWidth: 12
          }
        },
        tooltip: {
          callbacks: {
            label: (context) => {
              const total = ((context.dataset.data as number[]) || []).reduce((sum, value) => sum + Number(value || 0), 0);
              const value = Number(context.parsed || 0);
              const percent = total ? ((value / total) * 100).toFixed(1) : '0';
              return `${context.label}: ${value.toLocaleString('fr-FR')} (${percent}%)`;
            }
          }
        }
      }
    };
  }

  private buildAggregatedStats(): AggregatedStatRow[] {
    const aggregation: { [key: string]: any[] } = {};

    for (const summary of this.filteredData) {
      const type = summary.service;
      const isAnnulation = type && type.startsWith('annulation_');
      let typeOrigine = type;
      if (isAnnulation) {
        typeOrigine = type.replace('annulation_', '');
      }

      const key = `${typeOrigine}|${summary.agency}|${summary.country}|${summary.date}`;
      if (!aggregation[key]) {
        aggregation[key] = [];
      }

      aggregation[key].push({
        ...summary,
        isAnnulation
      });
    }

    const result: AggregatedStatRow[] = [];
    for (const key in aggregation) {
      const group = aggregation[key];
      const type = group[0].service;
      if (type && type.startsWith('annulation_') && type !== 'annulation_bo') {
        continue;
      }

      let totalVolume = 0;
      let recordCount = 0;

      for (const item of group) {
        if (item.isAnnulation) {
          totalVolume -= item.totalVolume;
          recordCount -= item.recordCount;
        } else {
          totalVolume += item.totalVolume;
          recordCount += item.recordCount;
        }
      }

      if (recordCount !== 0 || totalVolume !== 0) {
        result.push({
          agency: group[0].agency,
          service: group[0].service,
          country: group[0].country,
          date: group[0].date,
          totalVolume,
          recordCount
        });
      }
    }

    return result.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
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

    const graphOptions = this.visibleReportRows.map(row => row.agency);
    if (!this.graphSelectedAgency || !graphOptions.includes(this.graphSelectedAgency)) {
      this.graphSelectedAgency = graphOptions[0] || '';
    }

    this.reportPage = 1;
    this.updatePagedReportRows();
    this.updateGraphData();
  }

  updatePagedReportRows(): void {
    const start = (this.reportPage - 1) * this.reportPageSize;
    const end = start + this.reportPageSize;
    this.pagedVisibleReportRows = this.visibleReportRows.slice(start, end);
  }

  onReportPageSizeChange(event: Event): void {
    this.reportPageSize = Number((event.target as HTMLSelectElement).value) || 10;
    this.reportPage = 1;
    this.updatePagedReportRows();
  }

  get totalReportPages(): number {
    return Math.max(1, Math.ceil(this.visibleReportRows.length / this.reportPageSize));
  }

  get displayedReportRows(): AgencyReportRow[] {
    return this.isExportingPdf ? this.visibleReportRows : this.pagedVisibleReportRows;
  }

  getVisibleReportPages(): number[] {
    const maxVisible = 5;
    const pages: number[] = [];

    if (this.totalReportPages <= maxVisible) {
      for (let i = 1; i <= this.totalReportPages; i++) {
        pages.push(i);
      }
      return pages;
    }

    let start = Math.max(1, this.reportPage - 2);
    let end = Math.min(this.totalReportPages, start + maxVisible - 1);

    if (end - start < maxVisible - 1) {
      start = Math.max(1, end - maxVisible + 1);
    }

    for (let i = start; i <= end; i++) {
      pages.push(i);
    }

    return pages;
  }

  previousReportPage(): void {
    if (this.reportPage > 1) {
      this.reportPage--;
      this.updatePagedReportRows();
    }
  }

  nextReportPage(): void {
    if (this.reportPage < this.totalReportPages) {
      this.reportPage++;
      this.updatePagedReportRows();
    }
  }

  goToReportPage(page: number): void {
    if (page >= 1 && page <= this.totalReportPages) {
      this.reportPage = page;
      this.updatePagedReportRows();
    }
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

  openGraphPage(): void {
    const filters = this.filterForm.value;
    const queryParams = {
      agency: JSON.stringify(filters.agency || []),
      service: JSON.stringify(filters.service || []),
      country: JSON.stringify(filters.country || []),
      startDate: filters.startDate || '',
      endDate: filters.endDate || ''
    };

    this.router.navigate(['/stats-report-graph'], { queryParams }).catch(error => {
      console.error('Navigation vers /stats-report-graph impossible', error);
    });
  }

  toggleGraphSection(): void {
    this.showGraphSection = !this.showGraphSection;

    if (this.showGraphSection) {
      setTimeout(() => {
        document.getElementById('graph-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 50);
    }
  }

  setGraphView(view: 'global' | 'agency' | 'market'): void {
    this.graphView = view;
    this.updateGraphData();
  }

  setGraphMetric(metric: 'volume' | 'count'): void {
    this.graphMetric = metric;
    this.updateGraphData();
  }

  onGraphAgencyChange(event: Event): void {
    this.graphSelectedAgency = (event.target as HTMLSelectElement).value || '';
    this.updateGraphData();
  }

  setTableDensity(mode: 'compact' | 'large'): void {
    this.tableDensity = mode;
  }

  private getMetricLabel(): string {
    return this.graphMetric === 'volume'
      ? this.translateKey('SRP.metricVolume')
      : this.translateKey('SRP.metricCount');
  }

  private getMetricValue(cell: AgencyReportCell | undefined): number {
    if (!cell) {
      return 0;
    }
    return this.graphMetric === 'volume' ? cell.volume : cell.count;
  }

  private getRowMetricTotal(row: AgencyReportRow): number {
    return this.graphMetric === 'volume' ? row.totalVolume : row.totalCount;
  }

  private buildWeeklyBuckets(): Array<{ label: string; value: number }> {
    const buckets: Array<{ label: string; value: number }> = [];
    for (let i = 0; i < this.reportDateKeys.length; i += 7) {
      const slice = this.reportDateKeys.slice(i, i + 7);
      const value = slice.reduce((sum, dateKey) => sum + this.getMetricValue(this.visibleReportTotalsByDate[dateKey]), 0);
      const start = this.formatReportDateLabel(slice[0]);
      const end = this.formatReportDateLabel(slice[slice.length - 1]);
      const range = `${start}${start !== end ? '-' + end : ''}`;
      buckets.push({
        label: this.translateKey('SRP.weekBucketLabel', {
          index: Math.floor(i / 7) + 1,
          range
        }),
        value
      });
    }
    return buckets;
  }

  private updateGraphData(): void {
    const labels = this.reportDateKeys.map(dateKey => this.formatReportDateLabel(dateKey));
    const totals = this.reportDateKeys.map(dateKey => this.getMetricValue(this.visibleReportTotalsByDate[dateKey]));

    this.globalTrendChartData = {
      labels,
      datasets: [{
        label: this.getMetricLabel(),
        data: totals,
        backgroundColor: labels.map((_, index) => index === labels.length - 1 ? '#6cbf9b' : '#7ea7d8'),
        borderColor: labels.map((_, index) => index === labels.length - 1 ? '#43a47b' : '#2b6cb0'),
        borderWidth: 1.5,
        borderRadius: 6
      }]
    };

    const topRows = [...this.visibleReportRows]
      .sort((a, b) => this.getRowMetricTotal(b) - this.getRowMetricTotal(a))
      .slice(0, 8);

    this.cumulativeChartData = {
      labels,
      datasets: topRows.map((row, index) => {
        let runningTotal = 0;
        return {
          label: row.agency,
          data: this.reportDateKeys.map(dateKey => {
            runningTotal += this.getMetricValue(row.daily[dateKey]);
            return runningTotal;
          }),
          borderColor: this.CHART_COLORS[index % this.CHART_COLORS.length],
          backgroundColor: this.CHART_COLORS[index % this.CHART_COLORS.length],
          tension: 0.35,
          fill: false,
          pointRadius: 2,
          pointHoverRadius: 4
        };
      })
    };

    const weeklyBuckets = this.buildWeeklyBuckets();
    this.weeklyTrendChartData = {
      labels: weeklyBuckets.map(bucket => bucket.label),
      datasets: [{
        label: `${this.getMetricLabel()} hebdo`,
        data: weeklyBuckets.map(bucket => bucket.value),
        backgroundColor: weeklyBuckets.map((_, index) => index === weeklyBuckets.length - 1 ? '#6cbf9b' : '#7ea7d8'),
        borderColor: weeklyBuckets.map((_, index) => index === weeklyBuckets.length - 1 ? '#43a47b' : '#2b6cb0'),
        borderWidth: 1.5,
        borderRadius: 6
      }]
    };

    const selectedAgencyRow = this.visibleReportRows.find(row => row.agency === this.graphSelectedAgency) || this.visibleReportRows[0];
    if (selectedAgencyRow) {
      this.agencyDailyChartData = {
        labels,
        datasets: [{
          label: this.translateKey('SRP.chartDaily', { metric: this.getMetricLabel() }),
          data: this.reportDateKeys.map(dateKey => this.getMetricValue(selectedAgencyRow.daily[dateKey])),
          backgroundColor: labels.map((_, index) => index === labels.length - 1 ? '#6cbf9b' : '#7ea7d8'),
          borderColor: labels.map((_, index) => index === labels.length - 1 ? '#43a47b' : '#2b6cb0'),
          borderWidth: 1.5,
          borderRadius: 6
        }]
      };

      let runningTotal = 0;
      this.agencyCumulativeChartData = {
        labels,
        datasets: [{
          label: this.translateKey('SRP.chartCumulative', { metric: this.getMetricLabel() }),
          data: this.reportDateKeys.map(dateKey => {
            runningTotal += this.getMetricValue(selectedAgencyRow.daily[dateKey]);
            return runningTotal;
          }),
          borderColor: '#2b6cb0',
          backgroundColor: 'rgba(43, 108, 176, 0.12)',
          fill: true,
          tension: 0.35,
          pointRadius: 3,
          pointHoverRadius: 5
        }]
      };
    } else {
      this.agencyDailyChartData = { labels: [], datasets: [] };
      this.agencyCumulativeChartData = { labels: [], datasets: [] };
    }

    const marketRows = [...this.visibleReportRows]
      .sort((a, b) => this.getRowMetricTotal(b) - this.getRowMetricTotal(a))
      .slice(0, 9);

    this.marketShareChartData = {
      labels: marketRows.map(row => row.agency),
      datasets: [{
        data: marketRows.map(row => this.getRowMetricTotal(row)),
        backgroundColor: marketRows.map((_, index) => this.CHART_COLORS[index % this.CHART_COLORS.length]),
        borderColor: '#ffffff',
        borderWidth: 2
      }]
    };

    this.marketRankingChartData = {
      labels: marketRows.map(row => row.agency),
      datasets: [{
        label: this.getMetricLabel(),
        data: marketRows.map(row => this.getRowMetricTotal(row)),
        backgroundColor: marketRows.map((_, index) => this.CHART_COLORS[index % this.CHART_COLORS.length]),
        borderColor: marketRows.map((_, index) => this.CHART_COLORS[index % this.CHART_COLORS.length]),
        borderWidth: 1.2,
        borderRadius: 6
      }]
    };
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
      return this.translateKey('SRP.noPeriod');
    }

    if (this.reportDateKeys.length === 1) {
      return this.translateKey('SRP.periodLabel', {
        period: this.reportDateKeys[0].split('-').reverse().join('/')
      });
    }

    const start = this.reportDateKeys[0].split('-').reverse().join('/');
    const end = this.reportDateKeys[this.reportDateKeys.length - 1].split('-').reverse().join('/');
    const periodType = this.filterForm.value.periodType === 'month'
      ? this.translateKey('TBL.month')
      : this.translateKey('STA.week');
    return this.translateKey('SRP.periodRange', { type: periodType, start, end });
  }

  isTodayReportDate(dateKey: string): boolean {
    return this.toDateKey(new Date()) === dateKey;
  }

  private buildAgencyReportExportRows(): any[] {
    return this.visibleReportRows.map(row => {
      const exportRow: any = {};
      exportRow[this.translateKey('TBL.agency')] = row.agency;
      exportRow[this.translateKey('STA.activeDaysShort')] = row.activeDays;
      exportRow[this.translateKey('STA.periodVolume')] = row.totalVolume;
      exportRow[this.translateKey('STA.periodCount')] = row.totalCount;

      this.reportDateKeys.forEach(dateKey => {
        const label = this.formatReportDateLabel(dateKey);
        const cell = row.daily[dateKey] || { volume: 0, count: 0 };

        if (this.reportMode !== 'trx') {
          exportRow[this.translateKey('SRP.colVolume', { day: label })] = cell.volume;
        }

        if (this.reportMode !== 'vol') {
          exportRow[this.translateKey('SRP.colTrx', { day: label })] = cell.count;
        }
      });

      return exportRow;
    });
  }

  private async promptCustomFileName(defaultBaseName: string, extension: 'xlsx' | 'pdf'): Promise<string | null> {
    const fileName = prompt(this.translateKey('SRP.fileNamePrompt', { ext: extension }), defaultBaseName);

    if (fileName === null) {
      return null;
    }

    const trimmed = fileName.trim() || defaultBaseName;
    return `${trimmed}.${extension}`;
  }

  private sanitizeFileNamePart(value: string): string {
    return value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9_-]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^[-_]+|[-_]+$/g, '')
      .toLowerCase();
  }

  private getReportModeSlug(): string {
    switch (this.reportMode) {
      case 'vol':
        return 'volume';
      case 'trx':
        return 'nb-trx';
      case 'both':
      default:
        return 'volume-nb-trx';
    }
  }

  private getAgencyReportBaseFileName(): string {
    const period = this.reportDateKeys.length
      ? `${this.reportDateKeys[0].replace(/-/g, '')}${this.reportDateKeys.length > 1 ? '_' + this.reportDateKeys[this.reportDateKeys.length - 1].replace(/-/g, '') : ''}`
      : new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const agencyPart = this.reportSelectedAgency !== 'all' && this.reportSelectedAgency
      ? `_${this.sanitizeFileNamePart(this.reportSelectedAgency)}`
      : '';
    return `rapport_agences_${this.getReportModeSlug()}${agencyPart}_${period}`;
  }

  async exportAgencyReportExcel(): Promise<void> {
    if (!this.visibleReportRows.length) {
      await this.showErrorMessage(this.translateKey('SRP.exportNoDataExcel'));
      return;
    }

    this.isLoading = true;

    try {
      const fileName = await this.promptCustomFileName(this.getAgencyReportBaseFileName(), 'xlsx');
      if (!fileName) {
        return;
      }

      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet(this.translateKey('SRP.sheetName'));
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

      const totalRowData: any = {};
      totalRowData[this.translateKey('TBL.agency')] = this.translateKey('COMMON.actions.total');
      totalRowData[this.translateKey('STA.activeDaysShort')] = this.visibleReportSummary.activeAgencies;
      totalRowData[this.translateKey('STA.periodVolume')] = this.visibleReportSummary.totalVolume;
      totalRowData[this.translateKey('STA.periodCount')] = this.visibleReportSummary.totalCount;

      this.reportDateKeys.forEach(dateKey => {
        const label = this.formatReportDateLabel(dateKey);
        const totals = this.visibleReportTotalsByDate[dateKey] || { volume: 0, count: 0 };

        if (this.reportMode !== 'trx') {
          totalRowData[this.translateKey('SRP.colVolume', { day: label })] = totals.volume;
        }

        if (this.reportMode !== 'vol') {
          totalRowData[this.translateKey('SRP.colTrx', { day: label })] = totals.count;
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

      await this.showSuccessMessage(this.translateKey('RPT.export.success', { file: fileName }));
    } catch (error) {
      console.error('Erreur lors de l\'export Excel du rapport agence:', error);
      await this.showErrorMessage(this.translateKey('SRP.exportErrorExcel'));
    } finally {
      this.isLoading = false;
    }
  }

  async exportAgencyReportPdf(): Promise<void> {
    if (!this.visibleReportRows.length || this.isLoading || this.isExportingPdf) {
      await this.showErrorMessage(this.translateKey('SRP.exportNoDataPdf'));
      return;
    }

    this.isExportingPdf = true;
    this.cdr.detectChanges();

    try {
      const fileName = await this.promptCustomFileName(this.getAgencyReportBaseFileName(), 'pdf');
      if (!fileName) {
        return;
      }

      await new Promise(resolve => setTimeout(resolve, 200));

      const sourceElement = document.getElementById('agency-report-export-area') as HTMLElement | null;
      if (!sourceElement) {
        throw new Error(this.translateKey('SRP.exportZoneMissing'));
      }

      const sourceTableScroll = sourceElement.querySelector('.agency-report-table-scroll') as HTMLElement | null;
      const canvas = await html2canvas(sourceElement, {
        scale: 2,
        useCORS: true,
        logging: false,
        backgroundColor: '#ffffff',
        windowWidth: Math.max(document.documentElement.clientWidth, sourceTableScroll?.scrollWidth ?? sourceElement.scrollWidth),
        onclone: (clonedDocument) => {
          const clonedElement = clonedDocument.getElementById('agency-report-export-area') as HTMLElement | null;
          if (!clonedElement) {
            return;
          }

          clonedElement.classList.add('export-mode');
          clonedElement.style.overflow = 'visible';
          clonedElement.style.overflowX = 'visible';
          clonedElement.style.overflowY = 'visible';
          clonedElement.style.maxHeight = 'none';
          clonedElement.style.height = 'auto';

          const clonedTableScroll = clonedElement.querySelector('.agency-report-table-scroll') as HTMLElement | null;
          if (clonedTableScroll) {
            clonedTableScroll.style.overflow = 'visible';
            clonedTableScroll.style.overflowX = 'visible';
            clonedTableScroll.style.overflowY = 'visible';
            clonedTableScroll.style.maxHeight = 'none';
            clonedTableScroll.style.height = 'auto';
          }
        }
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
        const renderHeight = sliceHeight * ratio;
        if (page > 0) {
          pdf.addPage();
        }
        pdf.addImage(pageData, 'PNG', margin, margin, pageW, renderHeight);
      }

      pdf.save(fileName);
      await this.showSuccessMessage(this.translateKey('RPT.export.success', { file: fileName }));
    } catch (error) {
      console.error('Erreur lors de l\'export PDF du rapport agence:', error);
      await this.showErrorMessage(this.translateKey('SRP.exportErrorPdf'));
    } finally {
      this.isExportingPdf = false;
      this.cdr.detectChanges();
    }
  }

  goBack(): void {
    this.router.navigate(['/stats']).catch(error => {
      console.error('Navigation vers /stats impossible', error);
    });
  }

  private async showSuccessMessage(message: string): Promise<void> {
    const config: PopupConfig = {
      title: this.translateKey('POPUP.success'),
      message,
      type: 'success',
      showCancelButton: false,
      confirmText: this.translateKey('COMMON.actions.ok')
    };
    await ModernPopupComponent.showPopup(config);
  }

  private async showErrorMessage(message: string): Promise<void> {
    const config: PopupConfig = {
      title: this.translateKey('POPUP.error'),
      message,
      type: 'error',
      showCancelButton: false,
      confirmText: this.translateKey('COMMON.actions.ok')
    };
    await ModernPopupComponent.showPopup(config);
  }

  private currentLocale(): string {
    const lang = this.translate.currentLang || 'fr';
    return lang.split('-')[0];
  }

  private translateKey(key: string, params?: Record<string, unknown>): string {
    const value = params
      ? this.translate.instant(key, params as never)
      : this.translate.instant(key);
    return typeof value === 'string' ? (value as string) : key;
  }
}
