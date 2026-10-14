import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { TranslateLoader } from '@ngx-translate/core';
import { Observable, of } from 'rxjs';
import { catchError } from 'rxjs/operators';

/**
 * Charge les fichiers de traduction depuis /assets/i18n/<lang>.json.
 *
 * Implémentation maison plutôt que @ngx-translate/http-loader afin d'éviter une
 * dépendance supplémentaire : la seule opération nécessaire est un GET.
 *
 * En cas de fichier absent ou illisible, on renvoie un objet vide : la langue de
 * repli (le français) prend alors le relais au lieu de casser l'application.
 *
 * @Injectable est indispensable : la classe est fournie via `useClass`, et sans
 * décorateur Angular ne sait pas résoudre HttpClient (erreur NG0204 au
 * démarrage, que la compilation AOT ne remonte pas).
 */
@Injectable()
export class TranslationsLoader implements TranslateLoader {
  constructor(private readonly http: HttpClient) {}

  getTranslation(lang: string): Observable<any> {
    return this.http.get(`assets/i18n/${lang}.json`).pipe(
      catchError(() => of({}))
    );
  }
}
