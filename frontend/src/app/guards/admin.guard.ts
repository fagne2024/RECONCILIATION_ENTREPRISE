import { Injectable } from '@angular/core';
import { CanActivate, Router, RouterStateSnapshot, ActivatedRouteSnapshot } from '@angular/router';
import { AppStateService } from '../services/app-state.service';

@Injectable({
  providedIn: 'root'
})
export class AdminGuard implements CanActivate {

  constructor(
    private appState: AppStateService,
    private router: Router
  ) {}

  canActivate(route: ActivatedRouteSnapshot, state: RouterStateSnapshot): boolean {
    if (this.appState.isAdmin()) {
      return true;
    }

    this.router.navigate(['/dashboard'], {
      queryParams: { accessDenied: state.url }
    });
    return false;
  }
}










