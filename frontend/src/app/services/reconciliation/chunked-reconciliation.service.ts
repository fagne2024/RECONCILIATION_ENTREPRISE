import { Injectable } from '@angular/core';
import { Observable, BehaviorSubject, Subject, firstValueFrom, forkJoin } from 'rxjs';
import { takeUntil, switchMap, map, catchError, tap, concatMap, timeout, retry } from 'rxjs/operators';
import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { ReconciliationRequest } from '../../models/reconciliation-request.model';
import { ReconciliationResponse } from '../../models/reconciliation-response.model';

export interface ChunkProgress {
    percentage: number;
    processed: number;
    total: number;
    step: string;
    currentBoChunk?: number;
    totalBoChunks?: number;
    matchesCount?: number;
    boOnlyCount?: number;
    partnerRemaining?: number;
    chunkBackendProgress?: Map<number, number>;
}

@Injectable({ providedIn: 'root' })
export class ChunkedReconciliationService {
    private readonly apiUrl = '/api/reconciliation';
    private readonly RECONCILIATION_TIMEOUT = 900_000; // 15 min
    private readonly CHUNK_LIVE_PROGRESS_POLL_MS = 1_000;

    private destroy$ = new Subject<void>();

    // Chunk progress
    private chunkProgressSubject = new BehaviorSubject<ChunkProgress>({
        percentage: 0,
        processed: 0,
        total: 0,
        step: '',
        currentBoChunk: 0,
        totalBoChunks: 0,
        matchesCount: 0,
        boOnlyCount: 0,
        partnerRemaining: 0,
        chunkBackendProgress: new Map()
    });

    public chunkProgress$ = this.chunkProgressSubject.asObservable();

    constructor(private http: HttpClient) {}

    /**
     * Détermine la taille optimale des chunks selon le volume de données
     */
    calculateChunkSize(
        boDataLength: number,
        partnerDataLength: number,
        isProduction: boolean
    ): number {
        const totalLines = boDataLength + partnerDataLength;

        if (totalLines > 1_000_000) {
            return 150_000;
        } else if (partnerDataLength > 200_000 && partnerDataLength < 300_000) {
            return 50_000;
        } else if (partnerDataLength >= 300_000) {
            return 40_000;
        } else if (partnerDataLength > 100_000) {
            return 50_000;
        } else if (boDataLength > 200_000) {
            return 50_000;
        }
        return 50_000;
    }

    /**
     * Crée des chunks à partir des données BO
     */
    createChunks<T>(data: T[], chunkSize: number): T[][] {
        const chunks: T[][] = [];
        for (let i = 0; i < data.length; i += chunkSize) {
            chunks.push(data.slice(i, i + chunkSize));
        }
        return chunks;
    }

    /**
     * Reconciliation par chunks avec le backend
     */
    reconcileWithBackendChunks(
        request: ReconciliationRequest,
        progressCallback?: (progress: any) => void
    ): Observable<ReconciliationResponse> {
        // TODO: Implementation will be in Orchestrator
        throw new Error('Use ReconciliationOrchestratorService instead');
    }
}