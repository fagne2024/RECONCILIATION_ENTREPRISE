import { Injectable } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { BehaviorSubject, Observable, of } from 'rxjs';
import { catchError } from 'rxjs/operators';

export interface AvailableLanguage {
  code: string;
  label: string;
}

/** Langues proposées dans le sélecteur. `fr` reste la référence de contenu. */
export const AVAILABLE_LANGUAGES: AvailableLanguage[] = [
  { code: 'fr', label: 'Français' },
  { code: 'en', label: 'English' }
];

export const DEFAULT_LANGUAGE = 'fr';
export const FALLBACK_LANGUAGE = 'fr';
const STORAGE_KEY = 'reconciliation.lang';

/**
 * Point d'entrée unique du changement de langue.
 *
 * - mémorise le choix dans localStorage pour survivre aux rechargements ;
 * - garde le HTML `lang` synchronisé (accessibilité, saisie de navigateur,
 *   formats de date par défaut) ;
 * - expose une fonction de traduction utilisable depuis du code non Angular
 *   (méthodes statiques comme ModernPopupComponent.showConfirm) ;
 * - gère le repli : une clé absente en anglais retombe sur le français, et non
 *   sur l'affichage de la clé brute.
 */
@Injectable({ providedIn: 'root' })
export class I18nService {
  private static instance: I18nService | null = null;
  private static pendingLanguage: string = readStoredLanguage() ?? DEFAULT_LANGUAGE;

  private ready = false;
  private readonly initialLoad: Promise<void>;

  private readonly langSubject = new BehaviorSubject<string>(
    readStoredLanguage() ?? DEFAULT_LANGUAGE
  );

  constructor(private readonly translate: TranslateService) {
    I18nService.instance = this;

    this.translate.setDefaultLang(FALLBACK_LANGUAGE);

    const initial = readStoredLanguage() ?? DEFAULT_LANGUAGE;
    this.langSubject.next(initial);
    this.initialLoad = this.translate
      .use(initial)
      .pipe(catchError(() => of(initial)))
      .toPromise()
      .then(() => {
        this.ready = true;
        this.syncDocumentLang(initial);
      });
  }

  /** Langue active, émise à chaque changement (utilisée avec l'async pipe). */
  get lang$(): Observable<string> {
    return this.langSubject.asObservable();
  }

  get languages(): AvailableLanguage[] {
    return AVAILABLE_LANGUAGES;
  }

  get current(): string {
    return this.translate.currentLang || FALLBACK_LANGUAGE;
  }

  get isReady(): boolean {
    return this.ready;
  }

  /** Langue à utiliser au tout premier démarrage, lisible avant l'injection du service. */
  static get bootstrapLanguage(): string {
    return I18nService.pendingLanguage;
  }

  /** Langue active, lisible sans injection (formatage de dates, Intl…). */
  static get currentLanguage(): string {
    return I18nService.instance?.translate.currentLang || I18nService.pendingLanguage || FALLBACK_LANGUAGE;
  }

  /**
   * Bloque le démarrage de l'application jusqu'à ce que le catalogue de la langue
   * initiale soit chargé.
   *
   * Sans cela, le premier rendu s'effectue avec un dictionnaire vide : les
   * interpolations affichent `''`, puis la valeur traduite arrive une fois le HTTP
   * terminé. En mode développement, Angular compare les deux passes et lève
   * NG0100 (ExpressionChangedAfterItHasBeenCheckedError) sur chaque liaison.
   * Branché sur APP_INITIALIZER, le composant racine n'est jamais instancié avant
   * que le dictionnaire soit disponible, donc la première passe est déjà correcte.
   */
  whenReady(): Promise<void> {
    return this.initialLoad;
  }

  use(lang: string): void {
    if (!this.isSupported(lang) || lang === this.translate.currentLang) {
      return;
    }
    this.translate.use(lang).subscribe(() => {
      writeStoredLanguage(lang);
      this.langSubject.next(lang);
      this.syncDocumentLang(lang);
    });
  }

  isSupported(lang: string): boolean {
    return AVAILABLE_LANGUAGES.some((l) => l.code === lang);
  }

  labelOf(lang: string): string {
    return AVAILABLE_LANGUAGES.find((l) => l.code === lang)?.label ?? lang;
  }

  /**
   * Traduit une clé depuis du code hors gabarit (méthodes statiques, services
   * sans injection). Renvoie la clé brute si aucune traduction n'est disponible.
   */
  static t(key: string, params?: Record<string, unknown>): string {
    const service = I18nService.instance;
    if (!service) {
      return key;
    }
    return service.translate.instant(key, params);
  }

  private syncDocumentLang(lang: string): void {
    if (typeof document !== 'undefined' && document.documentElement) {
      document.documentElement.lang = lang;
    }
  }
}

function readStoredLanguage(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function writeStoredLanguage(lang: string): void {
  try {
    localStorage.setItem(STORAGE_KEY, lang);
  } catch {
    /* stockage indisponible (mode privé) : la langue restera celle de la session */
  }
}
