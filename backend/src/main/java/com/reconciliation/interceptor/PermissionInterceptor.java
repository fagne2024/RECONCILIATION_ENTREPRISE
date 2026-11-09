package com.reconciliation.interceptor;

import com.reconciliation.annotation.RequiresModule;
import com.reconciliation.service.EntrepriseModuleService;
import com.reconciliation.service.PermissionCheckService;
import com.reconciliation.service.UserLogService;
import com.reconciliation.tenant.TenantContext;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.core.annotation.AnnotatedElementUtils;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.stereotype.Component;
import org.springframework.web.method.HandlerMethod;
import org.springframework.web.servlet.HandlerInterceptor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.IOException;
import java.util.Map;
import java.util.HashMap;

@Component
public class PermissionInterceptor implements HandlerInterceptor {

    private static final Logger log = LoggerFactory.getLogger(PermissionInterceptor.class);

    @Autowired
    private PermissionCheckService permissionCheckService;
    
    @Autowired
    private UserLogService userLogService;

    @Autowired
    private EntrepriseModuleService entrepriseModuleService;

    // Chemins qui ne nécessitent pas de vérification de permissions
    private static final String[] EXCLUDED_PATHS = {
        "/api/auth/login",
        "/api/auth/verify-2fa",
        "/api/auth/2fa",
        "/api/auth/entreprise",
        "/api/auth/logout",
        "/api/users/check-admin",
        "/api/users/forgot-password",
        "/api/users/reset-password",
        "/api/users/activate",
        "/api/users/me",
        "/api/users/me/password",
        "/api/log-utilisateur/log-activity",
        "/error"
    };

    // Endpoints autorises a un SUPER_ADMIN (perimetre plateforme) : deconnexion,
    // profil, changement de mot de passe, et administration de la plateforme
    // (entreprises / modules / audit). Tout autre /api/** lui est refuse.
    private static final String[] SUPER_ADMIN_ALLOWED_PATHS = {
        "/api/auth/logout",
        "/api/users/me",
        "/api/users/me/password",
        "/api/log-utilisateur/log-activity",
        "/api/platform",
        "/api/profils/modules",
        "/error"
    };

    // Parametrage d'affichage (theme, logo, libelles de navigation) : deja
    // accessible en lecture aux anonymes (SecurityConfig), donc egalement
    // autorise en lecture au SUPER_ADMIN.
    private static final String CALCULATION_RULES_PATH = "/api/configuration/calcul";

    private static final String[] PUBLIC_CONFIGURATION_PATHS = {
        "/api/configuration/logo",
        "/api/configuration/theme",
        "/api/configuration/navigation-labels"
    };

