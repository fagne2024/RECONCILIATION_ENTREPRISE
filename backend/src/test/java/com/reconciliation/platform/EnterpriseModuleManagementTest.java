package com.reconciliation.platform;

import com.reconciliation.controller.PlatformModuleController;
import com.reconciliation.dto.UpdateEntrepriseModulesRequest;
import com.reconciliation.entity.EntrepriseEntity;
import com.reconciliation.entity.EntrepriseStatut;
import com.reconciliation.entity.ModuleEntity;
import com.reconciliation.repository.EntrepriseRepository;
import com.reconciliation.repository.ModuleRepository;
import com.reconciliation.service.EntrepriseModuleService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.test.context.ActiveProfiles;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * Etape 5 : activation des modules PAR entreprise et cloisonnement plateforme.
 *
 * <p>Profil {@code test} (base MySQL locale dediee {@code reco_test}, schema cree
 * par Hibernate). Ne touche jamais la base applicative.</p>
 */
@SpringBootTest
@ActiveProfiles("test")
class EnterpriseModuleManagementTest {

    @Autowired
    private EntrepriseModuleService moduleService;

    @Autowired
    private PlatformModuleController platformModuleController;

    @Autowired
    private EntrepriseRepository entrepriseRepository;

    @Autowired
    private ModuleRepository moduleRepository;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    private Long entrepriseId;

    @BeforeEach
    void setUp() {
        EntrepriseEntity entreprise = entrepriseRepository.findByCode("MODTEST")
            .orElseGet(() -> {
                EntrepriseEntity created = new EntrepriseEntity();
                created.setCode("MODTEST");
                created.setNom("Module Test");
                created.setStatut(EntrepriseStatut.ACTIVE);
                return entrepriseRepository.save(created);
            });
        entrepriseId = entreprise.getId();

        ensureModule("Comptes");
        ensureModule("Résultats");
        ensureModule("Résultats · Contrôle interne BO vs Partenaire");
    }

    private ModuleEntity ensureModule(String nom) {
        ModuleEntity module = moduleRepository.findByNom(nom);
        if (module == null) {
            module = new ModuleEntity();
            module.setNom(nom);
            module.setVisible(Boolean.TRUE);
            module = moduleRepository.save(module);
        }
        return module;
    }

    private ModuleEntity module(String nom) {
        return moduleRepository.findByNom(nom);
    }

    // ------------------------------------------------------------------
    // Service
    // ------------------------------------------------------------------

    @Test
    @DisplayName("Un module est inactif par defaut, puis actif apres activation ciblee")
    void moduleInactifPuisActif() {
        moduleService.setActiveModules(entrepriseId, List.of(), "superadmin");
        assertThat(moduleService.isModuleActive(entrepriseId, "Comptes")).isFalse();

        moduleService.setActiveModules(entrepriseId, List.of(module("Comptes").getId()), "superadmin");
        assertThat(moduleService.isModuleActive(entrepriseId, "Comptes")).isTrue();
        assertThat(moduleService.isModuleActive(entrepriseId, "Résultats"))
            .as("un module non active reste inactif").isFalse();
    }

    @Test
    @DisplayName("Un sous-menu inactif herite de l'activation de son module parent")
    void sousMenuHeriteDuParent() {
        moduleService.setActiveModules(entrepriseId, List.of(module("Résultats").getId()), "superadmin");

        assertThat(moduleService.activeModuleIds(entrepriseId))
            .as("le sous-menu lui-meme n'est pas active").doesNotContain(module("Résultats · Contrôle interne BO vs Partenaire").getId());
        assertThat(moduleService.isModuleActive(entrepriseId, "Résultats · Contrôle interne BO vs Partenaire"))
            .as("le sous-menu herite du parent Résultats").isTrue();
    }

    @Test
    @DisplayName("Un module inconnu du catalogue n'est jamais bloquant")
    void moduleInconnuNonBloquant() {
        assertThat(moduleService.isModuleActive(entrepriseId, "Module Inexistant XYZ")).isTrue();
    }

    @Test
    @DisplayName("La mise a jour est journalisee dans l'audit plateforme")
    void updateIsAudited() {
        moduleService.setActiveModules(entrepriseId, List.of(module("Comptes").getId()), "superadmin");

        Integer auditCount = jdbcTemplate.queryForObject(
            "SELECT COUNT(*) FROM platform_audit_log WHERE action = ? AND target_id = ?",
            Integer.class, "ENTREPRISE_MODULES_MODIFIES", String.valueOf(entrepriseId));
        assertThat(auditCount).isNotNull().isGreaterThan(0);
    }

    @Test
    @DisplayName("Desactiver un module existant conserve la ligne et le rend inactif")
    void deactivationKeepsRow() {
        moduleService.setActiveModules(entrepriseId, List.of(module("Comptes").getId()), "superadmin");
        assertThat(moduleService.isModuleActive(entrepriseId, "Comptes")).isTrue();

        moduleService.setActiveModules(entrepriseId, List.of(), "superadmin");
        assertThat(moduleService.isModuleActive(entrepriseId, "Comptes")).isFalse();

        Integer rows = jdbcTemplate.queryForObject(
            "SELECT COUNT(*) FROM entreprise_module WHERE entreprise_id = ? AND module_id = ?",
            Integer.class, entrepriseId, module("Comptes").getId());
        assertThat(rows).as("la ligne est conservee (actif=false)").isEqualTo(1);
    }

    // ------------------------------------------------------------------
    // Cloisonnement plateforme (@PreAuthorize)
    // ------------------------------------------------------------------

    @Test
    @DisplayName("Un ADMIN d'entreprise ne peut pas modifier les modules (403 / AccessDenied)")
    void companyAdminCannotChangeModules() {
        Authentication admin = new UsernamePasswordAuthenticationToken("company_admin", null,
            List.of(new SimpleGrantedAuthority("ROLE_ADMIN")));
        SecurityContextHolder.getContext().setAuthentication(admin);
        try {
            UpdateEntrepriseModulesRequest request = new UpdateEntrepriseModulesRequest();
            request.setActiveModuleIds(List.of(module("Comptes").getId()));

            assertThatThrownBy(() -> platformModuleController.updateModules(entrepriseId, request, admin))
                .isInstanceOf(AccessDeniedException.class);
        } finally {
            SecurityContextHolder.clearContext();
        }
    }

    @Test
    @DisplayName("Un SUPER_ADMIN peut modifier les modules")
    void superAdminCanChangeModules() {
        Authentication superAdmin = new UsernamePasswordAuthenticationToken("superadmin", null,
            List.of(new SimpleGrantedAuthority("ROLE_SUPER_ADMIN")));
        SecurityContextHolder.getContext().setAuthentication(superAdmin);
        try {
            UpdateEntrepriseModulesRequest request = new UpdateEntrepriseModulesRequest();
            request.setActiveModuleIds(List.of(module("Comptes").getId()));

            platformModuleController.updateModules(entrepriseId, request, superAdmin);
        } finally {
            SecurityContextHolder.clearContext();
        }

        assertThat(moduleService.isModuleActive(entrepriseId, "Comptes")).isTrue();
    }
}
