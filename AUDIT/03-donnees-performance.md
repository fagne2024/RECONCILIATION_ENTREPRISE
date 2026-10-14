# 03 — Données, migrations et performance

> ✅ **Mise à jour (Vague 1)** : aucun changement de schéma ni de migration dans cette vague.
> `ddl-auto=update` (D1) et le non-branchement Flyway (D2) restent **ouverts** (Vague 3).
> Les nouvelles tables `auth_ticket` et `password_reset_token` sont créées via `ddl-auto`
> (entités `@Entity`), en cohérence avec la stratégie actuelle.

---

## 1. La gestion de schéma est déroutante et fragile

### 🔴 D1 — `ddl-auto=update` en production avec 66 migrations Flyway **non branchées**
**Confiance ✅ — Aujourd'hui**

- `application.properties:23` **et** `application-prod.properties:12` : `spring.jpa.hibernate.ddl-auto=update`.
- **Aucune intégration Flyway** : ni dépendance `flyway-core` dans `pom.xml`, ni `spring.flyway.*`, ni un seul import `flyway` dans le code, ni `@FlywayMigration`. Les 66 fichiers de `db/migration/` ne sont **jamais appliqués automatiquement** → la base de prod est pilotée uniquement par l'« update » de Hibernate.
- **Conséquences** :
  - `update` **crée des colonnes mais ne renomme/supprime jamais** → colonnes orphelines après renommage en entité, risque de divergence entité ↔ base.
  - En cas d'ajout de contrainte unique ou d'index (voir D3), `update` ne fait rien → **aucun moyen fiable de faire évoluer le schéma**.
  - Les migrations du dossier sont soit appliquées à la main (non versionné), soit **n'ont jamais été jouées** → on ne peut pas savoir l'état réel d'une prod.

### 🔴 D2 — Les migrations existantes sont invalides ou conflictuelles
**Confiance ✅ — Aujourd'hui (bloquant toute future activation)**

| Fichier | Problème | Conséquence si Flyway activé |
|---|---|---|
| `V9999__add_impact_applique_to_operation_bancaire.sql` | Syntaxe **PostgreSQL** (`ADD COLUMN IF NOT EXISTS`, `COMMENT ON COLUMN`) sur base MySQL | Échec d'exécution |
| `VXX__add_type_to_compte.sql` | Version « XX » non numérique | Échec au parsing |
| `add_numero_serie_to_releve_bancaire.sql` | **Pas de préfixe** `V`/`R` | Ignoré ou erreur selon config |
| `V4` (2 fichiers), `V5`, `V6`, `V20` (3), `V23`, `V47`, `V53` (2) | **Doublons de numéros de version** | Échec « found more than one migration with version » sur base vierge |
| `V10__insert_test_users.sql`, `V54__reactivate_all_users.sql` | Migrations de **données de test / reactivation de masse** dans le jeu de migrations | Contenu indésirable, voire dangereux, en prod |

### 🟠 D3 — Aucun index déclaré côté code
**Confiance ✅ (indicatif) — Aujourd'hui**

- 0 `@Index`, 0 `@UniqueConstraint`, 0 `@Table(indexes=...)` dans les 46 entités.
- Hibernate `update` ne crée **jamais** d'index secondaire sans annotation → le seul endroit où ils pourraient exister = migrations Flyway (non branchées, D1/D2).
- Requêtes lourdes fréquentes sur `date`, `service`, `agency`, `country` (ex. `AgencySummaryRepository.java:27-72`) : sans index, **scan complet** de tables à fort volume (`operation`, `agency_summary`, …). À vérifier sur une prod réelle (EXPLAIN) — 🔶.

### 🟡 D4 — `show-sql=true` + `format_sql=true` en production
**Confiance ✅ — Aujourd'hui**

- `application-prod.properties:13-14` : chaque requête SQL × batch 2000 est loggé formaté → **volume de logs démesuré** (un import massif = des millions de lignes de log), perte de perf et remplissage de disque.
- `application.properties:24-25` : idem en dev.

### 🟡 D5 — Dump de base de données dans le dépôt
**Confiance ✅**

