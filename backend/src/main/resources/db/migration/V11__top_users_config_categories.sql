-- =====================================================================
-- V11 : categories dynamiques du « Top des utilisateurs »
--
-- Le bloc est desormais pilote par une LISTE libre et ordonnee de
-- categories, stockee serialisee en JSON. Chaque categorie porte : son
-- identifiant, ses libelles, les evenements d'audit et les niveaux de
-- traitement qui la composent, et sa visibilite.
--
-- NULL / JSON vide => le backend repond les 3 categories par defaut
-- (Agents / Responsables / Validateurs).
--
-- Les colonnes V9/V10 (show_agents, agents_label, ...) deviennent inutiles
-- mais restent en place : aucune perte de donnees, migration non destructive.
-- =====================================================================

ALTER TABLE `top_users_config`
  ADD COLUMN `categories_json` TEXT NULL;
