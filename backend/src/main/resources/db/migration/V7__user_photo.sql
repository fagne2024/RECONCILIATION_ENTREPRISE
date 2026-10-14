-- =====================================================================
-- V7 : photo de profil utilisateur
--
-- Colonne GLOBALE sur `user` (aucune isolation @TenantId) : chaque compte —
-- entreprise comme SUPER_ADMIN — peut avoir sa propre photo de profil.
--
-- Stockee en data URL (LONGTEXT), meme approche que le logo d'entreprise
-- (V6, `entreprise_branding.logo_data`) : la valeur est renvoyee telle quelle
-- au navigateur, sans endpoint binaire ni en-tete d'authentification sur
-- <img> (qui ne peut pas porter le JWT). Le champ est expose uniquement via
-- `/api/users/me/photo` (jamais dans les reponses de masse).
-- =====================================================================

ALTER TABLE `user` ADD COLUMN `photo` LONGTEXT NULL;
