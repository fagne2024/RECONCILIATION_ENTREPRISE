-- Migration pour ajouter le champ record_count à la table operation
ALTER TABLE operation ADD COLUMN record_count INT; 