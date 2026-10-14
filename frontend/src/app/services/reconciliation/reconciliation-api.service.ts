import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { ReconciliationRequest } from '../../models/reconciliation-request.model';
import { ReconciliationResponse } from '../../models/reconciliation-response.model';

@Injectable({ providedIn: 'root' })
export class ReconciliationApiService {
    private readonly apiUrl = '/api/reconciliation';

    constructor(private readonly http: HttpClient) {}

    /**
     * Envoie une réconciliation complète (mono-POST)
     */
    reconcile(request: ReconciliationRequest): Observable<ReconciliationResponse> {
        return this.http.post<ReconciliationResponse>(`${this.apiUrl}/reconcile`, request, {
            headers: new HttpHeaders({ 'Content-Type': 'application/json' })
        });
    }

    /**
     * Upload des fichiers et préparation côté serveur
     */
    uploadAndPrepare(formData: FormData): Observable<{ jobId: string; status: string }> {
        return this.http.post<{ jobId: string; status: string }>(`${this.apiUrl}/upload-and-prepare`, formData);
    }

    /**
     * Upload des fichiers pour traitement par chunks
     */
    uploadAndPrepareChunked(formData: FormData): Observable<{ jobId: string; status: string }> {
        return this.http.post<{ jobId: string; status: string }>(`${this.apiUrl}/upload-and-prepare-chunked`, formData);
    }

    /**
     * Récupère le résumé des résultats (sans données détaillées)
     */
    getJobResultsSummary(jobId: string): Observable<ReconciliationResponse> {
        return this.http.get<ReconciliationResponse>(`${this.apiUrl}/results/summary?sessionId=${jobId}`);
    }

    /**
     * Récupère les matches paginés
     */
    getMatches(jobId: string, page: number, size: number): Observable<{ matches: any[]; total: number; page: number; size: number; totalPages: number }> {
        return this.http.get<{ matches: any[]; total: number; page: number; size: number; totalPages: number }>(
            `${this.apiUrl}/results/matches?sessionId=${jobId}&page=${page}&size=${size}`
        );
    }

    /**
     * Récupère les boOnly paginés
     */
    getBoOnly(jobId: string, page: number, size: number): Observable<{ boOnly: any[]; total: number; page: number; size: number; totalPages: number }> {
        return this.http.get<{ boOnly: any[]; total: number; page: number; size: number; totalPages: number }>(
            `${this.apiUrl}/results/bo-only?sessionId=${jobId}&page=${page}&size=${size}`
        );
    }

    /**
     * Récupère les partnerOnly paginés
     */
    getPartnerOnly(jobId: string, page: number, size: number): Observable<{ partnerOnly: any[]; total: number; page: number; size: number; totalPages: number }> {
        return this.http.get<{ partnerOnly: any[]; total: number; page: number; size: number; totalPages: number }>(
            `${this.apiUrl}/results/partner-only?sessionId=${jobId}&page=${page}&size=${size}`
        );
    }

    /**
     * Récupère les mismatches paginés
     */
    getMismatches(jobId: string, page: number, size: number): Observable<{ mismatches: any[]; total: number; page: number; size: number; totalPages: number }> {
        return this.http.get<{ mismatches: any[]; total: number; page: number; size: number; totalPages: number }>(
            `${this.apiUrl}/results/mismatches?sessionId=${jobId}&page=${page}&size=${size}`
        );
    }

    /**
     * Récupère la progression live d'une session
     */
    getLiveProgress(sessionId: string): Observable<{
        progress?: { step?: string; progress?: number; processedRecords?: number; totalRecords?: number; matchesCount?: number; boOnlyCount?: number; partnerRemaining?: number };
    }> {
        return this.http.get<{
            progress?: { step?: string; progress?: number; processedRecords?: number; totalRecords?: number; matchesCount?: number; boOnlyCount?: number; partnerRemaining?: number };
        }>(`${this.apiUrl}/live-progress/${sessionId}`);
    }

    /**
     * Récupère les écarts BO (boOnly + mismatches)
     */
    getBoEcarts(sessionId: string): Observable<{
        success?: boolean;
        boOnly?: Record<string, string>[];
        mismatches?: Record<string, string>[];
    }> {
        return this.http.get<{
            success?: boolean;
            boOnly?: Record<string, string>[];
            mismatches?: Record<string, string>[];
        }>(`${this.apiUrl}/results/ecart-bo-ecarts?sessionId=${encodeURIComponent(sessionId)}`);
    }

    /**
     * Récupère les lignes d'agrégation BO
     */
    getEcartBoSummaryLines(sessionId: string): Observable<{
        success?: boolean;
        lines?: Array<{
            agence?: string;
            service?: string;
            pays?: string;
            date?: string;
            montant?: number;
            statut?: string;
            nombreTransactions?: number;
        }>;
    }> {
        return this.http.get<{
            success?: boolean;
            lines?: Array<{
                agence?: string;
                service?: string;
                pays?: string;
                date?: string;
                montant?: number;
                statut?: string;
                nombreTransactions?: number;
            }>;
        }>(`${this.apiUrl}/results/ecart-bo-summary-lines?sessionId=${encodeURIComponent(sessionId)}`);
    }

    /**
     * Récupère le résumé agrégé par agence
     */
    getAgencySummaryAggregated(sessionId: string): Observable<{
        success?: boolean;
        summary?: any[];
        meta?: { totalPartnerOnly?: number; hasPartnerOnlyWithAgencyService?: boolean; partnerOnlyWithoutAgency?: number };
    }> {
        return this.http.get<{
            success?: boolean;
            summary?: any[];
            meta?: { totalPartnerOnly?: number; hasPartnerOnlyWithAgencyService?: boolean; partnerOnlyWithoutAgency?: number };
        }>(`${this.apiUrl}/results/agency-summary?sessionId=${encodeURIComponent(sessionId)}`);
    }

    /**
     * Récupère les lignes d'agrégation côté serveur
     */
    getEcartBoSummaryLinesFromServer(sessionId: string): Observable<{
        success?: boolean;
        lines?: Array<{
            agence?: string;
            service?: string;
            pays?: string;
            date?: string;
            montant?: number;
            statut?: string;
            nombreTransactions?: number;
        }>;
    }> {
        return this.http.get<{
            success?: boolean;
            lines?: Array<{
                agence?: string;
                service?: string;
                pays?: string;
                date?: string;
                montant?: number;
                statut?: string;
                nombreTransactions?: number;
            }>;
        }>(`${this.apiUrl}/results/ecart-bo-summary-lines?sessionId=${encodeURIComponent(sessionId)}`);
    }

    /**
     * Annule un job
     */
    cancelJob(jobId: string): Observable<any> {
        return this.http.post(`${this.apiUrl}/cancel`, { jobId });
    }

    /**
     * Supprime une session de résultats
     */
    deleteSessionResults(sessionId: string): Observable<any> {
        return this.http.delete(`${this.apiUrl}/results/session/${encodeURIComponent(sessionId)}`);
    }

    /**
     * Test de santé
     */
    healthCheck(): Observable<any> {
        return this.http.get(`${this.apiUrl}/health`);
    }

    /**
     * Analyse les clés de réconciliation
     */
    analyzeKeys(formData: FormData): Observable<any> {
        return this.http.post('/api/reconciliation/analyze-keys', formData);
    }

    /**
     * Sauvegarde un résumé
     */
    saveSummary(summary: any): Observable<any> {
        return this.http.post('/api/reconciliation/save-summary', summary);
    }
}