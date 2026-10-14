import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, BehaviorSubject, of, forkJoin } from 'rxjs';
import { map, catchError, tap } from 'rxjs/operators';
import { APP_NAVIGATION_CATALOG, AppNavigationGroup, AppNavigationSubmenu } from '../constants/app-navigation-catalog';

export interface NavigationLabel {
  id: string;
  type: 'group' | 'submenu' | 'nested';
  groupKey: string;
  submenuKey?: string;
  nestedKey?: string;
  label: string;
  originalLabel: string;
  hasChanges?: boolean;
}

export interface NavigationLabelsResponse {
  labels: NavigationLabel[];
}

export interface NavigationLabelAudit {
  id: number;
  labelId: string;
  labelType: string;
  groupKey: string;
  submenuKey?: string;
  nestedKey?: string;
  oldLabel: string;
  newLabel: string;
  username: string;
  actionType: string;
  detail: string;
  createdAt: string;
}

@Injectable({ providedIn: 'root' })
export class NavigationLabelsService {
  private apiUrl = '/api/configuration/navigation-labels';
  private labelsSubject = new BehaviorSubject<NavigationLabel[]>([]);
  public labels$ = this.labelsSubject.asObservable();
  private loaded = false;

  constructor(private http: HttpClient) {}

  /** Charge les labels personnalisés depuis le backend */
  loadLabels(): Observable<NavigationLabel[]> {
    return this.http.get<NavigationLabelsResponse>(this.apiUrl).pipe(
      map(res => res.labels || []),
      tap(labels => {
        this.labelsSubject.next(labels);
        this.loaded = true;
      }),
      catchError(err => {
        console.warn('Impossible de charger les labels de navigation:', err);
        this.loaded = true;
        return of([]);
      })
    );
  }

  /** Récupère les labels actuels (synchrone) */
  getLabels(): NavigationLabel[] {
    return this.labelsSubject.value;
  }

  /** Vérifie si les labels sont chargés */
  isLoaded(): boolean {
    return this.loaded;
  }

  /** Sauvegarde les labels personnalisés */
  saveLabels(labels: NavigationLabel[]): Observable<void> {
    return this.http.post<void>(this.apiUrl, { labels }).pipe(
      tap(() => {
        this.labelsSubject.next(labels);
      })
    );
  }

  /** Met à jour un label spécifique */
  updateLabel(label: NavigationLabel): Observable<void> {
    const current = this.labelsSubject.value;
    const index = current.findIndex(l => l.id === label.id);
    const updated = index >= 0 ? [...current.slice(0, index), label, ...current.slice(index + 1)] : [...current, label];
    return this.saveLabels(updated);
  }

  /** Supprime un label personnalisé (revert à l'original) */
  deleteLabel(id: string): Observable<void> {
    const current = this.labelsSubject.value.filter(l => l.id !== id);
    return this.saveLabels(current);
  }

  /** Génère l'ID unique pour un élément de navigation */
  generateId(type: 'group' | 'submenu' | 'nested', groupKey: string, submenuKey?: string, nestedKey?: string): string {
    const parts = [type, groupKey];
    if (submenuKey) parts.push(submenuKey);
    if (nestedKey) parts.push(nestedKey);
    return parts.join(':');
  }

  /** Récupère le label personnalisé pour un groupe */
  getGroupLabel(groupKey: string): string | null {
    const label = this.labelsSubject.value.find(l => l.type === 'group' && l.groupKey === groupKey);
    return label?.label || null;
  }

  /** Récupère le label personnalisé pour un sous-menu */
  getSubmenuLabel(groupKey: string, submenuKey: string): string | null {
    const label = this.labelsSubject.value.find(l => l.type === 'submenu' && l.groupKey === groupKey && l.submenuKey === submenuKey);
    return label?.label || null;
  }

  /** Récupère le label personnalisé pour un sous-menu imbriqué */
  getNestedLabel(groupKey: string, submenuKey: string, nestedKey: string): string | null {
    const label = this.labelsSubject.value.find(l => l.type === 'nested' && l.groupKey === groupKey && l.submenuKey === submenuKey && l.nestedKey === nestedKey);
    return label?.label || null;
  }

