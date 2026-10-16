import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  DS_UI,
  DsStatus,
  DsOperationType,
  DsTab
} from '../../shared/ui';

@Component({
  selector: 'app-design-system-page',
  standalone: true,
  imports: [CommonModule, ...DS_UI],
  templateUrl: './design-system-page.component.html',
  styleUrls: ['./design-system-page.component.scss']
})
export class DesignSystemPageComponent {
  readonly statuses: DsStatus[] = [
    'matched', 'amount-gap', 'missing-statement', 'missing-bo',
    'duplicate', 'done', 'in-progress', 'pending', 'failed'
  ];
  readonly types: DsOperationType[] = ['appro', 'compense', 'nivellement', 'crossborder'];
  readonly colorVars = [
    '--color-bg', '--color-surface', '--color-text-primary', '--color-text-muted',
    '--color-accent', '--color-success', '--color-warning', '--color-error',
    '--color-info', '--color-duplicate', '--color-nav-bg'
  ];

  tabs: DsTab[] = [
    { id: 'a', label: 'Correspondances', count: 128, panelId: 'ds-panel-a' },
    { id: 'b', label: 'Écarts BO', count: 14, panelId: 'ds-panel-b' },
    { id: 'c', label: 'Écarts partenaire', count: 9, panelId: 'ds-panel-c' }
  ];
  activeTab = 'a';

  demoPage = 2;
  demoPageSize = 10;

  onTab(id: string): void {
    this.activeTab = id;
  }

  onPage(page: number): void {
    this.demoPage = page;
  }

  onPageSize(size: number): void {
    this.demoPageSize = size;
    this.demoPage = 1;
  }
}
