import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { 
  SupplyPredictionService, 
  SupplyRecommendation, 
  SupplyCalendar, 
  AgencyAnalytics, 
  SupplyMetrics, 
  SupplyPredictionConfig,
  CompensationMetrics,
  CompensationRecommendation,
  CompensationAnalytics,
  AgencyThreshold
} from '../../services/supply-prediction.service';
import { PredictionService, PredictionType } from '../../services/prediction.service';
import { TranslateService } from '@ngx-translate/core';

@Component({
  selector: 'app-predictions-new',
  templateUrl: './predictions-new.component.html',
  styleUrls: ['./predictions-new.component.scss']
})
export class PredictionsNewComponent implements OnInit {
  // Formulaires
  configForm: FormGroup;
  analysisForm: FormGroup;
  
  // Données pour approvisionnements
  recommendations: SupplyRecommendation[] = [];
  calendar: SupplyCalendar | null = null;
  metrics: SupplyMetrics | null = null;
  selectedAgencyAnalytics: AgencyAnalytics | null = null;
  
  // Données pour compensations
  compensationRecommendations: CompensationRecommendation[] = [];
  compensationMetrics: CompensationMetrics | null = null;
  compensationCalendar: SupplyCalendar | null = null;
  selectedCompensationAnalytics: CompensationAnalytics | null = null;
  
  // États
  isLoading = false;
  errorMessage: string | null = null;
  selectedTab: 'overview' | 'recommendations' | 'calendar' | 'analytics' = 'overview';
  showConfig = false; // Configuration masquée par défaut
  // Toast (popup non bloquant)
  toastMessage: string | null = null;
  toastType: 'success' | 'error' | 'info' = 'info';
  private toastTimeoutHandle: any = null;
  
  // Types d'opérations disponibles
  availableTypes: PredictionType[] = [];
  
  // Gestion des seuils personnalisés
  agencyThresholds: AgencyThreshold[] = [];
  showThresholdsModal = false;
  editingThreshold: AgencyThreshold | null = null;
  thresholdForm: FormGroup;
  // Modal de confirmation générique
  showConfirmModal = false;
  confirmTitle = '';
  confirmMessage = '';
  private confirmResolve: ((confirmed: boolean) => void) | null = null;
  
  // Pagination
  recommendationsPage = 1;
  recommendationsPageSize = 10;
  calendarPage = 1;
  calendarPageSize = 5; // 5 semaines par page
  
  // Configuration
  config: SupplyPredictionConfig = {
    leadTimeDays: 7,
    safetyFactor: 1.5,
    minStockDays: 14,
    maxStockDays: 60,
    urgentThresholdDays: 2,
    normalThresholdDays: 4,
    compensationThresholdAmount: 5000000,
    seasonalityEnabled: true,
    trendAnalysisEnabled: true,
    volatilityWeight: 0.3,
    predictionConfidenceThreshold: 0.7
  };

  constructor(
    private fb: FormBuilder,
    private supplyPredictionService: SupplyPredictionService,
    private predictionService: PredictionService,
    private router: Router,
    private translate: TranslateService
  ) {
    this.configForm = this.fb.group({
      leadTimeDays: [7, [Validators.required, Validators.min(1), Validators.max(30)]],
      safetyFactor: [1.5, [Validators.required, Validators.min(1.0), Validators.max(3.0)]],
      minStockDays: [14, [Validators.required, Validators.min(1), Validators.max(90)]],
      maxStockDays: [60, [Validators.required, Validators.min(1), Validators.max(365)]],
      urgentThresholdDays: [2, [Validators.required, Validators.min(1)]],
      normalThresholdDays: [4, [Validators.required, Validators.min(1)]],
      compensationThresholdAmount: [5000000, [Validators.min(0)]],
      seasonalityEnabled: [true],
      trendAnalysisEnabled: [true],
      volatilityWeight: [0.3, [Validators.min(0), Validators.max(1)]],
      predictionConfidenceThreshold: [0.7, [Validators.min(0), Validators.max(1)]]
    });
    
    this.analysisForm = this.fb.group({
      typeOperation: ['', Validators.required],
      pays: [''],
      periodeAnalyseJours: [90, [Validators.required, Validators.min(7), Validators.max(730)]],
      calendarDays: [30, [Validators.required, Validators.min(7), Validators.max(365)]]
    });
    
    // Formulaire pour les seuils personnalisés
    this.thresholdForm = this.fb.group({
      codeProprietaire: ['', Validators.required],
      thresholdAmount: [0, [Validators.required, Validators.min(1)]]
    });
    
    // Écouter les changements de typeOperation pour charger les seuils
    this.analysisForm.get('typeOperation')?.valueChanges.subscribe(() => {
      if (this.isCompensationType()) {
        this.loadAgencyThresholds();
      }
    });
  }

