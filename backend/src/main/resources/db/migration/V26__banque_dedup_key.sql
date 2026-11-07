-- =====================================================================
-- V26 : clé de déduplication des imports bancaires (suivi compense OP).
--
-- operation_bancaire possède déjà la colonne dedup_key (V1, avec contrainte
-- d'unicité) : elle n'est donc pas ajoutée ici.
--
-- Une clé (SHA-256 des valeurs métier normalisées) est calculée à chaque
-- import pour refuser les lignes déjà présentes. Index non unique : les
-- doublons déjà en base ne bloquent pas la migration.
-- =====================================================================

ALTER TABLE `suivi_compense_op`
  ADD COLUMN `dedup_key` VARCHAR(64) NULL,
  ADD INDEX `idx_suivi_compense_op_dedup` (`dedup_key`);
