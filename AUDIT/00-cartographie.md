# 00 — Cartographie de l'application

> Audit en lecture seule. Aucune modification du code applicatif.
> Date : 2026-10-08. Baselines exécutées sur la copie de travail actuelle.
>
> ✅ **Mise à jour (Vague 1)** : `controller/SqlController.java` supprimé ;
> nouveaux composants `util/AdminRoleUtil`, `util/PasswordPolicyValidator`,
> `service/AuthTicketService`, `service/PasswordResetTokenService`,
> entités/repositories `AuthTicket*` et `PasswordResetToken*` ;
> page frontend `reset-password/`. Détail : `AUDIT/07-plan-fix-vague1.md`.

---

## 1. Architecture globale

```
Navigateur (SPA Angular 14)
   │  HTTPS
   ▼
nginx (nginx.conf) ou Apache (apache.conf)  ── TLS 1.2/1.3, reverse-proxy
   │  proxy_pass https://localhost:8443/   (nginx.conf:79)
   ▼
Spring Boot 3.2.3 (Java 17, Maven)  ── 8443, contexte /api/**
   │  JDBC MySQL `top20` (mysql-connector 8.0.33)
   ▼
MySQL : allowMultiQueries=true, useSSL=false, createDatabaseIfNotExist=true
        (application.properties:17)
```

- **Déploiement** : Windows (chemins `C:/nginx/ssl`, `C:/Apache24`, `C:/Certs`), pas de Docker, pas de `mvnw` (Maven 3.9.9 global), pas de CI détecté.
- **Double reverse-proxy** : deux fichiers de config coexistent (`nginx.conf`, `apache.conf`) — à confirmer lequel est actif (SPOF de configuration).
- **Fichiers lourds à la racine** : `top20_2026-07-07_222327.sql` (66,4 Mo) + `.zip` (8 Mo) — dump de base laissé dans le dépôt.

## 2. Backend — inventaire

| Élément | Valeur |
|---|---|
| Controllers `@RestController` | **48** |
| Endpoints (annotations `@*Mapping` méthode) | **478** |
| Annotations `@PreAuthorize` / `@Secured` / `@RolesAllowed` | **0** |
| Entités `@Entity` | 46 |
| Repositories | 46 |
| Fichiers Java (main) | 314 |
| Fichiers de test (test) | **8** (~32 tests) |
| Migrations Flyway `db/migration/*.sql` | 66 |
| `@Transactional` | 153 |
| `@Async` | 0 (aucune exécution asynchrone standardisée) |
| `System.out.println` dans main | 810 |
| `printStackTrace()` | 82 |
| Handler d'exception global | `exception/GlobalExceptionHandler.java:26` |

Packages : `config`, `controller`, `dto`, `entity`, `exception`, `filter`, `interceptor`, `json`, `mapper`, `model`, `repository`, `service`, `util`.

### Top 10 des controllers par taille (endpoints)

| Endpoints | Controller |
|---:|---|
| 43 | `OperationController.java` |
| 31 | `TrxSfController.java` |
| 29 | `ReconciliationController.java` |
| 24 | `FraisTransactionController.java` |
| 23 | `EcartSoldeController.java` |
| 23 | `ProfilController.java` |
| 20 | `CompteController.java` |
| 18 | `OperationBancaireController.java` |
| 15 | `OPPARTController.java` / `SupplyPredictionController.java` / `AutoProcessingController.java` / `ImpactOPController.java` |
| 14 | `ServiceReferenceController.java` |

### Controllers sensibles (détail dans 01-securite.md)

| Controller | Endpoint clé | Risque |
|---|---|---|
| `SqlController.java:13` | `POST /api/sql/execute` (`:23`) | **SQL natif arbitraire, SELECT/UPDATE, non authentifié** |
| `TestController.java:14` | `GET /api/test/ping` | code de test en production |
| `FileWatcherController.java:22` | `/start`, `/stop`, `/analyze-file` | contrôle du watcher de fichiers |
| `AuthController.java`, `TwoFactorAuthController.java` | 2FA sans auth | cf. 01 |
| `ConfigurationController.java` | 13 endpoints | configuration applicative modifiable |
| `UserController.java`, `ProfilController.java` | 11 + 23 | gestion des comptes/permissions |

