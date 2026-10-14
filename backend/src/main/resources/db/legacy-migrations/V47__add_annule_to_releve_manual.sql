ALTER TABLE releve_manual
    ADD COLUMN annule_nombre BIGINT DEFAULT 0,
    ADD COLUMN annule_volume DOUBLE DEFAULT 0;
