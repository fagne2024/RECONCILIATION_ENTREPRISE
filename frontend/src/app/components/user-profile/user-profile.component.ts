import { Component, OnInit, OnDestroy } from '@angular/core';
import { Router } from '@angular/router';
import { Location } from '@angular/common';
import { Subscription } from 'rxjs';
import { UserService } from '../../services/user.service';
import { UserPhotoService } from '../../services/user-photo.service';
import { User } from '../../models/user.model';
import { AppStateService } from '../../services/app-state.service';
import { PopupService } from '../../services/popup.service';
import { I18nService } from '../../services/i18n/i18n.service';

@Component({
  selector: 'app-user-profile',
  templateUrl: './user-profile.component.html',
  styleUrls: ['./user-profile.component.scss']
})
export class UserProfileComponent implements OnInit, OnDestroy {
  user: User | null = null;
  isLoading = false;
  errorMessage = '';
  
  // Formulaire de changement de mot de passe
  passwordForm = {
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  };
  isChangingPassword = false;
  showPasswordForm = false;

  // Photo de profil
  photo: string | null = null;
  isUploadingPhoto = false;
  private readonly maxPhotoBytes = 2 * 1024 * 1024;
  private photoSub?: Subscription;

  constructor(
    private userService: UserService,
    private userPhotoService: UserPhotoService,
    private appState: AppStateService,
    private popupService: PopupService,
    private router: Router,
    private location: Location
  ) { }

  ngOnInit(): void {
    this.loadUserInfo();
    // La photo est partagee avec la sidebar : on s'abonne au flux commun.
    this.photoSub = this.userPhotoService.photo$.subscribe(photo => {
      this.photo = photo;
    });
    this.userPhotoService.load();
  }

  ngOnDestroy(): void {
    this.photoSub?.unsubscribe();
  }

  loadUserInfo(): void {
    this.isLoading = true;
    this.errorMessage = '';
    
    this.userService.getCurrentUser().subscribe({
      next: (user) => {
        this.user = user;
        this.isLoading = false;
      },
      error: (error) => {
        console.error('Error loading user info:', error);
        this.errorMessage = I18nService.t('COMMON.msg.erreurLorsDuChargementDesInformations');
        this.isLoading = false;
        this.popupService.showError(I18nService.t('COMMON.msg.erreurLorsDuChargementDesInformations'), I18nService.t('MSG.error'));
      }
    });
  }

  togglePasswordForm(): void {
    this.showPasswordForm = !this.showPasswordForm;
    if (!this.showPasswordForm) {
      this.resetPasswordForm();
    }
  }

  resetPasswordForm(): void {
    this.passwordForm = {
      currentPassword: '',
      newPassword: '',
      confirmPassword: ''
    };
  }

  async changePassword(): Promise<void> {
    // Validation
    if (!this.passwordForm.currentPassword || !this.passwordForm.newPassword || !this.passwordForm.confirmPassword) {
      await this.popupService.showError(I18nService.t('USR.msg.fillAllFields'), I18nService.t('USR.popup.requiredFieldsTitle'));
      return;
    }

    if (this.passwordForm.newPassword !== this.passwordForm.confirmPassword) {
      await this.popupService.showError(I18nService.t('COMMON.msg.lesNouveauxMotsDePasseNe'), I18nService.t('COMMON.msg.erreurDeValidation'));
      return;
    }

    if (this.passwordForm.newPassword.length < 6) {
      await this.popupService.showError(I18nService.t('COMMON.msg.leNouveauMotDePasseDoit'), I18nService.t('COMMON.msg.erreurDeValidation'));
      return;
    }

    this.isChangingPassword = true;

    this.userService.changePassword(
      this.passwordForm.currentPassword,
      this.passwordForm.newPassword
    ).subscribe({
      next: async () => {
        await this.popupService.showSuccess(I18nService.t('COMMON.msg.motDePasseModifieAvecSucces'), I18nService.t('POPUP.success'));
        this.resetPasswordForm();
        this.showPasswordForm = false;
        this.isChangingPassword = false;
      },
      error: async (error) => {
        console.error('Error changing password:', error);
        const errorMessage = error.error?.error || I18nService.t('COMMON.msg.erreurLorsDeLaModificationDu');
        await this.popupService.showError(errorMessage, I18nService.t('MSG.error'));
        this.isChangingPassword = false;
      }
    });
  }

  getProfilName(): string {
    return this.user?.profil?.nom || I18nService.t('OPS.notDefined');
  }

  // ------------------------------------------------------------------
  // Photo de profil
  // ------------------------------------------------------------------

  /**
   * Lecture du fichier choisi, validation (type image + taille ≤ 2 Mo) puis
   * envoi en data URL au backend.
   */
  onPhotoSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files && input.files[0];
    // Permet de resélectionner le même fichier plus tard.
    input.value = '';
    if (!file) {
      return;
    }
    if (!file.type || !file.type.startsWith('image/')) {
      this.popupService.showError(I18nService.t('COMMON.msg.veuillezChoisirUnFichierImagePng'), I18nService.t('RPT.releve.invalidFile'));
      return;
    }
    if (file.size > this.maxPhotoBytes) {
      this.popupService.showError(I18nService.t('COMMON.msg.lImageNeDoitPasDepasser'), I18nService.t('COMMON.msg.fichierTropVolumineux'));
      return;
    }

    const reader = new FileReader();
    reader.onload = () => this.uploadPhoto(String(reader.result || ''));
    reader.onerror = () => this.popupService.showError(I18nService.t('COMMON.msg.impossibleDeLireLeFichierSelectionne'), I18nService.t('MSG.error'));
    reader.readAsDataURL(file);
  }

  private uploadPhoto(dataUrl: string): void {
    if (!dataUrl) {
      return;
    }
    this.isUploadingPhoto = true;
    this.userPhotoService.upload(dataUrl).subscribe({
      next: async (response) => {
        this.photo = response?.photo || dataUrl;
        this.isUploadingPhoto = false;
        await this.popupService.showSuccess(response?.message || I18nService.t('COMMON.msg.photoDeProfilMiseAJour'), I18nService.t('POPUP.success'));
      },
      error: async (error) => {
        this.isUploadingPhoto = false;
        const message = error?.error?.message || error?.error?.error || I18nService.t('COMMON.msg.erreurLorsDeLEnregistrementDe');
        await this.popupService.showError(message, I18nService.t('MSG.error'));
      }
    });
  }

  async removePhoto(): Promise<void> {
    if (!this.photo) {
      return;
    }
    const confirmed = await this.popupService.showConfirm(
      I18nService.t('COMMON.msg.voulezVousVraimentSupprimerVotrePhoto'),
      I18nService.t('COMMON.ui.supprimerLaPhoto')
    );
    if (!confirmed) {
      return;
    }
    this.isUploadingPhoto = true;
    this.userPhotoService.remove().subscribe({
      next: async (response) => {
        this.photo = null;
        this.isUploadingPhoto = false;
        await this.popupService.showSuccess(response?.message || I18nService.t('COMMON.msg.photoDeProfilSupprimee'), I18nService.t('POPUP.success'));
      },
      error: async (error) => {
        this.isUploadingPhoto = false;
        const message = error?.error?.message || error?.error?.error || I18nService.t('COMMON.msg.erreurLorsDeLaSuppressionDe');
        await this.popupService.showError(message, I18nService.t('MSG.error'));
      }
    });
  }

  closeProfile(): void {
    // Retourner à la page précédente ou rediriger vers le dashboard
    if (window.history.length > 1) {
      this.location.back();
    } else {
      this.router.navigate(['/dashboard']);
    }
  }
}

