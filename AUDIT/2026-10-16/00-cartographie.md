# 00 — Cartographie (audit 2026-10-16)

> Lecture seule. Code **actuel** (après Vague 1 auth + chantier multi-entreprises).
> Remplace l’audit du 2026-10-08 pour l’état de l’application.
> Inventaire : 55 controllers, **577** mappings HTTP, 25 `@PreAuthorize`, 56 `@Entity`, **44** avec `@TenantId`, 24 fichiers de test Java.

## 1. Architecture

```
SPA Angular 14.2 (TypeScript)
  → nginx.conf et/ou apache.conf (les deux coexistent ; lequel est actif = à confirmer)
  → Spring Boot 3.2.3 / Java 17 / Maven (pas de mvnw)
       server.port=8080 (application.properties:7)
  → MySQL `top20` (connector 8.0.33)
       allowMultiQueries=true, useSSL=false (application.properties:17)
  → Flyway V1–V12, ddl-auto=validate (application.properties:24-37)
```

- Déploiement Windows (chemins `C:/Certs`, `C:/nginx` dans les scripts frontend).
- **Pas de CI** (aucun `.github/`, Jenkins, GitLab).
- **Pas de Dockerfile** dans l’arbre actuel.
- Profil par défaut : `spring.profiles.active=${SPRING_PROFILES_ACTIVE:dev}` (`application.properties:116`).

## 2. Auth / autorisation (état actuel, pas l’état d’octobre)

| Couche | État |
|---|---|
| `SecurityFilterChain` | `anyRequest().authenticated()` + allow-list login/2FA/forgot/reset/activate/check-admin/config lecture (`SecurityConfig.java:77-96`) |
| JWT | HS256, `parseSignedClaims`, secret obligatoire ≥ 32 octets, claims `role` + `entrepriseId` |
| CSRF | désactivé (JWT header) — justifié **si** le token n’est pas en cookie |
| Sessions | STATELESS |
| `@EnableMethodSecurity` | actif ; `@PreAuthorize` seulement users + `/api/platform/**` |
| `PermissionInterceptor` | `/api/**` ; **fail-open** sans username et sur exception ; lit encore `X-Username` |
| Multi-tenant | `TenantContext` depuis claim JWT ; Hibernate `@TenantId` + `TenantGuardEntityListener` `@PostLoad` |
| Pays | `PaysFilterService` sur une partie des services, **pas** sur tous les GET `{id}` |

### Allow-list publique (légitime vs à revoir)

| Chemin | Légitime ? |
|---|---|
| POST `/api/auth/login`, `/verify-2fa` | oui |
| GET `/api/auth/entreprise` | oui (code entreprise) |
| POST `/api/users/forgot-password`, `/reset-password`, `/activate` | oui |
| GET `/api/users/check-admin` | **non** — révèle si `admin` existe |
| GET `/api/configuration/logo|theme|navigation-labels` | acceptable (écran login) |
| `/`, `/health`, `/error`, OPTIONS | oui |

## 3. Inventaire des points d’entrée

Controllers (55) : Auth, Users, 2FA, Reconciliation (30 mappings), Operation (45), TrxSf (32), Profil (24), EcartSolde (24), Frais (25), Compte (21), FileWatcher, Result8Rec, Platform*, Test, Configuration, Flux, etc.

`@Scheduled` : `BackendHeartbeat` (30 s), `ReconciliationLockService` (5 min). **0 `@Async`**.

Pas d’Actuator, pas de springdoc/Swagger, H2 console désactivée (`application-prod.properties:39`).

## 4. Flux critiques (bout en bout)

### 4.1 Login + 2FA
`login` → bcrypt ou **fallback clair** → si 2FA : ticket 5 min (pas de secret) + QR si non scanné → `verify-2fa` consomme le ticket atomiquement → JWT 24 h → Angular `localStorage` (`auth_token`, `userRights`).
**Défaillances** : QR encode le secret ; compte verrouillé encore utilisable via JWT déjà émis ; logout cosmétique.

### 4.2 Réconciliation
Upload (limite 3 Go) → `CsvReconciliationService` (moteur **actif**, ~1571 lignes) sur le **thread HTTP** → résultats en `resultJson` / maps mémoire → `/progress`, `/results`.
`POST /start` **ne lance rien** (`ReconciliationController.java:638-644`).
Chemins lourds **exemptés** du rate limit.

### 4.3 Mark-OK
`POST /mark-ok` et `/bulk` : insert `reconciliation_ok_keys` par `key` string, **sans** rattachement job/agence/utilisateur, unicité **globale** sur `key_value`.

### 4.4 Opérations / comptes
CRUD + import Excel. Tenant Hibernate + filtre pays **inégal** (compte `{id}` filtré, opération `{id}` non).

## 5. Single points of failure

1. Une instance JVM : progression et une partie des jobs en `ConcurrentHashMap`.
2. MySQL unique `top20` ; `allowMultiQueries=true`.
3. Secret JWT unique HS256 (pas de rotation).
4. Double reverse-proxy (nginx vs Apache) non tranché.
5. Profil `dev` par défaut si `SPRING_PROFILES_ACTIVE` oublié en prod.

## 6. Baseline outils

Voir `06-outils.md`. Tests `@SpringBootTest` pointent `jdbc:mysql://localhost:3306/reco_test` (jetable, **pas** `top20`) — non exécutés ici pour éviter toute connexion MySQL locale ambiguë. Compilation unitaire lancée séparément.
