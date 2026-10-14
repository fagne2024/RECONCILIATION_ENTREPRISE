CREATE TABLE IF NOT EXISTS bo_partenaire_controle_interne (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    month_yyyy_mm VARCHAR(7) NOT NULL,
    country VARCHAR(64) NOT NULL,
    env VARCHAR(32) NOT NULL,
    service VARCHAR(255) NOT NULL,
    statut VARCHAR(32) NOT NULL DEFAULT 'EN_COURS_VALIDATION',
    validated_by VARCHAR(128),
    validated_at DATETIME,
    created_at DATETIME,
    updated_at DATETIME,
    CONSTRAINT uk_bpci_month_country_env_service UNIQUE (month_yyyy_mm, country, env, service)
);

CREATE TABLE IF NOT EXISTS bo_partenaire_controle_interne_comment (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    month_yyyy_mm VARCHAR(10) NOT NULL,
    country VARCHAR(64) NOT NULL,
    env VARCHAR(32) NOT NULL,
    commentaire TEXT,
    updated_by VARCHAR(128),
    updated_at DATETIME,
    last_emailed_at DATETIME,
    last_emailed_by VARCHAR(128),
    CONSTRAINT uk_bpci_comment_scope UNIQUE (month_yyyy_mm, country, env)
);
