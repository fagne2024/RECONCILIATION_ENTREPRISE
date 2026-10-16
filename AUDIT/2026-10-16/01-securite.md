# 01 — Sécurité (2026-10-16)

> Auth **réactivée**. « Aujourd’hui » = avec JWT obligatoire. Confiance ✅ = lu dans le fichier cité.

## A. Chaîne Spring Security

`SecurityConfig.java:77-96` : `authenticated()` par défaut. CSRF off (`:64`) — OK tant que JWT est en header, pas cookie. CSP avec `'unsafe-inline' 'unsafe-eval'` (`:129-130`).

`JwtAuthenticationFilter.java:75-77` : pas de Bearer → continue sans auth (fail-closed ensuite via `authenticated()`). Token invalide → 401 (`:133-144`), **pas** fail-open. `parseSignedClaims` (`JwtService.java:134-137`) : rejet `alg=none` ✅. Utilisateur `disabled` → 401 (`:103-107`). **Compte verrouillé** (`accountLockedUntil`) : **non relu** sur chaque requête — seulement au login (`LoginLockService`).

Tenant : claim `entrepriseId` du **token** (`JwtAuthenticationFilter.java:93-96`), pas rechargé depuis `user.entreprise_id`. Jeton 24 h périmé vis-à-vis d’un changement d’entreprise.

## B. Constats exploitables AUJOURD’HUI (utilisateur authentifié, ou public)

### 🔴 SEC-01 — Intercepteur de permissions fail-open
- `PermissionInterceptor.java:195-198` : pas de username → `return true`.
- `:261-267` : exception → `return true` (« mode permissif »).
- `PermissionCheckService.java:419-427` : module ou permission non mappés → **autorisation par défaut**.
- Chemins **non mappés** (donc ouverts à tout JWT) : `/api/guide-documents`, `/api/sop-documents`, `/api/configuration` (hors GET publics), `/api/test`, `/api/renommer`, `/api/file-conversion`, `/api/calculation-rule`, `/api/top-users-config`, `/api/suivi-ecart`, `/api/guide-node`, `/api/sop-node`, etc. (`mapApiPathToModule` `:534-584`).

**Exploitable aujourd’hui : OUI** (JWT quelconque). Après durcissement mapping : encore si fail-open exception.

### 🔴 SEC-02 — Escalade de privilèges via `/api/profils/{id}/droits`
Le regex `:97-99` **exclut** ce chemin **avant** tout contrôle SuperAdmin/tenant/permissions. GET **et** POST (`ProfilController.java:156-186`) : un utilisateur authentifié de l’entreprise peut **ajouter des droits** à un profil (y compris le sien). Isolation tenant Hibernate limite au tenant ; l’escalade **intra-entreprise** reste.

**Exploitable aujourd’hui : OUI.** Confiance Haute.

### 🔴 SEC-03 — XSS stocké + CSP inutilisable
`GuideDocumentController.java:127-132` et `SopDocumentController` : HTML/`extractedText` stocké sans sanitizer. Frontend `bypassSecurityTrustHtml` (`guide-utilisation.component.ts:559`, `sop-*.ts`). Token en `localStorage` (`app-state.service.ts:461`). Combiné SEC-01 (guides non mappés).

**Exploitable aujourd’hui : OUI** (n’importe quel compte connecté).

### 🟠 SEC-04 — Spoofing `X-Username` (S-07 déclaré corrigé, incomplet)
`PermissionInterceptor.java:392-408` : après SecurityContext, lit `X-Username`, session, `?username=`. Un JWT USER + header `X-Username: admin` fait vérifier les **droits d’admin** (`PermissionCheckService.java:373-375` : `"admin".equals(username)` → tout autoriser).

`RequestContextUtil` a bien été nettoyé. L’intercepteur non. `UserLoggingInterceptor.java:225-226` lit aussi le header (logs).

**Exploitable aujourd’hui : OUI.**

### 🟠 SEC-05 — Override `X-Permission-Module` / `X-Permission-Action`
`PermissionInterceptor.java:83-84` + `PermissionCheckService.java:287-332, 501-503`. L’intercepteur Angular **pose déjà** `X-Permission-Module` selon la route (`auth.interceptor.ts:36-43`). Un client peut revendiquer un module où il a `consulter` pour un API d’un autre module. Pour les sous-menus, un override **court-circuite** le module intrinsèque (`:287-303`).

**Exploitable aujourd’hui : OUI.**

