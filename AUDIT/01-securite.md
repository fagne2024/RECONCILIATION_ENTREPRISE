# 01 — Sécurité

> ✅ **Mise à jour (Vague 1 appliquée)** : les constats 🔴 critiques sont corrigés
> (auth obligatoire `S-01`, `SqlController` supprimé `S-02`, 2FA par ticket `S-03`,
> reset par jeton `S-04`, secrets sans fallback `S-06`, plus de spoofing `X-Username`
> `S-07`, admin dev sans mdp fixe `S-09`). Détail et écarts : `AUDIT/07-plan-fix-vague1.md`.
> Les constats 🟠/🟡 ci-dessous restent ouverts (Vagues 2/3).
>
> Conventions : **Aujourd'hui** = exploitable tel quel sur l'environnement actuel (auth désactivée).
> **Après réactivation** = exploitable une fois `permitAll` corrigé, tant que le point n'est pas traité.
> Confiance : ✅ vérifié par lecture directe / 🔶 déduit d'un sous-agent ou d'un pattern, à re-vérifier.

---

## A. Exploitable AUJOURD'HUI

### 🔴 A1 — 100 % des API sont publiques (socle de tous les autres risques)
**Confiance ✅ — Exploitable aujourd'hui : OUI**

- `SecurityConfig.java:64-72` : `requestMatchers("/api/**").permitAll()` puis `anyRequest().permitAll()` — commenté « TEMPORAIRE », **aucun `@Profile`**.
- `SecurityConfig.java:61` : CSRF désactivé ; `:76` : sessions STATELESS.
- Comptage indépendant : **48 controllers, 478 endpoints, 0 `@PreAuthorize`/`@Secured`/`@RolesAllowed`** malgré `@EnableMethodSecurity` (`SecurityConfig.java:27`).
- **Conséquence** : lecture/écriture totale sur données financières, comptes, profils, configuration — sans identité.

**Correction minimale** : remplacer par `authenticated()` par défaut + liste explicite de chemins publics (login, forgot-password, health), et activer `@EnableMethodSecurity` réellement.

---

### 🔴 A2 — Exécution SQL arbitraire non authentifiée
**Confiance ✅ — Exploitable aujourd'hui : OUI — CRITIQUE MAXIMALE**

