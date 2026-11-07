# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Projet

ReconciliApp : application multi-entreprise (multi-tenant) de réconciliation financière (fichiers BO vs partenaires, relevés et opérations bancaires, suivi de compense, contrôle interne). Le code, les commentaires, les messages de commit et la documentation sont en **français** : conserver cette convention. Développé et déployé sous **Windows** (scripts PowerShell, `C:/Certs`, pas de Docker, pas de `mvnw`, Maven global).

- `backend/` — Spring Boot 3.2.3, Java 17, Maven, MySQL 8, Flyway, JWT (jjwt) + 2FA TOTP, Apache POI, MapStruct, Lombok.
- `frontend/` — Angular 14 + Angular Material, ngx-translate (`fr` = langue de référence, `en`), Chart.js, ExcelJS/xlsx/papaparse, un web worker pour les règles de colonnes.
- `AUDIT/` — rapports d'audit et plans d'implémentation. `AUDIT/2026-10-16/RAPPORT.md` est l'audit **en vigueur** ; `AUDIT/00`–`06` à la racine sont obsolètes (avant réactivation de l'auth) ; `07`–`19` sont des plans d'implémentation (Vague 1, baseline Flyway, étapes multi-tenant, règles de calcul).
- `docs/` — design system, tokens de contraste, environnement de test, guides utilisateur.
- `deploy/` — jar construit + frontend et scripts PowerShell de déploiement.

## Commandes

