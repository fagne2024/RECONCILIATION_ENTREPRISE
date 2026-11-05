package com.reconciliation.filter;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.github.benmanes.caffeine.cache.Cache;
import com.github.benmanes.caffeine.cache.Caffeine;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.lang.NonNull;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.HashMap;
import java.util.Map;
import java.util.concurrent.TimeUnit;

/**
 * Filtre de limitation de débit (Rate Limiting) pour protéger l'API
 * contre les abus et les attaques par déni de service (DDoS)
 * 
 * Utilise l'algorithme de fenêtre glissante avec Caffeine Cache
 */
@Component
public class RateLimitingFilter extends OncePerRequestFilter {

    private static final Logger log = LoggerFactory.getLogger(RateLimitingFilter.class);

    // Cache pour stocker les compteurs de requêtes par clé (IP ou utilisateur)
    private final Cache<String, RateLimitingRequestCounter> requestCache;

    @Value("${rate.limit.enabled:true}")
    private boolean rateLimitEnabled;

    @Value("${rate.limit.requests-per-minute:60}")
    private int requestsPerMinute;

    @Value("${rate.limit.requests-per-hour:1000}")
    private int requestsPerHour;

    @Value("${rate.limit.by-ip:true}")
    private boolean limitByIp;

    @Value("${rate.limit.expose-headers:false}")
    private boolean exposeRateLimitHeaders;

    /** Exclut /api/ecart-bo-summary (rafales PUT/DELETE légitimes : liaisons auto, édition). */
    @Value("${rate.limit.exclude-ecart-bo-summary-api:true}")
    private boolean excludeEcartBoSummaryApi;

    // Chemins exclus du rate limiting
    private static final String[] EXCLUDED_PATHS = {
        "/actuator/health",
        "/health",
        "/error"
    };

    // Chemins GET bootstrap (chargement initial pages Profils, etc.) exclus du rate limiting
    private static final String[] BOOTSTRAP_GET_PATHS = {
        "/api/profils",
        "/api/profils/modules",
        "/api/profils/permissions",
        "/api/profils/permissions/by-module",
        "/api/pays",
        "/api/service-references"
    };

    public RateLimitingFilter() {
        // Initialiser le cache avec expiration automatique
        this.requestCache = Caffeine.newBuilder()
                .maximumSize(10000) // Maximum 10000 entrées (IPs ou utilisateurs)
                .expireAfterWrite(1, TimeUnit.HOURS) // Expirer après 1 heure d'inactivité
                .recordStats()
                .build();
    }

    @Override
    protected void doFilterInternal(
            @NonNull HttpServletRequest request,
            @NonNull HttpServletResponse response,
            @NonNull FilterChain filterChain
    ) throws ServletException, IOException {

        // Si le rate limiting est désactivé, continuer
        if (!rateLimitEnabled) {
            filterChain.doFilter(request, response);
            return;
        }

        // Ignorer les chemins exclus
        String path = request.getRequestURI();
        if (isExcludedPath(path)) {
            filterChain.doFilter(request, response);
            return;
        }

        // Ignorer les GET bootstrap (évite 429 au chargement des pages Profils/Permissions)
        if ("GET".equalsIgnoreCase(request.getMethod()) && isBootstrapGetPath(path)) {
            filterChain.doFilter(request, response);
            return;
        }

        // Ignorer les requêtes OPTIONS (CORS preflight)
        if ("OPTIONS".equalsIgnoreCase(request.getMethod())) {
            filterChain.doFilter(request, response);
            return;
        }

        if (excludeEcartBoSummaryApi && path.startsWith("/api/ecart-bo-summary")) {
            filterChain.doFilter(request, response);
            return;
        }

        // Polling de progression / resultats seulement : POST reco/upload restent quota.
        if ("GET".equalsIgnoreCase(request.getMethod()) && isReconciliationPollingPath(path)) {
            filterChain.doFilter(request, response);
            return;
        }

        // Import référentiel : remplace N POST unitaires (évite 429 lors des gros fichiers)
        if (path.equals("/api/service-references/import-batch")) {
            filterChain.doFilter(request, response);
            return;
        }

        // Création result8rec en masse (remplace N POST unitaires)
        if (path.equals("/api/result8rec/bulk")) {
            filterChain.doFilter(request, response);
            return;
        }

        // Obtenir la clé de rate limiting (IP ou utilisateur)
        String rateLimitKey = getRateLimitKey(request);

        // Vérifier les limites
        if (!checkRateLimit(rateLimitKey, request, response)) {
            return; // La réponse d'erreur a déjà été envoyée
        }

        // Continuer avec la chaîne de filtres
        filterChain.doFilter(request, response);
    }

    /**
     * Vérifie si le chemin est exclu du rate limiting
     */
    private boolean isExcludedPath(String path) {
        for (String excludedPath : EXCLUDED_PATHS) {
            if (path.equals(excludedPath) || path.startsWith(excludedPath + "/")) {
                return true;
            }
        }
        return false;
    }

    /**
     * Vérifie si le chemin est un GET bootstrap (chargement initial) à exclure du rate limiting
     */
    private boolean isBootstrapGetPath(String path) {
        for (String bootstrapPath : BOOTSTRAP_GET_PATHS) {
            if (path.equals(bootstrapPath) || path.startsWith(bootstrapPath + "/") || path.startsWith(bootstrapPath + "?")) {
                return true;
            }
        }
        return false;
    }

    private boolean isReconciliationPollingPath(String path) {
        return path.startsWith("/api/reconciliation/progress")
            || path.startsWith("/api/reconciliation/live-progress")
            || path.startsWith("/api/reconciliation/results");
    }