## 3. Matrice auth — état actuel vs état cible

**État actuel (confirmé, `SecurityConfig.java:64-72`) : `requestMatchers("/api/**").permitAll()` + `anyRequest().permitAll()`, commenté « TEMPORAIRE », aucun `@Profile`.**

| Catégorie | Nb endpoints (ordre de grandeur) | Auth aujourd'hui | Cible |
|---|---:|---|---|
| Auth / 2FA (`AuthController`, `TwoFactorAuthController`) | 9 | public (légitime) + **endpoints 2FA sans session** | public pour login ; 2FA setup/enable/disable **authentifié** |
| Métier réconciliation / rapports | ~150 | **public** | authentifié + rôle + cloisonnement pays |
| Données financières (operations, comptes, soldes, frais, écart) | ~200 | **public** | authentifié + cloisonnement pays |
| Administration (users, profils, configuration, modèles) | ~80 | **public** | authentifié + rôle admin |
| Dangereux (`SqlController`, `FileWatcher`, `Test`) | ~8 | **public** | **supprimé ou admin strict + audit** |
| Technique (`/actuator/**` via proxy, heartbeat) | ~10 | à vérifier (proxy vers `/actuator/health`, nginx.conf:115) | restreint réseau / auth |

- **0 annotation d'autorisation de méthode** malgré `@EnableMethodSecurity` (`SecurityConfig.java:27`) → la couche existante est déclarée mais **jamais utilisée**.
- Interceptrice `PermissionInterceptor` bien enregistrée sur `/api/**` (`WebConfig.java:37-38`) mais **fail-open** sans utilisateur (`PermissionInterceptor.java:91-95`) et pilote par le header spoofable `X-Username` (`RequestContextUtil.java:31-36,51`).

**Conséquence : les 478 endpoints sont exploitables AUJOURD'HUI sans aucune identité.**

## 4. Flux critiques

### 4.1 Flux d'authentification
```
login (AuthController:97-113)
  → vérif mot de passe (bcrypt OU fallback plaintext :74-82)
  → si 2FA : renvoie {secret} en clair si qrCodeScanned=false   ← bypass 2FA
  → sinon émet JWT HS256 (JwtService.java:23, secret par défaut)
  → frontend stocke token + profil + droits dans localStorage (app-state.service.ts:41-43,441-451)
  → chaque requête : Authorization: Bearer (auth.interceptor.ts)
  → logout : purement cosmétique côté client
```

### 4.2 Flux de réconciliation
```
Upload fichiers (multipart 3GB max, application.properties:54-55)
  → parsing / stockage
  → POST /api/reconciliation/... (reconcile, execute-magic, progress, results)
       ⚠ ces chemins sont EXEMPTÉS du rate limiting (RateLimitingFilter)
  → moteur de réconciliation
```
⚠ **Deux chaînes coexistent** : l'ancienne (`ReconciliationController` + `SpecialRatioReconciliationService`) et un moteur moderne (`service/reconciliation/*` : `ReconciliationOrchestrator`, `BatchProcessor`, `MatchClassifier`…) qui **n'est injecté nulle part en production** (seul usage : test). Cf. 02-metier-fiabilite.md.

### 4.3 Flux documentaire (XSS stocké)
```
PUT /api/guide-documents/update (GuideDocumentController.java:127-132)
PUT /api/sop-documents/update   (SopDocumentController.java:131)
  → contenu HTML stocké tel quel
  → rendu dans la SPA avec CSP script-src 'unsafe-inline' 'unsafe-eval'
    (SecurityConfig.java:103-115)
  → exécution JS en contexte de session ⇒ vol de token localStorage
```

## 5. Frontend — inventaire

