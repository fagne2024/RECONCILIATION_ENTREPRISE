import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { Observable, forkJoin, map } from 'rxjs';
import { EcartSolde, EcartSoldeUploadResponse, EcartSoldeFilter, FraisAssocie } from '../models/ecart-solde.model';
import { ConfigurationCalculService } from './configuration-calcul.service';

@Injectable({
  providedIn: 'root'
})
export class EcartSoldeService {
  private apiUrl = '/api/ecart-solde';
  private operationsUrl = '/api/operations';
  private fraisTransactionUrl = '/api/frais-transaction';
  private readonly tsopHeaders = new HttpHeaders({ 'X-Permission-Module': 'TSOP' });

  constructor(private http: HttpClient, private calcul: ConfigurationCalculService) { }

  getEcartSoldes(filter?: EcartSoldeFilter): Observable<EcartSolde[]> {
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

    return forkJoin({
      ecartSoldes: this.http.get<EcartSolde[]>(this.apiUrl, { params }),
      fraisTransactions: this.http.get<any[]>(this.fraisTransactionUrl, { headers: this.tsopHeaders })
    }).pipe(
      map(result => {
        const ecartSoldes = result.ecartSoldes;
        const fraisTransactions = result.fraisTransactions;
        
        // Calculer les frais pour chaque écart de solde
        ecartSoldes.forEach(ecart => {
          const fraisCalcule = this.calculerFraisPourEcart(ecart, fraisTransactions);
          if (fraisCalcule) {
            ecart.fraisAssocie = fraisCalcule;
          }
        });

        return ecartSoldes;
      })
    );
  }

  // Méthode pour calculer les frais pour un écart de solde
  private calculerFraisPourEcart(ecart: EcartSolde, fraisTransactions: any[]): FraisAssocie | null {
    // Chercher la configuration de frais pour ce service et cette agence
    const fraisConfig = fraisTransactions.find(frais => 
      frais.service === ecart.service && 
      frais.agence === ecart.agence &&
      frais.actif === true
    );

    if (!fraisConfig) {
      console.log(`Aucune configuration de frais trouvée pour service=${ecart.service} et agence=${ecart.agence}`);
      return null;
    }

    // Calculer le montant des frais selon le type
    let montantFrais = 0;
    let typeCalcul = fraisConfig.typeCalcul || 'NOMINAL';
    let pourcentage = fraisConfig.pourcentage;

    if (typeCalcul === 'POURCENTAGE' && pourcentage) {
      // Frais en pourcentage : |montant| × pourcentage (sortie toujours négative)
      montantFrais = Math.abs(ecart.montant || 0) * (pourcentage / 100.0);
    } else {
      // Frais fixe : Valeur fixe × 1 transaction (comme pour les annulations)
      montantFrais = fraisConfig.montantFrais || 0;
    }

    // Convention écran écart-solde : les frais sont une sortie de trésorerie (montant négatif par défaut).
    const sign = this.calcul.getNumber('ECARTSOLDE.FRAIS_SIGNE', -1) >= 0 ? 1 : -1;
    if (montantFrais !== 0) {
      montantFrais = sign * Math.abs(montantFrais);
    }

    // Créer l'objet frais calculé
    return {
      id: fraisConfig.id,
      montant: montantFrais,
      typeCalcul: typeCalcul,
      pourcentage: pourcentage,
      description: fraisConfig.description,
      bordereau: `CALCULE_${ecart.service}_${ecart.agence}`,
      dateOperation: ecart.dateTransaction
    };
  }

  // Méthode pour récupérer les frais associés à un écart de solde spécifique
  getFraisAssocie(ecartSolde: EcartSolde): Observable<FraisAssocie | null> {
    return this.http.get<any[]>(this.fraisTransactionUrl, { headers: this.tsopHeaders }).pipe(
      map(fraisTransactions => {
        return this.calculerFraisPourEcart(ecartSolde, fraisTransactions);
      })
    );
  }

  getEcartSoldeById(id: number): Observable<EcartSolde> {
    return this.http.get<EcartSolde>(`${this.apiUrl}/${id}`);
  }

  getEcartSoldesByAgence(agence: string): Observable<EcartSolde[]> {
    return this.http.get<EcartSolde[]>(`${this.apiUrl}/agence/${agence}`);
  }

  getEcartSoldesByService(service: string): Observable<EcartSolde[]> {
    return this.http.get<EcartSolde[]>(`${this.apiUrl}/service/${service}`);
  }

  getEcartSoldesByPays(pays: string): Observable<EcartSolde[]> {
    return this.http.get<EcartSolde[]>(`${this.apiUrl}/pays/${pays}`);
  }

  getEcartSoldesByStatut(statut: string): Observable<EcartSolde[]> {
    return this.http.get<EcartSolde[]>(`${this.apiUrl}/statut/${statut}`);
  }

  getEcartSoldesByDateRange(dateDebut: string, dateFin: string): Observable<EcartSolde[]> {
    const params = new HttpParams()
      .set('dateDebut', dateDebut)
      .set('dateFin', dateFin);
    return this.http.get<EcartSolde[]>(`${this.apiUrl}/date-range`, { params });
  }

  getDistinctAgences(): Observable<string[]> {
    return this.http.get<string[]>(`${this.apiUrl}/agences`);
  }

  getDistinctServices(): Observable<string[]> {
    return this.http.get<string[]>(`${this.apiUrl}/services`);
  }

  getDistinctPays(): Observable<string[]> {
    return this.http.get<string[]>(`${this.apiUrl}/pays`);
  }

