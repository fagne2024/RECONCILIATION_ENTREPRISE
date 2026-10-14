import { Component, OnInit, HostListener } from '@angular/core';
import { Location } from '@angular/common';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { UserService } from '../../services/user.service';
import { User } from '../../models/user.model';
import { Profil } from '../../models/profil.model';
import { ProfilService } from '../../services/profil.service';
import { TwoFactorAuthService } from '../../services/two-factor-auth.service';
import { PopupService } from '../../services/popup.service';
import { I18nService } from '../../services/i18n/i18n.service';

type StatusFilter = 'all' | 'on' | 'off' | 'notfa';
type DrawerMode = 'create' | 'edit';

@Component({
  selector: 'app-users',
  templateUrl: './users.component.html',
  styleUrls: ['./users.component.scss']
})
export class UsersComponent implements OnInit {
  users: User[] = [];
  filteredUsers: User[] = [];
  profils: Profil[] = [];
  isLoading = false;
  errorMessage = '';
  searchTerm = '';
  selectedProfilFilter: number | '' = '';
  statusFilter: StatusFilter = 'all';

  // Pagination
  currentPage = 1;
  pageSize = 10;
  Math = Math;

  // Statut 2FA par utilisateur (chargé via l'API)
  user2FAStatus: Map<number, { enabled: boolean; hasSecret: boolean }> = new Map();
  loading2FAStatus: Set<number> = new Set();
  togglingUserStatus: Set<number> = new Set();

  // Menu contextuel de ligne
  menuUser: User | null = null;
  menuPos = { top: 0, left: 0 };

  // Tiroir de création / édition
  drawerOpen = false;
  drawerMode: DrawerMode = 'create';
  drawerUser: User = { username: '', email: '' };
  drawerPassword = '';
  drawerActive = true;
  drawer2FA = false;
  isSavingDrawer = false;
  /** Valeur ngValue de l'option « Aucun profil ». */
  readonly noProfilValue: any = undefined;
  private drawerOriginalActive = true;
  private drawerOriginal2FA = false;

  private static readonly AVATAR_COLORS = ['#1F5FD6', '#7C3AED', '#0F766E', '#B45309', '#BE185D', '#475569'];

  constructor(
    private userService: UserService,
    private profilService: ProfilService,
    private twoFactorService: TwoFactorAuthService,
    private popupService: PopupService,
    private location: Location,
    private router: Router
  ) { }

  ngOnInit(): void {
    this.loadUsers();
    this.loadProfils();
  }

  // ------------------------------------------------------------------
  // Chargement
  // ------------------------------------------------------------------

  loadUsers(): void {
    this.isLoading = true;
    this.userService.getAllUsers().subscribe({
      next: (users) => {
        this.users = users;
        this.applyFilters();
        this.isLoading = false;
        // Charger le statut 2FA pour chaque utilisateur
        this.loadAllUsers2FAStatus();
        if (users.length === 0) {
          this.errorMessage = I18nService.t('USR.msg.emptyDatabase');
        }
      },
      error: (error) => {
        console.error('Error loading users:', error);
        this.errorMessage = I18nService.t('USR.msg.loadError', {
          error: error.message || I18nService.t('USR.msg.serverConnectionError')
        });
        this.isLoading = false;
      }
    });
  }

  loadProfils(): void {
    this.profilService.getProfils().subscribe(profils => this.profils = profils);
  }

  refresh(): void {
    this.loadUsers();
    this.loadProfils();
  }

  // ------------------------------------------------------------------
  // Filtres
  // ------------------------------------------------------------------

  /** Recalcule la liste filtrée sans toucher à la pagination. */
  private computeFiltered(): void {
    const term = this.searchTerm.trim().toLowerCase();
    this.filteredUsers = this.users.filter(user => {
      const matchesSearch = !term
        || (user.username || '').toLowerCase().includes(term)
        || (user.email || '').toLowerCase().includes(term)
        || String(user.id ?? '').includes(term);
      const matchesProfil = !this.selectedProfilFilter
        || (user.profil && user.profil.id === Number(this.selectedProfilFilter));
      const matchesStatus =
        this.statusFilter === 'all'
        || (this.statusFilter === 'on' && this.isUserEnabled(user))
        || (this.statusFilter === 'off' && !this.isUserEnabled(user))
        || (this.statusFilter === 'notfa' && !this.isUser2FA(user));
      return matchesSearch && matchesProfil && matchesStatus;
    });
  }

  applyFilters(): void {
    this.computeFiltered();
    this.currentPage = 1;
  }

