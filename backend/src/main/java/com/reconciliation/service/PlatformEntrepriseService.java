package com.reconciliation.service;

import com.reconciliation.dto.CreateEntrepriseRequest;
import com.reconciliation.entity.EntrepriseEntity;
import com.reconciliation.entity.EntrepriseModuleEntity;
import com.reconciliation.entity.EntrepriseStatut;
import com.reconciliation.exception.DuplicateResourceException;
import com.reconciliation.repository.EntrepriseModuleRepository;
import com.reconciliation.repository.EntrepriseRepository;
import com.reconciliation.repository.UserRepository;
import jakarta.persistence.EntityManager;
import jakarta.persistence.EntityNotFoundException;
import jakarta.persistence.PersistenceContext;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.nio.file.Path;
import java.security.SecureRandom;
import java.util.ArrayList;
import java.util.List;
import java.util.regex.Pattern;

/**
 * Operations de plateforme sur les entreprises (tenants), reservees au
 * SUPER_ADMIN.
 *
 * <p>La creation est <strong>atomique</strong> : entreprise, profil
 * {@code ADMINISTRATEUR}, copie des droits, compte administrateur, jeton
 * d'activation et trace d'audit sont ecrits dans UNE seule transaction. Si une
 * etape echoue, rien n'est persiste (pas d'entreprise orpheline).</p>
 *
 * <p>Les entites {@code @TenantId} ({@code profil}, {@code profil_permission})
 * sont inserees en SQL natif : la session d'un SUPER_ADMIN a le tenant sentinel
 * {@code -1}, si bien qu'un INSERT JPA echouerait sur la cle etrangere. Le
 * compte {@code user} est lui aussi insere en SQL natif (comme
 * {@code SuperAdminInitializer}) pour ne pas declencher le chargement EAGER du
 * profil dans un contexte sans entreprise.</p>
 */
@Service
public class PlatformEntrepriseService {

    private static final Logger log = LoggerFactory.getLogger(PlatformEntrepriseService.class);

    private static final String PROFIL_ADMINISTRATEUR = "ADMINISTRATEUR";
    private static final Pattern CODE_PATTERN = Pattern.compile("^[A-Z0-9][A-Z0-9_-]{1,63}$");
    private static final Pattern EMAIL_PATTERN = Pattern.compile("^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$");
    private static final String PASSWORD_CHARS =
        "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*";

    private final EntrepriseRepository entrepriseRepository;
    private final EntrepriseModuleRepository entrepriseModuleRepository;
    private final UserRepository userRepository;
    private final ActivationTokenService activationTokenService;
    private final PlatformAuditService platformAuditService;
    private final PasswordEncoder passwordEncoder;
    private final EntrepriseWatchFolderService entrepriseWatchFolderService;
    private final CalculationRuleService calculationRuleService;
    private final SecureRandom random = new SecureRandom();

    @PersistenceContext
    private EntityManager em;

    public PlatformEntrepriseService(EntrepriseRepository entrepriseRepository,
                                     EntrepriseModuleRepository entrepriseModuleRepository,
                                     UserRepository userRepository,
                                     ActivationTokenService activationTokenService,
                                     PlatformAuditService platformAuditService,
                                     PasswordEncoder passwordEncoder,
                                     EntrepriseWatchFolderService entrepriseWatchFolderService,
                                     CalculationRuleService calculationRuleService) {
        this.entrepriseRepository = entrepriseRepository;
        this.entrepriseModuleRepository = entrepriseModuleRepository;
        this.userRepository = userRepository;
        this.activationTokenService = activationTokenService;
        this.platformAuditService = platformAuditService;
        this.passwordEncoder = passwordEncoder;
        this.entrepriseWatchFolderService = entrepriseWatchFolderService;
        this.calculationRuleService = calculationRuleService;
    }

    // ------------------------------------------------------------------
    // Creation atomique
    // ------------------------------------------------------------------