  ngOnInit() {
    this.loadAvailableTypes();
  }

  // Affiche un toast auto-dismiss
  private showToast(message: string, type: 'success' | 'error' | 'info' = 'info', durationMs = 3500) {
    this.toastMessage = message;
    this.toastType = type;
    if (this.toastTimeoutHandle) {
      clearTimeout(this.toastTimeoutHandle);
    }
    this.toastTimeoutHandle = setTimeout(() => {
      this.toastMessage = null;
    }, durationMs);
  }

  // Ouvre un modal de confirmation et renvoie une Promise<boolean>
  private confirm(title: string, message: string): Promise<boolean> {
    this.confirmTitle = title;
    this.confirmMessage = message;
    this.showConfirmModal = true;
    return new Promise<boolean>((resolve) => {
      this.confirmResolve = resolve;
    });
  }

  onConfirmModal(ok: boolean) {
    this.showConfirmModal = false;
    const resolver = this.confirmResolve;
    this.confirmResolve = null;
    if (resolver) resolver(ok);
  }

  /**
   * Vérifie si le type sélectionné est une compensation
   */
  isCompensationType(): boolean {
    const typeOperation = this.analysisForm.get('typeOperation')?.value;
    return typeOperation && typeOperation.toLowerCase().includes('compense');
  }

  /**
   * Charge les types d'opérations disponibles
   */
  loadAvailableTypes() {
    this.predictionService.getAvailableTypes().subscribe({
      next: (types) => {
        this.availableTypes = types || [];
      },
      error: (error) => {
        console.error('Erreur lors du chargement des types:', error);
        this.errorMessage = this.translateKey('PRD.errLoadTypes');
      }
    });
  }

  /**
   * Configure le système
   */
  saveConfiguration() {
    if (this.configForm.valid) {
      this.config = this.configForm.value;
      console.log('[Predictions] Sauvegarde configuration - payload:', this.config);
      this.supplyPredictionService.configure(this.config).subscribe({
        next: (res) => {
          console.log('[Predictions] Configuration sauvegardée - réponse API:', res);
          this.errorMessage = null;
          this.showToast(this.translateKey('PRD.toastConfigSaved'), 'success');
        },
        error: (error) => {
          console.error('[Predictions] Erreur sauvegarde configuration:', error);
          const message = this.translateKey('PRD.errSaveConfig');
          this.errorMessage = message;
          this.showToast(message, 'error');
          console.error(error);
        }
      });
    }
  }

  /**
   * Charge les recommandations (appros ou compensations selon le type)
   */
  loadRecommendations() {
    if (!this.analysisForm.get('typeOperation')?.value) {
      this.errorMessage = this.translateKey('PRD.errSelectType');
      return;
    }
    
    if (this.isCompensationType()) {
      this.loadCompensationRecommendations();
    } else {
      this.loadSupplyRecommendations();
    }
  }

  /**
   * Charge les recommandations d'approvisionnement
   */
  private loadSupplyRecommendations() {
    this.isLoading = true;
    this.errorMessage = null;
    
    const typeOperation = this.analysisForm.get('typeOperation')?.value;
    const pays = this.analysisForm.get('pays')?.value;
    const periodeAnalyseJours = this.analysisForm.get('periodeAnalyseJours')?.value;
    
    this.supplyPredictionService.getRecommendations(typeOperation, pays, periodeAnalyseJours).subscribe({
      next: (recommendations) => {
        this.recommendations = this.enhanceRecommendationsAccuracy(recommendations);
        this.resetRecommendationsPagination();
        this.selectedTab = 'recommendations';
        this.isLoading = false;
      },
      error: (error) => {
        this.errorMessage = this.translateKey('PRD.errLoadRecommendations');
        console.error(error);
        this.isLoading = false;
      }
    });
  }

