-- Réactivation de tous les comptes utilisateurs (correction migration enabled)
UPDATE user SET enabled = 1 WHERE enabled IS NULL OR enabled = 0;
