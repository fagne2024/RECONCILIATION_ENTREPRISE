-- Script de création de la table operation_bancaire
-- Cette table stocke les opérations bancaires créées automatiquement 
-- lors de la création d'opérations de type Compense_client, Appro_client ou nivellement

CREATE TABLE IF NOT EXISTS operation_bancaire (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    pays VARCHAR(100) NOT NULL,
    code_pays VARCHAR(10),
    mois VARCHAR(50),
    date_operation DATETIME NOT NULL,
    agence VARCHAR(100) NOT NULL,
    type_operation VARCHAR(100) NOT NULL,
    nom_beneficiaire VARCHAR(255),
    compte_a_debiter VARCHAR(100),
    montant DOUBLE NOT NULL,
    mode_paiement VARCHAR(100),
    reference VARCHAR(100),
    id_glpi VARCHAR(100),
    bo VARCHAR(100),
    statut VARCHAR(50) NOT NULL DEFAULT 'En attente',
    operation_id BIGINT,
    
    -- Index pour améliorer les performances de recherche
    INDEX idx_pays (pays),
    INDEX idx_agence (agence),
    INDEX idx_type_operation (type_operation),
    INDEX idx_statut (statut),
    INDEX idx_date_operation (date_operation),
    INDEX idx_reference (reference),
    INDEX idx_operation_id (operation_id),
    
    -- Contrainte de clé étrangère vers la table operation
    FOREIGN KEY (operation_id) REFERENCES operation(id) ON DELETE SET NULL
);

-- Commentaires sur les colonnes
COMMENT ON TABLE operation_bancaire IS 'Table des opérations bancaires créées automatiquement lors de la création d''opérations de type Compense_client, Appro_client ou nivellement';
COMMENT ON COLUMN operation_bancaire.id IS 'Identifiant unique de l''opération bancaire';
COMMENT ON COLUMN operation_bancaire.pays IS 'Pays de l''opération bancaire';
COMMENT ON COLUMN operation_bancaire.code_pays IS 'Code pays (CI, ML, BF, SN, TG, CM, etc.)';
COMMENT ON COLUMN operation_bancaire.mois IS 'Mois de l''opération au format "Mois Année" (ex: Janvier 2024)';
COMMENT ON COLUMN operation_bancaire.date_operation IS 'Date de l''opération bancaire';
COMMENT ON COLUMN operation_bancaire.agence IS 'Agence (code propriétaire du compte)';
COMMENT ON COLUMN operation_bancaire.type_operation IS 'Type d''opération bancaire (Compensation Client, Approvisionnement, Nivellement, etc.)';
COMMENT ON COLUMN operation_bancaire.nom_beneficiaire IS 'Nom du bénéficiaire (à compléter manuellement)';
COMMENT ON COLUMN operation_bancaire.compte_a_debiter IS 'Compte à débiter (à compléter manuellement)';
COMMENT ON COLUMN operation_bancaire.montant IS 'Montant de l''opération';
COMMENT ON COLUMN operation_bancaire.mode_paiement IS 'Mode de paiement (Virement, Chèque, Espèces, etc.) (à compléter manuellement)';
COMMENT ON COLUMN operation_bancaire.reference IS 'Référence de l''opération';
COMMENT ON COLUMN operation_bancaire.id_glpi IS 'Identifiant GLPI (à compléter manuellement)';
COMMENT ON COLUMN operation_bancaire.bo IS 'Back Office / Banque';
COMMENT ON COLUMN operation_bancaire.statut IS 'Statut de l''opération bancaire (En attente, Validée, Rejetée, etc.)';
COMMENT ON COLUMN operation_bancaire.operation_id IS 'Identifiant de l''opération d''origine ayant déclenché la création de cette opération bancaire';

