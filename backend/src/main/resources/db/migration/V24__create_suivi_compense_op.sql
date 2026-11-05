-- =====================================================================
-- V24 : suivi des compenses OP (section Banque > Suivi compense OP).
--
-- Colonnes : date, code agence, banque, compte bancaire, montant, mode de
-- paiement, reference, ID ticket, service, reseau. Lignes importees depuis
-- un fichier Excel/CSV (modele telechargeable depuis la section).
-- =====================================================================

CREATE TABLE `suivi_compense_op` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `entreprise_id` BIGINT NOT NULL,
  `date_operation` DATE NULL,
  `code_agence` VARCHAR(255) NULL,
  `banque` VARCHAR(255) NULL,
  `compte_bancaire` VARCHAR(255) NULL,
  `montant` DOUBLE NULL,
  `mode_paiement` VARCHAR(255) NULL,
  `reference` VARCHAR(255) NULL,
  `id_ticket` VARCHAR(255) NULL,
  `service` VARCHAR(255) NULL,
  `reseau` VARCHAR(255) NULL,
  `source_filename` VARCHAR(255) NULL,
  `uploaded_at` DATETIME(6) NULL,
  PRIMARY KEY (`id`),
  KEY `idx_suivi_compense_op_tenant` (`entreprise_id`),
  CONSTRAINT `fk_suivi_compense_op_entreprise` FOREIGN KEY (`entreprise_id`) REFERENCES `entreprise` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
