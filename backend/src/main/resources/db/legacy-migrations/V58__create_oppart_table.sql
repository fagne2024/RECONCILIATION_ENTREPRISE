CREATE TABLE IF NOT EXISTS oppart (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    client VARCHAR(255),
    type_op VARCHAR(100),
    montant DECIMAL(15,3),
    date_operation DATETIME,
    id_transaction VARCHAR(100),
    pays VARCHAR(128),
    source VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_oppart_pays (pays),
    INDEX idx_oppart_type_op (type_op),
    INDEX idx_oppart_date (date_operation)
);