  setStatusFilter(filter: StatusFilter): void {
    this.statusFilter = filter;
    this.applyFilters();
  }

  clearFilters(): void {
    this.searchTerm = '';
    this.selectedProfilFilter = '';
    this.statusFilter = 'all';
    this.applyFilters();
  }

  // ------------------------------------------------------------------
  // Pagination
  // ------------------------------------------------------------------

  get totalPages(): number {
    return Math.max(1, Math.ceil(this.filteredUsers.length / this.pageSize));
  }

  get pagedUsers(): User[] {
    const start = (this.currentPage - 1) * this.pageSize;
    return this.filteredUsers.slice(start, start + this.pageSize);
  }

  get visiblePages(): number[] {
    const total = this.totalPages;
    const current = this.currentPage;
    const maxVisible = 5;
    if (total <= maxVisible) return Array.from({ length: total }, (_, i) => i + 1);
    let start = Math.max(1, current - Math.floor(maxVisible / 2));
    let end = start + maxVisible - 1;
    if (end > total) { end = total; start = Math.max(1, end - maxVisible + 1); }
    return Array.from({ length: end - start + 1 }, (_, i) => start + i);
  }

  goToPage(page: number): void {
    if (page >= 1 && page <= this.totalPages) this.currentPage = page;
  }

  prevPage(): void {
    if (this.currentPage > 1) this.currentPage--;
  }

  nextPage(): void {
    if (this.currentPage < this.totalPages) this.currentPage++;
  }

  // ------------------------------------------------------------------
  // Statistiques / synthèse sécurité
  // ------------------------------------------------------------------

  get activeCount(): number {
    return this.users.filter(u => this.isUserEnabled(u)).length;
  }

  get inactiveCount(): number {
    return this.users.filter(u => !this.isUserEnabled(u)).length;
  }

  get twoFaCount(): number {
    return this.users.filter(u => this.isUser2FA(u)).length;
  }

  get no2faCount(): number {
    return this.users.filter(u => !this.isUser2FA(u)).length;
  }

  get adminsNo2faCount(): number {
    return this.users.filter(u =>
      (u.username === 'admin' || u.profil?.nom === 'admin') && !this.isUser2FA(u)
    ).length;
  }

  get securityVisible(): boolean {
    return this.users.length > 0 && this.twoFaCount < this.users.length;
  }

  get securityPercent(): number {
    return this.users.length ? (this.twoFaCount / this.users.length) * 100 : 0;
  }

  // ------------------------------------------------------------------
  // Helpers d'affichage
  // ------------------------------------------------------------------

  isUserEnabled(user: User): boolean {
    return user.enabled !== false;
  }

  isUser2FA(user: User): boolean {
    if (!user.id) return false;
    const status = this.user2FAStatus.get(user.id);
    return !!status?.enabled;
  }

  initials(user: User): string {
    return (user.username || '?').slice(0, 2).toUpperCase();
  }

  avatarStyle(user: User): { color: string; background: string } {
    const color = UsersComponent.AVATAR_COLORS[(user.id || 0) % UsersComponent.AVATAR_COLORS.length];
    return { color, background: color + '26' };
  }

  /**
   * Libellé de la « Dernière connexion » : relatif pour les 7 derniers jours,
   * sinon date absolue. Renvoie « Jamais » si le compte ne s'est jamais connecté.
   */
  formatLastLogin(user: User): string {
    if (!user.lastLogin) {
      return I18nService.t('USR.table.never');
    }
    const date = new Date(user.lastLogin);
    if (isNaN(date.getTime())) {
      return I18nService.t('USR.table.never');
    }

    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const startOfDate = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
    const diffDays = Math.round((startOfToday - startOfDate) / 86400000);
    const time = this.pad(date.getHours()) + ':' + this.pad(date.getMinutes());

    if (diffDays === 0) return I18nService.t('USR.lastLogin.today', { time });
    if (diffDays === 1) return I18nService.t('USR.lastLogin.yesterday', { time });
    if (diffDays > 1 && diffDays < 7) return I18nService.t('USR.lastLogin.daysAgo', { count: diffDays });
    return this.pad(date.getDate()) + '/' + this.pad(date.getMonth() + 1) + '/' + date.getFullYear() + ' ' + time;
  }

  private pad(value: number): string {
    return value < 10 ? '0' + value : String(value);
  }

  // ------------------------------------------------------------------
  // Statut 2FA
  // ------------------------------------------------------------------

