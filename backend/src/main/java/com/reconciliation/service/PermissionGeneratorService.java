package com.reconciliation.service;

import com.reconciliation.entity.ModuleEntity;
import com.reconciliation.entity.PermissionEntity;
import com.reconciliation.entity.ModulePermissionEntity;
import com.reconciliation.repository.ModuleRepository;
import com.reconciliation.repository.PermissionRepository;
import com.reconciliation.repository.ModulePermissionRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.ApplicationContext;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.method.HandlerMethod;
import org.springframework.web.servlet.mvc.method.RequestMappingInfo;
import org.springframework.web.servlet.mvc.method.annotation.RequestMappingHandlerMapping;
import org.springframework.web.util.pattern.PathPattern;

import java.lang.reflect.Method;
import java.util.*;

@Service
public class PermissionGeneratorService {

    @Autowired
    private ApplicationContext applicationContext;

    @Autowired
    private PermissionRepository permissionRepository;

    @Autowired
    private ModuleRepository moduleRepository;
    
    @Autowired
    private ModulePermissionRepository modulePermissionRepository;

    /**
     * Génère automatiquement les permissions pour tous les modules
     * en analysant les contrôleurs Spring
     */
    @Transactional
    public Map<String, Object> generatePermissionsForAllModules() {
        Map<String, Object> result = new HashMap<>();
        List<String> createdPermissions = new ArrayList<>();
        List<String> skippedPermissions = new ArrayList<>();
        int totalCreated = 0;

        // Cartographie des chemins d'API vers les noms de modules
        Map<String, String> apiToModuleMap = createApiToModuleMapping();

        // Obtenir tous les contrôleurs
        Map<String, Object> controllers = applicationContext.getBeansWithAnnotation(RestController.class);

        for (Object controller : controllers.values()) {
            Class<?> controllerClass = controller.getClass();
            
            // Ignorer les classes proxy Spring
            if (controllerClass.getName().contains("$")) {
                controllerClass = controllerClass.getSuperclass();
            }
            
            // Obtenir le RequestMapping de la classe
            RequestMapping classMapping = controllerClass.getAnnotation(RequestMapping.class);
            String basePath = classMapping != null && classMapping.value().length > 0 
                ? classMapping.value()[0] 
                : "";

            // Analyser toutes les méthodes avec des annotations de mapping
            Method[] methods = controllerClass.getDeclaredMethods();
            for (Method method : methods) {
                try {
                    List<PermissionInfo> permissions = extractPermissionsFromMethod(method, basePath, apiToModuleMap);
                    
                    for (PermissionInfo permInfo : permissions) {
                        if (permInfo.moduleName == null || permInfo.permissionName == null) {
                            continue; // Ignorer si pas de module ou permission associée
                        }
                        boolean created = ensureModulePermissionAssociation(permInfo.moduleName, permInfo.permissionName);
                        if (created) {
                            createdPermissions.add(permInfo.permissionName + " (Module: " + permInfo.moduleName + ", Path: " + permInfo.path + ")");
                            totalCreated++;
                        }
                    }
                } catch (Exception e) {
                    System.err.println("Erreur lors de l'analyse de la méthode " + method.getName() + ": " + e.getMessage());
                }
            }
        }

        // Certains modules purement frontend n'ont pas encore d'endpoint dédié.
        // On leur associe au minimum "consulter" pour qu'ils apparaissent dans /permissions et /profils.
        if (ensureModulePermissionAssociation("Traitement", "consulter")) {
            createdPermissions.add("consulter (Module: Traitement, Source: manuel)");
            totalCreated++;
        }

        result.put("totalCreated", totalCreated);
        result.put("createdPermissions", createdPermissions);
        result.put("skippedPermissions", skippedPermissions);
        result.put("message", "Génération des permissions terminée. " + totalCreated + " nouvelle(s) permission(s) créée(s).");

        return result;
    }

