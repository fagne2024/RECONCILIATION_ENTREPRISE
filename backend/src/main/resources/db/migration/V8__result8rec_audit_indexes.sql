-- =====================================================================
-- V8 : index pour l'agrégation des actions d'audit result8rec
--
-- L'endpoint `GET /api/result8rec/audit-actions-summary` (Top 3 des
-- utilisateurs de l'État des réconciliations) filtre par période sur
-- `created_at` puis rejoint la ligne rapport par `result8rec_id`.
-- On ajoute donc les index correspondants pour éviter un scan complet
-- de la table sur les périodes longues.
-- =====================================================================

ALTER TABLE `result8rec_audit` ADD INDEX `idx_result8rec_audit_created_at` (`created_at`);
ALTER TABLE `result8rec_audit` ADD INDEX `idx_result8rec_audit_result8rec` (`result8rec_id`);
