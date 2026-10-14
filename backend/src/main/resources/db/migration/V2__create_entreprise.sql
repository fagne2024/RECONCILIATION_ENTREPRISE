-- =====================================================================
-- V2 : Modele multi-entreprises (etape 1)
--
-- - table `entreprise`            : les societes (tenants)
-- - table `entreprise_module`     : activation des modules PAR entreprise
-- - creation de l'entreprise historique « Intouch » (id = 1) qui recoit
--   toutes les donnees existantes
-- - activation de tous les modules existants pour l'entreprise historique
--
-- NB : aucun `entreprise_id` n'est ajoute ici ; c'est l'objet de V3.
-- =====================================================================

CREATE TABLE `entreprise` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `code` VARCHAR(64) NOT NULL,
  `nom` VARCHAR(255) NOT NULL,
  `statut` VARCHAR(32) NOT NULL DEFAULT 'ACTIVE',
  `created_at` DATETIME(6) NOT NULL,
  `updated_at` DATETIME(6) NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_entreprise_code` (`code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `entreprise_module` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `entreprise_id` BIGINT NOT NULL,
  `module_id` BIGINT NOT NULL,
  `actif` BIT(1) NOT NULL DEFAULT b'1',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_entreprise_module` (`entreprise_id`, `module_id`),
  KEY `idx_entreprise_module_entreprise` (`entreprise_id`),
  KEY `idx_entreprise_module_module` (`module_id`),
  CONSTRAINT `fk_entreprise_module_entreprise` FOREIGN KEY (`entreprise_id`) REFERENCES `entreprise` (`id`),
  CONSTRAINT `fk_entreprise_module_module` FOREIGN KEY (`module_id`) REFERENCES `module` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Entreprise historique : c'est le PREMIER enregistrement de la table, donc id = 1.
-- L'id 1 est utilise comme valeur par defaut transitoire de `entreprise_id` (V3).
INSERT INTO `entreprise` (`code`, `nom`, `statut`, `created_at`)
VALUES ('INTOUCH', 'Intouch', 'ACTIVE', NOW(6));

-- Tous les modules existants sont actifs pour l'entreprise historique,
-- afin qu'elle conserve exactement son comportement actuel.
INSERT INTO `entreprise_module` (`entreprise_id`, `module_id`, `actif`)
SELECT e.id, m.id, b'1'
FROM `entreprise` e
CROSS JOIN `module` m
WHERE e.code = 'INTOUCH';
