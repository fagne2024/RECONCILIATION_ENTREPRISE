-- Script de création des tables pour le cloisonnement par pays
-- À exécuter une fois pour créer les tables nécessaires

-- Table des pays
CREATE TABLE IF NOT EXISTS pays (
    id BIGSERIAL PRIMARY KEY,
    code VARCHAR(10) NOT NULL UNIQUE,
    nom VARCHAR(100) NOT NULL
);

-- Table de liaison profil-pays
CREATE TABLE IF NOT EXISTS profil_pays (
    id BIGSERIAL PRIMARY KEY,
    profil_id BIGINT NOT NULL,
    pays_id BIGINT NOT NULL,
    UNIQUE(profil_id, pays_id),
    FOREIGN KEY (profil_id) REFERENCES profil(id) ON DELETE CASCADE,
    FOREIGN KEY (pays_id) REFERENCES pays(id) ON DELETE CASCADE
);

-- Index pour améliorer les performances
CREATE INDEX IF NOT EXISTS idx_profil_pays_profil_id ON profil_pays(profil_id);
CREATE INDEX IF NOT EXISTS idx_profil_pays_pays_id ON profil_pays(pays_id);
CREATE INDEX IF NOT EXISTS idx_pays_code ON pays(code);

