package com.reconciliation.service;

import com.reconciliation.entity.ProfilPermissionEntity;
import com.reconciliation.entity.UserEntity;
import com.reconciliation.entity.ModuleEntity;
import com.reconciliation.entity.PermissionEntity;
import com.reconciliation.repository.ProfilPermissionRepository;
import com.reconciliation.repository.UserRepository;
import com.reconciliation.repository.ModuleRepository;
import com.reconciliation.repository.PermissionRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.text.Normalizer;
import java.util.Comparator;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;

@Service
public class PermissionCheckService {

    @Autowired
    private ProfilPermissionRepository profilPermissionRepository;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private ModuleRepository moduleRepository;

    @Autowired
    private PermissionRepository permissionRepository;

    @Autowired
    private PermissionGeneratorService permissionGeneratorService;

    /**
     * Vérifie si un utilisateur a une permission spécifique pour un module spécifique
     * @param username Le nom d'utilisateur
     * @param moduleName Le nom du module
     * @param permissionName Le nom de la permission
     * @return true si l'utilisateur a la permission, false sinon
     */
    public boolean hasPermission(String username, String moduleName, String permissionName) {
        return hasFlexibleModulePermission(username, moduleName, permissionName, null);
    }

    /**
     * Vérifie si un utilisateur dispose d'une permission sur un module.
     * Accepte une correspondance exacte (insensible à la casse) ou une permission
     * compatible lorsque le module est activé pour le profil.
     */
    public boolean hasFlexibleModulePermission(String username, String moduleName, String permissionName, String httpMethod) {
        if ("admin".equals(username)) {
            return true;
        }

        Optional<UserEntity> userOpt = userRepository.findByUsername(username);
        if (userOpt.isEmpty()) {
            return false;
        }

        UserEntity user = userOpt.get();
        if (isAdminProfilName(user.getProfil() != null ? user.getProfil().getNom() : null)) {
            return true;
        }

        if (user.getProfil() == null || user.getProfil().getId() == null || moduleName == null || permissionName == null) {
            return false;
        }

        List<String> grantedPermissions = getGrantedPermissionNamesForModule(user.getProfil().getId(), moduleName);
        if (grantedPermissions.isEmpty()) {
            if (isReadPermission(normalizePermissionName(permissionName))
                && hasModuleAssociation(user.getProfil().getId(), moduleName)) {
                return true;
            }
            return false;
        }

        String required = normalizePermissionName(permissionName);
        if (grantedPermissions.contains(required)) {
            return true;
        }

        return isPermissionSatisfiedByGrantedActions(required, grantedPermissions, moduleName, httpMethod);
    }

    private List<String> getGrantedPermissionNamesForModule(Long profilId, String moduleName) {
        ModuleEntity module = findModuleByName(moduleName);
        if (module == null || module.getId() == null || profilId == null) {
            return List.of();
        }

        return profilPermissionRepository.findByProfilIdAndModuleId(profilId, module.getId()).stream()
            .map(ProfilPermissionEntity::getPermission)
            .filter(permission -> permission != null && permission.getNom() != null)
            .map(permission -> normalizePermissionName(permission.getNom()))
            .filter(name -> !name.isBlank() && !"module_associe".equals(name))
            .distinct()
            .toList();
    }

    private boolean hasModuleAssociation(Long profilId, String moduleName) {
        ModuleEntity module = findModuleByName(moduleName);
        if (module == null || module.getId() == null || profilId == null) {
            return false;
        }

        return profilPermissionRepository.findByProfilIdAndModuleId(profilId, module.getId()).stream()
            .map(ProfilPermissionEntity::getPermission)
            .filter(permission -> permission != null && permission.getNom() != null)
            .map(permission -> normalizePermissionName(permission.getNom()))
            .anyMatch("module_associe"::equals);
    }

    private boolean hasAnyModulePermissionAssignment(Long profilId, String moduleName) {
        ModuleEntity module = findModuleByName(moduleName);
        if (module == null || module.getId() == null || profilId == null) {
            return false;
        }
        return !profilPermissionRepository.findByProfilIdAndModuleId(profilId, module.getId()).isEmpty();
    }

    private ModuleEntity findModuleByName(String moduleName) {
        if (moduleName == null || moduleName.isBlank()) {
            return null;
        }
        ModuleEntity module = moduleRepository.findByNomIgnoreCase(moduleName.trim());
        if (module != null) {
            return module;
        }
        return moduleRepository.findByNom(moduleName.trim());
    }

    private String normalizePermissionName(String permissionName) {
        if (permissionName == null) {
            return "";
        }
        return Normalizer.normalize(permissionName.trim(), Normalizer.Form.NFD)
            .replaceAll("\\p{M}+", "")
            .toLowerCase(Locale.ROOT);
    }