- `SqlController.java:13` → `POST /api/sql/execute` (`:23`).
- `SqlController.java:35` : `entityManager.createNativeQuery(sql)` sur le corps de requête.
- `:44` : branche non-SELECT → `executeUpdate()` → **UPDATE/DELETE/DROP en toute liberté**.
- `:53-58` : renvoie `e.getMessage()` (fuite d'infos internes).
- Second endpoint `POST /api/sql/correct-frais-celcm0001` (`:66`) : exécute des UPDATE codés en dur.

**Impact** : suppression ou altération de l'intégralité de la base `top20` en un appel HTTP ; exfiltration en SELECT.

**Correction** : supprimer `SqlController` du code de production (à défaut : rôle admin unique + allow-list de requêtes + journalisation + environnement `@Profile("!prod")`).

---

### 🔴 A3 — Bypass total de la double authentification
**Confiance ✅ — Exploitable aujourd'hui : OUI**

1. **Le secret TOTP est renvoyé en clair après simple mot de passe**
   - `AuthController.java:97-106` : si 2FA activée et `qrCodeScanned=false` → `response.put("secret", user.getSecret2FA())` + QR code.
   - Attaquant avec le mot de passe peut alors calculer lui-même les OTP → **la 2FA ne protège plus rien**.
2. **Endpoints 2FA entièrement sans authentification** — `TwoFactorAuthController.java` :
   - `POST /api/auth/2fa/setup` (`:31`), `/enable` (`:71`), `/activate` (`:116`), **`/disable` (`:178`)**, `GET /status` (`:212`), **`/reset` (`:233`)** — tous pilotés par un simple champ `username` dans le JSON.
   - **Impact** : `disable` désactive le 2FA de n'importe quel compte ; `reset` regénère un secret → prise de contrôle d'un compte 2FA protégé ; `status` confirme l'existence de comptes.

**Correction** : ces endpoints exigent une session authentifiée **et** une OTP valide pour l'actation sensible ; ne jamais renvoyer `secret` hors du flux d'enrôlement déjà authentifié.

---

### 🔴 A4 — Prise de contrôle de n'importe quel compte (password reset sans contrôle)
**Confiance ✅ — Exploitable aujourd'hui : OUI**

- `UserController.java:263` `POST /api/users/forgot-password` : **aucune vérification** — choisit un nouveau mot de passe, le hash, **l'envoie par email** (`:293-308`). Public (A1).
- `UserController.java:367` `POST /api/users/{id}/reset-password` : idem **par identifiant numérique**, aucun droit requis.
- `UserController.java:329` `POST /api/users/{id}/set-enabled` : désactivation de compte par n'importe qui.
- `UserController.java:104` `PUT /api/users/{id}` : `:131-133` accepte un mot de passe en clair depuis le corps → **hashé oui, mais fixé par l'attaquant**.
- `UserController.java:55` `POST /api/users` : création d'utilisateur sans droit.
- **Pas de politique de mot de passe** (aucune contrainte de longueur/complexité trouvée dans `UserController`).
- Génération aléatoire correcte : `SecureRandom` (`UserController.java:406`) ✅.

**Correction** : token à usage unique + expiration pour reset, authorisation `ADMIN` sur `/{id}/*`, validation de politique de mot de passe.

---

### 🔴 A5 — XSS stocké → vol de session (CSP ineffective)
**Confiance ✅ — Exploitable aujourd'hui : OUI**

- CSP : `SecurityConfig.java:105` → `script-src 'self' 'unsafe-inline' 'unsafe-eval'` : **l'atténuation de l'XSS est annulée** (combiné au mode webpack dev serveur probable ; à confirmer en prod 🔶).
- Vecteurs de stockage :
  - `GuideDocumentController.java:127-132` (`PUT /api/guide-documents/update`) — contenu HTML stocké sans sanitisation.
  - `SopDocumentController.java:131` (`PUT /api/sop-documents/update`) — idem.
  - Tables cibles : guide-utilisation, sop-operation, sop-reconciliation-trx (rapport sous-agent 🔶).
- **Chaîne** : écriture publique (A1) → script exécuté dans la SPA → lecture de `auth_token` / `userRights` en localStorage (`app-state.service.ts:41-43,441-451`) → **vol de session + élévation via `userRights`**.

**Correction** : sanitiser (OWASP Java HTML Sanitizer) à l'écriture + servir CSP stricte sans `unsafe-inline`/`unsafe-eval` + sortir le token du localStorage (cf. 05).

---

### 🔴 A6 — Secrets JWT par défaut présents dans le dépôt → forge de tokens
**Confiance ✅ — Exploitable aujourd'hui : OUI (si la variable d'env `JWT_SECRET` est absente)**

- `JwtService.java:23` : valeur par défaut `"your-256-bit-secret-key-change-this-in-production..."`.
- `application.properties:101` : `${JWT_SECRET:dev-secret-key-change-in-production-min-32-chars...}`.
- `application-prod.properties:74` : `${JWT_SECRET:your-256-bit-secret-key-change-this-in-production...}` — **un fallback existe aussi en profil prod**.
- Algorithme HS256 symétrique (`JwtService.java:34,49`) : quiconque connaît le secret **fabrique un token pour `admin`**.
- `application-prod.properties:8` : `${DB_PASSWORD:}` → défaut vide, l'app démarre quand même (connexions échouant silencieusement).

**Correction** : supprimer tout défaut (`jwt.secret=` sans fallback), refuser le démarrage si absent ; rotation du secret actuel (considéré compromis).

---

### 🟠 A7 — Spoofing d'identité par header `X-Username`
**Confiance ✅ — Exploitable aujourd'hui : OUI (dès que l'auth sera réactivée, c'est le piège suivant)**

- `RequestContextUtil.java:18` : lit `SecurityContextHolder`, **puis fallback `request.getHeader("X-Username")` (`:35`)**.
- Le cloisonnement pays s'appuie dessus (ex. `Result8RecController.java:100-194` 🔶) → un appelant peut changer de pays en Changeant juste l'en-tête.
- `RateLimitingFilter.java:222` : lit aussi `X-Username` pour le compteur par utilisateur → **le rate limit peut être « rebasé »** en changeant l'en-tête.

**Correction** : ne JAMAIS faire confiance à un en-tête client pour l'identité ; n'utiliser que le `SecurityContext` ; purger le fallback.

---

### 🟠 A8 — Rate limiting contournable + chemins lourds exemptés
**Confiance ✅ — Exploitable aujourd'hui : OUI**

