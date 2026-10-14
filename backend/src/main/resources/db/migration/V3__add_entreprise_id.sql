-- =====================================================================
-- V3 : Ajout de `entreprise_id` (etape 1)
--
-- 45 tables metier recoivent `entreprise_id` :
--   - NOT NULL, DEFAULT 1  -> les lignes existantes sont rattachees a
--     l'entreprise historique (id 1) SANS requete de backfill separee ;
--   - le DEFAULT transitoire permet aux INSERT qui ne renseignent pas
--     encore la colonne de continuer a fonctionner ; il sera retire a
--     l'etape 3 (isolation @TenantId).
--   - index + cle etrangere vers `entreprise`.
--
-- Les cles UNIQUE metier sont renommees en (entreprise_id, ...) afin que
-- deux entreprises puissent avoir les memes valeurs metier.
-- Tables globales (non modifiees) : module, permission, module_permission,
-- auth_ticket, password_reset_token.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Colonne entreprise_id + index + cle etrangere
-- ---------------------------------------------------------------------
ALTER TABLE `agency_summary_entity` ADD COLUMN `entreprise_id` BIGINT NOT NULL DEFAULT 1;
ALTER TABLE `agency_summary_entity` ADD INDEX `idx_agency_summary_entity_entreprise` (`entreprise_id`);
ALTER TABLE `agency_summary_entity` ADD CONSTRAINT `fk_agency_summary_entity_entreprise` FOREIGN KEY (`entreprise_id`) REFERENCES `entreprise` (`id`);

ALTER TABLE `agency_threshold` ADD COLUMN `entreprise_id` BIGINT NOT NULL DEFAULT 1;
ALTER TABLE `agency_threshold` ADD INDEX `idx_agency_threshold_entreprise` (`entreprise_id`);
ALTER TABLE `agency_threshold` ADD CONSTRAINT `fk_agency_threshold_entreprise` FOREIGN KEY (`entreprise_id`) REFERENCES `entreprise` (`id`);

ALTER TABLE `auto_processing_models` ADD COLUMN `entreprise_id` BIGINT NOT NULL DEFAULT 1;
ALTER TABLE `auto_processing_models` ADD INDEX `idx_auto_processing_models_entreprise` (`entreprise_id`);
ALTER TABLE `auto_processing_models` ADD CONSTRAINT `fk_auto_processing_models_entreprise` FOREIGN KEY (`entreprise_id`) REFERENCES `entreprise` (`id`);

ALTER TABLE `bo_partenaire_controle_interne` ADD COLUMN `entreprise_id` BIGINT NOT NULL DEFAULT 1;
ALTER TABLE `bo_partenaire_controle_interne` ADD INDEX `idx_bo_partenaire_controle_interne_entreprise` (`entreprise_id`);
ALTER TABLE `bo_partenaire_controle_interne` ADD CONSTRAINT `fk_bo_partenaire_controle_interne_entreprise` FOREIGN KEY (`entreprise_id`) REFERENCES `entreprise` (`id`);

ALTER TABLE `bo_partenaire_controle_interne_comment` ADD COLUMN `entreprise_id` BIGINT NOT NULL DEFAULT 1;
ALTER TABLE `bo_partenaire_controle_interne_comment` ADD INDEX `idx_bo_partenaire_controle_interne_comment_entreprise` (`entreprise_id`);
ALTER TABLE `bo_partenaire_controle_interne_comment` ADD CONSTRAINT `fk_bo_partenaire_controle_interne_comment_entreprise` FOREIGN KEY (`entreprise_id`) REFERENCES `entreprise` (`id`);

ALTER TABLE `calculation_rule` ADD COLUMN `entreprise_id` BIGINT NOT NULL DEFAULT 1;
ALTER TABLE `calculation_rule` ADD INDEX `idx_calculation_rule_entreprise` (`entreprise_id`);
ALTER TABLE `calculation_rule` ADD CONSTRAINT `fk_calculation_rule_entreprise` FOREIGN KEY (`entreprise_id`) REFERENCES `entreprise` (`id`);

