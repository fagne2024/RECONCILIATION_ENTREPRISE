import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable, of } from 'rxjs';
import { catchError } from 'rxjs/operators';

export interface LogoSettings {
  /** Hauteur max du logo en px */
  size: number;
  /** Alignement horizontal dans la sidebar */
  align: 'left' | 'center' | 'right';
  /** Décalage vertical en px */
  offsetY: number;
  /** Marges intérieures du bloc logo en px */
  paddingTop: number;
  paddingRight: number;
  paddingBottom: number;
  paddingLeft: number;
}

export const DEFAULT_LOGO_SETTINGS: LogoSettings = {
  size: 84,
  align: 'center',
  offsetY: 0,
  paddingTop: 0,
  paddingRight: 0,
  paddingBottom: 20,
  paddingLeft: 0
};

export function logoSettingsStyle(settings: LogoSettings): { [key: string]: string } {
  return {
    'max-height': settings.size + 'px',
    'margin-top': settings.offsetY + 'px',
    'margin-left': (settings.align === 'right' || settings.align === 'center') ? 'auto' : '0',
    'margin-right': (settings.align === 'left' || settings.align === 'center') ? 'auto' : '0'
  };
}

export function logoPaddingStyle(settings: LogoSettings): { [key: string]: string } {
  return {
    'padding-top': settings.paddingTop + 'px',
    'padding-right': settings.paddingRight + 'px',
    'padding-bottom': settings.paddingBottom + 'px',
    'padding-left': settings.paddingLeft + 'px'
  };
}

@Injectable({ providedIn: 'root' })
export class LogoService {

  private readonly apiUrl = '/api/configuration/logo';
  private readonly storageKey = 'app_logo_data_url';
  private readonly settingsStorageKey = 'app_logo_settings';

  readonly logo$ = new BehaviorSubject<string | null>(this.readLocal());
  readonly settings$ = new BehaviorSubject<LogoSettings>(this.readLocalSettings());

  constructor(private http: HttpClient) {}

  /**
   * Charge le logo et ses réglages. `entrepriseCode` (facultatif) cible
   * l'entreprise AVANT authentification (page de connexion). Sans code,
   * l'entreprise est déduite du jeton de l'utilisateur connecté.
   */
  load(entrepriseCode?: string | null): void {
    this.http.get<{ logo: string | null; settings: LogoSettings | null }>(this.buildUrl(entrepriseCode))
      .pipe(catchError(() => of(null)))
      .subscribe(res => {
        if (!res) {
          // Erreur réseau : on conserve l'état courant.
          return;
        }
        const remote = res.logo || null;
        this.writeLocal(remote);
        this.logo$.next(remote);
        if (res.settings) {
          const settings = normalizeLogoSettings(res.settings);
          this.writeLocalSettings(settings);
          this.settings$.next(settings);
        } else {
          this.writeLocalSettings(DEFAULT_LOGO_SETTINGS);
          this.settings$.next({ ...DEFAULT_LOGO_SETTINGS });
        }
      });
  }

  /** Force l'absence de logo et les réglages par défaut (SUPER_ADMIN). */
  useDefaults(): void {
    this.writeLocal(null);
    this.logo$.next(null);
    this.writeLocalSettings(DEFAULT_LOGO_SETTINGS);
    this.settings$.next({ ...DEFAULT_LOGO_SETTINGS });
  }

  private buildUrl(entrepriseCode?: string | null): string {
    if (entrepriseCode && entrepriseCode.trim()) {
      return `${this.apiUrl}?entreprise=${encodeURIComponent(entrepriseCode.trim())}`;
    }
    return this.apiUrl;
  }

  save(logo?: string | null, settings?: LogoSettings): Observable<unknown> {
    const body: { logo?: string | null; settings?: LogoSettings } = {};
    if (logo !== undefined) {
      body.logo = logo;
      this.writeLocal(logo);
      this.logo$.next(logo);
    }
    if (settings) {
      const normalized = normalizeLogoSettings(settings);
      body.settings = normalized;
      this.writeLocalSettings(normalized);
      this.settings$.next(normalized);
    }
    return this.http.post(this.apiUrl, body)
      .pipe(catchError(() => of(null)));
  }

  clear(): void {
    this.writeLocal(null);
    this.logo$.next(null);
    this.http.delete(this.apiUrl)
      .pipe(catchError(() => of(null)))
      .subscribe();
  }

  private readLocal(): string | null {
    try {
      return localStorage.getItem(this.storageKey);
    } catch {
      return null;
    }
  }

  private writeLocal(value: string | null): void {
    try {
      if (value) {
        localStorage.setItem(this.storageKey, value);
      } else {
        localStorage.removeItem(this.storageKey);
      }
    } catch {
      // quota localStorage dépassé : on garde juste l'état en mémoire
    }
  }

  private readLocalSettings(): LogoSettings {
    try {
      const raw = localStorage.getItem(this.settingsStorageKey);
      if (raw) {
        return normalizeLogoSettings(JSON.parse(raw));
      }
    } catch {
      // ignoré
    }
    return { ...DEFAULT_LOGO_SETTINGS };
  }

  private writeLocalSettings(settings: LogoSettings): void {
    try {
      localStorage.setItem(this.settingsStorageKey, JSON.stringify(settings));
    } catch {
      // quota localStorage dépassé : on garde juste l'état en mémoire
    }
  }
}

export function normalizeLogoSettings(value: Partial<LogoSettings>): LogoSettings {
  const align = value && value.align;
  const clamp = (raw: unknown, fallback: number, min: number, max: number): number => {
    const number = Number(raw);
    return Number.isFinite(number) ? Math.min(max, Math.max(min, Math.round(number))) : fallback;
  };
  return {
    size: clamp(value && value.size, DEFAULT_LOGO_SETTINGS.size, 30, 200),
    align: (align === 'left' || align === 'center' || align === 'right') ? align : DEFAULT_LOGO_SETTINGS.align,
    offsetY: clamp(value && value.offsetY, DEFAULT_LOGO_SETTINGS.offsetY, -50, 100),
    paddingTop: clamp(value && value.paddingTop, DEFAULT_LOGO_SETTINGS.paddingTop, 0, 60),
    paddingRight: clamp(value && value.paddingRight, DEFAULT_LOGO_SETTINGS.paddingRight, 0, 60),
    paddingBottom: clamp(value && value.paddingBottom, DEFAULT_LOGO_SETTINGS.paddingBottom, 0, 60),
    paddingLeft: clamp(value && value.paddingLeft, DEFAULT_LOGO_SETTINGS.paddingLeft, 0, 60)
  };
}
