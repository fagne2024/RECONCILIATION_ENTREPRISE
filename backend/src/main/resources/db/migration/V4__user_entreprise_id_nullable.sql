-- =====================================================================
-- V4 : Autoriser `user.entreprise_id = NULL` (etape 2)
--
-- Le SUPER_ADMIN est un compte PLATEFORME : decision 9 -> aucun acces aux
-- donnees metier, entreprise_id = NULL. La colonne avait ete posee
-- NOT NULL DEFAULT 1 en V3 (rattachement des donnees existantes) ; elle
-- devient nullable tout en conservant le DEFAULT 1 pour que les INSERT qui
-- ne renseignent pas la colonne (comptes entreprise) restent rattaches a
-- l'entreprise historique tant que l'isolation @TenantId n'est pas en place
-- (etape 3).
-- =====================================================================

ALTER TABLE `user` MODIFY COLUMN `entreprise_id` BIGINT NULL DEFAULT 1;