ALTER TABLE `column_processing_rules` ADD COLUMN `entreprise_id` BIGINT NOT NULL DEFAULT 1;
ALTER TABLE `column_processing_rules` ADD INDEX `idx_column_processing_rules_entreprise` (`entreprise_id`);
ALTER TABLE `column_processing_rules` ADD CONSTRAINT `fk_column_processing_rules_entreprise` FOREIGN KEY (`entreprise_id`) REFERENCES `entreprise` (`id`);

ALTER TABLE `commission_transaction` ADD COLUMN `entreprise_id` BIGINT NOT NULL DEFAULT 1;
ALTER TABLE `commission_transaction` ADD INDEX `idx_commission_transaction_entreprise` (`entreprise_id`);
ALTER TABLE `commission_transaction` ADD CONSTRAINT `fk_commission_transaction_entreprise` FOREIGN KEY (`entreprise_id`) REFERENCES `entreprise` (`id`);

ALTER TABLE `compte` ADD COLUMN `entreprise_id` BIGINT NOT NULL DEFAULT 1;
ALTER TABLE `compte` ADD INDEX `idx_compte_entreprise` (`entreprise_id`);
ALTER TABLE `compte` ADD CONSTRAINT `fk_compte_entreprise` FOREIGN KEY (`entreprise_id`) REFERENCES `entreprise` (`id`);

ALTER TABLE `compte_regroupement` ADD COLUMN `entreprise_id` BIGINT NOT NULL DEFAULT 1;
ALTER TABLE `compte_regroupement` ADD INDEX `idx_compte_regroupement_entreprise` (`entreprise_id`);
ALTER TABLE `compte_regroupement` ADD CONSTRAINT `fk_compte_regroupement_entreprise` FOREIGN KEY (`entreprise_id`) REFERENCES `entreprise` (`id`);

ALTER TABLE `compte_solde_bo` ADD COLUMN `entreprise_id` BIGINT NOT NULL DEFAULT 1;
ALTER TABLE `compte_solde_bo` ADD INDEX `idx_compte_solde_bo_entreprise` (`entreprise_id`);
ALTER TABLE `compte_solde_bo` ADD CONSTRAINT `fk_compte_solde_bo_entreprise` FOREIGN KEY (`entreprise_id`) REFERENCES `entreprise` (`id`);

ALTER TABLE `compte_solde_cloture` ADD COLUMN `entreprise_id` BIGINT NOT NULL DEFAULT 1;
ALTER TABLE `compte_solde_cloture` ADD INDEX `idx_compte_solde_cloture_entreprise` (`entreprise_id`);
ALTER TABLE `compte_solde_cloture` ADD CONSTRAINT `fk_compte_solde_cloture_entreprise` FOREIGN KEY (`entreprise_id`) REFERENCES `entreprise` (`id`);

ALTER TABLE `ecart_bo_summary` ADD COLUMN `entreprise_id` BIGINT NOT NULL DEFAULT 1;
ALTER TABLE `ecart_bo_summary` ADD INDEX `idx_ecart_bo_summary_entreprise` (`entreprise_id`);
ALTER TABLE `ecart_bo_summary` ADD CONSTRAINT `fk_ecart_bo_summary_entreprise` FOREIGN KEY (`entreprise_id`) REFERENCES `entreprise` (`id`);

ALTER TABLE `ecart_solde` ADD COLUMN `entreprise_id` BIGINT NOT NULL DEFAULT 1;
ALTER TABLE `ecart_solde` ADD INDEX `idx_ecart_solde_entreprise` (`entreprise_id`);
ALTER TABLE `ecart_solde` ADD CONSTRAINT `fk_ecart_solde_entreprise` FOREIGN KEY (`entreprise_id`) REFERENCES `entreprise` (`id`);

ALTER TABLE `flux` ADD COLUMN `entreprise_id` BIGINT NOT NULL DEFAULT 1;
ALTER TABLE `flux` ADD INDEX `idx_flux_entreprise` (`entreprise_id`);
ALTER TABLE `flux` ADD CONSTRAINT `fk_flux_entreprise` FOREIGN KEY (`entreprise_id`) REFERENCES `entreprise` (`id`);