- `top20_2026-07-07_222327.sql` (66,4 Mo, 44 tables) + `.zip` (8 Mo) à la racine du dépôt. Données potentiellement sensibles versées à git ; hors de propos dans un dépôt applicatif. (À purger de l'historique git si elles ont été commitées.)

---

## 2. Mauvaise étanchéité des transactions et N+1 sur les imports

### 🔴 T1 — Imports massifs sans `@Transactional`
**Confiance ✅ — Aujourd'hui**

- `OperationImportService` (rows), `OperationBancaireImportService`, `OPPARTService`, `CsvReconciliationService` : **aucune méthode `@Transactional`** (seul `TrxSfService:333,338,343` en a).
- Impact :
  - chaque `save`/`createOperation` = **son propre commit** → surcoût de transactions massif pendant un import ;
  - **non-atomicité** : un échec à la ligne N laisse les lignes 1..N-1 écrites en base (intégrité métier incertaine).

### 🟠 T2 — Boucle de lecture à requêtes en cascade (N+1) et log par ligne
**Confiance ✅ — Aujourd'hui**

- `OperationImportService.java:53-133` : par ligne Excel — `findByNumeroCompte` (`:83`), vérification de doublons (`isDuplicate` → `findByCompteIdAndTypeOperationAndMontantAndServiceAndDateOperation`, `:304`) puis `operationService.createOperation` (`:126`) qui enchaîne ses propres requêtes.
- `System.out.println("DEBUG: Traitement ligne " + r)` **à chaque ligne** (`:75,89,96,121,128,131` …) : log flood + hidden cost.
- **Correction recommandée** : `@Transactional` sur le lot, pré-charger les comptes en une requête dans un `Map<numero, id>`, group-commit (batch déjà configuré : `batch_size=2000`, `application.properties:88-91`), et passer les journaux en `debug` avec un vrai logger.

---

## 3. Lutte pour la mémoire sur les gros volumes

> Déjà détaillé en 02-R2/R3/R5/R7. Résumé : résultats complets sérialisés dans `resultJson` et re-désérialisés en bloc à chaque appel (`ReconciliationController.java:770,686-700`) ; progression et cache de pagination en `ConcurrentHashMap` non bornées (`ReconciliationProgressService.java:10`, `ReconciliationJobService.java:38-44` avec TTL 30 min / max 20 toutefois ✅) ; réconciliation bloquante dans le thread HTTP avec pool ≤ 2 threads (`CsvReconciliationService.java:63-65`) ; `PredictionService` charge toute la période en mémoire (`PredictionService.java:122`).

---

## 4. Détails de connexion et multi-queries

| Constat | Preuve | Impact |
|---|---|---|
| `allowMultiQueries=true` sur le datasource | `application.properties:17`, `application-prod.properties:6` | amplifie le SQL arbitraire (01-A2) ; hors recommandation d'une application parameterisée |
| `useSSL=false` + `allowPublicKeyRetrieval=true` | idem | trafic DB non chiffré |
| `createDatabaseIfNotExist=true` | idem | création replanaire si les droits le permettent |
| Pool Hikari non configuré (défauts) | pas de `spring.datasource.hikari.*` | connecteurs non-bornés par défaut (défaut Hikari maximumPoolSize=10) 🔶 ; moyennement maîtrisé |
| `batch_size=2000` + `order_inserts/updates` | `application.properties:88-91`, prod `:61-64` | ✅ bien réglé — mais inutile tant que T1 n'est pas corrigé (sans `@Transactional`, les batch ne servent à rien) |

---

## 5. Verdict et priorités

| # | Action | Effet | Risque |
|---|---|---:|---:|
| 1 | Remplacer `ddl-auto=update` par Flyway **réellement branché** (`spring.flyway.*`) avec validation | reproductibilité, index, contraintes | 🔴 D1/D2 |
| 2 | Corriger/neutraliser les migrations invalides et les doublons, retirer les migrations de « test/reauth » | fondation saine | 🔴 D2 |
| 3 | Déclarer les index dans les entités ou migrations (date/service/agency/pays, FKs) | temps de requête | 🔴 D3 |
| 4 | `@Transactional` + batch sur les imports | atomicité + perf | 🔴 T1,🟠T2 |
| 5 | `show-sql=false` en prod | logs + perf | 🟡 D4 |
| 6 | Supprimer le dump du dépôt (et de l'historique) | hygiène sécurité | 🟡 D5 |