package com.reconciliation.filter;

import com.reconciliation.service.JwtService;
import com.reconciliation.tenant.TenantContext;
import com.reconciliation.entity.EntrepriseEntity;
import com.reconciliation.entity.EntrepriseStatut;
import com.reconciliation.repository.EntrepriseRepository;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.lang.NonNull;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.web.authentication.WebAuthenticationDetailsSource;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.IOException;

/**
 * Filtre JWT pour intercepter les requêtes et valider les tokens
 * Ce filtre s'exécute avant les autres filtres de sécurité Spring
 */
@Component
public class JwtAuthenticationFilter extends OncePerRequestFilter {

    private static final Logger log = LoggerFactory.getLogger(JwtAuthenticationFilter.class);

    @Autowired
    private JwtService jwtService;

    @Autowired
    private UserDetailsService userDetailsService;

    @Autowired
    private EntrepriseRepository entrepriseRepository;

    @Autowired
    private com.reconciliation.repository.UserRepository userRepository;

    @Autowired
    private com.reconciliation.service.AuthCookieService authCookieService;

    @Override
    protected void doFilterInternal(
            @NonNull HttpServletRequest request,
            @NonNull HttpServletResponse response,
            @NonNull FilterChain filterChain
    ) throws ServletException, IOException {

        // Isolation multi-entreprise : le contexte est propre a la requete.
        TenantContext.clear();
        try {
            doFilterInternalWithTenant(request, response, filterChain);
        } finally {
            TenantContext.clear();
        }
    }

    private void doFilterInternalWithTenant(
            HttpServletRequest request,
            HttpServletResponse response,
            FilterChain filterChain
    ) throws ServletException, IOException {

        // Ignorer les requêtes OPTIONS (CORS preflight)
        if ("OPTIONS".equalsIgnoreCase(request.getMethod())) {
            filterChain.doFilter(request, response);
            return;
        }

        final String jwt = extractJwt(request);

        if (jwt == null) {
            filterChain.doFilter(request, response);
            return;
        }

        try {

            // Extraire le username du token
            final String username = jwtService.extractUsername(jwt);

            // Si username extrait et pas d'authentification dans le contexte actuel
            if (username != null && SecurityContextHolder.getContext().getAuthentication() == null) {

                // Scope entreprise lu en base (pas le claim JWT) avant tout acces ORM
                // afin que les entites @TenantId soient filtrees des le chargement.
                // Un SUPER_ADMIN (entreprise_id null) n'a pas de scope entreprise.
                Long entrepriseId = userRepository.findEntrepriseIdByUsername(username).orElse(null);
                if (entrepriseId != null) {
                    TenantContext.set(entrepriseId);
                }

                // Charger les détails de l'utilisateur
                UserDetails userDetails = this.userDetailsService.loadUserByUsername(username);

                // Valider le token
                if (jwtService.validateToken(jwt, username)) {
                    if (isSessionUserMismatch(request, username)) {
                        // Le cookie ne correspond plus à l'utilisateur affiché par le navigateur
                        // (session expirée puis cookie d'une autre session, ex. environnement de
                        // test sur le même domaine) : 401 pour que le frontend déconnecte, au lieu
                        // de refus « permission » trompeurs avec les droits d'un autre compte.
                        log.debug("Session desynchronisee: cookie={} navigateur={} sur {} {}",
                            username, request.getHeader(SESSION_USER_HEADER), request.getMethod(), request.getRequestURI());
                        SecurityContextHolder.clearContext();
                        TenantContext.clear();
                        response.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
                        response.setContentType("application/json;charset=UTF-8");
                        response.getWriter().write("{\"error\":\"session_mismatch\"}");
                        return;
                    }
                    if (!userDetails.isEnabled() || !userDetails.isAccountNonLocked()) {
                        SecurityContextHolder.clearContext();
                        response.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
                        return;
                    }

                    // Controle du statut de l'entreprise a chaque requete : la
                    // suspension invalide immediatement les jetons deja emis.
                    // Un SUPER_ADMIN (entreprise_id null) n'est pas concerne.
                    if (entrepriseId != null) {
                        EntrepriseEntity entreprise = entrepriseRepository.findById(entrepriseId).orElse(null);
                        if (entreprise == null || entreprise.getStatut() != EntrepriseStatut.ACTIVE) {
                            SecurityContextHolder.clearContext();
                            TenantContext.clear();
                            writeForbidden(response,
                                "Accès refusé : entreprise suspendue ou archivée. Contactez l'administrateur de la plateforme.");
                            return;
                        }
                    }

                    // Créer l'authentification
                    UsernamePasswordAuthenticationToken authToken = new UsernamePasswordAuthenticationToken(
                            userDetails,
                            null,
                            userDetails.getAuthorities()
                    );
                    authToken.setDetails(new WebAuthenticationDetailsSource().buildDetails(request));

                    // Mettre à jour le contexte de sécurité
                    SecurityContextHolder.getContext().setAuthentication(authToken);
                } else {
                    // Jeton invalide/expiré : ignoré, la requête continue en anonyme.
                    ignoreInvalidToken(request, response, "jeton invalide ou expire");
                }
            }
        } catch (Exception e) {
            // Signature d'une autre instance, utilisateur inconnu de cette base, jeton
            // mal formé... : même traitement qu'un jeton invalide.
            ignoreInvalidToken(request, response, e.getMessage());
        }

        filterChain.doFilter(request, response);
    }

