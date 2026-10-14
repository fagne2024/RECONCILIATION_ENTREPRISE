# 05 — Transverse : tests, observabilité, i18n, stack frontend

---

## 1. Tests

### 🔴 X1 — Couverture quasi nulle côté backend
**Confiance ✅ — Baseline `mvn test` = 32 tests OK, mais…**

- **8 fichiers** de test pour **~250 classes** de `main` (314 fichiers Java).
- Répartition (verify baseline `AUDIT/baseline-backend-test.log`) : `SpecialRatioReconciliationServiceTest` (16 tests), `PermissionGeneratorAllSubmenusTest` / `PermissionGeneratorControleInterneTest`, `CompteMapperTest`, `OperationMapperTest`, `ConfigurableReconciliationServiceRatioTest`, `FlexibleLocalDateTimeDeserializerTest`.
- **Jamais de test** sur : les 48 controllers, l'authentification/JWT, le rate limiting, `SqlController`, les imports (03-T1/T2), les entrées XSS, le cloisonnement pays.
- Certains tests sont « toujours verts » car ils vérifient un registre statique autogénéré (`PermissionGenerator*Test`) → ils garantissent l'auto-génération mais **pas le comportement**.
- `AbstractIntegrationTest` (Testcontainers MySQL `jdbc:tc:mysql:8.0`, `application-test.properties`) est **défini mais aucun test ne l'étend** → quasi-totalité des tests tournent sans base de données ; Testcontainers **ne peut pas s'exécuter ici** (pas de Docker) → toute tentative de l'activer échouera.

### 🟠 X2 — Double chaîne de tests frontend : Karma ET Jest
**Confiance ✅**

- `angular.json:120-121` : builder `@angular-devkit/build-angular:karma` + fichiers `karma.conf.js*` présents ; **et** `jest.config.js` (preset `jest-preset-angular`, `ts-jest`).
- `package.json` : scripts `test` (Karma) **et** `test:jest` + `test:jest:coverage`.
- Baseline : **`npx jest --ci` = 6 suites, 72 tests OK, 2 skipped** (les seuls tests frontend existants — 6 `*.spec.ts`).
- Inconvénients : deux façons d'exécuter, deux configs à maintenir, rapports de couverture divergents, et `ng test` (Karma) **non vérifié en baseline** (ne peut pas tourner ici sans navigateur).

### 🟡 X3 — Pas de garde-fou de régression
**Confiance ✅**

- `ng lint` : **« Cannot find "lint" target »** (baseline) → aucun contrôle de style TypeScript.
- Aucune exécution de tests dans `Start-App.ps1`, aucune CI (voir 06).
- Le passage d'auth `permitAll` → `authenticated()` (01-A1) se fera sans filet de test : chaque endpoint devenu « ouvert par erreur » redeviendra exploitable.

---

## 2. Observabilité et supervision

### 🔴 X4 — Aucune observabilité
**Confiance ✅**

- **Pas de `spring-boot-starter-actuator`, pas de Micrometer, pas de Prometheus** dans le `pom.xml`.
- Or `nginx.conf:115` proxy vers `https://localhost:8443/actuator/health` → **404 systématique** : le health-check du proxy exprime un endpoint qui n'existe pas.
- `BackendHeartbeat.java:27` (`@Scheduled 30 s`) : seul « heartbeat » — il **écrit où ?** (à vérifier si simple log) ; rien de consommable par un superviseur HTTP.
- `show-sql=true` en prod (03-D4) : la seule « télémétrie » est un flux de logs SQL non structurés.

### 🟠 X5 — Erreurs et parcours utilisateur peu instrumentés
**Confiance ✅**

- 810 `System.out.println` / 82 `printStackTrace` (cf. 04-Q4) : indices non structurés, sans corrélation session/job, pas de niveau.
- `GlobalExceptionHandler.handleGenericException` (`:206`) loggue l'erreur mais **aucun identifiant de corrélation** renvoyé au client ni dans les logs (impossible de tracer une panne depuis le rapport utilisateur).

---

## 3. i18n et parcours utilisateur

### 🟡 X6 — i18n partiel, voire cosmétique
**Confiance 🔶 (à ouvrir dans l'UI)**

- Présence de `fr.json`/`en.json` + `LanguageSwitcherComponent` (testé : boutons, `i18n.use`).
- Mais beaucoup de libellés sont renvoyés en français depuis l'API (ex. messages d'erreur `GlobalExceptionHandler`, logs) : incohérence potentielle entre libellés frontend i18n et messages backend en dur.
- Aucune spécification de langue par en-tête côté API observée (🔶).

### 🟡 X7 — UX « faux départ » détectée
**Confiance ✅**

- `POST /reconciliation/start` renvoie un `jobId` sans rien lancer (02-R1) : l'utilisateur voit un écran « démarré » qui ne progresse jamais — un cas de decept product. À corriger ou retirer du parcours.
- La progress bar dépend de `ReconciliationProgressService` en mémoire non bornée (02-R3).

---

## 4. Stack frontend — dette technologique

| Constat | Preuve | Impact |
|---|---|---|
| **Angular 14 (sept. 2022)** — fin de support dépassée, sécurité & compat non maintenues | `package.json` | CVE non corrigées, montée impossée plus tard, incompatibilités Node (baseline build sous Node 24 : warnings) |
| Bundle 6,50 MB > 6 MB | baseline build | temps de chargement, budget non respecté |
| **Stockage de `userRights` et `auth_token` en localStorage** (74 usages localStorage/sessionStorage) | `app-state.service.ts:41-51,441-563`, `reconciliation.service.ts:484,514,524,1338,1421` | XSS ⇒ vol session/élévation (01-A10) |
| **Données métier en localStorage** (chunks de réconciliation) | `reconciliation.service.ts` | vol de données au repos côté nav. + fuite de disque, cap de quota |
| `xlsx` 0.18.5 (bibliothèque d'export) | `package.json` | vulnérabilités connues à vérifier (🔶) |
| Un seul module de routing (60 routes), pas de lazy loading | `app-routing.module.ts` | bundle agravé |

---

## 5. Synthèse transverse

| # | Action | Impact |
|---|---|---|
| 1 | Rendre obligatoire un garde-fou : `ng lint` **+** `ng test:jest` + `mvn test` dans un minimum de scripts et une CI | évite les régressions (surtout auth) |
| 2 | Activer `actuator` (health, prometheus) ou corriger `nginx.conf:115` | supervision réelle |
| 3 | Corrélation logs (requestId/sessionId) dans `GlobalExceptionHandler` | traçabilité des incidents |
| 4 | Migrer les copies chunkées du navigateur vers le serveur (pagination déjà existante côté backend) | sécurité + fiabilité (la pagination `resultCache` est déjà en place ✅) |
| 5 | Plan Angular LTS → version maintenue | sécurité/capacité |