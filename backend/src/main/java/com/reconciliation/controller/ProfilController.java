package com.reconciliation.controller;

import com.reconciliation.entity.*;
import com.reconciliation.service.ProfilService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;
import java.util.HashMap;

@RestController
@RequestMapping("/api/profils")
@CrossOrigin(origins = {"http://localhost:4200", "http://172.214.108.8:4200"})
public class ProfilController {
    @Autowired
    private ProfilService profilService;
    
    @Autowired
    private com.reconciliation.service.PermissionGeneratorService permissionGeneratorService;

    // Profils
    @GetMapping
    public List<ProfilEntity> getAllProfils() {
        return profilService.getAllProfils();
    }

    @PostMapping
    public ProfilEntity createProfil(@RequestBody ProfilEntity profil) {
        return profilService.createProfil(profil);
    }

    @PutMapping("/{id}")
    public ProfilEntity updateProfil(@PathVariable Long id, @RequestBody ProfilEntity profil) {
        profil.setId(id);
        return profilService.updateProfil(profil);
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Map<String, String>> deleteProfil(@PathVariable Long id) {
        System.out.println("🗑️ DELETE /api/profils/" + id + " - Requête reçue");
        try {
            profilService.deleteProfil(id);
            System.out.println("✅ Profil supprimé avec succès: ID " + id);
            Map<String, String> response = new HashMap<>();
            response.put("message", "Profil supprimé avec succès");
            response.put("id", id.toString());
            return ResponseEntity.ok(response);
        } catch (RuntimeException e) {
            System.out.println("❌ Erreur lors de la suppression: " + e.getMessage());
            Map<String, String> response = new HashMap<>();
            response.put("error", e.getMessage());
            return ResponseEntity.badRequest().body(response);
        } catch (Exception e) {
            System.out.println("❌ Erreur inattendue lors de la suppression: " + e.getMessage());
            e.printStackTrace();
            Map<String, String> response = new HashMap<>();
            response.put("error", resolveDeleteErrorMessage(e));
            return ResponseEntity.badRequest().body(response);
        }
    }

    private String resolveDeleteErrorMessage(Exception e) {
        Throwable cause = e;
        while (cause.getCause() != null) {
            cause = cause.getCause();
        }
        String message = cause.getMessage();
        if (message != null && message.contains("rollback-only")) {
            return "La suppression a échoué à cause d'une dépendance active. Vérifiez qu'aucun utilisateur n'est associé à ce profil.";
        }
        if (message != null && !message.isBlank()) {
            return message;
        }
        return "Erreur lors de la suppression du profil";
    }

    // Modules
    @GetMapping("/modules")
    public List<ModuleEntity> getAllModules() {
        return profilService.getAllModules();
    }

    @PostMapping("/modules")
    public ModuleEntity createModule(@RequestBody ModuleEntity module) {
        return profilService.createModule(module);
    }

    @PutMapping("/modules/{id}")
    public ModuleEntity updateModule(@PathVariable Long id, @RequestBody ModuleEntity module) {
        module.setId(id);
        return profilService.updateModule(module);
    }

    @DeleteMapping("/modules/{id}")
    public ResponseEntity<Map<String, String>> deleteModule(@PathVariable Long id) {
        System.out.println("🗑️ DELETE /api/profils/modules/" + id + " - Requête reçue");
        try {
            profilService.deleteModule(id);
            System.out.println("✅ Module supprimé avec succès: ID " + id);
            Map<String, String> response = new HashMap<>();
            response.put("message", "Module supprimé avec succès");
            response.put("id", id.toString());
            return ResponseEntity.ok(response);
        } catch (RuntimeException e) {
            System.out.println("❌ Erreur lors de la suppression: " + e.getMessage());
            Map<String, String> response = new HashMap<>();
            response.put("error", e.getMessage());
            return ResponseEntity.badRequest().body(response);
        } catch (Exception e) {
            System.out.println("❌ Erreur inattendue lors de la suppression: " + e.getMessage());
            e.printStackTrace();
            Map<String, String> response = new HashMap<>();
            response.put("error", "Erreur lors de la suppression du module");
            return ResponseEntity.internalServerError().body(response);
        }
    }

    // Permissions
    @GetMapping("/permissions")
    public List<PermissionEntity> getAllPermissions() {
        return profilService.getAllPermissions();
    }

    @PostMapping("/permissions")
    public PermissionEntity createPermission(@RequestBody PermissionEntity permission) {
        return profilService.createPermission(permission);
    }

    @DeleteMapping("/permissions/{id}")
    public ResponseEntity<Map<String, String>> deletePermission(@PathVariable Long id) {
        System.out.println("🗑️ DELETE /api/profils/permissions/" + id + " - Requête reçue");
        try {
            profilService.deletePermission(id);
            System.out.println("✅ Permission supprimée avec succès: ID " + id);
            Map<String, String> response = new HashMap<>();
            response.put("message", "Permission supprimée avec succès");
            response.put("id", id.toString());
            return ResponseEntity.ok(response);
        } catch (RuntimeException e) {
            System.out.println("❌ Erreur lors de la suppression: " + e.getMessage());
            Map<String, String> response = new HashMap<>();
            response.put("error", e.getMessage());
            return ResponseEntity.badRequest().body(response);
        } catch (Exception e) {
            System.out.println("❌ Erreur inattendue lors de la suppression: " + e.getMessage());
            e.printStackTrace();
            Map<String, String> response = new HashMap<>();
            response.put("error", "Erreur lors de la suppression de la permission");
            return ResponseEntity.internalServerError().body(response);
        }
    }

    // Attribution de droits à un profil
    @PostMapping("/{profilId}/droits")
    public ProfilPermissionEntity addPermissionToProfil(
            @PathVariable Long profilId,
            @RequestParam Long moduleId,
            @RequestParam Long permissionId) {
        return profilService.addPermissionToProfil(profilId, moduleId, permissionId);
    }

    // Attribution de plusieurs droits à un profil en une seule requête (pour éviter les erreurs 429)
    @PostMapping("/{profilId}/droits/batch")
    public ResponseEntity<List<ProfilPermissionEntity>> addMultiplePermissionsToProfil(
            @PathVariable Long profilId,
            @RequestParam Long moduleId,
            @RequestBody List<Long> permissionIds) {
        try {
            List<ProfilPermissionEntity> result = profilService.addMultiplePermissionsToProfil(profilId, moduleId, permissionIds);
            return ResponseEntity.ok(result);
        } catch (RuntimeException e) {
            return ResponseEntity.badRequest().build();
        }
    }

    @DeleteMapping("/droits/{profilPermissionId}")
    public void removePermissionFromProfil(@PathVariable Long profilPermissionId) {
        profilService.removePermissionFromProfil(profilPermissionId);
    }

    @GetMapping("/{profilId}/droits")
    public List<ProfilPermissionEntity> getPermissionsForProfil(@PathVariable Long profilId) {
        return profilService.getPermissionsForProfil(profilId);
    }

    @GetMapping("/modules/{moduleId}/permissions")
    public List<PermissionEntity> getPermissionsForModule(@PathVariable Long moduleId) {
        return profilService.getPermissionsForModule(moduleId);
    }

    @GetMapping("/permissions/by-module")
    public Map<String, List<PermissionEntity>> getPermissionsGroupedByModule() {
        return profilService.getPermissionsGroupedByModule();
    }

    @PostMapping("/permissions/generate")
    public ResponseEntity<Map<String, Object>> generatePermissions() {
        System.out.println("🔄 Génération automatique des permissions à partir des contrôleurs...");
        try {
            Map<String, Object> result = permissionGeneratorService.generatePermissionsForAllModules();
            System.out.println("✅ " + result.get("message"));
            return ResponseEntity.ok(result);
        } catch (Exception e) {
            System.err.println("❌ Erreur lors de la génération des permissions: " + e.getMessage());
            e.printStackTrace();
            Map<String, String> errorResponse = new HashMap<>();
            errorResponse.put("error", "Erreur lors de la génération des permissions: " + e.getMessage());
            return ResponseEntity.internalServerError().body(new HashMap<>(errorResponse));
        }
    }

    @GetMapping("/diagnostic")
    public Map<String, Object> diagnostic() {
        Map<String, Object> diagnostic = new HashMap<>();
        
        // Compter les modules
        List<ModuleEntity> modules = profilService.getAllModules();
        diagnostic.put("modulesCount", modules.size());
        diagnostic.put("modules", modules.stream().map(m -> Map.of("id", m.getId(), "nom", m.getNom())).toList());
        
        // Compter les permissions
        List<PermissionEntity> permissions = profilService.getAllPermissions();
        diagnostic.put("permissionsCount", permissions.size());
        diagnostic.put("permissions", permissions.stream().map(p -> Map.of("id", p.getId(), "nom", p.getNom())).toList());
        
        // Compter les associations module-permission
        long modulePermissionCount = 0;
        for (ModuleEntity module : modules) {
            List<PermissionEntity> modulePermissions = profilService.getPermissionsForModule(module.getId());
            modulePermissionCount += modulePermissions.size();
        }
        diagnostic.put("modulePermissionAssociations", modulePermissionCount);
        
        return diagnostic;
    }

    /**
     * Analyse approfondie de toutes les actions disponibles par module
     * Retourne toutes les actions spécifiques de chaque module détectées dans les contrôleurs
     */
    @GetMapping("/actions/analyse")
    public ResponseEntity<Map<String, Object>> analyzeAllModuleActions() {
        try {
            System.out.println("🔍 Analyse approfondie de toutes les actions par module...");
            Map<String, Object> result = permissionGeneratorService.analyzeAllModuleActions();
            System.out.println("✅ Analyse terminée: " + result.get("totalModules") + " modules, " + result.get("totalActions") + " actions");
            return ResponseEntity.ok(result);
        } catch (Exception e) {
            System.err.println("❌ Erreur lors de l'analyse des actions: " + e.getMessage());
            e.printStackTrace();
            Map<String, String> errorResponse = new HashMap<>();
            errorResponse.put("error", "Erreur lors de l'analyse des actions: " + e.getMessage());
            return ResponseEntity.internalServerError().body(new HashMap<>(errorResponse));
        }
    }

    /**
     * Retourne toutes les actions disponibles pour un module spécifique
     */
    @GetMapping("/actions/module/{moduleName:.+}")
    public ResponseEntity<List<Map<String, Object>>> getActionsForModule(
        @PathVariable String moduleName,
        @RequestParam(required = false) String prefixes
    ) {
        try {
            System.out.println("🔍 Récupération des actions pour le module: " + moduleName);
            List<String> fallbackPrefixes = parsePrefixesParam(prefixes);
            List<Map<String, Object>> actions = permissionGeneratorService.getActionsForModule(moduleName, fallbackPrefixes);
            System.out.println("✅ " + actions.size() + " actions trouvées pour le module " + moduleName);
            return ResponseEntity.ok(actions);
        } catch (Exception e) {
            System.err.println("❌ Erreur lors de la récupération des actions: " + e.getMessage());
            e.printStackTrace();
            return ResponseEntity.internalServerError().build();
        }
    }

    private List<String> parsePrefixesParam(String prefixes) {
        if (prefixes == null || prefixes.isBlank()) {
            return List.of();
        }
        return List.of(prefixes.split(","))
            .stream()
            .map(String::trim)
            .filter(value -> !value.isEmpty())
            .toList();
    }

    /**
     * Synchronise les permissions d'un module à partir des actions détectées dans les contrôleurs.
     */
    @PostMapping("/modules/{moduleName:.+}/sync-actions")
    public ResponseEntity<Map<String, Object>> syncModuleActions(@PathVariable String moduleName) {
        try {
            Map<String, Object> result = permissionGeneratorService.syncModuleActions(moduleName);
            return ResponseEntity.ok(result);
        } catch (IllegalArgumentException e) {
            Map<String, String> errorResponse = new HashMap<>();
            errorResponse.put("error", e.getMessage());
            return ResponseEntity.badRequest().body(new HashMap<>(errorResponse));
        } catch (Exception e) {
            System.err.println("❌ Erreur lors de la synchronisation des actions pour " + moduleName + ": " + e.getMessage());
            e.printStackTrace();
            Map<String, String> errorResponse = new HashMap<>();
            errorResponse.put("error", "Erreur lors de la synchronisation des actions: " + e.getMessage());
            return ResponseEntity.internalServerError().body(new HashMap<>(errorResponse));
        }
    }

    /**
     * Synchronise les permissions d'un sous-menu à partir du module parent et des préfixes API.
     */
    @PostMapping("/modules/{moduleName:.+}/sync-submenu-actions")
    public ResponseEntity<Map<String, Object>> syncSubmenuModuleActions(
        @PathVariable String moduleName,
        @RequestBody Map<String, Object> body
    ) {
        try {
            String parentModule = body.get("parentModule") != null ? String.valueOf(body.get("parentModule")) : null;
            @SuppressWarnings("unchecked")
            List<String> prefixes = body.get("prefixes") instanceof List<?> rawList
                ? rawList.stream().map(String::valueOf).toList()
                : List.of();
            Map<String, Object> result = permissionGeneratorService.syncSubmenuModuleActions(moduleName, parentModule, prefixes);
            return ResponseEntity.ok(result);
        } catch (IllegalArgumentException e) {
            Map<String, String> errorResponse = new HashMap<>();
            errorResponse.put("error", e.getMessage());
            return ResponseEntity.badRequest().body(new HashMap<>(errorResponse));
        } catch (Exception e) {
            System.err.println("❌ Erreur lors de la synchronisation des actions sous-menu pour " + moduleName + ": " + e.getMessage());
            e.printStackTrace();
            Map<String, String> errorResponse = new HashMap<>();
            errorResponse.put("error", "Erreur lors de la synchronisation des actions sous-menu: " + e.getMessage());
            return ResponseEntity.internalServerError().body(new HashMap<>(errorResponse));
        }
    }
} 