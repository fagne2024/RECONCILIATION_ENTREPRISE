-- Ajout de l'authentification à deux facteurs (2FA) à la table user
ALTER TABLE user 
ADD COLUMN enabled_2fa BOOLEAN NOT NULL DEFAULT FALSE,
ADD COLUMN secret_2fa VARCHAR(32) NULL;

-- Index pour améliorer les performances
CREATE INDEX idx_user_enabled_2fa ON user(enabled_2fa);

