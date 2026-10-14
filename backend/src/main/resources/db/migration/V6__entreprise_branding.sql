-- =====================================================================
-- V6 : marque (branding) propre a chaque entreprise (etape 8)
--
-- Table GLOBALE (aucune isolation @TenantId) : la marque d'une entreprise
-- doit pouvoir etre lue AVANT authentification (page de connexion) en
-- resolvant l'entreprise par son `code` (sous-domaine ou ?entreprise=CODE).
-- Les ecritures, elles, sont strictement limitees a l'entreprise du compte
-- authentifie (voir ConfigurationController).
--
--   - theme_json         : couleurs de l'interface (JSON, 9 cles)
--   - logo_data          : logo encode en data URL (LONGTEXT)
--   - logo_settings_json : reglages d'affichage du logo (JSON)
--
-- Le SUPER_ADMIN (aucune entreprise) n'a jamais de ligne ici : il conserve
-- donc les couleurs/logo PAR DEFAUT de l'application.
-- =====================================================================

CREATE TABLE `entreprise_branding` (
  `entreprise_id` BIGINT NOT NULL,
  `theme_json` TEXT NULL,
  `logo_data` LONGTEXT NULL,
  `logo_settings_json` TEXT NULL,
  `updated_at` DATETIME(6) NULL,
  PRIMARY KEY (`entreprise_id`),
  CONSTRAINT `fk_entreprise_branding_entreprise` FOREIGN KEY (`entreprise_id`) REFERENCES `entreprise` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
