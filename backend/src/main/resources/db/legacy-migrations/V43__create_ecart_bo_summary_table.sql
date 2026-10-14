-- Créer la table des résumés d'écarts BO
CREATE TABLE ecart_bo_summary (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    date_transaction DATETIME NOT NULL,
    agence VARCHAR(255),
    service VARCHAR(255),
    pays VARCHAR(255),
    nombre_transactions INT NOT NULL DEFAULT 0,
    montant_total DOUBLE NOT NULL DEFAULT 0,
    statut VARCHAR(50) DEFAULT 'EN_COURS',
    date_import DATETIME DEFAULT CURRENT_TIMESTAMP,
    commentaire TEXT
);

-- Créer des index pour améliorer les performances
CREATE INDEX idx_ecart_bo_summary_agence ON ecart_bo_summary(agence);
CREATE INDEX idx_ecart_bo_summary_service ON ecart_bo_summary(service);
CREATE INDEX idx_ecart_bo_summary_pays ON ecart_bo_summary(pays);
CREATE INDEX idx_ecart_bo_summary_statut ON ecart_bo_summary(statut);
CREATE INDEX idx_ecart_bo_summary_date_transaction ON ecart_bo_summary(date_transaction);
CREATE INDEX idx_ecart_bo_summary_date_import ON ecart_bo_summary(date_import);
