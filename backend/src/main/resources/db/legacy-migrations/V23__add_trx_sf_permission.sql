-- Ajouter la permission TRX SF
INSERT INTO permission (nom, description) VALUES ('TRX SF', 'Gestion des transactions SF');

-- Récupérer l'ID de la permission TRX SF
SET @trx_sf_permission_id = (SELECT id FROM permission WHERE nom = 'TRX SF');

-- Ajouter la permission TRX SF au module "Suivi des écarts"
INSERT INTO module_permission (module_id, permission_id) 
SELECT m.id, @trx_sf_permission_id
FROM module m 
WHERE m.nom = 'Suivi des écarts';

-- Ajouter la permission TRX SF au profil administrateur
INSERT INTO profil_permission (profil_id, permission_id)
SELECT p.id, @trx_sf_permission_id
FROM profil p 
WHERE p.nom = 'ADMIN';
