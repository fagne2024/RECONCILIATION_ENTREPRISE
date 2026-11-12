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
