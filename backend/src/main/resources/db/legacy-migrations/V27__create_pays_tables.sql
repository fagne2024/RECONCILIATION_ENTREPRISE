-- Script de création des tables pour le cloisonnement par pays
-- Migration Flyway V27

-- Table des pays
CREATE TABLE IF NOT EXISTS pays (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    code VARCHAR(10) NOT NULL UNIQUE,
    nom VARCHAR(100) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Table de liaison profil-pays
CREATE TABLE IF NOT EXISTS profil_pays (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    profil_id BIGINT NOT NULL,
    pays_id BIGINT NOT NULL,
    UNIQUE KEY unique_profil_pays (profil_id, pays_id),
    FOREIGN KEY (profil_id) REFERENCES profil(id) ON DELETE CASCADE,
    FOREIGN KEY (pays_id) REFERENCES pays(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Index pour améliorer les performances
CREATE INDEX idx_profil_pays_profil_id ON profil_pays(profil_id);
CREATE INDEX idx_profil_pays_pays_id ON profil_pays(pays_id);
CREATE INDEX idx_pays_code ON pays(code);