  /** Construit le catalogue complet avec les labels personnalisés */
  buildCatalogWithLabels(): AppNavigationGroup[] {
    const labels = this.labelsSubject.value;
    
    return APP_NAVIGATION_CATALOG.map(group => {
      const groupLabel = labels.find(l => l.type === 'group' && l.groupKey === group.key);
      
      const updatedGroup: AppNavigationGroup = {
        ...group,
        label: groupLabel?.label || group.label
      };

      if (group.children) {
        updatedGroup.children = group.children.map(submenu => {
          const submenuLabel = labels.find(l => l.type === 'submenu' && l.groupKey === group.key && l.submenuKey === submenu.key);
          
          const updatedSubmenu: AppNavigationSubmenu = {
            ...submenu,
            label: submenuLabel?.label || submenu.label
          };

          if (submenu.children) {
            updatedSubmenu.children = submenu.children.map(nested => {
              const nestedLabel = labels.find(l => l.type === 'nested' && l.groupKey === group.key && l.submenuKey === submenu.key && l.nestedKey === nested.key);
              return {
                ...nested,
                label: nestedLabel?.label || nested.label
              };
            });
          }

          return updatedSubmenu;
        });
      }

      return updatedGroup;
    });
  }

  /** Extrait tous les éléments renommables du catalogue */
  getAllRenamableItems(): NavigationLabel[] {
    const items: NavigationLabel[] = [];
    const existingLabels = this.labelsSubject.value;

    for (const group of APP_NAVIGATION_CATALOG) {
      // Groupe principal
      const groupId = this.generateId('group', group.key);
      const existing = existingLabels.find(l => l.id === groupId);
      items.push({
        id: groupId,
        type: 'group',
        groupKey: group.key,
        label: existing?.label || group.label,
        originalLabel: group.label
      });

      if (group.children) {
        for (const submenu of group.children) {
          // Sous-menu
          const submenuId = this.generateId('submenu', group.key, submenu.key);
          const existingSub = existingLabels.find(l => l.id === submenuId);
          items.push({
            id: submenuId,
            type: 'submenu',
            groupKey: group.key,
            submenuKey: submenu.key,
            label: existingSub?.label || submenu.label,
            originalLabel: submenu.label
          });

          // Sous-menus imbriqués (3e niveau)
          if (submenu.children) {
            for (const nested of submenu.children) {
              const nestedId = this.generateId('nested', group.key, submenu.key, nested.key);
              const existingNested = existingLabels.find(l => l.id === nestedId);
              items.push({
                id: nestedId,
                type: 'nested',
                groupKey: group.key,
                submenuKey: submenu.key,
                nestedKey: nested.key,
                label: existingNested?.label || nested.label,
                originalLabel: nested.label
              });
            }
          }
        }
      }
    }

    return items;
  }

  /** Réinitialise tous les labels (vide la base) */
  resetAll(): Observable<void> {
    return this.saveLabels([]);
  }

  // ===== AUDIT / HISTORIQUE =====

  /** Récupère tout l'historique */
  getAllHistory(): Observable<NavigationLabelAudit[]> {
    return this.http.get<NavigationLabelAudit[]>(`${this.apiUrl}/history`).pipe(
      catchError(err => {
        console.warn('Impossible de charger l\'historique:', err);
        return of([]);
      })
    );
  }

  /** Récupère l'historique pour un label spécifique */
  getHistoryForLabel(labelId: string): Observable<NavigationLabelAudit[]> {
    return this.http.get<NavigationLabelAudit[]>(`${this.apiUrl}/history/${labelId}`).pipe(
      catchError(err => {
        console.warn(`Impossible de charger l'historique pour ${labelId}:`, err);
        return of([]);
      })
    );
  }

  /** Récupère l'historique pour un groupe */
  getHistoryForGroup(groupKey: string): Observable<NavigationLabelAudit[]> {
    return this.http.get<NavigationLabelAudit[]>(`${this.apiUrl}/history/group/${groupKey}`).pipe(
      catchError(err => {
        console.warn(`Impossible de charger l'historique pour le groupe ${groupKey}:`, err);
        return of([]);
      })
    );
  }

  /** Restaure une version précédente */
  restoreVersion(labelId: string, version: number): Observable<void> {
    return this.http.post<void>(`${this.apiUrl}/restore/${labelId}/${version}`, {}).pipe(
      tap(() => {
        // Recharger les labels après restauration
        this.loadLabels().subscribe();
      })
    );
  }
}