  /**
   * Améliore la précision des recommandations avec des calculs avancés
   */
  private enhanceRecommendationsAccuracy(recommendations: SupplyRecommendation[]): SupplyRecommendation[] {
    if (!this.configForm.get('trendAnalysisEnabled')?.value && !this.configForm.get('volatilityWeight')?.value) {
      return recommendations;
    }

    return recommendations.map(rec => {
      // Calculer la volatilité
      const volatility = this.calculateVolatility(rec);
      
      // Ajuster le niveau de confiance en fonction de la volatilité
      const volatilityWeight = this.configForm.get('volatilityWeight')?.value ?? 0.3;
      const adjustedConfidence = rec.confidenceLevel * (1 - volatility * volatilityWeight);
      
      // Ajuster le stock de sécurité en fonction de la volatilité
      const adjustedSafetyStock = rec.safetyStock * (1 + volatility);
      
      // Ajuster la date prédite en fonction de la tendance
      const adjustedDate = this.adjustPredictionDateWithTrend(rec);
      
      return {
        ...rec,
        confidenceLevel: Math.max(0, Math.min(1, adjustedConfidence)),
        safetyStock: adjustedSafetyStock,
        predictedDate: adjustedDate,
        // Ajouter des métadonnées pour le debugging
        volatilityScore: volatility,
        trendAdjustment: this.calculateTrendAdjustment(rec)
      } as any;
    });
  }

  /**
   * Calcule la volatilité basée sur les variations de consommation
   */
  private calculateVolatility(rec: SupplyRecommendation): number {
    const avgConsumption = rec.averageConsumptionDaily || 0;
    const currentBalance = rec.currentBalance || 0;
    
    // Volatilité normalisée entre 0 et 1
    if (avgConsumption === 0) return 0;
    const variation = Math.abs(currentBalance - (avgConsumption * 30)) / (avgConsumption * 30);
    return Math.min(variation, 1);
  }

  /**
   * Calcule l'ajustement de tendance
   */
  private calculateTrendAdjustment(rec: SupplyRecommendation): number {
    // Simuler un calcul de tendance
    // Dans la vraie implémentation, analyser les données historiques
    return 0; // Neutre par défaut
  }

  /**
   * Ajuste la date de prédiction en fonction de la tendance
   */
  private adjustPredictionDateWithTrend(rec: SupplyRecommendation): Date {
    const originalDate = new Date(rec.predictedDate);
    const trendAdjustment = this.calculateTrendAdjustment(rec);
    
    // Ajuster de ±2 jours selon la tendance
    originalDate.setDate(originalDate.getDate() + Math.round(trendAdjustment * 2));
    return originalDate;
  }

  /**
   * Charge les recommandations de compensation
   */
  private loadCompensationRecommendations() {
    this.isLoading = true;
    this.errorMessage = null;
    
    const typeOperation = this.analysisForm.get('typeOperation')?.value;
    const pays = this.analysisForm.get('pays')?.value;
    const periodeAnalyseJours = this.analysisForm.get('periodeAnalyseJours')?.value;
    const thresholdAmount = this.configForm.get('compensationThresholdAmount')?.value;
    
    this.supplyPredictionService.getCompensationRecommendations(
      typeOperation, 
      thresholdAmount,
      pays, 
      periodeAnalyseJours
    ).subscribe({
      next: (recommendations) => {
        this.compensationRecommendations = recommendations;
        this.resetRecommendationsPagination();
        this.selectedTab = 'recommendations';
        this.isLoading = false;
      },
      error: (error) => {
        this.errorMessage = this.translateKey('PRD.errLoadCompRecommendations');
        console.error(error);
        this.isLoading = false;
      }
    });
  }

  /**
   * Charge le calendrier
   */
  loadCalendar() {
    if (!this.analysisForm.get('typeOperation')?.value) {
      this.errorMessage = this.translateKey('PRD.errSelectType');
      return;
    }
    
    if (this.isCompensationType()) {
      this.loadCompensationCalendar();
    } else {
      this.loadSupplyCalendar();
    }
  }

  /**
   * Charge le calendrier d'approvisionnement
   */
  private loadSupplyCalendar() {
    this.isLoading = true;
    this.errorMessage = null;
    
    const typeOperation = this.analysisForm.get('typeOperation')?.value;
    const pays = this.analysisForm.get('pays')?.value;
    const calendarDays = this.analysisForm.get('calendarDays')?.value;
    
    this.supplyPredictionService.getCalendar(typeOperation, calendarDays, pays).subscribe({
      next: (calendar) => {
        this.calendar = calendar;
        this.resetCalendarPagination();
        this.selectedTab = 'calendar';
        this.isLoading = false;
      },
      error: (error) => {
        this.errorMessage = this.translateKey('PRD.errLoadCalendar');
        console.error(error);
        this.isLoading = false;
      }
    });
  }

