import { Component, OnInit, ViewChild } from '@angular/core';
import { SharedUiModule } from '../../shared/shared-ui.module';
import { FormBuilder, FormControl, FormGroup } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { AgencySummaryService } from '../../services/agency-summary.service';
import { ChartConfiguration, ChartData } from 'chart.js';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import { ModernPopupComponent, PopupConfig } from '../modern-popup/modern-popup.component';
import { MatSelect } from '@angular/material/select';
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
  selector: 'app-stats-report-graph',
  standalone: true,
  imports: [TranslateModule, SharedUiModule],
  templateUrl: './stats-report-graph.component.html',
  styleUrls: ['./stats-report-graph.component.scss']
})
export class StatsReportGraphComponent implements OnInit {
  private readonly CHART_COLORS = ['#2b6cb0', '#6b8f4e', '#d2783e', '#4b76ad', '#2a8398', '#8d5f16', '#7b4397', '#8b3d57', '#5d7f32'];

  filterForm: FormGroup;
  agencySummaries: any[] = [];
  filteredData: any[] = [];
  aggregatedStatsCache: AggregatedStatRow[] = [];
  isLoading = false;
  isExporting = false;
  errorMessage: string | null = null;

  graphView: 'global' | 'agency' | 'market' = 'global';
  graphMetric: 'volume' | 'count' = 'volume';
  graphSelectedAgency: string = '';
  reportDateKeys: string[] = [];
  reportRows: AgencyReportRow[] = [];
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

  constructor(
    private fb: FormBuilder,
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

  private initSearchControls(): void {
    this.agenceSearchCtrl.valueChanges.subscribe((search: string | null) => {
      const s = (search || '').toLowerCase();
      this.filteredAgencies = this.getFilteredAgencies().filter(a => a.toLowerCase().includes(s));
    });

    this.serviceSearchCtrl.valueChanges.subscribe((search: string | null) => {
      const s = (search || '').toLowerCase();
      this.filteredServices = this.getFilteredServices().filter(a => a.toLowerCase().includes(s));
    });

    this.paysSearchCtrl.valueChanges.subscribe((search: string | null) => {
      const s = (search || '').toLowerCase();
      this.filteredCountries = this.getFilteredCountries().filter(a => a.toLowerCase().includes(s));
    });
  }

  private parseArrayParam(value: string | null): string[] {
    if (!value) return [];
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed.filter(item => typeof item === 'string') : [];
    } catch {
      return [];
    }
  }

