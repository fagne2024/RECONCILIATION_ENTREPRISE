import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { TwoFactorAuthService } from '../../services/two-factor-auth.service';
import { AppStateService } from '../../services/app-state.service';
import { PopupService } from '../../services/popup.service';
import { I18nService } from '../../services/i18n/i18n.service';

@Component({
  selector: 'app-two-factor-auth',
  templateUrl: './two-factor-auth.component.html',
  styleUrls: ['./two-factor-auth.component.scss']
})
export class TwoFactorAuthComponent implements OnInit {
  twoFactorForm: FormGroup;
  validationForm: FormGroup;
  loading = false;
  
  is2FAEnabled = false;
  hasSecret = false;
  username: string | null = null;
  
  qrCodeBase64: string | null = null;
  secret: string | null = null;
  otpAuthUrl: string | null = null;
  showQRCode = false;
  showValidationForm = false;

  constructor(
    private fb: FormBuilder,
    private twoFactorService: TwoFactorAuthService,
    private appState: AppStateService,
    private popupService: PopupService
  ) {
    this.twoFactorForm = this.fb.group({});
    this.validationForm = this.fb.group({
      code: ['', [Validators.required, Validators.pattern(/^\d{6}$/)]]
    });
  }

  ngOnInit() {
    // Vérifier si un paramètre 'user' est présent dans l'URL (pour les admins)
    const urlParams = new URLSearchParams(window.location.search);
    const targetUser = urlParams.get('user');
    
    if (targetUser) {
      // Si un utilisateur est spécifié dans l'URL, vérifier si l'utilisateur connecté est admin
      const currentUser = this.appState.getUsername();
      const isAdmin = this.appState.isAdmin();
      
      if (!isAdmin || !currentUser) {
        this.popupService.showError(
          I18nService.t('TFA.popups.adminRequired.message'),
          I18nService.t('TFA.popups.adminRequired.title')
        );
        return;
      }
      
      // Utiliser l'utilisateur cible spécifié
      this.username = targetUser;
    } else {
      // Sinon, utiliser l'utilisateur connecté
      this.username = this.appState.getUsername();
      if (!this.username) {
        this.popupService.showError(
          I18nService.t('TFA.popups.authRequired.message'),
          I18nService.t('TFA.popups.authRequired.title')
        );
        return;
      }
    }
    
    this.load2FAStatus();
  }

  /**
   * Charge le statut du 2FA pour l'utilisateur connecté
   */
  load2FAStatus() {
    if (!this.username) return;
    
    this.loading = true;
    
    this.twoFactorService.get2FAStatus(this.username).subscribe({
      next: (status) => {
        this.loading = false;
        this.is2FAEnabled = status.enabled;
        this.hasSecret = status.hasSecret;
      },
      error: async (err) => {
        this.loading = false;
        await this.popupService.showError(
          I18nService.t('TFA.popups.loadError.message'),
          I18nService.t('TFA.popups.loadError.title')
        );
        console.error('Error loading 2FA status:', err);
      }
    });
  }

  /**
   * Génère une nouvelle clé secrète et un QR code
   */
  setup2FA() {
    if (!this.username) return;
    
    this.loading = true;
    this.qrCodeBase64 = null;
    this.secret = null;
    this.showQRCode = false;
    this.showValidationForm = false;
    
    this.twoFactorService.setup2FA(this.username).subscribe({
      next: async (response) => {
        this.loading = false;
        this.qrCodeBase64 = response.qrCode;
        this.secret = response.secret;
        this.otpAuthUrl = response.otpAuthUrl;
        this.showQRCode = true;
        this.showValidationForm = true;
        await this.popupService.showSuccess(
          I18nService.t('TFA.popups.setupSuccess.message'),
          I18nService.t('TFA.popups.setupSuccess.title')
        );
      },
      error: async (err) => {
        this.loading = false;
        const errorMsg = err.error?.error || I18nService.t('TFA.popups.setupError.message');
        await this.popupService.showError(errorMsg, I18nService.t('TFA.popups.setupError.title'));
        console.error('Error setting up 2FA:', err);
      }
    });
  }

