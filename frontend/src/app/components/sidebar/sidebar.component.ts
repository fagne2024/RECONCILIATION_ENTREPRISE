import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router, NavigationEnd } from '@angular/router';
import { AppStateService } from '../../services/app-state.service';
import { UserLogService } from '../../services/user-log.service';
import { NavigationVisibilityService } from '../../services/navigation-visibility.service';
import { NavigationLabelsService } from '../../services/navigation-labels.service';
import { LogoService, LogoSettings, DEFAULT_LOGO_SETTINGS, logoPaddingStyle } from '../../services/logo.service';
import { UserPhotoService } from '../../services/user-photo.service';
import { APP_NAVIGATION_CATALOG, AppNavigationGroup, AppNavigationSubmenu } from '../../constants/app-navigation-catalog';
import { filter, takeUntil } from 'rxjs/operators';
import { Subject } from 'rxjs';

@Component({
  selector: 'app-sidebar',
  templateUrl: './sidebar.component.html',
  styleUrls: ['./sidebar.component.scss']
})
export class SidebarComponent implements OnInit {
  private destroy$ = new Subject<void>();

  visibleGroups: AppNavigationGroup[] = [];
  visibleSubmenus: Map<string, AppNavigationSubmenu[]> = new Map();
  openSubmenus: Set<string> = new Set();
  logoUrl: string | null = null;
  logoSettings: LogoSettings = { ...DEFAULT_LOGO_SETTINGS };
  userPhoto: string | null = null;

  constructor(
    private http: HttpClient,
    private router: Router,
    private appState: AppStateService,
    private cdr: ChangeDetectorRef,
    private userLogService: UserLogService,
    private navVisibility: NavigationVisibilityService,
    private navLabels: NavigationLabelsService,
    private logoService: LogoService,
    private userPhotoService: UserPhotoService
  ) { }

