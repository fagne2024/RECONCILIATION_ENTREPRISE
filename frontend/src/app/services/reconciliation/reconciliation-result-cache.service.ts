import { Injectable } from '@angular/core';
import { firstValueFrom, Observable, of, BehaviorSubject, Subject } from 'rxjs';
import { catchError, map, tap, concatMap, takeUntil } from 'rxjs/operators';
import { HttpClient } from '@angular/common/http';
import { ReconciliationResponse } from '../../models/reconciliation-response.model';

export interface PaginatedResult<T> {
    items: T[];
    total: number;
    page: number;
    size: number;
    totalPages: number;
}

export interface ClientResultSession {
    matches: any[];
    boOnly: any[];
    partnerOnly: any[];
    mismatches: any[];
}

@Injectable({ providedIn: 'root' })
export class ReconciliationResultCacheService {
    private readonly SLIM_RESULT_THRESHOLD = 200_000;
    private readonly CHUNK_SIZE = 500;

    // Stockage en mémoire pour les gros résultats
    private memoryResults = new Map<string, any>();

    // Sessions client pour résultats volumineux agrégés par chunks côté frontend
    private clientResultSessions = new Map<string, ClientResultSession>();

    // Caches pour écarts BO, lignes agrégées, partnerOnly
    private boEcartsSessionCache = new Map<string, { boOnly: Record<string, string>[]; mismatches: Record<string, string>[] }>();
    private ecartBoSummaryLinesCache = new Map<string, any[]>();
    private partnerOnlySessionCache = new Map<string, Record<string, string>[]>();

    private destroy$ = new Subject<void>();

    /**
     * Seuil au-delà duquel le résultat est émis en mode « slim »
     */
    readonly slimResultThreshold = 200_000;

    /**
     * Récupère un résultat en mémoire
     */
    getMemoryResult(jobId: string): any {
        return this.memoryResults.get(jobId);
    }

    /**
     * Sauvegarde un résultat en mémoire
     */
    setMemoryResult(jobId: string, result: any): void {
        this.memoryResults.set(jobId, result);
    }

    /**
     * Supprime un résultat en mémoire
     */
    deleteMemoryResult(jobId: string): void {
        this.memoryResults.delete(jobId);
    }

    /**
     * Récupère une session client
     */
    getClientSession(jobId: string): ClientResultSession | undefined {
        return this.clientResultSessions.get(jobId);
    }

    /**
     * Sauvegarde une session client
     */
    setClientSession(jobId: string, session: ClientResultSession): void {
        this.clientResultSessions.set(jobId, session);
    }

    /**
     * Supprime une session client
     */
    deleteClientSession(jobId: string): void {
        this.clientResultSessions.delete(jobId);
    }

    /**
     * Vérifie si le résultat doit être en mode slim
     */
    shouldUseSlimResult(totalDetailRows: number): boolean {
        return totalDetailRows > 200_000;
    }