ALTER TABLE `frais_transaction` ADD COLUMN `entreprise_id` BIGINT NOT NULL DEFAULT 1;
ALTER TABLE `frais_transaction` ADD INDEX `idx_frais_transaction_entreprise` (`entreprise_id`);
ALTER TABLE `frais_transaction` ADD CONSTRAINT `fk_frais_transaction_entreprise` FOREIGN KEY (`entreprise_id`) REFERENCES `entreprise` (`id`);

ALTER TABLE `guide_document` ADD COLUMN `entreprise_id` BIGINT NOT NULL DEFAULT 1;
ALTER TABLE `guide_document` ADD INDEX `idx_guide_document_entreprise` (`entreprise_id`);
ALTER TABLE `guide_document` ADD CONSTRAINT `fk_guide_document_entreprise` FOREIGN KEY (`entreprise_id`) REFERENCES `entreprise` (`id`);

ALTER TABLE `guide_node` ADD COLUMN `entreprise_id` BIGINT NOT NULL DEFAULT 1;
ALTER TABLE `guide_node` ADD INDEX `idx_guide_node_entreprise` (`entreprise_id`);
ALTER TABLE `guide_node` ADD CONSTRAINT `fk_guide_node_entreprise` FOREIGN KEY (`entreprise_id`) REFERENCES `entreprise` (`id`);

ALTER TABLE `impact_op` ADD COLUMN `entreprise_id` BIGINT NOT NULL DEFAULT 1;
ALTER TABLE `impact_op` ADD INDEX `idx_impact_op_entreprise` (`entreprise_id`);
ALTER TABLE `impact_op` ADD CONSTRAINT `fk_impact_op_entreprise` FOREIGN KEY (`entreprise_id`) REFERENCES `entreprise` (`id`);

ALTER TABLE `navigation_label_audit` ADD COLUMN `entreprise_id` BIGINT NOT NULL DEFAULT 1;
ALTER TABLE `navigation_label_audit` ADD INDEX `idx_navigation_label_audit_entreprise` (`entreprise_id`);
ALTER TABLE `navigation_label_audit` ADD CONSTRAINT `fk_navigation_label_audit_entreprise` FOREIGN KEY (`entreprise_id`) REFERENCES `entreprise` (`id`);

ALTER TABLE `operation` ADD COLUMN `entreprise_id` BIGINT NOT NULL DEFAULT 1;
ALTER TABLE `operation` ADD INDEX `idx_operation_entreprise` (`entreprise_id`);
ALTER TABLE `operation` ADD CONSTRAINT `fk_operation_entreprise` FOREIGN KEY (`entreprise_id`) REFERENCES `entreprise` (`id`);

ALTER TABLE `operation_bancaire` ADD COLUMN `entreprise_id` BIGINT NOT NULL DEFAULT 1;
ALTER TABLE `operation_bancaire` ADD INDEX `idx_operation_bancaire_entreprise` (`entreprise_id`);
ALTER TABLE `operation_bancaire` ADD CONSTRAINT `fk_operation_bancaire_entreprise` FOREIGN KEY (`entreprise_id`) REFERENCES `entreprise` (`id`);

ALTER TABLE `oppart` ADD COLUMN `entreprise_id` BIGINT NOT NULL DEFAULT 1;
ALTER TABLE `oppart` ADD INDEX `idx_oppart_entreprise` (`entreprise_id`);
ALTER TABLE `oppart` ADD CONSTRAINT `fk_oppart_entreprise` FOREIGN KEY (`entreprise_id`) REFERENCES `entreprise` (`id`);

ALTER TABLE `pays` ADD COLUMN `entreprise_id` BIGINT NOT NULL DEFAULT 1;
ALTER TABLE `pays` ADD INDEX `idx_pays_entreprise` (`entreprise_id`);
ALTER TABLE `pays` ADD CONSTRAINT `fk_pays_entreprise` FOREIGN KEY (`entreprise_id`) REFERENCES `entreprise` (`id`);

