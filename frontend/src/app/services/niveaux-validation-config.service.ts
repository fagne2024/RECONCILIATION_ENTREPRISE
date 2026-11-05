import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, BehaviorSubject, of } from 'rxjs';
import { map, catchError, tap } from 'rxjs/operators';
import { countriesMatch } from '../utils/country-codes.util';

export interface NiveauTraitementConfig {
  valeur: string;
  ordre: number;
  actif: boolean;
  description: string;
  statutAssocie: string;
  profilsAutorisesIds: number[];
  /** Emails destinataires (TO) pour la notification « tous les services à OK » de ce niveau. */
  destinatairesEmail?: string[];
  /** Emails en copie (CC) de la notification de ce niveau. */
  copieEmail?: string[];
  /** Envoi automatique de l'email pour ce niveau (sans confirmation). */
  envoiAutomatiqueEmail?: boolean;
}

export interface NiveauxValidationConfig {
  niveauxTraitement: NiveauTraitementConfig[];
  /** @deprecated Anciens destinataires globaux (conservés pour compatibilité). */
  destinatairesEmail?: string[];
  /** @deprecated Ancienne copie globale (conservée pour compatibilité). */
  copieEmail?: string[];
  /** @deprecated Ancien envoi automatique global (conservé pour compatibilité). */
  envoiAutomatiqueEmail?: boolean;
}

export interface NiveauxValidationConfigByCountry {
  [paysCode: string]: NiveauxValidationConfig;
}

export interface Profil {
  id?: number;
  nom: string;
  description?: string;
}

@Injectable({ providedIn: 'root' })
export class NiveauxValidationConfigService {
  private apiUrl = '/api/config/niveaux-validation';
  private configSubject = new BehaviorSubject<NiveauxValidationConfigByCountry>({});
  public config$ = this.configSubject.asObservable();

  // Fallback localStorage key
  private readonly STORAGE_KEY = 'niveaux_validation_config';

  constructor(private http: HttpClient) {
    this.loadFromStorage();
  }

  /** Charge la config depuis localStorage (fallback immédiat) */
  private loadFromStorage(): void {
    try {
      const stored = localStorage.getItem(this.STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        this.configSubject.next(parsed);
      }
    } catch (e) {
      console.warn('Erreur lecture config niveaux validation:', e);
    }
  }

