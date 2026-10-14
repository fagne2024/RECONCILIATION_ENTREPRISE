-- Créer la table des écarts de solde
CREATE TABLE ecart_solde (
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
    commentaire TEXT
);

-- Créer des index pour améliorer les performances
CREATE INDEX idx_ecart_solde_agence ON ecart_solde(agence);
CREATE INDEX idx_ecart_solde_service ON ecart_solde(service);
CREATE INDEX idx_ecart_solde_pays ON ecart_solde(pays);
CREATE INDEX idx_ecart_solde_statut ON ecart_solde(statut);
CREATE INDEX idx_ecart_solde_date_transaction ON ecart_solde(date_transaction);
CREATE INDEX idx_ecart_solde_date_import ON ecart_solde(date_import);
CREATE INDEX idx_ecart_solde_id_transaction ON ecart_solde(id_transaction); 