- Valeurs : 60 req/min et 1000/h par IP (`RateLimitingFilter.java:40,43`), activé par défaut (`:37`).
- **Clé IP dérivée des en-têtes client** : `X-Forwarded-For` en premier (`:234`), puis `X-Real-IP`, `Proxy-Client-IP`, `WL-Proxy-Client-IP` (`:236-242`) → en rotation d'en-têtes, **chaque requête a une IP différente**.
- **Exemptions de la chaîne de réconciliation** (`RateLimitingFilter.java:175-184`) : `analyze-keys`, `reconcile`, `upload`, `start`, `execute-magic`, `save-summary`, `progress*`, `live-progress*`, `results*` — soit les endpoints les plus coûteux (parsing de fichiers de plusieurs Go, `multipart 3GB` : `application.properties:54-55`) → **DoS de ressources non protégé**.
- Exclusions supplémentaires configurables (`:53`, `:56-73`).

**Correction** : IP réelle seulement depuis la chaîne de proxy de confiance (sauts configurés), et appliquer un quota aux endpoints lourds (et surtout : authentifier).

---

### 🟠 A9 — Compte initial `admin/admin` créé au démarrage
**Confiance ✅ — Exploitable aujourd'hui : OUI (sur base vierge)**

- `DatabaseInitializer.java:9-10` : `@Component` + `CommandLineRunner`, **aucun `@Profile`** → exécuté à chaque démarrage.
- `:18` : si `userRepository.count() == 0` → crée `admin` avec mot de passe **en clair `"admin"`** (`:25`) et l'affiche dans les logs (`:30-31`).
- La connexion accepte les mots de passe non-bcrypt → voir B3 : ce compte est réellement utilisable.

**Correction** : initialisation seulement en profil `dev`, mot de passe généré (SecureRandom) et affiché une seule fois / forcé au premier login, jamais de valeur en clair dans les logs.

---

### 🟠 A10 — Jeton d'authentification côté client stocké de façon violable
**Confiance ✅ (stockage) / 🔶 (gravité selon XSS) — Exploitable aujourd'hui : OUI**

- `app-state.service.ts:41-43,441-451,530-563` : `auth_token`, `userRights` (profil + modules + permissions) en **localStorage**.
- Toute lecture XSS = vol de session ; `userRights` en localStorage = **élévation de privilège locale** (les gardes Angular lisent ce tableau).
- `logout` (`AuthController.java:256`) : côté serveur sans effet (stateless) → **déconnexion purement cosmétique**, le token reste valable 24 h (`jwt.expiration=86400000`, `application.properties:102`).

**Correction** : cookie `HttpOnly` `SameSite=Strict` (+ CSRF) ou accepter le risque en le documentant ; liste de révocation serveur ou TTL court avec refresh ; `userRights` recalculé côté serveur.

---

## B. Exploitable APRÈS réactivation de l'auth

### 🔴 B1 — L'interceptrice de permissions est fail-open
**Confiance ✅ — Après réactivation : OUI si oublié**

- `WebConfig.java:37-38` : `PermissionInterceptor` enregistrée sur `/api/**` (exclusions internes `PermissionInterceptor.java:33-43,55-61,65-74`).
- `PermissionInterceptor.java:91-95` : **sans utilisateur connecté → accès accordé**.
- Risque de régression : toute route non couverte ou tout appel sans token continue de passer.

**Correction** : fail-closed (refus par défaut) + test de non-régression.

---

### 🟠 B2 — Gestion verrouillage de compte exploitable
**Confiance ✅ — Après réactivation : OUI**

- `LoginLockService.java:19-20` : 5 échecs → verrou 30 min.
- Compteur en lecture-modification-écriture **sans `@Version`** → non atomique, contournable en concurrence 🔶.
- **DoS** : verrouiller un compte connu (ex. `admin`) en 5 tentatives → déni de service légitime pendant 30 min.
- `AuthController.java:89` : message avec `remainingAttempts` → **énumération de comptes**.

**Correction** : verrouillage par hash de clé (IP+compte) avec `@Version` ou `UPDATE ... SET attempts=attempts+1` atomique ; message générique ; backoff progressif plutôt que compte verrouillable par tiers.

---

### 🟠 B3 — Fallback de vérification de mot de passe en clair
**Confiance ✅ — Après réactivation : OUI**