    /**
     * Extrait les permissions d'une méthode de contrôleur
     */
    private List<PermissionInfo> extractPermissionsFromMethod(Method method, String basePath, Map<String, String> apiToModuleMap) {
        List<PermissionInfo> permissions = new ArrayList<>();

        // Analyser les annotations de mapping
        GetMapping getMapping = method.getAnnotation(GetMapping.class);
        PostMapping postMapping = method.getAnnotation(PostMapping.class);
        PutMapping putMapping = method.getAnnotation(PutMapping.class);
        DeleteMapping deleteMapping = method.getAnnotation(DeleteMapping.class);
        PatchMapping patchMapping = method.getAnnotation(PatchMapping.class);

        String methodPath = "";
        String httpMethod = "";
        String actionType = "";

        if (getMapping != null) {
            methodPath = getMapping.value().length > 0 ? getMapping.value()[0] : "";
            httpMethod = "GET";
            actionType = determineActionType(methodPath, method.getName(), "read");
        } else if (postMapping != null) {
            methodPath = postMapping.value().length > 0 ? postMapping.value()[0] : "";
            httpMethod = "POST";
            actionType = determineActionType(methodPath, method.getName(), "create");
        } else if (putMapping != null) {
            methodPath = putMapping.value().length > 0 ? putMapping.value()[0] : "";
            httpMethod = "PUT";
            actionType = determineActionType(methodPath, method.getName(), "update");
        } else if (deleteMapping != null) {
            methodPath = deleteMapping.value().length > 0 ? deleteMapping.value()[0] : "";
            httpMethod = "DELETE";
            actionType = determineActionType(methodPath, method.getName(), "delete");
        } else if (patchMapping != null) {
            methodPath = patchMapping.value().length > 0 ? patchMapping.value()[0] : "";
            httpMethod = "PATCH";
            actionType = determineActionType(methodPath, method.getName(), "update");
        }

        if (httpMethod.isEmpty()) {
            return permissions; // Pas d'annotation de mapping HTTP
        }

        // Construire le chemin complet
        String fullPath = (basePath + methodPath).replace("//", "/");
        // Nettoyer le chemin des paramètres dynamiques pour la correspondance
        String cleanPath = fullPath.replaceAll("\\{[^}]+\\}", "");
        
        // Trouver le module correspondant
        String moduleName = findModuleForPath(cleanPath, apiToModuleMap);

        if (moduleName != null && actionType != null && !actionType.isEmpty()) {
            PermissionInfo permInfo = new PermissionInfo();
            permInfo.moduleName = moduleName;
            permInfo.permissionName = actionType;
            permInfo.httpMethod = httpMethod;
            permInfo.path = fullPath;
            permissions.add(permInfo);
        }

        return permissions;
    }

    private boolean ensureModulePermissionAssociation(String moduleName, String permissionName) {
        ModuleEntity module = moduleRepository.findByNom(moduleName);
        if (module == null) {
            module = new ModuleEntity();
            module.setNom(moduleName);
            module = moduleRepository.save(module);
        }

        PermissionEntity permission = permissionRepository.findByNom(permissionName);
        boolean permissionCreated = false;
        if (permission == null) {
            PermissionEntity newPermission = new PermissionEntity();
            newPermission.setNom(permissionName);
            permission = permissionRepository.save(newPermission);
            permissionCreated = true;
        }

        final PermissionEntity finalPermission = permission;
        final ModuleEntity finalModule = module;

        boolean associationExists = modulePermissionRepository.findByModuleId(finalModule.getId()).stream()
            .anyMatch(mp -> mp.getPermission() != null && mp.getPermission().getId().equals(finalPermission.getId()));

        if (!associationExists) {
            ModulePermissionEntity modulePermission = new ModulePermissionEntity();
            modulePermission.setModule(finalModule);
            modulePermission.setPermission(finalPermission);
            modulePermissionRepository.save(modulePermission);
        }

        return permissionCreated;
    }

    /**
     * Détermine le type d'action basé sur le chemin et le nom de la méthode
     * Cette méthode fait une analyse plus approfondie pour extraire toutes les actions spécifiques
     */
    private String determineActionType(String path, String methodName, String defaultAction) {
        String lowerPath = path.toLowerCase();
        String lowerMethodName = methodName.toLowerCase();
        
        // Construire le nom d'action spécifique basé sur le chemin et la méthode
        StringBuilder actionBuilder = new StringBuilder();

        // Analyser le chemin pour extraire les segments d'action
        String[] pathSegments = lowerPath.split("/");
        List<String> actionSegments = new ArrayList<>();
        
        // Extraire les segments significatifs du chemin
        for (String segment : pathSegments) {
            segment = segment.trim();
            if (segment.isEmpty() || segment.matches("\\{[^}]+\\}") || segment.matches("\\d+")) {
                continue; // Ignorer les paramètres et IDs numériques
            }
            
            // Ajouter les segments significatifs
            if (segment.length() > 0) {
                actionSegments.add(segment);
            }
        }
        
        // Analyser les actions spécifiques dans le chemin
        String specificAction = extractSpecificAction(lowerPath, lowerMethodName, defaultAction);
        
        // Si on a une action spécifique, l'utiliser
        if (specificAction != null && !specificAction.isEmpty()) {
            return specificAction;
        }
        
        // Sinon, construire l'action à partir des segments
        if (!actionSegments.isEmpty()) {
            // Prendre le dernier segment significatif comme action spécifique
            String lastSegment = actionSegments.get(actionSegments.size() - 1);
            
            // Combiner avec l'action de base
            String baseAction = getBaseAction(defaultAction);
            if (!lastSegment.equals(baseAction) && !lastSegment.equals("liste") && !lastSegment.equals("list")) {
                return baseAction + "_" + lastSegment;
            }
        }
        
        // Actions standard
        return getBaseAction(defaultAction);
    }
    