### Backend (`backend/`)
```powershell
.\start-dev.ps1                 # profil dev, port 8085, base Reconciliation_app ; crée/charge backend/.env.dev (DEV_JWT_SECRET)
.\start-dev.ps1 -Profile prod   # exige JWT_SECRET et DB_PASSWORD
.\start-test.ps1                # profil test, port 8086, base Reconciliation_app_TEST (refuse de cibler Reconciliation_app)
mvn -B -DskipTests package      # produit target/csv-reconciliation-1.0.0.jar
mvn -B test                     # tous les tests (certains exigent un MySQL local / Testcontainers)
mvn -B test -Dtest=OperationDedupKeyTest            # une seule classe
mvn -B test -Dtest=OperationDedupKeyTest#nomMethode # une seule méthode
```
Lancer sans profil Spring échoue (`jwt.secret=${JWT_SECRET}` n'a pas de valeur par défaut) : toujours passer par les scripts ou définir le profil.

La CI (`.github/workflows/ci.yml`) exécute `mvn -B test` en excluant les tests qui nécessitent MySQL : `TenantIsolationPilotTest, EnterpriseModuleManagementTest, PlatformAccountServiceTest, PlatformEntrepriseProvisioningTest, PermissionGeneratorControleInterneTest, PermissionGeneratorAllSubmenusTest`. Utiliser la même liste d'exclusion en local sans MySQL. `AbstractIntegrationTest` utilise Testcontainers MySQL 8.0.

### Frontend (`frontend/`)
```powershell
npm run start-http      # ng serve sur 4200, proxy /api -> http://localhost:8085 (proxy.conf.json)
npm start               # HTTPS avec les certificats de C:/Certs/reconciliation, host 0.0.0.0
npm run start:test      # port 4201, proxy vers le backend de test 8086 (proxy.test.conf.json)
npm run build
npx tsc -p tsconfig.app.json --noEmit   # vérification de types rapide
npm run test:jest                        # Jest (jest-preset-angular), fichiers *.spec.ts
npx jest chemin/vers/fichier.spec.ts     # un seul fichier de test
```
`environment.ts` résout `apiUrl` à l'exécution : `/api` relatif sur localhost/4200 (passe par le proxy), sinon même hôte ; `window.__API_URL__` permet de forcer la valeur.

### Déploiement
`.\deploy\deploy-update.ps1 [-BuildFrontend]` construit le jar (sans tests), le copie dans `deploy/` et, en option, construit/synchronise le frontend.

## Architecture

### Chaîne de traitement des requêtes (backend)
`JwtAuthenticationFilter` valide le JWT (cookie / header) et alimente `TenantContext` à partir du claim vérifié `entrepriseId` → `RateLimitingFilter` → `SecurityConfig` (JWT exigé sur `/api/**`, quelques `@PreAuthorize`) → intercepteurs de `WebConfig` : `UserLoggingInterceptor`, puis `PermissionInterceptor`.

`PermissionInterceptor` + `PermissionCheckService` décident de l'accès en associant le chemin API à un **module** (`mapApiPathToModule`) et la méthode HTTP à une action, vérifiés contre les droits du profil de l'utilisateur (`profil` → `droits` sur module/permission). Les sous-menus ayant leurs propres droits sont déclarés dans `config/NavigationSubmenuRegistry.java`, qui **doit rester aligné avec** `frontend/src/app/constants/app-navigation-catalog.ts`. `@RequiresModule("<module.nom>")` sur un controller/une méthode exige en plus que le module soit activé pour l'entreprise (`entreprise_module`) → 403 sinon. L'objectif est le fail-closed : un nouvel endpoint dont le chemin n'est associé à aucun module sera refusé — ajouter le mapping / l'entrée de sous-menu lors de l'ajout d'un controller. Rôles : USER, ADMIN (entreprise), SUPER_ADMIN (plateforme ; `SuperAdminInitializer`, controllers/tests platform).

### Multi-entreprise
Multi-tenancy Hibernate par discriminant : les entités concernées portent `@org.hibernate.annotations.TenantId` sur une colonne `entreprise_id` ; `TenantIdentifierResolver` lit `TenantContext` (ThreadLocal). Sans tenant, il renvoie `TenantContext.NO_TENANT` (-1) : les lectures sont vides et les écritures échouent. Tout code exécuté hors requête HTTP (tâches planifiées, async, démarrage) doit être encapsulé dans `TenantContext.runAs/callAs(entrepriseId, ...)`. Les entités de catalogue global (ex. `ModuleEntity`) n'ont pas de tenant : leurs modifications doivent être réservées au SUPER_ADMIN.

### Base de données / Flyway
`ddl-auto=validate` partout : toute modification d'entité exige une migration Flyway dans `backend/src/main/resources/db/migration/` (`V<n>__description.sql`, numéro suivant le plus élevé existant). `V1__baseline_schema.sql` est la baseline de production — **ne jamais modifier V1 ni une migration déjà appliquée** (la validation des checksums bloquerait le démarrage ; `baseline-on-migrate=true` pour les bases existantes). `db/legacy-migrations/` est un historique en quarantaine, non scanné. Les fichiers `.sql` à la racine de `resources/` ne sont pas exécutés par Flyway.

### Frontend
`AppModule` unique (non standalone, Angular 14) avec le routage dans `app-routing.module.ts` ; guards `auth`, `admin`, `super-admin`, `module-access` ; `auth.interceptor.ts` ajoute l'authentification et les headers de permission. Les écrans métier sont dans `components/<fonctionnalité>/`, un service HTTP par domaine backend dans `services/` (ex. `operation-bancaire.service.ts` ↔ `OperationBancaireController`). Le parsing lourd des fichiers et la préparation de la réconciliation se font côté client (`traitement/`, worker de règles de colonnes, services data-normalization/processing) avant l'envoi. Les textes d'interface passent par ngx-translate (`assets/i18n`, `fr` est la langue de référence). Les tokens et composants suivent `docs/design-system.md`.

### Zones métier principales
- Réconciliation : `ReconciliationController`, `ConfigurableReconciliationService`, règles de calcul (`CalculationRuleService`, règles de priorité dans `AUDIT/19-regles-calcul-priorite.md`).
- Banque : services/controllers `OperationBancaire*` et `ReleveBancaire*` avec leurs services d'import ; logique de clé de dédoublonnage (`V26__banque_dedup_key.sql`, `OperationDedupKeyTest`) et check/validation (`V27`).
- Suivi compense OP, TRX SF, contrôle interne BO partenaire, documents SOP/guides.

## Notes spécifiques au dépôt
- Un skill projet `.claude/skills/code-review` existe (revue Spring Boot + Angular, en français).
- Les problèmes de sécurité/métier connus et ouverts sont suivis dans `AUDIT/2026-10-16/RAPPORT.md` (identifiants SEC-01, MET-08, etc.) — citer ces identifiants dans les corrections et les commits.
- Les réglages d'upload volumineux (multipart 200 Mo, Tomcat 3 Go, timeouts longs) et les timeouts du proxy sont volontaires, pour les gros fichiers de réconciliation.
