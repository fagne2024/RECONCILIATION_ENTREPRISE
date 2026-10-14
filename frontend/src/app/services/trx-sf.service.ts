import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export interface TrxSfData {
  id?: number;
  idTransaction: string;
  telephoneClient: string;
  montant: number;
  service: string;
  agence: string;
  dateTransaction: string;
  numeroTransGu: string;
  pays: string;
  statut: 'EN_ATTENTE' | 'TRAITE' | 'ERREUR';
  frais: number;
  commentaire: string;
  dateImport: string;
}

export interface TrxSfStatistics {
  total: number;
  enAttente: number;
  traite: number;
  erreur: number;
  totalMontant: number;
  totalFrais: number;
}

export interface ValidationResult {
  validLines: number;
  errorLines: number;
  duplicates: number;
  newRecords: number;
  errors: string[];
  hasErrors: boolean;
}

@Injectable({
  providedIn: 'root'
})
export class TrxSfService {
  private baseUrl = `${environment.apiUrl}/trx-sf`;

  constructor(private http: HttpClient) { }

  // Récupérer toutes les transactions SF
  getTrxSfs(filter?: any): Observable<TrxSfData[]> {
    let params = new HttpParams();
    
    if (filter) {
      if (filter.agence) {
        params = params.set('agence', filter.agence);
      }
      if (filter.service) {
        params = params.set('service', filter.service);
      }
      if (filter.pays) {
        params = params.set('pays', filter.pays);
      }
      if (filter.numeroTransGu) {
        params = params.set('numeroTransGu', filter.numeroTransGu);
      }
      if (filter.statut) {
        params = params.set('statut', filter.statut);
      }
      if (filter.dateDebut) {
        params = params.set('dateDebut', filter.dateDebut);
      }
      if (filter.dateFin) {
        params = params.set('dateFin', filter.dateFin);
      }
    }

    return this.http.get<TrxSfData[]>(this.baseUrl, { params });
  }

  // Récupérer une transaction par ID
  getTrxSfById(id: number): Observable<TrxSfData> {
    return this.http.get<TrxSfData>(`${this.baseUrl}/${id}`);
  }

  // Créer une nouvelle transaction
  createTrxSf(trxSf: TrxSfData): Observable<TrxSfData> {
    return this.http.post<TrxSfData>(this.baseUrl, trxSf);
  }

  // Créer plusieurs transactions
  createMultipleTrxSf(trxSfList: TrxSfData[]): Observable<any> {
    return this.http.post<any>(`${this.baseUrl}/batch`, trxSfList);
  }

  // Mettre à jour une transaction
  updateTrxSf(id: number, trxSf: TrxSfData): Observable<TrxSfData> {
    return this.http.put<TrxSfData>(`${this.baseUrl}/${id}`, trxSf);
  }

