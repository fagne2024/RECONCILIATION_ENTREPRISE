import { Component, ElementRef, OnInit, ViewChild } from '@angular/core';
import { SharedUiModule } from '../../shared/shared-ui.module';
import { RankingService, RankingItem } from '../../services/ranking.service';
import * as XLSX from 'xlsx';
import { FormControl } from '@angular/forms';
import { MatSelect } from '@angular/material/select';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import { normalizeCountryFilterOptions } from '../../utils/country-codes.util';
import { TranslateModule, TranslateService } from '@ngx-translate/core';

@Component({
  selector: 'app-ranking',
  standalone: true,
  imports: [TranslateModule, SharedUiModule],
  templateUrl: './ranking.component.html',
  styleUrls: ['./ranking.component.scss']
})
export class RankingComponent implements OnInit {
  
  // Données des classements
  agencyRankings: RankingItem[] = [];
  serviceRankings: RankingItem[] = [];
  private agencyRankingsSource: RankingItem[] = [];
  private serviceRankingsSource: RankingItem[] = [];
  
  // Types de classement
  agencyRankingType: 'transactions' | 'volume' | 'fees' = 'transactions';
  serviceRankingType: 'transactions' | 'volume' | 'fees' = 'transactions';
  
  // Période de calcul
  selectedPeriod: 'all' | 'day' | 'week' | 'month' | 'lastMonth' | 'thisYear' | 'lastYear' | 'custom' = 'month';
  
  // États de chargement
  loadingAgencies = false;
  loadingServices = false;
  
  // Erreurs
  errorAgencies = '';
  errorServices = '';

  // Indicateur de mise à jour
  showUpdateMessage = false;
  updateMessage = '';
  isExportingAgencyPdf = false;
  isExportingServicePdf = false;

  // Filtre personnalisé
  customStartDate: string = '';
  customEndDate: string = '';
  customDateError: string = '';

  // Pagination agences
  agencyPage = 1;
  agencyPageSize = 5;
  showAllAgencies = false;
  get paginatedAgencyRankings() {
    if (this.showAllAgencies) {
      return this.agencyRankings;
    }
    const start = (this.agencyPage - 1) * this.agencyPageSize;
    return this.agencyRankings.slice(start, start + this.agencyPageSize);
  }
  get agencyTotalPages() {
    return Math.ceil(this.agencyRankings.length / this.agencyPageSize);
  }
  getAgencyPosition(index: number): number {
    if (this.showAllAgencies) {
      return index + 1;
    }
    return (this.agencyPage - 1) * this.agencyPageSize + index + 1;
  }

  // Pagination services
  servicePage = 1;
  servicePageSize = 5;
  showAllServices = false;
  get paginatedServiceRankings() {
    if (this.showAllServices) {
      return this.serviceRankings;
    }
    const start = (this.servicePage - 1) * this.servicePageSize;
    return this.serviceRankings.slice(start, start + this.servicePageSize);
  }
  get serviceTotalPages() {
    return Math.ceil(this.serviceRankings.length / this.servicePageSize);
  }
  getServicePosition(index: number): number {
    if (this.showAllServices) {
      return index + 1;
    }
    return (this.servicePage - 1) * this.servicePageSize + index + 1;
  }

  /** Sentinelle technique du filtre pays : la valeur reste stable, seul le libellé est traduit. */
  readonly ALL_COUNTRIES = 'Tous les pays';

  countries: string[] = [];
  selectedCountry: string = 'Tous les pays';
  selectedCountries: string[] = ['Tous les pays'];

  // Dropdown pays
  showCountryDropdown = false;

  paysSearchCtrl = new FormControl('');
  filteredCountries: string[] = [];

  @ViewChild('paysSelect') paysSelect!: MatSelect;
  @ViewChild('agencyPdfContent') agencyPdfContentRef?: ElementRef<HTMLElement>;
  @ViewChild('servicePdfContent') servicePdfContentRef?: ElementRef<HTMLElement>;

  constructor(private rankingService: RankingService, private translate: TranslateService) { }

  countryLabel(country: string): string {
    return country === this.ALL_COUNTRIES ? this.translateKey('RNK.allCountries') : country;
  }

