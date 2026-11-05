-- =====================================================================
-- V20 : dates complémentaires des lignes OPPART
--
-- date_operation      : date d'opération BO (colonne « Date opération BO »)
-- date_operation_part : date d'opération côté partenaire
-- date_demande        : date de la demande / initiation
--
-- Les deux nouvelles colonnes sont nullables : les lignes existantes ne
-- disposent pas de cette information et restent affichées avec « - ».
-- =====================================================================

ALTER TABLE `oppart`
  ADD COLUMN `date_operation_part` DATETIME(6) NULL AFTER `date_operation`,
  ADD COLUMN `date_demande` DATETIME(6) NULL AFTER `date_operation_part`;