    @Override
    public boolean preHandle(@org.springframework.lang.NonNull HttpServletRequest request, 
                             @org.springframework.lang.NonNull HttpServletResponse response, 
                             @org.springframework.lang.NonNull Object handler) throws Exception {
        String path = request.getRequestURI();
        String method = request.getMethod();
        String moduleOverride = request.getHeader("X-Permission-Module");
        String permissionOverride = request.getHeader("X-Permission-Action");

        // Ignorer les chemins exclus
        for (String excludedPath : EXCLUDED_PATHS) {
            // Vérifier si le chemin correspond exactement ou commence par le chemin exclu
            // Pour les chemins avec des sous-chemins, vérifier aussi les correspondances exactes
            if (path.equals(excludedPath) || path.startsWith(excludedPath + "/") || path.startsWith(excludedPath + "?")) {
                return true;
            }
        }
        
        // Lecture du périmètre pays de l'utilisateur connecté (écran login / filtres).
        if (path.equals("/api/pays/user/allowed-codes")) {
            return true;
        }

        // Ignorer les requêtes OPTIONS (CORS)
        if ("OPTIONS".equals(method)) {
            return true;
        }

        // Lecture publique du paramétrage d'affichage (déjà permitAll côté SecurityConfig).
        if ("GET".equalsIgnoreCase(method) && isPublicConfigurationPath(path)) {
            return true;
        }

        // Ignorer les chemins statiques
        if (path.startsWith("/static/") || path.startsWith("/css/") || path.startsWith("/js/") || path.startsWith("/images/")) {
            return true;
        }

        // Decision 9 : un SUPER_ADMIN (compte plateforme, entreprise_id NULL) n'a
        // aucun acces aux donnees metier. Seuls les endpoints de son perimetre
        // restent autorises.
        if (isSuperAdminRequest()) {
            // Perimetre plateforme autorise (profil, deconnexion, /api/platform) :
            // le controle d'acces est assure par Spring Security (ROLE_SUPER_ADMIN)
            // et @PreAuthorize ; on ne passe pas par le moteur de permissions metier.
            if (isSuperAdminAllowedPath(path)) {
                return true;
            }
            // Lecture du parametrage d'affichage (theme, logo, libelles) :
            // non sensible, deja publique pour les anonymes.
            if ("GET".equalsIgnoreCase(method) && isPublicConfigurationPath(path)) {
                return true;
            }
            if (path.startsWith("/api/")) {
                log.debug("Acces metier refuse au SUPER_ADMIN: {} {}", method, path);
                response.setStatus(HttpStatus.FORBIDDEN.value());
                response.setContentType("application/json");
                response.setCharacterEncoding("UTF-8");
                Map<String, Object> errorResponse = new HashMap<>();
                errorResponse.put("error", "Acc\u00e8s refus\u00e9");
                errorResponse.put("message", "Un compte SUPER_ADMIN plateforme n'a pas acc\u00e8s aux donn\u00e9es m\u00e9tier.");
                errorResponse.put("path", path);
                try {
                    response.getWriter().write(new com.fasterxml.jackson.databind.ObjectMapper().writeValueAsString(errorResponse));
                } catch (IOException e) {
                    System.err.println("Erreur lors de l'\u00e9criture de la r\u00e9ponse d'erreur: " + e.getMessage());
                }
                return false;
            }
        }

        // Isolation multi-entreprise (fail-closed) : un utilisateur authentifie
        // d'entreprise doit toujours operer dans le perimetre d'une entreprise.
        // Sans contexte entreprise, aucun acces aux donnees metier n'est accorde.
        if (path.startsWith("/api/")
                && isAuthenticatedRequest()
                && !isSuperAdminRequest()
                && !TenantContext.isSet()
                && !isSuperAdminAllowedPath(path)) {
            log.debug("Acces refuse (aucun contexte entreprise): {} {}", method, path);
            response.setStatus(HttpStatus.FORBIDDEN.value());
            response.setContentType("application/json");
            response.setCharacterEncoding("UTF-8");
            Map<String, Object> errorResponse = new HashMap<>();
            errorResponse.put("error", "Acc\u00e8s refus\u00e9");
            errorResponse.put("message", "Aucun contexte entreprise pour cette requ\u00eate.");
            errorResponse.put("path", path);
            try {
                response.getWriter().write(new com.fasterxml.jackson.databind.ObjectMapper().writeValueAsString(errorResponse));
            } catch (IOException e) {
                System.err.println("Erreur lors de l'\u00e9criture de la r\u00e9ponse d'erreur: " + e.getMessage());
            }
            return false;
        }

        // Regles de calcul (Configuration > Calcul) : chargees au login par tous
        // les utilisateurs de l'entreprise, car les moteurs de calcul des ecrans
        // metier en dependent. Lecture ouverte a tout utilisateur d'entreprise
        // (donnees deja cloisonnees par tenant) ; l'ecriture reste soumise au
        // module "Modèles" via le controle de permissions ci-dessous.
        if ("GET".equalsIgnoreCase(method)
                && isCalculationRulesPath(path)
                && isAuthenticatedRequest()
                && !isSuperAdminRequest()
                && TenantContext.isSet()) {
            return true;
        }

        // Etape 5 : le module metier doit etre ACTIF pour l'entreprise de
        // l'utilisateur (403 cote backend sinon). L'annotation @RequiresModule,
        // si presente, prime ; sinon le module est resolu depuis le chemin HTTP
        // (meme moteur que le controle de permissions).
        if (path.startsWith("/api/")
                && !isSuperAdminRequest()
                && TenantContext.isSet()) {
            String moduleDenial = enforceModuleActivation(path, method, moduleOverride, handler);
            if (moduleDenial != null) {
                log.debug("Module desactive pour l'entreprise - acces refuse: {} {}", method, path);
                writeForbidden(response, path, moduleDenial);
                return false;
            }
        }

        // Récupérer le nom d'utilisateur depuis le header ou la session
        String username = getUsernameFromRequest(request);
        
        log.trace("PermissionInterceptor path={} method={} user={}", path, method, username);

        // Si pas d'utilisateur, autoriser (sera géré par l'authentification)
        if (username == null || username.isEmpty()) {
            log.trace("PermissionInterceptor: pas de username, autorisation par defaut");
            return true;
        }

        // Vérifier les permissions uniquement pour les chemins API
        if (path.startsWith("/api/")) {
            try {
                boolean hasPermission = permissionCheckService.hasPermissionForApiPath(username, path, method, moduleOverride, permissionOverride);
                log.trace("PermissionInterceptor hasPermission={} user={} path={}", hasPermission, username, path);
                
                if (!hasPermission) {
                    log.debug("Permission refusee user={} {} {}", username, method, path);
                    
                    response.setStatus(HttpStatus.FORBIDDEN.value());
                    response.setContentType("application/json");
                    response.setCharacterEncoding("UTF-8");
                    
                    // Message base sur les en-tetes effectivement pris en compte par le controle
                    // (un X-Permission-Module hors sous-menu est ignore) : sinon le message citerait
                    // le module de l'en-tete au lieu du module reellement verifie.
                    String effectiveModuleOverride = permissionCheckService.effectiveModuleOverride(moduleOverride);
                    String effectivePermissionOverride = permissionCheckService.effectivePermissionOverride(method, permissionOverride);
                    String moduleName = permissionCheckService.resolveModuleForApiPath(path, method, effectiveModuleOverride);
                    String actionName = permissionCheckService.resolvePermissionForApiPath(path, method, effectiveModuleOverride, effectivePermissionOverride);
                    if (actionName == null || actionName.isBlank()) {
                        actionName = switch (method) {
                            case "GET" -> "consulter";
                            case "POST" -> "créer";
                            case "PUT", "PATCH" -> "modifier";
                            case "DELETE" -> "supprimer";
                            default -> "effectuer cette action";
                        };
                    }
                    
                    Map<String, Object> errorResponse = new HashMap<>();
                    errorResponse.put("error", "Permission refusée");
                    if (moduleName != null) {
                        errorResponse.put("message", "Vous n'avez pas la permission \"" + actionName + "\" dans le module \"" + moduleName + "\".");
                    } else {
                        errorResponse.put("message", "Vous n'avez pas la permission pour exécuter cette action.");
                    }
                    errorResponse.put("path", path);
                    errorResponse.put("method", method);
                    errorResponse.put("action", actionName);
                    
                    try {
                        response.getWriter().write(new com.fasterxml.jackson.databind.ObjectMapper().writeValueAsString(errorResponse));
                    } catch (IOException e) {
                        // Erreur lors de l'écriture de la réponse
                        System.err.println("Erreur lors de l'écriture de la réponse d'erreur: " + e.getMessage());
                    }
                    
                    return false;
                } else {
                    log.trace("Permission accordee user={} {} {}", username, method, path);
                    
                    // Logger l'action utilisateur
                    try {
                        String moduleName = permissionCheckService.resolveModuleForApiPath(path, method, moduleOverride);
                        String permissionName = permissionCheckService.resolvePermissionForApiPath(path, method, moduleOverride, permissionOverride);
                        
                        if (moduleName != null && permissionName != null) {
                            userLogService.saveLog(permissionName, moduleName, username);
                        }
                    } catch (Exception e) {
                        // Ne pas bloquer la requête en cas d'erreur de logging
                        System.err.println("Erreur lors de l'enregistrement du log: " + e.getMessage());
                    }
                }
            } catch (Exception e) {
                log.error("Erreur lors de la vérification des permissions pour {} {} : {}", method, path, e.getMessage());
                writeForbidden(response, path, "Accès refusé (contrôle de permission indisponible).");
                return false;
            }
        }

        return true;
    }

