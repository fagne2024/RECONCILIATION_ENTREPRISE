-- Ajouter la colonne token pour lier les lignes BO et PARTENAIRE (statut OK)
ALTER TABLE ecart_bo_summary ADD COLUMN token VARCHAR(64) NULL;

-- Index pour recherche rapide par token
CREATE INDEX idx_ecart_bo_summary_token ON ecart_bo_summary(token);
