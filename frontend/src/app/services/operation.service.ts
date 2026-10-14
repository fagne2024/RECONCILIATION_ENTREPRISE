import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { AppStateService } from './app-state.service';

@Injectable({ providedIn: 'root' })
export class OperationServiceApi {
  private apiUrl = '/api/reconciliation';
  static readonly RECONCILIATION_MODULE = 'Reconciliation';

  constructor(
    private http: HttpClient,
    private appState: AppStateService
  ) {}

  private buildContextHeaders(moduleContext?: string): HttpHeaders | undefined {
    const resolved = this.appState.resolvePermissionModuleContext(
      moduleContext ?? OperationServiceApi.RECONCILIATION_MODULE
    );
    return resolved ? new HttpHeaders({ 'X-Permission-Module': resolved }) : undefined;
  }

  private reconciliationHeaders(): HttpHeaders {
    return this.buildContextHeaders(OperationServiceApi.RECONCILIATION_MODULE)!;
  }

  markOk(key: string): Observable<{ success: boolean }> {
    const params = new HttpParams().set('key', key);
    return this.http.post<{ success: boolean }>(`${this.apiUrl}/mark-ok`, null, { params, headers: this.reconciliationHeaders() });
  }

  getOkKeys(moduleContext: string = OperationServiceApi.RECONCILIATION_MODULE): Observable<string[]> {
    return this.http.get<string[]>(`${this.apiUrl}/ok-keys`, { headers: this.buildContextHeaders(moduleContext) });
  }

  unmarkOk(key: string): Observable<{ success: boolean }> {
    const params = new HttpParams().set('key', key);
    return this.http.delete<{ success: boolean }>(`${this.apiUrl}/mark-ok`, { params, headers: this.reconciliationHeaders() });
  }

  saveReconStatus(key: string, status: 'OK' | 'KO'): Observable<{ success: boolean }> {
    const params = new HttpParams().set('key', key).set('status', status);
    return this.http.post<{ success: boolean }>(`${this.apiUrl}/status`, null, { params, headers: this.reconciliationHeaders() });
  }

  listReconStatus(moduleContext: string = OperationServiceApi.RECONCILIATION_MODULE): Observable<Record<string, 'OK' | 'KO'>> {
    return this.http.get<Record<string, 'OK' | 'KO'>>(`${this.apiUrl}/status`, { headers: this.buildContextHeaders(moduleContext) });
  }

  markOkBulk(keys: string[]): Observable<{ success: boolean; created: number }> {
    return this.http.post<{ success: boolean; created: number }>(`${this.apiUrl}/mark-ok/bulk`, { keys: keys || [] }, { headers: this.reconciliationHeaders() });
  }

  unmarkOkBulk(keys: string[]): Observable<{ success: boolean; deleted: number }> {
    return this.http.post<{ success: boolean; deleted: number }>(`${this.apiUrl}/unmark-ok/bulk`, { keys: keys || [] }, { headers: this.reconciliationHeaders() });
  }

  saveReconStatusBulk(entries: Array<{ key: string; status: 'OK' | 'KO' }>): Observable<{ success: boolean; saved: number }> {
    return this.http.post<{ success: boolean; saved: number }>(`${this.apiUrl}/status/bulk`, { entries: entries || [] }, { headers: this.reconciliationHeaders() });
  }
}

import { Operation, OperationCreateRequest, OperationUpdateRequest, OperationFilter } from '../models/operation.model';

@Injectable({
    providedIn: 'root'
})
export class OperationService {
    private apiUrl = '/api/operations';

    constructor(private http: HttpClient) {}

    private buildContextHeaders(moduleContext?: string): HttpHeaders | undefined {
        return moduleContext ? new HttpHeaders({ 'X-Permission-Module': moduleContext }) : undefined;
    }

    // Récupérer toutes les opérations
    getAllOperations(): Observable<Operation[]> {
        return this.http.get<Operation[]>(this.apiUrl);
    }

    // Récupérer une opération par ID
    getOperationById(id: number): Observable<Operation> {
        return this.http.get<Operation>(`${this.apiUrl}/${id}`);
    }

    // Récupérer les opérations d'un compte
    getOperationsByCompteId(compteId: number): Observable<Operation[]> {
        return this.http.get<Operation[]>(`${this.apiUrl}/compte/${compteId}`);
    }

