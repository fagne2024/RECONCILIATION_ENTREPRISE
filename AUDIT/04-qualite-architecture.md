# 04 — Qualité et architecture du code

---

## 1. Points positifs à conserver
- **Handler d'exception global bien conçu** : `exception/GlobalExceptionHandler.java` mappe les cas attendus (désérialisation JSON `:34`, validation `:58`, contraintes `:82`, sécurité `:139`, doublons SQL `:152`, clients déconnectés `:180` sans stack-trace, générique sans fuite de message `:193-219`). À étendre plutôt qu'à jeter.
- `SecureRandom` utilisé pour les mots de passe générés (`UserController.java:406`).
- Batch Hibernate correctement réglé (`application.properties:88-91`), même si non exploité sans `@Transactional` (03-T1).
- `WebConfig` centralise d'assignations globale des intercepteurs.

## 2. Artefacts morts / résiduels

### 🟠 Q1 — Un projet Node/TypeScript/Prisma est enterré dans le backend Java
**Confiance ✅ — Aujourd'hui (bagage mort)**

- `backend/src/` contient un **backend Node complet orphelin** : `server.ts`, `app.ts`, `controllers/*.ts`, `models/*.ts`, `routes/*.ts`, `services/*.ts` (ex. `agency-summary`, `file-watcher`).
- `backend/prisma/` : `schema.prisma` + dossier `migrations/` + **`dev.db` (base SQLite, potentiellement coquée au dépôt)**.
- **Aucun `package.json`** dans `backend/` → ce code n'est même pas buildable tel quel ; il s'agit d'un ancien prototype.
- Risque réel : quelqu'un lit `backend/src/server.ts`, croit au démarrage du bon serveur, et fork la logique.

### 🟠 Q2 — Dépendances Maven inutilisées
**Confiance ✅ (0 usage dans le code) — Aujourd'hui**

| Dépendance | Usages `import` | Recommandation |
|---|---|---|
| `commons-csv` 1.10.0 | 0 | Supprimer |
| `h2` (runtime) | 0 (ni main ni test) | Supprimer |
| `spring-boot-starter-webflux` | 0 (0 `WebClient`/reactive) — commentaire « DESACTIVE » dans `pom.xml:194` | **Supprimer** — outre l'utilité, faire coexister WebFlux et WebMVC ouvre des ambiguïtés d'auto-configuration |
| `spring-boot-devtools` | n/a | Restreindre en scope `runtime`/profil dev (sinon actif hors jar repackage) |

> 🔶 Le sous-agent avait signalé des doublons (`jakarta.persistence-api`, `assertj-core`, `jackson-datatype-jsr310`). **Vérification faite : chaque `<artifactId>` apparaît une seule fois** – ne pas retirer ces doublons « fantômes ». Les 3 occurrences de `lombok` correspondent à 1 déclaration + 2 blocs de plugin (normal sous Maven).

## 3. Dettes structurelles

### 🟠 Q3 — Classes « god classes » dans les services
**Confiance ✅**

- `OperationService.java` (114,6 KB), `CsvReconciliationService.java` (93,6 KB, 1571 lignes), `SupplyPredictionService.java` (84,9 KB), `OPPARTService.java` (48,1 KB), `PredictionService.java` (44,8 KB), `ImpactOPService.java` (44,8 KB), `StatisticsService.java` (43,6 KB) :
  - mélange parse de fichiers, règles métier, persistance, agrégats, logs ; difficile à tester unitairement.
  - `CsvReconciliationService` porte **deux algorithmes complets** (standard + SPECIAL_RATIO) en un seul fichier.
- Concepteur logiciel estimé : ~10-15 responsables pour 314 fichiers main, leur taille rend l'injection alternative (chaîne de réconciliation B, cf. 02) invisible.

### 🟠 Q4 — Logique dans les controllers + `System.out` au lieu de logger
**Confiance ✅**

- Controllers volumineux : `ReconciliationController` (1950 lignes), `SqlController` (exécution SQL « pour corriger »), `FileWatcherController` (pilote un watcher), `TestController` (endpoint `/api/test/ping` en prod).
- **810 `System.out.println`** et **82 `printStackTrace()`** dans `src/main/java` (ex. une ligne de log par ligne d'import : `OperationImportService.java:75,89,96,121,128,131`).
- Effets : aucun contrôle de niveau, aucune rotation de niveau par environnement, fuites d'infos (01-B6), contention sur la sortie standard pendant les imports.

### 🟡 Q5 — Duplication des politiques en dur dans les controllers
**Confiance ✅**

- **37 `@CrossOrigin`** cachemis dans les controllers (liste divergente de `GlobalCorsConfig`) ; **0 annotation d'autorisation de méthode** malgré `@EnableMethodSecurity` (01-A1/B5).
- Identité lue dans 3 cadres différents selon le controller : `SecurityContext` (`RequestContextUtil`), header `X-Username` (`RequestContextUtil.java:35`), header `X-User-Id` (`ReconciliationController.java:1936-1945`), IP dérivée de `X-Forwarded-For` — **aucune politique unique d'identité**.

### 🟡 Q6 — Nommage et langue mélangés, pas de style partagé
**Confiance ✅**

- Identifiants français/anglais entremêlés (`FraisTransactionController`, `ChangePassword`, `/api/sql/execute`), commentaire de code-mixte, pas de convention `checkstyle`/`formatter` en place (aucun plugin dans `pom.xml`), aucun `lint` frontend (baseline `ng lint` : **« Cannot find lint target »**).

## 4. Considérations transverses

### 🟡 Q7 — Pas de wrapper de build ni de versionnage de l'outillage
**Confiance ✅**

- Pas de `mvnw`, Maven 3.9.9 implicite, Node 24 vs Angular 14 (MLE 05). Pas de `.editorconfig`/`.prettierrc`.
- Le langage de déploiement (PowerShell `Start-App.ps1` à la racine, chemins SSL `C:/Certs`, `C:/nginx`) est **windows-path dépendant** : aucune portabilité Linux.

### 🟡 Q8 — Sémantique « prédiction » trompeuse + reco métier en dur
**Confiance ✅**

- `PredictionService` = heuristiques (02-R7). Les endpoints de "prédiction de supplies" (`SupplyPredictionController`) reposent sur des moyennes par catégorie (`SupplyPredictionService.java:41`) — à documenter comme estimations, pas prédictions.

## 5. Priorisation qualité

| # | Action |
|---|---|
| 1 | Supprimer `backend/src/*.ts` + `backend/prisma` (valider en métier qu'ils sont inutiles) |
| 2 | Retirer `commons-csv`, `h2`, `webflux` du `pom.xml` |
| 3 | Éclater `CsvReconciliationService` (parse / règles / rapport) et `OperationService` |
| 4 | Migrer les 810 `System.out.println` vers un logger (niveaux debug/info, sans données sensibles) |
| 5 | Unifier l'identité (SecurityContext uniquement) et la config CORS unique |
| 6 | Ajouter formateur + lint + wrapper maven |