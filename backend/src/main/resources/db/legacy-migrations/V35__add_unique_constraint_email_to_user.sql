-- Ajout de la contrainte unique sur l'email dans la table user
-- Note: Cette migration supprime les doublons d'email si présents avant d'ajouter la contrainte

-- Supprimer les doublons d'email (garder uniquement le premier utilisateur avec chaque email)
-- Mettre les emails en double à NULL
UPDATE user u1
INNER JOIN (
    SELECT email, MIN(id) as min_id
    FROM user
    WHERE email IS NOT NULL AND email != ''
    GROUP BY email
    HAVING COUNT(*) > 1
) u2 ON u1.email = u2.email AND u1.id != u2.min_id
SET u1.email = NULL;

-- Ajouter la contrainte unique sur l'email
ALTER TABLE user 
ADD UNIQUE KEY uk_user_email (email);

