import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslateModule } from '@ngx-translate/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Subject, takeUntil, catchError, of, debounceTime, distinctUntilChanged } from 'rxjs';
import { AppStateService } from '../../services/app-state.service';
import { PopupService } from '../../services/popup.service';
import { I18nService } from '../../services/i18n/i18n.service';

interface AuditLog {
  id: number;
  actorUsername: string;
  action: string;
  targetType: string;
  targetId: string;
  details: string;
  createdAt: string;
}

@Component({
  selector: 'app-platform-audit',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslateModule],
  templateUrl: './platform-audit.component.html',
  styleUrls: ['./platform-audit.component.scss']
})
export class PlatformAuditComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();
  private searchSubject = new Subject<string>();

  logs: AuditLog[] = [];
  loading = false;
  error: string | null = null;
  searchText = '';
  currentPage = 1;
  pageSize = 20;
  totalItems = 0;
  actionFilter = '';

  actions = [
    'ENTREPRISE_CREEE',
    'ENTREPRISE_MODIFIEE',
    'ENTREPRISE_SUSPENDUE',
    'ENTREPRISE_REACTIVEE',
    'ENTREPRISE_MODULES_MODIFIES',
    'LIEN_ACTIVATION_RENOVE',
    'COMPTE_MODIFIE',
    'COMPTE_SUPPRIME',
    'COMPTE_MOT_DE_PASSE_REINITIALISE',
    'COMPTE_2FA_REINITIALISE'
  ];

  constructor(
    private http: HttpClient,
    private appState: AppStateService,
    private popup: PopupService
  ) {}

  ngOnInit(): void {
    if (!this.appState.isSuperAdmin()) return;
    this.searchSubject.pipe(
      debounceTime(300),
      distinctUntilChanged(),
      takeUntil(this.destroy$)
    ).subscribe(() => {
      this.currentPage = 1;
      this.loadLogs();
    });
    this.loadLogs();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  loadLogs(): void {
    this.loading = true;
    this.http.get<any>(`/api/platform/audit-logs?limit=${this.pageSize}&offset=${(this.currentPage - 1) * this.pageSize}${this.searchText ? '&search=' + encodeURIComponent(this.searchText) : ''}${this.actionFilter ? '&action=' + encodeURIComponent(this.actionFilter) : ''}`, this.getAuthHeaders())
      .pipe(
        catchError(err => {
          this.loading = false;
          const message = err?.error?.message || err?.error?.error || I18nService.t('PLT.aud.errLoad');
          this.error = message;
          this.popup.showError(message);
          return of({ content: [], totalElements: 0 });
        })
      )
      .subscribe(response => {
        this.loading = false;
        this.logs = response.content ?? [];
        this.totalItems = response.totalElements ?? 0;
      });
  }

  private getAuthHeaders(): { withCredentials: true } {
    return { withCredentials: true };
  }

  onSearchChange(): void {
    this.searchSubject.next(this.searchText);
  }

  clearSearch(): void {
    this.searchText = '';
    this.searchSubject.next('');
  }

  onActionFilterChange(): void {
    this.currentPage = 1;
    this.loadLogs();
  }

  onPageSizeChange(): void {
    this.currentPage = 1;
    this.loadLogs();
  }

  onPageChange(page: number): void {
    this.currentPage = page;
    this.loadLogs();
  }

  totalPages(): number {
    return Math.ceil(this.totalItems / this.pageSize);
  }

  /** Fenêtre glissante de numéros de page (max 7). */
  getPageRange(): number[] {
    const total = this.totalPages();
    const windowSize = 7;
    if (total <= 0) {
      return [];
    }
    if (total <= windowSize) {
      return Array.from({ length: total }, (_, i) => i + 1);
    }
    let start = Math.max(1, this.currentPage - Math.floor(windowSize / 2));
    const end = Math.min(total, start + windowSize - 1);
    start = Math.max(1, end - windowSize + 1);
    return Array.from({ length: end - start + 1 }, (_, i) => start + i);
  }

  getActionClass(action: string): string {
    if (action.includes('CREEE') || action.includes('REACTIVEE')) return 'badge-success';
    if (action.includes('SUSPENDUE')) return 'badge-warning';
    if (action.includes('MODIFIE')) return 'badge-info';
    if (action.includes('RENOVE')) return 'badge-secondary';
    return 'badge-secondary';
  }
}