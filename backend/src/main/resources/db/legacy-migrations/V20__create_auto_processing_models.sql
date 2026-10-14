CREATE TABLE auto_processing_models (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    model_id VARCHAR(255) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    file_pattern VARCHAR(255),
    file_type VARCHAR(50),
    auto_apply BOOLEAN DEFAULT FALSE,
    template_file VARCHAR(255),
    reconciliation_keys TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE INDEX idx_auto_processing_models_model_id ON auto_processing_models(model_id);
CREATE INDEX idx_auto_processing_models_name ON auto_processing_models(name); 