    // Récupérer les opérations d'un compte par numéro de compte avec filtres
    getOperationsByCompte(numeroCompte: string, dateDebut?: string | null, dateFin?: string | null, typeOperation?: string | null): Observable<Operation[]> {
        let params = new HttpParams()
            .set('numeroCompte', numeroCompte);
        
        if (dateDebut) {
            params = params.set('dateDebut', dateDebut);
        }
        if (dateFin) {
            params = params.set('dateFin', dateFin);
        }
        if (typeOperation) {
            params = params.set('typeOperation', typeOperation);
        }

        return this.http.get<Operation[]>(`${this.apiUrl}/compte/numero`, { params });
    }

    // Récupérer les opérations d'un compte pour le relevé (triées par ordre chronologique)
    getOperationsByCompteForReleve(numeroCompte: string, dateDebut?: string | null, dateFin?: string | null, typeOperation?: string | null): Observable<Operation[]> {
        let params = new HttpParams()
            .set('numeroCompte', numeroCompte);
        
        if (dateDebut) {
            params = params.set('dateDebut', dateDebut);
        }
        if (dateFin) {
            params = params.set('dateFin', dateFin);
        }
        if (typeOperation) {
            params = params.set('typeOperation', typeOperation);
        }

        return this.http.get<Operation[]>(`${this.apiUrl}/compte/numero/releve`, { params });
    }

    // Récupérer les opérations par type
    getOperationsByType(typeOperation: string): Observable<Operation[]> {
        return this.http.get<Operation[]>(`${this.apiUrl}/type/${typeOperation}`);
    }

    // Récupérer les opérations par pays
    getOperationsByPays(pays: string): Observable<Operation[]> {
        return this.http.get<Operation[]>(`${this.apiUrl}/pays/${pays}`);
    }

    // Récupérer les opérations par statut
    getOperationsByStatut(statut: string): Observable<Operation[]> {
        return this.http.get<Operation[]>(`${this.apiUrl}/statut/${statut}`);
    }

    // Récupérer les opérations par banque
    getOperationsByBanque(banque: string): Observable<Operation[]> {
        return this.http.get<Operation[]>(`${this.apiUrl}/banque/${banque}`);
    }

    // Récupérer les opérations par service
    getOperationsByService(service: string): Observable<Operation[]> {
        return this.http.get<Operation[]>(`${this.apiUrl}/service/${service}`);
    }

    // Récupérer les opérations avec un montant supérieur à un seuil
    getOperationsByMontantSuperieurA(montantMin: number): Observable<Operation[]> {
        return this.http.get<Operation[]>(`${this.apiUrl}/montant/${montantMin}`);
    }

    // Récupérer les opérations par code propriétaire
    getOperationsByCodeProprietaire(codeProprietaire: string): Observable<Operation[]> {
        return this.http.get<Operation[]>(`${this.apiUrl}/proprietaire/${codeProprietaire}`);
    }

    // Récupérer les opérations par nom de bordereau
    getOperationsByNomBordereau(nomBordereau: string): Observable<Operation[]> {
        return this.http.get<Operation[]>(`${this.apiUrl}/bordereau/${nomBordereau}`);
    }

    // Récupérer les opérations par plage de dates
    getOperationsByDateRange(dateDebut: string, dateFin: string): Observable<Operation[]> {
        const params = new HttpParams()
            .set('dateDebut', dateDebut)
            .set('dateFin', dateFin);
        return this.http.get<Operation[]>(`${this.apiUrl}/date-range`, { params });
    }

    // Créer une nouvelle opération
    createOperation(operation: OperationCreateRequest, moduleContext?: string): Observable<Operation> {
        return this.http.post<Operation>(this.apiUrl, operation, {
            headers: this.buildContextHeaders(moduleContext)
        });
    }

    // Créer une opération avec la logique des 4 opérations
    createOperationWithFourOperations(operation: OperationCreateRequest): Observable<Operation> {
        return this.http.post<Operation>(`${this.apiUrl}/manual-with-four-operations`, operation);
    }

    // Mettre à jour une opération
    updateOperation(id: number, operation: OperationUpdateRequest): Observable<Operation> {
        return this.http.put<Operation>(`${this.apiUrl}/${id}`, operation);
    }

    // Mettre à jour le statut d'une opération
    updateOperationStatut(id: number, nouveauStatut: string): Observable<boolean> {
        return this.http.put<boolean>(`${this.apiUrl}/${id}/statut`, nouveauStatut);
    }

    // Mettre à jour en lot le statut des opérations
    bulkUpdateOperationStatut(ids: number[], statut: string): Observable<number> {
        return this.http.put<number>(`${this.apiUrl}/bulk-statut`, { ids, statut });
    }