  loadAllUsers2FAStatus(): void {
    this.users.forEach(user => {
      if (user.id && user.username) {
        this.loadUser2FAStatus(user.id, user.username);
      }
    });
  }

  loadUser2FAStatus(userId: number, username: string): void {
    this.loading2FAStatus.add(userId);
    this.twoFactorService.get2FAStatus(username).subscribe({
      next: (status) => {
        this.user2FAStatus.set(userId, status);
        this.loading2FAStatus.delete(userId);
        // Le filtre « Sans 2FA » dépend de ce statut : recalculer à réception.
        this.computeFiltered();
      },
      error: (err) => {
        console.error('Error loading 2FA status for user:', username, err);
        this.loading2FAStatus.delete(userId);
      }
    });
  }

  getUser2FAStatus(userId: number | undefined): { enabled: boolean; hasSecret: boolean } | null {
    if (!userId) return null;
    return this.user2FAStatus.get(userId) || null;
  }

  async toggle2FA(user: User): Promise<void> {
    if (!user.username || !user.id) return;

    const currentStatus = this.getUser2FAStatus(user.id);
    const isEnabled = currentStatus?.enabled || false;

    if (isEnabled) {
      const confirmed = await this.popupService.showConfirmDialog(
        I18nService.t('USR.confirm.disable2fa', { username: user.username }),
        I18nService.t('USR.popup.disable2faTitle')
      );

      if (!confirmed) return;

      this.loading2FAStatus.add(user.id);
      this.twoFactorService.disable2FA(user.username).subscribe({
        next: async () => {
          this.loadUser2FAStatus(user.id!, user.username);
          await this.popupService.showSuccess(
            I18nService.t('USR.msg.disable2faSuccess', { username: user.username }),
            I18nService.t('USR.popup.twofaDisabledTitle')
          );
        },
        error: async (err) => {
          this.loading2FAStatus.delete(user.id!);
          const errorMsg = err.error?.error || I18nService.t('USR.msg.unknownError');
          await this.popupService.showError(
            I18nService.t('USR.msg.disable2faError', { error: errorMsg }),
            I18nService.t('POPUP.error')
          );
        }
      });
    } else {
      const confirmed = await this.popupService.showConfirmDialog(
        I18nService.t('USR.confirm.enable2fa', { username: user.username }),
        I18nService.t('USR.popup.enable2faTitle')
      );

      if (!confirmed) return;

      this.loading2FAStatus.add(user.id);
      this.twoFactorService.activate2FA(user.username).subscribe({
        next: async (response) => {
          this.loadUser2FAStatus(user.id!, user.username);
          const usingExistingSecret = response.usingExistingSecret || false;
          const message = usingExistingSecret
            ? I18nService.t('USR.msg.reactivate2faSuccess', { username: user.username })
            : I18nService.t('USR.msg.activate2faSuccess', { username: user.username });
          await this.popupService.showSuccess(message, I18nService.t('USR.popup.twofaActivatedTitle'));
        },
        error: async (err) => {
          this.loading2FAStatus.delete(user.id!);
          const errorMsg = err.error?.error || I18nService.t('USR.msg.unknownError');
          await this.popupService.showError(
            I18nService.t('USR.msg.activate2faError', { error: errorMsg }),
            I18nService.t('POPUP.error')
          );
        }
      });
    }
  }

  async reset2FA(user: User): Promise<void> {
    if (!user.username || !user.id) return;

    const confirmed = await this.popupService.showConfirmDialog(
      I18nService.t('USR.confirm.reset2fa', { username: user.username }),
      I18nService.t('USR.popup.reset2faTitle')
    );

    if (!confirmed) return;

    this.loading2FAStatus.add(user.id);
    this.twoFactorService.reset2FA(user.username).subscribe({
      next: async () => {
        this.loadUser2FAStatus(user.id!, user.username);
        await this.popupService.showSuccess(
          I18nService.t('USR.msg.reset2faSuccess', { username: user.username }),
          I18nService.t('USR.popup.twofaResetTitle')
        );
      },
      error: async (err) => {
        this.loading2FAStatus.delete(user.id!);
        const errorMsg = err.error?.error || I18nService.t('USR.msg.unknownError');
        await this.popupService.showError(
          I18nService.t('USR.msg.reset2faError', { error: errorMsg }),
          I18nService.t('POPUP.error')
        );
      }
    });
  }

  // ------------------------------------------------------------------
  // Actions compte / mot de passe
  // ------------------------------------------------------------------

