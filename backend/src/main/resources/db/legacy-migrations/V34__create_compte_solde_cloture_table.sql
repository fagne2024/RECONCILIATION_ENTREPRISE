CREATE TABLE compte_solde_cloture (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    numero_compte VARCHAR(255) NOT NULL,
    date_solde DATE NOT NULL,
    solde_cloture DOUBLE NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE (numero_compte, date_solde)
);

