-- Migration pour ajouter la colonne code_proprietaire à la table compte
ALTER TABLE compte ADD COLUMN code_proprietaire VARCHAR(255); 