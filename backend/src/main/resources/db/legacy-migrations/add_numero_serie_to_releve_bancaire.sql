-- Migration pour ajouter la colonne numero_serie à la table releve_bancaire
-- Support du modèle ECOBANK

ALTER TABLE releve_bancaire ADD COLUMN numero_serie VARCHAR(50);

-- Ajouter un commentaire pour documenter la colonne
COMMENT ON COLUMN releve_bancaire.numero_serie IS 'Numéro de série des transactions (support ECOBANK)';
