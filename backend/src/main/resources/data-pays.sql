-- Script d'initialisation des pays
-- À exécuter une fois pour créer les pays de base dans la base de données

INSERT INTO pays (code, nom) VALUES 
('GNL', 'GNL - Tous les pays'),
('CM', 'Cameroun'),
('SN', 'Sénégal'),
('CI', 'Côte d''Ivoire'),
('BF', 'Burkina Faso'),
('ML', 'Mali'),
('BJ', 'Bénin'),
('NE', 'Niger'),
('TD', 'Tchad'),
('TG', 'Togo')
ON CONFLICT DO NOTHING;

