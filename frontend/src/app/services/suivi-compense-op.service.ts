import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { postFormWithProgress } from '../utils/upload-with-progress.util';
import { SuiviCompenseOp, SuiviCompenseOpCreateRequest, SuiviCompenseOpUpdateRequest, SuiviCompenseOpUploadResponse } from '../models/suivi-compense-op.model';

@Injectable({ providedIn: 'root' })
export class SuiviCompenseOpService {
  private apiUrl = '/api/banque/suivi-compense-op';

  constructor(private http: HttpClient) {}

  list(): Observable<SuiviCompenseOp[]> {
    return this.http.get<SuiviCompenseOp[]>(this.apiUrl);
  }

  /** Import avec pourcentage d'envoi (pop-up de progression). */
  uploadWithProgress(file: File, onProgress?: (percent: number) => void): Promise<SuiviCompenseOpUploadResponse> {
    const form = new FormData();
    form.append('file', file);
    return postFormWithProgress<SuiviCompenseOpUploadResponse>(this.http, this.apiUrl + '/upload', form, onProgress);
  }

  upload(file: File): Observable<SuiviCompenseOpUploadResponse> {
    const form = new FormData();
    form.append('file', file);
    return this.http.post<SuiviCompenseOpUploadResponse>(`${this.apiUrl}/upload`, form);
  }

  downloadTemplate(): Observable<Blob> {
    return this.http.get(`${this.apiUrl}/template`, { responseType: 'blob' });
  }

  /** Ajout manuel d'une ligne ; la référence est générée côté serveur. */
  create(request: SuiviCompenseOpCreateRequest): Observable<SuiviCompenseOp> {
    return this.http.post<SuiviCompenseOp>(this.apiUrl, request);
  }

  update(id: number, request: SuiviCompenseOpUpdateRequest): Observable<SuiviCompenseOp> {
    return this.http.put<SuiviCompenseOp>(`${this.apiUrl}/${id}`, request);
  }

  delete(id: number): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/${id}`);
  }
}
