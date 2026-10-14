import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslateModule } from '@ngx-translate/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Subject, takeUntil, catchError, of } from 'rxjs';
import { Router } from '@angular/router';
import { AppStateService } from '../../services/app-state.service';
import { PopupService } from '../../services/popup.service';
import { I18nService } from '../../services/i18n/i18n.service';

interface Entreprise {
  id: number;
  code: string;
  nom: string;
  statut: string;
  createdAt: string;
  updatedAt: string | null;
  modulesActives: number;
}

interface CreateEntrepriseRequest {
  code: string;
  nom: string;
  adminUsername: string;
  adminEmail: string;
}

@Component({
  selector: 'app-platform-entreprises',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslateModule],
  templateUrl: './platform-entreprises.component.html',
  styleUrls: ['./platform-entreprises.component.scss']
})
export class PlatformEntreprisesComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();

  entreprises: Entreprise[] = [];
  loading = false;
  error: string | null = null;
  selectedEntreprise: Entreprise | null = null;
  showCreateModal = false;
  showEditModal = false;
  showSuspendModal = false;
  showReactivateModal = false;
  showResendModal = false;
  showArchiveModal = false;
  showRestoreModal = false;
  includeArchived = false;

  createForm: CreateEntrepriseRequest = {
    code: '',
    nom: '',
    adminUsername: '',
    adminEmail: ''
  };

  editForm: { nom: string; code: string } = { nom: '', code: '' };
  adminInfo: { username: string; email: string } | null = null;
  adminLoading = false;

  constructor(
    private http: HttpClient,
    private router: Router,
    private appState: AppStateService,
    private popup: PopupService
  ) {}

  ngOnInit(): void {
    if (!this.appState.isSuperAdmin()) {
      this.router.navigate(['/dashboard']);
      return;
    }
    this.loadEntreprises();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  loadEntreprises(): void {
    this.loading = true;
    this.error = null;
    // La liste complète est toujours chargée : l'affichage des entreprises
    // archivées est piloté cote client (KPI exacts, bascule instantanee).
    this.http.get<any>('/api/platform/entreprises?includeArchived=true', this.getAuthHeaders())
      .pipe(
        takeUntil(this.destroy$),
        catchError(err => {
          this.loading = false;
          this.error = this.apiMessage(err, 'PLT.ent.errLoad');
          return of(null);
        })
      )
      .subscribe(response => {
        this.loading = false;
        if (response) {
          this.entreprises = response;
        }
      });
  }

  get filteredEntreprises(): Entreprise[] {
    return this.includeArchived
      ? this.entreprises
      : this.entreprises.filter(e => e.statut !== 'ARCHIVEE');
  }

  private getAuthHeaders(): { headers: HttpHeaders } {
    const token = this.appState.getToken();
    return { headers: new HttpHeaders().set('Authorization', `Bearer ${token}`) };
  }

  /**
   * Message d'erreur lisible : le backend renvoie le detail dans
   * `err.error.message` (ex. 409 « email deja utilise ») ; le champ
   * `err.error.error` ne contient que la categorie (« Conflit »).
   * Affiche le detail reel, puis le libelle traduit en secours.
   */
  private apiMessage(err: any, fallbackKey: string): string {
    return err?.error?.message || err?.error?.error || I18nService.t(fallbackKey);
  }

  openCreateModal(): void {
    this.createForm = { code: '', nom: '', adminUsername: '', adminEmail: '' };
    this.showCreateModal = true;
  }

  closeCreateModal(): void {
    this.showCreateModal = false;
  }

  createEntreprise(): void {
    if (!this.createForm.code || !this.createForm.nom || !this.createForm.adminUsername || !this.createForm.adminEmail) {
      this.popup.showWarning(I18nService.t('PLT.ent.requiredFields'), I18nService.t('PLT.ent.missingFieldsTitle'));
      return;
    }
    this.loading = true;
    this.http.post<any>('/api/platform/entreprises', this.createForm, this.getAuthHeaders())
      .pipe(
        takeUntil(this.destroy$),
        catchError(err => {
          this.loading = false;
          const message = this.apiMessage(err, 'PLT.ent.errCreate');
          this.error = message;
          this.popup.showError(message);
          return of(null);
        })
      )
      .subscribe(response => {
        this.loading = false;
        if (response) {
          this.popup.showSuccess(I18nService.t('PLT.ent.okCreated'), I18nService.t('PLT.ent.okCreatedTitle'));
          this.closeCreateModal();
          this.loadEntreprises();
        }
      });
  }

  openEditModal(entreprise: Entreprise): void {
    this.selectedEntreprise = entreprise;
    this.editForm = { nom: entreprise.nom, code: entreprise.code };
    this.adminInfo = null;
    this.showEditModal = true;
    this.loadEntrepriseAdmin(entreprise.id);
  }

  private loadEntrepriseAdmin(id: number): void {
    this.adminLoading = true;
    this.http.get<any>(`/api/platform/entreprises/${id}`, this.getAuthHeaders())
      .pipe(
        takeUntil(this.destroy$),
        catchError(err => {
          this.adminLoading = false;
          this.adminInfo = null;
          return of(null);
        })
      )
      .subscribe(response => {
        this.adminLoading = false;
        if (response && Array.isArray(response.users)) {
          const users = response.users as Array<{ username: string; email: string | null; profil: string | null }>;
          const byName = users.find(u => (u.username || '').toLowerCase() === 'admin');
          const byProfil = users.find(u => u.profil && ['ADMIN', 'ADMINISTRATEUR'].includes(String(u.profil).toUpperCase()));
          const admin = byName || byProfil || null;
          this.adminInfo = admin ? { username: admin.username, email: admin.email || '' } : null;
        }
      });
  }

  closeEditModal(): void {
    this.showEditModal = false;
  }

  confirmEdit(): void {
    if (!this.selectedEntreprise) return;
    if (!this.editForm.nom || !this.editForm.nom.trim()) {
      this.popup.showWarning(I18nService.t('PLT.ent.requiredFields'), I18nService.t('PLT.ent.missingFieldsTitle'));
      return;
    }
    this.loading = true;
    const payload = { nom: this.editForm.nom.trim(), code: this.editForm.code.trim() };
    this.http.put<any>(`/api/platform/entreprises/${this.selectedEntreprise.id}`, payload, this.getAuthHeaders())
      .pipe(
        takeUntil(this.destroy$),
        catchError(err => {
          this.loading = false;
          const message = this.apiMessage(err, 'PLT.ent.errUpdate');
          this.error = message;
          this.popup.showError(message);
          return of(null);
        })
      )
      .subscribe(response => {
        this.loading = false;
        if (response) {
          this.popup.showSuccess(I18nService.t('PLT.ent.okUpdated'), I18nService.t('PLT.ent.okUpdatedTitle'));
          this.closeEditModal();
          this.loadEntreprises();
        }
      });
  }

  viewEntreprise(entreprise: Entreprise): void {
    this.selectedEntreprise = entreprise;
    this.router.navigate(['/platform/modules'], { queryParams: { entrepriseId: entreprise.id } });
  }

  openSuspendModal(entreprise: Entreprise): void {
    this.selectedEntreprise = entreprise;
    this.showSuspendModal = true;
  }

  closeSuspendModal(): void {
    this.showSuspendModal = false;
  }

  confirmSuspend(): void {
    if (!this.selectedEntreprise) return;
    this.loading = true;
    this.http.post<any>(`/api/platform/entreprises/${this.selectedEntreprise.id}/suspend`, {}, this.getAuthHeaders())
      .pipe(
        takeUntil(this.destroy$),
        catchError(err => {
          this.loading = false;
          const message = this.apiMessage(err, 'PLT.ent.errSuspend');
          this.error = message;
          this.popup.showError(message);
          return of(null);
        })
      )
      .subscribe(() => {
        this.loading = false;
        this.popup.showSuccess(I18nService.t('PLT.ent.okSuspended'));
        this.closeSuspendModal();
        this.loadEntreprises();
      });
  }

  openReactivateModal(entreprise: Entreprise): void {
    this.selectedEntreprise = entreprise;
    this.showReactivateModal = true;
  }

  closeReactivateModal(): void {
    this.showReactivateModal = false;
  }

  confirmReactivate(): void {
    if (!this.selectedEntreprise) return;
    this.loading = true;
    this.http.post<any>(`/api/platform/entreprises/${this.selectedEntreprise.id}/reactivate`, {}, this.getAuthHeaders())
      .pipe(
        takeUntil(this.destroy$),
        catchError(err => {
          this.loading = false;
          const message = this.apiMessage(err, 'PLT.ent.errReactivate');
          this.error = message;
          this.popup.showError(message);
          return of(null);
        })
      )
      .subscribe(() => {
        this.loading = false;
        this.popup.showSuccess(I18nService.t('PLT.ent.okReactivated'));
        this.closeReactivateModal();
        this.loadEntreprises();
      });
  }

  openArchiveModal(entreprise: Entreprise): void {
    this.selectedEntreprise = entreprise;
    this.showArchiveModal = true;
  }

  closeArchiveModal(): void {
    this.showArchiveModal = false;
  }

  confirmArchive(): void {
    if (!this.selectedEntreprise) return;
    this.loading = true;
    this.http.post<any>(`/api/platform/entreprises/${this.selectedEntreprise.id}/archive`, {}, this.getAuthHeaders())
      .pipe(
        takeUntil(this.destroy$),
        catchError(err => {
          this.loading = false;
          const message = this.apiMessage(err, 'PLT.ent.errArchive');
          this.error = message;
          this.popup.showError(message);
          return of(null);
        })
      )
      .subscribe(() => {
        this.loading = false;
        this.popup.showSuccess(I18nService.t('PLT.ent.okArchived'));
        this.closeArchiveModal();
        this.loadEntreprises();
      });
  }

  openRestoreModal(entreprise: Entreprise): void {
    this.selectedEntreprise = entreprise;
    this.showRestoreModal = true;
  }

  closeRestoreModal(): void {
    this.showRestoreModal = false;
  }

  confirmRestore(): void {
    if (!this.selectedEntreprise) return;
    this.loading = true;
    this.http.post<any>(`/api/platform/entreprises/${this.selectedEntreprise.id}/reactivate`, {}, this.getAuthHeaders())
      .pipe(
        takeUntil(this.destroy$),
        catchError(err => {
          this.loading = false;
          const message = this.apiMessage(err, 'PLT.ent.errReactivate');
          this.error = message;
          this.popup.showError(message);
          return of(null);
        })
      )
      .subscribe(() => {
        this.loading = false;
        this.popup.showSuccess(I18nService.t('PLT.ent.okRestored'));
        this.closeRestoreModal();
        this.loadEntreprises();
      });
  }

  openResendModal(entreprise: Entreprise): void {
    this.selectedEntreprise = entreprise;
    this.showResendModal = true;
  }

  closeResendModal(): void {
    this.showResendModal = false;
  }

  confirmResend(): void {
    if (!this.selectedEntreprise) return;
    this.loading = true;
    this.http.post<any>(`/api/platform/entreprises/${this.selectedEntreprise.id}/resend-activation`, {}, this.getAuthHeaders())
      .pipe(
        takeUntil(this.destroy$),
        catchError(err => {
          this.loading = false;
          const message = this.apiMessage(err, 'PLT.ent.errResend');
          this.error = message;
          this.popup.showError(message);
          return of(null);
        })
      )
      .subscribe(() => {
        this.loading = false;
        this.popup.showSuccess(I18nService.t('PLT.ent.okResent'));
        this.closeResendModal();
      });
  }

  getStatutClass(statut: string): string {
    switch (statut) {
      case 'ACTIVE': return 'badge-success';
      case 'SUSPENDUE': return 'badge-warning';
      case 'ARCHIVEE': return 'badge-secondary';
      default: return 'badge-secondary';
    }
  }

  getStatutLabel(statut: string): string {
    switch (statut) {
      case 'ACTIVE': return 'PLT.ent.statusActive';
      case 'SUSPENDUE': return 'PLT.ent.statusSuspended';
      case 'ARCHIVEE': return 'PLT.ent.statusArchived';
      default: return 'PLT.ent.statusSuspended';
    }
  }

  countStatut(statut: string): number {
    return this.entreprises.filter(e => e.statut === statut).length;
  }
}