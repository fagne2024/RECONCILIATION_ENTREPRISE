import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';
import { SuiviEcart } from '../models/suivi-ecart.model';

@Injectable({
  providedIn: 'root'
})
export class SuiviEcartService {
  private apiUrl = '/api/suivi-ecart';

  constructor(private http: HttpClient) { }

  getAll(): Observable<SuiviEcart[]> {
    return this.http.get<SuiviEcart[]>(this.apiUrl);
  }

  getById(id: number): Observable<SuiviEcart> {
    return this.http.get<SuiviEcart>(`${this.apiUrl}/${id}`);
  }

  create(suiviEcart: SuiviEcart): Observable<SuiviEcart> {
    return this.http.post<SuiviEcart>(this.apiUrl, suiviEcart);
  }

  update(id: number, suiviEcart: SuiviEcart): Observable<SuiviEcart> {
    return this.http.put<SuiviEcart>(`${this.apiUrl}/${id}`, suiviEcart);
  }

  delete(id: number): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/${id}`);
  }

  uploadFile(file: File): Observable<any> {
    const formData = new FormData();
    formData.append('file', file);

    return this.http.post(`${this.apiUrl}/upload`, formData);
  }
}