  ngOnInit(): void {
    this.rankingService.getCountries().subscribe({
      next: (data) => {
        // Correction : éviter la duplication de 'Tous les pays'
        const paysSansDoublon = normalizeCountryFilterOptions(
          data.filter((c: string) => c !== this.ALL_COUNTRIES)
        );
        this.countries = [this.ALL_COUNTRIES, ...paysSansDoublon];
        this.filteredCountries = this.countries;
      },
      error: () => {
        this.countries = [this.ALL_COUNTRIES];
        this.filteredCountries = this.countries;
      }
    });
    this.loadRankings();
    this.paysSearchCtrl.valueChanges.subscribe((search: string | null) => {
      const s = (search || '').toLowerCase();
      this.filteredCountries = this.countries.filter(c => c.toLowerCase().includes(s));
      // Sélection automatique si un seul résultat (hors "Tous les pays")
      const filtered = this.filteredCountries.filter(c => c !== this.ALL_COUNTRIES);
      if (filtered.length === 1 && !this.selectedCountries.includes(filtered[0])) {
        this.selectedCountries = [filtered[0]];
        if (this.paysSelect) { this.paysSelect.close(); }
        this.onCountryChange();
      }
    });
  }

  /**
   * Charger les classements agences + services en une seule requête
   */
  loadRankings(): void {
    this.loadingAgencies = true;
    this.loadingServices = true;
    this.errorAgencies = '';
    this.errorServices = '';

    const startDate = this.selectedPeriod === 'custom' ? this.customStartDate : undefined;
    const endDate = this.selectedPeriod === 'custom' ? this.customEndDate : undefined;
    const countries = this.selectedCountries.includes(this.ALL_COUNTRIES) ? undefined : this.selectedCountries;

    this.rankingService.getRankingsBundle(countries, this.selectedPeriod, startDate, endDate).subscribe({
      next: (data) => {
        this.agencyRankingsSource = data.agencies || [];
        this.serviceRankingsSource = data.services || [];
        this.applyAgencySort();
        this.applyServiceSort();
        this.loadingAgencies = false;
        this.loadingServices = false;
      },
      error: (error) => {
        console.error('Erreur lors du chargement des classements:', error);
        const message = this.translateKey('RNK.loadError');
        this.errorAgencies = message;
        this.errorServices = message;
        this.loadingAgencies = false;
        this.loadingServices = false;
      }
    });
  }

  private applyAgencySort(): void {
    const sorted = [...this.agencyRankingsSource];
    switch (this.agencyRankingType) {
      case 'volume':
        sorted.sort((a, b) => b.totalVolume - a.totalVolume);
        break;
      case 'fees':
        sorted.sort((a, b) => b.totalFees - a.totalFees);
        break;
      default:
        sorted.sort((a, b) => b.transactionCount - a.transactionCount);
    }
    this.agencyRankings = sorted;
    this.agencyPage = 1;
  }

  private applyServiceSort(): void {
    const sorted = [...this.serviceRankingsSource];
    switch (this.serviceRankingType) {
      case 'volume':
        sorted.sort((a, b) => b.totalVolume - a.totalVolume);
        break;
      case 'fees':
        sorted.sort((a, b) => b.totalFees - a.totalFees);
        break;
      default:
        sorted.sort((a, b) => b.transactionCount - a.transactionCount);
    }
    this.serviceRankings = sorted;
    this.servicePage = 1;
  }

  /** @deprecated Utiliser loadRankings() */
  loadAgencyRankings(): void {
    this.loadRankings();
  }

  /** @deprecated Utiliser loadRankings() */
  loadServiceRankings(): void {
    this.loadRankings();
  }

  /**
   * Recharge les classements sans réinitialiser pays, période, types de tri ni pagination.
   */
  refreshRankingData(): void {
    if (this.loadingAgencies || this.loadingServices) {
      return;
    }
    if (this.selectedPeriod === 'custom') {
      if (!this.customStartDate || !this.customEndDate || this.customDateError) {
        return;
      }
    }

    this.showUpdateMessage = true;
    this.updateMessage = this.translateKey('RNK.refreshMessage', {
      period: this.selectedPeriod === 'custom' ? this.formatCustomPeriod() : this.getPeriodDescription()
    });

    this.loadRankings();

    setTimeout(() => {
      this.showUpdateMessage = false;
      this.updateMessage = '';
    }, 3000);
  }

  /**
   * Changer le type de classement des agences
   */
  onAgencyRankingTypeChange(): void {
    this.applyAgencySort();
  }

  /**
   * Changer le type de classement des services
   */
  onServiceRankingTypeChange(): void {
    this.applyServiceSort();
  }

