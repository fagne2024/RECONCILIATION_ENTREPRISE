-- =====================================================================
-- V19 : suivi des transactions a annuler (module Resultats)
--
-- Chaque ligne provient de la page /matches (bouton "Suivi TRX a annuler")
-- ou d'une saisie d'ID Annulation. Les montants sont conserves en texte
-- (montants issus des fichiers BO/Partenaire, formats heterogenes) afin de
-- restituer la valeur affichee sans perte.
-- =====================================================================

CREATE TABLE `suivi_trx_annuler` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `entreprise_id` BIGINT NOT NULL,
  `match_key` VARCHAR(512) NULL,
  `bo_date` VARCHAR(64) NULL,
  `bo_agence` VARCHAR(255) NULL,
  `bo_service` VARCHAR(255) NULL,
  `bo_montant` VARCHAR(128) NULL,
  `bo_token` VARCHAR(255) NULL,
  `bo_pays` VARCHAR(128) NULL,
  `bo_env` VARCHAR(64) NULL,
  `bo_telephone` VARCHAR(64) NULL,
  `partner_transaction_id` VARCHAR(255) NULL,
  `partner_date` VARCHAR(64) NULL,
  `partner_montant` VARCHAR(128) NULL,
  `id_annulation` VARCHAR(255) NULL,
  `partner_telephone` VARCHAR(64) NULL,
  `statut` VARCHAR(32) NOT NULL,
  `created_by` VARCHAR(128) NULL,
  `updated_by` VARCHAR(128) NULL,
  `created_at` DATETIME(6) NULL,
  `updated_at` DATETIME(6) NULL,
  PRIMARY KEY (`id`),
  KEY `idx_suivi_trx_annuler_tenant` (`entreprise_id`),
  KEY `idx_suivi_trx_annuler_match_key` (`entreprise_id`, `match_key`),
  CONSTRAINT `fk_suivi_trx_annuler_entreprise` FOREIGN KEY (`entreprise_id`) REFERENCES `entreprise` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
