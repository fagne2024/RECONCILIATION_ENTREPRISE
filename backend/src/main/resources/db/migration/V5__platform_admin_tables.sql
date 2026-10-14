-- =====================================================================
-- V5 : administration de la plateforme (etape 4)
--
-- Deux tables GLOBALES (aucune colonne entreprise_id "tenant", aucune
-- isolation @TenantId) :
--
--   - activation_token   : lien d'activation a USAGE UNIQUE du compte ADMIN
--                          cree avec une nouvelle entreprise. Le mot de passe
--                          n'est jamais transmis : l'administrateur choisit
--                          lui-meme son mot de passe via ce lien (TTL 72 h).
--
--   - platform_audit_log : journal des actions du SUPER_ADMIN (creation,
--                          suspension, reactivation, renommage, renvoi de
--                          lien). Ne contient AUCUN secret (ni mot de passe,
--                          ni jeton).
--
-- Le catalogue `module` et les tables `user`/`entreprise*` restent inchanges.
-- =====================================================================

CREATE TABLE `activation_token` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `token` VARCHAR(64) NOT NULL,
  `username` VARCHAR(100) NOT NULL,
  `entreprise_id` BIGINT NOT NULL,
  `used` BIT(1) NOT NULL DEFAULT b'0',
  `created_at` DATETIME(6) NOT NULL,
  `expires_at` DATETIME(6) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_activation_token_token` (`token`),
  KEY `idx_activation_token_username` (`username`),
  KEY `idx_activation_token_entreprise` (`entreprise_id`),
  CONSTRAINT `fk_activation_token_entreprise` FOREIGN KEY (`entreprise_id`) REFERENCES `entreprise` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `platform_audit_log` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `actor_username` VARCHAR(100) NOT NULL,
  `action` VARCHAR(64) NOT NULL,
  `target_type` VARCHAR(64) NOT NULL,
  `target_id` VARCHAR(64) DEFAULT NULL,
  `details` VARCHAR(1000) DEFAULT NULL,
  `created_at` DATETIME(6) NOT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_platform_audit_created` (`created_at`),
  KEY `idx_platform_audit_action` (`action`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