  /**
   * Charge le calendrier de compensation
   */
  private loadCompensationCalendar() {
    this.isLoading = true;
    this.errorMessage = null;
    
    const typeOperation = this.analysisForm.get('typeOperation')?.value;
    const pays = this.analysisForm.get('pays')?.value;
    const calendarDays = this.analysisForm.get('calendarDays')?.value;
    const thresholdAmount = this.configForm.get('compensationThresholdAmount')?.value;
    
    this.supplyPredictionService.getCompensationCalendar(
      typeOperation,
      thresholdAmount,
      calendarDays,
      pays
    ).subscribe({
      next: (calendar) => {
        this.compensationCalendar = calendar;
        this.resetCalendarPagination();
        this.selectedTab = 'calendar';
        this.isLoading = false;
      },
      error: (error) => {
        this.errorMessage = this.translateKey('PRD.errLoadCompCalendar');
        console.error(error);
        this.isLoading = false;
      }
    });
  }

  /**
   * Charge les métriques globales
   */
  loadMetrics() {
    const typeOperation = this.analysisForm.get('typeOperation')?.value;
    if (!typeOperation) {
      this.errorMessage = this.translateKey('PRD.errSelectType');
      return;
    }
    
    if (this.isCompensationType()) {
      this.loadCompensationMetrics();
    } else {
      this.loadSupplyMetrics();
    }
  }

  /**
   * Charge les métriques d'approvisionnement
   */
  private loadSupplyMetrics() {
    this.isLoading = true;
    this.errorMessage = null;
    
    const typeOperation = this.analysisForm.get('typeOperation')?.value;
    const pays = this.analysisForm.get('pays')?.value;
    
    this.supplyPredictionService.getMetrics(typeOperation, pays).subscribe({
      next: (metrics) => {
        this.metrics = metrics;
        this.selectedTab = 'overview';
        this.isLoading = false;
      },
      error: (error) => {
        console.error('Erreur lors du chargement des métriques:', error);
        this.errorMessage = this.translateKey('PRD.errLoadMetrics');
        this.isLoading = false;
      }
    });
  }

  /**
   * Charge les métriques de compensation
   */
  private loadCompensationMetrics() {
    // Charger les seuils personnalisés en même temps
    this.loadAgencyThresholds();
    this.isLoading = true;
    this.errorMessage = null;
    
    const typeOperation = this.analysisForm.get('typeOperation')?.value;
    const pays = this.analysisForm.get('pays')?.value;
    const thresholdAmount = this.configForm.get('compensationThresholdAmount')?.value;
    
    this.supplyPredictionService.getCompensationMetrics(
      typeOperation,
      thresholdAmount,
      pays
    ).subscribe({
      next: (metrics) => {
        this.compensationMetrics = metrics;
        this.selectedTab = 'overview';
        this.isLoading = false;
      },
      error: (error) => {
        console.error('Erreur lors du chargement des métriques de compensation:', error);
        this.errorMessage = this.translateKey('PRD.errLoadCompMetrics');
        this.isLoading = false;
      }
    });
  }

  /**
   * Charge les analytiques d'une agence
   */
  loadAgencyAnalytics(codeProprietaire: string) {
    const typeOperation = this.analysisForm.get('typeOperation')?.value;
    if (!typeOperation) {
      return;
    }
    
    if (this.isCompensationType()) {
      this.loadCompensationAnalytics(codeProprietaire);
    } else {
      this.loadSupplyAnalytics(codeProprietaire);
    }
  }

  /**
   * Charge les analytiques d'approvisionnement
   */
  private loadSupplyAnalytics(codeProprietaire: string) {
    const typeOperation = this.analysisForm.get('typeOperation')?.value;
    const periodeAnalyseJours = this.analysisForm.get('periodeAnalyseJours')?.value;
    
    this.isLoading = true;
    this.supplyPredictionService.getAgencyAnalytics(codeProprietaire, typeOperation, periodeAnalyseJours).subscribe({
      next: (analytics) => {
        this.selectedAgencyAnalytics = analytics;
        this.selectedTab = 'analytics';
        this.isLoading = false;
      },
      error: (error) => {
        this.errorMessage = this.translateKey('PRD.errLoadAnalytics');
        console.error(error);
        this.isLoading = false;
      }
    });
  }

