import { Injectable } from '@angular/core';
import { APP_NAVIGATION_CATALOG, AppNavigationGroup, AppNavigationSubmenu } from '../constants/app-navigation-catalog';
import { AppStateService } from './app-state.service';
import { Observable, Subject, of } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class NavigationVisibilityService {
  private readonly visibilityChanges = new Subject<void>();

  constructor(private appState: AppStateService) {}

  /** Émis à chaque changement de visibilité pour que la sidebar se reconstruise. */
  get changes$(): Observable<void> {
    return this.visibilityChanges.asObservable();
  }

  /**
   * Vérifie si un groupe/module est visible.
   * Un groupe avec sous-menus n'a pas de moduleName propre : il est visible
   * dès qu'au moins un de ses sous-menus est visible.
   */
  isGroupVisible(group: AppNavigationGroup): boolean {
    // Vérifier le champ visible du groupe
    if (group.visible === false) {
      return false;
    }
    // Groupe réservé aux SUPER_ADMIN : masqué pour les admins d'entreprise
    if (group.superAdminOnly && !this.appState.isSuperAdmin()) {
      return false;
    }
    // Groupe réservé aux administrateurs : jamais masqué pour les admins/SUPER_ADMIN
    if (group.adminOnly && !this.appState.isAdmin() && !this.appState.isSuperAdmin()) {
      return false;
    }
    if (group.children?.length) {
      return group.children.some(submenu => this.isSubmenuVisible(submenu));
    }
    // Si le groupe n'a pas de moduleName, il est toujours visible (ex: dashboard)
    if (!group.moduleName) {
      return true;
    }
    // Vérifier si le module est actif pour l'entreprise
    return this.appState.isModuleActive(group.moduleName);
  }

  /**
   * Vérifie si un sous-menu est visible
   * Un sous-menu est visible si :
   * 1. Son groupe parent est visible
   * 2. Le module parent est actif pour l'entreprise
   * 3. Le sous-menu lui-même a visible !== false
   */
  isSubmenuVisible(submenu: AppNavigationSubmenu, parentGroup?: AppNavigationGroup): boolean {
    // Si le sous-menu a visible === false, il est masqué
    if (submenu.visible === false) {
      return false;
    }

    // Sous-menu réservé aux SUPER_ADMIN : visible dès que l'utilisateur est
    // SUPER_ADMIN, sans dépendre de l'activation d'un module. Le compte
    // plateforme n'appartient à aucune entreprise et n'a donc aucun module
    // actif ; ce filtre masquerait à tort tout le menu d'administration.
    if (submenu.superAdminOnly) {
      return this.appState.isSuperAdmin();
    }
    // Sous-menu réservé aux administrateurs
    if (submenu.adminOnly && !this.appState.isAdmin() && !this.appState.isSuperAdmin()) {
      return false;
    }

    // Si le groupe parent est fourni, vérifier sa visibilité
    if (parentGroup && !this.isGroupVisible(parentGroup)) {
      return false;
    }

    // Vérifier si le module est actif pour l'entreprise
    if (submenu.moduleName && !this.appState.isModuleActive(submenu.moduleName)) {
      return false;
    }

    return true;
  }

  /**
   * Charge les modules actifs depuis /api/modules/active
   * Appelé après login et quand le SUPER_ADMIN modifie les modules d'une entreprise.
   */
  loadActiveModules(): Observable<void> {
    // Cette méthode est un placeholder : le chargement réel se fait via AppStateService
    // qui appelle /api/modules/active dans le LoginComponent.
    // On émet quand même l'événement pour rafraîchir la sidebar.
    this.visibilityChanges.next();
    return of(void 0);
  }

  /**
   * Rafraîchit les modules actifs depuis le backend
   * Appelé au démarrage de l'application pour synchroniser l'état.
   */
  refreshActiveModules(): Observable<void> {
    this.visibilityChanges.next();
    return of(void 0);
  }

  /**
   * Invalide le cache et recharge les modules actifs
   * Appelé quand le SUPER_ADMIN modifie les modules d'une entreprise.
   */
  invalidateCache(): void {
    // Notifie la sidebar pour qu'elle se reconstruise avec les modules actuels
    this.visibilityChanges.next();
  }

  /**
   * Met à jour la visibilité d'un module après modification côté backend
   * et notifie la sidebar pour un affichage immédiat.
   * Note : la source de vérité est /api/modules/active, cette méthode
   * sert à forcer un rafraîchissement local si nécessaire.
   */
  setModuleVisibility(moduleName: string, visible: boolean): void {
    this.visibilityChanges.next();
  }

  /**
   * Obtient tous les sous-menus visibles pour un groupe donné
   */
  getVisibleSubmenus(group: AppNavigationGroup): AppNavigationSubmenu[] {
    if (!group.children) return [];
    return group.children.filter(sm => this.isSubmenuVisible(sm, group));
  }

  /**
   * Obtient tous les groupes visibles
   */
  getVisibleGroups(): AppNavigationGroup[] {
    return APP_NAVIGATION_CATALOG.filter(g => this.isGroupVisible(g));
  }

  /**
   * Vérifie si une route est accessible (module + sous-menu visibles)
   */
  isRouteAccessible(route: string): boolean {
    // Trouver le sous-menu correspondant à la route
    for (const group of APP_NAVIGATION_CATALOG) {
      if (!this.isGroupVisible(group)) continue;
      if (group.children) {
        for (const submenu of group.children) {
          if (submenu.route === route) {
            return this.isSubmenuVisible(submenu, group);
          }
        }
      } else if (group.route === route) {
        return this.isGroupVisible(group);
      }
    }
    return true; // Par défaut accessible si non trouvé dans le catalogue
  }

  private normalizeModuleName(module: string): string {
    return module
      .normalize('NFD')
      .replace(/\p{M}/gu, '')
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '');
  }
}