  /** Sauvegarde la config dans localStorage */
  private saveToStorage(config: NiveauxValidationConfigByCountry): void {
    try {
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(config));
      this.configSubject.next(config);
    } catch (e) {
      console.warn('Erreur écriture config niveaux validation:', e);
    }
  }

  /** Récupère la config complète (Observable) */
  getConfig(): Observable<NiveauxValidationConfigByCountry> {
    return this.config$;
  }

  /** Récupère la config pour un pays donné (GNL par défaut) */
  getConfigForPays(paysCode: string = 'GNL'): Observable<NiveauxValidationConfig> {
    return this.config$.pipe(
      map(configs => {
        const key = this.resolveConfigKey(configs, paysCode);
        return (key ? configs[key] : configs['GNL']) || { niveauxTraitement: [] };
      })
    );
  }

  /** Récupère la config synchrone pour un pays (utilisation immédiate) */
  getConfigForPaysSync(paysCode: string = 'GNL'): NiveauxValidationConfig {
    const configs = this.configSubject.value;
    const key = this.resolveConfigKey(configs, paysCode);
    return (key ? configs[key] : configs['GNL']) || { niveauxTraitement: [] };
  }

  /**
   * Retrouve la clé de configuration correspondant à un code ou un libellé pays.
   * Les lignes de rapport utilisent souvent le nom complet (« Gabon ») alors que
   * la configuration est enregistrée sous le code ISO (« GA »).
   */
  private resolveConfigKey(configs: NiveauxValidationConfigByCountry, paysCode: string): string | undefined {
    const raw = (paysCode || '').trim();
    if (!raw) {
      return undefined;
    }
    if (configs[raw]) {
      return raw;
    }
    const upper = raw.toUpperCase();
    if (configs[upper]) {
      return upper;
    }
    return Object.keys(configs).find(key => countriesMatch(key, raw));
  }

  /** Met à jour la config pour un pays */
  setConfigForPays(paysCode: string, config: NiveauxValidationConfig): void {
    const current = { ...this.configSubject.value };
    current[paysCode] = config;
    this.saveToStorage(current);
  }

  /** Récupère toutes les configurations de niveaux de validation stockées (pour recherche globale). */
  getAllConfigs(): any {
    return this.configSubject.value;
  }

  /** Met à jour la config complète */
  setConfig(config: NiveauxValidationConfigByCountry): void {
    this.saveToStorage(config);
  }

  /** Charge depuis l'API backend (à implémenter quand l'API existe) */
  loadFromApi(): Observable<NiveauxValidationConfigByCountry> {
    return this.http.get<NiveauxValidationConfigByCountry>(this.apiUrl).pipe(
      tap(config => this.saveToStorage(config)),
      catchError(err => {
        console.warn('API config non disponible, utilisation locale:', err);
        return of(this.configSubject.value);
      })
    );
  }

  /** Sauvegarde via API backend */
  saveToApi(paysCode: string, config: NiveauxValidationConfig): Observable<void> {
    return this.http.post<void>(`${this.apiUrl}?pays=${paysCode}`, config).pipe(
      tap(() => this.setConfigForPays(paysCode, config)),
      catchError(err => {
        console.warn('API save non disponible, sauvegarde locale seulement:', err);
        this.setConfigForPays(paysCode, config);
        return of(void 0);
      })
    );
  }

  /** Trouve le niveau de traitement par sa valeur */
  findNiveauByValeur(paysCode: string, valeur: string): NiveauTraitementConfig | undefined {
    const config = this.getConfigForPaysSync(paysCode);
    return config.niveauxTraitement.find(n => n.valeur === valeur);
  }

  /** Trouve le niveau suivant (ordre + 1) */
  findNextNiveau(paysCode: string, currentValeur: string): NiveauTraitementConfig | undefined {
    const config = this.getConfigForPaysSync(paysCode);
    const current = config.niveauxTraitement.find(n => n.valeur === currentValeur);
    if (!current) return undefined;
    return config.niveauxTraitement.find(n => n.ordre === current.ordre + 1 && n.actif);
  }

  /** Vérifie si un profil (par son ID) est autorisé pour un niveau donné */
  isProfilAutorisePourNiveau(paysCode: string, niveauValeur: string, profilId: number): boolean {
    const niveau = this.findNiveauByValeur(paysCode, niveauValeur);
    if (!niveau) return false;
    if (!niveau.profilsAutorisesIds || niveau.profilsAutorisesIds.length === 0) {
      // Aucun profil configuré = validation bloquée (configuration requise)
      return false;
    }
    return niveau.profilsAutorisesIds.includes(profilId);
  }

  /** Vérifie si un niveau a au moins un profil configuré */
  hasProfilsConfigured(paysCode: string, niveauValeur: string): boolean {
    const niveau = this.findNiveauByValeur(paysCode, niveauValeur);
    return !!(niveau?.profilsAutorisesIds && niveau.profilsAutorisesIds.length > 0);
  }

  /** Récupère le statut associé à un niveau */
  getStatutAssocie(paysCode: string, niveauValeur: string): string | undefined {
    const niveau = this.findNiveauByValeur(paysCode, niveauValeur);
    return niveau?.statutAssocie;
  }

  /** Récupère tous les statuts possibles pour un pays */
  getAllStatuts(paysCode: string): string[] {
    const config = this.getConfigForPaysSync(paysCode);
    return config.niveauxTraitement
      .filter(n => n.actif)
      .map(n => n.statutAssocie)
      .filter((s, i, arr) => arr.indexOf(s) === i);
  }
}