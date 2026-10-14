# RAPPORT — Audit technique `reconciliation-app`

> Audit **en lecture seule** (aucune modification du code, aucune DB contactée).
> Réalisé : 2026-10-08. Preuves fichier:ligne dans `AUDIT/00..06`.
> Priorités : 🔴 critique · 🟠 majeur · 🟡 moyen · ⚪ info.
>
> ✅ **Mise à jour (Vague 1 appliquée)** : les 7 correctifs critiques `S-01..S-07/S-09`
> sont implantés et vérifiés (backend 54/54, frontend build + 72 tests OK). Voir
> `AUDIT/07-plan-fix-vague1.md` (statut APPLIQUÉ) pour le détail et les écarts.
> Les constats 🔴 ci-dessous sont **corrigés** ; les 🟠/🟡 restent ouverts (Vagues 2/3).

---

## Résumé exécutif

**L'application est aujourd'hui entièrement ouverte et indéfendable.** La configuration de sécurité met **tous** les `/api/**` en `permitAll` (`SecurityConfig.java:64-72`) avec des secrets par défaut et un compte `admin/admin` potentiel. Combiné à des endpoints d'exécution SQL arbitraire (`SqlController`), une 2FA contournable et un reset de mot de passe sans vérification, **n'importe quel visiteur du site peut lire toutes les données financières, les modifier ou les détruire en 1 à 2 requêtes HTTP**. Aucune des protections prévues (JWT, intercepteur de permissions, rate limit) n'est réellement opposable à un attaquant.

La **fiabilité** est fragilisée par : 3 moteurs de réconciliation (2 morts), un endpoint `/start` qui ment, des imports massifs sans transaction et sans index, une progression en mémoire non bornée, et des fichiers/résultats jamais purgés. L'**outillage** ajoute une dette forte : Dockerfiles incompatibles avec leur code (Java 11 vs 17), aucun CI ni lint, Angular 14 en fin de vie.

**Point positif** : le code métier existe et compile ; `GlobalExceptionHandler` et la config logback sont sains ; la pagination des résultats est bien pensée côté serveur. Le problème est une question de **politique de sécurité absente + hygiène de projet** — pas de refonte du métier.

---

## Classement global (priorité + exploitabilité)