| Élément | Valeur |
|---|---|
| Framework | Angular **14** (EOL, non supporté par Node 24 — baseline : warnings) |
| Composants | 73 |
| Services | 73 |
| Routes (`app-routing.module.ts`) | 60, `canActivate: [AuthGuard, ModuleAccessGuard]` |
| Lazy loading | 1 seul module de routing (routing eager) |
| Stockage navigateur | 74 occurrences `localStorage`/`sessionStorage` : `auth_token`, `userRights`, chunks de réconciliation (`app-state.service.ts:441-451,530-563`, `reconciliation.service.ts:484,514,524,1338,1421`) |
| Scripts npm | `start` (serve SSL avec chemins `C:/Certs` hardcodés), `build`, `test` (Karma) **et** `test:jest` — **double chaîne de tests** |
| Budget bundle | warning 6.50 MB > 6 MB max (baseline build) |

## 6. SPOF identifiés

1. **Instance unique** : pas de conteneur, pas d'orchestrateur, pas de fichier de déploiement versionné (Start-App.ps1 manuel).
2. **MySQL unique en localhost** : `jdbc:mysql://localhost:3306/top20` — pas de réplication ni de backup documenté dans le dépôt.
3. **Fichiers uploadés sur disque local** (`spring.servlet.multipart.location=/tmp`) : perte en cas de crash, non partagé si une 2e instance apparaît.
4. **Verrous de réconciliation** : `ReconciliationLockService` (table DB, `@Scheduled` release :192) — mécanisme unique, fail-open si expiration mal réglée.
5. **`FileWatcher` + jobs en mémoire** (`progressMap`, jobs en statique) : une 2e instance casse l'état.
6. **Double proxy** nginx/apache non réconcilié : risque de configuration divergente.
7. **Secrets par défaut dans le dépôt** : si `JWT_SECRET`/`DB_PASSWORD` absents de l'environnement, l'application **démarre quand même** avec un secret dev.

## 7. Baselines de l'état initial (avant toute correction)

| Commande | Résultat | Preuve |
|---|---|---|
| `mvn -B -DskipTests package` | **BUILD SUCCESS** (25,9 s) | `AUDIT/baseline-backend-build.log` |
| `mvn -B test` | **BUILD SUCCESS — 32 tests, 0 failure, 0 error** (1 min 11) | `AUDIT/baseline-backend-test.log` |
| `npm run build` (frontend) | **OK** (413 s) — warnings : budget bundle 6.50 MB > 6 MB, css-syntax | `AUDIT/baseline-frontend-build.log` |
| `npx jest --ci` | **6 suites OK, 72 passed / 74 (2 skipped), 94 s** | `AUDIT/baseline-frontend-jest.log` |
| `npx ng lint` | **ÉCHEC : « Cannot find "lint" target »** (aucun target lint configuré) | `AUDIT/baseline-ng-lint.log` |

**Conclusion de baseline** : tout compile et les tests existants passent, **mais il n'y a aucun lint configuré et quasi aucune couverture métier** (8 fichiers de test sur ~250 classes de service).

## 8. Radar par phase

| Phase | Fichier | Points principaux |
|---|---|---|
| 1 | `01-securite.md` | 100 % des endpoints publics, SQL arbitraire, bypass 2FA, XSS stocké, secrets par défaut, rate limit contournable |
| 2 | `02-metier-fiabilite.md` | 2 chaînes de réconciliation, code mort, jobs mémoire, lambda de tri non conforme |
| 3 | `03-donnees-performance.md` | `ddl-auto=update` en prod, doublons Flyway, requêtes N+1, chargement de périodes entières en mémoire |
| 4 | `04-qualite-architecture.md` | dépendances mortes, doublons, `.ts` dans `backend/`, 810 `System.out.println` |
| 5 | `05-transverse.md` | couverture tests, double chaîne Karma/Jest, XSS, monitoring absent |
| 6 | `06-outils.md` | lint absent, Angular 14 EOL, Node 24 non supporté, pas de CI |