  async resetUserPassword(user: User): Promise<void> {
    if (!user.email) {
      await this.popupService.showError(I18nService.t('USR.msg.noEmail'), I18nService.t('POPUP.error'));
      return;
    }

    const confirmed = await this.popupService.showConfirmDialog(
      I18nService.t('USR.confirm.resetPassword', { username: user.username, email: user.email }),
      I18nService.t('USR.popup.resetPasswordTitle')
    );

    if (confirmed) {
      this.userService.resetPassword(user.id!).subscribe({
        next: async () => {
          await this.popupService.showSuccess(I18nService.t('USR.msg.resetPasswordSuccess'), I18nService.t('POPUP.success'));
        },
        error: async (error) => {
          const errorMsg = error.error?.error || error.message || I18nService.t('USR.msg.resetPasswordError');
          await this.popupService.showError(errorMsg, I18nService.t('USR.popup.resetPasswordErrorTitle'));
          console.error('Error resetting password:', error);
        }
      });
    }
  }

  async toggleUserEnabled(user: User): Promise<void> {
    if (!user.id || user.username === 'admin') return;

    const isEnabled = this.isUserEnabled(user);
    const action = I18nService.t(isEnabled ? 'USR.verbs.disable' : 'USR.verbs.enable');
    const confirmed = await this.popupService.showConfirmDialog(
      I18nService.t('USR.confirm.toggleAccount', { action, username: user.username }),
      isEnabled ? I18nService.t('USR.popup.disableAccountTitle') : I18nService.t('USR.popup.enableAccountTitle')
    );

    if (!confirmed) return;

    this.togglingUserStatus.add(user.id);
    this.userService.setUserEnabled(user.id, !isEnabled).subscribe({
      next: async (response) => {
        const index = this.users.findIndex(u => u.id === user.id);
        if (index !== -1) {
          this.users[index] = response.user;
        }
        this.applyFilters();
        this.togglingUserStatus.delete(user.id!);
        await this.popupService.showSuccess(
          response.message,
          isEnabled ? I18nService.t('USR.popup.accountDisabledTitle') : I18nService.t('USR.popup.accountEnabledTitle')
        );
      },
      error: async (error) => {
        this.togglingUserStatus.delete(user.id!);
        const errorMsg = error.error?.error || error.message || I18nService.t('USR.msg.toggleAccountError', { action });
        await this.popupService.showError(errorMsg, I18nService.t('POPUP.error'));
      }
    });
  }

  async deleteUser(user: User): Promise<void> {
    if (user.username === 'admin') return;

    const confirmed = await this.popupService.showConfirmDialog(
      I18nService.t('USR.confirm.delete', { username: user.username }),
      I18nService.t('USR.popup.deleteConfirmTitle')
    );

    if (confirmed) {
      this.userService.deleteUser(user.id!).subscribe({
        next: async (success) => {
          if (success) {
            this.users = this.users.filter(u => u.id !== user.id);
            this.user2FAStatus.delete(user.id!);
            this.applyFilters();
            await this.popupService.showSuccess(I18nService.t('USR.msg.deleteSuccess'), I18nService.t('POPUP.success'));
          } else {
            await this.popupService.showError(I18nService.t('USR.msg.deleteImpossible'), I18nService.t('POPUP.error'));
          }
        },
        error: async (error) => {
          const errorMsg = error.error?.error || error.message || I18nService.t('USR.msg.deleteError');
          await this.popupService.showError(errorMsg, I18nService.t('USR.popup.deleteErrorTitle'));
          console.error('Error deleting user:', error);
        }
      });
    }
  }

  // ------------------------------------------------------------------
  // Menu contextuel
  // ------------------------------------------------------------------

  openMenu(user: User, event: MouseEvent): void {
    event.stopPropagation();
    if (this.menuUser && this.menuUser.id === user.id) {
      this.closeMenu();
      return;
    }
    this.menuUser = user;

    const btn = event.currentTarget as HTMLElement;
    const rect = btn.getBoundingClientRect();
    const width = 250;
    const height = 260;
    let left = rect.right - width;
    left = Math.max(8, Math.min(left, window.innerWidth - width - 8));
    let top = rect.bottom + 4;
    if (top + height > window.innerHeight) {
      top = Math.max(8, rect.top - height - 4);
    }
    this.menuPos = { top, left };
  }

  closeMenu(): void {
    this.menuUser = null;
  }

  menuEdit(user: User): void {
    this.closeMenu();
    this.openEditDrawer(user);
  }

  menuResetPassword(user: User): void {
    this.closeMenu();
    this.resetUserPassword(user);
  }

