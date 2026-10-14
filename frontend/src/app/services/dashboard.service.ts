import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';

/** Ligne saisie manuelle relevé (API /manual-trx/range). */
export interface ReleveManualRangeRow {
    date: string;
    service: string;
    country: string;
    env?: string | null;
    manualNombre: number;
    manualVolume: number;
    rembourseNombre: number;
    rembourseVolume: number;
}

export interface DashboardMetrics {
    totalReconciliations: number;
    totalFiles: number;
    lastActivity: string;
    /** Date ISO (yyyy-MM-dd) ; vide si aucune activité sur la période. */
    lastActivityDate?: string;
    todayReconciliations: number;
}

export interface DetailedMetrics {
    totalVolume: number;
    totalFees: number;
    totalTransactions: number;
    totalClients: number;
    averageVolume: number;
    averageTransactions: number;
    averageFeesPerDay: number;
    operationStats: OperationStat[];
    frequencyStats: FrequencyStat[];
}

export interface TransactionCreatedStats {
    serviceStats: ServiceStat[];
    totalServices: number;
    totalCashinVolume: number;
    totalPaymentVolume: number;
    totalCashinCount: number;
    totalPaymentCount: number;
    totalTransactionCount: number;
}

export interface ServiceStat {
    service: string;
    totalCashinVolume: number;
    totalPaymentVolume: number;
    totalCashinCount: number;
    totalPaymentCount: number;
    totalTransactions: number;
}

export interface OperationStat {
    operationType: string;
    transactionCount: number;
    totalVolume: number;
    averageVolume: number;
}

export interface FrequencyStat {
    operationType: string;
    frequency: number;
}

export interface FilterOptions {
    agencies: string[];
    services: string[];
    countries: string[];
    banques: string[];
    timeFilters: string[];
}

@Injectable({
    providedIn: 'root'
})
export class DashboardService {
    private apiUrl = '/api/statistics';
    private readonly dashboardModule = 'Dashboard';

    constructor(private http: HttpClient) {}

    private buildDashboardHeaders(action: 'consulter' | 'filtrer' = 'consulter'): HttpHeaders {
        return new HttpHeaders({
            'X-Permission-Module': this.dashboardModule,
            'X-Permission-Action': action
        });
    }

    getDashboardMetrics(period?: string): Observable<DashboardMetrics> {
        const params = period ? `?period=${encodeURIComponent(period)}` : '';
        return this.http.get<DashboardMetrics>(`${this.apiUrl}/dashboard-metrics${params}`, {
            headers: this.buildDashboardHeaders('consulter')
        });
    }

    getFilterOptions(): Observable<FilterOptions> {
        return this.http.get<FilterOptions>(`${this.apiUrl}/filter-options`, {
            headers: this.buildDashboardHeaders('filtrer')
        });
    }

    getDetailedMetrics(
        agencies?: string[], 
        services?: string[], 
        countries?: string[],
        timeFilter?: string,
        startDate?: string,
        endDate?: string
    ): Observable<DetailedMetrics> {
        let params = '';
        const queryParams = [];
        
        if (agencies && agencies.length > 0 && !agencies.includes('Tous')) {
            agencies.forEach(agency => queryParams.push(`agency=${encodeURIComponent(agency)}`));
        }
        if (services && services.length > 0 && !services.includes('Tous')) {
            services.forEach(service => queryParams.push(`service=${encodeURIComponent(service)}`));
        }
        if (countries && countries.length > 0 && !countries.includes('Tous')) {
            countries.forEach(country => queryParams.push(`country=${encodeURIComponent(country)}`));
        }
        if (timeFilter) queryParams.push(`timeFilter=${encodeURIComponent(timeFilter)}`);
        if (startDate) queryParams.push(`startDate=${encodeURIComponent(startDate)}`);
        if (endDate) queryParams.push(`endDate=${encodeURIComponent(endDate)}`);
        
        if (queryParams.length > 0) {
            params = '?' + queryParams.join('&');
        }
        
        return this.http.get<DetailedMetrics>(`${this.apiUrl}/detailed-metrics${params}`, {
            headers: this.buildDashboardHeaders('filtrer')
        });
    }

    getTransactionCreatedStats(
        agencies?: string[], 
        services?: string[], 
        countries?: string[],
        timeFilter?: string,
        startDate?: string,
        endDate?: string
    ): Observable<TransactionCreatedStats> {
        let params = '';
        const queryParams = [];
        
        if (agencies && agencies.length > 0 && !agencies.includes('Tous')) {
            agencies.forEach(agency => queryParams.push(`agency=${encodeURIComponent(agency)}`));
        }
        if (services && services.length > 0 && !services.includes('Tous')) {
            services.forEach(service => queryParams.push(`service=${encodeURIComponent(service)}`));
        }
        if (countries && countries.length > 0 && !countries.includes('Tous')) {
            countries.forEach(country => queryParams.push(`country=${encodeURIComponent(country)}`));
        }
        if (timeFilter) queryParams.push(`timeFilter=${encodeURIComponent(timeFilter)}`);
        if (startDate) queryParams.push(`startDate=${encodeURIComponent(startDate)}`);
        if (endDate) queryParams.push(`endDate=${encodeURIComponent(endDate)}`);
        
        if (queryParams.length > 0) {
            params = '?' + queryParams.join('&');
        }
        
        return this.http.get<TransactionCreatedStats>(`${this.apiUrl}/transaction-created-stats${params}`, {
            headers: this.buildDashboardHeaders('filtrer')
        });
    }

    /**
     * Récupère les pays et services distincts depuis result8rec
     * (même source que la page de rapport).
     */
    getReconciliationFilters(): Observable<{
        countries: string[];
        services: string[];
        countryServices: { [country: string]: string[] };
        countryEnvServices?: { [country: string]: { [envKey: string]: string[] } };
    }> {
        return this.http.get<{
            countries: string[];
            services: string[];
            countryServices: { [country: string]: string[] };
            countryEnvServices?: { [country: string]: { [envKey: string]: string[] } };
        }>(`/api/result8rec/filters`, {
            headers: this.buildDashboardHeaders('filtrer')
        });
    }

    /**
     * Saisies manuelles relevé (trx traité / trx remboursé) sur une plage de dates.
     */
    getReleveManualTrxRange(
        startDate: string,
        endDate: string,
        country?: string,
        services?: string[],
        env?: string
    ): Observable<ReleveManualRangeRow[]> {
        let p = new HttpParams().set('startDate', startDate).set('endDate', endDate);
        if (country) {
            p = p.set('country', country);
        }
        const svcList = (services || []).map(s => (s || '').trim()).filter(Boolean);
        svcList.forEach(s => {
            p = p.append('service', s);
        });
        if (env && env !== 'ALL') {
            p = p.set('env', env);
        }
        return this.http.get<ReleveManualRangeRow[]>(`/api/reconciliation-report/manual-trx/range`, {
            params: p,
            headers: this.buildDashboardHeaders('filtrer')
        });
    }
} 