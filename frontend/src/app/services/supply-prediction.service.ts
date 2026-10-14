import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';

/**
 * Recommandation d'approvisionnement pour une agence
 */
export interface SupplyRecommendation {
  codeProprietaire: string;
  agence?: string;
  typeOperation: string;
  predictedDate: string; // J ou J+1
  recommendedBalance: number; // Solde recommandé (moyenne des soldes sur la période)
  currentBalance: number; // Solde actuel
  averageConsumptionDaily: number; // Consommation moyenne/jour (moyenne des variations journalières)
  // Calculs dérivés
  daysUntilStockout: number; // Jours avant rupture (surplus de consommation journalière)
  safetyStock: number; // Stock de sécurité = solde actuel + 10% de la consommation journalière
  confidenceLevel: number; // Confiance basée sur le stock de sécurité
  alertLevel: 'urgent' | 'normal' | 'low';
}

/**
 * Événement du calendrier
 */
export interface CalendarEvent {
  date: string;
  codeProprietaire: string;
  agence?: string;
  typeOperation: string;
  recommendedBalance?: number; // Solde recommandé (nouveau)
  recommendedQuantity?: number; // Ancien champ (fallback pour compatibilité)
  alertLevel: 'urgent' | 'normal' | 'low';
  numberOfAgencies?: number;
}

/**
 * Calendrier prédictif
 */
export interface SupplyCalendar {
  startDate: string;
  endDate: string;
  totalDays: number;
  events: CalendarEvent[];
  totalOrders: number;
  urgentOrders: number;
  normalOrders: number;
  lowPriorityOrders: number;
}

/**
 * Analytiques détaillées pour une agence
 */
export interface AgencyAnalytics {
  codeProprietaire: string;
  agence?: string;
  typeOperation: string;
  averageConsumptionDaily: number;
  averageConsumptionWeekly: number;
  averageConsumptionMonthly: number;
  consumptionStdDev?: number;
  consumptionTrend: 'increasing' | 'decreasing' | 'stable';
  currentStock: number;
  averageStock?: number; // Stock seuil compensation = moyenne des compensations + solde actuel
  stockDays: number;
  turnoverRate: number;
  stockoutRisk: number;
  isCritical: boolean;
  isOverstocked: boolean;
  isInactive: boolean;
  historicalStats?: any;
}

/**
 * Métriques globales
 */
export interface AgencySummary {
  codeProprietaire: string;
  agence?: string;
  value: number;
  typeOperation: string;
}

export interface SupplyMetrics {
  totalAgencies: number;
  criticalAgencies: number;
  overstockedAgencies: number;
  inactiveAgencies: number;
  averageTurnoverRate?: number;
  averageStockoutRisk?: number;
  averageConfidenceLevel: number;
  urgentOrders: number;
  normalOrders: number;
  lowPriorityOrders: number;
  topCriticalAgencies: AgencySummary[];
  topTurnoverAgencies: AgencySummary[];
}

/**
 * Configuration du système
 */
export interface SupplyPredictionConfig {
  leadTimeDays?: number;
  safetyFactor?: number;
  minStockDays?: number;
  maxStockDays?: number;
  urgentThresholdDays?: number;
  normalThresholdDays?: number;
  // Seuil de solde à partir duquel une compensation doit être déclenchée (XOF)
  compensationThresholdAmount?: number;
  seasonalityEnabled?: boolean;
  trendAnalysisEnabled?: boolean;
  volatilityWeight?: number;
  predictionConfidenceThreshold?: number;
}

/**
 * Métriques de compensation
 */
export interface CompensationMetrics {
  totalAgencies: number;
  agenciesNeedingCompensation: number;
  urgentCompensations: number;
  averageCompensationFrequency: number; // En jours
  totalCompensationAmount: number;
  averageCompensationAmount: number;
  agenciesAboveThreshold: number;
  agenciesBelowThreshold: number;
}

/**
 * Recommandation de compensation
 */
export interface CompensationRecommendation {
  codeProprietaire: string;
  agence: string;
  currentBalance: number;
  thresholdAmount: number;
  predictedDate: Date;
  recommendedAmount: number;
  averageCompensationAmount: number;
  compensationFrequencyDays: number;
  lastCompensationDate: Date | null;
  daysSinceLastCompensation: number;
  alertLevel: 'urgent' | 'normal' | 'low';
  confidenceLevel: number;
  compensationPattern: 'regular' | 'irregular' | 'seasonal';
}

