import { Injectable } from '@angular/core';
import { HttpInterceptor, HttpRequest, HttpHandler, HttpEvent, HttpErrorResponse } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { Router } from '@angular/router';
import { AppStateService } from '../services/app-state.service';
import { UserLogService } from '../services/user-log.service';
import { PopupService } from '../services/popup.service';
import { findNavigationAccessContextByRoute } from '../constants/app-navigation-catalog';

@Injectable()
export class AuthInterceptor implements HttpInterceptor {
  private permissionPopupOpen = false;
  /** Anti-reentrance : une seule séquence déconnexion par vague de 401. */
  private handlingUnauthorized = false;

  constructor(
    private appState: AppStateService,
    private router: Router,
    private userLogService: UserLogService,
    private popupService: PopupService
  ) {}

  intercept(req: HttpRequest<any>, next: HttpHandler): Observable<HttpEvent<any>> {
    // Récupérer le token JWT depuis AppStateService
    const token = this.appState.getToken();

    // Construire les headers à ajouter
    const headers: { [key: string]: string } = {};

    // Cookie HttpOnly AUTH_TOKEN (withCredentials). Le Bearer n'est envoyé
    // que s'il reste un JWT en mémoire (clients / sessions héritées).
    if (token && token !== 'cookie') {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const routePath = this.router.url.split('?')[0];
    const navContext = findNavigationAccessContextByRoute(routePath);
    if (navContext && this.appState.hasNavigationAccess(navContext)) {
      const existingModule = req.headers.get('X-Permission-Module');
      const parentModule = navContext.apiModuleName;
      const shouldUseSubmenuModule = !existingModule
        || this.isSameModuleName(existingModule, parentModule);
      if (shouldUseSubmenuModule) {
        headers['X-Permission-Module'] = navContext.accessModuleName;
      }
    }

    // Cloner la requête et ajouter les headers
    const clonedRequest = req.clone({
      setHeaders: headers,
      withCredentials: true
    });

    // Gérer les erreurs HTTP (notamment 401 Unauthorized)
    return next.handle(clonedRequest).pipe(
      catchError((error: HttpErrorResponse) => {
        // 401 = session expirée -> déconnecter. SAUF :
        //  - /api/auth/logout : la déconnexion est déjà en cours ; réagir ici
        //    provoquerait une BOUCLE INFINIE (logout -> 401 -> logout -> ...).
        //  - login / verify-2fa : identifiants incorrects, gérés par le composant.
        if (error.status === 401 && !this.isAuthRequest(req.url)) {
          this.handleSessionExpired();
        }

        if (error.status === 403 && !this.isAuthRequest(req.url)) {
          this.showPermissionDeniedMessage(error);
        }

        return throwError(() => error);
      })
    );
  }

  /**
   * Déconnexion unique en cas de session expirée (protégée contre la réentrance :
   * plusieurs requêtes 401 simultanées ne déclenchent qu'une seule déconnexion).
   */
  private handleSessionExpired(): void {
    if (this.handlingUnauthorized) {
      return;
    }
    this.handlingUnauthorized = true;

    console.warn('Token invalide ou expiré, déconnexion...');
    const currentUser = this.appState.getUsername();
    if (currentUser) {
      this.userLogService.logActivity('deconnexion', 'Authentification', currentUser, 'Session expirée (401)');
    }
    this.appState.logout();

    // Ne rediriger vers login que si on n'y est pas déjà (évite la boucle infinie)
    const currentUrl = this.router.url;
    if (!currentUrl.startsWith('/login')) {
      this.router.navigate(['/login'], {
        queryParams: { returnUrl: currentUrl }
      });
    }

    // Réarmement différé : une future expiration de session doit rester gérée.
    setTimeout(() => {
      this.handlingUnauthorized = false;
    }, 1000);
  }

  private isAuthRequest(url: string): boolean {
    return url.includes('/api/auth/login')
      || url.includes('/api/auth/verify-2fa')
      || url.includes('/api/auth/logout');
  }

  private isSameModuleName(left: string, right: string): boolean {
    const normalize = (value: string) => value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim()
      .toLowerCase();
    return normalize(left) === normalize(right);
  }

  private showPermissionDeniedMessage(error: HttpErrorResponse): void {
    if (this.permissionPopupOpen) {
      return;
    }

    const message =
      error.error?.message ||
      error.error?.error ||
      'Vous n\'avez pas la permission nécessaire pour effectuer cette action avec votre profil.';

    this.permissionPopupOpen = true;
    this.popupService
      .showWarning(message, 'Permission refusée')
      .finally(() => {
        this.permissionPopupOpen = false;
      });
  }
}