    @Transactional
    public ProvisionedEntreprise create(CreateEntrepriseRequest request, String actorUsername) {
        if (request == null) {
            throw new IllegalArgumentException("Corps de requete manquant.");
        }
        String code = normalizeCode(request.getCode());
        String nom = requireText(request.getNom(), "Le nom de l'entreprise est requis.");
        String adminUsername = requireText(request.getAdminUsername(), "L'identifiant administrateur est requis.");
        String adminEmail = requireText(request.getAdminEmail(), "L'adresse email de l'administrateur est requise.");

        if (!CODE_PATTERN.matcher(code).matches()) {
            throw new IllegalArgumentException(
                "Le code doit contenir 2 a 64 caracteres (lettres majuscules, chiffres, _ ou -).");
        }
        if (!EMAIL_PATTERN.matcher(adminEmail).matches()) {
            throw new IllegalArgumentException("L'adresse email de l'administrateur est invalide.");
        }
        if (entrepriseRepository.existsByCode(code)) {
            throw new DuplicateResourceException("Une entreprise avec le code '" + code + "' existe deja.");
        }
        if (userRepository.findByUsername(adminUsername).isPresent()) {
            throw new DuplicateResourceException("Le nom d'utilisateur '" + adminUsername + "' est deja utilise.");
        }
        if (userRepository.findByEmail(adminEmail).isPresent()) {
            throw new DuplicateResourceException("L'adresse email '" + adminEmail + "' est deja utilisee.");
        }

        // 1. Entreprise (table globale).
        EntrepriseEntity entreprise = new EntrepriseEntity();
        entreprise.setCode(code);
        entreprise.setNom(nom);
        entreprise.setStatut(EntrepriseStatut.ACTIVE);
        entreprise = entrepriseRepository.saveAndFlush(entreprise);
        Long entrepriseId = entreprise.getId();

        // 1bis. Dossier watch-folder dedie (cloisonnement des fichiers modeles).
        // Best-effort : un echec du systeme de fichiers ne doit pas annuler la
        // creation de l'entreprise (le dossier est recree a la demande ensuite).
        boolean watchFolderReady = createWatchFolder(code);

        // 1ter. Regles de calcul par defaut pour la nouvelle entreprise : sans elles,
        // la page Configuration > Calcul serait vide et tous les calculs retomberaient
        // sur les valeurs codees en dur.
        calculationRuleService.copyDefaultsTo(entrepriseId);

        // 2. Profil ADMINISTRATEUR propre a l'entreprise (tenant-scoped -> SQL natif).
        em.createNativeQuery(
                "INSERT INTO profil (entreprise_id, nom, description) VALUES (:eid, :nom, :description)")
            .setParameter("eid", entrepriseId)
            .setParameter("nom", PROFIL_ADMINISTRATEUR)
            .setParameter("description", "Profil administrateur de l'entreprise " + nom)
            .executeUpdate();
        Long profilId = ((Number) em.createNativeQuery(
                "SELECT id FROM profil WHERE entreprise_id = :eid AND nom = :nom")
            .setParameter("eid", entrepriseId)
            .setParameter("nom", PROFIL_ADMINISTRATEUR)
            .getSingleResult()).longValue();

        // 3. Tous les droits : copie du catalogue global module_permission.
        int droits = em.createNativeQuery(
                "INSERT INTO profil_permission (entreprise_id, profil_id, module_id, permission_id) "
                    + "SELECT :eid, :pid, mp.module_id, mp.permission_id FROM module_permission mp")
            .setParameter("eid", entrepriseId)
            .setParameter("pid", profilId)
            .executeUpdate();

        // 4. Aucun module active par defaut (decision etape 4) : rien a inserer.

        // 5. Compte ADMIN (mot de passe aleatoire inutilisable : le vrai mot de
        //    passe sera choisi via le lien d'activation). SQL natif.
        String unusablePassword = passwordEncoder.encode(generateSecurePassword());
        em.createNativeQuery(
                "INSERT INTO `user` (`username`, `password`, `email`, `profil_id`, `enabled`, "
                    + "`password_change_required`, `failed_login_attempts`, `enabled_2fa`, `secret_2fa`, "
                    + "`qr_code_scanned`, `account_locked_until`, `entreprise_id`) "
                    + "VALUES (:u, :p, :e, :pid, 1, 1, 0, 0, NULL, 0, NULL, :eid)")
            .setParameter("u", adminUsername)
            .setParameter("p", unusablePassword)
            .setParameter("e", adminEmail)
            .setParameter("pid", profilId)
            .setParameter("eid", entrepriseId)
            .executeUpdate();

        // 6. Jeton d'activation a usage unique (72 h) - meme transaction.
        String activationToken = activationTokenService.issueToken(adminUsername, entrepriseId);

        // 7. Audit (meme transaction : annule avec l'action en cas d'echec).
        platformAuditService.record(actorUsername, "ENTREPRISE_CREEE", "ENTREPRISE",
            String.valueOf(entrepriseId),
            "code=" + code + "; admin=" + adminUsername + "; droits=" + droits
                + "; watchFolder=" + (watchFolderReady ? "ok" : "echec"));

        log.info("Entreprise '{}' (id={}) creee par '{}' : profil ADMINISTRATEUR, {} droits, 0 module.",
            code, entrepriseId, actorUsername, droits);

        return new ProvisionedEntreprise(entrepriseId, code, nom, EntrepriseStatut.ACTIVE.name(),
            adminUsername, adminEmail, droits, activationToken);
    }

