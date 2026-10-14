-- =====================================================
-- Script SQL complet pour initialiser les pays
-- À exécuter dans MySQL
-- =====================================================

-- 1. Créer la table pays si elle n'existe pas
CREATE TABLE IF NOT EXISTS pays (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    code VARCHAR(10) NOT NULL UNIQUE,
    nom VARCHAR(100) NOT NULL,
    INDEX idx_pays_code (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. Créer la table profil_pays si elle n'existe pas
CREATE TABLE IF NOT EXISTS profil_pays (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    profil_id BIGINT NOT NULL,
    pays_id BIGINT NOT NULL,
    UNIQUE KEY unique_profil_pays (profil_id, pays_id),
    FOREIGN KEY (profil_id) REFERENCES profil(id) ON DELETE CASCADE,
    FOREIGN KEY (pays_id) REFERENCES pays(id) ON DELETE CASCADE,
    INDEX idx_profil_pays_profil_id (profil_id),
    INDEX idx_profil_pays_pays_id (pays_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. Initialiser les pays (INSERT IGNORE pour éviter les doublons)
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

-- Vérification : Afficher les pays créés
SELECT * FROM pays ORDER BY code;

