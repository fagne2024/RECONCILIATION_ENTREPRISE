import { DsStatusBadgeComponent } from './badge/ds-status-badge.component';
import { DsTypeBadgeComponent } from './badge/ds-type-badge.component';
import { DsKpiCardComponent } from './kpi-card/ds-kpi-card.component';
import { DsPageHeaderComponent } from './page-header/ds-page-header.component';
import { DsPaginationComponent } from './pagination/ds-pagination.component';
import { DsStateComponent } from './state/ds-state.component';
import { DsTabsComponent } from './tabs/ds-tabs.component';

export * from './badge/ds-status-badge.component';
export * from './badge/ds-type-badge.component';
export * from './kpi-card/ds-kpi-card.component';
export * from './page-header/ds-page-header.component';
export * from './pagination/ds-pagination.component';
export * from './state/ds-state.component';
export * from './tabs/ds-tabs.component';
export * from './dialog/dialog-a11y';

/**
 * Composants de présentation (données en entrée, événements en sortie).
 * Les classes CSS `ds-*` (boutons, champs, tableaux, filtres, badges) sont
 * dans `src/styles/_components.scss` et s'appliquent sans composant Angular.
 *
 * À ajouter aux `imports` d'un composant standalone ou d'un NgModule.
 */
export const DS_UI = [
  DsStatusBadgeComponent,
  DsTypeBadgeComponent,
  DsKpiCardComponent,
  DsPageHeaderComponent,
  DsPaginationComponent,
  DsStateComponent,
  DsTabsComponent
] as const;
