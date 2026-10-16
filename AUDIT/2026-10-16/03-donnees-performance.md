# 03 — Données et performance (2026-10-16)

## 1. Schéma et Flyway

**État actuel (plus l’octobre D-01 « Flyway non branché »)** :

- `spring.jpa.hibernate.ddl-auto=validate` **dev et prod** (`application.properties:24`, `application-prod.properties:13`).
- Flyway activé, `locations=classpath:db/migration`, `baseline-on-migrate=true`, `baseline-version=1` (`application.properties:32-37`).
- 12 scripts `V1`–`V12` (plus de V9999 / VXX / doublons V4 dans ce dossier).

**Risques restants** :

| ID | Constat | Preuve |
|---|---|---|
| DAT-01 | `baseline-on-migrate=true` sur une **prod déjà peuplée** : V1 non rejoué, checksums. Si l’historique manuel diverge, `validate-on-migrate` **bloque le démarrage**. | `application.properties:34-37` |
| DAT-02 | `ReconciliationOkEntity` `unique=true` sur `key_value` **seul** vs isolation tenant | `ReconciliationOkEntity.java:8-9,23` |
| DAT-03 | 44/56 entités `@TenantId`. `UserEntity` volontairement hors filtre (login global). Auth tickets / reset tokens : hors tenant (OK). | comptage |
| DAT-04 | `show-sql=true` + `format_sql=true` en **prod** | `application-prod.properties:14-15` |
| DAT-05 | `allowMultiQueries=true`, `useSSL=false`, `createDatabaseIfNotExist=true` | `application.properties:17` ; prod `:6` |
| DAT-06 | `DB_USERNAME` défaut `root` ; mot de passe vide **hors prod** | `application.properties:18-19` |

Index : certaines entités ont maintenant `@Index` / unique tenant (`ProfilEntity`, `ReconciliationOkEntity`). Pas d’EXPLAIN prod — **Hypothèse** scans encore possibles sur `operation(date, pays, agence)`.

**`DatabaseMigration.java:8-16`** : `CommandLineRunner` hors Flyway, `ALTER TABLE` au démarrage (colonnes relevé, etc.). À fusionner en `V13+` ou supprimer. Scripts `db/legacy-migrations/` (doublons V4/V23, `V9999` PostgreSQL) **hors** `classpath:db/migration` — ne pas les réactiver.

## 2. JPA

- `@TenantId` + listener `@PostLoad` : `findById` d’un autre tenant → `TenantAccessException` **si** `TenantContext` est set. Si contexte **null**, le listener **ne refuse pas** (`TenantGuardEntityListener.java:23-30`).
- Native SQL (`TrxSfRepository`, `Platform*`) : souvent `entreprise_id = :tenantId` paramétré ✅. `DatabaseMigration.java` et `Result8RecController` interrogent `INFORMATION_SCHEMA` (INFORMATION_SCHEMA global — pas de fuite de lignes métier directe).
- `OperationImportService` : pas de `@Transactional` ; N+1 `findByNumeroCompte` / doublons par ligne (pattern d’octobre, inchangé).
- `PredictionService` charge une plage entière.
- Pagination résultats réconciliation : existante côté serveur (point positif de 2026-10-08, toujours vrai — confiance Moyenne sans relecture complète de `/results`).
- Hikari : pas de surcharge explicite → défauts Boot. Timeouts Tomcat 30 min (`application-prod.properties:62`) = connexions HTTP longues.

## 3. Uploads / fichiers

- 3 Go, `location=/tmp` (Linux) alors que le run est souvent **Windows** — Hypothèse : `/tmp` inexistant ou autre volume.
- File watcher : copie dans dossier entreprise, garde-fou traversal ✅, type = extension.
- POI 5.2.3 (`pom.xml:66-76`) : XSSF chargeur complet. Pas de limite de lignes applicative uniforme.
- Exports Excel/CSV : injection de formules (`=`, `+`, `@`) **non vérifiée** dans cet audit (Hypothèse à confirmer).

## 4. Cache

Caffeine `autoProcessingModels` max 100 / 10 min (`application.properties`). Clé non inspectée pour fuite cross-tenant — **Hypothèse à confirmer** (si la clé ignore `entrepriseId`, fuite inter-entreprises).
