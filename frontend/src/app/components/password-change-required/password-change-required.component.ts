import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { UserService } from '../../services/user.service';
import { AppStateService } from '../../services/app-state.service';

/**
 * Écran de changement de mot de passe OBLIGATOIRE.
 *
 * Affiché après la connexion lorsque le backend retourne
 * `mustChangePassword: true` (compte SUPER_ADMIN créé au premier démarrage
 * avec un mot de passe provisoire, par ex.). L'AuthGuard redirige vers cette
 * page tant que l'obligation n'a pas été levée par un changement réussi.
 */
@Component({
  selector: 'app-password-change-required',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterModule],
  templateUrl: './password-change-required.component.html',
  styleUrls: ['./password-change-required.component.scss']
})
export class PasswordChangeRequiredComponent {
  passwordForm: FormGroup;
  loading = false;
  error: string | null = null;
  hideCurrentPassword = true;
  hideNewPassword = true;

  constructor(
    private fb: FormBuilder,
    private router: Router,
    private userService: UserService,
    private appState: AppStateService
  ) {
    // Même politique que le backend (PasswordPolicyValidator) :
    // 8+ caractères, au moins une minuscule, une majuscule, un chiffre et un caractère spécial.
    this.passwordForm = this.fb.group({
      currentPassword: ['', Validators.required],
      newPassword: ['', [
        Validators.required,
        Validators.minLength(8),
        Validators.pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/)
      ]],
      confirmPassword: ['', Validators.required]
    }, { validators: this.passwordsMatch });
  }

  private passwordsMatch(group: FormGroup): { [key: string]: boolean } | null {
    const password = group.get('newPassword')?.value;
    const confirm = group.get('confirmPassword')?.value;
    return password && confirm && password !== confirm ? { mismatch: true } : null;
  }

  onSubmit(): void {
    if (this.passwordForm.invalid) {
      this.passwordForm.markAllAsTouched();
      return;
    }

    this.loading = true;
    this.error = null;

    this.userService.changePassword(
      this.passwordForm.value.currentPassword,
      this.passwordForm.value.newPassword
    ).subscribe({
      next: () => {
        this.loading = false;
        // L'obligation est levée : l'accès à l'application est débloqué.
        this.appState.clearMustChangePassword();
        this.router.navigateByUrl(this.appState.resolveAccessibleRoute());
      },
      error: (err) => {
        this.loading = false;
        this.error = err.error?.error || 'Impossible de modifier le mot de passe. Vérifiez vos informations.';
      }
    });
  }

  logout(): void {
    this.appState.logout();
    this.router.navigate(['/login']);
  }

  toggleCurrentPasswordVisibility(): void {
    this.hideCurrentPassword = !this.hideCurrentPassword;
  }

  toggleNewPasswordVisibility(): void {
    this.hideNewPassword = !this.hideNewPassword;
  }
}
