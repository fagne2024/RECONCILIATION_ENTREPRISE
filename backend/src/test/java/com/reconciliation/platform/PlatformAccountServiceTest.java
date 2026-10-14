package com.reconciliation.platform;

import com.reconciliation.dto.CreateEntrepriseRequest;
import com.reconciliation.entity.ModuleEntity;
import com.reconciliation.entity.ModulePermissionEntity;
import com.reconciliation.entity.PermissionEntity;
import com.reconciliation.entity.UserEntity;
import com.reconciliation.exception.DuplicateResourceException;
import com.reconciliation.repository.ModulePermissionRepository;
import com.reconciliation.repository.ModuleRepository;
import com.reconciliation.repository.PermissionRepository;
import com.reconciliation.repository.UserRepository;
import com.reconciliation.service.PlatformAccountService;
import com.reconciliation.service.PlatformEntrepriseService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * Administration des comptes d'entreprises (vue SUPER_ADMIN) : liste globale,
 * modification, suppression (avec gardes), reinitialisation du mot de passe et
 * du 2FA.
 *
 * <p>Profil {@code test} (base MySQL locale dediee {@code reco_test}, schema
 * cree par Hibernate). Ne touche jamais la base applicative.</p>
 */
@SpringBootTest
@ActiveProfiles("test")
class PlatformAccountServiceTest {

    @Autowired
    private PlatformAccountService service;

    @Autowired
    private PlatformEntrepriseService platformEntrepriseService;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private ModuleRepository moduleRepository;

    @Autowired
    private PermissionRepository permissionRepository;

    @Autowired
    private ModulePermissionRepository modulePermissionRepository;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    /** Catalogue global minimal, identique pour toutes les entreprises. */
    @BeforeEach
    void seedCatalogue() {
        if (modulePermissionRepository.count() == 0) {
            ModuleEntity module = new ModuleEntity();
            module.setNom("TEST_MODULE_ACC_DASHBOARD");
            module.setVisible(true);
            moduleRepository.save(module);

            PermissionEntity permission = new PermissionEntity();
            permission.setNom("TEST_PERM_ACC_LIRE");
            permissionRepository.save(permission);

            ModulePermissionEntity link = new ModulePermissionEntity();
            link.setModule(module);
            link.setPermission(permission);
            modulePermissionRepository.save(link);
        }
    }

    private Long createEntreprise(String code, String adminUsername) {
        CreateEntrepriseRequest request = new CreateEntrepriseRequest();
        request.setCode(code);
        request.setNom("Entreprise " + code);
        request.setAdminUsername(adminUsername);
        request.setAdminEmail(adminUsername + "@example.com");
        return platformEntrepriseService.create(request, "superadmin").id();
    }

    private void insertUser(String username, String email, Long entrepriseId) {
        jdbcTemplate.update(
            "INSERT INTO `user` (`username`, `password`, `email`, `profil_id`, `enabled`, "
                + "`password_change_required`, `failed_login_attempts`, `enabled_2fa`, `secret_2fa`, "
                + "`qr_code_scanned`, `account_locked_until`, `entreprise_id`) "
                + "VALUES (?, '$2a$10$abcdefghijklmnopqrstuv', ?, NULL, 1, 0, 0, 0, NULL, 0, NULL, ?)",
            username, email, entrepriseId);
    }

    @Test
    @DisplayName("Liste : les comptes de toutes les entreprises apparaissent avec entreprise et profil")
    void listReturnsAllEntrepriseAccounts() {
        createEntreprise("ALFA", "alfa_admin");
        createEntreprise("BETA", "beta_admin");

        List<PlatformAccountService.AccountRow> rows = service.list();

        assertThat(rows).anySatisfy(r -> {
            assertThat(r.username()).isEqualTo("alfa_admin");
            assertThat(r.entrepriseCode()).isEqualTo("ALFA");
            assertThat(r.entrepriseNom()).isEqualTo("Entreprise ALFA");
            assertThat(r.profilNom()).isEqualTo("ADMINISTRATEUR");
            assertThat(r.enabled()).isTrue();
        });
        assertThat(rows).anySatisfy(r -> assertThat(r.username()).isEqualTo("beta_admin"));
    }

