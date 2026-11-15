-- =====================================================================
-- V34 : libelles de navigation personnalises, persistes par entreprise
--
-- Avant : les renommages de la page Configuration > Renommer (onglet
-- Navigation) etaient gardes en memoire par ConfigurationController et
-- perdus a chaque redemarrage du backend.
--
--   - navigation_labels_json    : liste des libelles personnalises (JSON)
--   - navigation_masquage_json  : modules et sous-menus masques dans le menu
--     lateral pour cette entreprise (JSON : modulesMasques, sousMenusMasques)
-- =====================================================================

ALTER TABLE `entreprise_branding`
  ADD COLUMN `navigation_labels_json` LONGTEXT NULL,
  ADD COLUMN `navigation_masquage_json` TEXT NULL;
