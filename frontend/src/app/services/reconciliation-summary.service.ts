import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';

export interface AgencySummaryData {
    agency: string;
    service: string;
    date: string;
    country: string;
    totalVolume: number;
    recordCount: number;
    /** Pré-calculé côté résultats ou agrégation paginée — évite de rescanner tous les enregistrements. */
    matches?: number;
    boOnly?: number;
    partnerOnly?: number;
    mismatches?: number;
}

export interface AgencySummaryMeta {
    totalPartnerOnly: number;
    hasPartnerOnlyWithAgencyService: boolean;
}

@Injectable({
    providedIn: 'root'
})
export class ReconciliationSummaryService {
    private agencySummarySubject = new BehaviorSubject<AgencySummaryData[]>([]);
    public agencySummary$ = this.agencySummarySubject.asObservable();
    private summaryMeta: AgencySummaryMeta = { totalPartnerOnly: 0, hasPartnerOnlyWithAgencyService: false };

    setAgencySummary(summary: AgencySummaryData[], meta?: Partial<AgencySummaryMeta>) {
        if (meta) {
            this.summaryMeta = { ...this.summaryMeta, ...meta };
        }
        this.agencySummarySubject.next(summary);
    }

    getAgencySummary(): AgencySummaryData[] {
        return this.agencySummarySubject.value;
    }

    getSummaryMeta(): AgencySummaryMeta {
        return this.summaryMeta;
    }

    clearAgencySummary() {
        this.summaryMeta = { totalPartnerOnly: 0, hasPartnerOnlyWithAgencyService: false };
        this.agencySummarySubject.next([]);
    }
}

