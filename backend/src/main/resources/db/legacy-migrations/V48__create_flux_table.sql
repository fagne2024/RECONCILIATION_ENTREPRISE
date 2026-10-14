-- Table des flux (Total Mises, Total Gains, Total Bonus, Payin, Payout) pour la redevance
CREATE TABLE IF NOT EXISTS flux (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    agence VARCHAR(255) NOT NULL,
    date_debut DATE NOT NULL,
    date_fin DATE NOT NULL,
    total_mises DOUBLE DEFAULT 0,
    total_gains DOUBLE DEFAULT 0,
    total_bonus DOUBLE DEFAULT 0,
    payin DOUBLE DEFAULT 0,
    payout DOUBLE DEFAULT 0,
    date_creation DATETIME NOT NULL,
    date_modification DATETIME NOT NULL,
    UNIQUE KEY uk_flux_agence_periode (agence, date_debut, date_fin)
);