  /**
   * Charge les analytiques de compensation
   */
  private loadCompensationAnalytics(codeProprietaire: string) {
    const typeOperation = this.analysisForm.get('typeOperation')?.value;
    const periodeAnalyseJours = this.analysisForm.get('periodeAnalyseJours')?.value;
    const thresholdAmount = this.getEffectiveThreshold(codeProprietaire);
    
    this.isLoading = true;
    this.supplyPredictionService.getCompensationAnalytics(
      codeProprietaire,
      typeOperation,
      thresholdAmount,
      periodeAnalyseJours
    ).subscribe({
      next: (analytics) => {
        this.selectedCompensationAnalytics = analytics;
        this.selectedTab = 'analytics';
        this.isLoading = false;
      },
      error: (error) => {
        this.errorMessage = this.translateKey('PRD.errLoadCompAnalytics');
        console.error(error);
        this.isLoading = false;
      }
    });
  }

  /**
   * Retour à la page des comptes
   */
  goBack() {
    this.router.navigate(['/comptes']);
  }

  /**
   * Formate un nombre en format monétaire
   */
  formatCurrency(value: number): string {
    return value?.toLocaleString(this.localeTag(), { style: 'currency', currency: 'XOF' }) || '0 XOF';
  }

  /**
   * Formate un pourcentage
   */
  formatPercent(value: number): string {
    return value ? (value * 100).toFixed(1) + '%' : '0%';
  }

  /**
   * Calcule un risque de rupture côté front en se basant sur les jours de stock
   * Utilise la même logique que le backend : pourcentage progressif entre les seuils
   */
  computeStockoutRiskPercent(analytics: AgencyAnalytics | null): number {
    if (!analytics) return 0;
    
    // Utiliser directement la valeur du backend si disponible
    if (analytics.stockoutRisk !== null && analytics.stockoutRisk !== undefined) {
      return analytics.stockoutRisk;
    }
    
    // Sinon, recalculer avec la même logique que le backend
    const avgDaily = analytics.averageConsumptionDaily || 0;
    const currentStock = analytics.currentStock || 0;
    if (avgDaily <= 0) return 0;

    // Jours de stock (J)
    const stockDays = currentStock / avgDaily;
    const urgent = this.configForm.get('urgentThresholdDays')?.value ?? this.config.urgentThresholdDays ?? 2;
    const normal = this.configForm.get('normalThresholdDays')?.value ?? this.config.normalThresholdDays ?? 4;

    // Même logique que le backend
    if (stockDays <= 0) return 100;
    if (stockDays <= urgent) return 100;
    if (stockDays >= normal) return 0;
    
    // Interpolation linéaire : de 100% à 0% entre urgent et normal
    const range = normal - urgent;
    const position = stockDays - urgent;
    const riskPercent = 100 * (1 - (position / range));
    return Math.max(0, Math.min(100, Math.round(riskPercent)));
  }

  /**
   * Détermine le statut basé sur le pourcentage de risque de rupture
   * Un seul statut est retourné selon le pourcentage
   */
  getStatusFromRiskPercent(analytics: AgencyAnalytics | null): 'critical' | 'normal' | 'low' {
    if (!analytics) return 'normal';
    
    const riskPercent = this.computeStockoutRiskPercent(analytics);
    
    // Statut basé uniquement sur le pourcentage de risque
    if (riskPercent >= 75) {
      return 'critical';  // Risque élevé (75-100%)
    } else if (riskPercent >= 50) {
      return 'critical';  // Risque moyen-élevé (50-74%)
    } else if (riskPercent >= 25) {
      return 'normal';    // Risque moyen (25-49%)
    } else {
      return 'low';       // Risque faible (0-24%)
    }
  }

  /**
   * Obtient le libellé du statut
   */
  getStatusLabel(status: 'critical' | 'normal' | 'low'): string {
    switch (status) {
      case 'critical': return this.translateKey('PRD.statusCritical');
      case 'normal': return this.translateKey('PRD.statusNormal');
      case 'low': return this.translateKey('PRD.statusLow');
      default: return this.translateKey('PRD.statusNormal');
    }
  }

  /**
   * Obtient la classe CSS du statut
   */
  getStatusClass(status: 'critical' | 'normal' | 'low'): string {
    switch (status) {
      case 'critical': return 'badge critical';
      case 'normal': return 'badge normal';
      case 'low': return 'badge low';
      default: return 'badge normal';
    }
  }