    /**
     * Extrait une action spécifique basée sur des patterns connus
     */
    private String extractSpecificAction(String lowerPath, String lowerMethodName, String defaultAction) {
        if (lowerPath.contains("bo-partenaire-controle-interne")) {
            if (lowerPath.contains("/validate") || "validate".equals(lowerMethodName)) {
                return "valider_controle_interne";
            }
            if (lowerPath.contains("/revoke") || "revoke".equals(lowerMethodName)) {
                return "annuler_validation_controle_interne";
            }
            if (lowerPath.contains("/send-email") || lowerMethodName.contains("sendcommentemail")) {
                return "envoyer_email_controle_interne";
            }
            if (lowerPath.contains("/comment")) {
                if ("read".equals(defaultAction) || "get".equals(defaultAction) || lowerMethodName.startsWith("get")) {
                    return "consulter_commentaire_controle_interne";
                }
                return "modifier_commentaire_controle_interne";
            }
            if ("read".equals(defaultAction)) {
                return "consulter";
            }
        }

        // Les endpoints de filtre doivent exposer explicitement la permission "filtrer",
        // y compris lorsqu'ils alimentent le Dashboard.
        if (lowerPath.contains("filter") || lowerMethodName.contains("filter")) {
            if (lowerPath.contains("operations")) {
                return "filtrer_operations";
            } else if (lowerPath.contains("operations-bancaires")) {
                return "filtrer_operations_bancaires";
            }
            return "filtrer";
        }

        // Dashboard : lecture simple des métriques/cartes
        if (lowerPath.contains("dashboard") || lowerMethodName.contains("dashboard")) {
            return "consulter";
        }
        if (lowerPath.startsWith("/api/result8rec") && (lowerPath.contains("/bulk") || lowerPath.endsWith("bulk"))) {
            return "bulk";
        }

        // Patterns d'upload/import
        if (lowerPath.contains("upload") || lowerMethodName.contains("upload")) {
            if (lowerPath.contains("operations")) {
                return "importer_operations";
            } else if (lowerPath.contains("operations-bancaires")) {
                return "importer_operations_bancaires";
            } else if (lowerPath.contains("reconciliation")) {
                return "importer_fichier_reconciliation";
            }
            return "importer";
        }
        
        // Patterns de template/download
        if (lowerPath.contains("template") || lowerPath.contains("download")) {
            if (lowerPath.contains("operations")) {
                return "telecharger_template_operations";
            } else if (lowerPath.contains("operations-bancaires")) {
                return "telecharger_template_operations_bancaires";
            }
            return "telecharger_template";
        }
        
        // Patterns de création spécifiques
        if (lowerMethodName.contains("create") || lowerPath.contains("create") || defaultAction.equals("create")) {
            if (lowerPath.contains("manual-from-form") || lowerMethodName.contains("form")) {
                return "creer_operation_formulaire";
            } else if (lowerPath.contains("manual-with-four-operations") || lowerMethodName.contains("four")) {
                return "creer_operation_quatre_operations";
            } else if (lowerPath.contains("operation") && !lowerPath.contains("operations")) {
                return "creer_operation";
            } else if (lowerPath.contains("operations-bancaires")) {
                return "creer_operation_bancaire";
            } else if (lowerPath.contains("compte")) {
                return "creer_compte";
            } else if (lowerPath.contains("profil")) {
                return "creer_profil";
            } else if (lowerPath.contains("module")) {
                return "creer_module";
            } else if (lowerPath.contains("permission")) {
                return "creer_permission";
            }
        }
        
        // Patterns de modification spécifiques
        if (lowerMethodName.contains("update") || lowerPath.contains("update") || defaultAction.equals("update")) {
            if (lowerPath.contains("statut") || lowerMethodName.contains("statut")) {
                if (lowerPath.contains("bulk")) {
                    return "modifier_statut_bulk";
                }
                return "modifier_statut";
            } else if (lowerPath.contains("recon-status") || lowerMethodName.contains("recon")) {
                return "modifier_statut_reconciliation";
            } else if (lowerPath.contains("validate") || lowerMethodName.contains("validate")) {
                return "valider_operation";
            } else if (lowerPath.contains("reject") || lowerMethodName.contains("reject")) {
                return "rejeter_operation";
            } else if (lowerPath.contains("cancel") || lowerMethodName.contains("cancel")) {
                return "annuler_operation";
            }
        }
        
        // Patterns de réconciliation
        if (lowerPath.contains("mark-ok")) {
            if (lowerPath.contains("bulk")) {
                return "marquer_ok_bulk";
            } else if (lowerPath.contains("unmark")) {
                return "annuler_marquer_ok_bulk";
            }
            return "marquer_ok";
        }
        
        if (lowerPath.contains("unmark-ok")) {
            return "annuler_marquer_ok";
        }
        
        if (lowerPath.contains("status") && defaultAction.equals("create")) {
            if (lowerPath.contains("bulk")) {
                return "enregistrer_statut_bulk";
            }
            return "enregistrer_statut_reconciliation";
        }
        
        if (lowerPath.contains("reconcile") || lowerMethodName.contains("reconcile")) {
            return "lancer_reconciliation";
        }
        
        if (lowerPath.contains("execute-magic") || lowerMethodName.contains("magic")) {
            return "executer_reconciliation_magique";
        }
        
        if (lowerPath.contains("analyze-keys") || lowerMethodName.contains("analyze")) {
            return "analyser_cles_reconciliation";
        }
        
        if (lowerPath.contains("save-summary") || lowerMethodName.contains("summary")) {
            return "sauvegarder_resume_reconciliation";
        }
        
        // Patterns de statistiques
        if (lowerPath.contains("stats") || lowerPath.contains("statistiques") || lowerMethodName.contains("stat")) {
            if (lowerPath.contains("by-type")) {
                if (lowerPath.contains("filtered")) {
                    return "consulter_statistiques_par_type_filtre";
                }
                return "consulter_statistiques_par_type";
            }
            return "consulter_statistiques";
        }
        
        // Patterns de suppression
        if (lowerMethodName.contains("delete") || lowerPath.contains("delete") || defaultAction.equals("delete")) {
            if (lowerPath.contains("batch") || lowerMethodName.contains("batch")) {
                return "supprimer_operations_batch";
            }
            return "supprimer";
        }
        
        // Patterns de lecture spécifiques
        if (lowerPath.contains("with-frais") || lowerMethodName.contains("frais")) {
            return "consulter_avec_frais";
        }
        
        if (lowerPath.contains("recent") || lowerMethodName.contains("recent")) {
            return "consulter_recent";
        }
        
        if (lowerPath.contains("progress") || lowerMethodName.contains("progress")) {
            return "consulter_progression_reconciliation";
        }
        
        if (lowerPath.contains("results") || lowerMethodName.contains("result")) {
            return "consulter_resultats_reconciliation";
        }
        
        if (lowerPath.contains("ok-keys")) {
            return "consulter_cles_ok";
        }
        
        if (lowerPath.contains("status") && defaultAction.equals("read")) {
            return "consulter_statuts_reconciliation";
        }
        
        // Patterns de synchronisation
        if (lowerPath.contains("synchronize") || lowerMethodName.contains("synchronize")) {
            return "synchroniser_soldes";
        }
        
        if (lowerPath.contains("recalculate") || lowerMethodName.contains("recalculate")) {
            return "recalculer_solde_cloture";
        }
        
        // Patterns de correction
        if (lowerPath.contains("correct") || lowerMethodName.contains("correct")) {
            return "corriger_frais";
        }
        
        // Patterns de can-process/solde-impact
        if (lowerPath.contains("can-process") || lowerMethodName.contains("canprocess")) {
            return "verifier_traitement_operation";
        }
        
        if (lowerPath.contains("solde-impact") || lowerMethodName.contains("soldeimpact")) {
            return "calculer_impact_solde";
        }
        
        return null; // Pas d'action spécifique trouvée
    }
    