    @Test
    @DisplayName("Modification : username / email / activation persistes ; doublons refusés")
    void updatePersistsChanges() {
        createEntreprise("UPD1", "upd1_admin");
        createEntreprise("UPD2", "upd2_admin");
        UserEntity admin = userRepository.findByUsername("upd1_admin").orElseThrow();

        service.update(admin.getId(), "upd1_admin2", "upd1_new@example.com", false, "superadmin");

        assertThat(userRepository.findByUsername("upd1_admin")).isEmpty();
        UserEntity updated = userRepository.findByUsername("upd1_admin2").orElseThrow();
        assertThat(updated.getEmail()).isEqualTo("upd1_new@example.com");
        assertThat(updated.getEnabled()).isFalse();

        // Email deja utilise par un autre compte.
        assertThatThrownBy(() ->
            service.update(updated.getId(), "upd1_admin2", "upd2_admin@example.com", true, "superadmin"))
            .isInstanceOf(DuplicateResourceException.class);

        // Username deja utilise par un autre compte.
        assertThatThrownBy(() ->
            service.update(updated.getId(), "upd2_admin", "upd1_new@example.com", true, "superadmin"))
            .isInstanceOf(DuplicateResourceException.class);
    }

    @Test
    @DisplayName("Reset 2FA : cle secrete effacee et 2FA desactive")
    void reset2FAClearsSecretAndDisables() {
        createEntreprise("2FA1", "twofa_admin");
        jdbcTemplate.update(
            "UPDATE `user` SET enabled_2fa = 1, secret_2fa = 'MYSECRET', qr_code_scanned = 1 WHERE username = ?",
            "twofa_admin");
        UserEntity admin = userRepository.findByUsername("twofa_admin").orElseThrow();

        service.reset2FA(admin.getId(), "superadmin");

        assertThat(jdbcTemplate.queryForObject(
            "SELECT enabled_2fa FROM `user` WHERE username = ?", Boolean.class, "twofa_admin")).isFalse();
        assertThat(jdbcTemplate.queryForObject(
            "SELECT secret_2fa FROM `user` WHERE username = ?", String.class, "twofa_admin")).isNull();
        assertThat(jdbcTemplate.queryForObject(
            "SELECT qr_code_scanned FROM `user` WHERE username = ?", Boolean.class, "twofa_admin")).isFalse();
    }

    @Test
    @DisplayName("Reset mot de passe : nouveau hash BCrypt + obligation de changement a la prochaine connexion")
    void resetPasswordAppliesNewHashAndRequiresChange() {
        createEntreprise("PW1", "pw1_admin");
        UserEntity admin = userRepository.findByUsername("pw1_admin").orElseThrow();

        PlatformAccountService.ResetOutcome outcome = service.resetPassword(admin.getId(), "superadmin");

        assertThat(outcome.username()).isEqualTo("pw1_admin");
        assertThat(outcome.email()).isEqualTo("pw1_admin@example.com");
        assertThat(outcome.newPassword()).isNotBlank();

        assertThat(jdbcTemplate.queryForObject(
            "SELECT password_change_required FROM `user` WHERE username = ?", Boolean.class, "pw1_admin")).isTrue();
        assertThat(jdbcTemplate.queryForObject(
            "SELECT password FROM `user` WHERE username = ?", String.class, "pw1_admin")).startsWith("$2");
    }

    @Test
    @DisplayName("Suppression : le dernier administrateur d'une entreprise est protege")
    void deleteLastAdminOfEntrepriseIsRefused() {
        createEntreprise("DEL1", "del1_admin");
        UserEntity admin = userRepository.findByUsername("del1_admin").orElseThrow();

        assertThatThrownBy(() -> service.delete(admin.getId(), "superadmin"))
            .isInstanceOf(IllegalStateException.class);
        assertThat(userRepository.findByUsername("del1_admin")).isPresent();
    }

    @Test
    @DisplayName("Suppression : un compte non-admin peut etre supprime")
    void deleteNonAdminAccountSucceeds() {
        Long entrepriseId = createEntreprise("DEL2", "del2_admin");
        insertUser("del2_oper", "oper@example.com", entrepriseId);
        UserEntity oper = userRepository.findByUsername("del2_oper").orElseThrow();

        service.delete(oper.getId(), "superadmin");

        assertThat(userRepository.findByUsername("del2_oper")).isEmpty();
    }

    @Test
    @DisplayName("Les comptes plateforme (SUPER_ADMIN, entreprise NULL) sont proteges")
    void platformSuperAdminAccountIsProtected() {
        insertUser("sadmin_tech", "sadmin@example.com", null);
        UserEntity sadmin = userRepository.findByUsername("sadmin_tech").orElseThrow();

        assertThatThrownBy(() -> service.delete(sadmin.getId(), "superadmin"))
            .isInstanceOf(IllegalStateException.class);
        assertThatThrownBy(() -> service.update(sadmin.getId(), "x", "y@example.com", true, "superadmin"))
            .isInstanceOf(IllegalStateException.class);
        assertThatThrownBy(() -> service.reset2FA(sadmin.getId(), "superadmin"))
            .isInstanceOf(IllegalStateException.class);
    }
}