    /**
     * Vrai si la requete courante est authentifiee avec le role ROLE_SUPER_ADMIN.
     */
    private boolean isSuperAdminRequest() {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        if (authentication == null || !authentication.isAuthenticated()) {
            return false;
        }
        return authentication.getAuthorities().stream()
            .anyMatch(a -> "ROLE_SUPER_ADMIN".equals(a.getAuthority()));
    }

    /**
     * Vrai si la requete courante est authentifiee (tout role confondu).
     */
    private boolean isAuthenticatedRequest() {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        return authentication != null && authentication.isAuthenticated()
            && !(authentication instanceof org.springframework.security.authentication.AnonymousAuthenticationToken);
    }

    /**
     * Vrai si le chemin fait partie du perimetre autorise au SUPER_ADMIN.
     */
    private boolean isSuperAdminAllowedPath(String path) {
        for (String allowed : SUPER_ADMIN_ALLOWED_PATHS) {
            if (path.equals(allowed) || path.startsWith(allowed + "/") || path.startsWith(allowed + "?")) {
                return true;
            }
        }
        return false;
    }

    /**
     * Vrai si le chemin correspond a un endpoint de parametrage d'affichage
     * public (lecture non sensible : theme, logo, libelles de navigation).
     */
    private boolean isCalculationRulesPath(String path) {
        return path.equals(CALCULATION_RULES_PATH)
            || path.startsWith(CALCULATION_RULES_PATH + "/")
            || path.startsWith(CALCULATION_RULES_PATH + "?");
    }

