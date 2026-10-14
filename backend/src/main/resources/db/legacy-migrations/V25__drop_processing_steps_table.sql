-- Migration pour supprimer la table processing_steps
-- Suppression de la logique ProcessingStep du backend

-- Désactiver temporairement la vérification des clés étrangères
SET FOREIGN_KEY_CHECKS = 0;

-- Supprimer la table processing_steps
DROP TABLE IF EXISTS processing_steps;

-- Réactiver la vérification des clés étrangères
SET FOREIGN_KEY_CHECKS = 1;
