import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface PilotReportFilters {
  startYm?: string; // YYYY-MM
  endYm?: string; // YYYY-MM
  country?: string;
  service?: string;
  env?: string;
}

@Injectable({
  providedIn: 'root'
})
export class ReconciliationReportService {
  constructor(private http: HttpClient) {}

  getPilotReportMarkdown(filters: PilotReportFilters = {}): Observable<string> {
    let params = new HttpParams().set('format', 'markdown');
    Object.entries(filters).forEach(([k, v]) => {
      if (v !== undefined && v !== null && String(v).trim() !== '') {
        params = params.set(k, String(v).trim());
      }
    });
    return this.http.get('/api/reconciliation-report/pilot-report', {
      params,
      responseType: 'text'
    });
  }

  getPilotReportJson(filters: PilotReportFilters = {}): Observable<any> {
    let params = new HttpParams();
    Object.entries(filters).forEach(([k, v]) => {
      if (v !== undefined && v !== null && String(v).trim() !== '') {
        params = params.set(k, String(v).trim());
      }
    });
    return this.http.get('/api/reconciliation-report/pilot-report', { params });
  }
}

