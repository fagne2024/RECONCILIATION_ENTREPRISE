import { ChangeDetectionStrategy, Component, Input } from '@angular/core';

export type DsOperationType = 'appro' | 'compense' | 'nivellement' | 'crossborder';

export const DS_OPERATION_TYPE_LABELS: Readonly<Record<DsOperationType, string>> = {
  appro: 'Appro',
  compense: 'Compense',
  nivellement: 'Nivellement',
  crossborder: 'Crossborder'
};

@Component({
  selector: 'ds-type-badge',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<span class="ds-badge ds-badge--type-{{ type }}">{{ label || defaultLabel }}</span>`
})
export class DsTypeBadgeComponent {
  @Input() type: DsOperationType = 'appro';
  @Input() label?: string | null;

  get defaultLabel(): string {
    return DS_OPERATION_TYPE_LABELS[this.type] || this.type;
  }
}
