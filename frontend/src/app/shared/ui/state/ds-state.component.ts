import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

export type DsStateKind = 'empty' | 'loading' | 'error';

const DEFAULTS: Readonly<Record<DsStateKind, { title: string; icon: string }>> = {
  empty: { title: 'Aucune donnée', icon: 'fa-inbox' },
  loading: { title: 'Chargement…', icon: 'fa-spinner fa-spin' },
  error: { title: 'Une erreur est survenue', icon: 'fa-exclamation-triangle' }
};

/**
 * Bloc d'état en page (vide, chargement, erreur). Les actions (« Réessayer »…)
 * sont projetées et gardent leurs gestionnaires dans la page.
 * Variante resserrée : classe `ds-state--compact` sur l'élément hôte.
 */
@Component({
  selector: 'ds-state',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrls: ['./ds-state.component.scss'],
  template: `
    <div class="state state--{{ kind }}"
         [attr.role]="kind === 'error' ? 'alert' : 'status'"
         [attr.aria-live]="kind === 'error' ? 'assertive' : 'polite'">
      <i class="fas {{ icon || defaults.icon }} state__icon" aria-hidden="true"></i>
      <p class="state__title">{{ title || defaults.title }}</p>
      <p *ngIf="message" class="state__message">{{ message }}</p>
      <div class="state__actions"><ng-content></ng-content></div>
    </div>
  `
})
export class DsStateComponent {
  @Input() kind: DsStateKind = 'empty';
  @Input() title?: string;
  @Input() message?: string;
  @Input() icon?: string;

  get defaults(): { title: string; icon: string } {
    return DEFAULTS[this.kind] || DEFAULTS.empty;
  }
}
