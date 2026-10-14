-- Migration pour ajouter la colonne référence à la table operation
ALTER TABLE operation ADD COLUMN reference VARCHAR(255); 