  // Indication compensation: stock actuel <= seuil paramétré
  shouldTriggerCompensation(analytics: AgencyAnalytics | null): boolean {
    if (!analytics) return false;
    const threshold = this.configForm.get('compensationThresholdAmount')?.value ?? this.config.compensationThresholdAmount ?? 0;
    const current = analytics.currentStock || 0;
    return threshold > 0 && current >= threshold;
  }

  /**
   * Obtient la classe CSS pour le niveau d'alerte
   */
  getAlertClass(alertLevel: string): string {
    switch (alertLevel) {
      case 'urgent': return 'alert-urgent';
      case 'normal': return 'alert-normal';
      case 'low': return 'alert-low';
      default: return '';
    }
  }

  /**
   * Obtient l'icône pour le niveau d'alerte
   */
  getAlertIcon(alertLevel: string): string {
    switch (alertLevel) {
      case 'urgent': return '🚨';
      case 'normal': return '⚠️';
      case 'low': return '✅';
      default: return 'ℹ️';
    }
  }

  /**
   * Obtient le début de la semaine (lundi)
   */
  private getWeekStart(date: Date): Date {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Ajuster au lundi
    return new Date(d.setDate(diff));
  }

  /**
   * Formate la clé de semaine
   */
  private formatWeekKey(date: Date): string {
    return date.toLocaleDateString('fr-FR', { 
      day: '2-digit', 
      month: '2-digit', 
      year: 'numeric' 
    });
  }

  /**
   * Formate une date d'affichage selon la langue active
   */
  formatDate(date: string | Date): string {
    const d = typeof date === 'string' ? new Date(date) : date;
    return d.toLocaleDateString(this.localeTag(), { 
      day: '2-digit', 
      month: '2-digit', 
      year: 'numeric' 
    });
  }

  /**
   * Obtient le solde recommandé d'un événement (fallback sur recommendedQuantity si nécessaire)
   */
  getEventRecommendedBalance(event: any): number {
    return (event as any).recommendedBalance || event.recommendedQuantity || event.recommendedAmount || 0;
  }

  /**
   * Groupe les événements du calendrier par semaine et retourne un tableau
   */
  getCalendarWeeks(): { week: string; events: any[] }[] {
    const calendarToUse = this.isCompensationType() ? this.compensationCalendar : this.calendar;
    
    if (!calendarToUse || !calendarToUse.events) {
      return [];
    }
    
    const grouped = new Map<string, any[]>();
    
    calendarToUse.events.forEach((event: any) => {
      const date = new Date(event.date);
      const weekStart = this.getWeekStart(date);
      const weekKey = this.formatWeekKey(weekStart);
      
      if (!grouped.has(weekKey)) {
        grouped.set(weekKey, []);
      }
      grouped.get(weekKey)!.push(event);
    });
    
    // Convertir en tableau et trier par date
    return Array.from(grouped.entries())
      .map(([week, events]) => ({ week, events }))
      .sort((a, b) => {
        // Convertir la date française en Date pour trier
        const dateA = new Date(a.week.split('/').reverse().join('-'));
        const dateB = new Date(b.week.split('/').reverse().join('-'));
        return dateA.getTime() - dateB.getTime();
      });
  }

  /**
   * Obtient le libellé du pattern de compensation
   */
  getCompensationPatternLabel(pattern: string): string {
    switch (pattern) {
      case 'regular': return this.translateKey('PRD.patternRegular');
      case 'irregular': return this.translateKey('PRD.patternIrregular');
      case 'seasonal': return this.translateKey('PRD.patternSeasonal');
      default: return this.translateKey('PRD.unknown');
    }
  }

  /**
   * Obtient le libellé du risque
   */
  getRiskLevelLabel(level: string): string {
    switch (level) {
      case 'high': return this.translateKey('PRD.riskHigh');
      case 'medium': return this.translateKey('PRD.riskMedium');
      case 'low': return this.translateKey('PRD.riskLow');
      default: return this.translateKey('PRD.unknown');
    }
  }

  /**
   * Obtient la classe CSS du niveau de risque
   */
  getRiskLevelClass(level: string): string {
    switch (level) {
      case 'high': return 'risk-high';
      case 'medium': return 'risk-medium';
      case 'low': return 'risk-low';
      default: return '';
    }
  }

  // ============================================
  // GESTION DES SEUILS PERSONNALISÉS PAR AGENCE
  // ============================================