    /**
     * Sauvegarde les résultats par chunks dans localStorage
     */
    saveResultsInLocalStorageChunks(jobId: string, results: any): void {
        try {
            const chunkSize = this.CHUNK_SIZE;

            // Sauvegarder les métadonnées
            const metadata = {
                jobId: results.jobId,
                status: results.status,
                totalBoRecords: results.totalBoRecords,
                totalPartnerRecords: results.totalPartnerRecords,
                totalMatched: results.totalMatched,
                totalUnmatchedBo: results.totalUnmatchedBo,
                totalUnmatchedPartner: results.totalUnmatchedPartner,
                boReconciliationKey: results.boReconciliationKey,
                partnerReconciliationKey: results.partnerReconciliationKey,
                isChunkedProcessing: results.isChunkedProcessing,
                processedAt: results.processedAt
            };

            localStorage.setItem(`reconciliation-results-${jobId}`, JSON.stringify(metadata));

            // Sauvegarder matches par chunks
            if (results.matchedRecords?.length) {
                for (let i = 0; i < results.matchedRecords.length; i += 500) {
                    const chunk = results.matchedRecords.slice(i, i + 500);
                    const chunkKey = `reconciliation-matches-${jobId}-${Math.floor(i / 500)}`;
                    try {
                        localStorage.setItem(chunkKey, JSON.stringify(chunk));
                    } catch {
                        this.saveInMemoryFallback(jobId, results);
                        return;
                    }
                }
            }

            // Sauvegarder unmatchedBo par chunks
            if (results.unmatchedBoRecords?.length) {
                for (let i = 0; i < results.unmatchedBoRecords.length; i += 500) {
                    const chunk = results.unmatchedBoRecords.slice(i, i + 500);
                    const chunkKey = `reconciliation-bo-only-${jobId}-${Math.floor(i / 500)}`;
                    try {
                        localStorage.setItem(chunkKey, JSON.stringify(chunk));
                    } catch {
                        this.saveInMemoryFallback(jobId, results);
                        return;
                    }
                }
            }

            // Sauvegarder unmatchedPartner par chunks
            if (results.unmatchedPartnerRecords?.length) {
                for (let i = 0; i < results.unmatchedPartnerRecords.length; i += 500) {
                    const chunk = results.unmatchedPartnerRecords.slice(i, i + 500);
                    const chunkKey = `reconciliation-partner-only-${jobId}-${Math.floor(i / 500)}`;
                    try {
                        localStorage.setItem(chunkKey, JSON.stringify(chunk));
                    } catch {
                        this.saveInMemoryFallback(jobId, results);
                        return;
                    }
                }
            }
        } catch (error) {
            this.saveInMemoryFallback(jobId, results);
        }
    }

    /**
     * Fallback en mémoire si localStorage échoue
     */
    private saveInMemoryFallback(jobId: string, results: any): void {
        this.memoryResults.set(jobId, {
            jobId: results.jobId,
            status: results.status,
            totalBoRecords: results.totalBoRecords,
            totalPartnerRecords: results.totalPartnerRecords,
            totalMatched: results.totalMatched,
            totalUnmatchedBo: results.totalUnmatchedBo,
            totalUnmatchedPartner: results.totalUnmatchedPartner,
            boReconciliationKey: results.boReconciliationKey,
            partnerReconciliationKey: results.partnerReconciliationKey,
            isChunkedProcessing: results.isChunkedProcessing,
            processedAt: results.processedAt,
            matchedRecords: results.matchedRecords,
            unmatchedBoRecords: results.unmatchedBoRecords,
            unmatchedPartnerRecords: results.unmatchedPartnerRecords
        });
    }

    /**
     * Charge les données depuis les chunks localStorage
     */
    loadDataFromChunks(jobId: string, dataType: 'matches' | 'bo-only' | 'partner-only'): any[] {
        const allData: any[] = [];
        let chunkIndex = 0;

        while (true) {
            const chunkKey = `reconciliation-${dataType}-${jobId}-${chunkIndex}`;
            const chunkData = localStorage.getItem(chunkKey);

            if (!chunkData) {
                break;
            }

            try {
                const chunk = JSON.parse(chunkData);
                allData.push(...chunk);
                chunkIndex++;
            } catch {
                break;
            }
        }

        return allData;
    }

    /**
     * Charge les résultats frontend chunked
     */
    getFrontendChunkedResults(jobId: string): Observable<any> {
        return new Observable(observer => {
            try {
                if (this.memoryResults.has(jobId)) {
                    const results = this.memoryResults.get(jobId);
                    observer.next(this.convertToStandardResponse(results));
                    observer.complete();
                    return;
                }

                const resultsData = localStorage.getItem(`reconciliation-results-${jobId}`);
                if (resultsData) {
                    const results = JSON.parse(resultsData);
                    if (results.isChunkedProcessing) {
                        const allMatches = this.loadDataFromChunks(jobId, 'matches');
                        const allBoOnly = this.loadDataFromChunks(jobId, 'bo-only');
                        const allPartnerOnly = this.loadDataFromChunks(jobId, 'partner-only');

                        observer.next(this.buildResponseFromChunks(results, allMatches, allBoOnly, allPartnerOnly));
                        observer.complete();
                    } else {
                        observer.next(this.buildLegacyResponse(results));
                        observer.complete();
                    }
                } else {
                    observer.error(new Error('Résultats non trouvés pour le job frontend'));
                }
            } catch (error) {
                observer.error(error);
            }
        });
    }

