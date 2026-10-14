-- Ajout du flag pour indiquer si le QR code a été scanné
ALTER TABLE user 
ADD COLUMN qr_code_scanned BOOLEAN NOT NULL DEFAULT FALSE;

-- Index pour améliorer les performances
CREATE INDEX idx_user_qr_code_scanned ON user(qr_code_scanned);

