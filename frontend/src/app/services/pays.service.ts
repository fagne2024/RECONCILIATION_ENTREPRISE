import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';
import { Pays, ProfilPays } from '../models/pays.model';

@Injectable({ providedIn: 'root' })
export class PaysService {
  private apiUrl = '/api/pays';

  constructor(private http: HttpClient) {}

  private buildContextHeaders(moduleContext?: string): HttpHeaders | undefined {
    return moduleContext ? new HttpHeaders({ 'X-Permission-Module': moduleContext }) : undefined;
  }

  // CRUD Pays
  getPays(moduleContext?: string): Observable<Pays[]> {
    return this.http.get<Pays[]>(this.apiUrl, {
      headers: this.buildContextHeaders(moduleContext)
    });
  }

  getPaysById(id: number): Observable<Pays> {
    return this.http.get<Pays>(`${this.apiUrl}/${id}`);
  }

  createPays(pays: Pays): Observable<Pays> {
    return this.http.post<Pays>(this.apiUrl, pays);
  }

  updatePays(id: number, pays: Pays): Observable<Pays> {
    return this.http.put<Pays>(`${this.apiUrl}/${id}`, pays);
  }

  deletePays(id: number): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/${id}`);
  }

  // Gestion des associations Profil-Pays
  getPaysForProfil(profilId: number): Observable<ProfilPays[]> {
    return this.http.get<ProfilPays[]>(`${this.apiUrl}/profil/${profilId}`);
  }

  associatePaysToProfil(profilId: number, paysId: number): Observable<ProfilPays> {
    return this.http.post<ProfilPays>(`${this.apiUrl}/profil/${profilId}/associate/${paysId}`, {});
  }

  disassociatePaysFromProfil(profilId: number, paysId: number): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/profil/${profilId}/disassociate/${paysId}`);
  }

  setPaysForProfil(profilId: number, paysIds: number[]): Observable<void> {
    return this.http.put<void>(`${this.apiUrl}/profil/${profilId}/set-pays`, paysIds);
  }

  hasAccessToPays(profilId: number, paysCode: string): Observable<{ hasAccess: boolean }> {
    return this.http.get<{ hasAccess: boolean }>(`${this.apiUrl}/profil/${profilId}/has-access/${paysCode}`);
  }

  /**
   * Récupère les codes de pays autorisés pour l'utilisateur connecté
   * Retourne null si l'utilisateur a accès à GNL (tous les pays)
   * Retourne une liste vide si l'utilisateur n'a aucun pays autorisé
   */
  getAllowedPaysCodesForCurrentUser(): Observable<{ isGlobal: boolean; codes: string[] | null; names: string[] | null }> {
    return this.http.get<{ isGlobal: boolean; codes: string[] | null; names: string[] | null }>(
      `${this.apiUrl}/user/allowed-codes`
    );
  }
}