    private convertToStandardResponse(results: any): any {
        return {
            matches: results.matchedRecords?.map((match: any) => ({
                key: match.bo[results.boReconciliationKey] || '',
                boData: match.bo,
                partnerData: match.partner,
                partnerDataList: match.partnerDataList,
                differences: []
            })) || [],
            boOnly: results.unmatchedBoRecords || [],
            partnerOnly: results.unmatchedPartnerRecords || [],
            mismatches: [],
            totalBoRecords: results.totalBoRecords,
            totalPartnerRecords: results.totalPartnerRecords,
            totalMatches: results.totalMatched,
            totalMismatches: 0,
            totalBoOnly: results.totalUnmatchedBo,
            totalPartnerOnly: results.totalUnmatchedPartner,
            executionTimeMs: Date.now() - parseInt(results.jobId.split('-')[2]) || 0,
            processedRecords: results.totalBoRecords + results.totalPartnerRecords,
            progressPercentage: 100
        };
    }

    private buildResponseFromChunks(results: any, allMatches: any[], allBoOnly: any[], allPartnerOnly: any[]): any {
        return {
            matches: allMatches.map((match: any) => ({
                key: match.bo[results.boReconciliationKey] || '',
                boData: match.bo,
                partnerData: match.partner,
                partnerDataList: match.partnerDataList,
                differences: []
            })),
            boOnly: allBoOnly,
            partnerOnly: allPartnerOnly,
            mismatches: [],
            totalBoRecords: results.totalBoRecords,
            totalPartnerRecords: results.totalPartnerRecords,
            totalMatches: results.totalMatched,
            totalMismatches: 0,
            totalBoOnly: results.totalUnmatchedBo,
            totalPartnerOnly: results.totalUnmatchedPartner,
            executionTimeMs: Date.now() - parseInt(results.jobId.split('-')[2]) || 0,
            processedRecords: results.totalBoRecords + results.totalPartnerRecords,
            progressPercentage: 100
        };
    }

    private buildLegacyResponse(results: any): any {
        return {
            matches: (results.matchedRecords || []).map((match: any) => ({
                key: match.bo[results.boReconciliationKey] || '',
                boData: match.bo,
                partnerData: match.partner,
                partnerDataList: match.partnerDataList,
                differences: []
            })),
            boOnly: results.unmatchedBoRecords || [],
            partnerOnly: results.unmatchedPartnerRecords || [],
            mismatches: [],
            totalBoRecords: results.totalBoRecords,
            totalPartnerRecords: results.totalPartnerRecords,
            totalMatches: results.matchedRecords?.length || 0,
            totalMismatches: 0,
            totalBoOnly: results.unmatchedBoRecords?.length || 0,
            totalPartnerOnly: results.unmatchedPartnerRecords?.length || 0,
            executionTimeMs: Date.now() - parseInt(results.jobId?.split('-')[2]) || 0,
            processedRecords: results.totalBoRecords + results.totalPartnerRecords,
            progressPercentage: 100
        };
    }

    /**
     * Vide tous les caches
     */
    clearAll(): void {
        this.memoryResults.clear();
        this.clientResultSessions.clear();
        this.boEcartsSessionCache.clear();
        this.ecartBoSummaryLinesCache.clear();
        this.partnerOnlySessionCache.clear();
    }

    /**
     * Efface les données de session
     */
    clearSession(jobId: string): void {
        this.memoryResults.delete(jobId);
        this.clientResultSessions.delete(jobId);
        this.boEcartsSessionCache.delete(jobId);
        this.ecartBoSummaryLinesCache.delete(jobId);
        this.partnerOnlySessionCache.delete(jobId);
    }
}