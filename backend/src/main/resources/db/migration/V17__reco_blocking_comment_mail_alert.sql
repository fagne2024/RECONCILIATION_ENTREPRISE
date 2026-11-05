-- =====================================================================
-- V17 : relance e-mail quotidienne d'un commentaire de blocage
--       (page « État des réconciliations »)
--
-- Une relance est rattachée au même périmètre que le commentaire
-- (reco_j1_blocking_comment) : date, service, pays, environnement.
-- Elle mémorise le statut de la réconciliation au moment de l'activation
-- (status_snapshot) : l'e-mail est renvoyé chaque jour tant que ce statut
-- ne change pas, puis la relance se désactive d'elle-même.
-- =====================================================================

CREATE TABLE `reco_blocking_comment_mail_alert` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `entreprise_id` BIGINT NOT NULL,
  `reco_date` VARCHAR(10) NOT NULL,
  `service` VARCHAR(255) NOT NULL,
  `country` VARCHAR(128) NOT NULL,
  `env` VARCHAR(32) NOT NULL,
  `recipients` VARCHAR(2000) NOT NULL,
  `status_snapshot` VARCHAR(32) NOT NULL,
  `active` BIT(1) NOT NULL,
  `send_count` INT NOT NULL DEFAULT 0,
  `last_sent_at` DATETIME(6) NULL,
  `last_error` VARCHAR(500) NULL,
  `stopped_reason` VARCHAR(32) NULL,
  `stopped_at` DATETIME(6) NULL,
  `created_by` VARCHAR(128) NULL,
  `updated_by` VARCHAR(128) NULL,
  `created_at` DATETIME(6) NULL,
  `updated_at` DATETIME(6) NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_reco_blocking_mail_alert_tenant` (`entreprise_id`, `reco_date`, `service`, `country`, `env`),
  KEY `idx_reco_blocking_mail_alert_active` (`active`, `entreprise_id`),
  CONSTRAINT `fk_reco_blocking_mail_alert_entreprise` FOREIGN KEY (`entreprise_id`) REFERENCES `entreprise` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
