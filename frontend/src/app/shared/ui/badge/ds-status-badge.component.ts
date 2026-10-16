import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

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
  'matched': { label: 'Rapproché', icon: 'fa-check' },
  'amount-gap': { label: 'Écart de montant', icon: 'fa-exclamation-circle' },
  'missing-statement': { label: 'Absent du relevé', icon: 'fa-file-invoice' },
  'missing-bo': { label: 'Absent du BO', icon: 'fa-database' },
  'duplicate': { label: 'Doublon', icon: 'fa-clone' },
  'done': { label: 'Traité', icon: 'fa-check-circle' },
  'in-progress': { label: 'En cours', icon: 'fa-sync-alt' },
  'pending': { label: 'En attente', icon: 'fa-clock' },
  'failed': { label: 'Erreur', icon: 'fa-times-circle' }
};

@Component({
  selector: 'ds-status-badge',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span class="ds-badge ds-badge--{{ status }}">
      <i *ngIf="showIcon" class="fas {{ definition.icon }}" aria-hidden="true"></i>
      <span>{{ label || definition.label }}</span>
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