  /**
   * Active le 2FA après validation d'un code
   */
  async enable2FA() {
    if (!this.username || this.validationForm.invalid) return;
    
    const code = this.validationForm.value.code;
    this.loading = true;
    
    this.twoFactorService.enable2FA(this.username, code).subscribe({
      next: async (response) => {
        this.loading = false;
        const message = response.message || I18nService.t('TFA.popups.enableSuccess.message');
        await this.popupService.showSuccess(
          message,
          I18nService.t('TFA.popups.enableSuccess.title')
        );
        this.is2FAEnabled = true;
        this.hasSecret = true;
        this.showQRCode = false;
        this.showValidationForm = false;
        this.validationForm.reset();
        // Recharger le statut
        setTimeout(() => {
          this.load2FAStatus();
        }, 1000);
      },
      error: async (err) => {
        this.loading = false;
        const errorMsg = err.error?.error || I18nService.t('TFA.popups.enableError.message');
        await this.popupService.showError(
          errorMsg,
          I18nService.t('TFA.popups.enableError.title')
        );
        this.validationForm.patchValue({ code: '' });
        console.error('Error enabling 2FA:', err);
      }
    });
  }

  /**
   * Désactive le 2FA
   */
  async disable2FA() {
    if (!this.username) return;
    
    const confirmed = await this.popupService.showConfirmDialog(
      I18nService.t('TFA.popups.disableConfirm.message'),
      I18nService.t('TFA.popups.disableConfirm.title')
    );
    
    if (!confirmed) {
      return;
    }
    
    this.loading = true;
    
    this.twoFactorService.disable2FA(this.username).subscribe({
      next: async (response) => {
        this.loading = false;
        const message = response.message || I18nService.t('TFA.popups.disableSuccess.message');
        await this.popupService.showSuccess(
          message,
          I18nService.t('TFA.popups.disableSuccess.title')
        );
        this.is2FAEnabled = false;
        this.hasSecret = false;
        this.showQRCode = false;
        this.showValidationForm = false;
        this.validationForm.reset();
        // Recharger le statut
        setTimeout(() => {
          this.load2FAStatus();
        }, 1000);
      },
      error: async (err) => {
        this.loading = false;
        const errorMsg = err.error?.error || I18nService.t('TFA.popups.disableError.message');
        await this.popupService.showError(
          errorMsg,
          I18nService.t('TFA.popups.disableError.title')
        );
        console.error('Error disabling 2FA:', err);
      }
    });
  }

  /**
   * Annule le processus d'activation
   */
  cancelSetup() {
    this.showQRCode = false;
    this.showValidationForm = false;
    this.qrCodeBase64 = null;
    this.secret = null;
    this.otpAuthUrl = null;
    this.validationForm.reset();
  }

  /**
   * Copie la clé secrète dans le presse-papiers
   */
  async copySecret() {
    if (!this.secret) return;
    
    try {
      await navigator.clipboard.writeText(this.secret);
      await this.popupService.showSuccess(
        I18nService.t('TFA.popups.copySecretSuccess.message'),
        I18nService.t('TFA.popups.copySecretSuccess.title')
      );
    } catch {
      await this.popupService.showError(
        I18nService.t('TFA.popups.copySecretError.message'),
        I18nService.t('TFA.popups.copySecretError.title')
      );
    }
  }

  /**
   * Copie l'URL OTP Auth dans le presse-papiers
   */
  async copyOtpAuthUrl() {
    if (!this.otpAuthUrl) return;
    
    try {
      await navigator.clipboard.writeText(this.otpAuthUrl);
      await this.popupService.showSuccess(
        I18nService.t('TFA.popups.copyUrlSuccess.message'),
        I18nService.t('TFA.popups.copyUrlSuccess.title')
      );
    } catch {
      await this.popupService.showError(
        I18nService.t('TFA.popups.copyUrlError.message'),
        I18nService.t('TFA.popups.copyUrlError.title')
      );
    }
  }
}