ALTER TABLE `profil` ADD COLUMN `entreprise_id` BIGINT NOT NULL DEFAULT 1;
ALTER TABLE `profil` ADD INDEX `idx_profil_entreprise` (`entreprise_id`);
ALTER TABLE `profil` ADD CONSTRAINT `fk_profil_entreprise` FOREIGN KEY (`entreprise_id`) REFERENCES `entreprise` (`id`);

ALTER TABLE `profil_pays` ADD COLUMN `entreprise_id` BIGINT NOT NULL DEFAULT 1;
ALTER TABLE `profil_pays` ADD INDEX `idx_profil_pays_entreprise` (`entreprise_id`);
ALTER TABLE `profil_pays` ADD CONSTRAINT `fk_profil_pays_entreprise` FOREIGN KEY (`entreprise_id`) REFERENCES `entreprise` (`id`);

ALTER TABLE `profil_permission` ADD COLUMN `entreprise_id` BIGINT NOT NULL DEFAULT 1;
ALTER TABLE `profil_permission` ADD INDEX `idx_profil_permission_entreprise` (`entreprise_id`);
ALTER TABLE `profil_permission` ADD CONSTRAINT `fk_profil_permission_entreprise` FOREIGN KEY (`entreprise_id`) REFERENCES `entreprise` (`id`);

ALTER TABLE `reco_j1_blocking_comment` ADD COLUMN `entreprise_id` BIGINT NOT NULL DEFAULT 1;
ALTER TABLE `reco_j1_blocking_comment` ADD INDEX `idx_reco_j1_blocking_comment_entreprise` (`entreprise_id`);
ALTER TABLE `reco_j1_blocking_comment` ADD CONSTRAINT `fk_reco_j1_blocking_comment_entreprise` FOREIGN KEY (`entreprise_id`) REFERENCES `entreprise` (`id`);

ALTER TABLE `reconciliation_jobs` ADD COLUMN `entreprise_id` BIGINT NOT NULL DEFAULT 1;
ALTER TABLE `reconciliation_jobs` ADD INDEX `idx_reconciliation_jobs_entreprise` (`entreprise_id`);
ALTER TABLE `reconciliation_jobs` ADD CONSTRAINT `fk_reconciliation_jobs_entreprise` FOREIGN KEY (`entreprise_id`) REFERENCES `entreprise` (`id`);

ALTER TABLE `reconciliation_locks` ADD COLUMN `entreprise_id` BIGINT NOT NULL DEFAULT 1;
ALTER TABLE `reconciliation_locks` ADD INDEX `idx_reconciliation_locks_entreprise` (`entreprise_id`);
ALTER TABLE `reconciliation_locks` ADD CONSTRAINT `fk_reconciliation_locks_entreprise` FOREIGN KEY (`entreprise_id`) REFERENCES `entreprise` (`id`);

ALTER TABLE `reconciliation_ok_keys` ADD COLUMN `entreprise_id` BIGINT NOT NULL DEFAULT 1;
ALTER TABLE `reconciliation_ok_keys` ADD INDEX `idx_reconciliation_ok_keys_entreprise` (`entreprise_id`);
ALTER TABLE `reconciliation_ok_keys` ADD CONSTRAINT `fk_reconciliation_ok_keys_entreprise` FOREIGN KEY (`entreprise_id`) REFERENCES `entreprise` (`id`);

ALTER TABLE `reconciliation_status` ADD COLUMN `entreprise_id` BIGINT NOT NULL DEFAULT 1;
ALTER TABLE `reconciliation_status` ADD INDEX `idx_reconciliation_status_entreprise` (`entreprise_id`);
ALTER TABLE `reconciliation_status` ADD CONSTRAINT `fk_reconciliation_status_entreprise` FOREIGN KEY (`entreprise_id`) REFERENCES `entreprise` (`id`);

