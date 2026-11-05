package com.reconciliation.config;

import com.reconciliation.repository.UserRepository;
import com.reconciliation.service.EmailService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.core.annotation.Order;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;

/**
 * Initialisation idempotente du compte plateforme SUPER_ADMIN.
 *
 * Le SUPER_ADMIN est le seul compte sans entreprise ({@code entreprise_id = NULL}) :
 * il administre la plateforme (entreprises, modules) mais n'a AUCUN acces aux
 * donnees metier (decision 9).
 *
 * Comportement au premier demarrage :
 * <ul>
 *   <li>{@code SUPER_ADMIN_USERNAME} (defaut : {@code superadmin})</li>
 *   <li>{@code SUPER_ADMIN_PASSWORD} (defaut : {@code passer123}) — mot de passe
 *       provisoire, le changement est OBLIGATOIRE a la premiere connexion.</li>
 *   <li>{@code SUPER_ADMIN_EMAIL} (optionnel) : si configure et que le SMTP repond,
 *       un email d'information est envoye (best-effort, jamais bloquant).</li>
 * </ul>
 *
 * Le compte n'est cree qu'une seule fois (idempotence) : un compte plateforme
 * existant n'est jamais modifie. Le mot de passe n'est jamais journalise.
 */
@Component
@Order(50)
public class SuperAdminInitializer implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(SuperAdminInitializer.class);

    private final UserRepository userRepository;
    private final JdbcTemplate jdbcTemplate;
    private final PasswordEncoder passwordEncoder;
    private final EmailService emailService;

    @Value("${app.super-admin.username:superadmin}")
    private String superAdminUsername;

    @Value("${app.super-admin.password:passer123}")
    private String superAdminPassword;

    @Value("${app.super-admin.email:}")
    private String superAdminEmail;

    public SuperAdminInitializer(UserRepository userRepository,
                                 JdbcTemplate jdbcTemplate,
                                 PasswordEncoder passwordEncoder,
                                 EmailService emailService) {
        this.userRepository = userRepository;
        this.jdbcTemplate = jdbcTemplate;
        this.passwordEncoder = passwordEncoder;
        this.emailService = emailService;
    }

    @Override
    public void run(ApplicationArguments args) {
        if (superAdminUsername == null || superAdminUsername.isBlank()) {
            log.warn("SUPER_ADMIN_USERNAME vide : initialisation du compte plateforme ignoree.");
            return;
        }
        if (superAdminPassword == null || superAdminPassword.isBlank()) {
            log.info("SUPER_ADMIN_PASSWORD absent : initialisation du compte plateforme ignoree.");
            return;
        }

        String username = superAdminUsername.trim();

        try {
            // Idempotence : ne jamais modifier un compte plateforme existant.
            if (userRepository.findByUsername(username).isPresent()) {
                log.info("Compte SUPER_ADMIN '{}' deja present : aucune action.", username);
                return;
            }
            if (userRepository.findFirstByEntrepriseIdIsNull().isPresent()) {
                log.info("Un compte plateforme (entreprise_id NULL) existe deja : aucune action.");
                return;
            }

            String email = (superAdminEmail == null || superAdminEmail.isBlank()) ? null : superAdminEmail.trim();
            String encodedPassword = passwordEncoder.encode(superAdminPassword.trim());

            jdbcTemplate.update(
                "INSERT INTO `user` "
                    + "(`username`, `password`, `email`, `profil_id`, `enabled`, `password_change_required`, "
                    + " `failed_login_attempts`, `enabled_2fa`, `secret_2fa`, `qr_code_scanned`, "
                    + " `account_locked_until`, `entreprise_id`) "
                    + "VALUES (?, ?, ?, NULL, 1, 1, 0, 0, NULL, 0, NULL, NULL)",
                username, encodedPassword, email);

            log.info("Compte SUPER_ADMIN '{}' cree (mot de passe provisoire, changement OBLIGATOIRE "
                + "a la premiere connexion).", username);

            // Email d'information : best-effort, jamais bloquant (le mot de passe par defaut
            // est connu de l'operateur — aucun risque de compte inaccessible).
            if (email != null) {
                try {
                    emailService.sendPasswordEmail(email, username, superAdminPassword.trim());
                    log.info("Email d'information envoye a '{}'.", email);
                } catch (Exception e) {
                    log.warn("Email d'information non envoye a '{}' (SMTP non configure ou inaccessible) : {}",
                        email, e.getMessage());
                }
            }
        } catch (Exception e) {
            // Ne jamais empecher le demarrage pour ce compte optionnel.
            log.error("Echec de l'initialisation du SUPER_ADMIN '{}' : {}", username, e.getMessage());
        }
    }
}
