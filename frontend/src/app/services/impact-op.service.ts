import { Injectable } from '@angular/core';
import { HttpClient, HttpParams, HttpHeaders } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { map, catchError, concatMap, timeout } from 'rxjs/operators';
import { ImpactOP, ImpactOPFilter, ImpactOPValidationResult, ImpactOPUploadResult } from '../models/impact-op.model';

@Injectable({
  providedIn: 'root'
})
export class ImpactOPService {
  private apiUrl = '/api';

  constructor(private http: HttpClient) {}

  // Récupérer tous les impacts OP
  getImpactOPs(filter?: ImpactOPFilter): Observable<ImpactOP[]> {
    let params = new HttpParams();
    
    if (filter) {
      if (filter.codeProprietaire) {
        params = params.set('codeProprietaire', filter.codeProprietaire);
      }
      if (filter.typeOperation) {
        params = params.set('typeOperation', filter.typeOperation);
      }
      if (filter.groupeReseau) {
        params = params.set('groupeReseau', filter.groupeReseau);
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
      if (filter.montantMin !== undefined) {
        params = params.set('montantMin', filter.montantMin.toString());
      }
      if (filter.montantMax !== undefined) {
        params = params.set('montantMax', filter.montantMax.toString());
      }
    }

    return this.http.get<ImpactOP[]>(`${this.apiUrl}/impact-op`, { params });
  }

  // Récupérer un impact OP par ID
  getImpactOP(id: number): Observable<ImpactOP | null> {
    return this.http.get<ImpactOP>(`${this.apiUrl}/impact-op/${id}`).pipe(
      catchError(() => of(null))
    );
  }

  // Créer un nouvel impact OP
  createImpactOP(impactOP: Omit<ImpactOP, 'id'>): Observable<ImpactOP> {
    return this.http.post<ImpactOP>(`${this.apiUrl}/impact-op`, impactOP);
  }

  /**
   * Créer plusieurs impacts OP en une requête (évite 429 Too Many Requests).
   * Retourne le résumé : successCount, errorCount, created, errors, total.
   */
  createImpactOPBatch(impactOPs: Omit<ImpactOP, 'id'>[]): Observable<{
    successCount: number;
    errorCount: number;
    created: ImpactOP[];
    errors: string[];
    total: number;
  }> {
    return this.http.post<{
      successCount: number;
      errorCount: number;
      created: ImpactOP[];
      errors: string[];
      total: number;
    }>(`${this.apiUrl}/impact-op/batch`, impactOPs);
  }

  // Mettre à jour un impact OP
  updateImpactOP(id: number, impactOP: Partial<ImpactOP>): Observable<ImpactOP> {
    return this.http.put<ImpactOP>(`${this.apiUrl}/impact-op/${id}`, impactOP);
  }

  // Supprimer un impact OP
  deleteImpactOP(id: number): Observable<boolean> {
    return this.http.delete(`${this.apiUrl}/impact-op/${id}`).pipe(
      map(() => true),
      catchError(() => of(false))
    );
  }

  // Supprimer plusieurs impacts OP
  deleteImpactOPs(ids: number[]): Observable<{ success: boolean; deletedCount: number; errors: string[] }> {
    const body = { ids } as { ids: number[] };
    return this.http.post<{ success: boolean; deletedCount: number; errors: string[] }>(
      `${this.apiUrl}/impact-op/delete-batch`,
      body
    );
  }

  // Valider un fichier d'impacts OP
  validateImpactOPFile(file: File): Observable<ImpactOPValidationResult> {
    const formData = new FormData();
    formData.append('file', file);

    return this.http.post<ImpactOPValidationResult>(`${this.apiUrl}/impact-op/validate`, formData);
  }

  // Uploader un fichier d'impacts OP
  uploadImpactOPFile(file: File): Observable<ImpactOPUploadResult> {
    const formData = new FormData();
    formData.append('file', file);

    return this.http.post<ImpactOPUploadResult>(`${this.apiUrl}/impact-op/upload`, formData);
  }

  // Mettre à jour le statut d'un impact OP
  updateImpactOPStatut(id: number, statut: string, commentaire?: string): Observable<ImpactOP> {
    const body = {
      statut,
      commentaire: commentaire || null
    };
    
    const headers = new HttpHeaders({
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    });
    
    const url = `${this.apiUrl}/impact-op/${id}/statut`;
    console.log('🔍 Appel API Impact OP avec headers explicites:', {
      url,
      method: 'PATCH',
      id,
      statut,
      commentaire,
      body,
      headers: headers.keys()
    });
    
    return this.http.patch<ImpactOP>(url, body, { 
      headers
    }).pipe(
      timeout(30000), // 30 secondes de timeout
      map(response => {
        console.log('✅ Réponse API Impact OP réussie:', response);
        return response;
      }),
      catchError(error => {
        console.error('❌ Erreur API Impact OP détaillée:', {
          error,
          url,
          status: error.status,
          statusText: error.statusText,
          message: error.message,
          body: error.error,
          headers: error.headers
        });
        
        // Test de connectivité et fallback vers PUT si PATCH échoue
        console.log('🔄 Test de connectivité suite à erreur...');
        if (error.status === 0 || error.status === 405) {
          console.log('🔄 Tentative de fallback avec PUT au lieu de PATCH...');
          return this.http.get(`${this.apiUrl}/impact-op/${id}`).pipe(
            concatMap(existingImpact => {
              // Utiliser PUT avec l'objet complet
              const updatedImpact = { ...existingImpact, statut, commentaire };
              console.log('📤 Fallback PUT avec objet complet:', updatedImpact);
              return this.http.put<ImpactOP>(`${this.apiUrl}/impact-op/${id}`, updatedImpact, { headers });
            }),
            catchError(putError => {
              console.error('❌ Échec du fallback PUT:', putError);
              throw error; // Re-lancer l'erreur PATCH originale
            })
          );
        }
        
        return this.http.get(`${this.apiUrl}/impact-op/${id}`).pipe(
          map(() => {
            console.log('✅ Connectivité OK, problème spécifique au PATCH');
            throw error; // Re-lancer l'erreur originale
          }),
          catchError(connectError => {
            console.error('❌ Problème de connectivité générale:', connectError);
            throw error; // Re-lancer l'erreur originale
          })
        );
      })
    );
  }

  // Récupérer les options de filtres
  getFilterOptions(): Observable<{
    codeProprietaires: string[];
    typeOperations: string[];
    groupeReseaux: string[];
    numeroTransGUs: string[];
  }> {
    return this.http.get<{
      codeProprietaires: string[];
      typeOperations: string[];
      groupeReseaux: string[];
      numeroTransGUs: string[];
    }>(`${this.apiUrl}/impact-op/filter-options`);
  }

  // Exporter les impacts OP
  exportImpactOPs(filter?: ImpactOPFilter): Observable<Blob> {
    let params = new HttpParams();
    
    if (filter) {
      if (filter.codeProprietaire) {
        params = params.set('codeProprietaire', filter.codeProprietaire);
      }
      if (filter.typeOperation) {
        params = params.set('typeOperation', filter.typeOperation);
      }
      if (filter.groupeReseau) {
        params = params.set('groupeReseau', filter.groupeReseau);
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
      if (filter.montantMin !== undefined) {
        params = params.set('montantMin', filter.montantMin.toString());
      }
      if (filter.montantMax !== undefined) {
        params = params.set('montantMax', filter.montantMax.toString());
      }
    }

    return this.http.get(`${this.apiUrl}/impact-op/export`, { 
      params, 
      responseType: 'blob' 
    });
  }

  // Récupérer les statistiques des impacts OP
  getImpactOPStats(): Observable<{
    total: number;
    enAttente: number;
    traite: number;
    erreur: number;
    montantTotal: number;
  }> {
    return this.http.get<{
      total: number;
      enAttente: number;
      traite: number;
      erreur: number;
      montantTotal: number;
    }>(`${this.apiUrl}/impact-op/stats`);
  }

  // Récupérer la somme des impacts OP pour une date et un code propriétaire donnés
  getImpactOPSumForDate(date: string, codeProprietaire: string): Observable<number> {
    const params = new HttpParams()
      .set('date', date)
      .set('codeProprietaire', codeProprietaire);

    return this.http.get<{ sum: number }>(`${this.apiUrl}/impact-op/sum-for-date`, { params }).pipe(
      map(response => response.sum),
      catchError(() => of(0))
    );
  }
} 