/**
 * Analytiques de compensation
 */
export interface CompensationAnalytics {
  codeProprietaire: string;
  agence: string;
  currentBalance: number;
  averageCompensationAmount: number;
  compensationFrequencyDays: number;
  totalCompensations: number;
  lastCompensationDate: Date | null;
  daysSinceLastCompensation: number;
  predictedNextCompensation: Date;
  compensationTrend: 'increasing' | 'decreasing' | 'stable';
  volatility: number;
  seasonalityFactor: number;
  riskLevel: 'high' | 'medium' | 'low';
}

@Injectable({
  providedIn: 'root'
})
export class SupplyPredictionService {
  private apiUrl = '/api/supply';
  private readonly comptesHeaders = new HttpHeaders({ 'X-Permission-Module': 'Comptes' });

  constructor(private http: HttpClient) {}

  /**
   * Configure le système de prédiction
   */
  configure(config: SupplyPredictionConfig): Observable<any> {
    console.log('[SupplyPredictionService] POST /configure - payload:', config);
    return this.http
      .post(`${this.apiUrl}/configure`, config, { headers: this.comptesHeaders })
      .pipe(
        tap({
          next: (response) => {
            console.log('[SupplyPredictionService] POST /configure - succès - réponse:', response);
          },
          error: (err) => {
            console.error('[SupplyPredictionService] POST /configure - erreur:', err);
          }
        })
      );
  }

  /**
   * Obtient les recommandations d'approvisionnement
   */
  getRecommendations(
    typeOperation: string,
    pays?: string,
    periodeAnalyseJours?: number
  ): Observable<SupplyRecommendation[]> {
    let params = new HttpParams().set('typeOperation', typeOperation);

    if (pays) {
      params = params.set('pays', pays);
    }

    if (periodeAnalyseJours) {
      params = params.set('periodeAnalyseJours', periodeAnalyseJours.toString());
    }

    return this.http.get<SupplyRecommendation[]>(`${this.apiUrl}/recommendations`, {
      params,
      headers: this.comptesHeaders
    });
  }

  /**
   * Obtient le calendrier prédictif
   */
  getCalendar(
    typeOperation: string,
    days?: number,
    pays?: string
  ): Observable<SupplyCalendar> {
    let params = new HttpParams()
      .set('typeOperation', typeOperation);
    
    if (days) {
      params = params.set('days', days.toString());
    }
    
    if (pays) {
      params = params.set('pays', pays);
    }
    
    return this.http.get<SupplyCalendar>(`${this.apiUrl}/calendar`, {
      params,
      headers: this.comptesHeaders
    });
  }

  /**
   * Obtient les analytiques détaillées pour une agence
   */
  getAgencyAnalytics(
    codeProprietaire: string,
    typeOperation: string,
    periodeAnalyseJours?: number
  ): Observable<AgencyAnalytics> {
    let params = new HttpParams()
      .set('typeOperation', typeOperation);
    
    if (periodeAnalyseJours) {
      params = params.set('periodeAnalyseJours', periodeAnalyseJours.toString());
    }
    
    return this.http.get<AgencyAnalytics>(`${this.apiUrl}/agency/${codeProprietaire}`, {
      params,
      headers: this.comptesHeaders
    });
  }

  /**
   * Obtient les métriques globales
   */
  getMetrics(
    typeOperation: string,
    pays?: string
  ): Observable<SupplyMetrics> {
    let params = new HttpParams()
      .set('typeOperation', typeOperation);
    
    if (pays) {
      params = params.set('pays', pays);
    }
    
    return this.http.get<SupplyMetrics>(`${this.apiUrl}/metrics`, {
      params,
      headers: this.comptesHeaders
    });
  }

  /**
   * Crée une commande d'approvisionnement
   */
  createOrder(orderRequest: any): Observable<any> {
    return this.http.post(`${this.apiUrl}/order`, orderRequest, { headers: this.comptesHeaders });
  }

  // ============================================
  // MÉTHODES POUR LES COMPENSATIONS
  // ============================================

  /**
   * Obtient les métriques de compensation
   */
  getCompensationMetrics(
    typeOperation: string,
    thresholdAmount: number,
    pays?: string
  ): Observable<CompensationMetrics> {
    let params = new HttpParams()
      .set('typeOperation', typeOperation)
      .set('thresholdAmount', thresholdAmount.toString());
    
    if (pays) {
      params = params.set('pays', pays);
    }
    
    return this.http.get<CompensationMetrics>(`${this.apiUrl}/compensation/metrics`, {
      params,
      headers: this.comptesHeaders
    });
  }

