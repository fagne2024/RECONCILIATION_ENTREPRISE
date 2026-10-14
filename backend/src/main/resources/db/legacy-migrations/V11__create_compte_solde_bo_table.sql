CREATE TABLE compte_solde_bo (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    numero_compte VARCHAR(255) NOT NULL,
    date_solde DATE NOT NULL,
    solde_bo DOUBLE NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (numero_compte, date_solde)
); 