# Migrations historiques (archivées)

Ces 66 fichiers `V*.sql` étaient présents dans `db/migration/` mais **n'ont jamais été
exécutés** par l'application : Flyway n'était pas configuré et le schéma était géré par
Hibernate (`spring.jpa.hibernate.ddl-auto=update`).

Ils présentaient de plus des versions **invalides ou dupliquées** (`V4`, `V5`, `V6`,
`V20` x3, `V23` x2, `V47` x2, `V53` x2, `V9999__*`, `VXX__*`) et un script en syntaxe
PostgreSQL (`V3__create_user_table.sql` : `SERIAL`, `ON CONFLICT`) sur une base MySQL.

Ils ont été déplacés ici pour ne plus être scannés par Flyway. La source de vérité est
désormais :

- `db/migration/V1__baseline_schema.sql` — schéma réel figé (état du 2026-10-12).

Voir `AUDIT/08-phase0-multitenant.md` / le plan multi-entreprises pour le détail.
