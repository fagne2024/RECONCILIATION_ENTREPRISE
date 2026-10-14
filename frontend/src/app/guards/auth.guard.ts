import { Injectable } from '@angular/core';
import { CanActivate, Router, ActivatedRouteSnapshot, RouterStateSnapshot } from '@angular/router';
import { AppStateService } from '../services/app-state.service';

@Injectable({
  providedIn: 'root'
})
export class AuthGuard implements CanActivate {

  constructor(
    private appState: AppStateService,
    private router: Router
  ) {}

  canActivate(
    route: ActivatedRouteSnapshot,
    state: RouterStateSnapshot
  ): boolean {
    // Vérifier si l'utilisateur est connecté avec un token JWT valide
    const isAuthenticated = this.appState.isAuthenticated();
    const userRights = this.appState.getUserRights();
    const username = this.appState.getUsername();
    const token = this.appState.getToken();

    if (isAuthenticated && userRights && username && token) {
      // L'utilisateur est connecté avec un token JWT, autoriser l'accès
      return true;
    }

    // L'utilisateur n'est pas connecté ou le token est manquant, rediriger vers la page de login
    // Enregistrer l'URL demandée pour rediriger après la connexion (sauf si c'est déjà /login)
    const returnUrl = state.url.startsWith('/login') ? '/' : state.url;
    this.router.navigate(['/login'], { 
      queryParams: { returnUrl: returnUrl } 
    });
    return false;
  }
}

