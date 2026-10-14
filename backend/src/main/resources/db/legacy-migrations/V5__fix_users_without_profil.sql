-- Créer un profil 'Default' s'il n'existe pas
INSERT INTO profil (nom)
SELECT 'Default' WHERE NOT EXISTS (SELECT 1 FROM profil WHERE nom = 'Default');

-- Récupérer l'id du profil 'Default'
UPDATE user SET profil_id = (SELECT id FROM profil WHERE nom = 'Default') WHERE profil_id IS NULL; 