import { Injectable } from '@angular/core';
import { HttpClient, HttpEventType, HttpRequest } from '@angular/common/http';

/** Résultat de la séparation : zip des feuilles et nombre de feuilles. */
export interface SeparationFeuillesResultat {
  blob: Blob;
  nombreFeuilles: number;
}

/** Séparation des feuilles d'un classeur, traitée par le serveur. */
@Injectable({ providedIn: 'root' })
export class TraitementFeuillesService {
  private readonly apiUrl = this.urlApi();

  constructor(private http: HttpClient) {}

  /**
   * En développement (Angular sur localhost:4200), la réponse zip passe directement vers le backend
   * (port 8085) : le proxy de développement ne transmet pas correctement les réponses volumineuses.
   * Ailleurs, on garde l'URL relative.
   */
  private urlApi(): string {
    const { hostname, port } = window.location;
    if (hostname === 'localhost' && port === '4200') {
      return 'http://localhost:8085/api/traitement/feuilles';
    }
    return '/api/traitement/feuilles';
  }

  /**
   * Envoie le classeur et les options d'en-tête / largeurs. `onProgress` reçoit le pourcentage
   * d'envoi ; la réponse (zip avec une feuille par fichier .xlsx) arrive ensuite.
   */
  separer(
    fichier: File,
    entete: string[],
    appliquerEntete: boolean,
    largeurs: number[],
    onProgress?: (percent: number) => void
  ): Promise<SeparationFeuillesResultat> {
    const form = new FormData();
    form.append('file', fichier, fichier.name);
    entete.forEach(col => form.append('entete', col));
    form.append('appliquerEntete', String(appliquerEntete));
    largeurs.forEach(l => form.append('largeurs', String(l)));

    return new Promise<SeparationFeuillesResultat>((resolve, reject) => {
      const req = new HttpRequest('POST', `${this.apiUrl}/separer`, form, {
        reportProgress: true,
        responseType: 'blob',
        withCredentials: true
      });
      this.http.request(req).subscribe({
        next: event => {
          if (event.type === HttpEventType.UploadProgress && event.total) {
            onProgress?.(Math.round((100 * event.loaded) / event.total));
          } else if (event.type === HttpEventType.Response) {
            resolve({
              blob: event.body as Blob,
              nombreFeuilles: Number(event.headers.get('X-Nombre-Feuilles') ?? 0)
            });
          }
        },
        error: err => reject(err)
      });
    });
  }
}