    private boolean isPermissionSatisfiedByGrantedActions(
        String requiredPermission,
        List<String> grantedPermissions,
        String moduleName,
        String httpMethod
    ) {
        if (requiredPermission == null || requiredPermission.isBlank() || grantedPermissions.isEmpty()) {
            return false;
        }

        if (isReadPermission(requiredPermission)) {
            if (grantedPermissions.stream().anyMatch(this::isReadPermission)) {
                return true;
            }
            if (isReconciliationModule(moduleName)
                && grantedPermissions.stream().anyMatch(this::isReconciliationReadEquivalent)) {
                return true;
            }
        }

        if (isReconciliationModule(moduleName) && isReconciliationWorkflowWritePermission(requiredPermission, httpMethod)) {
            if (grantedPermissions.stream().anyMatch(this::isReconciliationWriteEquivalent)) {
                return true;
            }
        }

        if (isImporterPermission(requiredPermission)) {
            return grantedPermissions.stream().anyMatch(this::isImporterPermission);
        }

        if (isExporterPermission(requiredPermission)) {
            return grantedPermissions.stream().anyMatch(this::isExporterPermission);
        }

        if (requiredPermission.startsWith("marquer_ok")) {
            return grantedPermissions.stream().anyMatch(permission -> permission.startsWith("marquer_ok"));
        }

        if (requiredPermission.startsWith("modifier")) {
            return grantedPermissions.stream().anyMatch(permission -> permission.startsWith("modifier"));
        }

        if (requiredPermission.startsWith("creer")) {
            return grantedPermissions.stream().anyMatch(permission -> permission.startsWith("creer") || "creer".equals(permission));
        }

        String requiredBase = extractPermissionBase(requiredPermission);
        return grantedPermissions.stream().anyMatch(granted ->
            granted.equals(requiredBase)
                || granted.startsWith(requiredBase + "_")
                || requiredPermission.startsWith(granted + "_")
        );
    }

    private boolean isReadPermission(String permissionName) {
        return "consulter".equals(permissionName)
            || permissionName.startsWith("consulter_")
            || "filtrer".equals(permissionName)
            || permissionName.startsWith("filtrer_");
    }

    private boolean isImporterPermission(String permissionName) {
        return "importer".equals(permissionName) || permissionName.startsWith("importer_");
    }

    private boolean isExporterPermission(String permissionName) {
        return "exporter".equals(permissionName)
            || permissionName.startsWith("exporter_")
            || permissionName.startsWith("telecharger_");
    }

    private boolean isReconciliationReadEquivalent(String permissionName) {
        return "lancer_reconciliation".equals(permissionName)
            || "executer_reconciliation_magique".equals(permissionName)
            || permissionName.startsWith("consulter_")
            || "consulter".equals(permissionName);
    }

    private boolean isReconciliationWriteEquivalent(String permissionName) {
        return "lancer_reconciliation".equals(permissionName)
            || "executer_reconciliation_magique".equals(permissionName)
            || "modifier".equals(permissionName)
            || permissionName.startsWith("modifier_")
            || permissionName.startsWith("marquer_ok")
            || permissionName.startsWith("enregistrer_statut");
    }

    private boolean isReconciliationWorkflowWritePermission(String requiredPermission, String httpMethod) {
        if (httpMethod == null) {
            return false;
        }
        String method = httpMethod.toUpperCase(Locale.ROOT);
        if (!"POST".equals(method) && !"PUT".equals(method) && !"PATCH".equals(method) && !"DELETE".equals(method)) {
            return false;
        }
        return requiredPermission.startsWith("lancer_")
            || requiredPermission.startsWith("executer_")
            || requiredPermission.startsWith("modifier")
            || requiredPermission.startsWith("marquer_ok")
            || requiredPermission.startsWith("enregistrer_statut")
            || "creer".equals(requiredPermission)
            || requiredPermission.startsWith("creer_");
    }

    private String extractPermissionBase(String permissionName) {
        int separator = permissionName.indexOf('_');
        if (separator <= 0) {
            return permissionName;
        }
        return permissionName.substring(0, separator);
    }

    private boolean isReconciliationModule(String moduleName) {
        return "reconciliation".equals(normalizePermissionName(moduleName));
    }

    private boolean isEcartBoSummaryWriteRequest(String apiPath, String httpMethod) {
        if (apiPath == null || httpMethod == null) {
            return false;
        }
        String path = normalizeApiPath(apiPath);
        if (!path.startsWith("/api/ecart-bo-summary")) {
            return false;
        }
        String method = httpMethod.toUpperCase(Locale.ROOT);
        return "POST".equals(method)
            || "PUT".equals(method)
            || "PATCH".equals(method)
            || "DELETE".equals(method);
    }

