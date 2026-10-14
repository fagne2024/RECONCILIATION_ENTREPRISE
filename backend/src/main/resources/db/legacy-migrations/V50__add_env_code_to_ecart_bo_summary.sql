-- Code d'environnement technique (BET, HT, PROD, etc.), distinct de env (BO / PARTENAIRE)
ALTER TABLE ecart_bo_summary ADD COLUMN env_code VARCHAR(32) NULL;