  private inferPeriodType(startDate: string, endDate: string): 'week' | 'month' {
    if (!startDate || !endDate) return 'week';
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
    const startDate = params.get('startDate') || '';
    const endDate = params.get('endDate') || '';
    this.filterForm.patchValue({
      agency: this.parseArrayParam(params.get('agency')),
      service: this.parseArrayParam(params.get('service')),
      country: this.parseArrayParam(params.get('country')),
      periodType: startDate && endDate ? this.inferPeriodType(startDate, endDate) : 'week',
      startDate,
      endDate
    }, { emitEvent: false });
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
      error: (error) => {
        console.error('Erreur chargement graph rapport:', error);
        this.errorMessage = this.translateKey('SRG.loadError');
        this.isLoading = false;
      }
    });
  }

  getFilteredAgencies(): string[] {
    let data = this.agencySummaries;
    if (this.filterForm.value.service?.length > 0) data = data.filter((s: any) => this.filterForm.value.service.includes(s.service));
    if (this.filterForm.value.country?.length > 0) {
      data = data.filter((s: any) => matchesCountryFilter(s.country, this.filterForm.value.country));
    }
    return [...new Set(data.map((s: any) => s.agency))].sort();
  }

  getFilteredServices(): string[] {
    let data = this.agencySummaries;
    if (this.filterForm.value.agency?.length > 0) data = data.filter((s: any) => this.filterForm.value.agency.includes(s.agency));
    if (this.filterForm.value.country?.length > 0) {
      data = data.filter((s: any) => matchesCountryFilter(s.country, this.filterForm.value.country));
    }
    return [...new Set(data.map((s: any) => s.service))].sort();
  }

  getFilteredCountries(): string[] {
    let data = this.agencySummaries;
    if (this.filterForm.value.agency?.length > 0) data = data.filter((s: any) => this.filterForm.value.agency.includes(s.agency));
    if (this.filterForm.value.service?.length > 0) data = data.filter((s: any) => this.filterForm.value.service.includes(s.service));
    return normalizeCountryFilterOptions(data.map((s: any) => s.country));
  }

  updateFilteredLists(): void {
    this.filteredAgencies = this.getFilteredAgencies();
    this.filteredServices = this.getFilteredServices();
    this.filteredCountries = this.getFilteredCountries();
    this.cleanInvalidSelections();
  }

  cleanInvalidSelections(): void {
    const currentAgency = this.filterForm.value.agency || [];
    const currentService = this.filterForm.value.service || [];
    const currentCountry = this.filterForm.value.country || [];

    const validAgencies = currentAgency.filter((agency: string) => this.filteredAgencies.includes(agency));
    const validServices = currentService.filter((service: string) => this.filteredServices.includes(service));
    const validCountries = currentCountry.filter((country: string) =>
      this.filteredCountries.some(fc => countriesMatch(fc, country))
    );

    if (
      validAgencies.length !== currentAgency.length ||
      validServices.length !== currentService.length ||
      validCountries.length !== currentCountry.length
    ) {
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
    const reference = this.filterForm.value.endDate ? this.getStartOfDay(this.filterForm.value.endDate) : this.getLatestAvailableDate() || new Date();
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
    const timestamps = this.agencySummaries.map((item: any) => new Date(item.date).getTime()).filter((value: number) => !isNaN(value));
    return timestamps.length ? new Date(Math.max(...timestamps)) : null;
  }

  private applyDefaultPeriodFromData(): void {
    if (this.filterForm.value.startDate && this.filterForm.value.endDate) return;
    const latestDate = this.getLatestAvailableDate();
    if (latestDate) this.applyPeriodPreset(this.filterForm.value.periodType || 'week', latestDate);
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
    this.filterForm.patchValue({ startDate: this.toInputDate(start), endDate: this.toInputDate(end) }, { emitEvent: false });
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
    if (!dateValue) return null;
    const date = new Date(dateValue);
    if (isNaN(date.getTime())) return null;
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  }

  private rebuildDerivedData(): void {
    this.aggregatedStatsCache = this.buildAggregatedStats();
    this.buildAgencyReport();
    this.updateVisibleReportData();
  }

  private buildAggregatedStats(): AggregatedStatRow[] {
    const aggregation: { [key: string]: any[] } = {};
    for (const summary of this.filteredData) {
      const type = summary.service;
      const isAnnulation = type && type.startsWith('annulation_');
      let typeOrigine = type;
      if (isAnnulation) typeOrigine = type.replace('annulation_', '');
      const key = `${typeOrigine}|${summary.agency}|${summary.country}|${summary.date}`;
      aggregation[key] = aggregation[key] || [];
      aggregation[key].push({ ...summary, isAnnulation });
    }

    const result: AggregatedStatRow[] = [];
    for (const key in aggregation) {
      const group = aggregation[key];
      const type = group[0].service;
      if (type && type.startsWith('annulation_') && type !== 'annulation_bo') continue;
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
        result.push({ agency: group[0].agency, service: group[0].service, country: group[0].country, date: group[0].date, totalVolume, recordCount });
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
        if (key) keys.push(key);
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
      if (!dateKey) continue;
      dateKeySet.add(dateKey);
      if (!rowMap.has(summary.agency)) {
        rowMap.set(summary.agency, { agency: summary.agency, totalVolume: 0, totalCount: 0, activeDays: 0, daily: {} });
      }
      const row = rowMap.get(summary.agency)!;
      row.daily[dateKey] = row.daily[dateKey] || { volume: 0, count: 0 };
      row.daily[dateKey].volume += Number(summary.totalVolume) || 0;
      row.daily[dateKey].count += Number(summary.recordCount) || 0;
      row.totalVolume += Number(summary.totalVolume) || 0;
      row.totalCount += Number(summary.recordCount) || 0;
    }

    this.reportDateKeys = this.getReportDateRangeKeys(dateKeySet);
    this.reportRows = Array.from(rowMap.values()).map(row => ({
      ...row,
      activeDays: this.reportDateKeys.filter(dateKey => {
        const cell = row.daily[dateKey];
        return !!cell && (cell.volume !== 0 || cell.count !== 0);
      }).length
    })).sort((a, b) => b.totalVolume - a.totalVolume || a.agency.localeCompare(b.agency));
  }

  private updateVisibleReportData(): void {
    this.visibleReportRows = this.reportRows;

    const totalsByDate: { [dateKey: string]: AgencyReportCell } = {};
    this.reportDateKeys.forEach(dateKey => totalsByDate[dateKey] = { volume: 0, count: 0 });
    this.visibleReportRows.forEach(row => {
      this.reportDateKeys.forEach(dateKey => {
        const cell = row.daily[dateKey];
        if (!cell) return;
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
    this.updateGraphData();
  }

  private formatCompactNumber(value: number): string {
    return new Intl.NumberFormat('fr-FR', { notation: 'compact', maximumFractionDigits: 1 }).format(value);
  }

  private createBarChartOptions(horizontal = false): ChartConfiguration<'bar'>['options'] {
    return {
      responsive: true,
      maintainAspectRatio: false,
      indexAxis: horizontal ? 'y' : 'x',
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (context) => `${context.dataset.label || this.translateKey('SRG.chartValueFallback')} : ${Number(context.parsed[horizontal ? 'x' : 'y'] || 0).toLocaleString(this.currentLocale())}`
          }
        }
      },
      scales: {
        x: {
          ticks: { color: '#6b6257', font: { size: 11, weight: '600' }, callback: (value) => horizontal ? this.formatCompactNumber(Number(value)) : value as any },
          grid: { color: '#e8ecef' }
        },
        y: {
          beginAtZero: true,
          ticks: { color: '#6b6257', font: { size: 11, weight: '600' }, callback: (value) => horizontal ? value as any : this.formatCompactNumber(Number(value)) },
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
        legend: { position: 'top', labels: { color: '#4b433a', font: { size: 11, weight: '600' } } },
        tooltip: { callbacks: { label: (context) => `${context.dataset.label || this.translateKey('SRG.chartValueFallback')} : ${Number(context.parsed.y || 0).toLocaleString(this.currentLocale())}` } }
      },
      scales: {
        x: { ticks: { color: '#6b6257', font: { size: 11, weight: '600' } }, grid: { color: '#edf0f4' } },
        y: { beginAtZero: true, ticks: { color: '#6b6257', font: { size: 11, weight: '600' }, callback: (value) => this.formatCompactNumber(Number(value)) }, grid: { color: '#edf0f4' } }
      }
    };
  }

  private createDoughnutChartOptions(): ChartConfiguration<'doughnut'>['options'] {
    return {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: 'bottom', labels: { color: '#4b433a', font: { size: 12, weight: '600' }, boxWidth: 12 } },
        tooltip: {
          callbacks: {
            label: (context) => {
              const total = ((context.dataset.data as number[]) || []).reduce((sum, value) => sum + Number(value || 0), 0);
              const value = Number(context.parsed || 0);
              const percent = total ? ((value / total) * 100).toFixed(1) : '0';
              return `${context.label}: ${value.toLocaleString(this.currentLocale())} (${percent}%)`;
            }
          }
        }
      }
    };
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

  getMetricLabel(): string {
    return this.graphMetric === 'volume'
      ? this.translateKey('SRP.metricVolume')
      : this.translateKey('SRG.metricCount');
  }

  metricWordLower(): string {
    return this.graphMetric === 'volume'
      ? this.translateKey('SRG.metricVolumeLower')
      : this.translateKey('SRG.metricCountLower');
  }

  metricWordShortLower(): string {
    return this.graphMetric === 'volume'
      ? this.translateKey('SRG.metricVolumeLower')
      : this.translateKey('SRG.metricCountShortLower');
  }

  metricWordShareLower(): string {
    return this.graphMetric === 'volume'
      ? this.translateKey('SRG.metricVolumeLower')
      : this.translateKey('SRG.metricShareLower');
  }

  metricWordTotalLower(): string {
    return this.graphMetric === 'volume'
      ? this.translateKey('SRG.metricVolumeTotalLower')
      : this.translateKey('SRG.metricCountTotalLower');
  }

  private getMetricValue(cell: AgencyReportCell | undefined): number {
    if (!cell) return 0;
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
        label: this.translateKey('SRG.weekBucketLabel', { index: Math.floor(i / 7) + 1, range }),
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
      datasets: [{ label: this.getMetricLabel(), data: totals, backgroundColor: labels.map((_, i) => i === labels.length - 1 ? '#6cbf9b' : '#7ea7d8'), borderColor: labels.map((_, i) => i === labels.length - 1 ? '#43a47b' : '#2b6cb0'), borderWidth: 1.5, borderRadius: 6 }]
    };

    const topRows = [...this.visibleReportRows].sort((a, b) => this.getRowMetricTotal(b) - this.getRowMetricTotal(a)).slice(0, 8);
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
      datasets: [{ label: this.translateKey('SRG.chartWeekly', { metric: this.getMetricLabel() }), data: weeklyBuckets.map(bucket => bucket.value), backgroundColor: weeklyBuckets.map((_, i) => i === weeklyBuckets.length - 1 ? '#6cbf9b' : '#7ea7d8'), borderColor: weeklyBuckets.map((_, i) => i === weeklyBuckets.length - 1 ? '#43a47b' : '#2b6cb0'), borderWidth: 1.5, borderRadius: 6 }]
    };

    const selectedAgencyRow = this.visibleReportRows.find(row => row.agency === this.graphSelectedAgency) || this.visibleReportRows[0];
    if (selectedAgencyRow) {
      this.agencyDailyChartData = {
        labels,
        datasets: [{ label: this.translateKey('SRG.chartDaily', { metric: this.getMetricLabel() }), data: this.reportDateKeys.map(dateKey => this.getMetricValue(selectedAgencyRow.daily[dateKey])), backgroundColor: labels.map((_, i) => i === labels.length - 1 ? '#6cbf9b' : '#7ea7d8'), borderColor: labels.map((_, i) => i === labels.length - 1 ? '#43a47b' : '#2b6cb0'), borderWidth: 1.5, borderRadius: 6 }]
      };

      let runningTotal = 0;
      this.agencyCumulativeChartData = {
        labels,
        datasets: [{ label: this.translateKey('SRG.chartCumulative', { metric: this.getMetricLabel() }), data: this.reportDateKeys.map(dateKey => { runningTotal += this.getMetricValue(selectedAgencyRow.daily[dateKey]); return runningTotal; }), borderColor: '#2b6cb0', backgroundColor: 'rgba(43, 108, 176, 0.12)', fill: true, tension: 0.35, pointRadius: 3, pointHoverRadius: 5 }]
      };
    } else {
      this.agencyDailyChartData = { labels: [], datasets: [] };
      this.agencyCumulativeChartData = { labels: [], datasets: [] };
    }

    const marketRows = [...this.visibleReportRows].sort((a, b) => this.getRowMetricTotal(b) - this.getRowMetricTotal(a)).slice(0, 9);
    this.marketShareChartData = { labels: marketRows.map(row => row.agency), datasets: [{ data: marketRows.map(row => this.getRowMetricTotal(row)), backgroundColor: marketRows.map((_, i) => this.CHART_COLORS[i % this.CHART_COLORS.length]), borderColor: '#ffffff', borderWidth: 2 }] };
    this.marketRankingChartData = { labels: marketRows.map(row => row.agency), datasets: [{ label: this.getMetricLabel(), data: marketRows.map(row => this.getRowMetricTotal(row)), backgroundColor: marketRows.map((_, i) => this.CHART_COLORS[i % this.CHART_COLORS.length]), borderColor: marketRows.map((_, i) => this.CHART_COLORS[i % this.CHART_COLORS.length]), borderWidth: 1.2, borderRadius: 6 }] };
  }

  formatReportDateLabel(dateKey: string): string {
    const [year, month, day] = dateKey.split('-');
    return !year || !month || !day ? dateKey : `${day}/${month}`;
  }

  formatReportPeriodLabel(): string {
    if (!this.reportDateKeys.length) return this.translateKey('SRP.noPeriod');
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

  goBack(): void {
    this.router.navigate(['/stats-report'], { queryParams: this.buildQueryParams() }).catch(error => {
      console.error('Navigation vers /stats-report impossible', error);
    });
  }

  async exportGraphsPdf(): Promise<void> {
    const sourceElement = document.getElementById('stats-graph-export-area') as HTMLElement | null;
    if (!sourceElement || this.isLoading || this.isExporting) {
      return;
    }

    this.isExporting = true;

    try {
      await new Promise(resolve => setTimeout(resolve, 200));

      const canvas = await html2canvas(sourceElement, {
        scale: 2,
        useCORS: true,
        logging: false,
        backgroundColor: '#f2f0eb',
        windowWidth: Math.max(document.documentElement.clientWidth, sourceElement.scrollWidth),
        onclone: (clonedDocument) => {
          const clonedElement = clonedDocument.getElementById('stats-graph-export-area') as HTMLElement | null;
          if (!clonedElement) {
            return;
          }

          clonedElement.style.overflow = 'visible';
          clonedElement.style.overflowX = 'visible';
          clonedElement.style.overflowY = 'visible';
          clonedElement.style.maxHeight = 'none';
          clonedElement.style.height = 'auto';
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

      const fileName = `${this.getGraphsExportBaseFileName()}.pdf`;
      pdf.save(fileName);
      await this.showSuccessMessage(this.translateKey('RPT.export.success', { file: fileName }));
    } catch (error) {
      console.error('Erreur lors de l\'export PDF des graphes:', error);
      await this.showErrorMessage(this.translateKey('SRG.exportErrorPdf'));
    } finally {
      this.isExporting = false;
    }
  }

  async exportGraphsPng(): Promise<void> {
    const sourceElement = document.getElementById('stats-graph-export-area') as HTMLElement | null;
    if (!sourceElement || this.isLoading || this.isExporting) {
      return;
    }

    this.isExporting = true;

    try {
      await new Promise(resolve => setTimeout(resolve, 200));

      const canvas = await html2canvas(sourceElement, {
        scale: 2,
        useCORS: true,
        logging: false,
        backgroundColor: '#f2f0eb',
        windowWidth: Math.max(document.documentElement.clientWidth, sourceElement.scrollWidth),
        onclone: (clonedDocument) => {
          const clonedElement = clonedDocument.getElementById('stats-graph-export-area') as HTMLElement | null;
          if (!clonedElement) {
            return;
          }

          clonedElement.style.overflow = 'visible';
          clonedElement.style.overflowX = 'visible';
          clonedElement.style.overflowY = 'visible';
          clonedElement.style.maxHeight = 'none';
          clonedElement.style.height = 'auto';
        }
      });

      const fileName = `${this.getGraphsExportBaseFileName()}.png`;
      const link = document.createElement('a');
      link.href = canvas.toDataURL('image/png');
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      await this.showSuccessMessage(this.translateKey('RPT.export.success', { file: fileName }));
    } catch (error) {
      console.error('Erreur lors de l\'export PNG des graphes:', error);
      await this.showErrorMessage(this.translateKey('SRG.exportErrorPng'));
    } finally {
      this.isExporting = false;
    }
  }

  private buildQueryParams() {
    const filters = this.filterForm.value;
    return {
      agency: JSON.stringify(filters.agency || []),
      service: JSON.stringify(filters.service || []),
      country: JSON.stringify(filters.country || []),
      startDate: filters.startDate || '',
      endDate: filters.endDate || ''
    };
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

  private getExportViewSlug(): string {
    switch (this.graphView) {
      case 'agency':
        return 'par-agence';
      case 'market':
        return 'parts-marche';
      case 'global':
      default:
        return 'vue-globale';
    }
  }

  private getExportMetricSlug(): string {
    return this.graphMetric === 'volume' ? 'volume' : 'nb-trx';
  }

  private getGraphsExportBaseFileName(): string {
    const datePart = new Date().toISOString().slice(0, 10);
    let agencyPart = '';

    if (this.graphView === 'agency' && this.graphSelectedAgency) {
      agencyPart = `_${this.sanitizeFileNamePart(this.graphSelectedAgency)}`;
    }

    return `graph_rapport_agences_${this.getExportViewSlug()}_${this.getExportMetricSlug()}${agencyPart}_${datePart}`;
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
