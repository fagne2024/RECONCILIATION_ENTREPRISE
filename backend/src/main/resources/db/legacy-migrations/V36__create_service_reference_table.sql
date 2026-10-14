CREATE TABLE service_reference (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    pays VARCHAR(10) NOT NULL,
    code_service VARCHAR(150) NOT NULL,
    service_label VARCHAR(150) NOT NULL,
    code_reco VARCHAR(150) NOT NULL,
    service_type VARCHAR(100),
    operateur VARCHAR(100),
    reseau VARCHAR(50),
    reconciliable BOOLEAN NOT NULL DEFAULT TRUE,
    motif VARCHAR(255),
    retenu_operateur VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX idx_service_reference_code_reco
    ON service_reference(code_reco);

