import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { 
    OperationBancaire, 
    OperationBancaireCreateRequest, 
    OperationBancaireUpdateRequest, 
    OperationBancaireFilter 
} from '../models/operation-bancaire.model';

@Injectable({
    providedIn: 'root'
})
export class OperationBancaireService {
    private apiUrl = '/api/operations-bancaires';

    constructor(private http: HttpClient) {}

    private buildContextHeaders(moduleContext?: string): HttpHeaders | undefined {
        return moduleContext ? new HttpHeaders({ 'X-Permission-Module': moduleContext }) : undefined;
    }

    // Récupérer toutes les opérations bancaires
    getAllOperationsBancaires(moduleContext?: string): Observable<OperationBancaire[]> {
        return this.http.get<OperationBancaire[]>(this.apiUrl, { headers: this.buildContextHeaders(moduleContext) });
    }

    // Récupérer une opération bancaire par ID
    getOperationBancaireById(id: number): Observable<OperationBancaire> {
        return this.http.get<OperationBancaire>(`${this.apiUrl}/${id}`);
    }

    // Récupérer les opérations bancaires par pays
    getOperationsBancairesByPays(pays: string): Observable<OperationBancaire[]> {
        return this.http.get<OperationBancaire[]>(`${this.apiUrl}/pays/${pays}`);
    }

    // Récupérer les opérations bancaires par agence
    getOperationsBancairesByAgence(agence: string): Observable<OperationBancaire[]> {
        return this.http.get<OperationBancaire[]>(`${this.apiUrl}/agence/${agence}`);
    }

    // Récupérer les opérations bancaires par statut
    getOperationsBancairesByStatut(statut: string): Observable<OperationBancaire[]> {
        return this.http.get<OperationBancaire[]>(`${this.apiUrl}/statut/${statut}`);
    }

    // Récupérer les opérations bancaires par plage de dates
    getOperationsBancairesByDateRange(dateDebut: string, dateFin: string): Observable<OperationBancaire[]> {
        const params = new HttpParams()
            .set('dateDebut', dateDebut)
            .set('dateFin', dateFin);
        return this.http.get<OperationBancaire[]>(`${this.apiUrl}/date-range`, { params });
    }

    // Créer une nouvelle opération bancaire
    createOperationBancaire(operation: OperationBancaireCreateRequest): Observable<OperationBancaire> {
        return this.http.post<OperationBancaire>(this.apiUrl, operation);
    }

    // Mettre à jour une opération bancaire
    updateOperationBancaire(id: number, operation: OperationBancaireUpdateRequest): Observable<OperationBancaire> {
        return this.http.put<OperationBancaire>(`${this.apiUrl}/${id}`, operation);
    }

    // Mettre à jour en lot le statut des opérations bancaires
    bulkUpdateStatut(ids: number[], statut: string): Observable<number> {
        return this.http.put<number>(`${this.apiUrl}/bulk-statut`, { ids, statut });
    }

    // Supprimer une opération bancaire
    deleteOperationBancaire(id: number): Observable<boolean> {
        return this.http.delete<boolean>(`${this.apiUrl}/${id}`);
    }

    // Importer des opérations bancaires depuis un fichier (Excel/CSV)
    upload(file: File): Observable<{ totalRead: number; saved: number; errors: string[] }>{
        const form = new FormData();
        form.append('file', file);
        return this.http.post<{ totalRead: number; saved: number; errors: string[] }>(`${this.apiUrl}/upload`, form);
    }

  updateReconStatus(id: number, status: 'OK' | 'KO'): Observable<any> {
    return this.http.put(`${this.apiUrl}/${id}/recon-status?status=${encodeURIComponent(status)}`, {});
  }

    // Télécharger le modèle Excel à utiliser pour l'import
    downloadTemplate(): Observable<Blob> {
        return this.http.get(`${this.apiUrl}/template`, { responseType: 'blob' });
    }

    // Filtrer les opérations bancaires avec des paramètres
    filterOperationsBancaires(filter: OperationBancaireFilter): Observable<OperationBancaire[]> {
        let params = new HttpParams();
        
        if (filter.pays) {
            params = params.set('pays', filter.pays);
        }
        if (filter.codePays) {
            params = params.set('codePays', filter.codePays);
        }
        if (filter.mois) {
            params = params.set('mois', filter.mois);
        }
        if (filter.agence) {
            params = params.set('agence', filter.agence);
        }
        if (filter.typeOperation) {
            params = params.set('typeOperation', filter.typeOperation);
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
        if (filter.reference) {
            params = params.set('reference', filter.reference);
        }

        return this.http.get<OperationBancaire[]>(`${this.apiUrl}/filter`, { params });
    }

    // Récupérer les opérations bancaires récentes
    getRecentOperationsBancaires(limit: number = 10): Observable<OperationBancaire[]> {
        return this.http.get<OperationBancaire[]>(`${this.apiUrl}/recent?limit=${limit}`);
    }

    // Récupérer la liste des pays uniques
    getDistinctPays(): Observable<string[]> {
        return this.http.get<string[]>(`${this.apiUrl}/pays/list`);
    }

    // Récupérer la liste des agences uniques
    getDistinctAgences(): Observable<string[]> {
        return this.http.get<string[]>(`${this.apiUrl}/agence/list`);
    }

    // Récupérer la liste des types d'opération uniques
    getDistinctTypesOperation(): Observable<string[]> {
        return this.http.get<string[]>(`${this.apiUrl}/type-operation/list`);
    }
}

