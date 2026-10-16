import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

/**
 * En-tête de page : surtitre, titre (serif), sous-titre et zone d'actions.
 * Les actions sont projetées avec l'attribut `dsPageHeaderActions` ; elles
 * conservent leurs propres `(click)` et conditions dans la page.
 */
@Component({
  selector: 'ds-page-header',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrls: ['./ds-page-header.component.scss'],
  template: `
    <header class="ph">
      <div class="ph__text">
        <p *ngIf="eyebrow" class="ph__eyebrow">{{ eyebrow }}</p>
        <h1 *ngIf="level === 1" class="ph__title">{{ title }}</h1>
        <h2 *ngIf="level === 2" class="ph__title">{{ title }}</h2>
        <p *ngIf="subtitle" class="ph__subtitle">{{ subtitle }}</p>
        <ng-content></ng-content>
      </div>
      <div class="ph__actions">
        <ng-content select="[dsPageHeaderActions]"></ng-content>
      </div>
    </header>
  `
})
export class DsPageHeaderComponent {
  @Input() title = '';
  @Input() eyebrow?: string;
  @Input() subtitle?: string;
  /** Niveau du titre : 1 par défaut, 2 si la page possède déjà un `h1`. */
  @Input() level: 1 | 2 = 1;
}
