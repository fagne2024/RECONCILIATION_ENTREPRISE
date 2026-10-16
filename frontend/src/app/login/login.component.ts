import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { Router, ActivatedRoute } from '@angular/router';
import { Subject, of } from 'rxjs';
import { catchError, debounceTime, distinctUntilChanged, map, switchMap } from 'rxjs/operators';
import { AppStateService } from '../services/app-state.service';
import { UserService } from '../services/user.service';
import { UserLogService } from '../services/user-log.service';
import { LogoService } from '../services/logo.service';
import { ThemeService } from '../services/theme.service';
import { BrandingContextService } from '../services/branding-context.service';

@Component({
  selector: 'app-login',
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.scss']
})
export class LoginComponent implements OnInit {
  loginForm: FormGroup;
  twoFactorForm: FormGroup;
  forgotPasswordForm: FormGroup;
  loading = false;
  error: string | null = null;
  success: string | null = null;
  adminExists = true; // Par défaut, on suppose que l'admin existe
  hidePassword = true; // Pour toggle afficher/masquer mot de passe
  particles = Array(10).fill(0).map((_, i) => i + 1); // Pour les particules animées en arrière-plan
  requires2FA = false; // Indique si le 2FA est requis
  showForgotPassword = false; // Afficher le formulaire de mot de passe oublié
  currentUsername: string | null = null; // Username pour la validation 2FA
  preAuthTicket: string | null = null; // Ticket pré-auth 2FA (usage unique, 5 min)
  showQRCode = false; // Afficher le QR code lors de la connexion
  qrCodeBase64: string | null = null; // QR code en base64
  secret: string | null = null; // Clé secrète
  otpAuthUrl: string | null = null; // URL OTP Auth
  /** Nom de l'entreprise détectée ; null = marque par défaut. */
  entrepriseNom: string | null = null;

  /** Flux des saisies d'identifiant : déclenche la détection de l'entreprise. */
  private readonly usernameInput$ = new Subject<string>();

  constructor(
    private fb: FormBuilder,
    private http: HttpClient,
    private router: Router,
    private route: ActivatedRoute,
    private appState: AppStateService,
    private userService: UserService,
    private userLogService: UserLogService,
    public logoService: LogoService,
    private themeService: ThemeService,
    private brandingContext: BrandingContextService
  ) {
    this.loginForm = this.fb.group({
      username: ['', Validators.required],
      password: ['', Validators.required]
    });
    
    this.twoFactorForm = this.fb.group({
      code: ['', [Validators.required, Validators.pattern(/^\d{6}$/)]]
    });
    
    this.forgotPasswordForm = this.fb.group({
      email: ['', [Validators.required, Validators.email]]
    });
  }

