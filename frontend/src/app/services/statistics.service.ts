import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface Statistics {
  id?: number;
  agency: string;
  service: string;
  country: string;
  date: string;
  totalVolume: number;
  recordCount: number;
}

@Injectable({
  providedIn: 'root'
})
export class StatisticsService {
  private apiUrl = '/api/statistics';

  constructor(private http: HttpClient) {}

  // Récupérer les statistiques par filtres
  getStatisticsByFilters(
    agency?: string,
    service?: string,
    startDate?: string,
    endDate?: string
  ): Observable<Statistics[]> {
    let params = new HttpParams();
    
    if (agency) {
      params = params.set('agency', agency);
    }
    if (service) {
      params = params.set('service', service);
    }
    if (startDate) {
      params = params.set('startDate', startDate);
    }
    if (endDate) {
      params = params.set('endDate', endDate);
    }

    return this.http.get<Statistics[]>(`${this.apiUrl}/by-filters`, { params });
  }

  // Récupérer les statistiques par date
  getStatisticsByDate(date: string): Observable<Statistics[]> {
    const params = new HttpParams().set('date', date);
    return this.http.get<Statistics[]>(`${this.apiUrl}/by-date`, { params });
  }

  // Récupérer les statistiques par agence et service
  getStatisticsByAgencyAndService(agency: string, service: string): Observable<Statistics[]> {
    const params = new HttpParams().set('agency', agency).set('service', service);
    return this.http.get<Statistics[]>(`${this.apiUrl}/by-filters`, { params });
  }

  // Récupérer toutes les statistiques
  getAllStatistics(): Observable<Statistics[]> {
    return this.http.get<Statistics[]>(`${this.apiUrl}/by-filters`);
  }

  // Sauvegarder des statistiques
  saveStatistics(statistics: Statistics[]): Observable<Statistics[]> {
    return this.http.post<Statistics[]>(`${this.apiUrl}/save`, statistics);
  }
}

