-- Historique des actions sur une ligne rapport (result8rec) pour affichage dans l'UI
CREATE TABLE IF NOT EXISTS result8rec_audit (
    id BIGINT NOT NULL AUTO_INCREMENT,
    result8rec_id BIGINT NOT NULL,
    action_type VARCHAR(64) NOT NULL,
    username VARCHAR(255),
    traitement_snapshot VARCHAR(255),
    status_snapshot VARCHAR(64),
    detail TEXT,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_audit_result8rec_id (result8rec_id),
    CONSTRAINT fk_audit_result8rec FOREIGN KEY (result8rec_id)
        REFERENCES result8rec(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
