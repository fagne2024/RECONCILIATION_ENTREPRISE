import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { SuiviCompenseOp, SuiviCompenseOpUploadResponse } from '../models/suivi-compense-op.model';

@Injectable({ providedIn: 'root' })
export class SuiviCompenseOpService {
  private apiUrl = '/api/banque/suivi-compense-op';

  constructor(private http: HttpClient) {}

  list(): Observable<SuiviCompenseOp[]> {
    return this.http.get<SuiviCompenseOp[]>(this.apiUrl);
  }

  upload(file: File): Observable<SuiviCompenseOpUploadResponse> {
    const form = new FormData();
    form.append('file', file);
    return this.http.post<SuiviCompenseOpUploadResponse>(`${this.apiUrl}/upload`, form);
  }

  downloadTemplate(): Observable<Blob> {
    return this.http.get(`${this.apiUrl}/template`, { responseType: 'blob' });
  }

  delete(id: number): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/${id}`);
  }
}
