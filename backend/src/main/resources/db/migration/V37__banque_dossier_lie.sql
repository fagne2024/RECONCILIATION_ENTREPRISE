-- Dossiers liés (page Banque) : regroupe des opérations bancaires et des lignes de relevé qui forment
-- une même opération métier (ex. appro de préfinancement + contrepartie, frais par mémo, compense de
-- remboursement du reliquat + contrepartie, frais sur le montant retourné). Chaque ligne porte un rôle.
CREATE TABLE `banque_dossier_lie` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `entreprise_id` bigint NOT NULL,
  `libelle` varchar(255) NOT NULL,
  `commentaire` varchar(1000) DEFAULT NULL,
  `created_by` varchar(255) DEFAULT NULL,
  `created_at` datetime(6) NOT NULL,
  `updated_by` varchar(255) DEFAULT NULL,
  `updated_at` datetime(6) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_banque_dossier_lie_entreprise` (`entreprise_id`),
  CONSTRAINT `fk_banque_dossier_lie_entreprise` FOREIGN KEY (`entreprise_id`) REFERENCES `entreprise` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Une ligne (opération ou relevé) appartient à un seul dossier.
CREATE TABLE `banque_dossier_lie_ligne` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `entreprise_id` bigint NOT NULL,
  `dossier_id` bigint NOT NULL,
  `type_ligne` varchar(16) NOT NULL,
  `ligne_id` bigint NOT NULL,
  `role` varchar(32) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_banque_dossier_lie_ligne` (`entreprise_id`, `type_ligne`, `ligne_id`),
  KEY `idx_banque_dossier_lie_ligne_dossier` (`dossier_id`),
  CONSTRAINT `fk_banque_dossier_lie_ligne_dossier` FOREIGN KEY (`dossier_id`) REFERENCES `banque_dossier_lie` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_banque_dossier_lie_ligne_entreprise` FOREIGN KEY (`entreprise_id`) REFERENCES `entreprise` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