  ngOnInit(): void {
    // Logo de l'application
    this.logoService.logo$.pipe(takeUntil(this.destroy$)).subscribe(url => {
      this.logoUrl = url;
      this.cdr.detectChanges();
    });
    this.logoService.settings$.pipe(takeUntil(this.destroy$)).subscribe(settings => {
      this.logoSettings = settings;
      this.cdr.detectChanges();
    });
    this.logoService.load();

    // Photo de l'utilisateur connecte (partagee avec la page profil)
    this.userPhotoService.photo$.pipe(takeUntil(this.destroy$)).subscribe(photo => {
      this.userPhoto = photo;
      this.cdr.detectChanges();
    });
    this.userPhotoService.load();

    // Charger les labels personnalisés
    this.navLabels.loadLabels().pipe(takeUntil(this.destroy$)).subscribe(() => {
      this.updateVisibleNavigation();
    });

    // Écouter les changements de labels
    this.navLabels.labels$.pipe(takeUntil(this.destroy$)).subscribe(() => {
      this.updateVisibleNavigation();
    });

    this.updateVisibleNavigation();
    this.updateExpandedSubmenus(this.router.url);

    this.router.events.pipe(
      filter(event => event instanceof NavigationEnd),
      takeUntil(this.destroy$)
    ).subscribe((event: NavigationEnd) => {
      this.updateExpandedSubmenus(event.urlAfterRedirects);
      this.cdr.detectChanges();
    });

    // Rafraîchir l'affichage dès qu'un module est (dés)activé
    this.navVisibility.changes$.pipe(takeUntil(this.destroy$)).subscribe(() => {
      this.updateVisibleNavigation();
    });

    // Charger les modules actifs au démarrage (rafraîchit depuis le backend)
    this.navVisibility.refreshActiveModules().pipe(takeUntil(this.destroy$)).subscribe(() => {
      this.updateVisibleNavigation();
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  updateVisibleNavigation(): void {
    const isAdmin = this.appState.isAdmin();
    this.visibleSubmenus.clear();
    
    // Utiliser le catalogue avec les labels personnalisés
    const catalogWithLabels = this.navLabels.buildCatalogWithLabels();
    
    this.visibleGroups = catalogWithLabels.filter(group => {
      if (!group.children) {
        return this.navVisibility.isGroupVisible(group) && this.isMenuAllowed(group);
      }
      const visibleChildren = this.navVisibility.getVisibleSubmenus(group)
        .filter(submenu => this.isSubmenuAllowed(submenu))
        .map(submenu => this.withVisibleNestedSubmenus(submenu));
      if (!visibleChildren.length) {
        return false;
      }
      // L'admin garde tous les sous-menus d'un groupe adminOnly pour pouvoir les réactiver
      const adminChildren = isAdmin && group.adminOnly
        ? this.navVisibility.getVisibleSubmenus(group).map(submenu => this.withVisibleNestedSubmenus(submenu))
        : visibleChildren;
      this.visibleSubmenus.set(group.key, adminChildren);
      return true;
    });
    this.cdr.detectChanges();
  }

  /** Filtre les sous-menus de 3e niveau (ex: Configuration > Modèles de Traitement). */
  private withVisibleNestedSubmenus(submenu: AppNavigationSubmenu): AppNavigationSubmenu {
    if (!submenu.children?.length) {
      return submenu;
    }
    const children = submenu.children.filter(child =>
      this.navVisibility.isSubmenuVisible(child) && this.isSubmenuAllowed(child)
    );
    return { ...submenu, children };
  }

  private updateExpandedSubmenus(url: string): void {
    const path = url.split('?')[0];
    for (const group of this.visibleGroups) {
      if (group.children) {
        for (const submenu of group.children) {
          if (submenu.route && this.isPathInGroup(path, [submenu.route])) {
            this.openSubmenus.add(group.key);
            break;
          }
          const nestedRoutes = (submenu.children || []).map(child => child.route).filter((r): r is string => !!r);
          if (nestedRoutes.length && this.isPathInGroup(path, nestedRoutes)) {
            this.openSubmenus.add(group.key);
            this.openSubmenus.add(submenu.key);
          }
        }
      }
    }
  }

  /** Ouvre/ferme un sous-menu de 3e niveau. */
  toggleNestedSubmenu(submenuKey: string): void {
    if (this.openSubmenus.has(submenuKey)) {
      this.openSubmenus.delete(submenuKey);
    } else {
      this.openSubmenus.add(submenuKey);
    }
  }

  isNestedSubmenuOpen(submenuKey: string): boolean {
    return this.openSubmenus.has(submenuKey);
  }

  isPathInGroup(path: string, routes: string[]): boolean {
    return routes.some(route => path === route || path.startsWith(route + '/'));
  }

  isOnSection(routes: string[]): boolean {
    return this.isPathInGroup(this.router.url.split('?')[0], routes);
  }

  isGroupOnSection(group: AppNavigationGroup): boolean {
    if (!group.children) return false;
    const routes = group.children
      .flatMap(submenu => [submenu.route, ...(submenu.children || []).map(child => child.route)])
      .filter((r): r is string => !!r);
    return this.isPathInGroup(this.router.url.split('?')[0], routes);
  }

  /** Un sous-menu est actif si sa route ou une route de ses enfants correspond. */
  isSubmenuOnSection(submenu: AppNavigationSubmenu): boolean {
    const routes = [submenu.route, ...(submenu.children || []).map(child => child.route)]
      .filter((r): r is string => !!r);
    if (!routes.length) return false;
    return this.isPathInGroup(this.router.url.split('?')[0], routes);
  }

  /** Classe FontAwesome des icônes : garantit la famille "fas" (sans elle, FA6 ne rend pas le glyphe en poids 400). */
  menuIconClass(icon?: string): string {
    const raw = (icon || '').trim();
    if (!raw) {
      return 'menu-icon';
    }
    const hasFamily = /^fa[srb]\s/i.test(raw);
    return (hasFamily ? raw : `fas ${raw}`) + ' menu-icon';
  }

  toggleGroupSubmenu(groupKey: string): void {
    if (this.openSubmenus.has(groupKey)) {
      this.openSubmenus.delete(groupKey);
    } else {
      this.openSubmenus.add(groupKey);
    }
  }

  isGroupSubmenuOpen(groupKey: string): boolean {
    return this.openSubmenus.has(groupKey);
  }

  logout() {
    const username = this.appState.getUsername();
    if (username) {
      this.userLogService.logActivity('deconnexion', 'Authentification', username, 'Déconnexion manuelle');
    }
    this.userPhotoService.clear();
    this.appState.logout();
    this.router.navigate(['/login']);
  }

  isMenuAllowed(group: AppNavigationGroup): boolean {
    if (this.appState.isSuperAdmin()) return true;
    if (group.superAdminOnly) return false;
    if (this.appState.isAdmin()) return true;
    if (!group.moduleName) return true;
    return this.appState.isModuleAllowed(group.moduleName);
  }

  isSubmenuAllowed(submenu: AppNavigationSubmenu): boolean {
    if (submenu.superAdminOnly) {
      return this.appState.isSuperAdmin();
    }
    if (submenu.adminOnly) {
      return this.appState.isAdmin();
    }
    if (this.appState.isSuperAdmin()) return true;
    if (this.appState.isAdmin()) return true;
    if (!submenu.moduleName) return true;
    return this.appState.isModuleAllowed(submenu.moduleName);
  }

  canShowNavigationRoute(route: string, fallbackModule?: string): boolean {
    if (this.appState.isAdmin()) return true;
    return this.appState.canAccessRoute(route);
  }

  getUsername(): string | null {
    return this.appState.getUsername();
  }

  get logoStyle(): { [key: string]: string } {
    return {
      'max-height': this.logoSettings.size + 'px',
      'margin-top': this.logoSettings.offsetY + 'px'
    };
  }

  get logoPadding(): { [key: string]: string } {
    return logoPaddingStyle(this.logoSettings);
  }

  get logoAlign(): { [key: string]: string } {
    const justify = this.logoSettings.align === 'left'
      ? 'flex-start'
      : this.logoSettings.align === 'right' ? 'flex-end' : 'center';
    return { 'justify-content': justify };
  }

  getUserProfil(): string | null {
    const userRights = this.appState.getUserRights();
    return userRights?.profil || null;
  }

  goToProfile(): void {
    this.router.navigate(['/user-profile']);
  }
}