-- =====================================================================
-- V15 : résultat enregistré d'une certification de solde
--
-- Instantané du document PDF de certification (TRXBO / OPPART), pour
-- pouvoir le consulter plus tard sans relancer la réconciliation.
--
--   - colonnes : les chiffres clés (soldes, variation, écarts, synthèse),
--     filtrables et triables en liste ;
--   - details_json : les tableaux du PDF (détail de régularisation,
--     compense par agence, lignes d'écart, types d'opérations, TRXBO par
--     service et client).
--
-- Une seule certification par compte et période (du / au) et par
-- entreprise : un nouvel enregistrement remplace le précédent.
-- =====================================================================

CREATE TABLE `certification_solde_resultat` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `entreprise_id` BIGINT NOT NULL,
  `numero_compte` VARCHAR(255) NOT NULL,
  `date_debut` DATE NOT NULL,
  `date_fin` DATE NOT NULL,
  `heure_ouverture` VARCHAR(8) NULL,
  `heure_cloture` VARCHAR(8) NULL,
  `titre` VARCHAR(255) NULL,
  `solde_ouverture` DOUBLE NULL,
  `solde_cloture` DOUBLE NULL,
  `total_debit` DOUBLE NULL,
  `total_credit` DOUBLE NULL,
  `variation` DOUBLE NULL,
  `mouvement_net_oppart` DOUBLE NULL,
  `frais_attendu` DOUBLE NULL,
  `frais_factures` DOUBLE NULL,
  `ecart_frais` DOUBLE NULL,
  `ecart_mouvement` DOUBLE NULL,
  `total_regularisation` DOUBLE NULL,
  `ecart_certification` DOUBLE NULL,
  `solde_cloture_theorique` DOUBLE NULL,
  `volume_ecart_bo` DOUBLE NULL,
  `volume_ecart_partenaire` DOUBLE NULL,
  `nb_lignes_bo` INT NULL,
  `nb_lignes_partenaire` INT NULL,
  `nb_correspondances` INT NULL,
  `commentaire` VARCHAR(2000) NULL,
  `details_json` LONGTEXT NULL,
  `created_by` VARCHAR(255) NULL,
  `updated_by` VARCHAR(255) NULL,
  `created_at` DATETIME(6) NULL,
  `updated_at` DATETIME(6) NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_certification_solde_resultat_tenant` (`entreprise_id`, `numero_compte`, `date_debut`, `date_fin`),
  KEY `idx_certification_solde_resultat_compte` (`entreprise_id`, `numero_compte`, `date_fin`),
  CONSTRAINT `fk_certification_solde_resultat_entreprise` FOREIGN KEY (`entreprise_id`) REFERENCES `entreprise` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
