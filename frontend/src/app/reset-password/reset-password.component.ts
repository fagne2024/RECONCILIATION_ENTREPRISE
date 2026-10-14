import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { UserService } from '../services/user.service';

@Component({
  selector: 'app-reset-password',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterModule],
  templateUrl: './reset-password.component.html',
  styleUrls: ['./reset-password.component.scss']
})
export class ResetPasswordComponent implements OnInit {
  resetPasswordForm: FormGroup;
  loading = false;
  error: string | null = null;
  success: string | null = null;
  hidePassword = true;

  private token: string | null = null;

  constructor(
    private fb: FormBuilder,
    private route: ActivatedRoute,
    private router: Router,
    private userService: UserService
  ) {
    this.resetPasswordForm = this.fb.group({
      newPassword: ['', [
        Validators.required,
        Validators.minLength(8),
        Validators.pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/)
      ]],
      confirmPassword: ['', Validators.required]
    }, { validators: this.passwordsMatch });
  }

  ngOnInit(): void {
    this.token = this.route.snapshot.queryParamMap.get('token');
    if (!this.token) {
      this.error = 'Lien de réinitialisation invalide. Veuillez refaire une demande.';
    }
  }

  private passwordsMatch(group: FormGroup): { [key: string]: boolean } | null {
    const password = group.get('newPassword')?.value;
    const confirm = group.get('confirmPassword')?.value;
    return password && confirm && password !== confirm ? { mismatch: true } : null;
  }

  onSubmit(): void {
    if (this.error || this.resetPasswordForm.invalid || !this.token) {
      this.resetPasswordForm.markAllAsTouched();
      return;
    }

    this.loading = true;
    this.error = null;
    this.success = null;

    this.userService.resetPasswordWithToken(this.token, this.resetPasswordForm.value.newPassword).subscribe({
      next: (response: any) => {
        this.loading = false;
        this.success = response.message || 'Mot de passe réinitialisé avec succès. Vous pouvez vous connecter.';
        this.resetPasswordForm.reset();
        setTimeout(() => this.router.navigate(['/login']), 4000);
      },
      error: (err) => {
        this.loading = false;
        this.error = err.error?.error || 'Impossible de réinitialiser le mot de passe. Le lien est peut-être expiré.';
      }
    });
  }

  togglePasswordVisibility(): void {
    this.hidePassword = !this.hidePassword;
  }
}
