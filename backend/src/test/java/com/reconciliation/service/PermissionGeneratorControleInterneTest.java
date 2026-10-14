package com.reconciliation.service;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;

import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest
@ActiveProfiles("test")
class PermissionGeneratorControleInterneTest {

    @Autowired
    private PermissionGeneratorService permissionGeneratorService;

    @Test
    void discoversControleInterneSubmenuActions() {
        List<Map<String, Object>> actions = permissionGeneratorService.getActionsForModule(
            "Résultats · Contrôle interne BO vs Partenaire"
        );

        assertThat(actions)
            .as("actions for controle interne submenu")
            .isNotEmpty();

        assertThat(actions.stream().map(action -> String.valueOf(action.get("path"))).toList())
            .anyMatch(path -> path.contains("/api/bo-partenaire-controle-interne"));
    }

    @Test
    void syncSubmenuActionsForControleInterne() {
        Map<String, Object> result = permissionGeneratorService.syncSubmenuModuleActions(
            "Résultats · Contrôle interne BO vs Partenaire",
            "Résultats",
            List.of("/api/bo-partenaire-controle-interne")
        );

        assertThat((Integer) result.get("actionsCount"))
            .as("synced actions count")
            .isGreaterThanOrEqualTo(9);
    }
}