    /**
     * Retourne l'action de base selon le type HTTP
     */
    private String getBaseAction(String defaultAction) {
        switch (defaultAction) {
            case "read":
                return "consulter";
            case "create":
                return "creer";
            case "update":
                return "modifier";
            case "delete":
                return "supprimer";
            default:
                return defaultAction;
        }
    }

    /**
     * Trouve le module correspondant à un chemin d'API.
     * Utilise la correspondance la plus longue (plus spécifique) pour que
     * /api/statistics/dashboard-metrics → Dashboard et non Statistiques.
     */
    private String findModuleForPath(String path, Map<String, String> apiToModuleMap) {
        String bestMatch = null;
        int bestLength = -1;
        for (Map.Entry<String, String> entry : apiToModuleMap.entrySet()) {
            if (path.startsWith(entry.getKey()) && entry.getKey().length() > bestLength) {
                bestMatch = entry.getValue();
                bestLength = entry.getKey().length();
            }
        }
        return bestMatch;
    }

    /**
     * Crée la cartographie entre les chemins d'API et les modules
     */
    private Map<String, String> createApiToModuleMapping() {
        Map<String, String> mapping = new HashMap<>();
        
        // Chemins Dashboard (avant /api/statistics pour priorité) :
        mapping.put("/api/statistics/dashboard-metrics", "Dashboard");
        mapping.put("/api/statistics/filter-options", "Dashboard");
        mapping.put("/api/statistics/detailed-metrics", "Dashboard");
        mapping.put("/api/statistics/transaction-created-stats", "Dashboard");
        mapping.put("/api/result8rec/filters", "Dashboard");
        mapping.put("/api/result8rec", "Résultats");
        mapping.put("/api/reconciliation-report/manual-trx/range", "Dashboard");
        mapping.put("/api/service-references/dashboard", "Dashboard");
        mapping.put("/api/dashboard", "Dashboard");
        mapping.put("/api/reconciliation-dashboard", "Dashboard");
        mapping.put("/api/banque-dashboard", "Dashboard");
        mapping.put("/api/report-dashboard", "Résultats");
        mapping.put("/api/ecart-bo-summary", "Résultats");
        
        // Autres routes
        mapping.put("/api/operations", "Opérations");
        mapping.put("/api/operations-bancaires", "Opérations");
        mapping.put("/api/comptes", "Comptes");
        mapping.put("/api/service-balance", "Comptes");
        mapping.put("/api/redevance", "Comptes");
        mapping.put("/api/flux", "Comptes");
        mapping.put("/api/supply", "Comptes");
        mapping.put("/api/predictions", "Comptes");
        mapping.put("/api/frais", "Frais");
        mapping.put("/api/commission", "Frais");
        mapping.put("/api/reconciliation", "Réconciliation");
        mapping.put("/api/reconciliation-launcher", "Réconciliation");
        mapping.put("/api/stats", "Statistiques");
        mapping.put("/api/statistics", "Statistiques");
        mapping.put("/api/ranking", "Classements");
        mapping.put("/api/rankings", "Classements");
        mapping.put("/api/ecart-solde", "TSOP");
        mapping.put("/api/trx-sf", "TRX SF");
        mapping.put("/api/impact-op", "Impact OP");
        mapping.put("/api/banque", "BANQUE");
        mapping.put("/api/comptabilite", "Comptabilité");
        mapping.put("/api/auto-processing-models", "Modèles");
        mapping.put("/api/auto-processing", "Modèles");
        mapping.put("/api/model-management", "Modèles");
        mapping.put("/api/file-watcher", "Modèles");
        mapping.put("/api/profils", "Profil");
        mapping.put("/api/users", "Utilisateur");
        mapping.put("/api/log-utilisateur", "Log utilisateur");
        mapping.put("/api/traitement", "Traitement");
        mapping.put("/api/results", "Résultats");
        mapping.put("/api/reconciliation-report", "Résultats");
        mapping.put("/api/bo-partenaire-controle-interne", "Résultats");
        mapping.put("/api/aide", "AIDE");
        mapping.put("/api/guide-nodes", "AIDE");
        mapping.put("/api/guide-documents", "AIDE");
        mapping.put("/api/sop-nodes", "AIDE");
        mapping.put("/api/sop-documents", "AIDE");
        mapping.put("/api/agency-summary", "Statistiques");
        mapping.put("/api/compte-solde-bo", "Réconciliation");
        mapping.put("/api/compte-solde-cloture", "Réconciliation");
        mapping.put("/api/suivi-ecart", "TSOP");
        mapping.put("/api/frais-transaction", "Frais");
        
        return mapping;
    }

