package com.reconciliation.platform;

import com.reconciliation.dto.CreateEntrepriseRequest;
import com.reconciliation.entity.EntrepriseEntity;
import com.reconciliation.entity.EntrepriseStatut;
import com.reconciliation.entity.ModuleEntity;
import com.reconciliation.entity.ModulePermissionEntity;
import com.reconciliation.entity.PermissionEntity;
import com.reconciliation.entity.UserEntity;
import com.reconciliation.exception.DuplicateResourceException;
import com.reconciliation.repository.ActivationTokenRepository;
import com.reconciliation.repository.EntrepriseModuleRepository;
import com.reconciliation.repository.EntrepriseRepository;
import com.reconciliation.repository.ModulePermissionRepository;
import com.reconciliation.repository.ModuleRepository;
import com.reconciliation.repository.PermissionRepository;
import com.reconciliation.repository.UserRepository;
import com.reconciliation.service.AccountActivationService;
import com.reconciliation.service.PlatformAuditService;
import com.reconciliation.service.PlatformEntrepriseService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.SpyBean;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.doThrow;

/**
 * Etape 4 : provisioning d'une entreprise par le SUPER_ADMIN (atomique),
 * droits du profil ADMINISTRATEUR, jeton d'activation et cycle de vie
 * (suspension / reactivation).
 *
 * <p>Profil {@code test} (base MySQL locale dediee {@code reco_test}, schema
 * cree par Hibernate). Ne touche jamais la base applicative.</p>
 */
@SpringBootTest
@ActiveProfiles("test")
class PlatformEntrepriseProvisioningTest {

    @Autowired
    private PlatformEntrepriseService service;

    @Autowired
    private AccountActivationService accountActivationService;

    @Autowired
    private EntrepriseRepository entrepriseRepository;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private ModuleRepository moduleRepository;

    @Autowired
    private PermissionRepository permissionRepository;

    @Autowired
    private ModulePermissionRepository modulePermissionRepository;

    @Autowired
    private EntrepriseModuleRepository entrepriseModuleRepository;

    @Autowired
    private ActivationTokenRepository activationTokenRepository;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @SpyBean
    private PlatformAuditService platformAuditService;

    /** Catalogue global minimal, identique pour toutes les entreprises. */
    @BeforeEach
    void seedCatalogue() {
        if (modulePermissionRepository.count() == 0) {
            ModuleEntity module = new ModuleEntity();
            module.setNom("TEST_MODULE_DASHBOARD");
            module.setVisible(true);
            moduleRepository.save(module);

            PermissionEntity permission = new PermissionEntity();
            permission.setNom("TEST_PERM_LIRE");
            permissionRepository.save(permission);

            ModulePermissionEntity link = new ModulePermissionEntity();
            link.setModule(module);
            link.setPermission(permission);
            modulePermissionRepository.save(link);
        }
    }

    private CreateEntrepriseRequest request(String code, String adminUsername) {
        CreateEntrepriseRequest request = new CreateEntrepriseRequest();
        request.setCode(code);
        request.setNom("Entreprise " + code);
        request.setAdminUsername(adminUsername);
        request.setAdminEmail(adminUsername + "@example.com");
        return request;
    }

    @Test
    @DisplayName("Creation atomique : entreprise + profil ADMINISTRATEUR + droits + admin + jeton")
    void createProvisionsEverything() {
        long expectedRights = modulePermissionRepository.count();

        PlatformEntrepriseService.ProvisionedEntreprise result =
            service.create(request("ACME", "acme_admin"), "superadmin");

        assertThat(result.id()).isNotNull();
        assertThat(result.droitsAccordes()).isEqualTo((int) expectedRights);
        assertThat(result.activationToken()).isNotBlank();

        EntrepriseEntity entreprise = entrepriseRepository.findByCode("ACME").orElseThrow();
        assertThat(entreprise.getStatut()).isEqualTo(EntrepriseStatut.ACTIVE);

        UserEntity admin = userRepository.findByUsername("acme_admin").orElseThrow();
        assertThat(admin.getEntrepriseId()).isEqualTo(entreprise.getId());
        assertThat(admin.getPasswordChangeRequired()).isTrue();
        assertThat(admin.getEnabled()).isTrue();

        // Profil + droits (lecture native : le profil est @TenantId, donc invisible via JPA hors tenant).
        Long profilId = jdbcTemplate.queryForObject(
            "SELECT id FROM profil WHERE entreprise_id = ? AND nom = ?",
            Long.class, entreprise.getId(), "ADMINISTRATEUR");
        assertThat(profilId).isNotNull();

        Integer droits = jdbcTemplate.queryForObject(
            "SELECT COUNT(*) FROM profil_permission WHERE entreprise_id = ?",
            Integer.class, entreprise.getId());
        assertThat(droits).isEqualTo((int) expectedRights);

        // Aucun module active par defaut (decision etape 4).
        assertThat(entrepriseModuleRepository.findByEntrepriseId(entreprise.getId())).isEmpty();

        // Un jeton d'activation a usage unique a ete emis.
        assertThat(activationTokenRepository.findByToken(result.activationToken())).isPresent();
    }

