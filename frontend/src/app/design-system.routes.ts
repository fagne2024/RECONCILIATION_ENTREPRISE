import { Routes } from '@angular/router';

/** Catalogue interne : remplacé par un tableau vide en configuration production. */
export const DESIGN_SYSTEM_ROUTES: Routes = [
  {
    path: 'design-system',
    loadComponent: () =>
      import('./components/design-system/design-system-page.component').then(
        m => m.DesignSystemPageComponent
      )
  }
];