- `AuthController.java:74-82` et `UserController.java:237-243` : si le hash ne commence **pas** par `$2a$`/`$2b$` → comparaison texte en clair.
  - Les hashes `$2y$` (d'autres outils) **échouent** en comparaison texte → compte inverrouillable.
  - Un utilisateur au mot de passe stocké en clair reste connectable en clair.
- Recommandation : migration unique vers bcrypt/argon2 + refus des comptes non hachés.

---

### 🟡 B4 — JWT sans `issuer`/`audience`, expiration 24 h, aucun revoke
**Confiance ✅ — Après réactivation : risque résiduel**

- `JwtService.java:40-49` : claims `username` + `expiration` uniquement, aucun `issuer`/`audience`/`jti`.
- `:26` : 24 h → token volé valable un jour entier.
- `SecurityConfig.java:76` : STATELESS → aucune révocation possible (pas de logout réel).

---

### 🟡 B5 — CORS : liste explicite mais duplication + IP publique hardcodée
**Confiance ✅ — Après réactivation : atténuation XSS partiellement**

- `GlobalCorsConfig.java:24-38` : allow-liste explicite avec `allowCredentials(true)` (pas de `*` ✅) mais **inclut l'IP publique `172.214.108.8`** dans la liste.
- **37 `@CrossOrigin` durcis** dans les controllers (dont `AuthController.java:27`, `TwoFactorAuthController.java:18`, `SqlController.java:14`, `OperationController.java:30,366,372`) : divergence de listes possibles → enforcement imprévisible.

**Correction** : source de vérité unique (config serveur), retirer les IP hardcodées, env vars par environnement.

---

### 🟡 B6 — Logging de données sensibles
**Confiance ✅ — Après réactivation : fuite d'infos**

- 810 `System.out.println` + 82 `printStackTrace` dans `src/main/java`.
- Exemples : mots de passe dans les logs (`DatabaseInitializer.java:31`), SQL exécuté (`SqlController.java:33`), emails (`UserController.java:309`), erreurs DB en clair (`SqlController.java:56`).
- Aucun audit trail de qui a modifié quel enregistrement (les `UserLogController` existent, usage à vérifier 🔶).

---

### 🟡 B7 — Point de monitoring cassé côté proxy
**Confiance ✅ — Impact opérationnel**

- `nginx.conf:115` proxy vers `/actuator/health`, mais **`spring-boot-starter-actuator` absent du `pom.xml`** → 404 systématique, health-check du proxy inopérant.
- `nginx.conf:80,116` : `proxy_ssl_verify off`.

---

## C. Durcissement configuration (sécurité matérielle)

| # | Constat | Preuve | Priorité |
|---|---|---|---|
| C1 | `allowMultiQueries=true` sur le datasource | `application.properties:17`, `application-prod.properties:6` | 🔴 (amplifie A2 : enchaînement d'instructions) |
| C2 | `useSSL=false` vers MySQL | mêmes fichiers | 🟠 |
| C3 | `ddl-auto=update` **y compris profil prod** | `application.properties:23`, `application-prod.properties:12` | 🔴 (cf. 03) |
| C4 | `show-sql=true` en prod | `application-prod.properties:13` | 🟡 |
| C5 | Upload 3 Go + `multipart.location=/tmp` + `resolve-lazily` | `application.properties:54-58` | 🟠 (DoS disque ; cf. A8) |
| C6 | `spring-boot-devtools` dans les dépendances de build | `pom.xml:174-177` | 🟡 (actif hors jar repackage) |
| C7 | TLS : `ssl_prefer_server_ciphers off` (nginx.conf:27), `ssl_ciphers` limité | `nginx.conf:25-27` | 🟡 |
| C8 | Répertoire `.env`/secrets absent du dépôt ✅, mais fallbacks présents (A6) | — | 🔴 |
| C9 | Aucune limite de tentatives réseau / WAF / IP fixe | — | 🟠 |

---

## Synthèse — plan de remédiation sécurité ordonné

| Ordre | Action | Effet |
|---:|---|---|
| 1 | Supprimer/désactiver `SqlController` en prod | coupe la destruction de base en 1 requête |
| 2 | Passer `permitAll` → `authenticated()` + allow-list publique | ferme les 478 endpoints |
| 3 | Supprimer les fallbacks de secrets (`jwt.secret=` sans défaut) + rotation | empêche la forge de JWT |
| 4 | Corriger 2FA (pas de secret renvoyé, endpoints 2FA authentifiés) | rétablit la 2FA |
| 5 | Sécuriser reset/enabled/create users (token + admin) | stoppe le takeover |
| 6 | Purger `X-Username` de `RequestContextUtil` et du rate limiter | empêche l'usurpation |
| 7 | Sanitiser documents + CSP stricte | coupe le XSS stocké |
| 8 | Rate limiter : IP réelle + quotas sur les endpoints lourds | coupe le DoS |
| 9 | `DatabaseInitializer` en profil dev uniquement | supprime `admin/admin` |
| 10 | Fail-closed de `PermissionInterceptor` + tests | sécurité post-réactivation |

**Dépendance** : la réactivation du JWT (étape 2) n'est défendable qu'après les étapes 1, 3, 4, 5 et 6 — sans elles, on remplace « tout est ouvert » par « ouvert mais contournable ».
