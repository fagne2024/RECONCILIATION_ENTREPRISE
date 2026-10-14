package com.reconciliation.service;

import com.reconciliation.exception.DuplicateResourceException;
import jakarta.persistence.EntityManager;
import jakarta.persistence.EntityNotFoundException;
import jakarta.persistence.PersistenceContext;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.security.SecureRandom;
import java.util.ArrayList;
import java.util.List;
import java.util.regex.Pattern;

/**
 * Administration (plateforme SUPER_ADMIN) des comptes rattaches aux entreprises.
 *
 * <p>Couverture : TOUS les comptes dont {@code entreprise_id} est non null
 * (compte ADMINISTRATEUR provisionne a la creation de l'entreprise + comptes
 * crees ensuite par l'admin de l'entreprise). Les comptes plateforme
 * (SUPER_ADMIN, {@code entreprise_id = NULL}) sont exclus de la liste et
 * proteges de toute operation.</p>
 *
 * <p>Operations : modification (identifiant / email / activation), suppression
 * (avec garde : jamais le dernier administrateur de l'entreprise), initialisation
 * du mot de passe (generation + envoi email) et reinitialisation du 2FA
 * (desactivation + effacement de la cle secrete). Chaque action est tracee dans
 * {@code platform_audit_log} dans la meme transaction.</p>
 *
 * <p>Comme {@link PlatformEntrepriseService}, les donnees sont lues et ecrites en
 * SQL natif : le profil est {@code @TenantId} et ne serait pas chargeable via JPA
 * dans le contexte plateforme (tenant sentinel {@code -1}), un chargement EAGER
 * echouerait.</p>
 */
@Service
public class PlatformAccountService {

    private static final Logger log = LoggerFactory.getLogger(PlatformAccountService.class);

    private static final Pattern EMAIL_PATTERN = Pattern.compile("^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$");
    private static final String PASSWORD_CHARS =
        "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*";
    private static final String[] ADMIN_PROFILS = {"ADMIN", "ADMINISTRATEUR"};

    private final PlatformAuditService platformAuditService;
    private final PasswordEncoder passwordEncoder;
    private final SecureRandom random = new SecureRandom();

    @PersistenceContext
    private EntityManager em;

    public PlatformAccountService(PlatformAuditService platformAuditService,
                                  PasswordEncoder passwordEncoder) {
        this.platformAuditService = platformAuditService;
        this.passwordEncoder = passwordEncoder;
    }

    // ------------------------------------------------------------------
    // Lecture
    // ------------------------------------------------------------------

    /**
     * Tous les comptes des entreprises, ranges par code d'entreprise puis
     * identifiant. Jointure native sur {@code entreprise} et {@code profil}.
     */
    @Transactional(readOnly = true)
    @SuppressWarnings("unchecked")
    public List<AccountRow> list() {
        List<Object[]> rows = em.createNativeQuery(
                "SELECT u.id, u.username, u.email, u.enabled, u.enabled_2fa, p.nom, "
                    + "e.id, e.code, e.nom "
                    + "FROM `user` u "
                    + "JOIN entreprise e ON e.id = u.entreprise_id "
                    + "LEFT JOIN profil p ON p.id = u.profil_id "
                    + "WHERE u.entreprise_id IS NOT NULL "
                    + "ORDER BY e.code, u.username")
            .getResultList();
        List<AccountRow> result = new ArrayList<>(rows.size());
        for (Object[] row : rows) {
            result.add(new AccountRow(
                asLong(row[0]),
                asString(row[1]),
                asString(row[2]),
                asBoolean(row[3]),
                asBoolean(row[4]),
                asString(row[5]),
                asLong(row[6]),
                asString(row[7]),
                asString(row[8])));
        }
        return result;
    }

    // ------------------------------------------------------------------
    // Modification
    // ------------------------------------------------------------------