    /**
     * Analyse tous les contrôleurs et retourne toutes les actions disponibles par module
     * Cette méthode fournit une vue détaillée de toutes les actions possibles
     */
    public Map<String, Object> analyzeAllModuleActions() {
        Map<String, Object> result = new HashMap<>();
        Map<String, List<Map<String, Object>>> moduleActions = new HashMap<>();
        
        // Cartographie des chemins d'API vers les noms de modules
        Map<String, String> apiToModuleMap = createApiToModuleMapping();

        List<PermissionInfo> discovered = discoverAllPermissionInfos(apiToModuleMap);

        for (PermissionInfo permInfo : discovered) {
            if (permInfo.moduleName == null || permInfo.permissionName == null) {
                continue;
            }
            moduleActions.computeIfAbsent(permInfo.moduleName, k -> new ArrayList<>())
                .add(Map.of(
                    "action", permInfo.permissionName,
                    "httpMethod", permInfo.httpMethod,
                    "path", permInfo.path,
                    "controller", permInfo.controllerName != null ? permInfo.controllerName : "",
                    "method", permInfo.methodName != null ? permInfo.methodName : ""
                ));
        }
        
        // Compter les actions par module
        Map<String, Integer> actionCounts = new HashMap<>();
        for (Map.Entry<String, List<Map<String, Object>>> entry : moduleActions.entrySet()) {
            actionCounts.put(entry.getKey(), entry.getValue().size());
        }
        
        result.put("modules", moduleActions);
        result.put("actionCounts", actionCounts);
        result.put("totalModules", moduleActions.size());
        result.put("totalActions", moduleActions.values().stream().mapToInt(List::size).sum());
        
        return result;
    }
    
