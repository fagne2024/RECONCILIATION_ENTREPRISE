import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslateModule } from '@ngx-translate/core';
import { I18nService } from '../../../services/i18n/i18n.service';

const INTEGER_FORMAT = new Intl.NumberFormat('fr-FR');

/**
 * Pagination de présentation (pages numérotées à partir de 1). Elle n'effectue
 * aucun découpage : la page reçoit `pageChange` et appelle sa propre méthode.
 */
@Component({
  selector: 'ds-pagination',
  standalone: true,
  imports: [CommonModule, TranslateModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrls: ['./ds-pagination.component.scss'],
  template: `
    <nav class="pg" [attr.aria-label]="ariaLabel">
      <p *ngIf="rangeLabel" class="pg__range ds-num">{{ rangeLabel }}</p>
      <label *ngIf="pageSizes?.length" class="pg__size">
        <span class="pg__size-label">{{ 'PLT.aud.perPage' | translate }}</span>
        <select class="ds-select" [value]="pageSize || pageSizes[0]" (change)="onPageSize($event)">
          <option *ngFor="let size of pageSizes" [value]="size">{{ size }}</option>
        </select>
      </label>
      <div class="pg__controls">
        <button type="button" class="ds-btn ds-btn--secondary ds-btn--sm ds-btn--icon"
                [disabled]="isFirst" (click)="go(1)" [attr.aria-label]="'PAG.first' | translate">
          <i class="fas fa-angle-double-left" aria-hidden="true"></i>
        </button>
        <button type="button" class="ds-btn ds-btn--secondary ds-btn--sm"
                [disabled]="isFirst" (click)="go(page - 1)">
          <i class="fas fa-angle-left" aria-hidden="true"></i>
          <span class="pg__label">{{ 'PAG.previous' | translate }}</span>
        </button>
        <span class="pg__status ds-num" aria-live="polite">{{ 'LBL.ui.pageSur' | translate: { p0: safePage, p1: safeCount } }}</span>
        <button type="button" class="ds-btn ds-btn--secondary ds-btn--sm"
                [disabled]="isLast" (click)="go(page + 1)">
          <span class="pg__label">{{ 'PAG.next' | translate }}</span>
          <i class="fas fa-angle-right" aria-hidden="true"></i>
        </button>
        <button type="button" class="ds-btn ds-btn--secondary ds-btn--sm ds-btn--icon"
                [disabled]="isLast" (click)="go(safeCount)" [attr.aria-label]="'PAG.last' | translate">
          <i class="fas fa-angle-double-right" aria-hidden="true"></i>
        </button>
      </div>
    </nav>
  `
})
export class DsPaginationComponent {
  @Input() page = 1;
  @Input() pageCount = 1;
  /** Facultatifs : affichent « 1–50 sur 1 234 ». */
  @Input() totalItems?: number | null;
  @Input() pageSize?: number | null;
  /** Si fourni, affiche un sélecteur de taille. N'appelle aucune API. */
  @Input() pageSizes?: number[] | null;
  @Input() itemLabel = 'lignes';
  @Input() ariaLabel = 'Pagination';
  @Output() pageChange = new EventEmitter<number>();
  @Output() pageSizeChange = new EventEmitter<number>();

  get safeCount(): number {
    return Math.max(1, Math.floor(this.pageCount || 1));
  }

  get safePage(): number {
    return Math.min(Math.max(1, Math.floor(this.page || 1)), this.safeCount);
  }

  get isFirst(): boolean {
    return this.safePage <= 1;
  }

  get isLast(): boolean {
    return this.safePage >= this.safeCount;
  }

  get rangeLabel(): string | null {
    if (this.totalItems == null || !this.pageSize) {
      return null;
    }
    if (this.totalItems === 0) {
      return `0 ${this.itemLabel}`;
    }
    const start = (this.safePage - 1) * this.pageSize + 1;
    const end = Math.min(this.safePage * this.pageSize, this.totalItems);
    return I18nService.t('PAG.msg.sur', { p0: INTEGER_FORMAT.format(start), p1: INTEGER_FORMAT.format(end), p2: INTEGER_FORMAT.format(this.totalItems), p3: this.itemLabel });
  }

  go(target: number): void {
    const next = Math.min(Math.max(1, target), this.safeCount);
    if (next !== this.safePage) {
      this.pageChange.emit(next);
    }
  }

  onPageSize(event: Event): void {
    const value = Number((event.target as HTMLSelectElement).value);
    if (value > 0 && value !== this.pageSize) {
      this.pageSizeChange.emit(value);
    }
  }
}
