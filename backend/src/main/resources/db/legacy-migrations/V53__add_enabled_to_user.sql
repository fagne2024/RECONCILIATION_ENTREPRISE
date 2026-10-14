-- Ajout du champ enabled à la table user (MySQL)
ALTER TABLE user ADD COLUMN enabled TINYINT(1) NOT NULL DEFAULT 1;

UPDATE user SET enabled = 1 WHERE enabled IS NULL OR enabled = 0;
