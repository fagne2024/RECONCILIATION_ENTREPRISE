import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';
import { findNavigationAccessContextByRoute } from '../constants/app-navigation-catalog';

/** Ligne persistée du suivi des transactions à annuler. */
export interface SuiviTrxAnnulerRow {
  id?: number;
  matchKey?: string;
  boDate?: string | null;
  boAgence?: string | null;
  boService?: string | null;
  boMontant?: string | null;
  boToken?: string | null;
  boPays?: string | null;
  boEnv?: string | null;
  boTelephone?: string | null;
  boStatut?: string | null;
  partnerTransactionId?: string | null;
  partnerDate?: string | null;
  partnerMontant?: string | null;
  idAnnulation?: string | null;
  partnerTelephone?: string | null;
  statut?: string;
  statutPart?: string | null;
  createdBy?: string;
  updatedBy?: string;
  createdAt?: string;
  updatedAt?: string;
}

@Injectable({
  providedIn: 'root'
})
export class SuiviTrxAnnulerService {
  private readonly apiUrl = '/api/suivi-trx-a-annuler';

  constructor(
    private http: HttpClient
  ) {}

  /**
   * Le sous-menu Suivi TRX à annuler porte ses propres droits : on les envoie
   * même lorsque l'enregistrement est déclenché depuis /matches ou
   * /ecart-partner. Le contexte de navigation de la page appelante est utilisé
   * pour que les droits du sous-menu courant s'appliquent (repli serveur sur
   * Résultats pour les écritures).
   */
  private getPermissionHeaders(contextRoute = '/suivi-trx-a-annuler'): HttpHeaders | undefined {
    const moduleContext = findNavigationAccessContextByRoute(contextRoute)?.accessModuleName
      || findNavigationAccessContextByRoute('/suivi-trx-a-annuler')?.accessModuleName;
    return moduleContext ? new HttpHeaders({ 'X-Permission-Module': moduleContext }) : undefined;
  }

  getAll(contextRoute?: string): Observable<SuiviTrxAnnulerRow[]> {
    return this.http.get<SuiviTrxAnnulerRow[]>(this.apiUrl, { headers: this.getPermissionHeaders(contextRoute) });
  }

  /**
   * Création ou mise à jour : le backend fait un upsert par id, sinon par
   * matchKey, afin qu'un même match ne soit jamais enregistré deux fois.
   */
  save(row: SuiviTrxAnnulerRow, contextRoute?: string): Observable<SuiviTrxAnnulerRow> {
    return this.http.post<SuiviTrxAnnulerRow>(this.apiUrl, row, { headers: this.getPermissionHeaders(contextRoute) });
  }

  update(id: number, row: SuiviTrxAnnulerRow, contextRoute?: string): Observable<SuiviTrxAnnulerRow> {
    return this.http.put<SuiviTrxAnnulerRow>(`${this.apiUrl}/${id}`, row, { headers: this.getPermissionHeaders(contextRoute) });
  }

  delete(id: number, contextRoute?: string): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/${id}`, { headers: this.getPermissionHeaders(contextRoute) });
  }
}