    /**
     * Modifie identifiant / email / activation d'un compte d'entreprise.
     * Recherche des doublons sur identifiant et email ; ceux-ci sont uniques
     * globalement (toutes entreprises / plateforme confondues).
     */
    @Transactional
    public void update(Long id, String username, String email, Boolean enabled, String actorUsername) {
        AccountState account = requireEnterpriseAccount(id);

        String newUsername = requireText(username, "Le nom d'utilisateur est requis.");
        if (newUsername.length() > 255) {
            throw new IllegalArgumentException("Le nom d'utilisateur est trop long (255 caracteres max).");
        }
        if (!newUsername.equals(account.username()) && countByUsername(newUsername) > 0) {
            throw new DuplicateResourceException("Le nom d'utilisateur '" + newUsername + "' est deja utilise.");
        }

        String newEmail = null;
        if (email != null && !email.isBlank()) {
            newEmail = email.trim();
            if (!EMAIL_PATTERN.matcher(newEmail).matches()) {
                throw new IllegalArgumentException("L'adresse email est invalide.");
            }
            if (!newEmail.equalsIgnoreCase(account.email())
                    && countByEmailExcluding(newEmail, id) > 0) {
                throw new DuplicateResourceException("L'adresse email '" + newEmail + "' est deja utilisee.");
            }
        }
        boolean newEnabled = enabled == null || enabled;

        em.createNativeQuery(
                "UPDATE `user` SET username = :u, email = :e, enabled = :en WHERE id = :id")
            .setParameter("u", newUsername)
            .setParameter("e", newEmail)
            .setParameter("en", newEnabled)
            .setParameter("id", id)
            .executeUpdate();

        StringBuilder changes = new StringBuilder();
        if (!newUsername.equals(account.username())) {
            changes.append("username=").append(account.username()).append("->").append(newUsername).append(";");
        }
        if (newEmail != null && !newEmail.equalsIgnoreCase(account.email())) {
            changes.append("email=").append(account.email()).append("->").append(newEmail).append(";");
        }
        if (newEnabled != account.enabled()) {
            changes.append("enabled=").append(account.enabled()).append("->").append(newEnabled).append(";");
        }

        if (changes.length() > 0) {
            platformAuditService.record(actorUsername, "COMPTE_MODIFIE", "COMPTE",
                String.valueOf(id), changes.toString());
            log.info("Compte {} (id={}) modifie par '{}' : {}", account.username(), id, actorUsername, changes);
        }
    }

    /**
     * Supprime un compte d'entreprise. Gardes : pas de suppression des comptes
     * plateforme ni du compte {@code admin} historique, jamais du dernier compte
     * administrateur de l'entreprise.
     */
    @Transactional
    public void delete(Long id, String actorUsername) {
        AccountState account = requireEnterpriseAccount(id);

        if ("admin".equalsIgnoreCase(account.username())) {
            throw new IllegalArgumentException("Impossible de supprimer le compte 'admin'.");
        }
        if (isAdminProfil(account.profilNom()) && adminCount(account.entrepriseId()) <= 1) {
            throw new IllegalStateException(
                "Impossible de supprimer le dernier compte administrateur de l'entreprise '"
                    + account.entrepriseNom() + "'.");
        }

        em.createNativeQuery("DELETE FROM `user` WHERE id = :id")
            .setParameter("id", id)
            .executeUpdate();

        platformAuditService.record(actorUsername, "COMPTE_SUPPRIME", "COMPTE",
            String.valueOf(id),
            "username=" + account.username() + "; entreprise=" + account.entrepriseCode());
        log.info("Compte {} (id={}) supprime par '{}'.", account.username(), id, actorUsername);
    }

    // ------------------------------------------------------------------
    // Reinitialisations
    // ------------------------------------------------------------------

    /**
     * Genere un mot de passe temporaire, l'applique (obligation de changement
     * a la prochaine connexion) et fournit les informations pour l'envoi email
     * par l'appelant (hors transaction, best-effort).
     */
    @Transactional
    public ResetOutcome resetPassword(Long id, String actorUsername) {
        AccountState account = requireEnterpriseAccount(id);

        if (account.email() == null || account.email().isBlank()) {
            throw new IllegalStateException(
                "Le compte '" + account.username()
                    + "' n'a pas d'adresse email : impossible d'envoyer un nouveau mot de passe.");
        }

        String newPassword = generateSecurePassword();
        em.createNativeQuery(
                "UPDATE `user` SET password = :p, password_change_required = 1 WHERE id = :id")
            .setParameter("p", passwordEncoder.encode(newPassword))
            .setParameter("id", id)
            .executeUpdate();

        platformAuditService.record(actorUsername, "COMPTE_MOT_DE_PASSE_REINITIALISE", "COMPTE",
            String.valueOf(id), "username=" + account.username()
                + "; entreprise=" + account.entrepriseCode());
        log.info("Mot de passe du compte {} (id={}) reinitialise par '{}'.",
            account.username(), id, actorUsername);

        return new ResetOutcome(account.username(), account.email(), newPassword);
    }

    /**
     * Reinitialise le 2FA d'un compte : desactivation et effacement de la cle
     * secrete (l'utilisateur devra le reactiver a sa prochaine connexion avec un
     * nouveau QR code).
     */
    @Transactional
    public void reset2FA(Long id, String actorUsername) {
        AccountState account = requireEnterpriseAccount(id);

        em.createNativeQuery(
                "UPDATE `user` SET enabled_2fa = 0, secret_2fa = NULL, qr_code_scanned = 0 WHERE id = :id")
            .setParameter("id", id)
            .executeUpdate();

        platformAuditService.record(actorUsername, "COMPTE_2FA_REINITIALISE", "COMPTE",
            String.valueOf(id), "username=" + account.username()
                + "; entreprise=" + account.entrepriseCode());
        log.info("2FA du compte {} (id={}) reinitialise par '{}'.", account.username(), id, actorUsername);
    }

