package com.reconciliation.controller;

import com.reconciliation.dto.UpdateEntrepriseModulesRequest;
import com.reconciliation.entity.EntrepriseEntity;
import com.reconciliation.entity.ModuleEntity;
import com.reconciliation.service.EntrepriseModuleService;
import com.reconciliation.service.PlatformEntrepriseService;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

/**
 * Gestion des modules de la plateforme et de leur activation PAR entreprise -
 * reservee au SUPER_ADMIN.
 *
 * <p>Toutes les routes sont protegees a la fois par Spring Security
 * ({@code /api/platform/**} = {@code ROLE_SUPER_ADMIN}) et par
 * {@link PreAuthorize}. Un administrateur d'entreprise ne peut donc jamais
 * modifier les activations (403).</p>
 */
@RestController
@RequestMapping("/api/platform")
@CrossOrigin(origins = {"http://localhost:4200", "http://172.214.108.8:4200"})
public class PlatformModuleController {

    private final EntrepriseModuleService moduleService;
    private final PlatformEntrepriseService entrepriseService;

    public PlatformModuleController(EntrepriseModuleService moduleService,
                                    PlatformEntrepriseService entrepriseService) {
        this.moduleService = moduleService;
        this.entrepriseService = entrepriseService;
    }

    /** Catalogue global des modules (parent / sous-menu). */
    @GetMapping("/modules")
    @PreAuthorize("hasRole('SUPER_ADMIN')")
    public ResponseEntity<List<Map<String, Object>>> catalogue() {
        List<Map<String, Object>> body = moduleService.catalogue().stream()
            .map(this::toCatalogueRow)
            .collect(Collectors.toList());
        return ResponseEntity.ok(body);
    }

    /** Etat d'activation de chaque module pour une entreprise. */
    @GetMapping("/entreprises/{id}/modules")
    @PreAuthorize("hasRole('SUPER_ADMIN')")
    public ResponseEntity<Map<String, Object>> modulesForEntreprise(@PathVariable Long id) {
        EntrepriseEntity entreprise = entrepriseService.findById(id);
        List<Map<String, Object>> modules = moduleService.modulesForEntreprise(id).stream()
            .map(this::toActivationRow)
            .collect(Collectors.toList());

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("entrepriseId", entreprise.getId());
        body.put("code", entreprise.getCode());
        body.put("nom", entreprise.getNom());
        body.put("modulesActives", modules.stream()
            .filter(row -> Boolean.TRUE.equals(row.get("actif"))).count());
        body.put("modules", modules);
        return ResponseEntity.ok(body);
    }

    /** Remplace l'ensemble des modules actifs de l'entreprise. */
    @PutMapping("/entreprises/{id}/modules")
    @PreAuthorize("hasRole('SUPER_ADMIN')")
    public ResponseEntity<Map<String, Object>> updateModules(
            @PathVariable Long id,
            @RequestBody(required = false) UpdateEntrepriseModulesRequest request,
            Authentication authentication) {
        entrepriseService.findById(id);

        List<Long> activeModuleIds = request == null ? List.of() : request.getActiveModuleIds();
        EntrepriseModuleService.ModuleUpdateResult result =
            moduleService.setActiveModules(id, activeModuleIds, actorOf(authentication));

        List<Map<String, Object>> modules = moduleService.modulesForEntreprise(id).stream()
            .map(this::toActivationRow)
            .collect(Collectors.toList());

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("entrepriseId", result.entrepriseId());
        body.put("modulesActifs", result.modulesActifs());
        body.put("activees", result.activees());
        body.put("desactivees", result.desactivees());
        body.put("modules", modules);
        return ResponseEntity.ok(body);
    }

    // ------------------------------------------------------------------

    private Map<String, Object> toCatalogueRow(ModuleEntity module) {
        Map<String, Object> row = new LinkedHashMap<>();
        row.put("moduleId", module.getId());
        row.put("nom", module.getNom());
        row.put("parent", moduleService.parentOf(module.getNom()));
        row.put("visible", Boolean.TRUE.equals(module.getVisible()));
        return row;
    }

    private Map<String, Object> toActivationRow(EntrepriseModuleService.ModuleActivationRow row) {
        Map<String, Object> map = new LinkedHashMap<>();
        map.put("moduleId", row.moduleId());
        map.put("nom", row.nom());
        map.put("parent", row.parent());
        map.put("visible", row.visible());
        map.put("actif", row.actif());
        return map;
    }

    private static String actorOf(Authentication authentication) {
        return authentication != null && authentication.getName() != null
            ? authentication.getName() : "inconnu";
    }
}