    /**
     * Retourne toutes les actions disponibles pour un module spécifique
     */
    public List<Map<String, Object>> getActionsForModule(String moduleName) {
        return getActionsForModule(moduleName, null);
    }

    public List<Map<String, Object>> getActionsForModule(String moduleName, List<String> fallbackPrefixes) {
        Optional<com.reconciliation.config.NavigationSubmenuRegistry.SubmenuAccessDefinition> submenuDefinition =
            com.reconciliation.config.NavigationSubmenuRegistry.findByAccessModuleName(moduleName);

        if (submenuDefinition.isPresent()) {
            List<String> prefixes = com.reconciliation.config.NavigationSubmenuRegistry.resolveActionPathPrefixes(submenuDefinition.get());
            List<Map<String, Object>> actions = filterActionsByPrefixes(collectAllDiscoveredActions(), prefixes);
            if (actions.isEmpty()) {
                actions = com.reconciliation.config.NavigationSubmenuRegistry.buildFallbackActions(submenuDefinition.get());
            }
            return excludeAdminOnlyControleInterneActions(actions);
        }

        if (moduleName != null && moduleName.contains(com.reconciliation.config.NavigationSubmenuRegistry.SEPARATOR)) {
            List<String> prefixes = fallbackPrefixes != null && !fallbackPrefixes.isEmpty()
                ? fallbackPrefixes
                : List.of();
            if (!prefixes.isEmpty()) {
                return filterActionsByPrefixes(collectAllDiscoveredActions(), prefixes);
            }
        }

        Map<String, Object> allActions = analyzeAllModuleActions();
        @SuppressWarnings("unchecked")
        Map<String, List<Map<String, Object>>> modules = (Map<String, List<Map<String, Object>>>) allActions.get("modules");
        return modules.getOrDefault(moduleName, new ArrayList<>());
    }

    /**
     * Retourne les actions d'un sous-menu filtrées par préfixes API (tous modules confondus).
     */
    public List<Map<String, Object>> getActionsForSubmenuModule(String parentModuleName, List<String> apiPathPrefixes) {
        return filterActionsByPrefixes(collectAllDiscoveredActions(), apiPathPrefixes);
    }

    private List<Map<String, Object>> collectAllDiscoveredActions() {
        Map<String, Object> allActions = analyzeAllModuleActions();
        @SuppressWarnings("unchecked")
        Map<String, List<Map<String, Object>>> modules = (Map<String, List<Map<String, Object>>>) allActions.get("modules");
        List<Map<String, Object>> combined = new ArrayList<>();
        for (List<Map<String, Object>> moduleActionList : modules.values()) {
            combined.addAll(moduleActionList);
        }
        return combined;
    }

