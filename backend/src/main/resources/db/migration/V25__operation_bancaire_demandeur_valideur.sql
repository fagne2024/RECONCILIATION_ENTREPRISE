-- =====================================================================
-- V25 : demandeur et valideur des operations bancaires.
--
-- Colonnes presentes dans le tableau Operations et le modele d'import,
-- mais jamais enregistrees jusqu'ici.
-- =====================================================================

ALTER TABLE `operation_bancaire`
  ADD COLUMN `demandeur` VARCHAR(255) NULL AFTER `banque_corrigee`,
  ADD COLUMN `valideur` VARCHAR(255) NULL AFTER `demandeur`;
