-- Verrouillage temporaire après échecs de connexion répétés
ALTER TABLE user ADD COLUMN failed_login_attempts INT NOT NULL DEFAULT 0;
ALTER TABLE user ADD COLUMN account_locked_until DATETIME NULL;
