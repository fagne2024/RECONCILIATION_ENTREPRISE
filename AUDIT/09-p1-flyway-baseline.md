# P1 — Baseline Flyway (Préalable migrations)

> Étape **P1** du passage multi-entreprises. Date : **2026-10-12**.
> Statut : **terminé et validé** — corrections des anomalies latentes incluses.
> Schéma de référence : `top20` (MySQL 8.0.27, 50 tables), extrayé en lecture seule le 2026-10-12.

---

## 1. Objectif

Rendre le schéma **reproductible et versionné** avant toute modification multi-entreprises.
Jusqu'ici : Flyway absent, `spring.jpa.hibernate.ddl-auto=update` en dev **et** en prod,
66 fichiers `db/migration/V*.sql` jamais exécutés (versions dupliquées/invalides, `V3` en
syntaxe PostgreSQL).

---

## 2. Fichiers

### Modifiés
| Fichier | Changement |
|---|---|
| `backend/pom.xml` | Ajout de `org.flywaydb:flyway-core` et `org.flywaydb:flyway-mysql` (versions gérées par le parent Spring Boot 3.2.3 → Flyway **9.22.3**). |
| `backend/src/main/resources/application.properties` | `ddl-auto` : `update` → **`validate`** ; ajout du bloc `spring.flyway.*`. |
| `backend/src/main/resources/application-prod.properties` | idem (dev + prod). |
| `backend/src/main/java/com/reconciliation/entity/UserEntity.java` | Mapping de `password_change_required` (corrige une création d'utilisateur cassée). |
| `backend/src/main/java/com/reconciliation/util/DatabaseMigration.java` | `INSERT INTO module (nom, visible)` (colonne `visible` NOT NULL). |

### Créés
| Fichier | Rôle |
|---|---|
| `backend/src/main/resources/db/migration/V1__baseline_schema.sql` | **Baseline** : schéma réel complet (50 tables), généré depuis le dump de production. |
| `backend/src/main/resources/db/legacy-migrations/` | 66 anciens `V*.sql` **mis en quarantaine** (hors du chemin scanné par Flyway) + `README.md` expliquant pourquoi. |

### Inchangé
- `backend/src/test/resources/application-test.properties` : `spring.flyway.enabled=false` et `ddl-auto=create-drop` déjà présents (tests Testcontainers non impactés).

---

## 3. Configuration Flyway

```properties
spring.jpa.hibernate.ddl-auto=validate

spring.flyway.enabled=true
spring.flyway.locations=classpath:db/migration
spring.flyway.baseline-on-migrate=true
spring.flyway.baseline-version=1
spring.flyway.baseline-description=Baseline schema ReconciliApp 2026-10-12
spring.flyway.validate-on-migrate=true
```

**Mécanisme du double chemin :**

- **Base existante** (sans table `flyway_schema_history`) → Flyway pose un **marqueur de
  baseline en version 1** et **n'exécute pas** `V1`. Les migrations `V2+` s'appliquent ensuite.
  → La production est adoptée sans être modifiée.
- **Base vide** → Flyway **exécute `V1`** et recrée l'intégralité du schéma (50 tables), puis
  applique `V2+`.

`ddl-auto=validate` garantit qu'Hibernate ne modifie plus le schéma : celui-ci est
désormais piloté par Flyway.

---

## 4. Validation réellement exécutée

Environnement : `mvn -DskipTests package` (build OK), puis démarrage du jar sur **deux bases
MySQL de test** (créées puis supprimées), avec `dev` + `JWT_SECRET` de test.

### 4.1 Chemin « base existante » (clone de la structure de `top20`)
```
Flyway Community Edition 9.22.3 by Redgate
Database: jdbc:mysql://localhost:3306/reco_p1_existing (MySQL 8.0)
Successfully validated 1 migration
Creating Schema History table `reco_p1_existing`.`flyway_schema_history` with baseline ...
Successfully baselined schema with version: 1
Current version of schema `reco_p1_existing`: 1
Schema `reco_p1_existing` is up to date. No migration necessary.
```
→ `flyway_schema_history` : `version=1, type=BASELINE, success=1`. **V1 non exécutée.** Hibernate `validate` **OK**.

### 4.2 Chemin « base vide »
```
Current version of schema `reco_p1_empty`: << Empty Schema >>
Migrating schema `reco_p1_empty` to version "1 - baseline schema"
Successfully applied 1 migration to schema `reco_p1_empty`, now at version v1
```
→ `flyway_schema_history` : `version=1, type=SQL, success=1`. **50 tables** créées + table
d'historique = 51. Hibernate `validate` **OK**.

> Dans les deux cas, Hibernate a démarré (`validate` passé) puis les `CommandLineRunner` se
> sont exécutés — voir §6.

---

## 5. Points de vigilance / notes

- **Versions résolues** : `flyway-core` + `flyway-mysql` **9.22.3** (bringées par Spring Boot).
  `flyway-mysql` est nécessaire pour le support MySQL à partir de Flyway 9.
- **`ddl-auto=validate`** : validé sur une copie **exacte** de la structure de production →
  aucun écart entité/schéma détecté. Si une dérive existait en prod, le démarrage le
  signalerait explicitement (c'est le but).
- **Données de référence** : `V1` ne contient que la **structure**. Modules/permissions/pays
  sont (re)créés par les initialiseurs Java existants (`DatabaseMigration`, `PaysInitializer`).
  Pour une base neuve, ces initialiseurs sont incomplets (voir §6).
- **Migrations suivantes** : la série multi-entreprises commencera à **`V2`** (ne jamais
  réutiliser/modifier `V1`, dont le checksum est désormais figé).

---

## 6. Anomalies latentes découvertes puis **corrigées**

Exposées en démarrant sur une base **vide** (une base déjà peuplée ne les déclenchait pas) :

1. **`UserEntity` ne mappait pas la colonne `password_change_required`** (existante en base,
   `NOT NULL`, sans défaut). Conséquence réelle : **toute création/modification d'utilisateur
   via JPA échouait** (`Field 'password_change_required' doesn't have a default value`), pas
   seulement l'initialiseur dev.
   → **Correction** : champ `passwordChangeRequired` mappé dans `UserEntity`
   (`@Column(name = "password_change_required", nullable = false)`, défaut `false`, accesseurs
   normalisant `null`), dans le style des champs voisins (`enabled`, `failedLoginAttempts`).
2. **`DatabaseMigration` insérait des `module` sans `visible`** (`NOT NULL`).
   → **Correction** : `INSERT INTO module (nom, visible) VALUES (..., 1)` (module « Configuration »
   et modules du catalogue de navigation).

### Re-validation après correction
| Chemin | Résultat |
|---|---|
| Base vide | Flyway exécute V1 (50 tables) ; **`Started CsvReconciliationApplication in 39 s`** ; admin créé (`password_change_required = 0`) ; 15 modules et 10 pays initialisés. |
| Base existante | `Successfully baselined schema with version: 1` ; **`Started CsvReconciliationApplication in 23 s`** ; Hibernate `validate` OK. |

### Tests backend
`mvn test` → **`Tests run: 54, Failures: 0, Errors: 0, Skipped: 0` — BUILD SUCCESS** (identique à
la baseline d'avant l'étape).

---

## 7. Prochaine étape (en attente de votre validation)

**Étape 1 — Schéma, migrations, entités** (voir `AUDIT/08-phase0-multitenant.md`) :
entités `Entreprise`/`EntrepriseModule`, ajout de `entreprise_id` (nullable → backfill →
`NOT NULL`) sur les tables métier, création de l'entreprise historique, contraintes d'unicité.
Aucune modification ne sera faite avant votre feu vert sur P1.
