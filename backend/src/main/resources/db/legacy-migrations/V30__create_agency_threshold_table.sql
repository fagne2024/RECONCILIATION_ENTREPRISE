-- Créer la table pour stocker les seuils personnalisés par agence
CREATE TABLE IF NOT EXISTS agency_threshold (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    code_proprietaire VARCHAR(255) NOT NULL,
    type_operation VARCHAR(255) NOT NULL,
    threshold_amount DOUBLE NOT NULL,
    created_at DATETIME NOT NULL,
    updated_at DATETIME NOT NULL,
    CONSTRAINT uk_agency_threshold UNIQUE (code_proprietaire, type_operation)
);

-- Créer un index pour améliorer les performances de recherche
CREATE INDEX idx_agency_threshold_code_proprietaire ON agency_threshold(code_proprietaire);
CREATE INDEX idx_agency_threshold_type_operation ON agency_threshold(type_operation);

