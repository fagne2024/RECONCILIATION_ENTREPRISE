-- =====================================================================
-- V16 : environnement (BET, HT, T-E, …) et pays d'une certification de solde
--
-- Renseignés à l'enregistrement (facultatifs) pour filtrer la liste des
-- certifications enregistrées. L'unicité reste compte + période.
-- =====================================================================

ALTER TABLE `certification_solde_resultat`
  ADD COLUMN `env` VARCHAR(20) NULL AFTER `date_fin`,
  ADD COLUMN `pays` VARCHAR(10) NULL AFTER `env`,
  ADD KEY `idx_certification_solde_resultat_pays_env` (`entreprise_id`, `pays`, `env`);