    private boolean isPublicConfigurationPath(String path) {
        for (String allowed : PUBLIC_CONFIGURATION_PATHS) {
            if (path.equals(allowed) || path.startsWith(allowed + "/") || path.startsWith(allowed + "?")) {
                return true;
            }
        }
        return false;
    }

    /**
     * Applique l'activation des modules (etape 5) : le module requis doit etre
     * actif pour l'entreprise de l'utilisateur.
     *
     * @return un message de refus si le module n'est pas actif, sinon {@code null}.
     */
    private String enforceModuleActivation(String path, String method,
                                           String moduleOverride, Object handler) {
        Long tenantId = TenantContext.get();
        if (tenantId == null || TenantContext.NO_TENANT.equals(tenantId)) {
            return null;
        }

        // Annotation explicite prioritaire, sinon module resolu depuis le chemin.
        String moduleName = resolveDeclaredModule(handler);
        if (moduleName == null || moduleName.isBlank()) {
            moduleName = permissionCheckService.resolveModuleForApiPath(path, method, moduleOverride);
        }
        if (moduleName == null || moduleName.isBlank()) {
            return null;
        }
        if (entrepriseModuleService.isModuleActive(tenantId, moduleName)) {
            return null;
        }
        return "Le module \"" + moduleName + "\" n'est pas active pour votre entreprise.";
    }

    /**
     * Nom de module declare par {@code @RequiresModule} (methode, sinon classe),
     * ou {@code null} si l'annotation est absente.
     */
    private String resolveDeclaredModule(Object handler) {
        if (!(handler instanceof HandlerMethod handlerMethod)) {
            return null;
        }
        RequiresModule annotation = handlerMethod.getMethodAnnotation(RequiresModule.class);
        if (annotation == null) {
            annotation = AnnotatedElementUtils.findMergedAnnotation(
                handlerMethod.getBeanType(), RequiresModule.class);
        }
        return annotation == null ? null : annotation.value();
    }

    /** Reponse JSON 403 coherente avec les autres refus de l'intercepteur. */
    private void writeForbidden(HttpServletResponse response, String path, String message)
            throws IOException {
        response.setStatus(HttpStatus.FORBIDDEN.value());
        response.setContentType("application/json");
        response.setCharacterEncoding("UTF-8");
        Map<String, Object> errorResponse = new HashMap<>();
        errorResponse.put("error", "Acc\u00e8s refus\u00e9");
        errorResponse.put("message", message);
        errorResponse.put("path", path);
        response.getWriter().write(
            new com.fasterxml.jackson.databind.ObjectMapper().writeValueAsString(errorResponse));
    }

    private String getUsernameFromRequest(HttpServletRequest request) {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        if (authentication != null && authentication.isAuthenticated()
                && !(authentication instanceof org.springframework.security.authentication.AnonymousAuthenticationToken)) {
            Object principal = authentication.getPrincipal();
            if (principal instanceof UserDetails) {
                return ((UserDetails) principal).getUsername();
            }
            if (principal instanceof String username
                    && username != null
                    && !username.isBlank()
                    && !"anonymousUser".equalsIgnoreCase(username)) {
                return username;
            }
        }
        return null;
    }

