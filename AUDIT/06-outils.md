# 06 — Outils, build et environnement

---

## 1. Environnement de travail utilisé pour l'audit

| Outil | Version | Compatible projet ? |
|---|---|---|
| Java | 17.0.10 | ✅ (exigé : `pom.xml:21`) |
| Maven | 3.9.9 (global, **pas de `mvnw`**) | ✅ |
| Node | v24.11.0 | ❌ Angular 14 non supporté (baseline : warnings build) |
| npm | 11.11.0 | ⚠️ |
| Docker | **absent** | ❌ Testcontainers inutilisable |

## 2. Builds de référence (baselines)

| Étape | Résultat | Remarque |
|---|---|---|
| `mvn -B -DskipTests package` | ✅ BUILD SUCCESS (25,9 s) | — |
| `mvn -B test` | ✅ 32 tests / 0 erreur | voir 05-X1 |
| `npm run build` | ✅ (413 s) | __warnings__ : budget bundle 6,50 MB > 6 MB ; `css-syntax-error` |
| `npx jest --ci` | ✅ 72/74 (2 skipped), 6 suites | les seuls tests frontend |
| `npx ng lint` | ❌ **« Cannot find lint target »** | **aucun lint configuré** |

## 3. Défauts d'outillage

| # | Constat | Preuve | Impact |
|---|---|---|---|
| **O1** 🔴 | **Le `backend/Dockerfile` est cassé** : image de build `maven:3.9-eclipse-temurin-11` alors que `pom.xml` exige Java 17 (`source/target 17`, `:225-226`) | `backend/Dockerfile` lignes 2/10 | `docker build` échoue (« invalid target release: 17 ») dès la compilation |
| **O2** 🔴 | **Le `frontend/Dockerfile` est incohérent avec la config nginx** : il copie `nginx.conf` racine (chemins **Windows** `C:/nginx/ssl/...`, `proxy_pass https://localhost:8443/`) dans un conteneur `nginx:alpine` exposant 80 | `frontend/Dockerfile` ; `nginx.conf:21-22,79` | le proxy ne démarre pas dans le conteneur ; conflit de ports écrit `EXPOSE 80` vs proxy 8443 |
| **O3** 🟠 | **Pas de CI** : aucun pipeline GitHub/GitLab/Jenkins trouvé, pas de script de build dans `Start-App.ps1` (lance `mvn spring-boot:run` brut + `npm start`) | arborescence | aucune validation automatique ni publication versionnée |
| **O4** 🟠 | **Pas de `mvnw`**, pas de contrainte de versions Node porteuse | `backend/` | builds non reproductibles d'une machine à l'autre |
| **O5** 🟠 | **Aucune analyse de vulnérabilités de dépendances** (pas de plugin OWASP, pas d'`npm audit` dans le workflow) | `pom.xml`, `package.json` | CVE (xlsx 0.18.5, Angular 14 EOL, Node) invisibles |
| **O6** 🟡 | **Deux chaînes de test frontend** (Karma + Jest) maintenues en parallèle | `angular.json:120-121`, `jest.config.js`, `package.json` | duplication de config et de concepts |
| **O7** 🟡 | `.gitignore` **vide** (rien dedans) ; seuls des ajouts sélectifs protègent le dépôt | `.gitignore`, `git ls-files` (850 fichiers) | risque de committer cibler dumps/jars |
| **O8** 🟡 | Migrations **Prisma et SQL brutes commitées** (ex. `backend/prisma/migrations/*/migration.sql`, `resources/sql/*.sql`, `resources/add_oppart_duplicate_indexes.sql`) en plus de `db/migration/` : 3 systèmes de schéma référencés dans le repo | `git ls-files` | confusion sur le « vrai » schéma (cf. 03-D1) |

## 4. Points positifs à pérenniser
- **Logging file** déjà en place et sain : `logback-spring.xml` (rotation 50 Mo / 14 jours, `logs/errors.log` WARN+, console INFO seuil) — à brancher dans `RAPPORT` comme base pour X4/X5.
- Les **Dockerfiles** indiquent que la conteneurisation de l'API a été pensée (JVM mémoire 4-8 Go, GC+G1, heap dump) : il suffit d'**aligner la version Java** (O1) et de donner une config nginx conteneurisée distincte (O2).
- Repo git propre : artefacts de build (`target/`, `node_modules/`), dump SQL et certificats **non trackés** ✅ (à maintenir via un `.gitignore` réel, O7).

## 5. Recommandations outillage (ordre)
1. Corriger les Dockerfiles (Java 17 ; nginx.conf par conteneur) — ou documenter que le run natif est la cible et supprimer les Dockerfiles trompeurs.
2. Introduire une CI minimale (`mvn test` + `jest` + `ng lint` configuré + `docker build`).
3. Ajouter `mvnw` et imposer Node ≥ 18 au package.json (`engines`).
4. Compléter `.gitignore` (node_modules, target, uploads, logs, dist).
5. Décider d'un Unique système de migrations (Flyway), et supprimer les migrations Prisma/SQL orphelines du dépôt.
6. Intégrer un scan de dépendances (OWASP dependency-check / `npm audit --audit-level=high`) dans la CI.