  onSubmit() {
    if (this.loginForm.invalid) return;
    const username = this.loginForm.value.username;
    const password = this.loginForm.value.password;
    this.loading = true;
    this.error = null;
    this.http.post<any>('/api/auth/login', { username, password })
      .subscribe({
        next: (response: any) => {
          this.loading = false;
          
          // Vérifier si le 2FA est requis
          if (response.requires2FA === true) {
            this.requires2FA = true;
            this.currentUsername = response.username;
            this.preAuthTicket = response.preAuthTicket || null;
            this.error = null;
            // Afficher le QR code uniquement si c'est la première connexion
            if (response.showQRCode === true && response.qrCode) {
              this.showQRCode = true;
              this.qrCodeBase64 = response.qrCode;
              this.secret = response.secret || null;
              this.otpAuthUrl = response.otpAuthUrl || null;
            } else {
              this.showQRCode = false;
              this.qrCodeBase64 = null;
              this.secret = null;
              this.otpAuthUrl = null;
            }
            // Masquer le formulaire de login et afficher le formulaire 2FA
            return;
          }
          
          // Vérifier si un token JWT est présent dans la réponse
          const token = response.token || null;
          if (!token) {
            this.error = 'Token d\'authentification manquant dans la réponse du serveur.';
            return;
          }
          
          // Stocker les droits et le token dans AppStateService
          const modules: string[] = Array.from(new Set(response.droits.map((d: any) => d.module)));
          const permissions: { [module: string]: string[] } = {};
          response.droits.forEach((d: any) => {
            if (!permissions[d.module]) permissions[d.module] = [];
            permissions[d.module].push(d.permission);
          });
          // Pour SUPER_ADMIN, forcer le profil à SUPER_ADMIN (le backend retourne null)
          const profil = response.role === 'SUPER_ADMIN' ? 'SUPER_ADMIN' : response.profil;
          this.appState.setUserRights({
            profil,
            modules,
            permissions,
            pays: response.pays
          }, response.username, token);

          // Appliquer la marque de l'entreprise (ou les défauts pour SUPER_ADMIN)
          this.applyEntrepriseBranding();

          // Récupérer les modules actifs pour l'entreprise courante
          this.loadActiveModules(response.username, token).then(() => {
            this.userLogService.logActivity('connexion', 'Authentification', response.username, 'Connexion réussie');

            // Rediriger vers l'URL demandée si elle est accessible, sinon vers
            // la première page réellement autorisée pour le profil (catalogue navigation).
            let returnUrl = this.route.snapshot.queryParams['returnUrl'] as string | undefined;
            if (returnUrl?.startsWith('/login')) {
              returnUrl = undefined;
            }

            this.router.navigateByUrl(this.appState.resolveAccessibleRoute(returnUrl));
          });
        },
        error: (err) => {
          this.loading = false;
          if (err.status === 423 || err.status === 401 || err.status === 403) {
            if (err.error && err.error.error) {
              this.error = err.error.error;
            } else {
              this.error = 'Nom d\'utilisateur ou mot de passe incorrect. Veuillez vérifier vos identifiants.';
            }
          } else if (err.status === 0) {
            this.error = 'Impossible de se connecter au serveur. Vérifiez votre connexion réseau.';
          } else if (err.error && typeof err.error === 'string') {
            this.error = err.error;
          } else if (err.error && err.error.message) {
            this.error = err.error.message;
          } else if (err.error && err.error.error) {
            this.error = err.error.error;
          } else {
            this.error = 'Une erreur est survenue lors de la connexion. Veuillez réessayer.';
          }
        }
      });
  }

  ngOnInit() {
    // Rediriger si déjà connecté
    if (this.appState.getUserRights() && this.appState.getUsername()) {
      let returnUrl = this.route.snapshot.queryParams['returnUrl'] as string | undefined;
      if (returnUrl?.startsWith('/login')) {
        returnUrl = undefined;
      }

      this.router.navigateByUrl(this.appState.resolveAccessibleRoute(returnUrl));
      return;
    }
    // Détecter l'entreprise à la saisie de l'identifiant pour prévisualiser sa
    // marque (logo + couleurs) AVANT même de cliquer sur « Connexion ».
    this.setupEntrepriseDetection();
    // Vérifier si l'utilisateur admin existe
    this.checkAdminExists();
  }

  /**
   * Met à jour la marque (logo + thème) dès que l'identifiant change, sans
   * attendre la soumission du formulaire. La résolution de l'entreprise est
   * faite côté serveur à partir de l'identifiant saisi.
   */
  private setupEntrepriseDetection(): void {
    const usernameControl = this.loginForm.get('username');
    if (!usernameControl) {
      return;
    }

    usernameControl.valueChanges
      .subscribe(value => this.usernameInput$.next(value ?? ''));

    this.usernameInput$.pipe(
      map(value => (value ?? '').trim()),
      debounceTime(400),
      distinctUntilChanged(),
      switchMap(username => {
        if (!username) {
          return of(null);
        }
        return this.http
          .get<{ entrepriseCode: string | null; entrepriseNom: string | null }>(
            '/api/auth/entreprise',
            { params: { username } }
          )
          .pipe(catchError(() => of(null)));
      })
    ).subscribe(res => this.applyPreLoginBranding(res?.entrepriseCode ?? null, res?.entrepriseNom ?? null));

    // Déclenche une première résolution (couvre l'auto-remplissage navigateur).
    this.usernameInput$.next(usernameControl.value ?? '');
  }