  menuToggle2FA(user: User): void {
    this.closeMenu();
    this.toggle2FA(user);
  }

  menuReset2FA(user: User): void {
    this.closeMenu();
    this.reset2FA(user);
  }

  menuToggleEnabled(user: User): void {
    this.closeMenu();
    this.toggleUserEnabled(user);
  }

  menuDelete(user: User): void {
    this.closeMenu();
    this.deleteUser(user);
  }

  // ------------------------------------------------------------------
  // Tiroir de création / édition
  // ------------------------------------------------------------------

  openCreateDrawer(): void {
    this.drawerMode = 'create';
    this.drawerUser = { username: '', email: '', profil: undefined };
    this.drawerPassword = '';
    this.drawerActive = true;
    this.drawer2FA = false;
    this.drawerOpen = true;
  }

  openEditDrawer(user: User): void {
    this.drawerMode = 'edit';
    const profil = this.profils.find(p => p.id === user.profil?.id);
    this.drawerUser = {
      id: user.id,
      username: user.username,
      email: user.email || '',
      profil
    };
    this.drawerPassword = '';
    this.drawerActive = this.isUserEnabled(user);
    this.drawer2FA = this.isUser2FA(user);
    this.drawerOriginalActive = this.drawerActive;
    this.drawerOriginal2FA = this.drawer2FA;
    this.drawerOpen = true;
  }

  closeDrawer(): void {
    this.drawerOpen = false;
  }

  async saveDrawer(): Promise<void> {
    const isCreate = this.drawerMode === 'create';
    const username = (this.drawerUser.username || '').trim();
    const email = (this.drawerUser.email || '').trim();

    if (!username || !email) {
      await this.popupService.showError(
        I18nService.t('USR.msg.requiredFields'),
        I18nService.t('USR.popup.requiredFieldsTitle')
      );
      return;
    }

    this.isSavingDrawer = true;
    try {
      if (isCreate) {
        const payload: User = { username, email, profil: this.drawerUser.profil };
        const created = await firstValueFrom(this.userService.createUser(payload));
        if (created?.id != null) {
          if (!this.drawerActive) {
            await firstValueFrom(this.userService.setUserEnabled(created.id, false));
          }
          if (this.drawer2FA) {
            await firstValueFrom(this.twoFactorService.activate2FA(created.username));
          }
        }
        await this.popupService.showSuccess(I18nService.t('USR.msg.createSuccess'), I18nService.t('POPUP.success'));
      } else {
        const id = this.drawerUser.id!;
        const payload: User = { id, username, email, profil: this.drawerUser.profil };
        if (this.drawerPassword) {
          payload.password = this.drawerPassword;
        }
        await firstValueFrom(this.userService.updateUser(id, payload));

        if (this.drawerActive !== this.drawerOriginalActive) {
          await firstValueFrom(this.userService.setUserEnabled(id, this.drawerActive));
        }
        if (this.drawer2FA !== this.drawerOriginal2FA) {
          if (this.drawer2FA) {
            await firstValueFrom(this.twoFactorService.activate2FA(username));
          } else {
            await firstValueFrom(this.twoFactorService.disable2FA(username));
          }
        }
        await this.popupService.showSuccess(I18nService.t('USR.msg.updateSuccess'), I18nService.t('POPUP.success'));
      }

      this.closeDrawer();
      this.loadUsers();
    } catch (error: any) {
      const errorMsg = error?.error?.error || error?.message || I18nService.t('USR.msg.unknownError');
      await this.popupService.showError(
        errorMsg,
        isCreate ? I18nService.t('USR.popup.createErrorTitle') : I18nService.t('USR.popup.updateErrorTitle')
      );
      console.error('Error saving user:', error);
    } finally {
      this.isSavingDrawer = false;
    }
  }

  // ------------------------------------------------------------------
  // Écouteurs globaux
  // ------------------------------------------------------------------

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    const target = event.target as HTMLElement;
    if (target.closest('.row-menu') || target.closest('.btn-dots')) return;
    this.closeMenu();
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.closeMenu();
    this.closeDrawer();
  }

  @HostListener('window:scroll')
  onScroll(): void {
    this.closeMenu();
  }

  // ------------------------------------------------------------------
  // Navigation
  // ------------------------------------------------------------------

  goBack(): void {
    this.location.back();
  }

  goHome(): void {
    this.router.navigate(['/']);
  }

  goToAide(): void {
    this.router.navigate(['/aide']);
  }
}
