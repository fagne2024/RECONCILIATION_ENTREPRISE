-- =====================================================================
-- V29 : Configuration > Normalisation modèle.
--
-- Pour chaque modèle de traitement, une colonne par défaut (celle du fichier
-- modèle, ex. « Numéro Trans GU ») peut avoir des en-têtes équivalents
-- (ex. « Num Trans GU », « ID »). Au chargement d'un fichier (traitement ou
-- réconciliation), si la colonne par défaut est absente, l'en-tête équivalent
-- présent est renommé avec le nom par défaut.
--
--   model_id      : identifiant fonctionnel du modèle (auto_processing_models.model_id)
--   column_name   : colonne par défaut du modèle
--   equivalents   : en-têtes équivalents, tableau JSON de chaînes
--
-- Isolation multi-entreprise : entreprise_id (discriminant Hibernate @TenantId).
-- =====================================================================

CREATE TABLE `model_column_equivalence` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `entreprise_id` BIGINT NOT NULL,
  `model_id` VARCHAR(255) NOT NULL,
  `column_name` VARCHAR(255) NOT NULL,
  `equivalents` TEXT NULL,
  `date_creation` DATETIME(6) NULL,
  `date_modification` DATETIME(6) NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_model_column_equivalence` (`entreprise_id`, `model_id`, `column_name`),
  CONSTRAINT `fk_model_column_equivalence_entreprise` FOREIGN KEY (`entreprise_id`) REFERENCES `entreprise` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
