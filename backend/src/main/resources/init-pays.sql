-- Script SQL pour créer les tables et initialiser les pays
-- À exécuter directement dans MySQL
-- Les tables seront créées automatiquement par Hibernate, mais ce script peut être utilisé pour initialiser les données

-- Note: Les tables 'pays' et 'profil_pays' seront créées automatiquement par Hibernate
-- au démarrage de l'application grâce aux entités JPA PaysEntity et ProfilPaysEntity

-- Initialiser les pays (INSERT IGNORE pour éviter les doublons)
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

