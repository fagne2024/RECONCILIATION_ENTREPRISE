-- Migration pour ajouter les champs typeCalcul et pourcentage à la table frais_transaction
ALTER TABLE frais_transaction ADD COLUMN type_calcul VARCHAR(20) DEFAULT 'NOMINAL';
ALTER TABLE frais_transaction ADD COLUMN pourcentage DOUBLE PRECISION; 