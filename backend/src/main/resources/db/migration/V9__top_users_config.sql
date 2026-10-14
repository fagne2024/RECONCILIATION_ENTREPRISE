-- =====================================================================
-- V9 : configuration du « Top des utilisateurs » (État des réconciliations)
--
-- Bloc parametrable depuis Configuration > Top utilisateurs. La
-- configuration est propre a CHAQUE entreprise : la colonne
-- `entreprise_id` porte l'isolation @TenantId (comme `calculation_rule`).
--
--   - enabled          : afficher ou masquer la section
--   - top_n            : nombre d'utilisateurs affiches par categorie (1..10)
--   - show_agents      : afficher la categorie « Agents de reconciliation »
--   - show_responsables: afficher la categorie « Responsables »
--   - show_validateurs : afficher la categorie « Validateurs »
--   - show_delta       : afficher la variation vs periode precedente
--
-- Une seule ligne par entreprise (index UNIQUE sur entreprise_id).
-- =====================================================================

CREATE TABLE `top_users_config` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `entreprise_id` BIGINT NOT NULL,
  `enabled` BIT(1) NOT NULL DEFAULT b'1',
  `top_n` INT NOT NULL DEFAULT 3,
  `show_agents` BIT(1) NOT NULL DEFAULT b'1',
  `show_responsables` BIT(1) NOT NULL DEFAULT b'1',
  `show_validateurs` BIT(1) NOT NULL DEFAULT b'1',
  `show_delta` BIT(1) NOT NULL DEFAULT b'1',
  `updated_at` DATETIME(6) NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_top_users_config_tenant` (`entreprise_id`),
  CONSTRAINT `fk_top_users_config_entreprise` FOREIGN KEY (`entreprise_id`) REFERENCES `entreprise` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
