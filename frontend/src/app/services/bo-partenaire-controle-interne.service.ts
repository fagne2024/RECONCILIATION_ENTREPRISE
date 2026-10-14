import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface BoPartenaireControleInterneRecord {
  id?: number;
  monthYyyyMm: string;
  country: string;
  env: string;
  service: string;
  statut: 'EN_COURS_VALIDATION' | 'VALIDE';
  validatedBy?: string;
  validatedAt?: string;
}

export interface BoPartenaireControleInterneValidatePayload {
  monthYyyyMm: string;
  country: string;
  env: string;
  service: string;
}

export interface BoPartenaireControleInterneCommentRecord {
  monthYyyyMm: string;
  country: string;
  env: string;
  commentaire: string;
  updatedBy?: string;
  updatedAt?: string;
  lastEmailedAt?: string;
  lastEmailedBy?: string;
}

export interface BoPartenaireControleInterneSendEmailPayload {
  monthYyyyMm: string;
  country: string;
  env: string;
  commentaire: string;
  recipients: string[];
  summaryText: string;
}

@Injectable({ providedIn: 'root' })
export class BoPartenaireControleInterneService {
  private readonly baseUrl = '/api/bo-partenaire-controle-interne';

  constructor(private http: HttpClient) {}

  list(params: {
    country: string;
    env: string;
    startMonth: string;
    endMonth: string;
  }): Observable<BoPartenaireControleInterneRecord[]> {
    const q = new URLSearchParams({
      country: params.country,
      env: params.env,
      startMonth: params.startMonth,
      endMonth: params.endMonth
    });
    return this.http.get<BoPartenaireControleInterneRecord[]>(`${this.baseUrl}?${q}`);
  }

  validate(payload: BoPartenaireControleInterneValidatePayload): Observable<BoPartenaireControleInterneRecord> {
    return this.http.post<BoPartenaireControleInterneRecord>(`${this.baseUrl}/validate`, payload);
  }

  revoke(payload: BoPartenaireControleInterneValidatePayload): Observable<BoPartenaireControleInterneRecord> {
    return this.http.post<BoPartenaireControleInterneRecord>(`${this.baseUrl}/revoke`, payload);
  }

  getComment(params: {
    country: string;
    env: string;
    monthYyyyMm: string;
  }): Observable<BoPartenaireControleInterneCommentRecord> {
    const q = new URLSearchParams({
      country: params.country,
      env: params.env,
      monthYyyyMm: params.monthYyyyMm
    });
    return this.http.get<BoPartenaireControleInterneCommentRecord>(`${this.baseUrl}/comment?${q}`);
  }

  saveComment(payload: {
    monthYyyyMm: string;
    country: string;
    env: string;
    commentaire: string;
  }): Observable<BoPartenaireControleInterneCommentRecord> {
    return this.http.put<BoPartenaireControleInterneCommentRecord>(`${this.baseUrl}/comment`, payload);
  }

  sendCommentEmail(payload: BoPartenaireControleInterneSendEmailPayload): Observable<{ message: string; comment: BoPartenaireControleInterneCommentRecord }> {
    return this.http.post<{ message: string; comment: BoPartenaireControleInterneCommentRecord }>(
      `${this.baseUrl}/send-email`,
      payload
    );
  }
}
