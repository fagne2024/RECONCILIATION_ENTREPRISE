import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface RankingItem {
  agency?: string;
  service?: string;
  country?: string;
  transactionCount: number;
  totalVolume: number;
  totalFees: number;
  averageVolume: number;
  averageFees: number;
  uniqueAgencies?: number;
}

export interface AllRankings {
  agenciesByTransactions: RankingItem[];
  agenciesByVolume: RankingItem[];
  agenciesByFees: RankingItem[];
  servicesByTransactions: RankingItem[];
  servicesByVolume: RankingItem[];
  servicesByFees: RankingItem[];
}

export interface RankingsBundle {
  agencies: RankingItem[];
  services: RankingItem[];
}

@Injectable({
  providedIn: 'root'
})
export class RankingService {
  private apiUrl = '/api/rankings';

  constructor(private http: HttpClient) { }

  /**
   * Récupérer tous les classements
   */
  getAllRankings(period: string = 'month'): Observable<AllRankings> {
    return this.http.get<AllRankings>(`${this.apiUrl}?period=${period}`);
  }

  /**
   * Récupérer la liste des pays
   */
  getCountries(): Observable<string[]> {
    return this.http.get<string[]>(`${this.apiUrl}/countries`);
  }

  /**
   * Classements agences + services en une seule requête
   */
  getRankingsBundle(
    countries?: string[],
    period: string = 'month',
    startDate?: string,
    endDate?: string
  ): Observable<RankingsBundle> {
    let url = `${this.apiUrl}/bundle?period=${period}`;
    if (countries && countries.length > 0 && !countries.includes('Tous les pays')) {
      const countryParams = countries.map(c => `country=${encodeURIComponent(c)}`).join('&');
      url += `&${countryParams}`;
    }
    if (startDate && endDate) {
      url += `&startDate=${startDate}&endDate=${endDate}`;
    }
    return this.http.get<RankingsBundle>(url);
  }

  private buildRankingUrl(path: string, countries?: string[], period: string = 'month', startDate?: string, endDate?: string): string {
    let url = `${this.apiUrl}/${path}?period=${period}`;
    if (countries && countries.length > 0 && !countries.includes('Tous les pays')) {
      const countryParams = countries.map(c => `country=${encodeURIComponent(c)}`).join('&');
      url += `&${countryParams}`;
    }
    if (startDate && endDate) {
      url += `&startDate=${startDate}&endDate=${endDate}`;
    }
    return url;
  }

  /**
   * Classement des agences par nombre de transactions
   */
  getAgencyRankingByTransactions(countries?: string[], period: string = 'month', startDate?: string, endDate?: string): Observable<RankingItem[]> {
    return this.http.get<RankingItem[]>(this.buildRankingUrl('agencies/transactions', countries, period, startDate, endDate));
  }

  /**
   * Classement des agences par volume
   */
  getAgencyRankingByVolume(countries?: string[], period: string = 'month', startDate?: string, endDate?: string): Observable<RankingItem[]> {
    return this.http.get<RankingItem[]>(this.buildRankingUrl('agencies/volume', countries, period, startDate, endDate));
  }

  /**
   * Classement des agences par frais
   */
  getAgencyRankingByFees(countries?: string[], period: string = 'month', startDate?: string, endDate?: string): Observable<RankingItem[]> {
    return this.http.get<RankingItem[]>(this.buildRankingUrl('agencies/fees', countries, period, startDate, endDate));
  }

  /**
   * Classement des services par nombre de transactions
   */
  getServiceRankingByTransactions(countries?: string[], period: string = 'month', startDate?: string, endDate?: string): Observable<RankingItem[]> {
    return this.http.get<RankingItem[]>(this.buildRankingUrl('services/transactions', countries, period, startDate, endDate));
  }

  /**
   * Classement des services par volume
   */
  getServiceRankingByVolume(countries?: string[], period: string = 'month', startDate?: string, endDate?: string): Observable<RankingItem[]> {
    return this.http.get<RankingItem[]>(this.buildRankingUrl('services/volume', countries, period, startDate, endDate));
  }

  /**
   * Classement des services par frais
   */
  getServiceRankingByFees(countries?: string[], period: string = 'month', startDate?: string, endDate?: string): Observable<RankingItem[]> {
    return this.http.get<RankingItem[]>(this.buildRankingUrl('services/fees', countries, period, startDate, endDate));
  }

  /**
   * Formater un montant en FCFA avec séparateurs de milliers
   */
  formatAmount(amount: number): string {
    if (amount === null || amount === undefined || isNaN(amount)) {
      return '0 FCFA';
    }

    return `${this.groupThousands(Math.round(Number(amount)))} FCFA`;
  }

  /**
   * Formater un nombre avec séparateurs de milliers
   */
  formatNumber(num: number): string {
    if (num === null || num === undefined || isNaN(num)) {
      return '0';
    }

    return this.groupThousands(Math.round(Number(num)));
  }

  private groupThousands(value: number): string {
    const sign = value < 0 ? '-' : '';
    const digits = Math.abs(value).toString();
    return `${sign}${digits.replace(/\B(?=(\d{3})+(?!\d))/g, ' ')}`;
  }
} 