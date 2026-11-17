-- =====================================================================
-- V35 : suppression du contrôle de doublon sur les imports bancaires.
--
-- Les opérations bancaires et les lignes de relevé sont désormais toutes
-- chargées, même si elles existent déjà ; les doublons sont supprimés
-- manuellement. Les contraintes d'unicité (entreprise_id, dedup_key) posées
-- en V3 sont donc remplacées par de simples index (recherche conservée).
-- =====================================================================

ALTER TABLE `operation_bancaire`
  DROP INDEX `uk_operation_bancaire_tenant`,
  ADD INDEX `idx_operation_bancaire_dedup` (`entreprise_id`, `dedup_key`);

ALTER TABLE `releve_bancaire`
  DROP INDEX `uk_releve_bancaire_tenant`,
  ADD INDEX `idx_releve_bancaire_dedup` (`entreprise_id`, `dedup_key`);
