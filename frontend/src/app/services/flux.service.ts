import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface FluxData {
  id?: number;
  agence: string;
  dateDebut: string;
  dateFin: string;
  totalMises: number;
  totalGains: number;
  totalBonus: number;
  payin: number;
  payout: number;
  retenueSurGains: number;
}

@Injectable({ providedIn: 'root' })
export class FluxService {
  private apiUrl = '/api/flux';
  private readonly comptesHeaders = new HttpHeaders({ 'X-Permission-Module': 'Comptes' });

  constructor(private http: HttpClient) {}

  getFlux(agence: string, dateDebut: string, dateFin: string): Observable<FluxData | null> {
    const params = new HttpParams()
      .set('agence', agence)
      .set('dateDebut', dateDebut)
      .set('dateFin', dateFin);
    return this.http.get<FluxData | null>(`${this.apiUrl}`, { params, headers: this.comptesHeaders });
  }

  saveFlux(flux: FluxData): Observable<FluxData> {
    return this.http.post<FluxData>(`${this.apiUrl}`, flux, { headers: this.comptesHeaders });
  }

  updateFlux(flux: FluxData): Observable<FluxData> {
    return this.http.put<FluxData>(`${this.apiUrl}`, flux, { headers: this.comptesHeaders });
  }
}
