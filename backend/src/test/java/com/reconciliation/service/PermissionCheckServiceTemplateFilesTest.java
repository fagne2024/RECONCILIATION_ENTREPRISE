package com.reconciliation.service;

import com.reconciliation.repository.ModuleRepository;
import com.reconciliation.repository.PermissionRepository;
import com.reconciliation.repository.ProfilPermissionRepository;
import com.reconciliation.repository.UserRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Lecture des colonnes du fichier modèle pendant le traitement assisté :
 * contrôlée sur le module Réconciliation (comme /api/auto-processing/models),
 * pas sur le module Modèles réservé à la gestion des modèles.
 */
@ExtendWith(MockitoExtension.class)
class PermissionCheckServiceTemplateFilesTest {

    @Mock
    private ProfilPermissionRepository profilPermissionRepository;
    @Mock
    private UserRepository userRepository;
    @Mock
    private ModuleRepository moduleRepository;
    @Mock
    private PermissionRepository permissionRepository;
    @Mock
    private PermissionGeneratorService permissionGeneratorService;

    @InjectMocks
    private PermissionCheckService permissionCheckService;

    @Test
    void listeDesFichiersModelesRelevedeLaReconciliationEnLecture() {
        assertThat(permissionCheckService.resolveModuleForApiPath("/api/file-watcher/available-files", "GET", null))
            .isEqualTo("Réconciliation");
        assertThat(permissionCheckService.resolvePermissionForApiPath("/api/file-watcher/available-files", "GET", null, null))
            .isEqualTo("consulter");
    }

    @Test
    void analyseDUnFichierModeleRelevedeLaReconciliationEnLecture() {
        assertThat(permissionCheckService.resolveModuleForApiPath("/api/file-watcher/analyze-file", "POST", null))
            .isEqualTo("Réconciliation");
        assertThat(permissionCheckService.resolvePermissionForApiPath("/api/file-watcher/analyze-file", "POST", null, null))
            .isEqualTo("consulter");
    }

    /**
     * Cas réel (profil « Agent Reconciliation Banque ») : aucun droit sur le module
     * parent Réconciliation ni sur Modèles, seulement le sous-menu Mode assisté.
     */
    @Test
    void unProfilAvecSeulementLeSousMenuModeAssisteLitLesFichiersModeles() {
        com.reconciliation.entity.ProfilEntity profil = new com.reconciliation.entity.ProfilEntity();
        profil.setId(12L);
        profil.setNom("Agent Reconciliation Banque");
        com.reconciliation.entity.UserEntity user = new com.reconciliation.entity.UserEntity();
        user.setUsername("agent.banque");
        user.setProfil(profil);
        org.mockito.Mockito.lenient().when(userRepository.findByUsername("agent.banque"))
            .thenReturn(java.util.Optional.of(user));

        com.reconciliation.entity.ModuleEntity modeAssiste = new com.reconciliation.entity.ModuleEntity();
        modeAssiste.setId(100L);
        modeAssiste.setNom("Réconciliation · Mode assisté");
        org.mockito.Mockito.lenient().when(moduleRepository.findByNomIgnoreCase("Réconciliation · Mode assisté"))
            .thenReturn(modeAssiste);

        com.reconciliation.entity.PermissionEntity consulterModels = new com.reconciliation.entity.PermissionEntity();
        consulterModels.setNom("consulter_models");
        com.reconciliation.entity.ProfilPermissionEntity droit = new com.reconciliation.entity.ProfilPermissionEntity();
        droit.setPermission(consulterModels);
        org.mockito.Mockito.lenient().when(profilPermissionRepository.findByProfilIdAndModuleId(12L, 100L))
            .thenReturn(java.util.List.of(droit));

        assertThat(permissionCheckService.hasPermissionForApiPath("agent.banque", "/api/file-watcher/available-files", "GET"))
            .isTrue();
        assertThat(permissionCheckService.hasPermissionForApiPath("agent.banque", "/api/file-watcher/analyze-file", "POST"))
            .isTrue();
        // La gestion du watch-folder reste refusée sans le module Modèles.
        assertThat(permissionCheckService.hasPermissionForApiPath("agent.banque", "/api/file-watcher/upload", "POST"))
            .isFalse();
    }

    @Test
    void lesSousMenusQuiConsommentLesModelesDonnentAccesAuxFichiersModeles() {
        for (String path : java.util.List.of("/api/file-watcher/available-files", "/api/file-watcher/analyze-file")) {
            assertThat(com.reconciliation.config.NavigationSubmenuRegistry.resolveAccessModulesForApiPath(path))
                .contains("Réconciliation · Mode assisté", "Réconciliation · Lanceur", "Réconciliation · Certification de solde")
                .doesNotContain("Réconciliation · Mode Manuel");
        }
        assertThat(com.reconciliation.config.NavigationSubmenuRegistry.resolveAccessModulesForApiPath("/api/file-watcher/upload"))
            .isEmpty();
    }

    @Test
    void gestionDuWatchFolderResteSurLeModuleModeles() {
        assertThat(permissionCheckService.resolveModuleForApiPath("/api/file-watcher/upload", "POST", null))
            .isEqualTo("Modèles");
        assertThat(permissionCheckService.resolveModuleForApiPath("/api/file-watcher/start", "POST", null))
            .isEqualTo("Modèles");
        assertThat(permissionCheckService.resolveModuleForApiPath("/api/file-watcher/status", "GET", null))
            .isEqualTo("Modèles");
    }

    @Test
    void lEnteteModelesRamèneLaListeAuModuleModeles() {
        assertThat(permissionCheckService.resolveModuleForApiPath("/api/file-watcher/available-files", "GET", "Modèles"))
            .isEqualTo("Modèles");
    }
}
