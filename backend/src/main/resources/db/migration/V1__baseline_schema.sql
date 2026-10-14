-- =====================================================================
-- V1 : Baseline du schema ReconciliApp (etat reel du 2026-10-12)
-- Genere a partir du schema MySQL de production (dump structure).
--
-- Ce script represente l'etat AVANT le passage multi-entreprises.
-- Sur une base deja existante, Flyway pose un marqueur de baseline en
-- version 1 et n'execute PAS ce script ; sur une base vide, il est
-- execute integralement pour recreer le schema complet.
-- 50 tables.
-- =====================================================================

SET FOREIGN_KEY_CHECKS = 0;

-- agency_summary_entity
CREATE TABLE `agency_summary_entity` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `agency` varchar(255) DEFAULT NULL,
  `country` varchar(255) DEFAULT NULL,
  `date` varchar(255) DEFAULT NULL,
  `record_count` int NOT NULL,
  `service` varchar(255) DEFAULT NULL,
  `timestamp` varchar(255) DEFAULT NULL,
  `total_volume` double NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- agency_threshold
CREATE TABLE `agency_threshold` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `code_proprietaire` varchar(255) NOT NULL,
  `created_at` datetime(6) NOT NULL,
  `threshold_amount` double NOT NULL,
  `type_operation` varchar(255) NOT NULL,
  `updated_at` datetime(6) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `UK7i5mftcsv14tj8d8pd0qtym3i` (`code_proprietaire`,`type_operation`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- auth_ticket
CREATE TABLE `auth_ticket` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `created_at` datetime(6) NOT NULL,
  `expires_at` datetime(6) NOT NULL,
  `token` varchar(64) NOT NULL,
  `used` bit(1) NOT NULL,
  `username` varchar(100) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `UK_qlswf01rk4g1qrd48hvf9cegb` (`token`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- auto_processing_models
CREATE TABLE `auto_processing_models` (
  `auto_apply` bit(1) DEFAULT NULL,
  `created_at` datetime(6) DEFAULT NULL,
  `id` bigint NOT NULL AUTO_INCREMENT,
  `updated_at` datetime(6) DEFAULT NULL,
  `comparison_columns` text,
  `correspondence_rules` text,
  `file_pattern` varchar(255) DEFAULT NULL,
  `model_id` varchar(255) DEFAULT NULL,
  `name` varchar(255) NOT NULL,
  `reconciliation_keys` text,
  `reconciliation_logic` text,
  `template_file` varchar(255) DEFAULT NULL,
  `file_type` enum('BO','PARTNER','BOTH') DEFAULT NULL,
  `all_available_columns` text,
  `selected_columns_to_keep` text,
  `pre_processing_config` text,
  PRIMARY KEY (`id`),
  UNIQUE KEY `UK_7jsugflwu9f30k4ajqvtb6yvt` (`model_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- bo_partenaire_controle_interne
CREATE TABLE `bo_partenaire_controle_interne` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `country` varchar(64) NOT NULL,
  `created_at` datetime(6) DEFAULT NULL,
  `env` varchar(32) NOT NULL,
  `month_yyyy_mm` varchar(7) NOT NULL,
  `service` varchar(255) NOT NULL,
  `statut` varchar(32) NOT NULL,
  `updated_at` datetime(6) DEFAULT NULL,
  `validated_at` datetime(6) DEFAULT NULL,
  `validated_by` varchar(128) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_bpci_month_country_env_service` (`month_yyyy_mm`,`country`,`env`,`service`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- bo_partenaire_controle_interne_comment
CREATE TABLE `bo_partenaire_controle_interne_comment` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `commentaire` text,
  `country` varchar(64) NOT NULL,
  `env` varchar(32) NOT NULL,
  `last_emailed_at` datetime(6) DEFAULT NULL,
  `last_emailed_by` varchar(128) DEFAULT NULL,
  `month_yyyy_mm` varchar(10) NOT NULL,
  `updated_at` datetime(6) DEFAULT NULL,
  `updated_by` varchar(128) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_bpci_comment_scope` (`month_yyyy_mm`,`country`,`env`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- calculation_rule
CREATE TABLE `calculation_rule` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `actif` bit(1) NOT NULL,
  `code` varchar(150) NOT NULL,
  `date_creation` datetime(6) DEFAULT NULL,
  `date_modification` datetime(6) DEFAULT NULL,
  `description` text,
  `expression` text,
  `libelle` varchar(255) NOT NULL,
  `module` varchar(100) NOT NULL,
  `ordre` int DEFAULT NULL,
  `sous_module` varchar(120) DEFAULT NULL,
  `systeme` bit(1) NOT NULL,
  `type` varchar(20) NOT NULL,
  `unite` varchar(30) DEFAULT NULL,
  `valeur` double DEFAULT NULL,
  `valeurs` text,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_calculation_rule_code` (`code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- column_processing_rules
CREATE TABLE `column_processing_rules` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `format_type` varchar(255) DEFAULT NULL,
  `pad_zeros` bit(1) DEFAULT NULL,
  `regex_replace` varchar(255) DEFAULT NULL,
  `remove_accents` bit(1) DEFAULT NULL,
  `remove_special_chars` bit(1) DEFAULT NULL,
  `rule_order` int DEFAULT NULL,
  `source_column` varchar(255) NOT NULL,
  `special_char_replacement_map` text,
  `target_column` varchar(255) NOT NULL,
  `to_lower_case` bit(1) DEFAULT NULL,
  `to_upper_case` bit(1) DEFAULT NULL,
  `trim_spaces` bit(1) DEFAULT NULL,
  `auto_processing_model_id` bigint DEFAULT NULL,
  `column_header` varchar(255) DEFAULT NULL,
  `column_order` int DEFAULT NULL,
  `column_width` varchar(255) DEFAULT NULL,
  `display_column` bit(1) DEFAULT NULL,
  `remove_all_spaces` bit(1) DEFAULT NULL,
  `remove_dot_zero` bit(1) DEFAULT NULL,
  `string_to_remove` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `FKqmfgfqe1wvj5c2lh3bej237v6` (`auto_processing_model_id`),
  CONSTRAINT `FKqmfgfqe1wvj5c2lh3bej237v6` FOREIGN KEY (`auto_processing_model_id`) REFERENCES `auto_processing_models` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- commission_transaction
CREATE TABLE `commission_transaction` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `actif` bit(1) NOT NULL,
  `agence` varchar(255) NOT NULL,
  `date_creation` datetime(6) DEFAULT NULL,
  `date_modification` datetime(6) DEFAULT NULL,
  `description` varchar(255) DEFAULT NULL,
  `montant_commission` double NOT NULL,
  `pourcentage` double DEFAULT NULL,
  `service` varchar(255) NOT NULL,
  `type_calcul` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- compte
CREATE TABLE `compte` (
  `solde` double NOT NULL,
  `date_derniere_maj` datetime(6) NOT NULL,
  `id` bigint NOT NULL AUTO_INCREMENT,
  `agence` varchar(255) DEFAULT NULL,
  `code_proprietaire` varchar(255) DEFAULT NULL,
  `numero_compte` varchar(255) NOT NULL,
  `pays` varchar(255) NOT NULL,
  `type` varchar(255) DEFAULT NULL,
  `categorie` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `UK_hx2we7gc1i1c5ylusignv31f3` (`numero_compte`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- compte_regroupement
CREATE TABLE `compte_regroupement` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `actif` bit(1) NOT NULL,
  `date_creation` datetime(6) NOT NULL,
  `compte_original_id` bigint NOT NULL,
  `compte_regroupe_id` bigint NOT NULL,
  PRIMARY KEY (`id`),
  KEY `FKoqfdj1e8ic50yc5u0rmm1f0sh` (`compte_original_id`),
  KEY `FKq0df0p58q3x7fu846tcwihmcb` (`compte_regroupe_id`),
  CONSTRAINT `FKoqfdj1e8ic50yc5u0rmm1f0sh` FOREIGN KEY (`compte_original_id`) REFERENCES `compte` (`id`),
  CONSTRAINT `FKq0df0p58q3x7fu846tcwihmcb` FOREIGN KEY (`compte_regroupe_id`) REFERENCES `compte` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- compte_solde_bo
CREATE TABLE `compte_solde_bo` (
  `date_solde` date NOT NULL,
  `solde_bo` double NOT NULL,
  `created_at` datetime(6) DEFAULT NULL,
  `id` bigint NOT NULL AUTO_INCREMENT,
  `numero_compte` varchar(255) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `UK6pu1mr5r72fr7d13kgrvpd93i` (`numero_compte`,`date_solde`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- compte_solde_cloture
CREATE TABLE `compte_solde_cloture` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `created_at` datetime(6) DEFAULT NULL,
  `date_solde` date NOT NULL,
  `numero_compte` varchar(255) NOT NULL,
  `solde_cloture` double NOT NULL,
  `updated_at` datetime(6) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `UKteo2x9ohmafa9foexmxrqkyt4` (`numero_compte`,`date_solde`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ecart_bo_summary
CREATE TABLE `ecart_bo_summary` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `agence` varchar(255) DEFAULT NULL,
  `commentaire` text,
  `date_import` datetime(6) DEFAULT NULL,
  `date_transaction` datetime(6) NOT NULL,
  `env` varchar(20) DEFAULT NULL,
  `montant_total` double NOT NULL,
  `nombre_transactions` int NOT NULL,
  `pays` varchar(255) DEFAULT NULL,
  `service` varchar(255) DEFAULT NULL,
  `statut` varchar(255) DEFAULT NULL,
  `token` varchar(64) DEFAULT NULL,
  `env_code` varchar(32) DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ecart_solde
CREATE TABLE `ecart_solde` (
  `montant` double NOT NULL,
  `date_import` datetime(6) DEFAULT NULL,
  `date_transaction` datetime(6) NOT NULL,
  `id` bigint NOT NULL AUTO_INCREMENT,
  `agence` varchar(255) DEFAULT NULL,
  `commentaire` varchar(255) DEFAULT NULL,
  `id_transaction` varchar(255) NOT NULL,
  `numero_trans_gu` varchar(255) DEFAULT NULL,
  `pays` varchar(255) DEFAULT NULL,
  `service` varchar(255) DEFAULT NULL,
  `statut` varchar(255) DEFAULT NULL,
  `telephone_client` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- flux
CREATE TABLE `flux` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `agence` varchar(255) NOT NULL,
  `date_creation` datetime(6) DEFAULT NULL,
  `date_debut` date NOT NULL,
  `date_fin` date NOT NULL,
  `date_modification` datetime(6) DEFAULT NULL,
  `payin` double DEFAULT NULL,
  `payout` double DEFAULT NULL,
  `total_bonus` double DEFAULT NULL,
  `total_gains` double DEFAULT NULL,
  `total_mises` double DEFAULT NULL,
  `retenue_sur_gains` double DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `UKmc7y52q2gjqtqthpwk73rycix` (`agence`,`date_debut`,`date_fin`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- frais_transaction
CREATE TABLE `frais_transaction` (
  `actif` bit(1) NOT NULL,
  `montant_frais` double NOT NULL,
  `pourcentage` double DEFAULT NULL,
  `date_creation` datetime(6) DEFAULT NULL,
  `date_modification` datetime(6) DEFAULT NULL,
  `id` bigint NOT NULL AUTO_INCREMENT,
  `agence` varchar(255) NOT NULL,
  `description` varchar(255) DEFAULT NULL,
  `service` varchar(255) NOT NULL,
  `type_calcul` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- guide_document
CREATE TABLE `guide_document` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `created_at` datetime(6) NOT NULL,
  `extracted_text` longtext,
  `file_content` longblob,
  `file_name` varchar(500) DEFAULT NULL,
  `file_type` varchar(100) DEFAULT NULL,
  `node_id` varchar(255) NOT NULL,
  `option_type` varchar(50) NOT NULL,
  `updated_at` datetime(6) NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- guide_node
CREATE TABLE `guide_node` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `created_at` datetime(6) NOT NULL,
  `description` text,
  `display_order` int NOT NULL,
  `label` varchar(500) NOT NULL,
  `node_id` varchar(255) NOT NULL,
  `route` varchar(500) DEFAULT NULL,
  `updated_at` datetime(6) NOT NULL,
  `parent_id` bigint DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `UK_q97nla1g4ytcgeg09on3dh2x2` (`node_id`),
  KEY `FKbk1ffj8c9xmbdl2mgj68axt8a` (`parent_id`),
  CONSTRAINT `FKbk1ffj8c9xmbdl2mgj68axt8a` FOREIGN KEY (`parent_id`) REFERENCES `guide_node` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- impact_op
CREATE TABLE `impact_op` (
  `montant` decimal(15,3) NOT NULL,
  `solde_apres` decimal(15,3) NOT NULL,
  `solde_avant` decimal(15,3) NOT NULL,
  `created_at` datetime(6) DEFAULT NULL,
  `date_operation` datetime(6) NOT NULL,
  `id` bigint NOT NULL AUTO_INCREMENT,
  `updated_at` datetime(6) DEFAULT NULL,
  `groupe_reseau` varchar(10) NOT NULL,
  `code_proprietaire` varchar(50) NOT NULL,
  `numero_trans_gu` varchar(50) NOT NULL,
  `commentaire` text,
  `type_operation` varchar(255) NOT NULL,
  `statut` enum('EN_ATTENTE','TRAITE','ERREUR') DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- module
CREATE TABLE `module` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `nom` varchar(255) NOT NULL,
  `visible` bit(1) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `UK_7rgjhhl2xwx7bx5sfrvrlwgyg` (`nom`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- module_permission
CREATE TABLE `module_permission` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `module_id` bigint NOT NULL,
  `permission_id` bigint NOT NULL,
  PRIMARY KEY (`id`),
  KEY `FKktqxthjfer0eftk4n6aw65erg` (`module_id`),
  KEY `FKjef167fcfubau50abvfsm5wx` (`permission_id`),
  CONSTRAINT `FKjef167fcfubau50abvfsm5wx` FOREIGN KEY (`permission_id`) REFERENCES `permission` (`id`),
  CONSTRAINT `FKktqxthjfer0eftk4n6aw65erg` FOREIGN KEY (`module_id`) REFERENCES `module` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- navigation_label_audit
CREATE TABLE `navigation_label_audit` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `action_type` varchar(32) NOT NULL,
  `created_at` datetime(6) NOT NULL,
  `detail` text,
  `group_key` varchar(128) NOT NULL,
  `label_id` varchar(255) NOT NULL,
  `label_type` varchar(32) NOT NULL,
  `nested_key` varchar(128) DEFAULT NULL,
  `new_label` varchar(500) DEFAULT NULL,
  `old_label` varchar(500) DEFAULT NULL,
  `submenu_key` varchar(128) DEFAULT NULL,
  `username` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- operation
CREATE TABLE `operation` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `banque` varchar(255) DEFAULT NULL,
  `code_proprietaire` varchar(255) NOT NULL,
  `date_operation` datetime(6) NOT NULL,
  `montant` double NOT NULL,
  `nom_bordereau` varchar(255) DEFAULT NULL,
  `parent_operation_id` bigint DEFAULT NULL,
  `pays` varchar(255) NOT NULL,
  `record_count` int DEFAULT NULL,
  `reference` varchar(255) DEFAULT NULL,
  `service` varchar(255) DEFAULT NULL,
  `solde_apres` double NOT NULL,
  `solde_avant` double NOT NULL,
  `statut` varchar(255) NOT NULL,
  `type_operation` varchar(255) NOT NULL,
  `compte_id` bigint DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `FKa0ct8me4s6e469ipqb4tkdomh` (`compte_id`),
  CONSTRAINT `FKa0ct8me4s6e469ipqb4tkdomh` FOREIGN KEY (`compte_id`) REFERENCES `compte` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- operation_bancaire
CREATE TABLE `operation_bancaire` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `agence` varchar(255) NOT NULL,
  `bo` varchar(255) DEFAULT NULL,
  `code_pays` varchar(255) DEFAULT NULL,
  `compte_a_debiter` varchar(255) DEFAULT NULL,
  `date_operation` datetime(6) NOT NULL,
  `id_glpi` varchar(255) DEFAULT NULL,
  `mode_paiement` varchar(255) DEFAULT NULL,
  `mois` varchar(255) DEFAULT NULL,
  `montant` double NOT NULL,
  `nom_beneficiaire` varchar(255) DEFAULT NULL,
  `operation_id` bigint DEFAULT NULL,
  `pays` varchar(255) NOT NULL,
  `reference` varchar(255) DEFAULT NULL,
  `statut` varchar(255) NOT NULL,
  `type_operation` varchar(255) NOT NULL,
  `recon_status` varchar(255) DEFAULT NULL,
  `dedup_key` varchar(255) DEFAULT NULL,
  `batch_id` varchar(255) DEFAULT NULL,
  `source_filename` varchar(255) DEFAULT NULL,
  `uploaded_at` datetime(6) DEFAULT NULL,
  `impact_applique` bit(1) NOT NULL,
  `traitement` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `UK_2cd1bl1pnn9n9ynnlha7ryqcp` (`dedup_key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- oppart
CREATE TABLE `oppart` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `client` varchar(255) DEFAULT NULL,
  `created_at` datetime(6) DEFAULT NULL,
  `date_operation` datetime(6) DEFAULT NULL,
  `id_transaction` varchar(100) DEFAULT NULL,
  `montant` decimal(15,3) DEFAULT NULL,
  `pays` varchar(128) DEFAULT NULL,
  `source` varchar(50) DEFAULT NULL,
  `type_op` varchar(100) DEFAULT NULL,
  `updated_at` datetime(6) DEFAULT NULL,
  `statut` varchar(20) NOT NULL DEFAULT 'EN_COURS',
  `token` varchar(64) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_oppart_statut` (`statut`),
  KEY `idx_oppart_token` (`token`),
  KEY `idx_oppart_date` (`date_operation`),
  KEY `idx_oppart_idtx_norm` ((upper(trim(`id_transaction`))))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- password_reset_token
CREATE TABLE `password_reset_token` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `created_at` datetime(6) NOT NULL,
  `expires_at` datetime(6) NOT NULL,
  `token` varchar(64) NOT NULL,
  `used` bit(1) NOT NULL,
  `username` varchar(100) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `UK_g0guo4k8krgpwuagos61oc06j` (`token`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- pays
CREATE TABLE `pays` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `code` varchar(10) NOT NULL,
  `nom` varchar(100) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `UK_iievwshu2sv589awso3xwlb5f` (`code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- permission
CREATE TABLE `permission` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `nom` varchar(255) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `UK_s1inbmd8duat28me7n9rwxvwu` (`nom`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- profil
CREATE TABLE `profil` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `description` text,
  `nom` varchar(255) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `UK_oti9hwn3djjpjonm24y2uosdp` (`nom`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- profil_pays
CREATE TABLE `profil_pays` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `pays_id` bigint NOT NULL,
  `profil_id` bigint NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `UK8cwseamr41j3kl3dy0ofcul5t` (`profil_id`,`pays_id`),
  KEY `FKr8ae2r5xfvcnj79tv0jhamw8n` (`pays_id`),
  CONSTRAINT `FK346ybpgpqd3eg2079qc3ydcdl` FOREIGN KEY (`profil_id`) REFERENCES `profil` (`id`),
  CONSTRAINT `FKr8ae2r5xfvcnj79tv0jhamw8n` FOREIGN KEY (`pays_id`) REFERENCES `pays` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- profil_permission
CREATE TABLE `profil_permission` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `module_id` bigint NOT NULL,
  `permission_id` bigint NOT NULL,
  `profil_id` bigint NOT NULL,
  PRIMARY KEY (`id`),
  KEY `FKsvajq98gsia6l5vwokhyxvlic` (`module_id`),
  KEY `FK3ieu2a54ck03psktnt0fwr0sy` (`permission_id`),
  KEY `FK53eot52jy3vgi21blkmvbmjmu` (`profil_id`),
  CONSTRAINT `FK3ieu2a54ck03psktnt0fwr0sy` FOREIGN KEY (`permission_id`) REFERENCES `permission` (`id`),
  CONSTRAINT `FK53eot52jy3vgi21blkmvbmjmu` FOREIGN KEY (`profil_id`) REFERENCES `profil` (`id`),
  CONSTRAINT `FKsvajq98gsia6l5vwokhyxvlic` FOREIGN KEY (`module_id`) REFERENCES `module` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- reco_j1_blocking_comment
CREATE TABLE `reco_j1_blocking_comment` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `comment_text` text NOT NULL,
  `country` varchar(128) NOT NULL,
  `env` varchar(32) NOT NULL,
  `reco_date` varchar(10) NOT NULL,
  `service` varchar(255) NOT NULL,
  `updated_at` datetime(6) DEFAULT NULL,
  `updated_by` varchar(128) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_reco_j1_blocking_scope` (`reco_date`,`service`,`country`,`env`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- reconciliation_jobs
CREATE TABLE `reconciliation_jobs` (
  `completed_at` datetime(6) DEFAULT NULL,
  `created_at` datetime(6) NOT NULL,
  `id` bigint NOT NULL AUTO_INCREMENT,
  `updated_at` datetime(6) DEFAULT NULL,
  `bo_file_path` varchar(255) DEFAULT NULL,
  `client_id` varchar(255) DEFAULT NULL,
  `config_json` text,
  `error_message` varchar(255) DEFAULT NULL,
  `job_id` varchar(255) NOT NULL,
  `partner_file_path` varchar(255) DEFAULT NULL,
  `progress_json` text,
  `result_json` text,
  `status` enum('PENDING','PREPARING','PROCESSING','COMPLETED','FAILED','CANCELLED') NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `UK_ft509svdwicfe60l23y8xtbxu` (`job_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- reconciliation_locks
CREATE TABLE `reconciliation_locks` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `created_at` datetime(6) NOT NULL,
  `expires_at` datetime(6) NOT NULL,
  `job_id` varchar(255) DEFAULT NULL,
  `lock_key` varchar(255) NOT NULL,
  `lock_type` varchar(50) NOT NULL,
  `updated_at` datetime(6) DEFAULT NULL,
  `user_id` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `UK41y08i1sj4pxc0qdt90ra6y1d` (`lock_key`,`lock_type`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- reconciliation_ok_keys
CREATE TABLE `reconciliation_ok_keys` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `created_at` datetime(6) NOT NULL,
  `key_value` varchar(255) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `idx_recon_ok_key` (`key_value`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- reconciliation_status
CREATE TABLE `reconciliation_status` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `key_str` varchar(200) NOT NULL,
  `status` varchar(8) NOT NULL,
  `updated_at` datetime(6) NOT NULL,
  `key_value` varchar(255) NOT NULL,
  `created_at` datetime(6) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `UK_bjswqfvjt8ej5du3dpw6scgly` (`key_str`),
  UNIQUE KEY `idx_recon_status_key` (`key_value`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- redevance_agence_param
CREATE TABLE `redevance_agence_param` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `agence` varchar(255) NOT NULL,
  `date_creation` datetime(6) DEFAULT NULL,
  `date_modification` datetime(6) DEFAULT NULL,
  `retenue_sur_gains_pourcentage` double DEFAULT NULL,
  `retenue_sur_gains_seuil` double DEFAULT NULL,
  `taux_redevance_pourcentage` double DEFAULT NULL,
  `taxe_jeux_hasard_pourcentage` double DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `UK7ap81k5purh0oeubcwim7jc08` (`agence`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- releve_bancaire
CREATE TABLE `releve_bancaire` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `banque` varchar(255) DEFAULT NULL,
  `batch_id` varchar(255) DEFAULT NULL,
  `credit` double DEFAULT NULL,
  `date_comptable` date DEFAULT NULL,
  `date_valeur` date DEFAULT NULL,
  `debit` double DEFAULT NULL,
  `dedup_key` varchar(255) DEFAULT NULL,
  `depot_total` double DEFAULT NULL,
  `devise` varchar(255) DEFAULT NULL,
  `libelle` varchar(2000) DEFAULT NULL,
  `montant` double DEFAULT NULL,
  `nom_compte` varchar(255) DEFAULT NULL,
  `numero_cheque` varchar(255) DEFAULT NULL,
  `numero_compte` varchar(255) DEFAULT NULL,
  `recon_status` varchar(255) DEFAULT NULL,
  `solde_comptable_cloture` double DEFAULT NULL,
  `solde_comptable_ouverture` double DEFAULT NULL,
  `solde_courant` double DEFAULT NULL,
  `solde_disponible_cloture` double DEFAULT NULL,
  `solde_disponible_ouverture` double DEFAULT NULL,
  `source_filename` varchar(255) DEFAULT NULL,
  `total_retraits` double DEFAULT NULL,
  `uploaded_at` datetime(6) DEFAULT NULL,
  `commentaire` varchar(1000) DEFAULT NULL,
  `numero_serie` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `UK_nl2bf4e5ioxw002063ysk66nh` (`dedup_key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- releve_manual
CREATE TABLE `releve_manual` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `country` varchar(50) NOT NULL,
  `releve_date` date NOT NULL,
  `env` varchar(50) DEFAULT NULL,
  `manual_nombre` bigint DEFAULT NULL,
  `manual_volume` double DEFAULT NULL,
  `rembourse_nombre` bigint DEFAULT NULL,
  `rembourse_volume` double DEFAULT NULL,
  `service` varchar(255) NOT NULL,
  `updated_at` datetime(6) DEFAULT NULL,
  `annule_nombre` bigint DEFAULT NULL,
  `annule_volume` double DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- result8rec
CREATE TABLE `result8rec` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `agency` varchar(255) DEFAULT NULL,
  `bo_only` int NOT NULL,
  `comment` varchar(255) DEFAULT NULL,
  `country` varchar(255) DEFAULT NULL,
  `created_at` varchar(255) DEFAULT NULL,
  `date` varchar(255) DEFAULT NULL,
  `match_rate` double NOT NULL,
  `matches` int NOT NULL,
  `mismatches` int NOT NULL,
  `partner_only` int NOT NULL,
  `service` varchar(255) DEFAULT NULL,
  `status` varchar(255) DEFAULT NULL,
  `total_transactions` int NOT NULL,
  `total_volume` double NOT NULL,
  `glpi_id` varchar(255) DEFAULT NULL,
  `traitement` varchar(255) DEFAULT NULL,
  `username` varchar(255) DEFAULT NULL,
  `env` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- result8rec_audit
CREATE TABLE `result8rec_audit` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `action_type` varchar(64) NOT NULL,
  `created_at` datetime(6) NOT NULL,
  `detail` text,
  `result8rec_id` bigint NOT NULL,
  `status_snapshot` varchar(64) DEFAULT NULL,
  `traitement_snapshot` varchar(255) DEFAULT NULL,
  `username` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- service_reference
CREATE TABLE `service_reference` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `code_reco` varchar(150) NOT NULL,
  `code_service` varchar(150) NOT NULL,
  `created_at` datetime(6) NOT NULL,
  `motif` varchar(255) DEFAULT NULL,
  `operateur` varchar(100) DEFAULT NULL,
  `pays` varchar(10) NOT NULL,
  `reconciliable` bit(1) NOT NULL,
  `reseau` varchar(50) DEFAULT NULL,
  `retenu_operateur` varchar(255) DEFAULT NULL,
  `service_label` varchar(150) NOT NULL,
  `service_type` varchar(100) DEFAULT NULL,
  `updated_at` datetime(6) NOT NULL,
  `status` varchar(20) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `UK_iuso1kfs561jsrfi0fuj70ccc` (`code_reco`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- sop_document
CREATE TABLE `sop_document` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `created_at` datetime(6) NOT NULL,
  `extracted_text` longtext,
  `file_content` longblob,
  `file_name` varchar(500) DEFAULT NULL,
  `file_type` varchar(100) DEFAULT NULL,
  `node_id` varchar(255) NOT NULL,
  `option_type` varchar(50) NOT NULL,
  `updated_at` datetime(6) NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- sop_node
CREATE TABLE `sop_node` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `created_at` datetime(6) NOT NULL,
  `description` text,
  `display_order` int NOT NULL,
  `label` varchar(500) NOT NULL,
  `node_id` varchar(255) NOT NULL,
  `route` varchar(500) DEFAULT NULL,
  `updated_at` datetime(6) NOT NULL,
  `parent_id` bigint DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `UK_5naxq8cvlwfmmigejveooc0ka` (`node_id`),
  KEY `FKnlww4ukxqbpxm8h4j4my6ur46` (`parent_id`),
  CONSTRAINT `FKnlww4ukxqbpxm8h4j4my6ur46` FOREIGN KEY (`parent_id`) REFERENCES `sop_node` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- statistics
CREATE TABLE `statistics` (
  `date` date NOT NULL,
  `record_count` int NOT NULL,
  `total_volume` decimal(38,2) NOT NULL,
  `id` bigint NOT NULL AUTO_INCREMENT,
  `agency` varchar(255) NOT NULL,
  `country` varchar(255) NOT NULL,
  `service` varchar(255) NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- suivi_ecart
CREATE TABLE `suivi_ecart` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `agence` varchar(255) NOT NULL,
  `commentaire` text,
  `date` date NOT NULL,
  `glpi_id` varchar(255) DEFAULT NULL,
  `id_partenaire` varchar(255) NOT NULL,
  `montant` double NOT NULL,
  `pays` varchar(255) NOT NULL,
  `service` varchar(255) NOT NULL,
  `statut` varchar(255) NOT NULL,
  `telephone` varchar(255) DEFAULT NULL,
  `token` varchar(255) NOT NULL,
  `traitement` varchar(255) DEFAULT NULL,
  `username` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- trx_sf
CREATE TABLE `trx_sf` (
  `frais` double DEFAULT NULL,
  `montant` double NOT NULL,
  `date_import` datetime(6) DEFAULT NULL,
  `date_transaction` datetime(6) NOT NULL,
  `id` bigint NOT NULL AUTO_INCREMENT,
  `agence` varchar(255) DEFAULT NULL,
  `commentaire` varchar(255) DEFAULT NULL,
  `id_transaction` varchar(255) NOT NULL,
  `numero_trans_gu` varchar(255) DEFAULT NULL,
  `pays` varchar(255) DEFAULT NULL,
  `service` varchar(255) DEFAULT NULL,
  `statut` varchar(255) DEFAULT NULL,
  `telephone_client` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- user
CREATE TABLE `user` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `profil_id` bigint DEFAULT NULL,
  `password` varchar(255) NOT NULL,
  `username` varchar(255) NOT NULL,
  `enabled_2fa` bit(1) NOT NULL,
  `secret_2fa` varchar(32) DEFAULT NULL,
  `qr_code_scanned` bit(1) NOT NULL,
  `email` varchar(255) DEFAULT NULL,
  `password_change_required` bit(1) NOT NULL,
  `account_locked_until` datetime(6) DEFAULT NULL,
  `enabled` bit(1) NOT NULL,
  `failed_login_attempts` int NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `UK_sb8bbouer5wak8vyiiy4pf2bx` (`username`),
  KEY `FKodenud73jl3nlt4po6pqvq7i3` (`profil_id`),
  CONSTRAINT `FKodenud73jl3nlt4po6pqvq7i3` FOREIGN KEY (`profil_id`) REFERENCES `profil` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- user_log
CREATE TABLE `user_log` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `created_at` datetime(6) DEFAULT NULL,
  `date_heure` datetime(6) NOT NULL,
  `module` varchar(255) NOT NULL,
  `permission` varchar(255) NOT NULL,
  `username` varchar(255) NOT NULL,
  `details` varchar(1000) DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

SET FOREIGN_KEY_CHECKS = 1;