  /**
   * Charge la liste des seuils personnalisés
   */
  loadAgencyThresholds() {
    const typeOperation = this.analysisForm.get('typeOperation')?.value;
    if (!typeOperation || !this.isCompensationType()) {
      this.agencyThresholds = [];
      return;
    }

    this.isLoading = true;
    this.supplyPredictionService.getAgencyThresholds(typeOperation).subscribe({
      next: (thresholds) => {
        this.agencyThresholds = thresholds || [];
        this.isLoading = false;
      },
      error: (error) => {
        console.error('Erreur lors du chargement des seuils:', error);
        this.errorMessage = this.translateKey('PRD.errLoadThresholds');
        this.isLoading = false;
      }
    });
  }

  /**
   * Ouvre le modal pour créer/modifier un seuil
   */
  openThresholdModal(threshold?: AgencyThreshold) {
    this.editingThreshold = threshold || null;
    if (threshold) {
      this.thresholdForm.patchValue({
        codeProprietaire: threshold.codeProprietaire,
        thresholdAmount: threshold.thresholdAmount
      });
    } else {
      this.thresholdForm.reset({
        codeProprietaire: '',
        thresholdAmount: this.configForm.get('compensationThresholdAmount')?.value || 0
      });
    }
    this.showThresholdsModal = true;
  }

  /**
   * Ferme le modal
   */
  closeThresholdModal() {
    this.showThresholdsModal = false;
    this.editingThreshold = null;
    this.thresholdForm.reset();
  }

  /**
   * Sauvegarde un seuil personnalisé
   */
  saveThreshold() {
    if (this.thresholdForm.invalid) {
      return;
    }

    const typeOperation = this.analysisForm.get('typeOperation')?.value;
    if (!typeOperation) {
      this.errorMessage = this.translateKey('PRD.errSelectType');
      return;
    }

    const thresholdData: AgencyThreshold = {
      ...this.thresholdForm.value,
      typeOperation: typeOperation
    };

    if (this.editingThreshold && this.editingThreshold.id) {
      thresholdData.id = this.editingThreshold.id;
    }

    this.isLoading = true;
    this.supplyPredictionService.saveAgencyThreshold(thresholdData).subscribe({
      next: () => {
        this.loadAgencyThresholds();
        this.closeThresholdModal();
        this.isLoading = false;
      },
      error: (error) => {
console.error('Erreur lors de la sauvegarde du seuil:', error);
      this.errorMessage = this.translateKey('PRD.errSaveThreshold');
        this.isLoading = false;
      }
    });
  }

  /**
   * Supprime un seuil personnalisé
   */
  deleteThreshold(threshold: AgencyThreshold) {
    this.confirm(
      this.translateKey('PRD.confirmDeleteTitle'),
      this.translateKey('PRD.confirmDeleteMsg', { agency: threshold.agence || threshold.codeProprietaire })
    ).then((ok) => {
      if (!ok) return;

      const typeOperation = this.analysisForm.get('typeOperation')?.value;
      if (!typeOperation) {
        return;
      }

      this.isLoading = true;
      this.supplyPredictionService.deleteAgencyThreshold(threshold.codeProprietaire, typeOperation).subscribe({
        next: () => {
          this.loadAgencyThresholds();
          this.isLoading = false;
          this.showToast(this.translateKey('PRD.toastThresholdDeleted'), 'success');
        },
        error: (error) => {
          console.error('Erreur lors de la suppression du seuil:', error);
          const message = this.translateKey('PRD.errDeleteThreshold');
          this.errorMessage = message;
          this.isLoading = false;
          this.showToast(message, 'error');
        }
      });
    });
  }

  /**
   * Vérifie si une agence a un seuil personnalisé
   */
  hasCustomThreshold(codeProprietaire: string): boolean {
    return this.agencyThresholds.some(t => t.codeProprietaire === codeProprietaire);
  }

  /**
   * Obtient le seuil personnalisé pour une agence
   */
  getCustomThreshold(codeProprietaire: string): AgencyThreshold | undefined {
    return this.agencyThresholds.find(t => t.codeProprietaire === codeProprietaire);
  }

  /**
   * Retourne le seuil effectif à utiliser pour une agence (personnalisé si défini, sinon global)
   */
  getEffectiveThreshold(codeProprietaire?: string): number {
    const defaultThreshold = this.configForm.get('compensationThresholdAmount')?.value
      ?? this.config.compensationThresholdAmount
      ?? 0;

    if (!codeProprietaire) {
      return defaultThreshold;
    }

    const custom = this.getCustomThreshold(codeProprietaire);
    return custom?.thresholdAmount ?? defaultThreshold;
  }

