import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';
import { Compte } from '../models/compte.model';

export interface MergeRequest {
  compteIds: number[];
  nouveauNomCompte: string;
  pays: string;
}

export interface FusionResult {
  nouveauCompteId: number;
  nouveauNomCompte: string;
  totalSolde: number;
  nombreComptesFusionnes: number;
  pays: string;
}

export interface RejectRequest {
  titre: string;
  commentaire: string;
}

export interface RejectResponse {
  status: string;
  message: string;
  timestamp: string;
}

@Injectable({
  providedIn: 'root'
})
export class ServiceBalanceService {
  private apiUrl = '/api/service-balance';
  private readonly comptesHeaders = new HttpHeaders({ 'X-Permission-Module': 'Comptes' });

  constructor(private http: HttpClient) { }

  /**
   * Test de connectivité de l'API
   */
  testConnection(): Observable<any> {
    return this.http.get(`${this.apiUrl}/test`, { headers: this.comptesHeaders });
  }

  /**
   * Test de connectivité simple
   */
  testPing(): Observable<any> {
    return this.http.get('/api/test/ping', { headers: this.comptesHeaders });
  }

  /**
   * Récupère tous les comptes service
   */
  getServiceComptes(): Observable<Compte[]> {
    return this.http.get<Compte[]>(`${this.apiUrl}/comptes`, { headers: this.comptesHeaders });
  }
  
  /**
   * Récupère tous les comptes (pour debug)
   */
  getAllComptes(): Observable<Compte[]> {
    return this.http.get<Compte[]>(`${this.apiUrl}/comptes/all`, { headers: this.comptesHeaders });
  }

  /**
   * Fusionne plusieurs comptes service en un nouveau compte
   */
  mergeServiceComptes(compteIds: number[], nouveauNomCompte: string, pays: string): Observable<FusionResult> {
    const request: MergeRequest = {
      compteIds,
      nouveauNomCompte,
      pays
    };
    
    console.log('Envoi de la requête de fusion:', request);
    return this.http.post<FusionResult>(`${this.apiUrl}/merge`, request, {
      headers: this.comptesHeaders,
    });
  }

  /**
   * Rejette un compte service avec un titre et un commentaire
   */
  rejectServiceCompte(compteId: number, request: RejectRequest): Observable<RejectResponse> {
    console.log('Envoi de la requête de rejet:', { compteId, request });
    return this.http.post<RejectResponse>(`${this.apiUrl}/reject/${compteId}`, request, {
      headers: this.comptesHeaders,
    });
  }
}