    @Test
    @DisplayName("Un code d'entreprise en doublon est refuse")
    void createRejectsDuplicateCode() {
        service.create(request("DUP", "dup_admin1"), "superadmin");

        assertThatThrownBy(() -> service.create(request("DUP", "dup_admin2"), "superadmin"))
            .isInstanceOf(DuplicateResourceException.class);
    }

    @Test
    @DisplayName("Atomicite : si une etape echoue, rien n'est persiste (pas d'entreprise orpheline)")
    void createIsAtomicOnFailure() {
        doThrow(new RuntimeException("panne simulee de l'audit"))
            .when(platformAuditService)
            .record(anyString(), anyString(), anyString(), any(), any());

        assertThatThrownBy(() -> service.create(request("ROLLBACK", "rollback_admin"), "superadmin"))
            .isInstanceOf(RuntimeException.class);

        assertThat(entrepriseRepository.findByCode("ROLLBACK")).isEmpty();
        assertThat(userRepository.findByUsername("rollback_admin")).isEmpty();
        assertThat(jdbcTemplate.queryForObject(
            "SELECT COUNT(*) FROM activation_token WHERE username = ?",
            Integer.class, "rollback_admin")).isZero();
    }

    @Test
    @DisplayName("Suspension puis reactivation d'une entreprise")
    void suspendAndReactivate() {
        PlatformEntrepriseService.ProvisionedEntreprise result =
            service.create(request("SUSP", "susp_admin"), "superadmin");

        assertThat(service.suspend(result.id(), "superadmin").getStatut())
            .isEqualTo(EntrepriseStatut.SUSPENDUE);
        assertThat(service.reactivate(result.id(), "superadmin").getStatut())
            .isEqualTo(EntrepriseStatut.ACTIVE);
    }

    @Test
    @DisplayName("Activation du compte : mot de passe defini, obligation levee, jeton a usage unique")
    void activateAccount() {
        PlatformEntrepriseService.ProvisionedEntreprise result =
            service.create(request("ACTIV", "activ_admin"), "superadmin");

        AccountActivationService.ActivationOutcome outcome =
            accountActivationService.activate(result.activationToken(), "Nouveau@1234");
        assertThat(outcome.success()).isTrue();

        String hash = jdbcTemplate.queryForObject(
            "SELECT password FROM `user` WHERE username = ?", String.class, "activ_admin");
        assertThat(hash).startsWith("$2"); // BCrypt

        Boolean passwordChangeRequired = jdbcTemplate.queryForObject(
            "SELECT password_change_required FROM `user` WHERE username = ?", Boolean.class, "activ_admin");
        assertThat(passwordChangeRequired).isFalse();

        // Le jeton est a usage unique : une seconde tentative echoue.
        AccountActivationService.ActivationOutcome second =
            accountActivationService.activate(result.activationToken(), "Autre@1234");
        assertThat(second.success()).isFalse();
    }

    @Test
    @DisplayName("Le renvoi d'activation emet un nouveau jeton pour l'administrateur")
    void renewActivationIssuesNewToken() {
        PlatformEntrepriseService.ProvisionedEntreprise result =
            service.create(request("RENEW", "renew_admin"), "superadmin");

        PlatformEntrepriseService.ActivationRenewal renewal =
            service.renewActivation(result.id(), "superadmin");

        assertThat(renewal.adminUsername()).isEqualTo("renew_admin");
        assertThat(renewal.activationToken()).isNotBlank().isNotEqualTo(result.activationToken());
        assertThat(activationTokenRepository.findByToken(renewal.activationToken())).isPresent();
    }
}
