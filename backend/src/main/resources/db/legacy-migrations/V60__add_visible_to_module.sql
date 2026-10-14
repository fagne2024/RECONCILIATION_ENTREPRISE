-- Ajout de la colonne visible sur la table module
ALTER TABLE `module` ADD COLUMN `visible` BOOLEAN NOT NULL DEFAULT TRUE AFTER `nom`;

-- Les lignes existantes sont visibles par défaut
UPDATE `module` SET `visible` = TRUE WHERE `visible` IS NULL;

-- Garantir la valeur par défaut pour les futures insertions
ALTER TABLE `module` MODIFY COLUMN `visible` BOOLEAN NOT NULL DEFAULT TRUE;

CREATE INDEX idx_module_visible ON `module`(`visible`);