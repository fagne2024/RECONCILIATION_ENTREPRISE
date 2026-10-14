ALTER TABLE user ADD COLUMN profil_id BIGINT;
ALTER TABLE user ADD CONSTRAINT fk_user_profil FOREIGN KEY (profil_id) REFERENCES profil(id); 