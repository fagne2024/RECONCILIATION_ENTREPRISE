-- Migration pour créer la table user_log
CREATE TABLE user_log (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    permission VARCHAR(255) NOT NULL,
    module VARCHAR(255) NOT NULL,
    username VARCHAR(255) NOT NULL,
    date_heure DATETIME NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    -- Index pour améliorer les performances
    INDEX idx_username (username),
    INDEX idx_module (module),
    INDEX idx_permission (permission),
    INDEX idx_date_heure (date_heure),
    INDEX idx_module_permission (module, permission)
);

-- Commentaires sur la table
ALTER TABLE user_log COMMENT = 'Table pour stocker les logs des actions utilisateurs';

-- Commentaires sur les colonnes
ALTER TABLE user_log MODIFY COLUMN permission VARCHAR(255) NOT NULL COMMENT 'Permission utilisée';
ALTER TABLE user_log MODIFY COLUMN module VARCHAR(255) NOT NULL COMMENT 'Module concerné';
ALTER TABLE user_log MODIFY COLUMN username VARCHAR(255) NOT NULL COMMENT 'Nom d''utilisateur';
ALTER TABLE user_log MODIFY COLUMN date_heure DATETIME NOT NULL COMMENT 'Date et heure de l''action';
ALTER TABLE user_log MODIFY COLUMN created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT 'Date de création de l''enregistrement';