ALTER TABLE `redevance_agence_param` ADD COLUMN `entreprise_id` BIGINT NOT NULL DEFAULT 1;
ALTER TABLE `redevance_agence_param` ADD INDEX `idx_redevance_agence_param_entreprise` (`entreprise_id`);
ALTER TABLE `redevance_agence_param` ADD CONSTRAINT `fk_redevance_agence_param_entreprise` FOREIGN KEY (`entreprise_id`) REFERENCES `entreprise` (`id`);

ALTER TABLE `releve_bancaire` ADD COLUMN `entreprise_id` BIGINT NOT NULL DEFAULT 1;
ALTER TABLE `releve_bancaire` ADD INDEX `idx_releve_bancaire_entreprise` (`entreprise_id`);
ALTER TABLE `releve_bancaire` ADD CONSTRAINT `fk_releve_bancaire_entreprise` FOREIGN KEY (`entreprise_id`) REFERENCES `entreprise` (`id`);

ALTER TABLE `releve_manual` ADD COLUMN `entreprise_id` BIGINT NOT NULL DEFAULT 1;
ALTER TABLE `releve_manual` ADD INDEX `idx_releve_manual_entreprise` (`entreprise_id`);
ALTER TABLE `releve_manual` ADD CONSTRAINT `fk_releve_manual_entreprise` FOREIGN KEY (`entreprise_id`) REFERENCES `entreprise` (`id`);

ALTER TABLE `result8rec` ADD COLUMN `entreprise_id` BIGINT NOT NULL DEFAULT 1;
ALTER TABLE `result8rec` ADD INDEX `idx_result8rec_entreprise` (`entreprise_id`);
ALTER TABLE `result8rec` ADD CONSTRAINT `fk_result8rec_entreprise` FOREIGN KEY (`entreprise_id`) REFERENCES `entreprise` (`id`);

ALTER TABLE `result8rec_audit` ADD COLUMN `entreprise_id` BIGINT NOT NULL DEFAULT 1;
ALTER TABLE `result8rec_audit` ADD INDEX `idx_result8rec_audit_entreprise` (`entreprise_id`);
ALTER TABLE `result8rec_audit` ADD CONSTRAINT `fk_result8rec_audit_entreprise` FOREIGN KEY (`entreprise_id`) REFERENCES `entreprise` (`id`);

ALTER TABLE `service_reference` ADD COLUMN `entreprise_id` BIGINT NOT NULL DEFAULT 1;
ALTER TABLE `service_reference` ADD INDEX `idx_service_reference_entreprise` (`entreprise_id`);
ALTER TABLE `service_reference` ADD CONSTRAINT `fk_service_reference_entreprise` FOREIGN KEY (`entreprise_id`) REFERENCES `entreprise` (`id`);

ALTER TABLE `sop_document` ADD COLUMN `entreprise_id` BIGINT NOT NULL DEFAULT 1;
ALTER TABLE `sop_document` ADD INDEX `idx_sop_document_entreprise` (`entreprise_id`);
ALTER TABLE `sop_document` ADD CONSTRAINT `fk_sop_document_entreprise` FOREIGN KEY (`entreprise_id`) REFERENCES `entreprise` (`id`);

ALTER TABLE `sop_node` ADD COLUMN `entreprise_id` BIGINT NOT NULL DEFAULT 1;
ALTER TABLE `sop_node` ADD INDEX `idx_sop_node_entreprise` (`entreprise_id`);
ALTER TABLE `sop_node` ADD CONSTRAINT `fk_sop_node_entreprise` FOREIGN KEY (`entreprise_id`) REFERENCES `entreprise` (`id`);

ALTER TABLE `statistics` ADD COLUMN `entreprise_id` BIGINT NOT NULL DEFAULT 1;
ALTER TABLE `statistics` ADD INDEX `idx_statistics_entreprise` (`entreprise_id`);
ALTER TABLE `statistics` ADD CONSTRAINT `fk_statistics_entreprise` FOREIGN KEY (`entreprise_id`) REFERENCES `entreprise` (`id`);

