-- Ajout de la colonne retenue_sur_gains à la table flux (saisie manuelle)
ALTER TABLE flux ADD COLUMN retenue_sur_gains DOUBLE DEFAULT 0;
