package com.reconciliation.util;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.CommandLineRunner;
import org.springframework.context.annotation.Profile;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

@Component
@Profile("legacy-schema-repair")
public class DatabaseMigration implements CommandLineRunner {

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Override
    public void run(String... args) throws Exception {
        // Migration pour ajouter la colonne commentaire à releve_bancaire (MySQL)
        try {
            String checkColumnQuery = "SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS " +
                    "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'releve_bancaire' AND COLUMN_NAME = 'commentaire'";

            Integer countCommentaire = jdbcTemplate.queryForObject(checkColumnQuery, Integer.class);

            if (countCommentaire == null || countCommentaire == 0) {
                System.out.println("🔄 Ajout de la colonne commentaire à la table releve_bancaire...");

                String alterTableQuery = "ALTER TABLE releve_bancaire ADD COLUMN commentaire VARCHAR(1000) NULL";
                jdbcTemplate.execute(alterTableQuery);

                System.out.println("✅ Colonne commentaire ajoutée avec succès!");
            } else {
                System.out.println("✅ Colonne commentaire déjà présente dans la table releve_bancaire");
            }

        } catch (Exception e) {
            System.err.println("❌ Erreur lors de l'ajout de la colonne commentaire: " + e.getMessage());
        }
        // Migration pour ajouter la colonne traitement à result8rec (MySQL)
        try {
            String checkTraitementQuery = "SELECT COUNT(*) as count FROM INFORMATION_SCHEMA.COLUMNS " +
                    "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'result8rec' AND COLUMN_NAME = 'traitement'";
            
            Integer count = jdbcTemplate.queryForObject(checkTraitementQuery, Integer.class);
            
            if (count == null || count == 0) {
                System.out.println("🔄 Ajout de la colonne traitement à la table result8rec...");
                
                // Ajouter la colonne traitement après comment
                String alterTableQuery = "ALTER TABLE result8rec ADD COLUMN traitement VARCHAR(255) NULL AFTER comment";
                jdbcTemplate.execute(alterTableQuery);
                
                System.out.println("✅ Colonne traitement ajoutée avec succès à la table result8rec!");
            } else {
                System.out.println("✅ Colonne traitement déjà présente dans la table result8rec");
            }
            
        } catch (Exception e) {
            System.err.println("❌ Erreur lors de l'ajout de la colonne traitement: " + e.getMessage());
            e.printStackTrace();
        }

        // Migration pour ajouter la colonne env à result8rec (MySQL)
        try {
            String checkEnvQuery = "SELECT COUNT(*) as count FROM INFORMATION_SCHEMA.COLUMNS " +
                    "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'result8rec' AND COLUMN_NAME = 'env'";

            Integer countEnv = jdbcTemplate.queryForObject(checkEnvQuery, Integer.class);

            if (countEnv == null || countEnv == 0) {
                System.out.println("🔄 Ajout de la colonne env à la table result8rec...");

                String alterTableEnvQuery = "ALTER TABLE result8rec ADD COLUMN env VARCHAR(50) NULL AFTER country";
                jdbcTemplate.execute(alterTableEnvQuery);

                System.out.println("✅ Colonne env ajoutée avec succès à la table result8rec!");
            } else {
                System.out.println("✅ Colonne env déjà présente dans la table result8rec");
            }

        } catch (Exception e) {
            System.err.println("❌ Erreur lors de l'ajout de la colonne env: " + e.getMessage());
            e.printStackTrace();
        }
        
        // Migration pour ajouter la colonne traitement à operation_bancaire (MySQL)
        try {
            String checkTraitementOpQuery = "SELECT COUNT(*) as count FROM INFORMATION_SCHEMA.COLUMNS " +
                    "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'operation_bancaire' AND COLUMN_NAME = 'traitement'";
            
            Integer countOp = jdbcTemplate.queryForObject(checkTraitementOpQuery, Integer.class);
            
            if (countOp == null || countOp == 0) {
                System.out.println("🔄 Ajout de la colonne traitement à la table operation_bancaire...");
                
                // Ajouter la colonne traitement après statut
                String alterTableOpQuery = "ALTER TABLE operation_bancaire ADD COLUMN traitement VARCHAR(255) NULL AFTER statut";
                jdbcTemplate.execute(alterTableOpQuery);
                
                System.out.println("✅ Colonne traitement ajoutée avec succès à la table operation_bancaire!");
            } else {
                System.out.println("✅ Colonne traitement déjà présente dans la table operation_bancaire");
            }
            
        } catch (Exception e) {
            System.err.println("❌ Erreur lors de l'ajout de la colonne traitement à operation_bancaire: " + e.getMessage());
            e.printStackTrace();
        }

        try {
            String checkTableQuery = "SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES " +
                "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'reco_j1_blocking_comment'";
            Integer tableCount = jdbcTemplate.queryForObject(checkTableQuery, Integer.class);
            if (tableCount == null || tableCount == 0) {
                System.out.println("🔄 Création de la table reco_j1_blocking_comment...");
                jdbcTemplate.execute(
                    "CREATE TABLE reco_j1_blocking_comment (" +
                    "id BIGINT AUTO_INCREMENT PRIMARY KEY, " +
                    "reco_date VARCHAR(10) NOT NULL, " +
                    "service VARCHAR(255) NOT NULL, " +
                    "country VARCHAR(128) NOT NULL, " +
                    "env VARCHAR(32) NOT NULL, " +
                    "comment_text TEXT NOT NULL, " +
                    "updated_by VARCHAR(128) NULL, " +
                    "updated_at DATETIME NULL, " +
                    "UNIQUE KEY uk_reco_j1_blocking_scope (reco_date, service, country, env)" +
                    ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4"
                );
                System.out.println("✅ Table reco_j1_blocking_comment créée.");
            } else {
                System.out.println("✅ Table reco_j1_blocking_comment déjà présente");
            }
        } catch (Exception e) {
            System.err.println("❌ Erreur création reco_j1_blocking_comment: " + e.getMessage());
        }

        // Module « Configuration » (page à développer) + permission Consulter
        try {
            Integer configurationCount = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM module WHERE nom = 'Configuration'", Integer.class);
            if (configurationCount == null || configurationCount == 0) {
                System.out.println("🔄 Création du module Configuration...");
                jdbcTemplate.execute("INSERT INTO module (nom, visible) VALUES ('Configuration', 1)");
                System.out.println("✅ Module Configuration créé avec succès !");
            } else {
                System.out.println("✅ Module Configuration déjà présent");
            }

            Integer configurationPermissionCount = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM module m, permission p " +
                "WHERE m.nom = 'Configuration' AND p.nom = 'Consulter' " +
                "AND NOT EXISTS (SELECT 1 FROM module_permission mp " +
                "WHERE mp.module_id = m.id AND mp.permission_id = p.id)", Integer.class);
            if (configurationPermissionCount != null && configurationPermissionCount > 0) {
                jdbcTemplate.execute(
                    "INSERT INTO module_permission (module_id, permission_id) " +
                    "SELECT m.id, p.id FROM module m, permission p " +
                    "WHERE m.nom = 'Configuration' AND p.nom = 'Consulter'");
                System.out.println("✅ Permission Consulter ajoutée au module Configuration");
            }
        } catch (Exception e) {
            System.err.println("❌ Erreur lors de la création du module Configuration: " + e.getMessage());
        }