    private boolean checkPermissionAcrossModules(
        String username,
        String apiPath,
        String httpMethod,
        String moduleOverride,
        String permissionOverride,
        String requiredPermission
    ) {
        if (moduleOverride != null && !moduleOverride.isBlank()) {
            String canonicalOverride = canonicalizeModuleOverride(moduleOverride);
            if (com.reconciliation.config.NavigationSubmenuRegistry.isSubmenuAccessModule(canonicalOverride)) {
                String effectivePermission = permissionOverride != null && !permissionOverride.isBlank()
                    ? permissionOverride
                    : requiredPermission;
                if (effectivePermission == null || effectivePermission.isBlank()) {
                    return false;
                }
                if (hasFlexibleModulePermission(username, canonicalOverride, effectivePermission, httpMethod)) {
                    return true;
                }
                // Écritures suivi écarts : retomber sur Réconciliation / Résultats (ex. lancer_reconciliation)
                if (!isEcartBoSummaryWriteRequest(apiPath, httpMethod)) {
                    return false;
                }
            }
        }

        LinkedHashSet<String> modulesToCheck = new LinkedHashSet<>();

        String intrinsicModule = resolveIntrinsicModuleForApiPath(apiPath, httpMethod);
        if (intrinsicModule != null && !intrinsicModule.isBlank()) {
            modulesToCheck.add(intrinsicModule);
        }

        if (moduleOverride != null && !moduleOverride.isBlank()) {
            modulesToCheck.add(canonicalizeModuleOverride(moduleOverride));
        }

        if (isReconciliationWorkflowPath(apiPath, httpMethod)) {
            modulesToCheck.add("Réconciliation");
            modulesToCheck.add("Résultats");
        }

        if (isReconciliationModelConsumptionPath(apiPath, httpMethod) && !isModelesModuleOverride(moduleOverride)) {
            modulesToCheck.add("Réconciliation");
        }

        for (String submenuModule : com.reconciliation.config.NavigationSubmenuRegistry.resolveAccessModulesForApiPath(apiPath)) {
            modulesToCheck.add(submenuModule);
        }

        for (String moduleName : modulesToCheck) {
            if (permissionOverride != null && !permissionOverride.isBlank()
                && hasFlexibleModulePermission(username, moduleName, permissionOverride, httpMethod)) {
                return true;
            }
            if (requiredPermission != null && !requiredPermission.isBlank()
                && hasFlexibleModulePermission(username, moduleName, requiredPermission, httpMethod)) {
                return true;
            }
        }

        return false;
    }

    private String resolveIntrinsicModuleForApiPath(String apiPath, String httpMethod) {
        if (isReconciliationModelConsumptionPath(apiPath, httpMethod)) {
            return "Réconciliation";
        }
        if (isReconciliationWorkflowPath(apiPath, httpMethod)) {
            return "Réconciliation";
        }

        String dashboardModule = mapDashboardReadApiPathToModule(apiPath, httpMethod);
        if (dashboardModule != null) {
            return dashboardModule;
        }

        return mapApiPathToModule(apiPath);
    }

    /**
     * Vérifie si un utilisateur a une permission pour un module basé sur le chemin de l'API
     * @param username Le nom d'utilisateur
     * @param apiPath Le chemin de l'API (ex: /api/operations)
     * @param httpMethod La méthode HTTP (GET, POST, PUT, DELETE)
     * @return true si l'utilisateur a la permission, false sinon
     */
    public boolean hasPermissionForApiPath(String username, String apiPath, String httpMethod) {
        return hasPermissionForApiPath(username, apiPath, httpMethod, null, null);
    }