    // ------------------------------------------------------------------
    // Helpers
    // ------------------------------------------------------------------

    @Transactional(readOnly = true)
    @SuppressWarnings("unchecked")
    private AccountState findAccount(Long id) {
        List<Object[]> rows = em.createNativeQuery(
                "SELECT u.id, u.username, u.email, u.enabled, u.entreprise_id, p.nom, "
                    + "e.code, e.nom "
                    + "FROM `user` u "
                    + "LEFT JOIN entreprise e ON e.id = u.entreprise_id "
                    + "LEFT JOIN profil p ON p.id = u.profil_id "
                    + "WHERE u.id = :id")
            .setParameter("id", id)
            .getResultList();
        if (rows.isEmpty()) {
            throw new EntityNotFoundException("Compte introuvable (id=" + id + ").");
        }
        Object[] row = rows.get(0);
        return new AccountState(
            asLong(row[0]),
            asString(row[1]),
            asString(row[2]),
            asBoolean(row[3]),
            asLong(row[4]),
            asString(row[5]),
            asString(row[6]),
            asString(row[7]));
    }

    private AccountState requireEnterpriseAccount(Long id) {
        AccountState account = findAccount(id);
        if (account.entrepriseId() == null) {
            throw new IllegalStateException(
                "Ce compte est un compte de la plateforme (SUPER_ADMIN) : sa gestion "
                    + "n'est pas autorisee depuis cette page.");
        }
        return account;
    }

    private long countByUsername(String username) {
        return ((Number) em.createNativeQuery(
                "SELECT COUNT(*) FROM `user` WHERE username = :u")
            .setParameter("u", username)
            .getSingleResult()).longValue();
    }

    private long countByEmailExcluding(String email, Long excludedId) {
        return ((Number) em.createNativeQuery(
                "SELECT COUNT(*) FROM `user` WHERE email = :e AND id <> :id")
            .setParameter("e", email)
            .setParameter("id", excludedId)
            .getSingleResult()).longValue();
    }

    private long adminCount(Long entrepriseId) {
        return ((Number) em.createNativeQuery(
                "SELECT COUNT(*) FROM `user` u "
                    + "JOIN profil p ON p.id = u.profil_id "
                    + "WHERE u.entreprise_id = :eid AND UPPER(p.nom) IN ('ADMIN', 'ADMINISTRATEUR')")
            .setParameter("eid", entrepriseId)
            .getSingleResult()).longValue();
    }

    private static boolean isAdminProfil(String profilNom) {
        if (profilNom == null) {
            return false;
        }
        String nom = profilNom.toUpperCase();
        for (String admin : ADMIN_PROFILS) {
            if (admin.equals(nom)) {
                return true;
            }
        }
        return false;
    }

    private String requireText(String raw, String message) {
        if (raw == null || raw.isBlank()) {
            throw new IllegalArgumentException(message);
        }
        return raw.trim();
    }

    private String generateSecurePassword() {
        StringBuilder password = new StringBuilder(12);
        for (int i = 0; i < 12; i++) {
            password.append(PASSWORD_CHARS.charAt(random.nextInt(PASSWORD_CHARS.length())));
        }
        return password.toString();
    }

    private static String asString(Object value) {
        return value == null ? null : value.toString();
    }

    private static Long asLong(Object value) {
        if (value == null) {
            return null;
        }
        if (value instanceof Number n) {
            return n.longValue();
        }
        return Long.parseLong(value.toString());
    }

    private static boolean asBoolean(Object value) {
        if (value == null) {
            return false;
        }
        if (value instanceof Boolean b) {
            return b;
        }
        if (value instanceof Number n) {
            return n.intValue() != 0;
        }
        if (value instanceof byte[] bytes) {
            return bytes.length > 0 && bytes[0] != 0;
        }
        return Boolean.parseBoolean(value.toString());
    }

    // ------------------------------------------------------------------
    // Resultats
    // ------------------------------------------------------------------

    /** Ligne de compte (vue plateforme). */
    public record AccountRow(Long id, String username, String email, boolean enabled, boolean enabled2fa,
                             String profilNom, Long entrepriseId, String entrepriseCode, String entrepriseNom) {
    }

    /** Resultat d'une initialisation de mot de passe (la valeur en clair ne sort JAMAIS de la requete). */
    public record ResetOutcome(String username, String email, String newPassword) {
    }

    private record AccountState(Long id, String username, String email, boolean enabled,
                                Long entrepriseId, String profilNom, String entrepriseCode, String entrepriseNom) {
    }
}