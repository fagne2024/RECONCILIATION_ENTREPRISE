import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable, of } from 'rxjs';
import { catchError, map, tap } from 'rxjs/operators';

/** Niveaux de traitement (alignés sur `resolveTraitementKind`). */
export type TopUserLevel = 'support' | 'group' | 'cdo' | 'termine';

/** Une catégorie (colonne) configurable du bloc « Top des utilisateurs ». */
export interface TopUsersCategoryConfig {
  /** Identifiant stable (slug) unique dans la configuration. */
  id: string;
  /** Titre personnalisé (null/vide = traduction par défaut pour les catégories standard). */
  title: string | null;
  /** Libellé d'action affiché sous chaque nom (null/vide = traduction par défaut). */
  actionLabel: string | null;
  /** Événements d'audit pris en compte (majuscules sans accent) ; vide = tous. */
  events: string[];
  /** Niveaux de traitement pris en compte ; vide = tous. */
  levels: TopUserLevel[];
  /** Afficher (true) ou masquer (false) la catégorie. */
  enabled: boolean;
}

/** Réglages du bloc « Top des utilisateurs » (Étape 8 — Configuration > Top utilisateurs). */
export interface TopUsersConfig {
  /** Afficher la section en tête de « État des réconciliations ». */
  enabled: boolean;
  /** Nombre d'utilisateurs affichés par catégorie (1 à 10). */
  topN: number;
  /** Afficher la variation (delta) par rapport à la période précédente. */
  showDelta: boolean;
  /** Liste ordonnée des catégories. */
  categories: TopUsersCategoryConfig[];
}

export const MIN_TOP_USERS = 1;
export const MAX_TOP_USERS = 10;
export const MAX_TOP_USERS_LABEL = 120;
export const MAX_TOP_USERS_CATEGORIES = 12;

/** Événements d'audit proposés dans l'éditeur (tokens normalisés, sans accent). */
export const KNOWN_AUDIT_EVENTS: string[] = [
  'CREATION',
  'CHANGEMENT_TRAITEMENT',
  'VALIDATION_TERMINE',
  'SAUVEGARDE_RESULTAT',
  'STATUT_OK',
  'CHANGEMENT_STATUT'
];

/** Niveaux de traitement proposés dans l'éditeur. */
export const KNOWN_TOP_USER_LEVELS: TopUserLevel[] = ['support', 'cdo', 'group', 'termine'];

/** Clés i18n des catégories standard (titre / libellé d'action par défaut). */
export const BUILTIN_CATEGORY_KEYS: Record<string, { titleKey: string; actionLabelKey: string }> = {
  agents: { titleKey: 'ETA.topUsers.catAgents', actionLabelKey: 'ETA.topUsers.actCreations' },
  responsables: { titleKey: 'ETA.topUsers.catResponsables', actionLabelKey: 'ETA.topUsers.actModifications' },
  validateurs: { titleKey: 'ETA.topUsers.catValidateurs', actionLabelKey: 'ETA.topUsers.actValidations' }
};

/** Les trois catégories standard (Agents / Responsables / Validateurs). */
export function defaultTopUsersCategories(): TopUsersCategoryConfig[] {
  return [
    { id: 'agents', title: null, actionLabel: null, events: ['CREATION'], levels: ['support', 'cdo'], enabled: true },
    { id: 'responsables', title: null, actionLabel: null, events: ['CHANGEMENT_TRAITEMENT'], levels: ['group'], enabled: true },
    { id: 'validateurs', title: null, actionLabel: null, events: ['VALIDATION_TERMINE'], levels: ['termine'], enabled: true }
  ];
}

export const DEFAULT_TOP_USERS_CONFIG: TopUsersConfig = {
  enabled: true,
  topN: 3,
  showDelta: true,
  categories: defaultTopUsersCategories()
};

/** Normalise un jeton d'action d'audit : trim, sans accent, en majuscules. */
export function normalizeAuditEventToken(value: unknown): string {
  return String(value ?? '')
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase();
}

/** Nettoie un libellé : trim, vide → null, troncature à la longueur maximale. */
function normalizeLabel(value: unknown): string | null {
  if (value == null) {
    return null;
  }
  const text = String(value).trim();
  if (!text) {
    return null;
  }
  return text.length > MAX_TOP_USERS_LABEL ? text.slice(0, MAX_TOP_USERS_LABEL) : text;
}

