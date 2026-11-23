import { Injectable } from '@angular/core';
import { HttpClient, HttpContext, HttpHeaders } from '@angular/common/http';
import { Observable, forkJoin, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { Pays, ProfilPays } from '../models/pays.model';
import { SILENCE_PERMISSION_DENIED } from '../interceptors/auth.interceptor';
import { countryIsoCode, countryNameFromCode, countryNameKey } from '../utils/country-codes.util';

/** Pays toujours proposés avant un traitement (code → nom). */
export const PAYS_TRAITEMENT_PAR_DEFAUT: ReadonlyArray<{ code: string; nom: string }> = [
  { code: 'SN', nom: 'Sénégal' },
  { code: 'CI', nom: "Côte d'Ivoire" },
  { code: 'CITCH', nom: "Côte d'Ivoire" },
  { code: 'GN', nom: 'Guinée-Conakry' },
  { code: 'CM', nom: 'Cameroun' },
  { code: 'GA', nom: 'Gabon' },
  { code: 'ML', nom: 'Mali' },
  { code: 'BF', nom: 'Burkina Faso' },
  { code: 'KE', nom: 'Kenya' },
  { code: 'TZ', nom: 'Tanzanie' },
  { code: 'UG', nom: 'Ouganda' },
  { code: 'MR', nom: 'Mauritanie' },
  { code: 'GM', nom: 'Gambie' }
];

/** Codes de pays « filiale » rattachés à un pays (gardés distincts : règles propres par code). */
export const PAYS_TRAITEMENT_ALIAS_NOMS: Readonly<Record<string, string>> = {
  CITCH: "Côte d'Ivoire"
};

export interface PaysTraitement {
  code: string;
  nom: string;
}

/**
 * Liste des pays du traitement : pays par défaut (dans l'ordre ci-dessus), puis les pays
 * apparus dans les rapports de réconciliation enregistrés (triés). Le nom vient de la table
 * des pays quand il est connu, sinon le code seul.
 */
export function buildPaysTraitement(
  rapports: string[] | null | undefined,
  referentiel: Pays[] | null | undefined
): PaysTraitement[] {
  const noms = new Map<string, string>();
  for (const p of referentiel || []) {
    const code = (p.code || '').trim().toUpperCase();
    if (code && p.nom?.trim() && !noms.has(code)) {
      noms.set(code, p.nom.trim());
    }
  }
  const out = new Map<string, PaysTraitement>();
  for (const p of PAYS_TRAITEMENT_PAR_DEFAUT) {
    out.set(p.code, { ...p });
  }
  // Nom → code : un rapport peut porter le nom du pays (« Gabon », « SENEGAL ») au lieu du code.
  const codeParNom = new Map<string, string>();
  for (const p of PAYS_TRAITEMENT_PAR_DEFAUT) {
    if (!PAYS_TRAITEMENT_ALIAS_NOMS[p.code]) codeParNom.set(countryNameKey(p.nom), p.code);
  }
  noms.forEach((nom, code) => {
    if (!codeParNom.has(countryNameKey(nom))) codeParNom.set(countryNameKey(nom), code);
  });
  const versCode = (brut: string): string => {
    const upper = brut.toUpperCase();
    if (out.has(upper) || noms.has(upper) || PAYS_TRAITEMENT_ALIAS_NOMS[upper]) return upper;
    return codeParNom.get(countryNameKey(brut)) || countryIsoCode(brut) || upper;
  };
  const supplementaires = [...new Set((rapports || [])
    .map(c => String(c ?? '').trim())
    .filter(Boolean)
    .map(versCode)
    .filter(c => /^[A-Z0-9]{2,10}$/.test(c) && c !== 'GNL' && !out.has(c)))]
    .sort();
  for (const code of supplementaires) {
    out.set(code, { code, nom: PAYS_TRAITEMENT_ALIAS_NOMS[code] || noms.get(code) || countryNameFromCode(code) || '' });
  }
  return [...out.values()];
}

@Injectable({ providedIn: 'root' })
export class PaysService {
  private apiUrl = '/api/pays';

  constructor(private http: HttpClient) {}

  private buildContextHeaders(moduleContext?: string): HttpHeaders | undefined {
    return moduleContext ? new HttpHeaders({ 'X-Permission-Module': moduleContext }) : undefined;
  }

  /**
   * Pays proposés avant un traitement : pays par défaut + pays des rapports de réconciliation.
   * Une source indisponible (droits) est ignorée sans pop-up : la liste par défaut reste toujours
   * proposée (ex. profil agent TRX sans « consulter_pays » dans le module Profil).
   */
  getPaysTraitement(): Observable<PaysTraitement[]> {
    const context = new HttpContext().set(SILENCE_PERMISSION_DENIED, true);
    const rapports$ = this.http.get<{ countries?: string[] }>('/api/result8rec/filters', { context }).pipe(
      map(r => r?.countries || []),
      catchError(() => of([] as string[]))
    );
    const referentiel$ = this.http.get<Pays[]>(this.apiUrl, { context }).pipe(catchError(() => of([] as Pays[])));
    return forkJoin([rapports$, referentiel$]).pipe(
      map(([rapports, referentiel]) => buildPaysTraitement(rapports, referentiel))
    );
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

