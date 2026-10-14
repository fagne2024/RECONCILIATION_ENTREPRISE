-- Script d'initialisation des pays
-- Migration Flyway V28

INSERT IGNORE INTO pays (code, nom) VALUES 
('GNL', 'GNL - Tous les pays'),
('CM', 'Cameroun'),
('SN', 'Sénégal'),
('CI', 'Côte d''Ivoire'),
('BF', 'Burkina Faso'),
('ML', 'Mali'),
('BJ', 'Bénin'),
('NE', 'Niger'),
('TD', 'Tchad'),
('TG', 'Togo');