    public boolean hasPermissionForApiPath(String username, String apiPath, String httpMethod, String moduleOverride, String permissionOverride) {
        // Si l'utilisateur est admin, il a toutes les permissions
        if ("admin".equals(username)) {
            return true;
        }
        
        // Vérifier si l'utilisateur a un profil administrateur
        Optional<UserEntity> userOpt = userRepository.findByUsername(username);
        if (userOpt.isPresent()) {
            UserEntity user = userOpt.get();
            if (user.getProfil() != null && user.getProfil().getNom() != null) {
                String profilNom = user.getProfil().getNom().toUpperCase();
                if (profilNom.equals("ADMIN") || profilNom.equals("ADMINISTRATEUR")) {
                    return true;
                }
            }
        }

        String normalizedPath = normalizeApiPath(apiPath);
        if (normalizedPath.startsWith("/api/bo-partenaire-controle-interne/revoke")) {
            return false;
        }
        if (normalizedPath.startsWith("/api/bo-partenaire-controle-interne")) {
            String action = resolveControleInterneAction(normalizedPath, httpMethod);
            if (action != null) {
                return checkPermissionAcrossModules(username, apiPath, httpMethod, moduleOverride, permissionOverride, action);
            }
        }

        // Consultation / utilisation des modèles dans le flux réconciliation :
        // permissions du module Réconciliation, pas du module Modèles (sauf override explicite Modèles).
        if (isReconciliationModelConsumptionPath(apiPath, httpMethod) && !isModelesModuleOverride(moduleOverride)) {
            String requiredPermission = permissionOverride != null && !permissionOverride.isBlank()
                ? permissionOverride
                : resolveReconciliationModelConsumptionPermission(apiPath, httpMethod);
            return checkPermissionAcrossModules(username, apiPath, httpMethod, moduleOverride, permissionOverride, requiredPermission);
        }

        // Actions résultats / statuts / écarts BO dans le flux réconciliation :
        // accepter les permissions du module concerné même si l'appel provient d'un autre écran.
        if (isReconciliationWorkflowPath(apiPath, httpMethod)) {
            String requiredPermission = permissionOverride != null && !permissionOverride.isBlank()
                ? permissionOverride
                : resolveReconciliationWorkflowPermission(apiPath, httpMethod);
            return checkPermissionAcrossModules(username, apiPath, httpMethod, moduleOverride, permissionOverride, requiredPermission);
        }

        String moduleName = resolveModuleForApiPath(apiPath, httpMethod, moduleOverride);
        if (moduleName == null) {
            System.out.println("⚠️ Module non mappé pour le chemin: " + apiPath + " - Autorisation par défaut");
            return true;
        }

        String permissionName = resolvePermissionForApiPath(apiPath, httpMethod, moduleOverride, permissionOverride);
        if (permissionName == null) {
            System.out.println("⚠️ Permission non mappée pour " + httpMethod + " sur " + apiPath + " - Autorisation par défaut");
            return true;
        }

        return checkPermissionAcrossModules(username, apiPath, httpMethod, moduleOverride, permissionOverride, permissionName);
    }

    public String resolveModuleForApiPath(String apiPath) {
        return resolveModuleForApiPath(apiPath, null, null);
    }

    public String resolveModuleForApiPath(String apiPath, String httpMethod) {
        return resolveModuleForApiPath(apiPath, httpMethod, null);
    }

    public String resolveModuleForApiPath(String apiPath, String httpMethod, String moduleOverride) {
        if (moduleOverride != null && !moduleOverride.isBlank()) {
            String canonicalOverride = canonicalizeModuleOverride(moduleOverride);
            if (com.reconciliation.config.NavigationSubmenuRegistry.isSubmenuAccessModule(canonicalOverride)) {
                return canonicalOverride;
            }
        }
        if (isReconciliationModelConsumptionPath(apiPath, httpMethod) && !isModelesModuleOverride(moduleOverride)) {
            return "Réconciliation";
        }
        if (isReconciliationWorkflowPath(apiPath, httpMethod)) {
            return "Réconciliation";
        }
        if (moduleOverride != null && !moduleOverride.isBlank()) {
            return canonicalizeModuleOverride(moduleOverride);
        }
        if (isReconciliationModelConsumptionPath(apiPath, httpMethod)) {
            return "Réconciliation";
        }
        String dashboardModule = mapDashboardReadApiPathToModule(apiPath, httpMethod);
        if (dashboardModule != null) {
            return dashboardModule;
        }
        return mapApiPathToModule(apiPath);
    }

    /**
     * Les headers HTTP n'acceptent pas toujours des valeurs non-ASCII (ex: "Réconciliation").
     * On accepte donc un override "ascii" (ex: "Reconciliation") et on le mappe vers le nom
     * exact du module enregistré en base.
     */
    private String canonicalizeModuleOverride(String moduleOverride) {
        if (moduleOverride == null) {
            return null;
        }

        final String trimmed = moduleOverride.trim();
        if (trimmed.isEmpty()) {
            return trimmed;
        }

        final String ascii = Normalizer
            .normalize(trimmed, Normalizer.Form.NFD)
            .replaceAll("\\p{M}+", "");
        final String lower = ascii.toLowerCase();

        if (lower.equals("reconciliation")) return "Réconciliation";
        if (lower.equals("resultats")) return "Résultats";
        if (lower.equals("modeles") || lower.equals("modeles de traitement") || lower.equals("modeles_traitement")) return "Modèles";
        if (lower.equals("operations")) return "Opérations";
        if (lower.equals("comptabilite")) return "Comptabilité";
        if (lower.equals("classements")) return "Classements";

        return trimmed;
    }