    private List<PermissionInfo> discoverAllPermissionInfos(Map<String, String> apiToModuleMap) {
        List<PermissionInfo> fromHandlerMapping = discoverPermissionInfosFromHandlerMapping(apiToModuleMap);
        if (!fromHandlerMapping.isEmpty()) {
            return fromHandlerMapping;
        }
        return discoverPermissionInfosFromReflection(apiToModuleMap);
    }

    private List<PermissionInfo> discoverPermissionInfosFromHandlerMapping(Map<String, String> apiToModuleMap) {
        RequestMappingHandlerMapping handlerMapping;
        try {
            handlerMapping = applicationContext.getBean(RequestMappingHandlerMapping.class);
        } catch (Exception ex) {
            return List.of();
        }

        List<PermissionInfo> permissions = new ArrayList<>();
        Set<String> seen = new LinkedHashSet<>();

        for (Map.Entry<RequestMappingInfo, HandlerMethod> entry : handlerMapping.getHandlerMethods().entrySet()) {
            RequestMappingInfo mappingInfo = entry.getKey();
            HandlerMethod handlerMethod = entry.getValue();
            if (mappingInfo.getPathPatternsCondition() == null) {
                continue;
            }

            Set<RequestMethod> requestMethods = mappingInfo.getMethodsCondition().getMethods();
            if (requestMethods == null || requestMethods.isEmpty()) {
                requestMethods = EnumSet.of(RequestMethod.GET);
            }

            for (PathPattern pattern : mappingInfo.getPathPatternsCondition().getPatterns()) {
                String fullPath = pattern.getPatternString();
                if (!fullPath.startsWith("/api/")) {
                    continue;
                }
                String cleanPath = fullPath.replaceAll("\\{[^}]+\\}", "");
                String moduleName = findModuleForPath(cleanPath, apiToModuleMap);
                if (moduleName == null) {
                    continue;
                }

                for (RequestMethod requestMethod : requestMethods) {
                    String httpMethod = requestMethod.name();
                    String defaultAction = mapHttpMethodToDefaultAction(httpMethod);
                    String actionType = determineActionType(
                        cleanPath,
                        handlerMethod.getMethod().getName(),
                        defaultAction
                    );
                    if (actionType == null || actionType.isBlank()) {
                        continue;
                    }

                    String dedupeKey = actionType + "|" + cleanPath + "|" + httpMethod;
                    if (!seen.add(dedupeKey)) {
                        continue;
                    }

                    PermissionInfo permInfo = new PermissionInfo();
                    permInfo.moduleName = moduleName;
                    permInfo.permissionName = actionType;
                    permInfo.httpMethod = httpMethod;
                    permInfo.path = cleanPath;
                    permInfo.controllerName = handlerMethod.getBeanType().getSimpleName();
                    permInfo.methodName = handlerMethod.getMethod().getName();
                    permissions.add(permInfo);
                }
            }
        }

        return permissions;
    }

    private List<PermissionInfo> discoverPermissionInfosFromReflection(Map<String, String> apiToModuleMap) {
        List<PermissionInfo> permissions = new ArrayList<>();
        Map<String, Object> controllers = applicationContext.getBeansWithAnnotation(RestController.class);

        for (Object controller : controllers.values()) {
            Class<?> controllerClass = controller.getClass();
            if (controllerClass.getName().contains("$")) {
                controllerClass = controllerClass.getSuperclass();
            }

            RequestMapping classMapping = controllerClass.getAnnotation(RequestMapping.class);
            String basePath = classMapping != null && classMapping.value().length > 0
                ? classMapping.value()[0]
                : "";

            for (Method method : controllerClass.getDeclaredMethods()) {
                try {
                    permissions.addAll(extractPermissionsFromMethod(method, basePath, apiToModuleMap));
                } catch (Exception e) {
                    System.err.println("Erreur lors de l'analyse de la méthode " + method.getName() + ": " + e.getMessage());
                }
            }
        }

        return permissions;
    }

    private String mapHttpMethodToDefaultAction(String httpMethod) {
        if (httpMethod == null) {
            return "read";
        }
        return switch (httpMethod.toUpperCase(Locale.ROOT)) {
            case "POST" -> "create";
            case "PUT", "PATCH" -> "update";
            case "DELETE" -> "delete";
            default -> "read";
        };
    }

