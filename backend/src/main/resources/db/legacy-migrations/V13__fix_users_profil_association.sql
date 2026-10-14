-- Migration pour corriger l'association des profils aux utilisateurs
-- Cette migration s'assure que tous les utilisateurs ont un profil associé

-- 1. Créer les profils par défaut s'ils n'existent pas
INSERT INTO profil (nom, description) VALUES 
('ADMINISTRATEUR', 'Profil administrateur avec tous les droits')
ON DUPLICATE KEY UPDATE nom = nom;

INSERT INTO profil (nom, description) VALUES 
('UTILISATEUR', 'Profil utilisateur standard')
ON DUPLICATE KEY UPDATE nom = nom;

INSERT INTO profil (nom, description) VALUES 
('CONSULTANT', 'Profil consultant avec droits de consultation')
ON DUPLICATE KEY UPDATE nom = nom;

-- 2. Récupérer les IDs des profils
SET @admin_profil_id = (SELECT id FROM profil WHERE nom = 'ADMINISTRATEUR' LIMIT 1);
SET @user_profil_id = (SELECT id FROM profil WHERE nom = 'UTILISATEUR' LIMIT 1);
SET @consultant_profil_id = (SELECT id FROM profil WHERE nom = 'CONSULTANT' LIMIT 1);

-- 3. Associer le profil ADMINISTRATEUR à l'utilisateur admin
UPDATE user SET profil_id = @admin_profil_id 
WHERE username = 'admin' AND (profil_id IS NULL OR profil_id != @admin_profil_id);

-- 4. Associer le profil UTILISATEUR aux autres utilisateurs
UPDATE user SET profil_id = @user_profil_id 
WHERE username != 'admin' AND (profil_id IS NULL OR profil_id NOT IN (@admin_profil_id, @user_profil_id, @consultant_profil_id));

-- 5. Vérification : afficher les utilisateurs et leurs profils
-- SELECT u.username, p.nom as profil FROM user u LEFT JOIN profil p ON u.profil_id = p.id; 