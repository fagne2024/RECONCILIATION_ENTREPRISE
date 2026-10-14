CREATE TABLE IF NOT EXISTS reco_j1_blocking_comment (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    reco_date VARCHAR(10) NOT NULL,
    service VARCHAR(255) NOT NULL,
    country VARCHAR(128) NOT NULL,
    env VARCHAR(32) NOT NULL,
    comment_text TEXT NOT NULL,
    updated_by VARCHAR(128) NULL,
    updated_at DATETIME(6) NULL,
    CONSTRAINT uk_reco_j1_blocking_scope UNIQUE (reco_date, service, country, env)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
