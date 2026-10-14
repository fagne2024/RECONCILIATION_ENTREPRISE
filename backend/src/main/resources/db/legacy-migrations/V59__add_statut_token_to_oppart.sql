-- Ajout du statut (OK / EN_COURS) et du token de correspondance sur la table oppart
ALTER TABLE oppart ADD COLUMN statut VARCHAR(20) NOT NULL DEFAULT 'EN_COURS' AFTER source;
ALTER TABLE oppart ADD COLUMN token VARCHAR(64) NULL AFTER statut;

-- Les lignes existantes sont "En cours" par défaut
UPDATE oppart SET statut = 'EN_COURS' WHERE statut IS NULL OR statut = '';

-- Garantir la valeur par défaut pour les futures insertions
ALTER TABLE oppart MODIFY COLUMN statut VARCHAR(20) NOT NULL DEFAULT 'EN_COURS';

CREATE INDEX idx_oppart_statut ON oppart(statut);
CREATE INDEX idx_oppart_token ON oppart(token);