    /**
     * Un jeton invalide ne doit pas bloquer les routes publiques : un cookie périmé
     * (autre environnement sur le même domaine, autre secret JWT, base différente)
     * renvoyait 401 jusque sur /api/auth/login et empêchait toute reconnexion.
     * La requête continue donc SANS authentification : les routes protégées restent
     * refusées par Spring Security (anyRequest().authenticated() -> 401), seules les
     * routes permitAll (login, 2FA, mot de passe oublié...) aboutissent.
     * Le cookie périmé est effacé pour ne plus être renvoyé.
     */
    private void ignoreInvalidToken(HttpServletRequest request, HttpServletResponse response, String raison) {
        log.debug("Jeton JWT ignore ({}) sur {} {}", raison, request.getMethod(), request.getRequestURI());
        SecurityContextHolder.clearContext();
        TenantContext.clear();
        String authHeader = request.getHeader("Authorization");
        boolean jetonDuCookie = authHeader == null || !authHeader.startsWith("Bearer ") || authHeader.substring(7).isBlank();
        if (jetonDuCookie && authCookieService != null && authCookieService.read(request) != null) {
            authCookieService.clear(request, response);
        }
    }

    /** Utilisateur connecté côté navigateur, envoyé par le frontend sur chaque appel API. */
    static final String SESSION_USER_HEADER = "X-Session-User";

    /**
     * Vrai si le navigateur annonce un autre utilisateur que celui du jeton. Ignoré sur
     * /api/auth/** (connexion, 2FA, déconnexion) et pour les clients sans l'en-tête.
     */
    private boolean isSessionUserMismatch(HttpServletRequest request, String tokenUsername) {
        String sessionUser = request.getHeader(SESSION_USER_HEADER);
        if (sessionUser == null || sessionUser.isBlank() || request.getRequestURI().startsWith("/api/auth/")) {
            return false;
        }
        String decoded = java.net.URLDecoder.decode(sessionUser.trim(), java.nio.charset.StandardCharsets.UTF_8);
        return !decoded.equalsIgnoreCase(tokenUsername);
    }

    private String extractJwt(HttpServletRequest request) {
        final String authHeader = request.getHeader("Authorization");
        if (authHeader != null && authHeader.startsWith("Bearer ")) {
            String bearer = authHeader.substring(7).trim();
            if (!bearer.isEmpty()) {
                return bearer;
            }
        }
        return authCookieService == null ? null : authCookieService.read(request);
    }

    /**
     * Reponse JSON 403 (entreprise suspendue) coherente avec les autres filtres.
     */
    private void writeForbidden(HttpServletResponse response, String message) throws IOException {
        response.setStatus(HttpServletResponse.SC_FORBIDDEN);
        response.setContentType("application/json;charset=UTF-8");
        response.getWriter().write("{\"error\":\"" + message.replace("\"", "\\\"") + "\"}");
    }
}

