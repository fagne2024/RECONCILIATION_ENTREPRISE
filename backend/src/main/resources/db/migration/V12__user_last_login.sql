-- =====================================================================
-- V12 : dernière connexion utilisateur
--
-- Colonne GLOBALE sur `user` (aucune isolation @TenantId, comme `photo`) :
-- horodatage de la dernière authentification RÉUSSIE. Mis à jour par
-- AuthController à l'issue du login (mot de passe) ou de la validation 2FA.
-- NULL => le compte ne s'est jamais connecté.
--
-- `datetime(6)` : même précision que les autres colonnes LocalDateTime
-- mappées par Hibernate (ddl-auto=validate).
-- =====================================================================

ALTER TABLE `user` ADD COLUMN `last_login` DATETIME(6) NULL;