ALTER TABLE `suivi_ecart` ADD COLUMN `entreprise_id` BIGINT NOT NULL DEFAULT 1;
ALTER TABLE `suivi_ecart` ADD INDEX `idx_suivi_ecart_entreprise` (`entreprise_id`);
ALTER TABLE `suivi_ecart` ADD CONSTRAINT `fk_suivi_ecart_entreprise` FOREIGN KEY (`entreprise_id`) REFERENCES `entreprise` (`id`);

ALTER TABLE `trx_sf` ADD COLUMN `entreprise_id` BIGINT NOT NULL DEFAULT 1;
ALTER TABLE `trx_sf` ADD INDEX `idx_trx_sf_entreprise` (`entreprise_id`);
ALTER TABLE `trx_sf` ADD CONSTRAINT `fk_trx_sf_entreprise` FOREIGN KEY (`entreprise_id`) REFERENCES `entreprise` (`id`);

ALTER TABLE `user` ADD COLUMN `entreprise_id` BIGINT NOT NULL DEFAULT 1;
ALTER TABLE `user` ADD INDEX `idx_user_entreprise` (`entreprise_id`);
ALTER TABLE `user` ADD CONSTRAINT `fk_user_entreprise` FOREIGN KEY (`entreprise_id`) REFERENCES `entreprise` (`id`);

ALTER TABLE `user_log` ADD COLUMN `entreprise_id` BIGINT NOT NULL DEFAULT 1;
ALTER TABLE `user_log` ADD INDEX `idx_user_log_entreprise` (`entreprise_id`);
ALTER TABLE `user_log` ADD CONSTRAINT `fk_user_log_entreprise` FOREIGN KEY (`entreprise_id`) REFERENCES `entreprise` (`id`);

-- ---------------------------------------------------------------------
-- 2. Cles UNIQUE metier -> (entreprise_id, ...)
-- ---------------------------------------------------------------------
ALTER TABLE `agency_threshold` DROP INDEX `UK7i5mftcsv14tj8d8pd0qtym3i`;
ALTER TABLE `agency_threshold` ADD UNIQUE KEY `uk_agency_threshold_tenant` (`entreprise_id`, code_proprietaire, type_operation);

ALTER TABLE `auto_processing_models` DROP INDEX `UK_7jsugflwu9f30k4ajqvtb6yvt`;
ALTER TABLE `auto_processing_models` ADD UNIQUE KEY `uk_auto_processing_models_tenant` (`entreprise_id`, model_id);

ALTER TABLE `bo_partenaire_controle_interne` DROP INDEX `uk_bpci_month_country_env_service`;
ALTER TABLE `bo_partenaire_controle_interne` ADD UNIQUE KEY `uk_bo_partenaire_controle_interne_tenant` (`entreprise_id`, month_yyyy_mm, country, env, service);

ALTER TABLE `bo_partenaire_controle_interne_comment` DROP INDEX `uk_bpci_comment_scope`;
ALTER TABLE `bo_partenaire_controle_interne_comment` ADD UNIQUE KEY `uk_bo_partenaire_controle_interne_comment_tenant` (`entreprise_id`, month_yyyy_mm, country, env);

ALTER TABLE `calculation_rule` DROP INDEX `uk_calculation_rule_code`;
ALTER TABLE `calculation_rule` ADD UNIQUE KEY `uk_calculation_rule_tenant` (`entreprise_id`, code);

ALTER TABLE `compte` DROP INDEX `UK_hx2we7gc1i1c5ylusignv31f3`;
ALTER TABLE `compte` ADD UNIQUE KEY `uk_compte_tenant` (`entreprise_id`, numero_compte);

ALTER TABLE `compte_solde_bo` DROP INDEX `UK6pu1mr5r72fr7d13kgrvpd93i`;
ALTER TABLE `compte_solde_bo` ADD UNIQUE KEY `uk_compte_solde_bo_tenant` (`entreprise_id`, numero_compte, date_solde);

ALTER TABLE `compte_solde_cloture` DROP INDEX `UKteo2x9ohmafa9foexmxrqkyt4`;
ALTER TABLE `compte_solde_cloture` ADD UNIQUE KEY `uk_compte_solde_cloture_tenant` (`entreprise_id`, numero_compte, date_solde);

