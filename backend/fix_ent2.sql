-- Réparation ENT2 (id=2) : entreprise créée hors écran plateforme, sans profil.
-- 1) Créer le profil ADMINISTRATEUR de l'entreprise 2 (idempotent).
INSERT INTO profil (entreprise_id, nom, description)
SELECT 2, 'ADMINISTRATEUR', 'Profil administrateur de l''entreprise Entreprise 2'
WHERE NOT EXISTS (SELECT 1 FROM profil WHERE entreprise_id = 2 AND nom = 'ADMINISTRATEUR');

-- 2) Accorder tous les droits (copie du catalogue global module_permission), si aucun droit.
INSERT INTO profil_permission (entreprise_id, profil_id, module_id, permission_id)
SELECT 2, p.id, mp.module_id, mp.permission_id
FROM profil p, module_permission mp
WHERE p.entreprise_id = 2 AND p.nom = 'ADMINISTRATEUR'
  AND NOT EXISTS (SELECT 1 FROM profil_permission pp WHERE pp.profil_id = p.id);

-- 3) Rattacher le compte ent2user (id=9) au profil administrateur de l'entreprise 2.
UPDATE `user`
SET profil_id = (SELECT id FROM profil WHERE entreprise_id = 2 AND nom = 'ADMINISTRATEUR' LIMIT 1)
WHERE id = 9;

-- Vérification
SELECT u.id, u.username, u.profil_id, p.nom AS profil_nom, u.entreprise_id
FROM `user` u LEFT JOIN profil p ON p.id = u.profil_id
WHERE u.entreprise_id = 2;
SELECT COUNT(*) AS droits_ent2 FROM profil_permission pp
JOIN profil p ON p.id = pp.profil_id
WHERE p.entreprise_id = 2 AND p.nom = 'ADMINISTRATEUR';
