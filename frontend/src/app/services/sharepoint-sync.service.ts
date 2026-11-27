import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

/** Configuration > Synchronisation SharePoint (backend SharepointSyncController). */
export interface SharepointSyncConfig {
  enabled: boolean;
  heuresExecution: string;
  azureTenantId: string | null;
  clientId: string | null;
  clientSecretDefini: boolean;
  lastAutoRunAt: string | null;
  prochainLancement: string | null;
  schedulerActif: boolean;
  updatedAt: string | null;
  updatedBy: string | null;
}

export interface SharepointSyncConfigRequest {
  enabled: boolean;
  heuresExecution: string;
  azureTenantId: string | null;
  clientId: string | null;
  /** Vide : secret inchangé. */
  clientSecret?: string | null;
  effacerSecret?: boolean;
}

export interface SharepointSyncSource {
  id: number;
  libelle: string;
  url: string;
  filePattern: string;
  sheetClient: string | null;
  sheetFournisseur: string | null;
  enabled: boolean;
  lastFileId: string | null;
  lastFileName: string | null;
  /** Index Excel 0-based de la dernière ligne chargée. */
  lastRowClient: number | null;
  lastRowFournisseur: number | null;
  lastRunAt: string | null;
  lastStatus: string | null;
  lastMessage: string | null;
}

export interface SharepointSyncSourceRequest {
  libelle: string;
  url: string;
  filePattern: string;
  sheetClient: string;
  sheetFournisseur: string;
  enabled: boolean;
}

export interface SharepointSheetReport {
  feuille: string;
  feuilleTrouvee: string | null;
  lignesExaminees: number;
  aCharger: number;
  chargees: number;
  doublons: number;
  horsMois: number;
  incompletes: number;
  curseurReinitialise: boolean;
  erreur: string | null;
}

export interface SharepointSourceReport {
  sourceId: number;
  libelle: string;
  status: string;
  fichier: string | null;
  fichierUrl: string | null;
  fichierModifie: string | null;
  mois: string | null;
  fichiersTrouves: number;
  feuilles: SharepointSheetReport[];
  message: string;
  test: boolean;
}

export interface SharepointSyncRun {
  id: number;
  sourceId: number | null;
  sourceLibelle: string | null;
  declencheur: string;
  utilisateur: string | null;
  startedAt: string;
  endedAt: string | null;
  fileName: string | null;
  status: string;
  lignesLues: number;
  lignesChargees: number;
  doublons: number;
  horsMois: number;
  message: string | null;
}

@Injectable({ providedIn: 'root' })
export class SharepointSyncService {
  private readonly apiUrl = '/api/configuration/sharepoint-sync';

  constructor(private http: HttpClient) {}

  getConfig(): Observable<SharepointSyncConfig> {
    return this.http.get<SharepointSyncConfig>(this.apiUrl);
  }

  saveConfig(req: SharepointSyncConfigRequest): Observable<SharepointSyncConfig> {
    return this.http.put<SharepointSyncConfig>(this.apiUrl, req);
  }

  testConnexion(): Observable<{ message: string }> {
    return this.http.post<{ message: string }>(`${this.apiUrl}/test-connexion`, {});
  }

  listSources(): Observable<SharepointSyncSource[]> {
    return this.http.get<SharepointSyncSource[]>(`${this.apiUrl}/sources`);
  }

  createSource(req: SharepointSyncSourceRequest): Observable<SharepointSyncSource> {
    return this.http.post<SharepointSyncSource>(`${this.apiUrl}/sources`, req);
  }

  updateSource(id: number, req: SharepointSyncSourceRequest): Observable<SharepointSyncSource> {
    return this.http.put<SharepointSyncSource>(`${this.apiUrl}/sources/${id}`, req);
  }

  deleteSource(id: number): Observable<unknown> {
    return this.http.delete(`${this.apiUrl}/sources/${id}`);
  }

  resetCursor(id: number): Observable<SharepointSyncSource> {
    return this.http.post<SharepointSyncSource>(`${this.apiUrl}/sources/${id}/reset-curseur`, {});
  }

  testSource(id: number): Observable<SharepointSourceReport> {
    return this.http.post<SharepointSourceReport>(`${this.apiUrl}/sources/${id}/tester`, {});
  }

  runSource(id: number): Observable<SharepointSourceReport[]> {
    return this.http.post<SharepointSourceReport[]>(`${this.apiUrl}/sources/${id}/executer`, {});
  }

  runAll(): Observable<SharepointSourceReport[]> {
    return this.http.post<SharepointSourceReport[]>(`${this.apiUrl}/executer`, {});
  }

  history(): Observable<SharepointSyncRun[]> {
    return this.http.get<SharepointSyncRun[]>(`${this.apiUrl}/historique`);
  }
}
