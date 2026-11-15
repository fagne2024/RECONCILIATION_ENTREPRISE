import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslateModule } from '@ngx-translate/core';

/**
 * Statuts visuels. Le composant n'en déduit aucun : la page fournit le statut
 * déjà calculé par la logique métier.
 */
export type DsStatus =
  | 'matched'
  | 'amount-gap'
  | 'missing-statement'
  | 'missing-bo'
  | 'duplicate'
  | 'done'
  | 'in-progress'
  | 'pending'
  | 'failed';

interface StatusDefinition {
  label: string;
  icon: string;
}

export const DS_STATUS_DEFINITIONS: Readonly<Record<DsStatus, StatusDefinition>> = {
  'matched': { label: 'DS.status.matched', icon: 'fa-check' },
  'amount-gap': { label: 'DS.status.amountGap', icon: 'fa-exclamation-circle' },
  'missing-statement': { label: 'DS.status.missingStatement', icon: 'fa-file-invoice' },
  'missing-bo': { label: 'DS.status.missingBo', icon: 'fa-database' },
  'duplicate': { label: 'DS.status.duplicate', icon: 'fa-clone' },
  'done': { label: 'DS.status.done', icon: 'fa-check-circle' },
  'in-progress': { label: 'DS.status.inProgress', icon: 'fa-sync-alt' },
  'pending': { label: 'DS.status.pending', icon: 'fa-clock' },
  'failed': { label: 'DS.status.failed', icon: 'fa-times-circle' }
};

@Component({
  selector: 'ds-status-badge',
  standalone: true,
  imports: [CommonModule, TranslateModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span class="ds-badge ds-badge--{{ status }}">
      <i *ngIf="showIcon" class="fas {{ definition.icon }}" aria-hidden="true"></i>
      <span>{{ label || (definition.label | translate) }}</span>
    </span>
  `
})
export class DsStatusBadgeComponent {
  @Input() status: DsStatus = 'pending';
  /** Libellé affiché à la place du libellé par défaut (ex. « OK », « NOK »). */
  @Input() label?: string | null;
  @Input() showIcon = true;

  get definition(): StatusDefinition {
    return DS_STATUS_DEFINITIONS[this.status] || DS_STATUS_DEFINITIONS['pending'];
  }
}
