import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

export type DsTone = 'neutral' | 'accent' | 'success' | 'warning' | 'error' | 'info' | 'duplicate';

const NUMBER_FORMAT = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 });

@Component({
  selector: 'ds-kpi-card',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrls: ['./ds-kpi-card.component.scss'],
  template: `
    <div class="kpi kpi--{{ tone }}" [attr.aria-busy]="loading || null">
      <div class="kpi__head">
        <i *ngIf="icon" class="fas {{ icon }} kpi__icon" aria-hidden="true"></i>
        <span class="kpi__label">{{ label }}</span>
      </div>
      <div class="kpi__value ds-num">
        <span *ngIf="!loading; else skeleton">{{ displayValue }}</span>
        <span *ngIf="!loading && unit" class="kpi__unit">{{ unit }}</span>
        <ng-template #skeleton>
          <span class="kpi__skeleton" aria-hidden="true"></span>
          <span class="ds-visually-hidden">Chargement</span>
        </ng-template>
      </div>
      <div *ngIf="hint" class="kpi__hint">{{ hint }}</div>
      <ng-content></ng-content>
    </div>
  `
})
export class DsKpiCardComponent {
  @Input() label = '';
  /** Nombre (formaté en fr-FR) ou texte déjà formaté par la page. */
  @Input() value: number | string | null | undefined = null;
  @Input() unit?: string;
  @Input() hint?: string;
  @Input() icon?: string;
  @Input() tone: DsTone = 'neutral';
  @Input() loading = false;

  get displayValue(): string {
    if (this.value === null || this.value === undefined || this.value === '') {
      return '—';
    }
    return typeof this.value === 'number' ? NUMBER_FORMAT.format(this.value) : this.value;
  }
}