  // Supprimer une transaction
  deleteTrxSf(id: number): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/${id}`);
  }

  // Mettre à jour le statut
  updateStatut(id: number, statut: string, commentaire?: string): Observable<any> {
    const params = new HttpParams()
      .set('statut', statut);
    
    if (commentaire) {
      params.set('commentaire', commentaire);
    }
    
    return this.http.post<any>(`${this.baseUrl}/${id}/statut`, null, { params });
  }

  // Upload de fichier
  uploadFile(file: File): Observable<any> {
    const formData = new FormData();
    formData.append('file', file);
    return this.http.post<any>(`${this.baseUrl}/upload`, formData);
  }

  // Valider un fichier
  validateFile(file: File): Observable<ValidationResult> {
    const formData = new FormData();
    formData.append('file', file);
    return this.http.post<ValidationResult>(`${this.baseUrl}/validate`, formData);
  }

  // Récupérer les statistiques
  getStatistics(): Observable<TrxSfStatistics> {
    return this.http.get<TrxSfStatistics>(`${this.baseUrl}/statistics`);
  }

  // Récupérer les agences distinctes
  getDistinctAgences(): Observable<string[]> {
    return this.http.get<string[]>(`${this.baseUrl}/agences`);
  }

  // Récupérer les services distincts
  getDistinctServices(): Observable<string[]> {
    return this.http.get<string[]>(`${this.baseUrl}/services`);
  }

  // Récupérer les pays distincts
  getDistinctPays(): Observable<string[]> {
    return this.http.get<string[]>(`${this.baseUrl}/pays`);
  }

  // Récupérer les numéros Trans GU distincts
  getDistinctNumeroTransGu(): Observable<string[]> {
    return this.http.get<string[]>(`${this.baseUrl}/numero-trans-gu`);
  }
  
  changeStatutFromFile(file: File): Observable<any> {
    const formData = new FormData();
    formData.append('file', file);
    return this.http.post<any>(`${this.baseUrl}/change-statut`, formData);
  }

  // Filtrer par agence
  getTrxSfByAgence(agence: string): Observable<TrxSfData[]> {
    return this.http.get<TrxSfData[]>(`${this.baseUrl}/agence/${agence}`);
  }

  // Filtrer par service
  getTrxSfByService(service: string): Observable<TrxSfData[]> {
    return this.http.get<TrxSfData[]>(`${this.baseUrl}/service/${service}`);
  }

  // Filtrer par pays
  getTrxSfByPays(pays: string): Observable<TrxSfData[]> {
    return this.http.get<TrxSfData[]>(`${this.baseUrl}/pays/${pays}`);
  }

  // Filtrer par statut
  getTrxSfByStatut(statut: string): Observable<TrxSfData[]> {
    return this.http.get<TrxSfData[]>(`${this.baseUrl}/statut/${statut}`);
  }

  // Filtrer par période
  getTrxSfByDateRange(dateDebut: string, dateFin: string): Observable<TrxSfData[]> {
    const params = new HttpParams()
      .set('dateDebut', dateDebut)
      .set('dateFin', dateFin);
    return this.http.get<TrxSfData[]>(`${this.baseUrl}/date-range`, { params });
  }

  // Récupérer les frais par agence et par date
  getFraisByAgenceAndDate(agence: string, date: string): Observable<any> {
    return this.http.get<any>(`${this.baseUrl}/frais/${agence}/${date}`);
  }

  // Récupérer les frais par agence et par date, uniquement pour les transactions EN_ATTENTE
  getFraisByAgenceAndDateEnAttente(agence: string, date: string): Observable<any> {
    return this.http.get<any>(`${this.baseUrl}/frais-en-attente/${agence}/${date}`);
  }

  // Récupérer les frais par agence, date et service
  getFraisByAgenceAndDateAndService(agence: string, date: string, service: string): Observable<any> {
    return this.http.get<any>(`${this.baseUrl}/frais/${agence}/${date}/${service}`);
  }

  // Récupérer les frais par agence, date et service, uniquement pour les transactions EN_ATTENTE
  getFraisByAgenceAndDateAndServiceEnAttente(agence: string, date: string, service: string): Observable<any> {
    return this.http.get<any>(`${this.baseUrl}/frais-en-attente/${agence}/${date}/${service}`);
  }

  // Récupérer la configuration des frais par service
  getFraisConfigByService(service: string): Observable<any> {
    return this.http.get<any>(`${this.baseUrl}/frais-config/${service}`);
  }

  // Récupérer les doublons
  getDuplicates(): Observable<TrxSfData[]> {
    return this.http.get<TrxSfData[]>(`${this.baseUrl}/duplicates`);
  }

  // Supprimer les doublons
  removeDuplicates(): Observable<any> {
    return this.http.delete<any>(`${this.baseUrl}/duplicates`);
  }

  // Vérifier si une transaction existe déjà
  checkDuplicate(idTransaction: string, agence: string, dateTransaction: string): Observable<any> {
    return this.http.get<any>(`${this.baseUrl}/check-duplicate/${idTransaction}/${agence}/${dateTransaction}`);
  }
}
