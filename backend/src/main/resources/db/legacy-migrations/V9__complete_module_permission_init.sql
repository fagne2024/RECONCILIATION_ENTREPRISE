-- Migration complète pour initialiser toutes les permissions pour tous les modules
-- Cette migration s'assure que tous les modules ont accès à toutes les permissions

-- Supprimer les données existantes pour éviter les doublons
DELETE FROM module_permission;

-- Insérer toutes les permissions pour tous les modules
INSERT INTO module_permission (module_id, permission_id)
SELECT m.id, p.id 
FROM module m, permission p
WHERE m.nom IN (
    'Dashboard',
    'Traitement',
    'Réconciliation',
    'Résultats',
    'Statistiques',
    'Classements',
    'Comptes',
    'Opérations',
    'Frais',
    'Utilisateur',
    'Profil',
    'Log utilisateur'
)
AND p.nom IN (
    'Consulter',
    'Créer',
    'Modifier',
    'Supprimer',
    'Valider',
    'Annuler',
    'Exporter'
);

-- Vérification : afficher le nombre d'associations créées
-- SELECT COUNT(*) as total_associations FROM module_permission; 