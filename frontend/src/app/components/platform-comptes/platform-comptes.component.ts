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

interface Compte {
  id: number;
  username: string;
  email: string | null;
  enabled: boolean;
  enabled2fa: boolean;
  profilNom: string | null;
  entrepriseId: number;
  entrepriseCode: string;
  entrepriseNom: string;
}

interface EntrepriseOption {
  id: number;
  code: string;
  nom: string;
}

@Component({
  selector: 'app-platform-comptes',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslateModule],
  templateUrl: './platform-comptes.component.html',
  styleUrls: ['./platform-comptes.component.scss']
})
export class PlatformComptesComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();

  comptes: Compte[] = [];
  loading = false;
  error: string | null = null;

  searchText = '';
  entrepriseFilter = '';
  showDisabledOnly = false;

  selectedCompte: Compte | null = null;
  showEditModal = false;
  editForm: { username: string; email: string; enabled: boolean } = {
    username: '',
    email: '',
    enabled: true
  };

  /** Liste complete des entreprises (pour le modal de creation). */
  entreprisesOptions: EntrepriseOption[] = [];
  showCreateModal = false;
  createForm: { username: string; email: string; entrepriseId: number | null } = {
    username: '',
    email: '',
    entrepriseId: null
  };
  submitting = false;

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
    this.loadComptes();
    this.loadEntreprises();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  // ------------------------------------------------------------------
  // Donnees derivees
  // ------------------------------------------------------------------

  get entreprises(): EntrepriseOption[] {
    const seen = new Map<string, EntrepriseOption>();
    for (const c of this.comptes) {
      if (!seen.has(c.entrepriseCode)) {
        seen.set(c.entrepriseCode, { id: c.entrepriseId, code: c.entrepriseCode, nom: c.entrepriseNom });
      }
    }
    return Array.from(seen.values()).sort((a, b) => a.code.localeCompare(b.code));
  }

  get filteredComptes(): Compte[] {
    const q = this.searchText.trim().toLowerCase();
    const ef = this.entrepriseFilter;
    return this.comptes.filter(c => {
      if (ef && c.entrepriseCode !== ef) {
        return false;
      }
      if (this.showDisabledOnly && c.enabled) {
        return false;
      }
      if (q) {
        const hay = `${c.username} ${c.email || ''}`.toLowerCase();
        if (!hay.includes(q)) {
          return false;
        }
      }
      return true;
    });
  }

  get kpiTotal(): number {
    return this.comptes.length;
  }

  get kpiActive(): number {
    return this.comptes.filter(c => c.enabled).length;
  }

  get kpi2FA(): number {
    return this.comptes.filter(c => c.enabled2fa).length;
  }

  // ------------------------------------------------------------------
  // Chargement
  // ------------------------------------------------------------------

  loadComptes(): void {
    this.loading = true;
    this.error = null;
    this.http.get<any>('/api/platform/accounts', this.getAuthHeaders())
      .pipe(
        takeUntil(this.destroy$),
        catchError(err => {
          this.loading = false;
          this.error = this.apiMessage(err, 'PLT.acc.errLoad');
          return of(null);
        })
      )
      .subscribe(response => {
        this.loading = false;
        if (response) {
          this.comptes = response;
        }
      });
  }

  private getAuthHeaders(): { withCredentials: true } {
    return { withCredentials: true };
  }

  /**
   * Entreprises de la plateforme (hors archivees) : necessaire pour rattacher
   * un nouveau compte a une entreprise sans compter sur les comptes charges.
   */
  loadEntreprises(): void {
    this.http.get<any[]>('/api/platform/entreprises', this.getAuthHeaders())
      .pipe(
        takeUntil(this.destroy$),
        catchError(() => of([]))
      )
      .subscribe(response => {
        this.entreprisesOptions = (response || [])
          .filter(e => e && e.id != null)
          .map(e => ({ id: e.id, code: e.code, nom: e.nom }))
          .sort((a, b) => a.code.localeCompare(b.code));
      });
  }

  /**
   * Message d'erreur lisible : le backend renvoie le detail dans
   * `err.error.message` (ex. 409 « email deja utilise ») ; le champ
   * `err.error.error` ne contient que la categorie (« Conflit »).
   */
  private apiMessage(err: any, fallbackKey: string): string {
    return err?.error?.message || err?.error?.error || I18nService.t(fallbackKey);
  }

  // ------------------------------------------------------------------
  // Creation
  // ------------------------------------------------------------------

  openCreate(): void {
    this.createForm = { username: '', email: '', entrepriseId: null };
    this.showCreateModal = true;
  }

  closeCreate(): void {
    this.showCreateModal = false;
  }

  saveCreate(): void {
    const username = this.createForm.username.trim();
    const email = this.createForm.email.trim();
    const entrepriseId = this.createForm.entrepriseId;
    if (!username || !email || entrepriseId == null) {
      this.popup.showWarning(
        I18nService.t('PLT.acc.createRequired'),
        I18nService.t('PLT.acc.missingFieldsTitle')
      );
      return;
    }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      this.popup.showWarning(
        I18nService.t('PLT.acc.invalidEmail'),
        I18nService.t('PLT.acc.missingFieldsTitle')
      );
      return;
    }

    this.submitting = true;
    const payload = { username, email, entrepriseId };
    this.http.post<any>('/api/platform/accounts', payload, this.getAuthHeaders())
      .pipe(
        takeUntil(this.destroy$),
        catchError(err => {
          this.submitting = false;
          const message = this.apiMessage(err, 'PLT.acc.errCreate');
          this.error = message;
          this.popup.showError(message);
          return of(null);
        })
      )
      .subscribe(response => {
        this.submitting = false;
        if (response) {
          // Le mot de passe temporaire n'est renvoye qu'a la creation (si
          // l'email n'a pas pu etre envoye, c'est la seule occasion de le
          // transmettre a l'utilisateur) : on l'affiche toujours.
          const detail = response.temporaryPassword
            ? ' ' + I18nService.t('PLT.acc.createTempPassword', { password: response.temporaryPassword })
            : '';
          this.popup.showSuccess((response.message || I18nService.t('PLT.acc.okCreated')) + detail);
          this.closeCreate();
          this.loadComptes();
        }
      });
  }

  // ------------------------------------------------------------------
  // Modification
  // ------------------------------------------------------------------

  openEdit(compte: Compte): void {
    this.selectedCompte = compte;
    this.editForm = {
      username: compte.username,
      email: compte.email || '',
      enabled: compte.enabled
    };
    this.showEditModal = true;
  }

  closeEdit(): void {
    this.showEditModal = false;
  }

  saveEdit(): void {
    if (!this.selectedCompte) {
      return;
    }
    const username = this.editForm.username.trim();
    const email = this.editForm.email.trim();
    if (!username || !email) {
      this.popup.showWarning(
        I18nService.t('PLT.acc.requiredFields'),
        I18nService.t('PLT.acc.missingFieldsTitle')
      );
      return;
    }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      this.popup.showWarning(
        I18nService.t('PLT.acc.invalidEmail'),
        I18nService.t('PLT.acc.missingFieldsTitle')
      );
      return;
    }

    this.submitting = true;
    const payload = { username, email, enabled: this.editForm.enabled };
    this.http.put<any>(`/api/platform/accounts/${this.selectedCompte.id}`, payload, this.getAuthHeaders())
      .pipe(
        takeUntil(this.destroy$),
        catchError(err => {
          this.submitting = false;
          const message = this.apiMessage(err, 'PLT.acc.errUpdate');
          this.error = message;
          this.popup.showError(message);
          return of(null);
        })
      )
      .subscribe(response => {
        this.submitting = false;
        if (response) {
          this.popup.showSuccess(response.message || I18nService.t('PLT.acc.okUpdated'));
          this.closeEdit();
          this.loadComptes();
        }
      });
  }

  // ------------------------------------------------------------------
  // Reinitialisations / suppression
  // ------------------------------------------------------------------

  async resetPassword(compte: Compte): Promise<void> {
    const confirmed = await this.popup.showConfirm(
      I18nService.t('PLT.acc.resetPasswordBody', { username: compte.username }),
      I18nService.t('PLT.acc.resetPasswordTitle')
    );
    if (!confirmed) {
      return;
    }
    this.http.post<any>(`/api/platform/accounts/${compte.id}/reset-password`, {}, this.getAuthHeaders())
      .pipe(
        takeUntil(this.destroy$),
        catchError(err => {
          const message = this.apiMessage(err, 'PLT.acc.errResetPassword');
          this.error = message;
          this.popup.showError(message);
          return of(null);
        })
      )
      .subscribe(response => {
        if (response) {
          this.popup.showSuccess(response.message || I18nService.t('PLT.acc.okPasswordReset'));
        }
      });
  }

  async reset2FA(compte: Compte): Promise<void> {
    const confirmed = await this.popup.showConfirm(
      I18nService.t('PLT.acc.reset2FABody', { username: compte.username }),
      I18nService.t('PLT.acc.reset2FATitle')
    );
    if (!confirmed) {
      return;
    }
    this.http.post<any>(`/api/platform/accounts/${compte.id}/reset-2fa`, {}, this.getAuthHeaders())
      .pipe(
        takeUntil(this.destroy$),
        catchError(err => {
          const message = this.apiMessage(err, 'PLT.acc.errReset2FA');
          this.error = message;
          this.popup.showError(message);
          return of(null);
        })
      )
      .subscribe(response => {
        if (response) {
          this.popup.showSuccess(response.message || I18nService.t('PLT.acc.ok2FAReset'));
        }
      });
  }

  async deleteCompte(compte: Compte): Promise<void> {
    const confirmed = await this.popup.showConfirm(
      I18nService.t('PLT.acc.deleteBody', { username: compte.username, entreprise: compte.entrepriseNom }),
      I18nService.t('PLT.acc.deleteTitle')
    );
    if (!confirmed) {
      return;
    }
    this.http.delete<any>(`/api/platform/accounts/${compte.id}`, this.getAuthHeaders())
      .pipe(
        takeUntil(this.destroy$),
        catchError(err => {
          const message = this.apiMessage(err, 'PLT.acc.errDelete');
          this.error = message;
          this.popup.showError(message);
          return of(null);
        })
      )
      .subscribe(response => {
        if (response) {
          this.popup.showSuccess(response.message || I18nService.t('PLT.acc.okDeleted'));
          this.loadComptes();
        }
      });
  }
}