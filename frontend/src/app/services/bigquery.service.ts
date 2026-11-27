import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, map } from 'rxjs';

/** Configuration > BigQuery (backend BigQueryConfigController). */
export interface BigQueryConfig {
  enabled: boolean;
  heuresExecution: string;
  projectId: string | null;
  location: string | null;
  serviceAccountEmail: string | null;
  cleDefinie: boolean;
  partnerSubfolder: string;
  maxRows: number;
  dossierPartenaires: string | null;
  lastAutoRunAt: string | null;
  prochainLancement: string | null;
  schedulerActif: boolean;
  updatedAt: string | null;
  updatedBy: string | null;
}

export interface BigQueryConfigRequest {
  enabled: boolean;
  heuresExecution: string;
  projectId: string | null;
  location: string | null;
  /** Vide : clé inchangée. */
  serviceAccountJson?: string | null;
  effacerCle?: boolean;
  partnerSubfolder: string;
  maxRows: number;
}

export interface BigQueryQuery {
  id: number;
  libelle: string;
  sqlText: string;
  boFilePrefix: string;
  enabled: boolean;
}

export interface BigQueryQueryRequest {
  libelle: string;
  sqlText: string;
  boFilePrefix: string;
  enabled: boolean;
}

export interface BigQueryDryRun {
  colonnes: string[];
  octetsLus: number;
  fichierBo: string;
}

export interface BigQueryExtract {
  id: number;
  queryId: number | null;
  queryLibelle: string | null;
  dateParam: string | null;
  declencheur: string;
  utilisateur: string | null;
  startedAt: string;
  endedAt: string | null;
  status: string;
  rowCount: number;
  fileName: string | null;
  fileBytes: number | null;
  message: string | null;
}

/** Extraction prête pour le Lanceur. */
export interface BigQueryReadyExtract {
  extractId: number;
  queryId: number;
  libelle: string;
  fileName: string;
  dateParam: string;
  rowCount: number;
  fileBytes: number | null;
  preparedAt: string;
  declencheur: string;
}

export interface BigQueryLauncherQuery {
  id: number;
  libelle: string;
  boFilePrefix: string;
}

export interface BigQueryPartnerFile {
  fileName: string;
  size: number;
  lastModified: string;
}

@Injectable({ providedIn: 'root' })
export class BigQueryService {
  private readonly configUrl = '/api/configuration/bigquery';
  private readonly launcherUrl = '/api/reconciliation-launcher/bigquery';

  constructor(private http: HttpClient) {}

  // ----------------------------------------------------------------- Configuration (admin)

  getConfig(): Observable<BigQueryConfig> {
    return this.http.get<BigQueryConfig>(this.configUrl);
  }

  saveConfig(req: BigQueryConfigRequest): Observable<BigQueryConfig> {
    return this.http.put<BigQueryConfig>(this.configUrl, req);
  }

  testConnexion(): Observable<{ message: string }> {
    return this.http.post<{ message: string }>(`${this.configUrl}/test-connexion`, {});
  }

  listQueries(): Observable<BigQueryQuery[]> {
    return this.http.get<BigQueryQuery[]>(`${this.configUrl}/requetes`);
  }

  createQuery(req: BigQueryQueryRequest): Observable<BigQueryQuery> {
    return this.http.post<BigQueryQuery>(`${this.configUrl}/requetes`, req);
  }

  updateQuery(id: number, req: BigQueryQueryRequest): Observable<BigQueryQuery> {
    return this.http.put<BigQueryQuery>(`${this.configUrl}/requetes/${id}`, req);
  }

  deleteQuery(id: number): Observable<unknown> {
    return this.http.delete(`${this.configUrl}/requetes/${id}`);
  }

  dryRun(id: number, date: string | null): Observable<BigQueryDryRun> {
    const params = date ? new HttpParams().set('date', date) : undefined;
    return this.http.post<BigQueryDryRun>(`${this.configUrl}/requetes/${id}/verifier`, {}, { params });
  }

  history(): Observable<BigQueryExtract[]> {
    return this.http.get<BigQueryExtract[]>(`${this.configUrl}/historique`);
  }

  // ----------------------------------------------------------------- Lanceur

  launcherQueries(): Observable<BigQueryLauncherQuery[]> {
    return this.http.get<BigQueryLauncherQuery[]>(`${this.launcherUrl}/requetes`);
  }

  readyExtracts(): Observable<BigQueryReadyExtract[]> {
    return this.http.get<BigQueryReadyExtract[]>(`${this.launcherUrl}/extractions`);
  }

  extractNow(queryId: number, date: string | null): Observable<BigQueryExtract> {
    const params = date ? new HttpParams().set('date', date) : undefined;
    return this.http.post<BigQueryExtract>(`${this.launcherUrl}/requetes/${queryId}/extraire`, {}, { params });
  }

  /** Fichier CSV d'une extraction, prêt à être utilisé comme fichier BO. */
  extractFile(extractId: number, fileName: string): Observable<File> {
    return this.http.get(`${this.launcherUrl}/extractions/${extractId}/fichier`, { responseType: 'blob' })
      .pipe(map(blob => new File([blob], fileName, { type: 'text/csv' })));
  }

  partnerFiles(): Observable<BigQueryPartnerFile[]> {
    return this.http.get<BigQueryPartnerFile[]>(`${this.launcherUrl}/partenaires`);
  }

  /** Fichier partenaire (les classeurs Excel sont convertis en CSV par le serveur). */
  partnerFile(fileName: string): Observable<File> {
    const params = new HttpParams().set('nom', fileName);
    const csvName = fileName.replace(/\.xlsx?$/i, '.csv');
    return this.http.get(`${this.launcherUrl}/partenaires/fichier`, { params, responseType: 'blob' })
      .pipe(map(blob => new File([blob], csvName, { type: 'text/csv' })));
  }
}
