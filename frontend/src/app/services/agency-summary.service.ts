import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class AgencySummaryService {
  private apiUrl = '/api/agency-summary';

  constructor(private http: HttpClient) { }

  private buildContextHeaders(moduleContext?: string): HttpHeaders | undefined {
    return moduleContext ? new HttpHeaders({ 'X-Permission-Module': moduleContext }) : undefined;
  }

  getAllSummaries(
    moduleContext?: string,
    filters: {
      agencies?: string[];
      services?: string[];
      countries?: string[];
      startDate?: string;
      endDate?: string;
    } = {}
  ): Observable<any> {
    let params = new HttpParams();
    (filters.agencies || []).filter(Boolean).forEach(value => {
      params = params.append('agency', value);
    });
    (filters.services || []).filter(Boolean).forEach(value => {
      params = params.append('service', value);
    });
    (filters.countries || []).filter(Boolean).forEach(value => {
      params = params.append('country', value);
    });
    if (filters.startDate) {
      params = params.set('startDate', filters.startDate);
    }
    if (filters.endDate) {
      params = params.set('endDate', filters.endDate);
    }
    return this.http.get(`${this.apiUrl}/all`, {
      params,
      headers: this.buildContextHeaders(moduleContext)
    });
  }

  exportAllSummaries(moduleContext?: string): Observable<any> {
    return this.http.get(`${this.apiUrl}/export`, {
      headers: this.buildContextHeaders(moduleContext)
    });
  }

  deleteSummary(id: number, moduleContext?: string): Observable<any> {
    return this.http.delete(`${this.apiUrl}/${id}`, {
      headers: this.buildContextHeaders(moduleContext)
    });
  }


} 