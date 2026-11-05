import { Component, OnInit, ViewChild, ElementRef } from '@angular/core';
import { SharedUiModule } from '../../shared/shared-ui.module';
import { FormControl } from '@angular/forms';
import { Router } from '@angular/router';
import { RedevanceService, RedevanceData, RedevanceAgenceParam } from '../../services/redevance.service';
import { FluxService, FluxData } from '../../services/flux.service';
import { AgencySummaryService } from '../../services/agency-summary.service';
import { AppStateService } from '../../services/app-state.service';
import ChartDataLabels from 'chartjs-plugin-datalabels';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import { TranslateModule } from '@ngx-translate/core';

@Component({
  selector: 'app-redevance-loterie',
  standalone: true,
  imports: [TranslateModule, SharedUiModule],
  templateUrl: './redevance-loterie.component.html',
  styleUrls: ['./redevance-loterie.component.scss']
})
export class RedevanceLoterieComponent implements OnInit {

  devise = 'XOF Franc CFA';
  formule = '(PBJ - Rém.) x Taux';
  ChartDataLabels = ChartDataLabels;
  Math = Math;

  // Graphique redevance par mois
  redevanceChartData: any = { labels: [], datasets: [] };
  redevanceChartOptions: any = {
    responsive: true,
    maintainAspectRatio: false,
    layout: {
      padding: { left: 0, right: 10, top: 5, bottom: 0 }
    },
    plugins: {
      legend: { display: false },
      datalabels: {
        anchor: 'end',
        align: 'top',
        color: '#fff',
        formatter: (value: number) => value.toLocaleString('fr-FR', { maximumFractionDigits: 0 })
      }
    },
    scales: {
      x: {
        ticks: { color: 'rgba(255,255,255,0.9)', padding: 4 },
        grid: { color: 'rgba(255,255,255,0.15)' }
      },
      y: {
        beginAtZero: true,
        ticks: {
          color: 'rgba(255,255,255,0.9)',
          padding: 4,
          maxTicksLimit: 6,
          callback: (v: number) => v >= 1000000 ? (v / 1000000) + 'M' : v >= 1000 ? (v / 1000) + 'k' : v
        },
        grid: { color: 'rgba(255,255,255,0.15)' }
      }
    }
  };

  // Filtres
  selectedAgence = '';
  selectedPays: string[] = [];
  startDate = '';
  endDate = '';
  agences: string[] = [];
  agencySummaries: any[] = [];
  filteredAgencies: string[] = [];
  filteredCountries: string[] = [];
  agenceSearchCtrl = new FormControl('');
  paysSearchCtrl = new FormControl('');

  isLoading = false;
  errorMessage = '';

  // Données calculées
  data: RedevanceData | null = null;

  // Modal flux
  showFluxModal = false;
  fluxForm: FluxData = {
    agence: '',
    dateDebut: '',
    dateFin: '',
    totalMises: 0,
    totalGains: 0,
    totalBonus: 0,
    payin: 0,
    payout: 0,
    retenueSurGains: 0
  };
  isSavingFlux = false;

  // Modal paramètres
  showParamsModal = false;
  paramsForm: RedevanceAgenceParam = {
    agence: '',
    retenueSurGainsPourcentage: 15,
    retenueSurGainsSeuil: 500000,
    taxeJeuxHasardPourcentage: 5,
    tauxRedevancePourcentage: 50
  };
  isSavingParams = false;

  isExporting = false;
  @ViewChild('exportContent') exportContentRef!: ElementRef<HTMLDivElement>;

  constructor(
    private router: Router,
    private redevanceService: RedevanceService,
    private fluxService: FluxService,
    private agencySummaryService: AgencySummaryService,
    private appState: AppStateService
  ) {}

  get canEditFormules(): boolean {
    return this.appState.isAdmin();
  }