    public String resolvePermissionForApiPath(String apiPath, String httpMethod) {
        return resolvePermissionForApiPath(apiPath, httpMethod, null, null);
    }

    public String resolvePermissionForApiPath(String apiPath, String httpMethod, String moduleOverride, String permissionOverride) {
        if (permissionOverride != null && !permissionOverride.isBlank()) {
            return permissionOverride;
        }

        if (isReconciliationModelConsumptionPath(apiPath, httpMethod) && !isModelesModuleOverride(moduleOverride)) {
            return resolveReconciliationModelConsumptionPermission(apiPath, httpMethod);
        }

        if (isReconciliationWorkflowPath(apiPath, httpMethod)) {
            return resolveReconciliationWorkflowPermission(apiPath, httpMethod);
        }

        if (moduleOverride != null && !moduleOverride.isBlank() && "GET".equalsIgnoreCase(httpMethod)) {
            return "consulter";
        }

        String moduleName = resolveModuleForApiPath(apiPath, httpMethod, moduleOverride);
        if (moduleName == null) {
            return null;
        }

        String generatedPermission = findGeneratedPermissionForApiPath(moduleName, apiPath, httpMethod);
        if (generatedPermission != null) {
            return generatedPermission;
        }

        return mapHttpMethodToPermission(apiPath, httpMethod);
    }

    /**
     * Mappe un chemin d'API vers un nom de module
     */
    private String mapApiPathToModule(String apiPath) {
        if (apiPath == null) return null;

        if (apiPath.startsWith("/api/statistics/dashboard-metrics")) return "Dashboard";
        if (apiPath.startsWith("/api/statistics/filter-options")) return "Dashboard";
        if (apiPath.startsWith("/api/statistics/detailed-metrics")) return "Dashboard";
        if (apiPath.startsWith("/api/statistics/transaction-created-stats")) return "Dashboard";
        if (apiPath.startsWith("/api/operations")) return "Opérations";
        if (apiPath.startsWith("/api/operations-bancaires")) return "Opérations";
        if (apiPath.startsWith("/api/comptes")) return "Comptes";
        if (apiPath.startsWith("/api/service-balance")) return "Comptes";
        if (apiPath.startsWith("/api/redevance")) return "Comptes";
        if (apiPath.startsWith("/api/flux")) return "Comptes";
        if (apiPath.startsWith("/api/supply")) return "Comptes";
        if (apiPath.startsWith("/api/predictions")) return "Comptes";
        if (apiPath.startsWith("/api/releve-bancaire")) return "BANQUE";
        if (apiPath.startsWith("/api/frais")) return "Frais";
        if (apiPath.startsWith("/api/frais-transaction")) return "Frais";
        if (apiPath.startsWith("/api/commission")) return "Frais";
        if (apiPath.startsWith("/api/reconciliation")) return "Réconciliation";
        if (apiPath.startsWith("/api/reconciliation-launcher")) return "Réconciliation";
        if (apiPath.startsWith("/api/stats")) return "Statistiques";
        if (apiPath.startsWith("/api/statistics")) return "Statistiques";
        if (apiPath.startsWith("/api/ranking")) return "Classements";
        if (apiPath.startsWith("/api/rankings")) return "Classements";
        if (apiPath.startsWith("/api/ecart-solde")) return "TSOP";
        if (apiPath.startsWith("/api/trx-sf")) return "TRX SF";
        if (apiPath.startsWith("/api/impact-op")) return "Impact OP";
        if (apiPath.startsWith("/api/banque")) return "BANQUE";
        if (apiPath.startsWith("/api/banque-dashboard")) return "Dashboard";
        if (apiPath.startsWith("/api/comptabilite")) return "Comptabilité";
        if (apiPath.startsWith("/api/auto-processing-models")) return "Modèles";
        if (apiPath.startsWith("/api/auto-processing")) return "Modèles";
        if (apiPath.startsWith("/api/model-management")) return "Modèles";
        if (apiPath.startsWith("/api/file-watcher")) return "Modèles";
        if (apiPath.startsWith("/api/profils")) return "Profil";
        if (apiPath.startsWith("/api/users")) return "Utilisateur";
        if (apiPath.startsWith("/api/log-utilisateur")) return "Log utilisateur";
        if (apiPath.startsWith("/api/dashboard")) return "Dashboard";
        if (apiPath.startsWith("/api/traitement")) return "Traitement";
        if (apiPath.startsWith("/api/results")) return "Résultats";
        if (apiPath.startsWith("/api/reconciliation-report")) return "Résultats";
        if (apiPath.startsWith("/api/reco-j1-blocking-comments")) return "Résultats";
        if (apiPath.startsWith("/api/result8rec")) return "Résultats";
        if (apiPath.startsWith("/api/ecart-bo-summary")) return "Résultats";
        if (apiPath.startsWith("/api/bo-partenaire-controle-interne")) return "Résultats";
        if (apiPath.startsWith("/api/report-dashboard")) return "Résultats";
        if (apiPath.startsWith("/api/service-references")) return "Dashboard";
        if (apiPath.startsWith("/api/aide")) return "AIDE";
        
        return null;
    }

