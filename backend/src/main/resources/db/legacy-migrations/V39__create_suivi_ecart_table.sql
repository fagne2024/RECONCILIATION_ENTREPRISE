-- Créer la table du suivi des écarts
CREATE TABLE suivi_ecart (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    date DATE NOT NULL,
    agence VARCHAR(255) NOT NULL,
    service VARCHAR(255) NOT NULL,
    pays VARCHAR(255) NOT NULL,
    montant DOUBLE NOT NULL,
    token VARCHAR(255) NOT NULL,
    id_partenaire VARCHAR(255) NOT NULL,
    statut VARCHAR(255) NOT NULL,
    traitement VARCHAR(255)
);

-- Créer des index pour améliorer les performances
CREATE INDEX idx_suivi_ecart_date ON suivi_ecart(date);
CREATE INDEX idx_suivi_ecart_agence ON suivi_ecart(agence);
CREATE INDEX idx_suivi_ecart_service ON suivi_ecart(service);
CREATE INDEX idx_suivi_ecart_pays ON suivi_ecart(pays);
CREATE INDEX idx_suivi_ecart_statut ON suivi_ecart(statut);