  ngOnInit(): void {
    this.loadAgences();
    this.initDefaultDates();
    this.agenceSearchCtrl.setValue('');
    this.paysSearchCtrl.setValue('');
    this.agenceSearchCtrl.valueChanges.subscribe((search: string | null) => {
      const s = (search || '').toLowerCase();
      const available = this.getFilteredAgencies();
      this.filteredAgencies = available.filter(a => a.toLowerCase().includes(s));
    });
    this.paysSearchCtrl.valueChanges.subscribe((search: string | null) => {
      const s = (search || '').toLowerCase();
      const available = this.getFilteredCountries();
      this.filteredCountries = available.filter(c => c.toLowerCase().includes(s));
    });
    this.loadData();
  }

  private initDefaultDates(): void {
    const now = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
    this.startDate = firstDay.toISOString().split('T')[0];
    this.endDate = now.toISOString().split('T')[0];
  }

  loadAgences(): void {
    this.agencySummaryService.getAllSummaries('Comptes').subscribe({
      next: (summaries) => {
        this.agencySummaries = summaries || [];
        this.agences = this.getFilteredAgencies();
        this.filteredAgencies = [...this.agences];
        this.filteredCountries = this.getFilteredCountries();
      },
      error: () => { this.agences = []; this.agencySummaries = []; this.filteredAgencies = []; this.filteredCountries = []; }
    });
  }

  getFilteredAgencies(): string[] {
    let data = this.agencySummaries || [];
    if (this.selectedPays && this.selectedPays.length > 0) {
      data = data.filter((s: any) => this.selectedPays.includes(s.country));
    }
    const agencies = [...new Set(data.map((s: any) => s.agency).filter(Boolean))];
    return agencies.sort();
  }

  getFilteredCountries(): string[] {
    let data = this.agencySummaries;
    if (this.selectedAgence) {
      data = data.filter((s: any) => s.agency === this.selectedAgence);
    }
    const countries = [...new Set(data.map((s: any) => s.country).filter(Boolean))];
    return countries.sort();
  }

  loadData(): void {
    this.isLoading = true;
    this.errorMessage = '';
    const pays = (this.selectedPays || []).filter(Boolean);
    this.redevanceService.computeRedevance(
      this.selectedAgence || null,
      pays,
      this.startDate,
      this.endDate
    ).subscribe({
      next: (d) => {
        this.data = d;
        this.redevanceChartData = this.getInitialChartData();
        this.loadChartData();
        this.isLoading = false;
      },
      error: (err) => {
        this.errorMessage = err?.error?.message || 'Erreur lors du chargement';
        this.data = null;
        this.isLoading = false;
      }
    });
  }

  onFilterChange(): void {
    const agenceSearch = (this.agenceSearchCtrl.value || '').toLowerCase();
    const paysSearch = (this.paysSearchCtrl.value || '').toLowerCase();
    const availableAgences = this.getFilteredAgencies();
    const availableCountries = this.getFilteredCountries();
    this.filteredAgencies = agenceSearch ? availableAgences.filter(a => a.toLowerCase().includes(agenceSearch)) : availableAgences;
    this.filteredCountries = paysSearch ? availableCountries.filter(c => c.toLowerCase().includes(paysSearch)) : availableCountries;
    if (this.selectedAgence && !availableAgences.includes(this.selectedAgence)) {
      this.selectedAgence = '';
    }
    this.loadData();
  }

  openParamsModal(): void {
    if (!this.selectedAgence) return;
    this.paramsForm = { ...this.paramsForm, agence: this.selectedAgence };
    this.redevanceService.getParams(this.selectedAgence).subscribe({
      next: (p) => {
        this.paramsForm = {
          agence: p.agence,
          retenueSurGainsPourcentage: p.retenueSurGainsPourcentage ?? 15,
          retenueSurGainsSeuil: p.retenueSurGainsSeuil ?? 500000,
          taxeJeuxHasardPourcentage: p.taxeJeuxHasardPourcentage ?? 5,
          tauxRedevancePourcentage: p.tauxRedevancePourcentage ?? 50
        };
        if (p.id) (this.paramsForm as any).id = p.id;
        this.showParamsModal = true;
      },
      error: () => this.showParamsModal = true
    });
  }