### 🟠 SEC-06 — Secret TOTP exposé + 2FA désactivable sans OTP
- Login : plus de champ `secret` ✅ (`AuthController.java:130-131`) mais **QR** si `qrCodeScanned=false` (`:134-137`) — le QR **est** le secret.
- `POST /api/auth/2fa/setup` renvoie `"secret"` (`TwoFactorAuthController.java:66-67`).
- `POST /disable` (`:180-197`) : pas de code TOTP. Un JWT volé (ou SEC-04) désactive la 2FA.
- Fenêtre TOTP : `gAuth.authorize` (`TwoFactorAuthService.java:115`) — pas d’anti-rejeu du code déjà utilisé. Rate limit login existe ; `/verify-2fa` est public (`SecurityConfig.java:81`).
- Admin 2FA par `username` **sans** filtre tenant (`:132-134`, `:237-240`) : un ADMIN entreprise A peut cibler un user d’entreprise B (usernames globalement uniques, mais action cross-tenant).

Ticket 2FA : consommation atomique ✅ (`AuthTicketRepository.java:20-22`).

### 🟠 SEC-07 — Secrets et hash
- `UserEntity` : `@JsonIgnore` seulement `photo` et `entrepriseId`. `GET /api/users` et `/me` nullent le password (`UserController.java:72, 248`) **pas** `secret2FA`.
- Fallback clair `$2a$`/`$2b$` seulement (`AuthController.java:104-108`) — `$2y$` cassé ; mots de passe non bcrypt encore acceptés.
- `DatabaseInitializer.java:35` (`@Profile("dev")`) : mot de passe **aléatoire non hashé**.
- `application-dev.properties:4` : secret JWT de dev **dans le dépôt**. `application.properties:116` profil `dev` par défaut.
- Prod : `jwt.secret=${JWT_SECRET}` sans défaut ✅ (`application-prod.properties:83`). `DB_PASSWORD` sans défaut en prod ✅ ; **défaut vide** dans `application.properties:19`.

### 🟠 SEC-08 — Rate limit et DoS upload
`RateLimitingFilter.java:228-244` : IP via `X-Forwarded-For` (spoofable). Exemptions `:175-184` (`reconcile`, `upload`, `execute-magic`, `progress*`, `results*`). Multipart **3 Go** (`application.properties:65-68`).

### 🟡 SEC-09 — JWT / logout
Pas d’issuer/audience/jti. 24 h. Logout sans blacklist. Rôles relus en base via `UserDetails` ✅ ; `entrepriseId` **pas**. CSRF off OK (header). CORS : IP `172.214.108.8` encore dans `AuthController.java:32` et `app.cors.allowed-origins` prod.

### 🟡 SEC-10 — Énumération / surfaces publiques
- `GET /api/users/check-admin` public (`SecurityConfig.java:87`, `UserController.java:227-230`).
- `GET /api/auth/entreprise?username=` public (`AuthController.java:376-391`) : existence + nom d’entreprise.
- `remainingAttempts` (`LoginLockService.java:62`) — énumération affaiblie (message login générique si user inconnu `AuthController.java:67`, mais tentatives restantes si user connu).
- Verrouillage 5 échecs / 30 min : DoS sur un compte connu ; compteur non atomique (pas `@Version`).
- `TestController` `/api/test/ping` authentifié mais inutile en prod.
- `HomeController.java:17-34` public `/` liste des familles d’endpoints.

### 🟡 SEC-11 — File watcher
Sanitize nom + `normalize` + `startsWith(folder)` (`FileWatcherController.java:124-146, 249-260`) ✅ contre path traversal. Type = **extension seulement**. POI `XSSFWorkbook` charge le classeur (zip bomb / mémoire — Hypothèse à confirmer sur les volumes). Watch folder par entreprise ✅.

### 🟠 SEC-18 — Catalogue modules global (cross-tenant)
`ProfilController.java:85-100` : `POST/PUT/DELETE /api/profils/modules` sur `ModuleEntity` **sans** tenant. Un ADMIN entreprise casse le référentiel de toutes les autres.

## C. Ce qui a été réellement corrigé depuis octobre

SqlController disparu. `permitAll /api/**` disparu. Secret JWT prod sans fallback. Ticket 2FA. Reset par jeton. `@PreAuthorize` users/platform. `RequestContextUtil` sans header. Flyway branché. Seed admin profil `dev`. Filtre JWT fail-closed. Tenant Hibernate + PostLoad.

## D. Actuator / Swagger / H2

Absents / H2 off. `nginx` peut encore pointer `/actuator/health` → 404 (ops).
