-- Migration pour ajouter le champ service à la table operation
ALTER TABLE operation ADD COLUMN service VARCHAR(255); 