    /**
     * Synchronise les permissions d'un module à partir des actions détectées dans les contrôleurs.
     */
    @Transactional
    public Map<String, Object> syncModuleActions(String moduleName) {
        if (moduleName == null || moduleName.isBlank()) {
            throw new IllegalArgumentException("Le nom du module est obligatoire.");
        }

        List<Map<String, Object>> actions = getActionsForModule(moduleName);
        int permissionsCreated = 0;
        for (Map<String, Object> action : actions) {
            Object actionName = action.get("action");
            if (actionName != null && ensureModulePermissionAssociation(moduleName, String.valueOf(actionName))) {
                permissionsCreated++;
            }
        }

        Map<String, Object> result = new HashMap<>();
        result.put("moduleName", moduleName);
        result.put("actionsCount", actions.size());
        result.put("permissionsCreated", permissionsCreated);
        result.put("message", actions.size() + " action(s) synchronisée(s) pour le module « " + moduleName + " ».");
        return result;
    }

    /**
     * Synchronise les permissions d'un sous-menu à partir du module parent et des préfixes API.
     */
    @Transactional
    public Map<String, Object> syncSubmenuModuleActions(String accessModuleName, String parentModuleName, List<String> apiPathPrefixes) {
        if (accessModuleName == null || accessModuleName.isBlank()) {
            throw new IllegalArgumentException("Le module de navigation est obligatoire.");
        }
        if (parentModuleName == null || parentModuleName.isBlank()) {
            throw new IllegalArgumentException("Le module parent est obligatoire.");
        }

        List<String> actionPrefixes = com.reconciliation.config.NavigationSubmenuRegistry.findByAccessModuleName(accessModuleName)
            .map(com.reconciliation.config.NavigationSubmenuRegistry::resolveActionPathPrefixes)
            .orElse(apiPathPrefixes != null ? apiPathPrefixes : List.of());

        List<Map<String, Object>> actions = getActionsForModule(accessModuleName, actionPrefixes);
        int permissionsCreated = 0;
        for (Map<String, Object> action : actions) {
            Object actionName = action.get("action");
            if (actionName != null && ensureModulePermissionAssociation(accessModuleName, String.valueOf(actionName))) {
                permissionsCreated++;
            }
        }

        Map<String, Object> result = new HashMap<>();
        result.put("moduleName", accessModuleName);
        result.put("parentModuleName", parentModuleName);
        result.put("actionsCount", actions.size());
        result.put("permissionsCreated", permissionsCreated);
        result.put("message", actions.size() + " action(s) synchronisée(s) pour le sous-menu « " + accessModuleName + " ».");
        return result;
    }

    private List<Map<String, Object>> filterActionsByPrefixes(List<Map<String, Object>> actions, List<String> apiPathPrefixes) {
        if (actions == null || actions.isEmpty()) {
            return new ArrayList<>();
        }
        if (apiPathPrefixes == null || apiPathPrefixes.isEmpty()) {
            return new ArrayList<>(actions);
        }

        List<Map<String, Object>> filtered = new ArrayList<>();
        Set<String> seenActions = new LinkedHashSet<>();
        for (Map<String, Object> action : actions) {
            Object pathValue = action.get("path");
            String path = pathValue != null ? String.valueOf(pathValue) : "";
            if (!com.reconciliation.config.NavigationSubmenuRegistry.matchesApiPath(path, apiPathPrefixes)) {
                continue;
            }
            Object actionName = action.get("action");
            if (actionName == null) {
                continue;
            }
            String actionKey = String.valueOf(actionName);
            if (seenActions.add(actionKey)) {
                filtered.add(action);
            }
        }
        return filtered;
    }

    /** L'annulation de validation est réservée aux administrateurs (hors profils). */
    private List<Map<String, Object>> excludeAdminOnlyControleInterneActions(List<Map<String, Object>> actions) {
        if (actions == null || actions.isEmpty()) {
            return actions != null ? actions : new ArrayList<>();
        }
        List<Map<String, Object>> filtered = new ArrayList<>();
        for (Map<String, Object> action : actions) {
            Object actionName = action.get("action");
            if (actionName != null && "annuler_validation_controle_interne".equals(String.valueOf(actionName))) {
                continue;
            }
            filtered.add(action);
        }
        return filtered;
    }

    /**
     * Classe interne pour stocker les informations de permission
     */
    private static class PermissionInfo {
        String moduleName;
        String permissionName;
        String httpMethod;
        String path;
        String controllerName;
        String methodName;
    }
}

