import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { Observable, forkJoin, of } from 'rxjs';
import { map, catchError } from 'rxjs/operators';

export interface RedevanceData {
  payin: number;
  payout: number;
  totalMises: number;
  totalGains: number;
  totalBonus: number;
  chiffreAffairesBrut: number;
  taxeSurJeuxHasard: number;
  retenueSurGains: number;
  produitBrutJeux: number;
  remunerationIntegrateur: number;
  revenuGenereActCom: number;
  baseCalcul: number;
  redevanceTotale: number;
  tauxPayin: number;
  tauxPayout: number;
  retenueSurGainsPourcentage: number;
  retenueSurGainsSeuil: number;
  taxeJeuxHasardPourcentage: number;
  tauxRedevancePourcentage: number;
  operateur: string;
  periode: string;
}

export interface RedevanceAgenceParam {
  id?: number;
  agence: string;
  retenueSurGainsPourcentage: number;
  retenueSurGainsSeuil: number;
  taxeJeuxHasardPourcentage: number;
  tauxRedevancePourcentage: number;
}

@Injectable({ providedIn: 'root' })
export class RedevanceService {
  private apiUrl = '/api/redevance';
  private readonly comptesHeaders = new HttpHeaders({ 'X-Permission-Module': 'Comptes' });

  constructor(private http: HttpClient) {}

  computeRedevance(agence: string | null, pays: string[], startDate: string, endDate: string): Observable<RedevanceData> {
    let params = new HttpParams();
    if (agence) params = params.set('agence', agence);
    if (startDate) params = params.set('startDate', startDate);
    if (endDate) params = params.set('endDate', endDate);
    if (pays && pays.length > 0) {
      pays.forEach(p => { params = params.append('pays', p); });
    }
    return this.http.get<RedevanceData>(`${this.apiUrl}/compute`, { params, headers: this.comptesHeaders });
  }

  getParams(agence: string): Observable<RedevanceAgenceParam> {
    return this.http.get<RedevanceAgenceParam>(`${this.apiUrl}/params/${encodeURIComponent(agence)}`, {
      headers: this.comptesHeaders
    });
  }

  saveParams(params: RedevanceAgenceParam): Observable<RedevanceAgenceParam> {
    return this.http.put<RedevanceAgenceParam>(`${this.apiUrl}/params`, params, {
      headers: this.comptesHeaders
    });
  }

  /** Récupère la redevance pour les N derniers mois (même filtres agence/pays) */
  getRedevanceByMonths(agence: string | null, pays: string[], numberOfMonths: number = 6): Observable<{ month: string; redevance: number }[]> {
    const now = new Date();
    const requests: Observable<RedevanceData>[] = [];
    const monthLabels: string[] = [];
    const moisNoms = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Août', 'Sep', 'Oct', 'Nov', 'Déc'];
    for (let i = numberOfMonths - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const startDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
      const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0);
      const endDate = `${lastDay.getFullYear()}-${String(lastDay.getMonth() + 1).padStart(2, '0')}-${String(lastDay.getDate()).padStart(2, '0')}`;
      monthLabels.push(`${moisNoms[d.getMonth()]} ${d.getFullYear()}`);
      requests.push(this.computeRedevance(agence, pays, startDate, endDate));
    }
    return forkJoin(requests).pipe(
      map(results => results.map((r, idx) => ({ month: monthLabels[idx], redevance: r?.redevanceTotale ?? 0 }))),
      catchError(() => of(monthLabels.map(m => ({ month: m, redevance: 0 }))))
    );
  }
}
