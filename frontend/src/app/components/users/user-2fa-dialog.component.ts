import { Component, Inject, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { TwoFactorAuthService } from '../../services/two-factor-auth.service';
import { I18nService } from '../../services/i18n/i18n.service';

@Component({
  selector: 'app-user-2fa-dialog',
  templateUrl: './user-2fa-dialog.component.html',
  styleUrls: ['./user-2fa-dialog.component.scss']
})
export class User2FADialogComponent implements OnInit {
  username: string;
  twoFactorForm: FormGroup;
  validationForm: FormGroup;
  loading = false;
  error: string | null = null;
  success: string | null = null;
  
  is2FAEnabled = false;
  hasSecret = false;
  
  qrCodeBase64: string | null = null;
  secret: string | null = null;
  otpAuthUrl: string | null = null;
  showQRCode = false;
  showValidationForm = false;

  constructor(
    @Inject('USERNAME') private injectedUsername: string,
    private fb: FormBuilder,
    private twoFactorService: TwoFactorAuthService
  ) {
    this.username = injectedUsername;
    this.twoFactorForm = this.fb.group({});
    this.validationForm = this.fb.group({
      code: ['', [Validators.required, Validators.pattern(/^\d{6}$/)]]
    });
  }

  ngOnInit() {
    this.load2FAStatus();
  }

  /**
   * Charge le statut du 2FA pour l'utilisateur
   */
  load2FAStatus() {
    this.loading = true;
    this.error = null;
    
    this.twoFactorService.get2FAStatus(this.username).subscribe({
      next: (status) => {
        this.loading = false;
        this.is2FAEnabled = status.enabled;
        this.hasSecret = status.hasSecret;
      },
      error: (err) => {
        this.loading = false;
        this.error = I18nService.t('TFA.popups.loadError.message');
        console.error('Error loading 2FA status:', err);
      }
    });
  }

  /**
   * Génère une nouvelle clé secrète et un QR code
   */
  setup2FA() {
    this.loading = true;
    this.error = null;
    this.success = null;
    this.qrCodeBase64 = null;
    this.secret = null;
    this.showQRCode = false;
    this.showValidationForm = false;
    
    this.twoFactorService.setup2FA(this.username).subscribe({
      next: (response) => {
        this.loading = false;
        this.qrCodeBase64 = response.qrCode;
        this.secret = response.secret;
        this.otpAuthUrl = response.otpAuthUrl;
        this.showQRCode = true;
        this.showValidationForm = true;
        this.success = I18nService.t('TFA.popups.setupSuccess.message');
      },
      error: (err) => {
        this.loading = false;
        this.error = err.error?.error || I18nService.t('TFA.popups.setupError.message');
        console.error('Error setting up 2FA:', err);
      }
    });
  }

  /**
   * Active le 2FA après validation d'un code
   */
  enable2FA() {
    if (this.validationForm.invalid) return;
    
    const code = this.validationForm.value.code;
    this.loading = true;
    this.error = null;
    this.success = null;
    
    this.twoFactorService.enable2FA(this.username, code).subscribe({
      next: (response) => {
        this.loading = false;
        this.success = response.message || I18nService.t('TFA.popups.enableSuccess.message');
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
      error: (err) => {
        this.loading = false;
        this.error = err.error?.error || I18nService.t('TFA.popups.enableError.message');
        this.validationForm.patchValue({ code: '' });
        console.error('Error enabling 2FA:', err);
      }
    });
  }

  /**
   * Désactive le 2FA
   */
  disable2FA() {
    if (!confirm(I18nService.t('TFA.msg.etesVousSurDeVouloirDesactiver', { p0: this.username }))) {
      return;
    }
    
    this.loading = true;
    this.error = null;
    this.success = null;
    
    this.twoFactorService.disable2FA(this.username).subscribe({
      next: (response) => {
        this.loading = false;
        this.success = response.message || I18nService.t('TFA.popups.disableSuccess.message');
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
      error: (err) => {
        this.loading = false;
        this.error = err.error?.error || I18nService.t('TFA.popups.disableError.message');
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
    this.error = null;
    this.success = null;
  }

  /**
   * Copie la clé secrète dans le presse-papiers
   */
  copySecret() {
    if (!this.secret) return;
    
    navigator.clipboard.writeText(this.secret).then(() => {
      this.success = I18nService.t('TFA.popups.copySecretSuccess.message');
      setTimeout(() => {
        this.success = null;
      }, 3000);
    }).catch(() => {
      this.error = I18nService.t('TFA.popups.copySecretError.message');
    });
  }

  /**
   * Copie l'URL OTP Auth dans le presse-papiers
   */
  copyOtpAuthUrl() {
    if (!this.otpAuthUrl) return;
    
    navigator.clipboard.writeText(this.otpAuthUrl).then(() => {
      this.success = I18nService.t('TFA.popups.copyUrlSuccess.message');
      setTimeout(() => {
        this.success = null;
      }, 3000);
    }).catch(() => {
      this.error = I18nService.t('TFA.popups.copyUrlError.message');
    });
  }

  /**
   * Ferme le dialogue (méthode statique pour compatibilité avec ModernPopup)
   */
  close() {
    // Cette méthode sera appelée depuis le template
    const overlay = document.querySelector('.modern-popup-overlay');
    if (overlay) {
      overlay.remove();
    }
  }
}