    private String mapDashboardReadApiPathToModule(String apiPath, String httpMethod) {
        if (apiPath == null || httpMethod == null || !"GET".equalsIgnoreCase(httpMethod)) {
            return null;
        }

        String normalizedPath = normalizeApiPath(apiPath);
        if (normalizedPath.equals("/api/result8rec")) return "Dashboard";
        if (normalizedPath.equals("/api/result8rec/filters")) return "Dashboard";
        if (normalizedPath.equals("/api/reconciliation-report/manual-trx/range")) return "Dashboard";
        if (normalizedPath.equals("/api/agency-summary/all")) return "Dashboard";
        if (normalizedPath.equals("/api/operations")) return "Dashboard";
        if (normalizedPath.equals("/api/comptes")) return "Dashboard";

        return null;
    }

    /**
     * Mappe une méthode HTTP vers un nom de permission
     */
    private String mapHttpMethodToPermission(String apiPath, String httpMethod) {
        if (apiPath == null || httpMethod == null) return null;

        String lowerPath = apiPath.toLowerCase();
        String lowerMethod = httpMethod.toLowerCase();

        // Actions spéciales basées sur le chemin (uniquement pour les chemins spécifiques)
        // Note: Les chemins contenant "statistics" ou "stats" doivent utiliser la permission standard selon la méthode HTTP
        if (lowerPath.contains("/upload") || lowerPath.endsWith("upload")) return "importer";
        if (lowerPath.contains("/download") || lowerPath.contains("/template") || lowerPath.contains("/export") || lowerPath.endsWith("download") || lowerPath.endsWith("template") || lowerPath.endsWith("export")) return "exporter";
        if ((lowerPath.contains("/filter") || lowerPath.contains("/search")) && !lowerPath.contains("statistics")) return "filtrer";
        if (lowerPath.contains("/bulk") || lowerPath.endsWith("bulk")) return "bulk";
        if (lowerPath.contains("/recent") || lowerPath.endsWith("recent")) return "consulter_recent";
        if (lowerPath.contains("/mark-ok") || lowerPath.contains("/mark") || lowerPath.endsWith("mark-ok") || lowerPath.endsWith("mark")) return "marquer_ok";
        if (lowerPath.startsWith("/api/reconciliation-report")) {
            return switch (lowerMethod) {
                case "get" -> "consulter";
                case "post" -> "creer";
                case "put", "patch" -> "modifier";
                case "delete" -> "supprimer";
                default -> null;
            };
        }
        if (lowerPath.contains("/reconcil") || lowerPath.endsWith("reconcil")) return "lancer_reconciliation";
        if (lowerPath.contains("/import") || lowerPath.endsWith("import")) return "importer";
        if (lowerPath.contains("/export") || lowerPath.endsWith("export")) return "exporter";
        if (lowerPath.contains("/validate") || lowerPath.endsWith("validate")) return "valider";
        if (lowerPath.contains("/approve") || lowerPath.endsWith("approve")) return "approuver";
        if (lowerPath.contains("/reject") || lowerPath.endsWith("reject")) return "rejeter";
        if (lowerPath.contains("/reset") || lowerPath.endsWith("reset")) return "reinitialiser";
        if (lowerPath.contains("/annuler") || lowerPath.contains("/cancel") || lowerPath.endsWith("annuler") || lowerPath.endsWith("cancel")) return "annuler";

        switch (lowerMethod) {
            case "get":
                return "consulter";
            case "post":
                return "creer";
            case "put":
            case "patch":
                return "modifier";
            case "delete":
                return "supprimer";
            default:
                return null;
        }
    }

    private String findGeneratedPermissionForApiPath(String moduleName, String apiPath, String httpMethod) {
        List<Map<String, Object>> actions = permissionGeneratorService.getActionsForModule(moduleName);
        String normalizedPath = normalizeApiPath(apiPath);

        return actions.stream()
            .filter(action -> httpMethod != null && httpMethod.equalsIgnoreCase((String) action.get("httpMethod")))
            .filter(action -> pathMatchesTemplate(normalizedPath, (String) action.get("path")))
            .sorted(Comparator.<Map<String, Object>>comparingInt(action -> ((String) action.get("path")).length()).reversed())
            .map(action -> (String) action.get("action"))
            .filter(actionName -> actionName != null && !actionName.isBlank())
            .findFirst()
            .orElse(null);
    }