  getDistinctNumeroTransGu(): Observable<string[]> {
    return this.http.get<string[]>(`${this.apiUrl}/numero-trans-gu`);
  }

  createEcartSolde(ecartSolde: EcartSolde): Observable<EcartSolde> {
    return this.http.post<EcartSolde>(this.apiUrl, ecartSolde);
  }

  createMultipleEcartSoldes(ecartSoldes: EcartSolde[]): Promise<{
    count: number;
    duplicates: number;
    totalReceived: number;
    message: string;
  }> {
    return new Promise((resolve, reject) => {
      this.http.post<any>(`${this.apiUrl}/batch`, ecartSoldes).subscribe({
        next: (response) => {
          console.log('=== RÉPONSE createMultipleEcartSoldes ===');
          console.log('DEBUG: Réponse complète:', response);
          console.log('DEBUG: Enregistrements créés:', response.count);
          console.log('DEBUG: Doublons ignorés:', response.duplicates);
          console.log('DEBUG: Total reçu:', response.totalReceived);
          
          resolve({
            count: response.count || 0,
            duplicates: response.duplicates || 0,
            totalReceived: response.totalReceived || ecartSoldes.length,
            message: response.message || 'Enregistrements créés avec succès'
          });
        },
        error: (error) => {
          console.error('=== ERREUR createMultipleEcartSoldes ===');
          console.error('DEBUG: Erreur complète:', error);
          console.error('DEBUG: Message d\'erreur:', error.error?.error || error.message);
          reject(error);
        }
      });
    });
  }

  updateEcartSolde(id: number, ecartSolde: EcartSolde): Observable<EcartSolde> {
    return this.http.put<EcartSolde>(`${this.apiUrl}/${id}`, ecartSolde);
  }

  saveEcartBoSummary(summaryData: Array<{
    service: string;
    pays: string;
    montant: number;
    date: string;
    statut: string;
    nombreTransactions: number;
  }>): Promise<{
    count: number;
    message: string;
  }> {
    return new Promise((resolve, reject) => {
      this.http.post<any>(`${this.apiUrl}/summary`, summaryData).subscribe({
        next: (response) => {
          console.log('=== RÉPONSE saveEcartBoSummary ===');
          console.log('DEBUG: Réponse complète:', response);
          resolve({
            count: response.count || 0,
            message: response.message || 'Données sauvegardées avec succès'
          });
        },
        error: (error) => {
          console.error('=== ERREUR saveEcartBoSummary ===');
          console.error('DEBUG: Erreur complète:', error);
          reject(error);
        }
      });
    });
  }

  getEcartBoSummary(filter?: {
    service?: string;
    pays?: string;
    statut?: string;
  }): Observable<Array<{
    id?: number;
    service: string;
    pays: string;
    date: string;
    montant: number;
    nombre: number;
    statut: string;
  }>> {
    let params = new HttpParams();
    if (filter) {
      if (filter.service) {
        params = params.set('service', filter.service);
      }
      if (filter.pays) {
        params = params.set('pays', filter.pays);
      }
      if (filter.statut) {
        params = params.set('statut', filter.statut);
      }
    }
    return this.http.get<Array<any>>(`${this.apiUrl}/summary`, { params });
  }

  deleteEcartSolde(id: number): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/${id}`);
  }

  /**
   * Suppression en lot des écarts de solde (sélection multiple).
   */
  deleteEcartSoldes(ids: number[]): Observable<{ deletedCount: number; errors: string[]; totalRequested: number }> {
    return this.http.post<{ deletedCount: number; errors: string[]; totalRequested: number }>(
      `${this.apiUrl}/delete-batch`,
      { ids }
    );
  }

  updateStatut(id: number, statut: string): Observable<any> {
    const params = new HttpParams().set('statut', statut);
    return this.http.post(`${this.apiUrl}/${id}/statut`, null, { params });
  }

  updateStatutWithComment(id: number, statut: string, commentaire: string): Observable<any> {
    const params = new HttpParams()
      .set('statut', statut)
      .set('commentaire', commentaire);
    return this.http.post(`${this.apiUrl}/${id}/statut`, null, { params });
  }

  uploadCsvFile(file: File): Observable<any> {
    const formData = new FormData();
    formData.append('file', file);
    
    return this.http.post<any>(`${this.apiUrl}/upload`, formData);
  }

  validateFile(file: File): Observable<{
    validLines: number;
    errorLines: number;
    duplicates: number;
    newRecords: number;
    hasErrors: boolean;
    errors?: string[];
  }> {
    const formData = new FormData();
    formData.append('file', file);
    
    return this.http.post<{
      validLines: number;
      errorLines: number;
      duplicates: number;
      newRecords: number;
      hasErrors: boolean;
      errors?: string[];
    }>(`${this.apiUrl}/validate`, formData);
  }

  // Méthode pour filtrer les écarts de solde avec plusieurs critères
  filterEcartSoldes(filters: EcartSoldeFilter): Observable<EcartSolde[]> {
    let params = new HttpParams();
    
    if (filters.agence) {
      params = params.set('agence', filters.agence);
    }
    if (filters.service) {
      params = params.set('service', filters.service);
    }
    if (filters.pays) {
      params = params.set('pays', filters.pays);
    }
    if (filters.statut) {
      params = params.set('statut', filters.statut);
    }
    if (filters.dateDebut) {
      params = params.set('dateDebut', filters.dateDebut);
    }
    if (filters.dateFin) {
      params = params.set('dateFin', filters.dateFin);
    }

    return this.http.get<EcartSolde[]>(`${this.apiUrl}`, { params });
  }
} 