ALTER TABLE `flux` DROP INDEX `UKmc7y52q2gjqtqthpwk73rycix`;
ALTER TABLE `flux` ADD UNIQUE KEY `uk_flux_tenant` (`entreprise_id`, agence, date_debut, date_fin);

ALTER TABLE `guide_node` DROP INDEX `UK_q97nla1g4ytcgeg09on3dh2x2`;
ALTER TABLE `guide_node` ADD UNIQUE KEY `uk_guide_node_tenant` (`entreprise_id`, node_id);

ALTER TABLE `operation_bancaire` DROP INDEX `UK_2cd1bl1pnn9n9ynnlha7ryqcp`;
ALTER TABLE `operation_bancaire` ADD UNIQUE KEY `uk_operation_bancaire_tenant` (`entreprise_id`, dedup_key);

ALTER TABLE `pays` DROP INDEX `UK_iievwshu2sv589awso3xwlb5f`;
ALTER TABLE `pays` ADD UNIQUE KEY `uk_pays_tenant` (`entreprise_id`, code);

ALTER TABLE `profil` DROP INDEX `UK_oti9hwn3djjpjonm24y2uosdp`;
ALTER TABLE `profil` ADD UNIQUE KEY `uk_profil_tenant` (`entreprise_id`, nom);

ALTER TABLE `reco_j1_blocking_comment` DROP INDEX `uk_reco_j1_blocking_scope`;
ALTER TABLE `reco_j1_blocking_comment` ADD UNIQUE KEY `uk_reco_j1_blocking_comment_tenant` (`entreprise_id`, reco_date, service, country, env);

ALTER TABLE `reconciliation_jobs` DROP INDEX `UK_ft509svdwicfe60l23y8xtbxu`;
ALTER TABLE `reconciliation_jobs` ADD UNIQUE KEY `uk_reconciliation_jobs_tenant` (`entreprise_id`, job_id);

ALTER TABLE `reconciliation_locks` DROP INDEX `UK41y08i1sj4pxc0qdt90ra6y1d`;
ALTER TABLE `reconciliation_locks` ADD UNIQUE KEY `uk_reconciliation_locks_tenant` (`entreprise_id`, lock_key, lock_type);

ALTER TABLE `reconciliation_ok_keys` DROP INDEX `idx_recon_ok_key`;
ALTER TABLE `reconciliation_ok_keys` ADD UNIQUE KEY `uk_reconciliation_ok_keys_tenant` (`entreprise_id`, key_value);

ALTER TABLE `reconciliation_status` DROP INDEX `UK_bjswqfvjt8ej5du3dpw6scgly`;
ALTER TABLE `reconciliation_status` ADD UNIQUE KEY `uk_reconciliation_status_tenant` (`entreprise_id`, key_str);

ALTER TABLE `reconciliation_status` DROP INDEX `idx_recon_status_key`;
ALTER TABLE `reconciliation_status` ADD UNIQUE KEY `uk_reconciliation_status_tenant_2` (`entreprise_id`, key_value);

ALTER TABLE `redevance_agence_param` DROP INDEX `UK7ap81k5purh0oeubcwim7jc08`;
ALTER TABLE `redevance_agence_param` ADD UNIQUE KEY `uk_redevance_agence_param_tenant` (`entreprise_id`, agence);

ALTER TABLE `releve_bancaire` DROP INDEX `UK_nl2bf4e5ioxw002063ysk66nh`;
ALTER TABLE `releve_bancaire` ADD UNIQUE KEY `uk_releve_bancaire_tenant` (`entreprise_id`, dedup_key);

ALTER TABLE `service_reference` DROP INDEX `UK_iuso1kfs561jsrfi0fuj70ccc`;
ALTER TABLE `service_reference` ADD UNIQUE KEY `uk_service_reference_tenant` (`entreprise_id`, code_reco);

ALTER TABLE `sop_node` DROP INDEX `UK_5naxq8cvlwfmmigejveooc0ka`;
ALTER TABLE `sop_node` ADD UNIQUE KEY `uk_sop_node_tenant` (`entreprise_id`, node_id);

