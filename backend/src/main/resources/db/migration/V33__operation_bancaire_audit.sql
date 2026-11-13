-- Historique des actions par opération bancaire (statut, clôture, traitement, commentaire, banque corrigée…)
-- et dernière action (utilisateur + date) directement sur la ligne, comme pour le rapport de réconciliation.
CREATE TABLE `operation_bancaire_audit` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `entreprise_id` bigint NOT NULL,
  `operation_id` bigint NOT NULL,
  `action_type` varchar(64) NOT NULL,
  `username` varchar(255) DEFAULT NULL,
  `statut_snapshot` varchar(64) DEFAULT NULL,
  `traitement_snapshot` varchar(255) DEFAULT NULL,
  `detail` text,
  `created_at` datetime(6) NOT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_op_bancaire_audit_operation` (`operation_id`),
  KEY `idx_op_bancaire_audit_entreprise` (`entreprise_id`),
  CONSTRAINT `fk_op_bancaire_audit_entreprise` FOREIGN KEY (`entreprise_id`) REFERENCES `entreprise` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

ALTER TABLE `operation_bancaire`
  ADD COLUMN `last_action_user` varchar(255) NULL,
  ADD COLUMN `last_action_at` datetime(6) NULL;
