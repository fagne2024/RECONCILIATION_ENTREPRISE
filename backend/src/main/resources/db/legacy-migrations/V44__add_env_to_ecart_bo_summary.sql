-- Ajouter la colonne env à la table ecart_bo_summary
ALTER TABLE ecart_bo_summary ADD COLUMN env VARCHAR(20) DEFAULT 'BO';

-- Mettre à jour les enregistrements existants avec 'BO' par défaut
UPDATE ecart_bo_summary SET env = 'BO' WHERE env IS NULL;
