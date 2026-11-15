import { Injectable } from '@angular/core';
import { ActivatedRouteSnapshot, CanActivate, Router, RouterStateSnapshot } from '@angular/router';
import { AppStateService } from '../services/app-state.service';
import { PopupService } from '../services/popup.service';
import { findNavigationAccessContextByRoute } from '../constants/app-navigation-catalog';
import { I18nService } from '../services/i18n/i18n.service';

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
        I18nService.t('MSG.msg.vousNAvezPasAccesAu', { p0: navContext.label }),
        I18nService.t('TFA.popups.adminRequired.title')
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
      this.appState.isModuleUsable(requiredModule)
      && this.appState.hasAllModulePermissions(requiredModule, requiredPermissions)
    ) {
      return true;
    }

    if (!this.appState.isModuleUsable(requiredModule)) {
      this.popupService.showWarning(
        I18nService.t('MSG.msg.vousNAvezPasAccesAu2', { p0: requiredModule }),
        I18nService.t('TFA.popups.adminRequired.title')
      );
    } else {
      const missing = requiredPermissions.filter(permission =>
        !this.appState.hasModulePermission(requiredModule, permission)
      );
      const message = missing.length === 1
        ? I18nService.t('MSG.msg.vousNAvezPasLaPermission', { p0: missing[0] })
        : I18nService.t('MSG.msg.ilVousManqueLesPermissionsPour', { p0: missing.map(permission => `« ${permission} »`).join(', ') });
      this.popupService.showWarning(message, I18nService.t('MSG.msg.permissionRefusee'));
    }

    this.redirectToFallback();
    return false;
  }

  private redirectToFallback(): void {
    this.router.navigateByUrl(this.appState.resolveAccessibleRoute());
  }
}