        // Modules du catalogue de navigation absents de la table module :
        // les créer pour qu'ils soient désactivables depuis la page Modules
        // (sinon aucun cache de visibilité → toujours visibles dans la sidebar).
        String[] navigationModules = {
            "Comptabilité", "Commission", "Charge", "TSOP", "Impact OP",
            "OPPART", "TRX SF", "BANQUE", "Modèles", "NiveauValidationReco",
            "Sécurité", "Module", "Permission"
        };
        for (String moduleName : navigationModules) {
            try {
                Integer count = jdbcTemplate.queryForObject(
                    "SELECT COUNT(*) FROM module WHERE nom = ?", Integer.class, moduleName);
                if (count == null || count == 0) {
                    jdbcTemplate.update("INSERT INTO module (nom, visible) VALUES (?, 1)", moduleName);
                    System.out.println("✅ Module " + moduleName + " créé automatiquement");
                }

                jdbcTemplate.update(
                    "INSERT INTO module_permission (module_id, permission_id) " +
                    "SELECT m.id, p.id FROM module m, permission p " +
                    "WHERE m.nom = ? AND p.nom = 'Consulter' " +
                    "AND NOT EXISTS (SELECT 1 FROM module_permission mp " +
                    "WHERE mp.module_id = m.id AND mp.permission_id = p.id)",
                    moduleName);
            } catch (Exception e) {
                System.err.println("❌ Erreur lors de la création du module " + moduleName + ": " + e.getMessage());
            }
        }

        // Multi-entreprises : rattrapage du catalogue pour l'entreprise historique
        // (id = 1). La requete n'insere une ligne que pour un module qui n'en a
        // AUCUNE pour l'entreprise 1 : une desactivation explicite (etape 5,
        // `entreprise_module.actif = false`) est donc preservee, car la ligne
        // existe deja. Les nouvelles entreprises ne sont PAS concernees (leur
        // activation releve du SUPER_ADMIN via /api/platform).
        try {
            int activated = jdbcTemplate.update(
                "INSERT INTO entreprise_module (entreprise_id, module_id, actif) " +
                "SELECT 1, m.id, b'1' FROM module m " +
                "WHERE NOT EXISTS (SELECT 1 FROM entreprise_module em " +
                "WHERE em.entreprise_id = 1 AND em.module_id = m.id)");
            if (activated > 0) {
                System.out.println("✅ " + activated + " module(s) activé(s) pour l'entreprise historique (id=1)");
            }
        } catch (Exception e) {
            System.err.println("❌ Erreur activation des modules pour l'entreprise historique: " + e.getMessage());
        }
    }
}
