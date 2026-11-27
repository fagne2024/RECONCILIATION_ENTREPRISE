-- =====================================================================
-- V38 : synchronisation SharePoint -> suivi des compenses OP (Banque).
--
-- Configuration > Synchronisation SharePoint : pour chaque entreprise, un
-- compte applicatif Microsoft Graph (Entra ID), les heures de lancement du
-- job et la liste des liens SharePoint à scanner. Pour chaque lien, le
-- dernier fichier traité et la dernière ligne chargée de chaque feuille
-- (« Compense client » / « Compense fournisseur ») servent de curseur : le
-- scan suivant reprend à la ligne suivante. L'empreinte (clé de doublon) de
-- cette dernière ligne est conservée : si elle n'est plus à la même place
-- (lignes insérées ou supprimées), la feuille est relue entièrement et le
-- contrôle de doublon écarte ce qui est déjà chargé. L'historique garde une trace de
-- chaque exécution (automatique ou manuelle).
-- =====================================================================

CREATE TABLE `sharepoint_sync_config` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `entreprise_id` BIGINT NOT NULL,
  `enabled` BIT(1) NOT NULL DEFAULT b'0',
  `heures_execution` VARCHAR(200) NOT NULL DEFAULT '08:00',
  `azure_tenant_id` VARCHAR(100) NULL,
  `client_id` VARCHAR(100) NULL,
  `client_secret_enc` VARCHAR(2000) NULL,
  `last_auto_run_at` DATETIME(6) NULL,
  `updated_at` DATETIME(6) NULL,
  `updated_by` VARCHAR(255) NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_sharepoint_sync_config_tenant` (`entreprise_id`),
  CONSTRAINT `fk_sharepoint_sync_config_entreprise` FOREIGN KEY (`entreprise_id`) REFERENCES `entreprise` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `sharepoint_sync_source` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `entreprise_id` BIGINT NOT NULL,
  `libelle` VARCHAR(150) NOT NULL,
  `url` VARCHAR(2000) NOT NULL,
  `file_pattern` VARCHAR(200) NULL,
  `sheet_client` VARCHAR(150) NULL,
  `sheet_fournisseur` VARCHAR(150) NULL,
  `enabled` BIT(1) NOT NULL DEFAULT b'1',
  `last_file_id` VARCHAR(255) NULL,
  `last_file_name` VARCHAR(500) NULL,
  `last_row_client` INT NULL,
  `last_row_fournisseur` INT NULL,
  `last_row_key_client` VARCHAR(500) NULL,
  `last_row_key_fournisseur` VARCHAR(500) NULL,
  `last_run_at` DATETIME(6) NULL,
  `last_status` VARCHAR(20) NULL,
  `last_message` VARCHAR(2000) NULL,
  `created_at` DATETIME(6) NULL,
  `updated_at` DATETIME(6) NULL,
  PRIMARY KEY (`id`),
  KEY `idx_sharepoint_sync_source_tenant` (`entreprise_id`),
  CONSTRAINT `fk_sharepoint_sync_source_entreprise` FOREIGN KEY (`entreprise_id`) REFERENCES `entreprise` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `sharepoint_sync_run` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `entreprise_id` BIGINT NOT NULL,
  `source_id` BIGINT NULL,
  `source_libelle` VARCHAR(150) NULL,
  `declencheur` VARCHAR(20) NOT NULL,
  `utilisateur` VARCHAR(255) NULL,
  `started_at` DATETIME(6) NOT NULL,
  `ended_at` DATETIME(6) NULL,
  `file_name` VARCHAR(500) NULL,
  `status` VARCHAR(20) NOT NULL,
  `lignes_lues` INT NOT NULL DEFAULT 0,
  `lignes_chargees` INT NOT NULL DEFAULT 0,
  `doublons` INT NOT NULL DEFAULT 0,
  `hors_mois` INT NOT NULL DEFAULT 0,
  `message` VARCHAR(4000) NULL,
  PRIMARY KEY (`id`),
  KEY `idx_sharepoint_sync_run_tenant_date` (`entreprise_id`, `started_at`),
  CONSTRAINT `fk_sharepoint_sync_run_entreprise` FOREIGN KEY (`entreprise_id`) REFERENCES `entreprise` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
