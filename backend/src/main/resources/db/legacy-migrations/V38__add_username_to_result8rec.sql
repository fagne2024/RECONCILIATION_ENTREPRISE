-- Migration pour ajouter la colonne username à la table result8rec
-- Cette migration vérifie si la colonne existe avant de l'ajouter pour éviter les erreurs
SET @column_exists = (
    SELECT COUNT(*) 
    FROM INFORMATION_SCHEMA.COLUMNS 
    WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'result8rec' 
    AND COLUMN_NAME = 'username'
);

SET @sql = IF(@column_exists = 0,
    'ALTER TABLE result8rec ADD COLUMN username VARCHAR(255) NULL AFTER traitement',
    'SELECT "La colonne username existe déjà" AS message'
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;









