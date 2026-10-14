import { Injectable } from '@angular/core';
import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { Observable, throwError, timer } from 'rxjs';
import { catchError, switchMap } from 'rxjs/operators';
import {
    ServiceReference,
    ServiceReferencePayload,
    ServiceReferenceDashboard,
    ServiceCountryVolume,
    ServiceReferenceBatchDeleteResult,
    ServiceReferenceImportBatchResult
} from '../models/service-reference.model';

@Injectable({
    providedIn: 'root'
})
export class ServiceReferenceService {
    private readonly apiUrl = '/api/service-references';
    private static readonly MAX_429_RETRIES = 6;

    constructor(private http: HttpClient) {}

    private with429Retry<T>(factory: () => Observable<T>, attempt = 0): Observable<T> {
        return factory().pipe(
            catchError((err: HttpErrorResponse) => {
                if (err.status === 429 && attempt < ServiceReferenceService.MAX_429_RETRIES) {
                    const delayMs = Math.min(1500 * Math.pow(2, attempt), 30000);
                    return timer(delayMs).pipe(switchMap(() => this.with429Retry(factory, attempt + 1)));
                }
                return throwError(() => err);
            })
        );
    }

    listAll(): Observable<ServiceReference[]> {
        return this.with429Retry(() => this.http.get<ServiceReference[]>(this.apiUrl));
    }

    /** Codes RECO déjà en base (unicité globale), pour filtrer l'import. */
    getUsedCodeRecos(): Observable<string[]> {
        return this.with429Retry(() => this.http.get<string[]>(`${this.apiUrl}/used-code-recos`));
    }

    /** Codes service déjà en base — filtre d’import (colonne Code Service uniquement). */
    getUsedCodeServices(): Observable<string[]> {
        return this.with429Retry(() => this.http.get<string[]>(`${this.apiUrl}/used-code-services`));
    }

    /** Clés PAYS|service présentes dans result8rec / rapport de réconciliation (période glissante). */
    getActiveInAgencyKeys(periodMonths = 3): Observable<string[]> {
        const params = new HttpParams().set('periodMonths', String(periodMonths));
        return this.with429Retry(() =>
            this.http.get<string[]>(`${this.apiUrl}/active-in-agency`, { params })
        );
    }

    getByPays(pays: string): Observable<ServiceReference[]> {
        return this.http.get<ServiceReference[]>(`${this.apiUrl}/pays/${pays}`);
    }

    getByCodeReco(codeReco: string): Observable<ServiceReference> {
        return this.http.get<ServiceReference>(`${this.apiUrl}/code-reco/${codeReco}`);
    }

    create(payload: ServiceReferencePayload): Observable<ServiceReference> {
        return this.http.post<ServiceReference>(this.apiUrl, payload);
    }

    /**
     * Import de plusieurs lignes en une requête (évite le rate limiting sur les gros fichiers).
     */
    importBatch(
        items: { rowNumber: number; payload: ServiceReferencePayload }[],
        upsert = false
    ): Observable<ServiceReferenceImportBatchResult> {
        let params = new HttpParams();
        if (upsert) {
            params = params.set('upsert', 'true');
        }
        return this.with429Retry(() =>
            this.http.post<ServiceReferenceImportBatchResult>(
                `${this.apiUrl}/import-batch`,
                {
                    items: items.map((i) => ({
                        rowNumber: i.rowNumber,
                        payload: i.payload
                    }))
                },
                { params }
            )
        );
    }

    update(id: number, payload: Partial<ServiceReferencePayload>): Observable<ServiceReference> {
        return this.http.put<ServiceReference>(`${this.apiUrl}/${id}`, payload);
    }

    delete(id: number): Observable<void> {
        return this.with429Retry(() => this.http.delete<void>(`${this.apiUrl}/${id}`));
    }

    deleteBatch(ids: number[]): Observable<ServiceReferenceBatchDeleteResult> {
        return this.with429Retry(() =>
            this.http.post<ServiceReferenceBatchDeleteResult>(`${this.apiUrl}/delete-batch`, { ids })
        );
    }

    getDashboardStats(periodMonths = 3): Observable<ServiceReferenceDashboard[]> {
        const params = new HttpParams().set('periodMonths', String(periodMonths));
        return this.with429Retry(() =>
            this.http.get<ServiceReferenceDashboard[]>(`${this.apiUrl}/dashboard`, { params })
        );
    }

    getDashboardServiceVolumes(periodMonths = 3): Observable<ServiceCountryVolume[]> {
        const params = new HttpParams().set('periodMonths', String(periodMonths));
        return this.with429Retry(() =>
            this.http.get<ServiceCountryVolume[]>(`${this.apiUrl}/dashboard/service-volumes`, { params })
        );
    }
}
