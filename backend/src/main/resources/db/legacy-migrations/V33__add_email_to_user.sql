-- Ajout du champ email à la table user
ALTER TABLE user 
ADD COLUMN email VARCHAR(255) NULL;

-- Index pour améliorer les performances de recherche par email
CREATE INDEX idx_user_email ON user(email);

