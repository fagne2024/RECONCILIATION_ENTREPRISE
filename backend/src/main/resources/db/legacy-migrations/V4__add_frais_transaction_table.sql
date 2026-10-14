-- Ajouter le champ agence à la table compte
ALTER TABLE compte ADD COLUMN agence VARCHAR(255);

-- Créer la table des frais de transaction
CREATE TABLE frais_transaction (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    service VARCHAR(255) NOT NULL,
    agence VARCHAR(255) NOT NULL,
    montant_frais DOUBLE NOT NULL,
    description TEXT,
    actif BOOLEAN NOT NULL DEFAULT TRUE,
    date_creation DATETIME NOT NULL,
    date_modification DATETIME NOT NULL
);

-- Créer un index unique sur service et agence pour éviter les doublons
CREATE UNIQUE INDEX idx_frais_transaction_service_agence ON frais_transaction(service, agence);

-- Insérer quelques exemples de frais de transaction
INSERT INTO frais_transaction (service, agence, montant_frais, description, actif, date_creation, date_modification) VALUES
('CASHIN', 'AGENCE_DAKAR', 100.0, 'Frais de transaction Cash-in - Agence Dakar', TRUE, NOW(), NOW()),
('CASHIN', 'AGENCE_THIES', 80.0, 'Frais de transaction Cash-in - Agence Thiès', TRUE, NOW(), NOW()),
('PAIEMENT', 'AGENCE_DAKAR', 150.0, 'Frais de transaction Paiement - Agence Dakar', TRUE, NOW(), NOW()),
('PAIEMENT', 'AGENCE_THIES', 120.0, 'Frais de transaction Paiement - Agence Thiès', TRUE, NOW(), NOW()),
('TRANSFERT', 'AGENCE_DAKAR', 200.0, 'Frais de transaction Transfert - Agence Dakar', TRUE, NOW(), NOW()),
('TRANSFERT', 'AGENCE_THIES', 180.0, 'Frais de transaction Transfert - Agence Thiès', TRUE, NOW(), NOW()); 