    private String normalizeApiPath(String apiPath) {
        if (apiPath == null || apiPath.isBlank()) {
            return "";
        }

        String normalized = apiPath.split("\\?")[0].trim();
        if (normalized.endsWith("/") && normalized.length() > 1) {
            normalized = normalized.substring(0, normalized.length() - 1);
        }
        return normalized;
    }

    private boolean pathMatchesTemplate(String actualPath, String templatePath) {
        String normalizedTemplate = normalizeApiPath(templatePath);
        String normalizedActual = normalizeApiPath(actualPath);

        String[] templateSegments = normalizedTemplate.split("/");
        String[] actualSegments = normalizedActual.split("/");

        if (templateSegments.length != actualSegments.length) {
            return false;
        }

        for (int i = 0; i < templateSegments.length; i++) {
            String templateSegment = templateSegments[i];
            String actualSegment = actualSegments[i];

            if (templateSegment.startsWith("{") && templateSegment.endsWith("}")) {
                if (actualSegment == null || actualSegment.isBlank()) {
                    return false;
                }
                continue;
            }

            if (!templateSegment.equalsIgnoreCase(actualSegment)) {
                return false;
            }
        }

        return true;
    }

    /**
     * Endpoints de lecture / traitement des modèles utilisés pendant une réconciliation.
     * La gestion CRUD des modèles reste rattachée au module Modèles.
     */
    private boolean isReconciliationModelConsumptionPath(String apiPath, String httpMethod) {
        if (apiPath == null || httpMethod == null) {
            return false;
        }

        String path = normalizeApiPath(apiPath);
        String method = httpMethod.toUpperCase();

        if ("GET".equals(method)) {
            if (path.equals("/api/auto-processing/models")) return true;
            if (path.matches("/api/auto-processing/models/[^/]+")) return true;
            if (path.matches("/api/auto-processing/models/[^/]+/column-rules")) return true;
            if (path.matches("/api/auto-processing/models/[^/]+/target-columns")) return true;
            if (path.matches("/api/auto-processing/models/[^/]+/validate-rules")) return true;
            if (path.matches("/api/auto-processing-models/[^/]+")) return true;
            return false;
        }

        if ("POST".equals(method)) {
            if (path.matches("/api/auto-processing/process-data/[^/]+")) return true;
            if (path.matches("/api/auto-processing/process-single-row/[^/]+")) return true;
        }

        return false;
    }

    private boolean isModelesModuleOverride(String moduleOverride) {
        if (moduleOverride == null || moduleOverride.isBlank()) {
            return false;
        }
        return "Modèles".equals(canonicalizeModuleOverride(moduleOverride));
    }

    private String resolveReconciliationModelConsumptionPermission(String apiPath, String httpMethod) {
        if ("POST".equalsIgnoreCase(httpMethod)) {
            return "lancer_reconciliation";
        }
        return "consulter";
    }

    /**
     * Endpoints utilisés pendant ou juste après une réconciliation (résultats, statuts, écarts BO).
     */
    private boolean isReconciliationWorkflowPath(String apiPath, String httpMethod) {
        if (apiPath == null || httpMethod == null) {
            return false;
        }

        String path = normalizeApiPath(apiPath);

        if (path.startsWith("/api/reconciliation-report")) return false;
        if (path.startsWith("/api/reconciliation")) return true;
        if (path.startsWith("/api/reconciliation-launcher")) return true;
        if (path.startsWith("/api/ecart-bo-summary")) return true;

        if (path.startsWith("/api/result8rec")) {
            if (path.contains("/j1-blocking-comments")) {
                return false;
            }
            return !path.contains("/add-traitement-column");
        }

        return false;
    }