  saveParams(): void {
    this.isSavingParams = true;
    this.redevanceService.saveParams(this.paramsForm).subscribe({
      next: () => {
        this.showParamsModal = false;
        this.isSavingParams = false;
        this.loadData();
      },
      error: () => { this.isSavingParams = false; }
    });
  }

  closeParamsModal(): void {
    this.showParamsModal = false;
  }

  openFluxModal(): void {
    if (!this.selectedAgence || !this.startDate || !this.endDate) return;
    this.fluxForm = {
      agence: this.selectedAgence,
      dateDebut: this.startDate,
      dateFin: this.endDate,
      totalMises: this.data?.totalMises ?? 0,
      totalGains: this.data?.totalGains ?? 0,
      totalBonus: this.data?.totalBonus ?? 0,
      retenueSurGains: this.data?.retenueSurGains ?? 0,
      payin: this.data?.payin ?? 0,
      payout: this.data?.payout ?? 0
    };
    this.fluxService.getFlux(this.selectedAgence, this.startDate, this.endDate).subscribe({
      next: (f) => {
        if (f) {
          this.fluxForm = {
            agence: f.agence,
            dateDebut: f.dateDebut,
            dateFin: f.dateFin,
            totalMises: f.totalMises ?? 0,
            totalGains: f.totalGains ?? 0,
            totalBonus: f.totalBonus ?? 0,
            payin: f.payin ?? 0,
            payout: f.payout ?? 0,
            retenueSurGains: f.retenueSurGains ?? 0
          };
          if (f.id) (this.fluxForm as any).id = f.id;
        }
        this.showFluxModal = true;
      },
      error: () => {
        this.showFluxModal = true;
      }
    });
  }

  saveFlux(): void {
    this.isSavingFlux = true;
    this.fluxService.saveFlux(this.fluxForm).subscribe({
      next: () => {
        this.showFluxModal = false;
        this.isSavingFlux = false;
        this.loadData();
      },
      error: () => { this.isSavingFlux = false; }
    });
  }

  closeFluxModal(): void {
    this.showFluxModal = false;
  }

  get canOpenFluxModal(): boolean {
    return !!(this.selectedAgence && this.startDate && this.endDate);
  }