  /**
   * Nombre d'agences nécessitant une compensation (avec fallback selon les données disponibles)
   */
  get compensationNeedingCount(): number {
    if (!this.isCompensationType()) {
      return 0;
    }

    if (this.compensationMetrics?.agenciesNeedingCompensation !== undefined) {
      return this.compensationMetrics.agenciesNeedingCompensation;
    }

    if (this.compensationRecommendations.length > 0) {
      return this.compensationRecommendations.length;
    }

    if (this.compensationCalendar?.totalOrders !== undefined) {
      return this.compensationCalendar.totalOrders;
    }

    return 0;
  }

  /**
   * Nombre de compensations urgentes
   */
  get compensationUrgentCount(): number {
    if (!this.isCompensationType()) {
      return 0;
    }

    if (this.compensationMetrics?.urgentCompensations !== undefined) {
      return this.compensationMetrics.urgentCompensations;
    }

    const urgentRecommendations = this.compensationRecommendations.filter(
      rec => rec.alertLevel === 'urgent'
    ).length;

    if (urgentRecommendations > 0) {
      return urgentRecommendations;
    }

    if (this.compensationCalendar?.urgentOrders !== undefined) {
      return this.compensationCalendar.urgentOrders;
    }

    return 0;
  }

  /**
   * Nombre de compensations normales
   */
  get compensationNormalCount(): number {
    if (!this.isCompensationType()) {
      return 0;
    }

    if (this.compensationCalendar?.normalOrders !== undefined) {
      return this.compensationCalendar.normalOrders;
    }

    return this.compensationRecommendations.filter(
      rec => rec.alertLevel === 'normal'
    ).length;
  }

  /**
   * Nombre de compensations à faible priorité
   */
  get compensationLowCount(): number {
    if (!this.isCompensationType()) {
      return 0;
    }

    if (this.compensationCalendar?.lowPriorityOrders !== undefined) {
      return this.compensationCalendar.lowPriorityOrders;
    }

    return this.compensationRecommendations.filter(
      rec => rec.alertLevel === 'low'
    ).length;
  }

  // ============================================
  // PAGINATION
  // ============================================

  /**
   * Obtient les recommandations paginées
   */
  getPaginatedRecommendations(): any[] {
    const recommendations = this.isCompensationType() 
      ? this.compensationRecommendations 
      : this.recommendations;
    
    const start = (this.recommendationsPage - 1) * this.recommendationsPageSize;
    const end = start + this.recommendationsPageSize;
    return recommendations.slice(start, end);
  }

  /**
   * Obtient le nombre total de pages pour les recommandations
   */
  getRecommendationsTotalPages(): number {
    const recommendations = this.isCompensationType() 
      ? this.compensationRecommendations 
      : this.recommendations;
    return Math.ceil(recommendations.length / this.recommendationsPageSize);
  }

  /**
   * Obtient les semaines du calendrier paginées
   */
  getPaginatedCalendarWeeks(): { week: string; events: any[] }[] {
    const weeks = this.getCalendarWeeks();
    const start = (this.calendarPage - 1) * this.calendarPageSize;
    const end = start + this.calendarPageSize;
    return weeks.slice(start, end);
  }

  /**
   * Obtient le nombre total de pages pour le calendrier
   */
  getCalendarTotalPages(): number {
    const weeks = this.getCalendarWeeks();
    return Math.ceil(weeks.length / this.calendarPageSize);
  }

  /**
   * Change la page des recommandations
   */
  changeRecommendationsPage(page: number): void {
    const totalPages = this.getRecommendationsTotalPages();
    if (page >= 1 && page <= totalPages) {
      this.recommendationsPage = page;
    }
  }

  /**
   * Change la page du calendrier
   */
  changeCalendarPage(page: number): void {
    const totalPages = this.getCalendarTotalPages();
    if (page >= 1 && page <= totalPages) {
      this.calendarPage = page;
    }
  }

  /**
   * Réinitialise la pagination des recommandations
   */
  resetRecommendationsPagination(): void {
    this.recommendationsPage = 1;
  }

  /**
   * Réinitialise la pagination du calendrier
   */
  resetCalendarPagination(): void {
    this.calendarPage = 1;
  }

  private translateKey(key: string, params?: Record<string, unknown>): string {
    const value = params
      ? this.translate.instant(key, params as never)
      : this.translate.instant(key);
    return typeof value === 'string' ? value : key;
  }

  private localeTag(): string {
    return this.translate.currentLang === 'en' ? 'en-GB' : 'fr-FR';
  }
}

