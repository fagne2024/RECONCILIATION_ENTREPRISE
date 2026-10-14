# Étape 1 — Schéma, migrations et entités multi-entreprises

> Étape **1** du passage multi-entreprises. Date : **2026-10-12**.
> Statut : **terminée et validée** (migrations V2/V3 appliquées et testées sur données réelles + base vide ; app démarrée ; 54/54 tests OK).
> Base de référence : `top20` (50 tables, baselinée en V1 par P1). Les migrations V2/V3 ont été validées **sur un clone avec données** (`top20_e1_data`) et **sur une base vide** (`reco_e1_fresh`) ; la base réelle `top20` **n'a pas été modifiée**.

---

## 1. Objectif

Établir le socle multi-entreprises :

1. Modèle : tables `entreprise` et `entreprise_module` (activation des modules **par entreprise**).
2. Rattacher **toutes** les données métier existantes à l'**entreprise historique** (V3, `entreprise_id`).
3. Contraintes d'unicité métier recentrées sur `(entreprise_id, …)` pour permettre à deux entreprises de partager des valeurs métier identiques (`code`, `nom`, `numero_compte`, …).
4. Entités JPA `Entreprise*` + repositories.
5. L'application continue de **démarrer et valider** le schéma (`ddl-auto=validate`) dans les deux scénarios (base existante et base vide).

Le point de contrôle « suspension d'entreprise » (JWT + 403) reste pour les étapes 2/3 ; ici rien n'est encore **appliqué** au runtime — c'est purement le socle de données et de code.

---

## 2. Fichiers

### Créés
| Fichier | Rôle |
|---|---|
| `backend/src/main/resources/db/migration/V2__create_entreprise.sql` | Tables `entreprise` + `entreprise_module`, entreprise historique `INTOUCH` (id=1), activation de tous les modules existants pour elle. |
| `backend/src/main/resources/db/migration/V3__add_entreprise_id.sql` | `entreprise_id` sur **45 tables métier** + index + clé étrangère + renommage de **23 clés UNIQUE** en `(entreprise_id, …)`. |
| `backend/src/main/java/com/reconciliation/entity/EntrepriseEntity.java` | Entité `entreprise`. |
| `backend/src/main/java/com/reconciliation/entity/EntrepriseModuleEntity.java` | Entité `entreprise_module`. |
| `backend/src/main/java/com/reconciliation/entity/EntrepriseStatut.java` | Enum `ACTIVE` / `SUSPENDUE` (storage forcé `VARCHAR`, voir §4). |
| `backend/src/main/java/com/reconciliation/repository/EntrepriseRepository.java` | Repo (par code/statut). |
| `backend/src/main/java/com/reconciliation/repository/EntrepriseModuleRepository.java` | Repo (par entreprise+module). |

### Modifiés
| Fichier | Changement |
|---|---|
| `backend/src/main/java/com/reconciliation/util/DatabaseMigration.java` | Contrôle idempotent **à chaque démarrage** : chaque module existant est rendu actif pour l'entreprise historique (id=1). Placeholder de la politique par défaut « tous les modules activés », rattrape les modules créés après V2 (génération des permissions). Sera remplacé par la vraie politique en étape 5. |

### Inchangés
- `V1__baseline_schema.sql` : **figé** (checksum P1). V2 et V3 s'y empilent.
- Tables globales **sans** `entreprise_id` : `module`, `permission`, `module_permission` (catalogue), `auth_ticket`, `password_reset_token` (jetons transitoires).

---

## 3. Contenu des migrations

### V2 — modèle entreprises
- `entreprise(id, code UNIQUE, nom, statut VARCHAR default 'ACTIVE', created_at, updated_at)`.
- `entreprise_module(id, entreprise_id FK→entreprise, module_id FK→module, actif BIT default 1, UNIQUE(entreprise_id, module_id))`.
- Insertion de l'entreprise historique : **code `INTOUCH`, nom `Intouch`, statut ACTIVE**. C'est le **premier enregistrement** → `id = 1` (utilisé ensuite comme valeur par défaut transitoire).
- `INSERT … SELECT e.id, m.id … CROSS JOIN module` → **tous les modules déjà présents sont activés** pour l'entreprise historique (sur la base réelle : 39/39).

### V3 — `entreprise_id` (45 tables)
Pour chaque table métier :
```sql
ALTER TABLE t ADD COLUMN entreprise_id BIGINT NOT NULL DEFAULT 1;
ALTER TABLE t ADD INDEX idx_t_entreprise (entreprise_id);
ALTER TABLE t ADD CONSTRAINT fk_t_entreprise FOREIGN KEY (entreprise_id) REFERENCES entreprise(id);
```
- `NOT NULL DEFAULT 1` : les lignes existantes sont rattachées à l'entreprise historique **sans requête de backfill séparée**, et les INSERT qui ne renseignent pas encore la colonne continuent de fonctionner. **Ce DEFAULT est transitoire** : il sera supprimé à l'étape 3 lorsque l'isolation `@TenantId` renseignera la colonne explicitement.

**23 clés UNIQUE** recentrées sur le tenant (exemples) :
| Table | Ancienne clé | Nouvelle clé |
|---|---|---|
| `profil` | UNIQUE(nom) | **UNIQUE(entreprise_id, nom)** |
| `pays` | UNIQUE(code) | **UNIQUE(entreprise_id, code)** |
| `compte` | UNIQUE(numero_compte) | **UNIQUE(entreprise_id, numero_compte)** |
| `service_reference` | UNIQUE(code_reco) | **UNIQUE(entreprise_id, code_reco)** |
| `calculation_rule` | UNIQUE(code) | **UNIQUE(entreprise_id, code)** |
| `flux` / `compte_solde_bo` / `compte_solde_cloture` / `agency_threshold` / `reconciliation_locks` | UNIQUE(multi-colonnes) | **UNIQUE(entreprise_id, …)** |
| `reconciliation_status` / `reconciliation_ok_keys` / `bo_partenaire_controle_interne[_comment]` / `auto_processing_models` / `guide_node` / `sop_node` / `releve_bancaire` / `operation_bancaire` / `reconciliation_jobs` / `reco_j1_blocking_comment` / `redevance_agence_param` | UNIQUE(id) | **UNIQUE(entreprise_id, …)** |