    // ------------------------------------------------------------------
    // Lecture
    // ------------------------------------------------------------------

    @Transactional(readOnly = true)
    public List<EntrepriseEntity> findAll() {
        return entrepriseRepository.findAll();
    }

    @Transactional(readOnly = true)
    public EntrepriseEntity findById(Long id) {
        return entrepriseRepository.findById(id)
            .orElseThrow(() -> new EntityNotFoundException("Entreprise introuvable (id=" + id + ")."));
    }

    /** Nombre de modules actifs pour l'entreprise. */
    @Transactional(readOnly = true)
    public long activeModuleCount(Long entrepriseId) {
        return entrepriseModuleRepository.findByEntrepriseId(entrepriseId).stream()
            .filter(m -> Boolean.TRUE.equals(m.getActif()))
            .count();
    }

    /**
     * Comptes de l'entreprise (jointure native : le profil est {@code @TenantId}
     * et ne serait pas visible via JPA dans un contexte plateforme).
     */
    @Transactional(readOnly = true)
    @SuppressWarnings("unchecked")
    public List<EntrepriseUserRow> users(Long entrepriseId) {
        List<Object[]> rows = em.createNativeQuery(
                "SELECT u.username, u.email, p.nom, u.enabled FROM `user` u "
                    + "LEFT JOIN profil p ON p.id = u.profil_id "
                    + "WHERE u.entreprise_id = :eid ORDER BY u.username")
            .setParameter("eid", entrepriseId)
            .getResultList();
        List<EntrepriseUserRow> result = new ArrayList<>(rows.size());
        for (Object[] row : rows) {
            result.add(new EntrepriseUserRow(
                asString(row[0]),
                asString(row[1]),
                asString(row[2]),
                asBoolean(row[3])));
        }
        return result;
    }

    // ------------------------------------------------------------------
    // Modification / suspension
    // ------------------------------------------------------------------

    /**
     * Modifie le nom (obligatoire) et, si fourni, le code (identifiant de
     * branding) d'une entreprise. Le code reste unique et normalise en
     * majuscules ; la trace d'audit conserve l'ancienne et la nouvelle valeur.
     */
    @Transactional
    public EntrepriseEntity update(Long id, String nom, String code, String actorUsername) {
        String newNom = requireText(nom, "Le nom de l'entreprise est requis.");
        EntrepriseEntity entreprise = findById(id);

        StringBuilder changes = new StringBuilder();
        if (!newNom.equals(entreprise.getNom())) {
            changes.append("nom=").append(entreprise.getNom()).append("->").append(newNom).append(";");
            entreprise.setNom(newNom);
        }

        if (code != null && !code.isBlank()) {
            String newCode = normalizeCode(code);
            if (!CODE_PATTERN.matcher(newCode).matches()) {
                throw new IllegalArgumentException(
                    "Le code doit contenir 2 a 64 caracteres (lettres majuscules, chiffres, _ ou -).");
            }
            if (!newCode.equals(entreprise.getCode())) {
                if (entrepriseRepository.existsByCode(newCode)) {
                    throw new DuplicateResourceException(
                        "Une entreprise avec le code '" + newCode + "' existe deja.");
                }
                changes.append("code=").append(entreprise.getCode()).append("->").append(newCode).append(";");
                entreprise.setCode(newCode);
            }
        }

        if (changes.length() == 0) {
            return entreprise;
        }

        entreprise = entrepriseRepository.save(entreprise);
        if (changes.indexOf("code=") >= 0) {
            // Un changement de code implique un nouveau dossier watch-folder
            // (l'ancien est conserve pour ne pas perdre les fichiers deja deposes).
            createWatchFolder(entreprise.getCode());
        }
        platformAuditService.record(actorUsername, "ENTREPRISE_MODIFIEE", "ENTREPRISE",
            String.valueOf(id), changes.toString());
        return entreprise;
    }

    @Transactional
    public EntrepriseEntity suspend(Long id, String actorUsername) {
        return changeStatut(id, EntrepriseStatut.SUSPENDUE, actorUsername);
    }

    /**
     * Suppression logique : l'entreprise passe en ARCHIVEE (acces bloque comme
     * une suspension, masquee de la liste courante). Les donnees sont conservees.
     */
    @Transactional
    public EntrepriseEntity archive(Long id, String actorUsername) {
        return changeStatut(id, EntrepriseStatut.ARCHIVEE, actorUsername);
    }

