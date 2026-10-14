-- =====================================================================
-- V10 : libelles personnalisables du « Top des utilisateurs »
--
-- Ajoute les libelles FACULTATIFS saisis depuis Configuration > Top
-- utilisateurs. Chaque categorie possede :
--   - <categorie>_label        : titre de la categorie (colonne du bloc)
--   - <categorie>_action_label : libelle d'action affiche sous chaque nom
--
-- NULL / vide => le frontend reprend les traductions par defaut.
-- =====================================================================

ALTER TABLE `top_users_config`
  ADD COLUMN `agents_label` VARCHAR(120) NULL,
  ADD COLUMN `agents_action_label` VARCHAR(120) NULL,
  ADD COLUMN `responsables_label` VARCHAR(120) NULL,
  ADD COLUMN `responsables_action_label` VARCHAR(120) NULL,
  ADD COLUMN `validateurs_label` VARCHAR(120) NULL,
  ADD COLUMN `validateurs_action_label` VARCHAR(120) NULL;