/** Slug alphanumérique minuscule (les tirets remplacent les séparateurs). */
function slugify(value: unknown): string {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

/** Normalise une catégorie reçue de l'API ou saisie. */
function normalizeCategory(raw: Partial<TopUsersCategoryConfig>, index: number): TopUsersCategoryConfig {
  const events = Array.from(new Set(
    (Array.isArray(raw?.events) ? raw!.events : [])
      .map(normalizeAuditEventToken)
      .filter(Boolean)
  ));
  const levels = Array.from(new Set(
    (Array.isArray(raw?.levels) ? raw!.levels : [])
      .map(v => String(v ?? '').trim().toLowerCase())
      .filter((v): v is TopUserLevel => (KNOWN_TOP_USER_LEVELS as string[]).includes(v))
  ));
  return {
    id: slugify(raw?.id) || `cat-${index + 1}`,
    title: normalizeLabel(raw?.title),
    actionLabel: normalizeLabel(raw?.actionLabel),
    events,
    levels,
    enabled: raw?.enabled !== false
  };
}

/** Normalise une configuration reçue de l'API (bornage + valeurs par défaut). */
export function normalizeTopUsersConfig(value: Partial<TopUsersConfig> | null | undefined): TopUsersConfig {
  const raw = value || {};
  const rawTop = Number(raw.topN);
  const topN = Number.isFinite(rawTop)
    ? Math.min(MAX_TOP_USERS, Math.max(MIN_TOP_USERS, Math.round(rawTop)))
    : DEFAULT_TOP_USERS_CONFIG.topN;

  const rawCategories = Array.isArray(raw.categories) ? raw.categories : [];
  const categories = rawCategories
    .slice(0, MAX_TOP_USERS_CATEGORIES)
    .map((c, i) => normalizeCategory(c, i));
  // Unicité des identifiants (suffixe les doublons).
  const used = new Set<string>();
  for (const cat of categories) {
    let id = cat.id;
    while (used.has(id)) {
      id = `${cat.id}-${used.size + 1}`;
    }
    cat.id = id;
    used.add(id);
  }

  return {
    enabled: raw.enabled !== false,
    topN,
    showDelta: raw.showDelta !== false,
    categories: categories.length ? categories : defaultTopUsersCategories()
  };
}

/** Copie profonde d'une configuration (pour l'édition locale sans mutation partagée). */
export function cloneTopUsersConfig(config: TopUsersConfig): TopUsersConfig {
  return normalizeTopUsersConfig(JSON.parse(JSON.stringify(config)));
}

@Injectable({ providedIn: 'root' })
export class TopUsersConfigService {

  private readonly apiUrl = '/api/configuration/top-users';
  private readonly configSubject = new BehaviorSubject<TopUsersConfig>(cloneTopUsersConfig(DEFAULT_TOP_USERS_CONFIG));
  private loaded = false;

  /** Configuration courante (reste à jour après chargement / enregistrement). */
  readonly config$ = this.configSubject.asObservable();

  constructor(private http: HttpClient) {}

  /** Valeur courante (sans requête réseau). */
  get current(): TopUsersConfig {
    return this.configSubject.value;
  }

  /**
   * Charge la configuration depuis le backend. La première invocation fait
   * l'appel réseau, les suivantes réutilisent la valeur mémorisée sauf si
   * `force` est vrai.
   */
  load(force = false): Observable<TopUsersConfig> {
    if (this.loaded && !force) {
      return of(this.configSubject.value);
    }
    return this.http.get<Partial<TopUsersConfig>>(this.apiUrl).pipe(
      map(res => normalizeTopUsersConfig(res)),
      tap(config => {
        this.loaded = true;
        this.configSubject.next(config);
      }),
      catchError(() => {
        // Erreur réseau / endpoint indisponible : on conserve les valeurs par défaut.
        this.loaded = true;
        this.configSubject.next(cloneTopUsersConfig(DEFAULT_TOP_USERS_CONFIG));
        return of(this.configSubject.value);
      })
    );
  }

  /** Enregistre la configuration puis met à jour l'état local. */
  save(config: TopUsersConfig): Observable<TopUsersConfig> {
    const payload = normalizeTopUsersConfig(config);
    return this.http.put<Partial<TopUsersConfig>>(this.apiUrl, payload).pipe(
      map(res => normalizeTopUsersConfig(res)),
      tap(saved => {
        this.loaded = true;
        this.configSubject.next(saved);
      })
    );
  }
}