  /**
   * Changer la période de calcul
   */
  onPeriodChange(): void {
    // Réinitialiser les erreurs de date personnalisée
    this.customDateError = '';
    
    if (this.selectedPeriod === 'custom') {
      // Si on passe en mode personnalisé, ne pas charger les données tant qu'on n'a pas de dates
      return;
    }
    
    this.showUpdateMessage = true;
    this.updateMessage = this.translateKey('RNK.updateMessage', { period: this.getPeriodDescription() });
    
    this.loadRankings();
    
    // Masquer le message après 3 secondes
    setTimeout(() => {
      this.showUpdateMessage = false;
      this.updateMessage = '';
    }, 3000);
  }

  /**
   * Gérer le changement de dates personnalisées
   */
  onCustomDateChange(): void {
    this.customDateError = '';
    
    if (!this.customStartDate || !this.customEndDate) {
      return;
    }
    
    const startDate = new Date(this.customStartDate);
    const endDate = new Date(this.customEndDate);
    
    // Validation des dates
    if (startDate > endDate) {
      this.customDateError = this.translateKey('RNK.dateStartAfterEnd');
      return;
    }
    
    if (endDate > new Date()) {
      this.customDateError = this.translateKey('RNK.dateEndFuture');
      return;
    }
    
    this.showUpdateMessage = true;
    this.updateMessage = this.translateKey('RNK.updateMessage', { period: this.formatCustomPeriod() });
    
    this.loadRankings();
    
    // Masquer le message après 3 secondes
    setTimeout(() => {
      this.showUpdateMessage = false;
      this.updateMessage = '';
    }, 3000);
  }

  /**
   * Formater la période personnalisée pour l'affichage
   */
  formatCustomPeriod(): string {
    if (!this.customStartDate || !this.customEndDate) {
      return '';
    }
    
    const startDate = new Date(this.customStartDate);
    const endDate = new Date(this.customEndDate);
    
    const startFormatted = startDate.toLocaleDateString(this.localeTag());
    const endFormatted = endDate.toLocaleDateString(this.localeTag());
    
    if (startFormatted === endFormatted) {
      return this.translateKey('RNK.dataOn', { date: startFormatted });
    } else {
      return this.translateKey('RNK.dataFromTo', { start: startFormatted, end: endFormatted });
    }
  }

  /**
   * Obtenir le titre du classement des agences
   */
  getAgencyRankingTitle(): string {
    if (this.agencyRankingType === 'fees') {
      return this.translateKey('RNK.titleClientsRevenue');
    } else if (this.agencyRankingType === 'volume') {
      return this.translateKey('RNK.titleClientsVolume');
    } else {
      return this.translateKey('RNK.titleClientsTransactions');
    }
  }

  /**
   * Obtenir le titre du classement des services
   */
  getServiceRankingTitle(): string {
    if (this.serviceRankingType === 'fees') {
      return this.translateKey('RNK.titleServicesRevenue');
    } else if (this.serviceRankingType === 'volume') {
      return this.translateKey('RNK.titleServicesVolume');
    } else {
      return this.translateKey('RNK.titleServicesTransactions');
    }
  }

  /**
   * Obtenir le label de la période
   */
  getPeriodLabel(): string {
    switch (this.selectedPeriod) {
      case 'all':
        return this.translateKey('RNK.periodAll');
      case 'day':
        return this.translateKey('RNK.periodDayLabel');
      case 'week':
        return this.translateKey('RNK.periodWeekLabel');
      default:
        return this.translateKey('RNK.periodMonthLabel');
    }
  }

