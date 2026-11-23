package com.reconciliation.service;

import com.reconciliation.entity.ModuleEntity;
import com.reconciliation.entity.PermissionEntity;
import com.reconciliation.entity.ProfilEntity;
import com.reconciliation.entity.ProfilPermissionEntity;
import com.reconciliation.entity.UserEntity;
import com.reconciliation.repository.ModuleRepository;
import com.reconciliation.repository.PermissionRepository;
import com.reconciliation.repository.ProfilPermissionRepository;
import com.reconciliation.repository.UserRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.lenient;

/**
 * Export du fichier final du traitement serveur (GET /api/traitement/lots/{id}/export) :
 * la permission générée « consulter_export » cochée dans le profil doit suffire.
 */
@ExtendWith(MockitoExtension.class)
class PermissionCheckServiceExportTest {

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

    private void profilTraitement(String... permissions) {
        ProfilEntity profil = new ProfilEntity();
        profil.setId(11L);
        profil.setNom("Agent Reconciliation TRX");
        UserEntity user = new UserEntity();
        user.setUsername("agent.trx");
        user.setProfil(profil);
        lenient().when(userRepository.findByUsername("agent.trx")).thenReturn(Optional.of(user));

        ModuleEntity traitement = new ModuleEntity();
        traitement.setId(7L);
        traitement.setNom("Traitement");
        lenient().when(moduleRepository.findByNomIgnoreCase("Traitement")).thenReturn(traitement);

        List<ProfilPermissionEntity> droits = java.util.Arrays.stream(permissions).map(nom -> {
            PermissionEntity p = new PermissionEntity();
            p.setNom(nom);
            ProfilPermissionEntity d = new ProfilPermissionEntity();
            d.setPermission(p);
            return d;
        }).toList();
        lenient().when(profilPermissionRepository.findByProfilIdAndModuleId(11L, 7L)).thenReturn(droits);
    }

    @Test
    void consulterExportOuvreLExportDuTraitement() {
        profilTraitement("consulter", "consulter_export", "creer", "modifier");
        assertThat(permissionCheckService.hasPermissionForApiPath("agent.trx", "/api/traitement/lots/42/export", "GET"))
            .isTrue();
    }

    @Test
    void sansDroitDExportLExportResteRefuse() {
        profilTraitement("consulter", "creer", "modifier");
        assertThat(permissionCheckService.hasPermissionForApiPath("agent.trx", "/api/traitement/lots/42/export", "GET"))
            .isFalse();
    }
}