    /**
     * Obtient la clé de rate limiting (IP ou utilisateur)
     */
    private String getRateLimitKey(HttpServletRequest request) {
        if (limitByIp) {
            // Utiliser l'adresse IP
            String ip = getClientIpAddress(request);
            return "ip:" + ip;
        } else {
            String username = getAuthenticatedUsername(request);
            if (username != null && !username.isBlank()) {
                return "user:" + username.trim().toLowerCase();
            }

            // Fallback si la requête n'est pas encore authentifiée
            String ip = getClientIpAddress(request);
            return "ip:" + ip;
        }
    }

    private String getAuthenticatedUsername(HttpServletRequest request) {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        if (authentication != null && authentication.isAuthenticated()) {
            Object principal = authentication.getPrincipal();
            if (principal instanceof UserDetails userDetails) {
                return userDetails.getUsername();
            }
            if (principal instanceof String principalName
                && principalName != null
                && !principalName.isBlank()
                && !"anonymousUser".equalsIgnoreCase(principalName)) {
                return principalName;
            }
        }
        return null;
    }

    /**
     * Récupère l'adresse IP réelle du client
     */
    private String getClientIpAddress(HttpServletRequest request) {
        String ip = request.getRemoteAddr();
        return ip != null && !ip.isBlank() ? ip : "unknown";
    }

    /**
     * Vérifie si la requête respecte les limites de débit
     * Retourne true si la requête peut continuer, false sinon
     */
    private boolean checkRateLimit(String key, HttpServletRequest request, HttpServletResponse response) throws IOException {
        RateLimitingRequestCounter counter = requestCache.get(key, k -> new RateLimitingRequestCounter());

        long currentTime = System.currentTimeMillis();
        
        // Nettoyer les anciennes entrées
        counter.cleanup(currentTime);

        // Vérifier la limite par minute
        int requestsLastMinute = counter.getRequestsInLastMinute(currentTime);
        if (requestsLastMinute >= requestsPerMinute) {
            // Trace exploitable : quelle URI tourne en rafale (diagnostic 429).
            log.warn("RATE LIMIT [minute] rejette {} {} (cle={}, {} req/min, limite={})",
                request.getMethod(), request.getRequestURI(), key, requestsLastMinute, requestsPerMinute);
            sendRateLimitError(response, "Trop de requêtes par minute", requestsPerMinute, "minute");
            return false;
        }

        // Vérifier la limite par heure
        if (counter.getRequestsInLastHour(currentTime) >= requestsPerHour) {
            log.warn("RATE LIMIT [heure] rejette {} {} (cle={}, limite={}/h)",
                request.getMethod(), request.getRequestURI(), key, requestsPerHour);
            sendRateLimitError(response, "Trop de requêtes par heure", requestsPerHour, "heure");
            return false;
        }

        // Enregistrer la requête
        counter.addRequest(currentTime);

        // Ajouter les en-têtes de rate limiting seulement si configuré
        if (exposeRateLimitHeaders) {
            addRateLimitHeaders(response, counter, currentTime);
        }

        return true;
    }

    /**
     * Ajoute les en-têtes de rate limiting à la réponse
     */
    private void addRateLimitHeaders(HttpServletResponse response, RateLimitingRequestCounter counter, long currentTime) {
        int remainingPerMinute = Math.max(0, requestsPerMinute - counter.getRequestsInLastMinute(currentTime));
        int remainingPerHour = Math.max(0, requestsPerHour - counter.getRequestsInLastHour(currentTime));
        
        response.setHeader("X-RateLimit-Limit-PerMinute", String.valueOf(requestsPerMinute));
        response.setHeader("X-RateLimit-Remaining-PerMinute", String.valueOf(remainingPerMinute));
        response.setHeader("X-RateLimit-Limit-PerHour", String.valueOf(requestsPerHour));
        response.setHeader("X-RateLimit-Remaining-PerHour", String.valueOf(remainingPerHour));
        
        // Calculer le temps de réinitialisation
        long resetTimeMinute = counter.getResetTimeForMinute(currentTime);
        long resetTimeHour = counter.getResetTimeForHour(currentTime);
        
        response.setHeader("X-RateLimit-Reset-Minute", String.valueOf(resetTimeMinute));
        response.setHeader("X-RateLimit-Reset-Hour", String.valueOf(resetTimeHour));
    }

    /**
     * Envoie une réponse d'erreur de rate limiting
     */
    private void sendRateLimitError(HttpServletResponse response, String message, int limit, String period) throws IOException {
        response.setStatus(HttpStatus.TOO_MANY_REQUESTS.value());
        response.setContentType(MediaType.APPLICATION_JSON_VALUE);
        response.setCharacterEncoding("UTF-8");
        
        Map<String, Object> errorResponse = new HashMap<>();
        errorResponse.put("error", "Rate Limit Exceeded");
        
        // Ne divulguer les détails que si les en-têtes sont exposés
        if (exposeRateLimitHeaders) {
            errorResponse.put("message", message + ". Limite: " + limit + " requêtes par " + period);
            errorResponse.put("limit", limit);
            errorResponse.put("period", period);
        } else {
            // Message générique pour la sécurité
            errorResponse.put("message", "Trop de requêtes. Veuillez réessayer plus tard.");
        }
        
        errorResponse.put("status", HttpStatus.TOO_MANY_REQUESTS.value());
        
        ObjectMapper mapper = new ObjectMapper();
        response.getWriter().write(mapper.writeValueAsString(errorResponse));
    }
}
