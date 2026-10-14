-- Migration pour insérer des utilisateurs de test
-- Cette migration s'assure qu'il y a des utilisateurs disponibles pour les tests

-- Créer un profil 'Default' s'il n'existe pas
INSERT INTO profil (nom)
SELECT 'Default' WHERE NOT EXISTS (SELECT 1 FROM profil WHERE nom = 'Default');

-- Créer un profil 'Admin' s'il n'existe pas
INSERT INTO profil (nom)
SELECT 'Admin' WHERE NOT EXISTS (SELECT 1 FROM profil WHERE nom = 'Admin');

-- Récupérer les IDs des profils
SET @default_profil_id = (SELECT id FROM profil WHERE nom = 'Default' LIMIT 1);
SET @admin_profil_id = (SELECT id FROM profil WHERE nom = 'Admin' LIMIT 1);

-- Insérer l'utilisateur admin s'il n'existe pas
INSERT INTO user (username, password, profil_id)
SELECT 'admin', 'admin', @admin_profil_id
WHERE NOT EXISTS (SELECT 1 FROM user WHERE username = 'admin');

-- Insérer l'utilisateur yamar.ndao s'il n'existe pas
INSERT INTO user (username, password, profil_id)
SELECT 'yamar.ndao', 'yamar', @default_profil_id
WHERE NOT EXISTS (SELECT 1 FROM user WHERE username = 'yamar.ndao');

-- Insérer des utilisateurs de test supplémentaires
INSERT INTO user (username, password, profil_id)
SELECT 'test.user1', 'password123', @default_profil_id
WHERE NOT EXISTS (SELECT 1 FROM user WHERE username = 'test.user1');

INSERT INTO user (username, password, profil_id)
SELECT 'test.user2', 'password123', @default_profil_id
WHERE NOT EXISTS (SELECT 1 FROM user WHERE username = 'test.user2');

INSERT INTO user (username, password, profil_id)
SELECT 'demo.user', 'demo123', @default_profil_id
WHERE NOT EXISTS (SELECT 1 FROM user WHERE username = 'demo.user');

-- Vérification : afficher le nombre d'utilisateurs créés
-- SELECT COUNT(*) as total_users FROM user; 