package com.reconciliation.service;

import com.reconciliation.config.NavigationSubmenuRegistry;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest
@ActiveProfiles("test")
class PermissionGeneratorAllSubmenusTest {

    @Autowired
    private PermissionGeneratorService permissionGeneratorService;

    @Test
    void everySubmenuHasDiscoverableActions() {
        List<String> withoutActions = new ArrayList<>();

        for (NavigationSubmenuRegistry.SubmenuAccessDefinition def : NavigationSubmenuRegistry.allDefinitions()) {
            List<Map<String, Object>> actions = permissionGeneratorService.getActionsForModule(def.accessModuleName());
            if (actions == null || actions.isEmpty()) {
                withoutActions.add(def.accessModuleName());
            }
        }

        assertThat(withoutActions)
            .as("sous-menus sans action synchronisable")
            .isEmpty();
    }
}