    /**
     * Extrait le nom du module à partir du chemin de l'API
     */
    private String extractModuleNameFromPath(String path) {
        if (path == null) return null;
        
        if (path.startsWith("/api/operations")) return "Opérations";
        if (path.startsWith("/api/operations-bancaires")) return "Opérations";
        if (path.startsWith("/api/comptes")) return "Comptes";
        if (path.startsWith("/api/frais")) return "Frais";
        if (path.startsWith("/api/commission")) return "Frais";
        if (path.startsWith("/api/reconciliation")) return "Réconciliation";
        if (path.startsWith("/api/stats")) return "Statistiques";
        if (path.startsWith("/api/statistics")) return "Statistiques";
        if (path.startsWith("/api/ranking")) return "Classements";
        if (path.startsWith("/api/ecart-solde")) return "TSOP";
        if (path.startsWith("/api/trx-sf")) return "TRX SF";
        if (path.startsWith("/api/impact-op")) return "Impact OP";
        if (path.startsWith("/api/service-balance")) return "Service Balance";
        if (path.startsWith("/api/banque")) return "BANQUE";
        if (path.startsWith("/api/comptabilite")) return "Comptabilité";
        if (path.startsWith("/api/auto-processing-models")) return "Modèles";
        if (path.startsWith("/api/profils")) return "Profil";
        if (path.startsWith("/api/users")) return "Utilisateur";
        if (path.startsWith("/api/log-utilisateur")) return "Log utilisateur";
        if (path.startsWith("/api/dashboard")) return "Dashboard";
        if (path.startsWith("/api/traitement")) return "Traitement";
        if (path.startsWith("/api/results")) return "Résultats";
        if (path.startsWith("/api/reco-j1-blocking-comments")) return "Résultats";
        if (path.startsWith("/api/result8rec")) return "Résultats";
        
        return null;
    }
    
    /**
     * Extrait le nom de la permission à partir du chemin et de la méthode HTTP
     */
    private String extractPermissionNameFromPath(String path, String method) {
        if (path == null || method == null) return null;
        
        String lowerPath = path.toLowerCase();
        String lowerMethod = method.toLowerCase();
        
        // Actions spéciales basées sur le chemin
        if (lowerPath.contains("/upload") || lowerPath.endsWith("upload")) return "upload";
        if (lowerPath.contains("/download") || lowerPath.contains("/template") || lowerPath.contains("/export") || lowerPath.endsWith("download") || lowerPath.endsWith("template") || lowerPath.endsWith("export")) return "download";
        if ((lowerPath.contains("/filter") || lowerPath.contains("/search")) && !lowerPath.contains("statistics")) return "filter";
        // Création en masse du rapport : même droit que POST /api/result8rec (évite 403 si seul "creer" est accordé)
        if (lowerPath.startsWith("/api/result8rec") && lowerPath.contains("/bulk") && "post".equals(lowerMethod)) {
            return "creer";
        }
        if (lowerPath.contains("/bulk") || lowerPath.endsWith("bulk")) return "bulk";
        if (lowerPath.contains("/recent") || lowerPath.endsWith("recent")) return "lire_recent";
        if (lowerPath.contains("/mark-ok") || lowerPath.contains("/mark") || lowerPath.endsWith("mark-ok") || lowerPath.endsWith("mark")) return "marquer";
        if (lowerPath.contains("/reconcil") || lowerPath.endsWith("reconcil")) return "reconcilier";
        if (lowerPath.contains("/import") || lowerPath.endsWith("import")) return "importer";
        if (lowerPath.contains("/export") || lowerPath.endsWith("export")) return "exporter";
        if (lowerPath.contains("/validate") || lowerPath.endsWith("validate")) return "valider";
        if (lowerPath.contains("/approve") || lowerPath.endsWith("approve")) return "approuver";
        if (lowerPath.contains("/reject") || lowerPath.endsWith("reject")) return "rejeter";
        if (lowerPath.contains("/reset") || lowerPath.endsWith("reset")) return "reinitialiser";
        if (lowerPath.contains("/annuler") || lowerPath.contains("/cancel") || lowerPath.endsWith("annuler") || lowerPath.endsWith("cancel")) return "annuler";
        
        // Actions standard basées sur la méthode HTTP
        switch (lowerMethod) {
            case "get":
                return "lire";
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
}

