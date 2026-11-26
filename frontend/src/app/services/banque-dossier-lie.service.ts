import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable, tap } from 'rxjs';
import {
  DossierDetail, DossierLigneRef, DossierResume, DossierTypeLigne, dossierLigneKey
} from '../utils/banque-dossier-lie.util';

export interface DossierSaveRequest {
  libelle: string;
  commentaire?: string | null;
  lignes: DossierLigneRef[];
  /** Retire des autres dossiers les lignes qui y sont déjà. */
  deplacer?: boolean;
}

/** Dossiers liés de la page Banque (↔ BanqueDossierLieController). Garde en mémoire la ligne → dossier. */
@Injectable({ providedIn: 'root' })
export class BanqueDossierLieService {
  private apiUrl = '/api/releve-bancaire/dossiers-lies';
  private parLigne = new Map<string, DossierResume>();
  readonly dossiers$ = new BehaviorSubject<DossierResume[]>([]);

  constructor(private http: HttpClient) {}

  refresh(): Observable<DossierResume[]> {
    return this.http.get<DossierResume[]>(this.apiUrl).pipe(tap(list => this.setCache(list || [])));
  }

  /** Dossier auquel appartient une ligne (null si aucune). */
  dossierOf(typeLigne: DossierTypeLigne, id: number | null | undefined): DossierResume | null {
    if (id == null) return null;
    return this.parLigne.get(dossierLigneKey(typeLigne, id)) || null;
  }

  detail(id: number): Observable<DossierDetail> {
    return this.http.get<DossierDetail>(`${this.apiUrl}/${id}`);
  }

  save(id: number | null, req: DossierSaveRequest): Observable<DossierResume> {
    return id == null
      ? this.http.post<DossierResume>(this.apiUrl, req)
      : this.http.put<DossierResume>(`${this.apiUrl}/${id}`, req);
  }

  delete(id: number): Observable<void> {
    return this.http.post<void>(`${this.apiUrl}/${id}/delete`, {});
  }

  private setCache(list: DossierResume[]): void {
    this.parLigne.clear();
    list.forEach(d => (d.lignes || []).forEach(l => this.parLigne.set(dossierLigneKey(l.typeLigne, l.ligneId), d)));
    this.dossiers$.next(list);
  }
}
