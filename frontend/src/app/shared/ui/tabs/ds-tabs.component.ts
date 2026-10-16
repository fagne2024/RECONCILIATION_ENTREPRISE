import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  EventEmitter,
  Input,
  Output,
  QueryList,
  ViewChildren
} from '@angular/core';
import { CommonModule } from '@angular/common';

export interface DsTab {
  id: string;
  label: string;
  icon?: string;
  count?: number | null;
  disabled?: boolean;
  /** Identifiant du panneau associé dans la page (`aria-controls`). */
  panelId?: string;
}

const COUNT_FORMAT = new Intl.NumberFormat('fr-FR');

/**
 * Liste d'onglets (motif ARIA « tabs », activation manuelle au clavier :
 * les flèches déplacent le focus, Entrée/Espace activent). Les panneaux
 * restent dans la page, qui écoute `activeIdChange`.
 */
@Component({
  selector: 'ds-tabs',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrls: ['./ds-tabs.component.scss'],
  template: `
    <div class="tabs" role="tablist" [attr.aria-label]="ariaLabel" (keydown)="onKeydown($event)">
      <button #tabButton
              *ngFor="let tab of tabs; trackBy: trackById"
              type="button"
              role="tab"
              class="tabs__tab"
              [id]="tabDomId(tab)"
              [class.is-active]="tab.id === activeId"
              [attr.aria-selected]="tab.id === activeId"
              [attr.aria-controls]="tab.panelId || null"
              [attr.tabindex]="tab.id === rovingId ? 0 : -1"
              [disabled]="tab.disabled"
              (click)="select(tab)"
              (focus)="focusId = tab.id">
        <i *ngIf="tab.icon" class="fas {{ tab.icon }}" aria-hidden="true"></i>
        <span>{{ tab.label }}</span>
        <span *ngIf="tab.count != null" class="tabs__count ds-num">{{ formatCount(tab.count) }}</span>
      </button>
    </div>
  `
})
export class DsTabsComponent {
  @Input() tabs: DsTab[] = [];
  @Input() set activeId(value: string | null) {
    this._activeId = value;
    this.focusId = value;
  }
  get activeId(): string | null {
    return this._activeId;
  }
  @Input() ariaLabel = 'Onglets';
  /** Préfixe des identifiants DOM des onglets (utile pour `aria-labelledby` des panneaux). */
  @Input() idPrefix = 'ds-tab';
  @Output() activeIdChange = new EventEmitter<string>();

  @ViewChildren('tabButton') private buttons!: QueryList<ElementRef<HTMLButtonElement>>;

  focusId: string | null = null;
  private _activeId: string | null = null;

  /** Onglet atteignable par Tab : celui qui a le focus, sinon l'actif, sinon le premier disponible. */
  get rovingId(): string | null {
    const enabled = this.tabs.filter(t => !t.disabled);
    const known = (id: string | null) => !!id && enabled.some(t => t.id === id);
    if (known(this.focusId)) {
      return this.focusId;
    }
    if (known(this._activeId)) {
      return this._activeId;
    }
    return enabled.length ? enabled[0].id : null;
  }

  tabDomId(tab: DsTab): string {
    return `${this.idPrefix}-${tab.id}`;
  }

  trackById(_: number, tab: DsTab): string {
    return tab.id;
  }

  formatCount(count: number): string {
    return COUNT_FORMAT.format(count);
  }

  select(tab: DsTab): void {
    if (tab.disabled || tab.id === this._activeId) {
      return;
    }
    this.activeIdChange.emit(tab.id);
  }

  onKeydown(event: KeyboardEvent): void {
    const enabled = this.tabs.filter(t => !t.disabled);
    if (enabled.length === 0) {
      return;
    }
    const current = Math.max(0, enabled.findIndex(t => t.id === this.rovingId));
    let next: number;
    switch (event.key) {
      case 'ArrowRight':
        next = (current + 1) % enabled.length;
        break;
      case 'ArrowLeft':
        next = (current - 1 + enabled.length) % enabled.length;
        break;
      case 'Home':
        next = 0;
        break;
      case 'End':
        next = enabled.length - 1;
        break;
      default:
        return;
    }
    event.preventDefault();
    const target = enabled[next];
    this.focusId = target.id;
    const index = this.tabs.indexOf(target);
    const button = this.buttons.get(index);
    if (button) {
      button.nativeElement.focus();
    }
  }
}
