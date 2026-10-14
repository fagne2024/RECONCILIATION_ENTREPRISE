-- Créer la table des transactions SF
CREATE TABLE trx_sf (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    id_transaction VARCHAR(255) NOT NULL,
    telephone_client VARCHAR(255),
    montant DOUBLE NOT NULL,
    service VARCHAR(255),
    agence VARCHAR(255),
    date_transaction DATETIME NOT NULL,
    numero_trans_gu VARCHAR(255),
    pays VARCHAR(10),
    date_import DATETIME DEFAULT CURRENT_TIMESTAMP,
    statut VARCHAR(50) DEFAULT 'EN_ATTENTE',
    frais DOUBLE DEFAULT 0.0,
    commentaire TEXT
);

-- Créer des index pour améliorer les performances
CREATE INDEX idx_trx_sf_agence ON trx_sf(agence);
CREATE INDEX idx_trx_sf_service ON trx_sf(service);
CREATE INDEX idx_trx_sf_pays ON trx_sf(pays);
CREATE INDEX idx_trx_sf_statut ON trx_sf(statut);
CREATE INDEX idx_trx_sf_date_transaction ON trx_sf(date_transaction);
CREATE INDEX idx_trx_sf_date_import ON trx_sf(date_import);
CREATE INDEX idx_trx_sf_id_transaction ON trx_sf(id_transaction);
CREATE INDEX idx_trx_sf_frais ON trx_sf(frais);
