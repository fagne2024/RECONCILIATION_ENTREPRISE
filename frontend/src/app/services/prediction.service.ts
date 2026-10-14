import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface PredictionRequest {
  typeOperation: string;
  horizonJours?: number;
  codeProprietaire?: string;
  service?: string;
  pays?: string;
  periodeAnalyseJours?: number;
  methodePrediction?: 'moyenne' | 'tendance' | 'saisonnier';
}

export interface PredictionJour {
  date: string;
  montantPrediction: number;
  nombreOperationsPredites: number;
  confiance: number;
  jourSemaine: string;
  soldeAvantPrediction?: number;
  soldeApresPrediction?: number;
}

export interface PredictionResponse {
  typeOperation: string;
  dateDebutPrediction: string;
  dateFinPrediction: string;
  horizonJours: number;
  methodePrediction: string;
  predictionsParJour: PredictionJour[];
  montantTotalPrediction: number;
  montantMoyenParJour: number;
  montantMin: number;
  montantMax: number;
  nombreOperationsPredites: number;
  frequenceMoyenneParJour: number;
  statistiquesHistoriques: any;
  confiance: number;
  message?: string;
}

export interface PredictionType {
  value: string;
  label: string;
}

@Injectable({
  providedIn: 'root'
})
export class PredictionService {
  private apiUrl = '/api/predictions';
  private readonly comptesHeaders = new HttpHeaders({ 'X-Permission-Module': 'Comptes' });

  constructor(private http: HttpClient) {}

  /**
   * Génère une prédiction pour un type d'opération
   */
  predict(request: PredictionRequest): Observable<PredictionResponse> {
    const headers = new HttpHeaders({
      'Content-Type': 'application/json',
      'X-Permission-Module': 'Comptes'
    });

    return this.http.post<PredictionResponse>(this.apiUrl, request, { headers });
  }

  /**
   * Génère plusieurs prédictions en une seule requête
   */
  predictBatch(requests: PredictionRequest[]): Observable<PredictionResponse[]> {
    const headers = new HttpHeaders({
      'Content-Type': 'application/json',
      'X-Permission-Module': 'Comptes'
    });

    return this.http.post<PredictionResponse[]>(`${this.apiUrl}/batch`, requests, { headers });
  }

  /**
   * Récupère les types d'opérations disponibles pour les prédictions
   */
  getAvailableTypes(): Observable<PredictionType[]> {
    return this.http.get<PredictionType[]>(`${this.apiUrl}/types`, { headers: this.comptesHeaders });
  }
}