    // Rejeter une opération
    rejectOperation(id: number): Observable<boolean> {
        return this.http.put<boolean>(`${this.apiUrl}/${id}/reject`, {});
    }

    // Annuler une opération
    cancelOperation(id: number): Observable<boolean> {
        return this.http.put<boolean>(`${this.apiUrl}/${id}/cancel`, {});
    }

    // Supprimer une opération
    deleteOperation(id: number): Observable<boolean> {
        return this.http.delete<boolean>(`${this.apiUrl}/${id}`);
    }

    // Supprimer plusieurs opérations en lot
    deleteOperations(ids: number[]): Observable<{ success: boolean, deletedCount: number, errors: string[] }> {
        return this.http.post<{ success: boolean, deletedCount: number, errors: string[] }>(`${this.apiUrl}/delete-batch`, { ids });
    }

    // Filtrer les opérations avec des paramètres
    filterOperations(filter: OperationFilter): Observable<Operation[]> {
        let params = new HttpParams();
        
        if (filter.compteId) {
            params = params.set('compteId', filter.compteId.toString());
        }
        if (filter.typeOperation) {
            params = params.set('typeOperation', filter.typeOperation);
        }
        if (filter.pays) {
            params = params.set('pays', filter.pays);
        }
        if (filter.statut) {
            params = params.set('statut', filter.statut);
        }
        if (filter.banque) {
            params = params.set('banque', filter.banque);
        }
        if (filter.service) {
            params = params.set('service', filter.service);
        }
        if (filter.codeProprietaire) {
            params = params.set('codeProprietaire', filter.codeProprietaire);
        }
        if (filter.nomBordereau) {
            params = params.set('nomBordereau', filter.nomBordereau);
        }
        if (filter.dateDebut) {
            params = params.set('dateDebut', filter.dateDebut);
        }
        if (filter.dateFin) {
            params = params.set('dateFin', filter.dateFin);
        }

        return this.http.get<Operation[]>(`${this.apiUrl}/filter`, { params });
    }

    // Récupérer les statistiques des opérations
    getOperationsStats(): Observable<any> {
        return this.http.get<any>(`${this.apiUrl}/stats`);
    }

    // Récupérer les statistiques par type d'opération
    getOperationsStatsByType(): Observable<any> {
        return this.http.get<any>(`${this.apiUrl}/stats/by-type`);
    }

    // Récupérer les statistiques par type d'opération avec filtres
    getOperationsStatsByTypeWithFilters(pays?: string, compteId?: number): Observable<any> {
        let params = new HttpParams();
        if (pays) params = params.set('pays', pays);
        if (compteId) params = params.set('compteId', compteId.toString());
        
        return this.http.get<any>(`${this.apiUrl}/stats/by-type/filtered`, { params });
    }

    // Récupérer les opérations récentes
    getRecentOperations(limit: number = 10): Observable<Operation[]> {
        return this.http.get<Operation[]>(`${this.apiUrl}/recent?limit=${limit}`);
    }

    // Récupérer la liste des codes propriétaires uniques
    getDistinctCodeProprietaire(): Observable<string[]> {
        return this.http.get<string[]>(`${this.apiUrl}/code-proprietaire/list`);
    }

    // Récupérer la liste des banques uniques
    getDistinctBanque(): Observable<string[]> {
        return this.http.get<string[]>(`${this.apiUrl}/banque/list`);
    }

    // Récupérer la liste des services uniques
    getDistinctService(): Observable<string[]> {
        return this.http.get<string[]>(`${this.apiUrl}/service/list`);
    }

    // Récupérer la liste des services uniques par code propriétaire
    getDistinctServiceByCodeProprietaire(codeProprietaire: string): Observable<string[]> {
        return this.http.get<string[]>(`${this.apiUrl}/service/list/${codeProprietaire}`);
    }

    // Upload d'opérations (transaction_cree / annulation_bo)
    uploadOperations(file: File): Observable<{ totalRead: number; saved: number; errors: string[] }>{
        const form = new FormData();
        form.append('file', file);
        return this.http.post<{ totalRead: number; saved: number; errors: string[] }>(`${this.apiUrl}/upload`, form);
    }

    // Télécharger le modèle d'import
    downloadOperationsTemplate(): Observable<Blob> {
        return this.http.get(`${this.apiUrl}/template`, { responseType: 'blob' });
    }

    // Créer une opération depuis le formulaire
    createOperationFromForm(formData: any): Observable<Operation> {
        return this.http.post<Operation>(`${this.apiUrl}/manual-from-form`, formData);
    }
} 