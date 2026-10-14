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

    // Si un token JWT existe, ajouter le header Authorization
    if (token) {
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
      setHeaders: headers
    });

    // Gérer les erreurs HTTP (notamment 401 Unauthorized)
    return next.handle(clonedRequest).pipe(
      catchError((error: HttpErrorResponse) => {
        // Si erreur 401 (Non autorisé), déconnecter l'utilisateur
        if (error.status === 401) {
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
        }

        if (error.status === 403 && !this.isAuthRequest(req.url)) {
          this.showPermissionDeniedMessage(error);
        }

        return throwError(() => error);
      })
    );
  }

  private isAuthRequest(url: string): boolean {
    return url.includes('/api/auth/login') || url.includes('/api/auth/verify-2fa');
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

