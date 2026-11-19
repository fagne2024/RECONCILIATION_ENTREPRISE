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
import org.junit.jupiter.api.BeforeEach;
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
 * Cas réel (profil « Agent Réconciliation », mode magique) : sur le sous-menu
 * « Réconciliation · Lanceur », toutes les actions proposées sont cochées, dont
 * « executer_reconciliation_magique », mais le catalogue du Lanceur ne propose pas
 * « lancer_reconciliation » que le serveur exige pour démarrer → refus
 * « Vous n'avez pas la permission "lancer_reconciliation" dans le module "Réconciliation · Lanceur" ».
 */
@ExtendWith(MockitoExtension.class)
class PermissionCheckServiceLanceurTest {

    private static final String LANCEUR = "Réconciliation · Lanceur";

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

    @BeforeEach
    void profilAgent() {
        ProfilEntity profil = new ProfilEntity();
        profil.setId(6L);
        profil.setNom("Agent Réconciliation");
        UserEntity user = new UserEntity();
        user.setUsername("agent.trx");
        user.setProfil(profil);
        lenient().when(userRepository.findByUsername("agent.trx")).thenReturn(Optional.of(user));

        ModuleEntity lanceur = new ModuleEntity();
        lanceur.setId(39L);
        lanceur.setNom(LANCEUR);
        lenient().when(moduleRepository.findByNomIgnoreCase(LANCEUR)).thenReturn(lanceur);

        lenient().when(profilPermissionRepository.findByProfilIdAndModuleId(6L, 39L)).thenReturn(List.of(
                droit("executer_reconciliation_magique"),
                droit("creer_start"),
                droit("consulter_progression_reconciliation"),
                droit("module_associé")));
    }

    private static ProfilPermissionEntity droit(String nom) {
        PermissionEntity p = new PermissionEntity();
        p.setNom(nom);
        ProfilPermissionEntity pp = new ProfilPermissionEntity();
        pp.setPermission(p);
        return pp;
    }

    @Test
    void executerMagiqueSurLeLanceurSuffitPourLancerLaReconciliation() {
        assertThat(permissionCheckService.hasFlexibleModulePermission("agent.trx", LANCEUR, "lancer_reconciliation", "POST"))
                .isTrue();
    }

    @Test
    void unSousMenuSansDroitDeLancementResteRefuse() {
        lenient().when(profilPermissionRepository.findByProfilIdAndModuleId(6L, 39L)).thenReturn(List.of(
                droit("consulter_progression_reconciliation"), droit("module_associé")));
        assertThat(permissionCheckService.hasFlexibleModulePermission("agent.trx", LANCEUR, "lancer_reconciliation", "POST"))
                .isFalse();
    }
}
