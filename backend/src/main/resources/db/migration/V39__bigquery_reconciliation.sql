-- =====================================================================
-- V39 : source BigQuery pour la réconciliation (Lanceur).
--
-- Configuration > BigQuery : compte de service Google (clé JSON chiffrée),
-- projet, heures de préparation automatique et requêtes. Chaque requête
-- produit une extraction (fichier CSV côté serveur, données de la veille
-- par défaut via le paramètre @date) utilisée comme fichier BO dans le
-- Lanceur ; les fichiers partenaires sont pris dans un sous-dossier du
-- dossier surveillé de l'entreprise.
-- =====================================================================

CREATE TABLE `bigquery_config` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `entreprise_id` BIGINT NOT NULL,
  `enabled` BIT(1) NOT NULL DEFAULT b'0',
  `heures_execution` VARCHAR(200) NOT NULL DEFAULT '06:00',
  `project_id` VARCHAR(200) NULL,
  `location` VARCHAR(100) NULL,
  `service_account_email` VARCHAR(320) NULL,
  `service_account_enc` TEXT NULL,
  `partner_subfolder` VARCHAR(100) NOT NULL DEFAULT 'partenaires',
  `max_rows` INT NOT NULL DEFAULT 1000000,
  `last_auto_run_at` DATETIME(6) NULL,
  `updated_at` DATETIME(6) NULL,
  `updated_by` VARCHAR(255) NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_bigquery_config_tenant` (`entreprise_id`),
  CONSTRAINT `fk_bigquery_config_entreprise` FOREIGN KEY (`entreprise_id`) REFERENCES `entreprise` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `bigquery_query` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `entreprise_id` BIGINT NOT NULL,
  `libelle` VARCHAR(150) NOT NULL,
  `sql_text` TEXT NOT NULL,
  `bo_file_prefix` VARCHAR(100) NOT NULL,
  `enabled` BIT(1) NOT NULL DEFAULT b'1',
  `created_at` DATETIME(6) NULL,
  `updated_at` DATETIME(6) NULL,
  PRIMARY KEY (`id`),
  KEY `idx_bigquery_query_tenant` (`entreprise_id`),
  CONSTRAINT `fk_bigquery_query_entreprise` FOREIGN KEY (`entreprise_id`) REFERENCES `entreprise` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `bigquery_extract` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `entreprise_id` BIGINT NOT NULL,
  `query_id` BIGINT NULL,
  `query_libelle` VARCHAR(150) NULL,
  `date_param` DATE NULL,
  `declencheur` VARCHAR(20) NOT NULL,
  `utilisateur` VARCHAR(255) NULL,
  `started_at` DATETIME(6) NOT NULL,
  `ended_at` DATETIME(6) NULL,
  `status` VARCHAR(20) NOT NULL,
  `row_count` BIGINT NOT NULL DEFAULT 0,
  `file_name` VARCHAR(255) NULL,
  `file_bytes` BIGINT NULL,
  `message` VARCHAR(4000) NULL,
  PRIMARY KEY (`id`),
  KEY `idx_bigquery_extract_tenant_date` (`entreprise_id`, `started_at`),
  CONSTRAINT `fk_bigquery_extract_entreprise` FOREIGN KEY (`entreprise_id`) REFERENCES `entreprise` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