  /**
   * Applique la marque d'une entreprise détectée avant connexion. Un code
   * `null` (identifiant inconnu / vidé / SUPER_ADMIN) fait reprendre le
   * contexte d'URL (`?entreprise=CODE` / sous-domaine), sinon les valeurs par
   * défaut. Le nom détecté remplace le libellé de marque par défaut.
   */
  private applyPreLoginBranding(entrepriseCode: string | null, entrepriseNom: string | null = null): void {
    const code = entrepriseCode ?? this.brandingContext.resolveEntrepriseCode();
    this.themeService.init(code);
    this.logoService.load(code);
    this.entrepriseNom = entrepriseNom && entrepriseNom.trim() ? entrepriseNom.trim() : null;
  }

  checkAdminExists() {
    this.http.get<boolean>('/api/users/check-admin').subscribe({
      next: (exists) => {
        this.adminExists = exists;
        if (!exists) {
          this.error = 'L\'utilisateur admin n\'existe pas. Veuillez créer un compte administrateur.';
        }
      },
      error: (err) => {
        console.warn('Impossible de vérifier l\'existence de l\'admin:', err);
        // En cas d'erreur, on garde la valeur par défaut (true)
      }
    });
  }

  togglePasswordVisibility() {
    this.hidePassword = !this.hidePassword;
  }

  onForgotPassword() {
    this.showForgotPassword = true;
    this.error = null;
    this.success = null;
    this.forgotPasswordForm.reset();
  }

  onSubmitForgotPassword() {
    if (this.forgotPasswordForm.invalid) {
      return;
    }
    
    const email = this.forgotPasswordForm.value.email;
    this.loading = true;
    this.error = null;
    this.success = null;
    
    this.userService.forgotPassword(email).subscribe({
      next: (response: any) => {
        this.loading = false;
        this.success = response.message || 'Si cette adresse email est associée à un compte, un lien de réinitialisation sera envoyé par email.';
        // Réinitialiser le formulaire après 3 secondes
        setTimeout(() => {
          this.showForgotPassword = false;
          this.success = null;
          this.forgotPasswordForm.reset();
        }, 5000);
      },
      error: (err) => {
        this.loading = false;
        if (err.error && err.error.error) {
          this.error = err.error.error;
        } else {
          this.error = 'Une erreur est survenue. Veuillez réessayer plus tard.';
        }
      }
    });
  }

  backToLoginFromForgotPassword() {
    this.showForgotPassword = false;
    this.error = null;
    this.success = null;
    this.forgotPasswordForm.reset();
  }

