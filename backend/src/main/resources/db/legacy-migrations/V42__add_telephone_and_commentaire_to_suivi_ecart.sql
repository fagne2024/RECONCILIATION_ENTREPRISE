-- Ajouter les colonnes telephone et commentaire à la table suivi_ecart
ALTER TABLE suivi_ecart 
ADD COLUMN telephone VARCHAR(255) NULL,
ADD COLUMN commentaire TEXT NULL;