**Conservées globales** (inchangées) :
- `user` : `UNIQUE(username)` reste **global** (décision 2 : username/email globalement uniques, login `{username, password}` inchangé).
- `profil_pays` : `UNIQUE(profil_id, pays_id)` reste tel quel — déjà scopé via `profil_id` (qui devient par entreprise).

---

## 4. Esprit non intrusif — décisions prises en exécution (à valider)

| Point | Décision prise | Justification |
|---|---|---|
| Nom de l'entreprise historique | `code=INTOUCH`, `nom=Intouch` | Société réelle (domaine `intouchgroup.net`, trame `INTOUCH CASHIN CASHOUT`). Simple étiquette, modifiable depuis l'écran plateforme (étape 5). |
| Rattachement de `user_log` et `navigation_label_audit` | **Par entreprise** (`entreprise_id` ajouté) | Journaux d'audit visibles écran par écran : sans scope tenant, un admin d'entreprise verrait les journaux des autres. |
| Rattachement de `auth_ticket`, `password_reset_token` | **Global** (pas de `entreprise_id`) | Jetons transitoires keyés sur username (globalement unique) : aucun sens métier par entreprise. |
| Type de `statut` sur `entreprise` | `VARCHAR(32)` (via `@JdbcTypeCode(SqlTypes.VARCHAR)`) | Hibernate 6 mappe les `@Enumerated(STRING)` en type **enum MySQL natif** par défaut, ce qui casse `validate` face au VARCHAR de V2. |
| DEFAULT transitoire `1` sur `entreprise_id` | Conservé pour l'instant | Nécessaire pour que les INSERT du code existant (qui ne renseigne pas encore la colonne) continuent de passer entre l'étape 1 et l'étape 3. Suppression prévue à l'étape 3. |

---

## 5. Validation réellement exécutée

Environnement : `mvn -DskipTests package` (JAR `csv-reconciliation-1.0.0.jar`), démarrage sur **deux bases MySQL** avec `--server.port=8081` et la même URL JDBC que prod (`…?allowMultiQueries=true…`).

### 5.1 Base existante avec données — clone complet de `top20` (`top20_e1_data`, 16 Mo de dump)
- `flyway_schema_history` : `1 (baseline)` → `2 create entreprise` → `3 add entreprise id`, tous **success**.
- `entreprise` : `(1, INTOUCH, Intouch, ACTIVE)`.
- `entreprise_module` : **39 lignes actives = 39 modules** (l'entreprise historique conserve tout son catalogue).
- Backfill : `profil` → 100 % des lignes `entreprise_id=1` ; `operation` → **0 ligne** `entreprise_id <> 1`.
- `profil.entreprise_id` : `bigint`, `NOT NULL`, `DEFAULT 1` ; clés `uk_profil_tenant`, `idx_profil_entreprise`, `fk_profil_entreprise` présentes.
- Démarrage : **`Started CsvReconciliationApplication in 52.7 s`** — `ddl-auto=validate` OK. Initialiseurs pays : « déjà existants » (no-op).

### 5.2 Base vide (`reco_e1_fresh`)
- Flyway : `1` → `2` → `3` appliquées **from scratch**, toutes **success**.
- 53 tables (50 métier + `flyway_schema_history` + `entreprise` + `entreprise_module`).
- **45 + 1** tables avec colonne `entreprise_id` (45 métier + `entreprise_module`) ; les 45 métier ont le DEFAULT `1`.
- Pays seedés par `PaysInitializer` : **10/10 rattachés à l'entreprise 1** (les INSERT JPA sans `entreprise_id` passent grâce au DEFAULT).
- `DatabaseMigration` a créé 15 modules manquants puis **activé 15/15** pour l'entreprise historique.
- Démarrage : **`Started` OK**, validate OK.

### 5.3 Suite de tests
`mvn test` → **54/54, BUILD SUCCESS** (aucune régression).

---

## 6. Points d'attention / non couverts par cette étape

1. **Enforcement 403 modules + statut entreprise** : étape 2/3 (le `PermissionInterceptor` est toujours fail-open, le contrôle statut par requête n'est pas encore actif).
2. **Isolation `@TenantId`** : étape 3. Jusque-là, les entités ne mappent **pas** encore `entreprise_id`, et le DEFAULT 1 assure la continuité des INSERT.
3. **Politique des modules** : placeholder (tout activé pour l'entreprise historique). Le catalogue + activation administrée arrive en étape 5.
4. `EntrepriseEntity`/`EntrepriseModuleEntity` créés mais **aucun endpoint** : l'API SUPER_ADMIN est l'étape 4/5, hors périmètre v1 (aucun accès SUPER_ADMIN aux données métier en v1).

---

## 7. Revert (si nécessaire)

Les deux migrations sont additives et réversibles manuellement :
- `DROP TABLE entreprise_module; DROP TABLE entreprise;` puis supprimer colonnes/index/FK `entreprise_id` et restaurer les 23 clés UNIQUE d'origine (noms listés en §3) — sur les bases **non re-migrées** de préférence (V2/V3 restent enregistrées dans `flyway_schema_history`, un revert doctrine demande `flyway repair`).
- Recommandé : repartir d'un dump de `top20` (base réelle intacte).