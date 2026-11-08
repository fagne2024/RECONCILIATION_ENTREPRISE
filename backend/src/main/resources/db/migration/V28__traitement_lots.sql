-- =====================================================================
-- V28 : traitement serveur par lots (phase 1).
--
-- Les fichiers d'un traitement sont envoyés un par un et stockés en base
-- au lieu d'être gardés dans la mémoire du navigateur :
--   traitement_lot     : un lot de traitement (un utilisateur, une entreprise)
--   traitement_fichier : un fichier du lot, avec ses colonnes d'origine
--   traitement_ligne   : une ligne de donnée, valeurs au format JSON
--
-- Isolation multi-entreprise : chaque table porte entreprise_id et toutes
-- les requêtes du service le filtrent explicitement.
-- =====================================================================

CREATE TABLE `traitement_lot` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `entreprise_id` BIGINT NOT NULL,
  `uuid` VARCHAR(36) NOT NULL,
  `statut` VARCHAR(20) NOT NULL,
  `nb_fichiers` INT NOT NULL DEFAULT 0,
  `nb_lignes` BIGINT NOT NULL DEFAULT 0,
  `cree_par` VARCHAR(255) NULL,
  `created_at` DATETIME(6) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_traitement_lot_uuid` (`entreprise_id`, `uuid`),
  CONSTRAINT `fk_traitement_lot_entreprise` FOREIGN KEY (`entreprise_id`) REFERENCES `entreprise` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `traitement_fichier` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `entreprise_id` BIGINT NOT NULL,
  `lot_id` BIGINT NOT NULL,
  `ordre` INT NOT NULL,
  `nom` VARCHAR(255) NOT NULL,
  `nb_lignes` BIGINT NOT NULL DEFAULT 0,
  `colonnes_json` LONGTEXT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_traitement_fichier_lot` (`entreprise_id`, `lot_id`),
  CONSTRAINT `fk_traitement_fichier_lot` FOREIGN KEY (`lot_id`) REFERENCES `traitement_lot` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `traitement_ligne` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `entreprise_id` BIGINT NOT NULL,
  `lot_id` BIGINT NOT NULL,
  `fichier_id` BIGINT NOT NULL,
  `numero` BIGINT NOT NULL,
  `valeurs_json` LONGTEXT NOT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_traitement_ligne_lot` (`entreprise_id`, `lot_id`, `numero`),
  KEY `idx_traitement_ligne_fichier` (`fichier_id`),
  CONSTRAINT `fk_traitement_ligne_lot` FOREIGN KEY (`lot_id`) REFERENCES `traitement_lot` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_traitement_ligne_fichier` FOREIGN KEY (`fichier_id`) REFERENCES `traitement_fichier` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
