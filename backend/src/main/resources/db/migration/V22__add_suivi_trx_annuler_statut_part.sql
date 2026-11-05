-- =====================================================================
-- V22 : statut partenaire du suivi des transactions a annuler.
--
-- Valeurs attendues (liste fermee cote interface) : Succes | Annulee.
-- La colonne reste nullable : une ligne peut ne pas encore avoir de statut.
-- Le statut de traitement (colonne `statut`, OK / En cours) reste deduit de
-- la presence de l'ID Annulation et n'est pas modifie par cette migration.
-- =====================================================================

ALTER TABLE `suivi_trx_annuler`
  ADD COLUMN `statut_part` VARCHAR(32) NULL AFTER `statut`;
