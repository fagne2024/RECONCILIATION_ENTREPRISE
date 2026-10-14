-- Ajouter une contrainte d'unicité pour éviter les doublons dans TRX SF
-- La combinaison id_transaction + agence + date_transaction doit être unique
ALTER TABLE trx_sf ADD CONSTRAINT uk_trx_sf_unique_transaction 
UNIQUE (id_transaction, agence, date_transaction);

-- Ajouter un index unique sur id_transaction seul (si c'est déjà unique)
-- ALTER TABLE trx_sf ADD CONSTRAINT uk_trx_sf_id_transaction UNIQUE (id_transaction);

-- Ajouter un index pour améliorer les performances de recherche de doublons
CREATE INDEX idx_trx_sf_duplicate_check ON trx_sf(id_transaction, agence, date_transaction);