  async exportToPdf(): Promise<void> {
    if (!this.data || !this.exportContentRef?.nativeElement) return;
    this.isExporting = true;
    try {
      const element = this.exportContentRef.nativeElement;
      const canvas = await html2canvas(element, {
        scale: 2,
        useCORS: true,
        logging: false,
        backgroundColor: '#F2F0EB'
      });
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4'
      });
      const pdfW = pdf.internal.pageSize.getWidth();
      const pdfH = pdf.internal.pageSize.getHeight();
      const margin = 10;
      const pageW = pdfW - 2 * margin;
      const pageH = pdfH - 2 * margin;
      const imgW = canvas.width;
      const imgH = canvas.height;
      const ratio = pageW / imgW;
      const scaledH = imgH * ratio;
      let heightLeft = scaledH;
      let position = margin;
      let page = 0;
      pdf.addImage(imgData, 'PNG', margin, position, pageW, scaledH);
      heightLeft -= pageH;
      while (heightLeft > 0) {
        page++;
        pdf.addPage();
        position = heightLeft < 0 ? margin + heightLeft : margin;
        pdf.addImage(imgData, 'PNG', margin, position, pageW, scaledH);
        heightLeft -= pageH;
      }
      const fileName = `Redevance-Loterie-${this.clientsTitle.replace(/\s+/g, '-')}-${this.startDate}_${this.endDate}.pdf`;
      pdf.save(fileName);
    } catch (err) {
      console.error('Erreur export PDF:', err);
    } finally {
      this.isExporting = false;
    }
  }

  goBack(): void {
    this.router.navigate(['/comptes']);
  }

  goToCalcul(): void {
    this.router.navigate(['/configuration/calcul'], { queryParams: { module: 'REDEVANCE_LOTERIE' } });
  }

  formatNum(n: number): string {
    if (n == null || isNaN(n)) return '0';
    return Math.round(n).toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  }

  formatNumDecimal(n: number): string {
    if (n == null || isNaN(n)) return '0';
    return n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  get tauxPayin(): string {
    return this.data ? `${this.data.tauxPayin.toLocaleString('fr-FR', { minimumFractionDigits: 2 })}%` : '—';
  }

  get tauxPayout(): string {
    return this.data ? `${this.data.tauxPayout.toLocaleString('fr-FR', { minimumFractionDigits: 2 })}%` : '—';
  }

  get retenueSurGainsTaux(): string {
    if (!this.data) return '—';
    const s = this.data.retenueSurGainsSeuil;
    return `${this.data.retenueSurGainsPourcentage}% (≥${this.formatNum(s)})`;
  }

  get taxeJeuxHasard(): string {
    return this.data ? `${this.data.taxeJeuxHasardPourcentage}% CA Brut` : '—';
  }

  /** Mapping code agence → nom affiché */
  private static readonly AGENCE_DISPLAY_NAMES: Record<string, string> = {
    'SPTLN2664': 'SPORTLINE',
    'XBTBF2720': '1XBET',
    'FSLTO2796': 'FASO LOTO'
  };

  get clientsTitle(): string {
    if (this.selectedAgence) {
      return RedevanceLoterieComponent.AGENCE_DISPLAY_NAMES[this.selectedAgence]
        ?? this.selectedAgence;
    }
    return 'Les clients';
  }

  get isNegative(): boolean {
    return !!(this.data && (this.data.redevanceTotale < 0 || this.data.baseCalcul < 0));
  }

  private getInitialChartData(): any {
    const moisNoms = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Août', 'Sep', 'Oct', 'Nov', 'Déc'];
    const now = new Date();
    const labels: string[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      labels.push(`${moisNoms[d.getMonth()]} ${d.getFullYear()}`);
    }
    return {
      labels,
      datasets: [{
        label: 'Redevance (XOF)',
        data: labels.map(() => 0),
        backgroundColor: labels.map((_, idx) => idx === labels.length - 1 ? 'rgba(46, 125, 50, 0.8)' : 'rgba(33, 150, 243, 0.6)'),
        borderColor: labels.map((_, idx) => idx === labels.length - 1 ? '#2e7d32' : '#2196f3'),
        borderWidth: 1
      }]
    };
  }

  loadChartData(): void {
    const pays = (this.selectedPays || []).filter(Boolean);
    const moisNoms = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Août', 'Sep', 'Oct', 'Nov', 'Déc'];
    const now = new Date();
    const fallbackLabels: string[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      fallbackLabels.push(`${moisNoms[d.getMonth()]} ${d.getFullYear()}`);
    }
    this.redevanceService.getRedevanceByMonths(
      this.selectedAgence || null,
      pays,
      6
    ).subscribe({
      next: (items) => {
        const labels = items.length > 0 ? items.map(i => i.month) : fallbackLabels;
        const values = items.length > 0 ? items.map(i => i.redevance) : fallbackLabels.map(() => 0);
        this.redevanceChartData = {
          labels,
          datasets: [{
            label: 'Redevance (XOF)',
            data: values,
            backgroundColor: labels.map((_, idx) => {
              const isCurrent = idx === labels.length - 1;
              return isCurrent ? 'rgba(46, 125, 50, 0.8)' : 'rgba(33, 150, 243, 0.6)';
            }),
            borderColor: labels.map((_, idx) => idx === labels.length - 1 ? '#2e7d32' : '#2196f3'),
            borderWidth: 1
          }]
        };
      },
      error: () => {
        this.redevanceChartData = {
          labels: fallbackLabels,
          datasets: [{
            label: 'Redevance (XOF)',
            data: fallbackLabels.map(() => 0),
            backgroundColor: fallbackLabels.map((_, idx) => idx === fallbackLabels.length - 1 ? 'rgba(46, 125, 50, 0.8)' : 'rgba(33, 150, 243, 0.6)'),
            borderColor: fallbackLabels.map((_, idx) => idx === fallbackLabels.length - 1 ? '#2e7d32' : '#2196f3'),
            borderWidth: 1
          }]
        };
      }
    });
  }
}
