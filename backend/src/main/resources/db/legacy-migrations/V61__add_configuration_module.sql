-- Module « Configuration » (page à développer) + permission « Consulter »
INSERT INTO module (nom) SELECT 'Configuration' FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM module WHERE nom = 'Configuration');

INSERT INTO module_permission (module_id, permission_id)
SELECT m.id, p.id
FROM module m, permission p
WHERE m.nom = 'Configuration'
  AND p.nom = 'Consulter'
  AND NOT EXISTS (
    SELECT 1 FROM module_permission mp WHERE mp.module_id = m.id AND mp.permission_id = p.id
  );