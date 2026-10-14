-- Migration pour ajouter la colonne details à la table user_log
ALTER TABLE user_log 
ADD COLUMN details VARCHAR(1000) NULL COMMENT 'Détails de la modification (ex: numéro de compte modifié, ID de l''élément, etc.)';

-- Index pour améliorer les performances de recherche par détails (optionnel, si nécessaire)
-- CREATE INDEX idx_details ON user_log(details(255));