    @Transactional
    public EntrepriseEntity reactivate(Long id, String actorUsername) {
        return changeStatut(id, EntrepriseStatut.ACTIVE, actorUsername);
    }

    private EntrepriseEntity changeStatut(Long id, EntrepriseStatut statut, String actorUsername) {
        EntrepriseEntity entreprise = findById(id);
        EntrepriseStatut previous = entreprise.getStatut();
        if (previous == statut) {
            return entreprise;
        }
        entreprise.setStatut(statut);
        entreprise = entrepriseRepository.save(entreprise);
        String action = switch (statut) {
            case SUSPENDUE -> "ENTREPRISE_SUSPENDUE";
            case ARCHIVEE -> "ENTREPRISE_ARCHIVEE";
            default -> "ENTREPRISE_REACTIVEE";
        };
        platformAuditService.record(actorUsername, action,
            "ENTREPRISE", String.valueOf(id), "ancienStatut=" + previous);
        return entreprise;
    }

    /**
     * Reemet un jeton d'activation pour le compte administrateur de l'entreprise.
     * L'email est envoye par l'appelant, hors transaction (best-effort).
     */
    @Transactional
    public ActivationRenewal renewActivation(Long entrepriseId, String actorUsername) {
        EntrepriseEntity entreprise = findById(entrepriseId);
        AdminAccount admin = findAdminAccount(entrepriseId);
        if (admin == null) {
            throw new IllegalStateException("Aucun compte administrateur pour cette entreprise.");
        }
        if (admin.email() == null || admin.email().isBlank()) {
            throw new IllegalStateException("Le compte administrateur n'a pas d'adresse email.");
        }
        String token = activationTokenService.issueToken(admin.username(), entrepriseId);
        platformAuditService.record(actorUsername, "ACTIVATION_RENVOYEE", "ENTREPRISE",
            String.valueOf(entrepriseId), "admin=" + admin.username());
        return new ActivationRenewal(entrepriseId, entreprise.getNom(),
            admin.username(), admin.email(), token);
    }

    @Transactional(readOnly = true)
    @SuppressWarnings("unchecked")
    private AdminAccount findAdminAccount(Long entrepriseId) {
        List<Object[]> rows = em.createNativeQuery(
                "SELECT u.username, u.email FROM `user` u "
                    + "JOIN profil p ON p.id = u.profil_id "
                    + "WHERE u.entreprise_id = :eid "
                    + "AND UPPER(p.nom) IN ('ADMIN', 'ADMINISTRATEUR') ORDER BY u.username")
            .setParameter("eid", entrepriseId)
            .setMaxResults(1)
            .getResultList();
        if (rows.isEmpty()) {
            return null;
        }
        return new AdminAccount(asString(rows.get(0)[0]), asString(rows.get(0)[1]));
    }

    // ------------------------------------------------------------------
    // Helpers
    // ------------------------------------------------------------------

    private String normalizeCode(String raw) {
        if (raw == null) {
            throw new IllegalArgumentException("Le code de l'entreprise est requis.");
        }
        return raw.trim().toUpperCase();
    }

    /**
     * Cree le dossier watch-folder dedie a l'entreprise (cloisonnement des
     * fichiers modeles). Best-effort : un echec est journalise mais n'annule pas
     * la transaction (le dossier est recree a la demande lors de l'acces).
     */
    private boolean createWatchFolder(String code) {
        try {
            Path folder = entrepriseWatchFolderService.ensureFolder(code);
            log.info("Dossier watch-folder cree pour l'entreprise '{}' : {}", code, folder);
            return true;
        } catch (Exception e) {
            log.warn("Dossier watch-folder non cree pour l'entreprise '{}' : {}", code, e.getMessage());
            return false;
        }
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

    /** Resultat d'une creation d'entreprise (le jeton n'est jamais renvoye au client). */
    public record ProvisionedEntreprise(Long id, String code, String nom, String statut,
                                        String adminUsername, String adminEmail,
                                        int droitsAccordes, String activationToken) {
    }

    /** Resultat d'un renvoi de lien d'activation. */
    public record ActivationRenewal(Long entrepriseId, String nom, String adminUsername,
                                    String adminEmail, String activationToken) {
    }

    /** Ligne de compte d'une entreprise (vue plateforme). */
    public record EntrepriseUserRow(String username, String email, String profilNom, boolean enabled) {
    }

    private record AdminAccount(String username, String email) {
    }
}
