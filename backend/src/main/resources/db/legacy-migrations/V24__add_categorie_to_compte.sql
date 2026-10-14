-- Migration pour ajouter la colonne categorie à la table compte
-- Les valeurs possibles sont : CLIENT, SERVICE, BANQUE
ALTER TABLE compte ADD COLUMN categorie VARCHAR(10) DEFAULT NULL;

-- Ajout d'une contrainte pour limiter les valeurs possibles
ALTER TABLE compte ADD CONSTRAINT chk_categorie CHECK (categorie IN ('CLIENT', 'SERVICE', 'BANQUE'));

-- Index pour améliorer les performances des requêtes par catégorie
CREATE INDEX idx_compte_categorie ON compte(categorie);
