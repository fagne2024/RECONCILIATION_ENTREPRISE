import { Injectable } from '@angular/core';
import { ActivatedRouteSnapshot, CanActivate, Router, RouterStateSnapshot } from '@angular/router';
import { AppStateService } from '../services/app-state.service';
import { PopupService } from '../services/popup.service';
import { findNavigationAccessContextByRoute } from '../constants/app-navigation-catalog';

@Injectable({
  providedIn: 'root'
})
export class ModuleAccessGuard implements CanActivate {
  constructor(
    private appState: AppStateService,
    private router: Router,
    private popupService: PopupService
  ) {}

  canActivate(route: ActivatedRouteSnapshot, state: RouterStateSnapshot): boolean {
    if (this.appState.isAdmin()) {
      return true;
    }

    const navContext = findNavigationAccessContextByRoute(state.url);
    if (navContext) {
      if (this.appState.hasNavigationAccess(navContext)) {
        return true;
      }
      this.popupService.showWarning(
        `Vous n'avez pas accès au sous-menu « ${navContext.label} ».`,
        'Accès refusé'
      );
      this.redirectToFallback();
      return false;
    }

    const requiredModule = route.data['module'] as string | undefined;
    const requiredPermissions = (route.data['permissions'] as string[] | undefined) ?? [];

    if (!requiredModule) {
      return true;
    }

    if (
      this.appState.isModuleAllowed(requiredModule)
      && this.appState.hasAllModulePermissions(requiredModule, requiredPermissions)
    ) {
      return true;
    }

    if (!this.appState.isModuleAllowed(requiredModule)) {
      this.popupService.showWarning(
        `Vous n'avez pas accès au module « ${requiredModule} ».`,
        'Accès refusé'
      );
    } else {
      const missing = requiredPermissions.filter(permission =>
        !this.appState.hasModulePermission(requiredModule, permission)
      );
      const message = missing.length === 1
        ? `Vous n'avez pas la permission « ${missing[0]} » pour accéder à cette page.`
        : `Il vous manque les permissions ${missing.map(permission => `« ${permission} »`).join(', ')} pour accéder à cette page.`;
      this.popupService.showWarning(message, 'Permission refusée');
    }

    this.redirectToFallback();
    return false;
  }

  private redirectToFallback(): void {
    this.router.navigateByUrl(this.appState.resolveAccessibleRoute());
  }
}