  /**
   * Obtenir la description détaillée de la période
   */
  getPeriodDescription(): string {
    const today = new Date();
    
    const locale = this.localeTag();
    const range = (start: Date, end: Date, key: string) =>
      this.translateKey(key, {
        start: start.toLocaleDateString(locale),
        end: end.toLocaleDateString(locale)
      });

    switch (this.selectedPeriod) {
      case 'all':
        return this.translateKey('RNK.descAll');
      case 'day':
        const yesterday = new Date(today);
        yesterday.setDate(today.getDate() - 1);
        return this.translateKey('RNK.descDay', { date: yesterday.toLocaleDateString(locale) });
      case 'week':
        const lastWeekStart = new Date(today);
        lastWeekStart.setDate(today.getDate() - 7);
        const lastWeekEnd = new Date(lastWeekStart);
        lastWeekEnd.setDate(lastWeekStart.getDate() + 6);
        return range(lastWeekStart, lastWeekEnd, 'RNK.descWeek');
      case 'month':
        const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
        const monthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0);
        return range(monthStart, monthEnd, 'RNK.descMonth');
      case 'lastMonth':
        const lastMonthStart = new Date(today.getFullYear(), today.getMonth() - 1, 1);
        const lastMonthEnd = new Date(today.getFullYear(), today.getMonth(), 0);
        return range(lastMonthStart, lastMonthEnd, 'RNK.descLastMonth');
      case 'thisYear':
        const yearStart = new Date(today.getFullYear(), 0, 1);
        const yearEnd = new Date(today.getFullYear(), 11, 31);
        return range(yearStart, yearEnd, 'RNK.descThisYear');
      case 'lastYear':
        const lastYearStart = new Date(today.getFullYear() - 1, 0, 1);
        const lastYearEnd = new Date(today.getFullYear() - 1, 11, 31);
        return range(lastYearStart, lastYearEnd, 'RNK.descLastYear');
      default:
        return this.translateKey('RNK.descCurrentMonth');
    }
  }

  /**
   * Obtenir la classe CSS pour la position
   */
  getPositionClass(position: number): string {
    if (position === 1) return 'position-gold';
    if (position === 2) return 'position-silver';
    if (position === 3) return 'position-bronze';
    return 'position-normal';
  }

  /**
   * Formater un montant
   */
  formatAmount(amount: number): string {
    return this.rankingService.formatAmount(amount);
  }

  /**
   * Formater un nombre
   */
  formatNumber(num: number): string {
    return this.rankingService.formatNumber(num);
  }

  // Navigation pagination agences
  nextAgencyPage() { if (this.agencyPage < this.agencyTotalPages) this.agencyPage++; }
  prevAgencyPage() { if (this.agencyPage > 1) this.agencyPage--; }
  setAgencyPage(page: number) { this.agencyPage = page; }
  toggleShowAllAgencies() { 
    this.showAllAgencies = !this.showAllAgencies;
    if (this.showAllAgencies) {
      this.agencyPage = 1; // Réinitialiser la page
    }
  }

  // Navigation pagination services
  nextServicePage() { if (this.servicePage < this.serviceTotalPages) this.servicePage++; }
  prevServicePage() { if (this.servicePage > 1) this.servicePage--; }
  setServicePage(page: number) { this.servicePage = page; }
  toggleShowAllServices() { 
    this.showAllServices = !this.showAllServices;
    if (this.showAllServices) {
      this.servicePage = 1; // Réinitialiser la page
    }
  }

  // Export CSV générique
  exportToCSV(data: any[], filename: string) {
    if (!data || !data.length) return;
    const replacer = (key: string, value: any) => value === null ? '' : value;
    const header = Object.keys(data[0]);
    const csv = [
      header.join(','),
      ...data.map(row => header.map(fieldName => JSON.stringify(this.formatExportValue(fieldName, row[fieldName]), replacer)).join(','))
    ].join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const link = document.createElement('a');
    link.href = window.URL.createObjectURL(blob);
    link.download = filename;
    link.click();
  }

  exportAgencyCSV() {
    this.exportToCSV(this.agencyRankings, 'classement_agences.csv');
  }
  exportServiceCSV() {
    this.exportToCSV(this.serviceRankings, 'classement_services.csv');
  }

  exportAgencyExcel() {
    this.exportExcel(this.agencyRankings, 'classement_agences.xlsx', this.translateKey('RNK.sheetAgencies'));
  }
  exportServiceExcel() {
    this.exportExcel(this.serviceRankings, 'classement_services.xlsx', this.translateKey('RNK.sheetServices'));
  }

  async exportAgencyPdf(): Promise<void> {
    if (!this.agencyPdfContentRef?.nativeElement || !this.agencyRankings.length) {
      return;
    }

    this.isExportingAgencyPdf = true;
    const previousShowAll = this.showAllAgencies;
    const previousPage = this.agencyPage;
    try {
      this.showAllAgencies = true;
      await this.waitForRender();
      const fileName = `classement_clients_${this.getPeriodFileLabel()}.pdf`;
      await this.exportSectionToPdf(this.agencyPdfContentRef.nativeElement, fileName);
    } finally {
      this.showAllAgencies = previousShowAll;
      this.agencyPage = previousPage;
      await this.waitForRender();
      this.isExportingAgencyPdf = false;
    }
  }

  async exportServicePdf(): Promise<void> {
    if (!this.servicePdfContentRef?.nativeElement || !this.serviceRankings.length) {
      return;
    }

    this.isExportingServicePdf = true;
    const previousShowAll = this.showAllServices;
    const previousPage = this.servicePage;
    try {
      this.showAllServices = true;
      await this.waitForRender();
      const fileName = `classement_services_${this.getPeriodFileLabel()}.pdf`;
      await this.exportSectionToPdf(this.servicePdfContentRef.nativeElement, fileName);
    } finally {
      this.showAllServices = previousShowAll;
      this.servicePage = previousPage;
      await this.waitForRender();
      this.isExportingServicePdf = false;
    }
  }

  exportExcel(data: any[], filename: string, sheetName: string) {
    if (!data || !data.length) return;
    // Colonnes à exporter (dans l'ordre)
    const columns = Object.keys(data[0]);
    const header = [this.translateKey('TBL.position'), ...columns.map(col => this.getHeaderLabel(col))];
    const wsData = [header, ...data.map((row, idx) => [this.formatNumber(idx + 1), ...columns.map(col => this.formatExportValue(col, row[col]))])];
    const ws = XLSX.utils.aoa_to_sheet(wsData);

    // Styles
    const gold = { fill: { fgColor: { rgb: 'FFF9D923' } } };
    const silver = { fill: { fgColor: { rgb: 'FFE0E0E0' } } };
    const bronze = { fill: { fgColor: { rgb: 'FFF4C99B' } } };
    const border = { top: { style: 'thin', color: { rgb: 'FFCCCCCC' } }, bottom: { style: 'thin', color: { rgb: 'FFCCCCCC' } }, left: { style: 'thin', color: { rgb: 'FFCCCCCC' } }, right: { style: 'thin', color: { rgb: 'FFCCCCCC' } } };
    const headerStyle = { fill: { fgColor: { rgb: 'FF764BA2' } }, font: { bold: true, color: { rgb: 'FFFFFFFF' } }, border };
    const normalStyle = { border };

    // Appliquer le style à l'en-tête
    for (let colIdx = 0; colIdx < header.length; colIdx++) {
      const cell = XLSX.utils.encode_cell({ r: 0, c: colIdx });
      if (ws[cell]) ws[cell].s = headerStyle;
    }

    // Appliquer le style à chaque ligne
    for (let i = 1; i <= data.length; i++) {
      let style = normalStyle;
      if (i === 1) style = { ...gold, ...normalStyle };
      else if (i === 2) style = { ...silver, ...normalStyle };
      else if (i === 3) style = { ...bronze, ...normalStyle };
      for (let colIdx = 0; colIdx < header.length; colIdx++) {
        const cell = XLSX.utils.encode_cell({ r: i, c: colIdx });
        if (ws[cell]) ws[cell].s = style;
      }
    }

    // Largeur automatique
    ws['!cols'] = header.map(() => ({ wch: 18 }));

    // Création du classeur
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
    XLSX.writeFile(wb, filename, { cellStyles: true });
  }

  getHeaderLabel(col: string): string {
    switch (col) {
      case 'agency': return this.translateKey('TBL.agency');
      case 'service': return this.translateKey('TBL.service');
      case 'country': return this.translateKey('TBL.country');
      case 'transactionCount': return this.translateKey('TBL.transactions');
      case 'totalVolume': return this.translateKey('TBL.totalVolume');
      case 'totalFees': return this.translateKey('RNK.revenue');
      case 'averageVolume': return this.translateKey('RNK.avgVolume', { period: this.getPeriodLabel() });
      case 'averageFees': return this.translateKey('RNK.avgRevenue', { period: this.getPeriodLabel() });
      case 'uniqueAgencies': return this.translateKey('RNK.sheetAgencies');
      case 'position': return this.translateKey('TBL.position');
      default: return col;
    }
  }

  private async exportSectionToPdf(element: HTMLElement, fileName: string): Promise<void> {
    const originalOverflow = element.style.overflowY;
    const originalMaxHeight = element.style.maxHeight;
    element.style.overflowY = 'visible';
    element.style.maxHeight = 'none';

    const tableContainer = element.querySelector('.ranking-table-container') as HTMLElement | null;
    const tableContainerOverflow = tableContainer?.style.overflow ?? '';
    const tableContainerMaxHeight = tableContainer?.style.maxHeight ?? '';
    if (tableContainer) {
      tableContainer.style.overflow = 'visible';
      tableContainer.style.maxHeight = 'none';
    }

    try {
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
          pageCtx.drawImage(
            canvas,
            0,
            sourceY,
            imgW,
            sliceHeight,
            0,
            0,
            imgW,
            sliceHeight
          );
        }

        const pageData = pageCanvas.toDataURL('image/png');
        const renderHeight = sliceHeight * ratio;

        if (page > 0) {
          pdf.addPage();
        }
        pdf.addImage(pageData, 'PNG', margin, margin, pageW, renderHeight);
      }

      pdf.save(fileName);
    } catch (error) {
      console.error('Erreur export PDF classement:', error);
    } finally {
      element.style.overflowY = originalOverflow;
      element.style.maxHeight = originalMaxHeight;
      if (tableContainer) {
        tableContainer.style.overflow = tableContainerOverflow;
        tableContainer.style.maxHeight = tableContainerMaxHeight;
      }
    }
  }

  private getPeriodFileLabel(): string {
    if (this.selectedPeriod === 'custom' && this.customStartDate && this.customEndDate) {
      return `${this.customStartDate.replace(/-/g, '')}_${this.customEndDate.replace(/-/g, '')}`;
    }

    return this.selectedPeriod;
  }

  private waitForRender(): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, 100));
  }

  private formatExportValue(fieldName: string, value: any): any {
    if (value === null || value === undefined) {
      return '';
    }

    switch (fieldName) {
      case 'transactionCount':
      case 'uniqueAgencies':
        return this.formatNumber(Number(value));
      case 'totalVolume':
      case 'totalFees':
      case 'averageVolume':
      case 'averageFees':
        return this.formatAmount(Number(value));
      default:
        return value;
    }
  }

  toggleCountry(country: string): void {
    if (country === this.ALL_COUNTRIES) {
      this.selectedCountries = [this.ALL_COUNTRIES];
    } else {
      this.selectedCountries = [country];
    }
    
    // Afficher le message de mise à jour
    const selectedCountryText = this.selectedCountries.length === 1 && this.selectedCountries[0] === this.ALL_COUNTRIES
      ? this.translateKey('RNK.allCountries')
      : this.selectedCountries.join(', ');
    this.showUpdateMessage = true;
    this.updateMessage = this.translateKey('RNK.updateMessageFor', { country: selectedCountryText });
    
    this.loadRankings();
    
    // Masquer le message après 3 secondes
    setTimeout(() => {
      this.showUpdateMessage = false;
      this.updateMessage = '';
    }, 3000);
  }

  isCountrySelected(country: string): boolean {
    return this.selectedCountries.includes(country);
  }

  onCountryChange(): void {
    // Si 'Tous les pays' est sélectionné avec d'autres, on ne garde que les autres
    if (this.selectedCountries.includes(this.ALL_COUNTRIES) && this.selectedCountries.length > 1) {
      this.selectedCountries = this.selectedCountries.filter(c => c !== this.ALL_COUNTRIES);
    }
    // Si rien n'est sélectionné, on remet 'Tous les pays'
    if (this.selectedCountries.length === 0) {
      this.selectedCountries = [this.ALL_COUNTRIES];
    }
    this.loadRankings();
    
    // Fermer automatiquement le dropdown après un choix
    setTimeout(() => {
      if (this.paysSelect) this.paysSelect.close();
    }, 100);
  }

  /**
   * Ouvre/ferme le menu déroulant des pays
   */
  toggleCountryDropdown(): void {
    this.showCountryDropdown = !this.showCountryDropdown;
  }

  /**
   * Sélectionner/désélectionner tous les pays
   */
  toggleSelectAllCountries(): void {
    if (this.selectedCountries.length === 1 && this.selectedCountries[0] === this.ALL_COUNTRIES) {
      this.selectedCountries = []; // Désélectionner tous les pays
    } else {
      this.selectedCountries = [this.ALL_COUNTRIES]; // Sélectionner tous les pays
    }
    this.loadRankings();
  }

  private localeTag(): string {
    return this.translate.currentLang === 'en' ? 'en-GB' : 'fr-FR';
  }

  private translateKey(key: string, params?: Record<string, unknown>): string {
    const value = params
      ? this.translate.instant(key, params as never)
      : this.translate.instant(key);
    return typeof value === 'string' ? value : key;
  }
} 