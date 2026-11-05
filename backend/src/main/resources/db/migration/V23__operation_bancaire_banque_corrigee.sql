-- =====================================================================
-- V23 : banque corrigee sur les operations bancaires.
--
-- Colonne saisie/importee depuis le tableau Operations (Banque corrigee).
-- Elle etait auparavant affichee uniquement sur le releve bancaire, sans
-- persistance ; elle n'est plus proposee sur le releve.
-- =====================================================================

ALTER TABLE `operation_bancaire`
  ADD COLUMN `banque_corrigee` VARCHAR(255) NULL AFTER `bo`;
