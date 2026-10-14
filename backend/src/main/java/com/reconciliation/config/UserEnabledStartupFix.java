package com.reconciliation.config;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * Corrige les comptes utilisateurs désactivés par erreur lors de l'ajout
 * de la colonne {@code enabled} (valeur 0 appliquée aux lignes existantes).
 * Ne réactive que si tous les comptes sont désactivés.
 */
@Component
public class UserEnabledStartupFix implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(UserEnabledStartupFix.class);

    private final JdbcTemplate jdbcTemplate;

    public UserEnabledStartupFix(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    @Override
    public void run(ApplicationArguments args) {
        try {
            Integer total = jdbcTemplate.queryForObject("SELECT COUNT(*) FROM user", Integer.class);
            if (total == null || total == 0) {
                return;
            }

            Integer inactive = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM user WHERE enabled IS NULL OR enabled = 0",
                Integer.class
            );

            if (inactive != null && inactive.equals(total)) {
                int updated = jdbcTemplate.update("UPDATE user SET enabled = 1");
                log.warn("Correction appliquée : {} utilisateur(s) réactivé(s) (tous étaient désactivés par erreur)", updated);
            }
        } catch (Exception e) {
            log.debug("Vérification colonne enabled ignorée : {}", e.getMessage());
        }
    }
}
