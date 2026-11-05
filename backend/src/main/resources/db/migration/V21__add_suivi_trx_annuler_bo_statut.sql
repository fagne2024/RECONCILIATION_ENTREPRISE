-- =====================================================================
-- V21 : statut metier BO du suivi des transactions a annuler.
--
-- Valeurs attendues (liste fermee cote interface) : Echec | Annulee.
-- La colonne reste nullable : une ligne peut ne pas encore avoir de statut.
-- =====================================================================

ALTER TABLE `suivi_trx_annuler`
  ADD COLUMN `bo_statut` VARCHAR(32) NULL AFTER `bo_telephone`;
