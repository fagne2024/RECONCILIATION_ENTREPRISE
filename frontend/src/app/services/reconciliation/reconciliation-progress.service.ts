import { Injectable, OnDestroy } from '@angular/core';
import { BehaviorSubject, Observable, Subject, timer } from 'rxjs';
import { takeUntil, switchMap, map, catchError, tap } from 'rxjs/operators';
import { of } from 'rxjs';
import { HttpClient } from '@angular/common/http';

export interface ProgressUpdate {
    percentage: number;
    processed: number;
    total: number;
    step: string;
    currentFile?: number;
    totalFiles?: number;
    estimatedTimeRemaining?: number;
    currentBoChunk?: number;
    totalBoChunks?: number;
    matchesCount?: number;
    boOnlyCount?: number;
    partnerRemaining?: number;
}

export interface LiveProgressData {
    acknowledged: boolean;
    step?: string;
    percentage?: number;
    processed?: number;
    total?: number;
    matchesCount?: number;
    boOnlyCount?: number;
    partnerRemaining?: number;
}

@Injectable({ providedIn: 'root' })
export class ReconciliationProgressService implements OnDestroy {
    private static readonly LIVE_PROGRESS_POLL_MS = 1_500;
    private static readonly CHUNK_LIVE_PROGRESS_POLL_MS = 1_000;
    private static readonly BACKEND_PENDING_STEP = 'en attente';

    private readonly destroy$ = new Subject<void>();

    // Progress management
    private progressSubject = new BehaviorSubject<ProgressUpdate>({
        percentage: 0,
        processed: 0,
        total: 0,
        step: '',
        currentFile: 0,
        totalFiles: 0,
        estimatedTimeRemaining: 0
    });

    public progress$ = this.progressSubject.asObservable();

    /** Indique si un appel reconcile() est en cours */
    private reconciliationRunningSubject = new BehaviorSubject<boolean>(false);
    public reconciliationRunning$ = this.reconciliationRunningSubject.asObservable();

    constructor(private http: HttpClient) {}

    ngOnDestroy(): void {
        this.destroy$.next();
        this.destroy$.complete();
    }

    /** Met à jour la progression */
    updateProgress(progress: Partial<ProgressUpdate>): void {
        const current = this.progressSubject.value;
        this.progressSubject.next({ ...current, ...progress });
    }

    /** Définit si une réconciliation est en cours */
    setReconciliationRunning(running: boolean): void {
        this.reconciliationRunningSubject.next(running);
    }

    /**
     * Polling de progression live pour une session
     */
    pollLiveProgressOnce(sessionId: string) {
        return this.http.get<{
            progress?: { step?: string; progress?: number; processedRecords?: number; totalRecords?: number; matchesCount?: number; boOnlyCount?: number; partnerRemaining?: number; };
        }>(`/api/reconciliation/live-progress/${sessionId}`).pipe(
            map(res => {
                const step = res?.progress?.step;
                const pct = res?.progress?.progress;
                const isBackendAcknowledged = step && step.trim().toLowerCase() !== 'en attente';
                return {
                    acknowledged: isBackendAcknowledged,
                    step: step ? (step.trim().toLowerCase() === 'en attente' ? 'En cours...' : step.replace(/en attente/gi, 'En cours')) : undefined,
                    percentage: typeof pct === 'number' ? pct : undefined,
                    processed: res?.progress?.processedRecords,
                    total: res?.progress?.totalRecords,
                    matchesCount: res?.progress?.matchesCount,
                    boOnlyCount: res?.progress?.boOnlyCount,
                    partnerRemaining: res?.progress?.partnerRemaining
                };
            }),
            catchError(() => of({ acknowledged: false }))
        );
    }

    /**
     * Polling live pour sessions de chunks
     */
    pollChunkLiveProgressOnce(sessionId: string) {
        return this.http.get<{
            progress?: { step?: string; progress?: number; processedRecords?: number; totalRecords?: number; matchesCount?: number; boOnlyCount?: number; partnerRemaining?: number; };
        }>(`/api/reconciliation/live-progress/${sessionId}`).pipe(
            map(res => {
                const step = res?.progress?.step;
                const pct = res?.progress?.progress;
                const isBackendAcknowledged = step && step.trim().toLowerCase() !== 'en attente';
                return {
                    acknowledged: isBackendAcknowledged,
                    step: step ? (step.trim().toLowerCase() === 'en attente' ? 'En cours...' : step.replace(/en attente/gi, 'En cours')) : undefined,
                    percentage: typeof pct === 'number' ? pct : undefined,
                    processed: res?.progress?.processedRecords,
                    total: res?.progress?.totalRecords,
                    matchesCount: res?.progress?.matchesCount,
                    boOnlyCount: res?.progress?.boOnlyCount,
                    partnerRemaining: res?.progress?.partnerRemaining
                };
            }),
            catchError(() => of({ acknowledged: false }))
        );
    }

    /**
     * Nettoie l'étape de progression
     */
    sanitizeStep(step: string): string {
        const trimmed = step.trim();
        if (!trimmed || /^en attente$/i.test(trimmed)) {
            return 'En cours...';
        }
        return trimmed.replace(/en attente/gi, 'En cours');
    }
}