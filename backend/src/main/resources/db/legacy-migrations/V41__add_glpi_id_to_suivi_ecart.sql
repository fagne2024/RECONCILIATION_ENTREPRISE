-- Migration pour ajouter la colonne glpi_id à la table suivi_ecart
-- Cette migration vérifie si la colonne existe avant de l'ajouter pour éviter les erreurs
SET @column_exists = (
    SELECT COUNT(*) 
    FROM INFORMATION_SCHEMA.COLUMNS 
    WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'suivi_ecart' 
    AND COLUMN_NAME = 'glpi_id'
);

SET @sql = IF(@column_exists = 0,
    'ALTER TABLE suivi_ecart ADD COLUMN glpi_id VARCHAR(255) NULL AFTER username',
    'SELECT "La colonne glpi_id existe déjà" AS message'
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

