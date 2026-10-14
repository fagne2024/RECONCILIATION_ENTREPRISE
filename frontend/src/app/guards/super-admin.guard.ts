import { Injectable } from '@angular/core';
import { CanActivate, Router, RouterStateSnapshot, ActivatedRouteSnapshot } from '@angular/router';
import { AppStateService } from '../services/app-state.service';

/**
 * Garde pour les routes réservées au SUPER_ADMIN de la plateforme.
 * Bloque les administrateurs d'entreprise (isAdmin=true mais pas SUPER_ADMIN).
 */
@Injectable({
  providedIn: 'root'
})
export class SuperAdminGuard implements CanActivate {

  constructor(
    private appState: AppStateService,
    private router: Router
  ) {}

  canActivate(route: ActivatedRouteSnapshot, state: RouterStateSnapshot): boolean {
    if (this.appState.isSuperAdmin()) {
      return true;
    }

    this.router.navigate(['/dashboard'], {
      queryParams: { accessDenied: state.url }
    });
    return false;
  }
}