  /**
   * Obtient les recommandations de compensation
   */
  getCompensationRecommendations(
    typeOperation: string,
    thresholdAmount: number,
    pays?: string,
    periodeAnalyseJours?: number
  ): Observable<CompensationRecommendation[]> {
    let params = new HttpParams()
      .set('typeOperation', typeOperation)
      .set('thresholdAmount', thresholdAmount.toString());
    
    if (pays) {
      params = params.set('pays', pays);
    }
    
    if (periodeAnalyseJours) {
      params = params.set('periodeAnalyseJours', periodeAnalyseJours.toString());
    }
    
    return this.http.get<CompensationRecommendation[]>(
      `${this.apiUrl}/compensation/recommendations`,
      { params, headers: this.comptesHeaders }
    );
  }

  /**
   * Obtient le calendrier de compensation
   */
  getCompensationCalendar(
    typeOperation: string,
    thresholdAmount: number,
    calendarDays?: number,
    pays?: string
  ): Observable<SupplyCalendar> {
    let params = new HttpParams()
      .set('typeOperation', typeOperation)
      .set('thresholdAmount', thresholdAmount.toString());
    
    if (calendarDays) {
      params = params.set('days', calendarDays.toString());
    }
    
    if (pays) {
      params = params.set('pays', pays);
    }
    
    return this.http.get<SupplyCalendar>(
      `${this.apiUrl}/compensation/calendar`,
      { params, headers: this.comptesHeaders }
    );
  }

  /**
   * Obtient les analytiques de compensation d'une agence
   */
  getCompensationAnalytics(
    codeProprietaire: string,
    typeOperation: string,
    thresholdAmount: number,
    periodeAnalyseJours?: number
  ): Observable<CompensationAnalytics> {
    let params = new HttpParams()
      .set('typeOperation', typeOperation)
      .set('thresholdAmount', thresholdAmount.toString());
    
    if (periodeAnalyseJours) {
      params = params.set('periodeAnalyseJours', periodeAnalyseJours.toString());
    }
    
    return this.http.get<CompensationAnalytics>(
      `${this.apiUrl}/compensation/analytics/${codeProprietaire}`,
      { params, headers: this.comptesHeaders }
    );
  }

  // ============================================
  // GESTION DES SEUILS PERSONNALISÉS PAR AGENCE
  // ============================================

  /**
   * Obtient tous les seuils personnalisés pour un type d'opération
   */
  getAgencyThresholds(typeOperation?: string): Observable<AgencyThreshold[]> {
    let params = new HttpParams();
    if (typeOperation) {
      params = params.set('typeOperation', typeOperation);
    }
    
    return this.http.get<AgencyThreshold[]>(
      `${this.apiUrl}/compensation/thresholds`,
      { params, headers: this.comptesHeaders }
    );
  }

  /**
   * Obtient le seuil personnalisé pour une agence spécifique
   */
  getAgencyThreshold(codeProprietaire: string, typeOperation: string): Observable<AgencyThreshold> {
    const params = new HttpParams().set('typeOperation', typeOperation);
    
    return this.http.get<AgencyThreshold>(
      `${this.apiUrl}/compensation/thresholds/${codeProprietaire}`,
      { params, headers: this.comptesHeaders }
    );
  }

  /**
   * Crée ou met à jour un seuil personnalisé pour une agence
   */
  saveAgencyThreshold(threshold: AgencyThreshold): Observable<AgencyThreshold> {
    return this.http.post<AgencyThreshold>(
      `${this.apiUrl}/compensation/thresholds`,
      threshold,
      { headers: this.comptesHeaders }
    );
  }

  /**
   * Supprime un seuil personnalisé pour une agence
   */
  deleteAgencyThreshold(codeProprietaire: string, typeOperation: string): Observable<any> {
    const params = new HttpParams().set('typeOperation', typeOperation);
    
    return this.http.delete<any>(
      `${this.apiUrl}/compensation/thresholds/${codeProprietaire}`,
      { params, headers: this.comptesHeaders }
    );
  }
}

/**
 * Interface pour un seuil personnalisé par agence
 */
export interface AgencyThreshold {
  id?: number;
  codeProprietaire: string;
  agence?: string;
  typeOperation: string;
  thresholdAmount: number;
  createdAt?: string;
  updatedAt?: string;
}

