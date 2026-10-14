import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { UserLog, UserLogFilter } from '../models/user-log.model';
import { AppStateService } from './app-state.service';

@Injectable({
  providedIn: 'root'
})
export class UserLogService {
  private apiUrl = '/api';

  constructor(private http: HttpClient, private appState: AppStateService) {}

  // Récupérer tous les logs avec filtres optionnels
  getLogs(filter?: UserLogFilter): Observable<UserLog[]> {
    let params = new HttpParams();
    
    if (filter) {
      if (filter.username) {
        params = params.set('username', filter.username);
      }
      if (filter.module) {
        params = params.set('module', filter.module);
      }
      if (filter.permission) {
        params = params.set('permission', filter.permission);
      }
      if (filter.dateDebut) {
        params = params.set('dateDebut', filter.dateDebut);
      }
      if (filter.dateFin) {
        params = params.set('dateFin', filter.dateFin);
      }
    }

    return this.http.get<UserLog[]>(`${this.apiUrl}/log-utilisateur`, { params });
  }

  // Récupérer un log par ID
  getLog(id: number): Observable<UserLog | null> {
    return this.http.get<UserLog>(`${this.apiUrl}/log-utilisateur/${id}`).pipe(
      catchError(() => of(null))
    );
  }

  /**
   * Enregistre une activité utilisateur (connexion, déconnexion, vue de page).
   * Envoie en fire-and-forget pour ne pas bloquer l'interface.
   */
  logActivity(permission: string, module: string, username: string, details?: string): void {
    // Le journal utilisateur est une donnée métier par entreprise : le compte
    // SUPER_ADMIN plateforme n'appartient à aucune entreprise, on ne journalise pas.
    if (this.appState.isSuperAdmin()) {
      return;
    }
    const payload: any = { permission, module, username };
    if (details) {
      payload.details = details;
    }
    this.http.post(`${this.apiUrl}/log-utilisateur/log-activity`, payload).pipe(
      catchError(() => of(null))
    ).subscribe();
  }
}

