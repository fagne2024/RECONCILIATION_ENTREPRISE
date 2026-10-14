package com.reconciliation.controller;

import com.reconciliation.entity.ModuleEntity;
import com.reconciliation.service.EntrepriseModuleService;
import com.reconciliation.tenant.TenantContext;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * Modules actifs pour l'entreprise de l'utilisateur connecte.
 *
 * <p>Endpoint en lecture seule, accessible a tout utilisateur authentifie de
 * l'entreprise : il permet au frontend de masquer les entrees de menu des
 * modules desactives. Le composant decisionnel reste le backend
 * ({@code PermissionInterceptor} -&gt; 403), le masquage n'etant qu'un confort.</p>
 *
 * <p>Un SUPER_ADMIN (aucune entreprise) obtient une liste vide.</p>
 */
@RestController
@RequestMapping("/api/modules")
@CrossOrigin(origins = {"http://localhost:4200", "http://172.214.108.8:4200"})
public class CurrentModuleController {

    private final EntrepriseModuleService moduleService;

    public CurrentModuleController(EntrepriseModuleService moduleService) {
        this.moduleService = moduleService;
    }

    @GetMapping("/active")
    public ResponseEntity<Map<String, Object>> activeModules() {
        Long entrepriseId = TenantContext.get();
        Set<Long> activeIds = moduleService.activeModuleIds(entrepriseId);

        List<String> names = moduleService.catalogue().stream()
            .filter(module -> activeIds.contains(module.getId()))
            .map(ModuleEntity::getNom)
            .toList();

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("entrepriseId", entrepriseId);
        body.put("modules", names);
        return ResponseEntity.ok(body);
    }
}
