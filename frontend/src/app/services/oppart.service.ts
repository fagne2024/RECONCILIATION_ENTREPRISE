import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { Oppart, OppartBatchResult, OppartFilter, OppartLigneVerification, OppartLigneVerificationResult, OppartLinkResult, OppartUploadResult, OppartValidationResult } from '../models/oppart.model';

@Injectable({
  providedIn: 'root'
})
export class OppartService {
  private apiUrl = '/api';

  constructor(private http: HttpClient) {}

  getOpparts(filter?: OppartFilter): Observable<Oppart[]> {
    let params = new HttpParams();
    if (filter) {
      if (filter.client) params = params.set('client', filter.client);
      if (filter.typeOp) params = params.set('typeOp', filter.typeOp);
      if (filter.typeOpContains) params = params.set('typeOpContains', filter.typeOpContains);
      if (filter.pays) params = params.set('pays', filter.pays);
      if (filter.source) params = params.set('source', filter.source);
      if (filter.statut) params = params.set('statut', filter.statut);
      if (filter.token) params = params.set('token', filter.token);
      if (filter.dateDebut) params = params.set('dateDebut', filter.dateDebut);
      if (filter.dateFin) params = params.set('dateFin', filter.dateFin);
    }
    return this.http.get<Oppart[]>(`${this.apiUrl}/oppart`, { params });
  }

  getOppart(id: number): Observable<Oppart | null> {
    return this.http.get<Oppart>(`${this.apiUrl}/oppart/${id}`).pipe(
      catchError(() => of(null))
    );
  }

  createOppart(oppart: Omit<Oppart, 'id'>): Observable<Oppart> {
    return this.http.post<Oppart>(`${this.apiUrl}/oppart`, oppart);
  }

  /** Créer plusieurs lignes OPPART en une requête (évite 429 Too Many Requests). */
  createOppartBatch(opparts: Omit<Oppart, 'id'>[]): Observable<OppartBatchResult> {
    return this.http.post<OppartBatchResult>(`${this.apiUrl}/oppart/batch`, opparts);
  }

  updateOppart(id: number, oppart: Partial<Oppart>): Observable<Oppart> {
    return this.http.put<Oppart>(`${this.apiUrl}/oppart/${id}`, oppart);
  }

  deleteOppart(id: number): Observable<boolean> {
    return this.http.delete(`${this.apiUrl}/oppart/${id}`).pipe(
      map(() => true),
      catchError(() => of(false))
    );
  }

  deleteOpparts(ids: number[]): Observable<{ success: boolean; deletedCount: number; errors: string[] }> {
    return this.http.post<{ success: boolean; deletedCount: number; errors: string[] }>(
      `${this.apiUrl}/oppart/delete-batch`,
      { ids }
    );
  }

  getFilterOptions(): Observable<{
    clients: string[];
    typeOps: string[];
    pays: string[];
    sources: string[];
    statuts: string[];
  }> {
    return this.http.get<{
      clients: string[];
      typeOps: string[];
      pays: string[];
      sources: string[];
      statuts: string[];
    }>(`${this.apiUrl}/oppart/filter-options`);
  }

  /** Change le statut d'une ligne (EN_COURS / OK). */
  updateStatut(id: number, statut: string): Observable<Oppart> {
    return this.http.put<Oppart>(`${this.apiUrl}/oppart/${id}/statut`, { statut });
  }

  /**
   * Vérifie des lignes concernées dans OPPPART : retrouve la ligne et son statut,
   * par N° trans GU ou à défaut par montant + date + client.
   */
  verifierLignes(lignes: OppartLigneVerification[]): Observable<OppartLigneVerificationResult[]> {
    return this.http.post<OppartLigneVerificationResult[]>(`${this.apiUrl}/oppart/verification-lignes`, { lignes });
  }

  /**
   * Lie 2 lignes via un token commun. Si `token` est omis, le backend en génère un.
   * Les 2 lignes passent automatiquement au statut OK.
   */
  linkOpparts(id1: number, id2: number, token?: string): Observable<OppartLinkResult> {
    return this.http.post<OppartLinkResult>(`${this.apiUrl}/oppart/link`, { id1, id2, token });
  }

  /**
   * Lie un groupe de lignes (2 ou plus) via un token commun : utilisé par la recherche
   * de correspondance par agrégation (somme de N lignes = 1 ligne).
   * Toutes les lignes passent automatiquement au statut OK.
   */
  linkOppartsByIds(ids: number[], token?: string): Observable<OppartLinkResult> {
    return this.http.post<OppartLinkResult>(`${this.apiUrl}/oppart/link`, { ids, token });
  }

  /** Délier une ligne : token supprimé, statut remis à EN_COURS. */
  unlinkOppart(id: number): Observable<Oppart> {
    return this.http.post<Oppart>(`${this.apiUrl}/oppart/${id}/unlink`, {});
  }

  /**
   * Lie les lignes de compense par N° Trans GU.
   * Body : { transGus: string[] }
   * Retourne : { success, linkedCount, skippedCount, totalRequested, details }
   */
  linkCompensesByTransGu(transGus: string[]): Observable<{
    success: boolean;
    linkedCount: number;
    skippedCount: number;
    totalRequested: number;
    details: Array<{
      transGu: string;
      status: string;
      message?: string;
      token?: string;
      ids?: number[];
      foundCount?: number;
    }>;
  }> {
    return this.http.post<{
      success: boolean;
      linkedCount: number;
      skippedCount: number;
      totalRequested: number;
      details: Array<{
        transGu: string;
        status: string;
        message?: string;
        token?: string;
        ids?: number[];
        foundCount?: number;
      }>;
    }>(`${this.apiUrl}/oppart/link-compenses`, { transGus });
  }

  /** Analyse un fichier sans l'enregistrer : résumé + aperçu pour validation. */
  validateOppartFile(file: File): Observable<OppartValidationResult> {
    const formData = new FormData();
    formData.append('file', file);
    return this.http.post<OppartValidationResult>(`${this.apiUrl}/oppart/validate`, formData);
  }

  /** Importe un fichier. Les lignes invalides et les doublons sont ignorés. */
  uploadOppartFile(file: File): Observable<OppartUploadResult> {
    const formData = new FormData();
    formData.append('file', file);
    return this.http.post<OppartUploadResult>(`${this.apiUrl}/oppart/upload`, formData);
  }

  /** Modèle XLSX d'import OPPART. */
  downloadTemplate(): Observable<Blob> {
    return this.http.get(`${this.apiUrl}/oppart/template`, { responseType: 'blob' });
  }
}