-- Migration pour ajouter la colonne username à la table suivi_ecart
-- Cette migration vérifie si la colonne existe avant de l'ajouter pour éviter les erreurs
SET @column_exists = (
    SELECT COUNT(*) 
    FROM INFORMATION_SCHEMA.COLUMNS 
    WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'suivi_ecart' 
    AND COLUMN_NAME = 'username'
);

SET @sql = IF(@column_exists = 0,
    'ALTER TABLE suivi_ecart ADD COLUMN username VARCHAR(255) NULL AFTER traitement',
    'SELECT "La colonne username existe déjà" AS message'
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