  onVerify2FA() {
    if (this.twoFactorForm.invalid || !this.currentUsername) {
      return;
    }

    if (!this.preAuthTicket) {
      this.error = 'Session de connexion expirée. Veuillez vous reconnecter.';
      this.backToLogin();
      return;
    }

    const code = this.twoFactorForm.value.code;
    this.loading = true;
    this.error = null;
    
    this.http.post<any>('/api/auth/verify-2fa', {
      username: this.currentUsername,
      code: code,
      preAuthTicket: this.preAuthTicket
    }).subscribe({
      next: async (response: any) => {
        this.loading = false;
        
        // Vérifier si un token JWT est présent dans la réponse
        const token = response.token || null;
        if (!token) {
          this.error = 'Token d\'authentification manquant dans la réponse du serveur.';
          return;
        }
        
        // Stocker les droits et le token dans AppStateService
        const modules: string[] = Array.from(new Set(response.droits.map((d: any) => d.module)));
        const permissions: { [module: string]: string[] } = {};
        response.droits.forEach((d: any) => {
          if (!permissions[d.module]) permissions[d.module] = [];
          permissions[d.module].push(d.permission);
        });
        this.appState.setUserRights({
          profil: response.role === 'SUPER_ADMIN' ? 'SUPER_ADMIN' : response.profil,
          modules,
          permissions,
          pays: response.pays
        }, response.username, token);

        // Appliquer la marque de l'entreprise (ou les défauts pour SUPER_ADMIN)
        this.applyEntrepriseBranding();

        // Charger les modules actifs après 2FA
        await this.loadActiveModules(response.username, token);
        
        this.userLogService.logActivity('connexion', 'Authentification', response.username, 'Connexion réussie (2FA)');
        
        // Après 2FA, appliquer la même logique de redirection sécurisée.
        let returnUrl = this.route.snapshot.queryParams['returnUrl'] as string | undefined;
        if (returnUrl?.startsWith('/login')) {
          returnUrl = undefined;
        }
        this.router.navigateByUrl(this.appState.resolveAccessibleRoute(returnUrl));
      },
      error: (err) => {
        this.loading = false;
        if (err.status === 423 || err.status === 401) {
          this.error = err.error?.error || 'Code d\'authentification invalide. Veuillez réessayer.';
          this.twoFactorForm.patchValue({ code: '' });
        } else {
          this.error = 'Une erreur est survenue lors de la vérification du code. Veuillez réessayer.';
        }
      }
    });
  }

  backToLogin() {
    this.requires2FA = false;
    this.currentUsername = null;
    this.preAuthTicket = null;
    this.showQRCode = false;
    this.qrCodeBase64 = null;
    this.secret = null;
    this.otpAuthUrl = null;
    this.twoFactorForm.reset();
    this.error = null;
  }

  /**
   * Copie la clé secrète dans le presse-papiers
   */
  copySecret() {
    if (!this.secret) return;
    
    navigator.clipboard.writeText(this.secret).then(() => {
      this.error = null; // Réinitialiser l'erreur
      // Afficher un message de succès temporaire
      setTimeout(() => {
        // Le message disparaîtra automatiquement
      }, 3000);
    }).catch(() => {
      this.error = 'Impossible de copier la clé secrète';
    });
  }

  /**
   * Applique la marque (logo + thème) après connexion.
   * Un SUPER_ADMIN n'appartient à aucune entreprise : il conserve les
   * couleurs/logo par défaut. Un utilisateur d'entreprise reçoit la marque de
   * SON entreprise (déduite du jeton), en ignorant un éventuel `?entreprise=`
   * présent dans l'URL de connexion.
   */
  private applyEntrepriseBranding(): void {
    if (this.appState.isSuperAdmin()) {
      this.themeService.useDefaults();
      this.logoService.useDefaults();
      return;
    }
    this.themeService.init(null);
    this.logoService.load(null);
  }

  /**
   * Charge les modules actifs pour l'entreprise courante via /api/modules/active
   * et les stocke dans AppStateService.
   */
  private async loadActiveModules(username: string, token: string): Promise<void> {
    // Un SUPER_ADMIN plateforme n'appartient à aucune entreprise : il n'a donc
    // aucun module actif. On évite l'appel métier /api/modules/active (403).
    if (this.appState.isSuperAdmin()) {
      this.appState.setActiveModules([]);
      return;
    }
    try {
      const response = await this.http.get<any>('/api/modules/active', {
        headers: { Authorization: `Bearer ${token}` }
      }).toPromise();
      
      const activeModules: string[] = response?.modules ?? [];
      this.appState.setActiveModules(activeModules);
      
      // Notifier la sidebar du changement
      // NavigationVisibilityService sera notifié via AppStateService
    } catch (err) {
      console.warn('Impossible de charger les modules actifs:', err);
      // En cas d'erreur, on ne bloque pas la connexion - les modules restent vides
      this.appState.setActiveModules([]);
    }
  }
}
