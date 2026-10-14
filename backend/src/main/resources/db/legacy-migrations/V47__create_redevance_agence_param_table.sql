-- Table des paramètres redevance par agence (retenue sur gains, taxe jeux hasard)
CREATE TABLE IF NOT EXISTS redevance_agence_param (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    agence VARCHAR(255) NOT NULL,
    retenue_sur_gains_pourcentage DOUBLE DEFAULT 15.0,
    retenue_sur_gains_seuil DOUBLE DEFAULT 500000.0,
    taxe_jeux_hasard_pourcentage DOUBLE DEFAULT 5.0,
    taux_redevance_pourcentage DOUBLE DEFAULT 50.0,
    date_creation DATETIME NOT NULL,
    date_modification DATETIME NOT NULL,
    UNIQUE(agence)
);