| ID | Titre | Src | Prio | Expl. auj. | Confiance |
|---|---|---|---|---|---|
| **S-01** | 478 endpoints publics sans aucune auth | 01-A1 | 🔴 | **OUI** | ✅ |
| **S-02** | SQL natif arbitraire `POST /api/sql/execute` | 01-A2 | 🔴 | **OUI** | ✅ |
| **S-03** | Secret TOTP renvoyé en clair + endpoints 2FA sans auth | 01-A3 | 🔴 | **OUI** | ✅ |
| **S-04** | Prise de contrôle de comptes (reset/enabled/create publics) | 01-A4 | 🔴 | **OUI** | ✅ |
| **S-05** | XSS stocké + CSP neutralisée (`unsafe-inline/eval`) | 01-A5 | 🔴 | **OUI** | ✅ |
| **S-06** | Secrets JWT par défaut dans le dépôt → forge de tokens | 01-A6 | 🔴 | **OUI** | ✅ |
| **S-07** | Spoofing d'identité via `X-Username`/`X-User-Id` | 01-A7 | 🟠 | **OUI** | ✅ |
| **S-08** | Rate limit contournable (en-têtes) + endpoints lourds exemptés | 01-A8 | 🟠 | **OUI** | ✅ |
| **S-09** | Compte initial `admin/admin` à chaque démarrage | 01-A9 | 🟠 | **OUI** (base vierge) | ✅ |
| **S-10** | `auth_token` + `userRights` en localStorage, logout cosmétique | 01-A10 | 🟠 | **OUI** | ✅ |
| **S-11** | Intercepteur de permissions fail-open | 01-B1 | 🔴 | APRÈS | ✅ |
| **S-12** | Verrouillage de compte : race, DoS, énumération | 01-B2 | 🟠 | APRÈS | ✅ |
| **S-13** | Fallback de mot de passe en clair (`$2a$` ignoré) | 01-B3 | 🟠 | APRÈS | ✅ |
| **S-14** | JWT sans issuer/audience, 24 h, aucune révocation | 01-B4 | 🟡 | APRÈS | ✅ |
| **S-15** | CORS dupliqué (37 `@CrossOrigin`) + IP publique hardcodée | 01-B5 | 🟡 | APRÈS | ✅ |
| **S-16** | 810 `println` + `printStackTrace` (fuite d'infos logs) | 01-B6 | 🟡 | **OUI** | ✅ |
| **S-17** | Pool/`allowMultiQueries`/`useSSL=false`/multipart 3 Go / devtools | 01-C | 🟠 | **OUI** | ✅ |
| **M-01** | 3 moteurs de réconciliation ; 2 non utilisés en prod | 02-1 | 🟠 | — | ✅ |
| **M-02** | `POST /start` ne lance rien (faux job) | 02-R1 | 🔴 | **OUI** | ✅ |
| **M-03** | `resultJson` monolithique + jobs/fichiers jamais purgés | 02-R2 | 🔴 | **OUI** | ✅ |
| **M-04** | Progression en mémoire non bornée, perdue au restart | 02-R3 | 🟠 | **OUI** | ✅ |
| **M-05** | Verrous DB contournables + libération jamais appelée | 02-R4 | 🟠 | **OUI** | ✅ |
| **M-06** | Réconciliation synchronisée sur le thread HTTP, pool ≤ 2 | 02-R5 | 🟠 | **OUI** | ✅ |
| **M-07** | Métriques de logs absurdes (Infinity, taux 100 %/0 matchs) | 02-R6 | 🟡 | **OUI** | ✅ |
| **M-08** | « Prédiction » = heuristiques sans modèle | 02-R7 | 🟡 | **OUI** | ✅ |
| **D-01** | `ddl-auto=update` en prod + Flyway **non branché** | 03-D1 | 🔴 | **OUI** | ✅ |
| **D-02** | Migrations invalides ou en doublon (V4/V5/V6/V20/V23/V47/V53, V9999, VXX) | 03-D2 | 🔴 | **OUI** (bloquant) | ✅ |
| **D-03** | Aucun index déclaré (scans complets probables) | 03-D3 | 🟠 | **OUI** | 🔶 à confirmer EXPLAIN |
| **D-04** | `show-sql=true` + `format_sql=true` en prod | 03-D4 | 🟡 | **OUI** | ✅ |
| **D-05** | Dump `top20_*.sql` (66 Mo) dans le dépôt | 03-D5 | 🟡 | — | ✅ (non tracké ✅) |
| **D-06** | Imports massifs **sans `@Transactional`** | 03-T1 | 🔴 | **OUI** | ✅ |
| **D-07** | N+1 par ligne d'import + log par ligne | 03-T2 | 🟠 | **OUI** | ✅ |
| **Q-01** | Projet Node/TS/Prisma orphelin dans `backend/` + `dev.db` | 04-Q1 | 🟠 | — | ✅ |
| **Q-02** | Dépendances inutilisées (`commons-csv`, `h2`, `webflux`) | 04-Q2 | 🟠 | — | ✅ |
| **Q-03** | Services « god classes » (jusqu'à 1571 lignes) | 04-Q3 | 🟠 | — | ✅ |
| **Q-04** | Controllers avec logique + `System.out` en masse | 04-Q4 | 🟠 | — | ✅ |
| **Q-05** | Identité/CORS sans politique unique | 04-Q5 | 🟡 | **OUI** | ✅ |
| **Q-06** | Nommage/langue mélangés, pas de formatter/lint | 04-Q6 | 🟡 | — | ✅ |
| **Q-07** | Pas de wrapper (mvnw), chemins Windows -seuls- | 04-Q7 | 🟡 | — | ✅ |
| **X-01** | Couverture backend quasi nulle (8 fichiers/32 tests) | 05-X1 | 🔴 | — | ✅ |
| **X-02** | Double chaîne de tests frontend (Karma + Jest) | 05-X2 | 🟠 | — | ✅ |
| **X-03** | Aucun garde-fou (pas de lint, pas de CI) | 05-X3 | 🟡 | — | ✅ |
| **X-04** | Aucune observabilité ; health endpoint du proxy 404 | 05-X4 | 🔴 | **OUI** | ✅ |
| **X-05** | Pas de corrélation dans les erreurs | 05-X5 | 🟠 | **OUI** | ✅ |
| **X-06** | i18n partiel / messages backend en français | 05-X6 | 🟡 | — | 🔶 à voir UI |
| **X-07** | UX « faux départ » sur `/start` | 05-X7 | 🟡 | **OUI** | ✅ |
| **X-08** | Angular 14 EOL, bundle > budget | 05-4 | 🟠 | — | ✅ |
| **O-01** | `backend/Dockerfile` : Java 11 vs java 17 requis | 06-O1 | 🔴 | **OUI** (build) | ✅ |
| **O-02** | `frontend/Dockerfile` + `nginx.conf` Windows incompatibles | 06-O2 | 🔴 | **OUI** (build) | ✅ |
| **O-03** | Aucune CI | 06-O3 | 🟠 | — | ✅ |
| **O-04** | Pas de versions d'outillage verrouillées | 06-O4 | 🟠 | — | ✅ |
| **O-05** | Aucun scan de vulnérabilités | 06-O5 | 🟠 | — | ✅ |
| **O-06** | `.gitignore` vide | 06-O7 | 🟡 | — | ✅ |
| **O-07** | 3 systèmes de migrations référencés (Flyway/Prisma/SQL) | 06-O8 | 🟡 | — | ✅ |

---

## Détails critiques (top des actions)

### S-01 — Toutes les API sont publiques
`SecurityConfig.java:64-72` : `/api/**` et `anyRequest()` en `permitAll`, aucun `@Profile`. 478 endpoints × 0 annotation d'autorisation malgré `@EnableMethodSecurity` (`:27`). → **Réactiver l'auth est LE préalable ; sans lui, tout le reste est « ouvert ».**

### S-02 — SQL natif arbitraire
`SqlController.java:23,35` : `POST /api/sql/execute` exécute le SQL du corps (`createNativeQuery`, sinon `executeUpdate`). Destruction/exfiltration de toute la base en 1 requête. → **Supprimer du code de prod ou `@Profile("!prod")` + admin strict.**

### S-03 — 2FA contournable à chaque étage
`AuthController.java:97-106` renvoie le **secret TOTP** quand `qrCodeScanned=false` ; `TwoFactorAuthController` a `/disable` (`:178`) et `/reset` (`:233`) pilotés par un simple `username` sans authentification. → **Authentifier + OTP pour disable/reset, ne jamais exposer le secret.**

### S-04 — Takeover de comptes
`UserController.java` : `forgot-password` (`:263`) régénère et envoie le mot de passe sans vérification ; `/{id}/reset-password` (`:367`), `/{id}/set-enabled` (`:329`), `PUT /{id}` (`:104`) acceptent n'importe qui. → **Token à usage unique + expiration, admin requis, politique de mot de passe.**

### S-05 — XSS stocké, CSP inutile
CSP `'unsafe-inline' 'unsafe-eval'` (`SecurityConfig.java:105`) + HTML stocké via `PUT /api/guide-documents/update` (`GuideDocumentController.java:127-132`) / `PUT /api/sop-documents/update` (`SopDocumentController.java:131`). Vol du token localStorage (`app-state.service.ts`). → **Sanitiser à l'écriture + CSP stricte.**

### S-06 — Secrets par défaut (forge JWT)
`JwtService.java:23`, `application.properties:101`, `application-prod.properties:74` ont tous un secret HS256 par défaut → token `admin` forgeable si `JWT_SECRET` absent. → **Supprimer les fallbacks, échouer au démarrage si absent, rotation.**

### D-06 — Imports sans transaction
`OperationImportService` (aucune `@Transactional`), `OperationBancaireImportService`, `OPPARTService`, `CsvReconciliationService` : chaque ligne commit, non-atomicité, N+1 (`OperationImportService.java:83,126`) + log par ligne. → **`@Transactional` + pré-chargement des comptes + batch.**

### X-01 — Tests quasi inexistants
8 fichiers/32 tests pour ~250 classes ; `AbstractIntegrationTest` (Testcontainers) jamais étendu. Aucun test de sécurité. La réactivation de l'auth (S-01) se fera **sans filet**.

### O-01/O-02 — Dockerfiles incompatibles
`backend/Dockerfile` compile sous **Java 11** (`temurin-11`) alors que `pom.xml:225-226` exige 17 → build cassé. `frontend/Dockerfile` injecte `nginx.conf` aux chemin Windows (`C:/nginx/ssl/...`, `:21-22`) dans Alpine → proxy inutilisable.

---

## Feuille de route (par vagues)

> Ordre défendu par les dépendances : on ne réactive pas l'auth (étape 1) avant d'avoir supprimer ce qui la rend vide de sens (S-02/S-04/S-05 après S-06).

### Vague 1 — « Rendre l'attaque non triviale » (bloquante, ~1 sprint)
1. S-02 — désactiver/déplacer `SqlController` hors prod (coupe la destruction en 1 requête).
2. S-01 — `authenticated()` par défaut + allow-list publique (login/forgot/health) + test.
3. S-06 — secrets sans fallback, démarrage refusé, rotation.
4. S-04 — reset/enabled/create users : token + admin.
5. S-03 — 2FA authentifiée, secret jamais exposé.
6. S-07 — purger `X-Username`/`X-User-Id` (identité = SecurityContext uniquement).
7. S-09 — `DatabaseInitializer` en profil dev seulement.

### Vague 2 — « Résister à un utilisateur authentifié malveillant » (~1 sprint)
8. S-11 — `PermissionInterceptor` fail-closed + exclusions auditées.
9. S-05 — sanitiser documents + CSP stricte + (M) sortir `userRights` du localStorage.
10. S-08 — rate limit par IP réelle (proxy de confiance) + quotas sur endpoints lourds.
11. S-12/S-13 — verrouillage atomique + politique de mot de passe, suppression du fallback plaintext.
12. D-06/D-07 — transactions + batch sur imports.

### Vague 3 — « Dette technique et reproductibilité » (2-3 sprints)
13. D-01/D-02 — Flyway réellement branché, migrations corrigées, `ddl-auto=none`.
14. O-01/O-02/O-03 — Dockerfiles corrigés + CI minimale (mvn test, jest, ng lint, audit).
15. M-01 — trancher l'unique moteur de réconciliation (archiver le 2d).
16. X-01/X-04 — tests de sécurité + actuator/prometheus aligné sur `nginx.conf:115`.
17. M-03/M-04/M-05 — nettoyage jobs/fichiers, persistance des progressions, libération des verrous.
18. Q-01/Q-02 — supprimer le projet Node/Prisma mort et les deps inutilisées.
19. X-08 — plan de migration Angular LTS.
20. D-03 — index selon EXPLAIN prod.

### Vague 4 — confort (vœux pieux, ⚪)
- M-08 (renommer « prédiction »), X-06 (i18n), X-07 (retirer `/start` du parcours), O-05/O-06, Q-06/Q-07, D-05 (purge git/historique du dump).

---

## Éléments à confirmer en conditions réelles (non vérifiables ici)

| Point | Pourquoi |
|---|---|
| Trafic actuel / volume réel (`operation`, `agency_summary`) | dimensionner les index (D-03) et le pool Hikari (S-17) |
| Préciser la prod réellement utilisée : **nginx ou Apache** ? | deux configs coexistent ; la config docker est la 3e variante |
| Colonnes réellement présentes en base (update vs migrations) | reconstruire le schéma Flyway proprement |
| Les migrations `V*` ont-elles déjà été jouées à la main ? | déterminer si V4..V53 sont « appliqués » ou « jamais ». |
| Le compte `admin` existe-t-il en prod et avec quel hash ? | définir la migration de nettoyage |
| `password` des mails (SMTP) configuré réellement ? | S-04 dépend de l'opérationnalité mail |

---

## Méthode et limites

- **Lecture seule** : aucun fichier source modifié ; seuls `AUDIT/*.md` et les logs de baseline ont été écrits.
- Baselines reproduits : `mvn package` ✅, `mvn test` ✅ (32), `npm run build` ✅ (warnings), `jest --ci` ✅ (72), `ng lint` ❌ (absent).
- Certaines affirmations marquées 🔶 proviennent d'analyses de sous-agents et doivent être confirmées sur la prod en conditions réelles.
- Le dump `top20_2026-07-07_222327.sql` est **non tracké** (git) ✅ — à purger du disque malgré tout (données sensibles, D-05).
- Des corrections de code sont proposées lors d'une phase suivante **après validation de ce rapport** par l'utilisateur.