    private String resolveReconciliationWorkflowPermission(String apiPath, String httpMethod) {
        String path = normalizeApiPath(apiPath);
        String method = httpMethod != null ? httpMethod.toUpperCase() : "";

        if (path.startsWith("/api/ecart-bo-summary")) {
            if (path.contains("/batch/status-links")) {
                return "modifier";
            }
            return switch (method) {
                case "POST" -> "creer";
                case "PUT", "PATCH" -> "modifier";
                case "DELETE" -> "supprimer";
                default -> "consulter";
            };
        }

        if (path.startsWith("/api/result8rec")) {
            if (path.contains("/status") && ("POST".equals(method) || "PUT".equals(method) || "PATCH".equals(method))) {
                return "enregistrer_statut_reconciliation";
            }
            if (path.contains("/mark-ok") || path.contains("/unmark-ok")) {
                return "marquer_ok";
            }
            return switch (method) {
                case "POST" -> "creer";
                case "PUT", "PATCH" -> "modifier";
                case "DELETE" -> "supprimer";
                default -> "consulter";
            };
        }

        if (path.contains("/status") && ("POST".equals(method) || "PUT".equals(method) || "PATCH".equals(method))) {
            return "enregistrer_statut_reconciliation";
        }
        if (path.contains("/mark-ok") || path.contains("/unmark-ok")) {
            return "marquer_ok";
        }
        if ("POST".equals(method) || "PUT".equals(method) || "PATCH".equals(method)) {
            return "lancer_reconciliation";
        }
        return "consulter";
    }

    /** Admin ou permission « valider_controle_interne » cochée sur le sous-menu. */
    public boolean canValidateBoPartenaireControleInterne(String username) {
        return hasSubmenuActionPermission(username, controleInterneAccessModuleName(), "valider_controle_interne");
    }

    /** Annulation validation : réservée aux administrateurs uniquement. */
    public boolean canRevokeBoPartenaireControleInterne(String username) {
        return isAdministrateur(username);
    }

    /** Vérifie qu'une action cochée dans le profil est bien accordée (module sous-menu navigation). */
    public boolean hasSubmenuActionPermission(String username, String accessModuleName, String actionName) {
        if (username == null || username.isBlank() || accessModuleName == null || actionName == null) {
            return false;
        }
        if ("admin".equalsIgnoreCase(username.trim())) {
            return true;
        }
        Optional<UserEntity> userOpt = userRepository.findByUsername(username);
        if (userOpt.isPresent()) {
            UserEntity user = userOpt.get();
            if (isAdminProfilName(user.getProfil() != null ? user.getProfil().getNom() : null)) {
                return true;
            }
        }
        return hasFlexibleModulePermission(username, accessModuleName, actionName, null);
    }

    private String controleInterneAccessModuleName() {
        return com.reconciliation.config.NavigationSubmenuRegistry.findByAccessModuleName(
            "Résultats · Contrôle interne BO vs Partenaire"
        ).map(com.reconciliation.config.NavigationSubmenuRegistry.SubmenuAccessDefinition::accessModuleName)
            .orElse("Résultats · Contrôle interne BO vs Partenaire");
    }

    private String resolveControleInterneAction(String normalizedPath, String httpMethod) {
        String method = httpMethod != null ? httpMethod.toUpperCase(Locale.ROOT) : "GET";
        if (normalizedPath.startsWith("/api/bo-partenaire-controle-interne/validate")) {
            return "valider_controle_interne";
        }
        if (normalizedPath.startsWith("/api/bo-partenaire-controle-interne/revoke")) {
            return "annuler_validation_controle_interne";
        }
        if (normalizedPath.startsWith("/api/bo-partenaire-controle-interne/send-email")) {
            return "envoyer_email_controle_interne";
        }
        if (normalizedPath.startsWith("/api/bo-partenaire-controle-interne/comment")) {
            return "GET".equals(method) || "HEAD".equals(method)
                ? "consulter_commentaire_controle_interne"
                : "modifier_commentaire_controle_interne";
        }
        if (normalizedPath.equals("/api/bo-partenaire-controle-interne")) {
            return "consulter";
        }
        return null;
    }

    private boolean isAdministrateur(String username) {
        if (username == null || username.isBlank()) {
            return false;
        }
        if ("admin".equalsIgnoreCase(username.trim())) {
            return true;
        }
        return userRepository.findByUsername(username)
            .map(user -> isAdminProfilName(user.getProfil() != null ? user.getProfil().getNom() : null))
            .orElse(false);
    }

    private boolean isAdminProfilName(String profilNom) {
        if (profilNom == null || profilNom.isBlank()) {
            return false;
        }
        String upper = profilNom.trim().toUpperCase();
        return upper.equals("ADMIN") || upper.equals("ADMINISTRATEUR");
    }

    private boolean isControleInterneProfilName(String profilNom) {
        if (profilNom == null || profilNom.isBlank()) {
            return false;
        }
        String normalized = Normalizer.normalize(profilNom.trim(), Normalizer.Form.NFD)
            .replaceAll("\\p{M}+", "")
            .toUpperCase()
            .replaceAll("[^A-Z0-9]", "");
        return normalized.equals("CONTROLEINTERNE")
            || (normalized.contains("CONTROLE") && normalized.contains("INTERNE"));
    }
}

