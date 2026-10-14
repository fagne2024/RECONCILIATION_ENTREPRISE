-- Migration pour créer la table impact_op
CREATE TABLE impact_op (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    type_operation VARCHAR(255) NOT NULL,
    montant DECIMAL(15,3) NOT NULL,
    solde_avant DECIMAL(15,3) NOT NULL,
    solde_apres DECIMAL(15,3) NOT NULL,
    code_proprietaire VARCHAR(50) NOT NULL,
    date_operation DATETIME NOT NULL,
    numero_trans_gu VARCHAR(50) NOT NULL,
    groupe_reseau VARCHAR(10) NOT NULL,
    statut ENUM('EN_ATTENTE', 'TRAITE', 'ERREUR') DEFAULT 'EN_ATTENTE',
    commentaire TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    -- Index pour améliorer les performances
    INDEX idx_code_proprietaire (code_proprietaire),
    INDEX idx_type_operation (type_operation),
    INDEX idx_groupe_reseau (groupe_reseau),
    INDEX idx_statut (statut),
    INDEX idx_date_operation (date_operation),
    INDEX idx_numero_trans_gu (numero_trans_gu),
    
    -- Index unique pour éviter les doublons
    UNIQUE INDEX idx_unique_impact (code_proprietaire, numero_trans_gu, date_operation)
);

-- Commentaires sur la table
ALTER TABLE impact_op COMMENT = 'Table pour stocker les impacts OP (écarts partenaires)';

-- Commentaires sur les colonnes
ALTER TABLE impact_op MODIFY COLUMN type_operation VARCHAR(255) NOT NULL COMMENT 'Type d''opération effectuée';
ALTER TABLE impact_op MODIFY COLUMN montant DECIMAL(15,3) NOT NULL COMMENT 'Montant de l''impact (négatif = débit)';
ALTER TABLE impact_op MODIFY COLUMN solde_avant DECIMAL(15,3) NOT NULL COMMENT 'Solde avant l''opération';
ALTER TABLE impact_op MODIFY COLUMN solde_apres DECIMAL(15,3) NOT NULL COMMENT 'Solde après l''opération';
ALTER TABLE impact_op MODIFY COLUMN code_proprietaire VARCHAR(50) NOT NULL COMMENT 'Code du propriétaire du compte';
ALTER TABLE impact_op MODIFY COLUMN date_operation DATETIME NOT NULL COMMENT 'Date et heure de l''opération';
ALTER TABLE impact_op MODIFY COLUMN numero_trans_gu VARCHAR(50) NOT NULL COMMENT 'Numéro de transaction GU';
ALTER TABLE impact_op MODIFY COLUMN groupe_reseau VARCHAR(10) NOT NULL COMMENT 'Groupe réseau concerné';
ALTER TABLE impact_op MODIFY COLUMN statut ENUM('EN_ATTENTE', 'TRAITE', 'ERREUR') DEFAULT 'EN_ATTENTE' COMMENT 'Statut de l''impact';
ALTER TABLE impact_op MODIFY COLUMN commentaire TEXT COMMENT 'Commentaire sur l''impact';
ALTER TABLE impact_op MODIFY COLUMN created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT 'Date de création';
ALTER TABLE impact_op MODIFY COLUMN updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT 'Date de mise à jour'; 