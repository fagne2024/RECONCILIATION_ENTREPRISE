-- Exemple d'initialisation automatique des actions standards pour chaque menu

-- Comptes : Créer, Modifier, Supprimer, Consulter
INSERT INTO module_permission (module_id, permission_id)
SELECT m.id, p.id FROM module m, permission p
WHERE m.nom = 'Comptes' AND p.nom IN ('Créer', 'Modifier', 'Supprimer', 'Consulter');

-- Opérations : Créer, Valider, Annuler, Consulter
INSERT INTO module_permission (module_id, permission_id)
SELECT m.id, p.id FROM module m, permission p
WHERE m.nom = 'Opérations' AND p.nom IN ('Créer', 'Valider', 'Annuler', 'Consulter');

-- Frais : Consulter, Exporter
INSERT INTO module_permission (module_id, permission_id)
SELECT m.id, p.id FROM module m, permission p
WHERE m.nom = 'Frais' AND p.nom IN ('Consulter', 'Exporter');

-- Dashboard : Consulter
INSERT INTO module_permission (module_id, permission_id)
SELECT m.id, p.id FROM module m, permission p
WHERE m.nom = 'Dashboard' AND p.nom = 'Consulter';

-- Ajoutez d'autres menus/actions selon vos besoins... 