import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { ReleveBancaireRow, ReleveUploadResponse, ReleveListFilter } from '../models/releve-bancaire.model';

@Injectable({ providedIn: 'root' })
export class ReleveBancaireService {
  private apiUrl = '/api/releve-bancaire';

  constructor(private http: HttpClient) {}

  private buildContextHeaders(moduleContext?: string): HttpHeaders | undefined {
    return moduleContext ? new HttpHeaders({ 'X-Permission-Module': moduleContext }) : undefined;
  }

  upload(file: File): Observable<ReleveUploadResponse> {
    const form = new FormData();
    form.append('file', file);
    return this.http.post<ReleveUploadResponse>(`${this.apiUrl}/upload`, form);
  }

  list(filter?: ReleveListFilter | string, moduleContext?: string): Observable<any> {
    // Compatibilité ascendante: si string fourni, considéré comme batchId
    if (typeof filter === 'string') {
      const url = filter ? `${this.apiUrl}/list?batchId=${encodeURIComponent(filter)}` : `${this.apiUrl}/list`;
      return this.http.get<any>(url, { headers: this.buildContextHeaders(moduleContext) });
    }

    let params = new HttpParams();
    if (filter) {
      const add = (k: string, v: any) => {
        if (v !== undefined && v !== null && String(v).trim() !== '') {
          params = params.set(k, String(v));
        }
      };
      add('batchId', filter.batchId);
      add('numeroCompte', filter.numeroCompte);
      add('banque', filter.banque);
      add('pays', filter.pays);
      add('devise', filter.devise);
      add('reconStatus', filter.reconStatus);
      add('libelleContains', filter.libelleContains);
      add('dateDebut', filter.dateDebut);
      add('dateFin', filter.dateFin);
      add('dateField', filter.dateField);
      if (filter.montantMin !== undefined && filter.montantMin !== null) params = params.set('montantMin', String(filter.montantMin));
      if (filter.montantMax !== undefined && filter.montantMax !== null) params = params.set('montantMax', String(filter.montantMax));
    }

    return this.http.get<any>(`${this.apiUrl}/list`, { params, headers: this.buildContextHeaders(moduleContext) });
  }

  update(id: number, payload: Partial<ReleveBancaireRow>): Observable<ReleveBancaireRow> {
    return this.http.put<ReleveBancaireRow>(`${this.apiUrl}/${id}`, payload);
  }

  updateReconStatus(id: number, status: 'OK' | 'KO'): Observable<any> {
    return this.http.put(`${this.apiUrl}/${id}/recon-status?status=${encodeURIComponent(status)}`, {});
  }

  delete(id: number): Observable<any> {
    return this.http.post(`${this.apiUrl}/${id}/delete`, {});
  }

  downloadTemplate(): Observable<Blob> {
    return this.http.get(`${this.apiUrl}/template`, { responseType: 'blob' });
  }
}


