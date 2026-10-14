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

        final String authHeader = request.getHeader("Authorization");

        // Si pas d'Authorization header ou ne commence pas par "Bearer ", continuer sans authentification
        if (authHeader == null || !authHeader.startsWith("Bearer ")) {
            filterChain.doFilter(request, response);
            return;
        }

        try {
            // Extraire le token (enlever "Bearer ")
            final String jwt = authHeader.substring(7);

            // Extraire le username du token
            final String username = jwtService.extractUsername(jwt);

            // Si username extrait et pas d'authentification dans le contexte actuel
            if (username != null && SecurityContextHolder.getContext().getAuthentication() == null) {

                // Scope entreprise du jeton : renseigne AVANT tout acces ORM afin que
                // les entites @TenantId soient filtrees des le chargement de l'utilisateur.
                // Un SUPER_ADMIN (claim absent) n'a pas de scope entreprise.
                Long entrepriseId = jwtService.extractEntrepriseId(jwt);
                if (entrepriseId != null) {
                    TenantContext.set(entrepriseId);
                }

                // Charger les détails de l'utilisateur
                UserDetails userDetails = this.userDetailsService.loadUserByUsername(username);

                // Valider le token
                if (jwtService.validateToken(jwt, username)) {
                    if (!userDetails.isEnabled()) {
                        SecurityContextHolder.clearContext();
                        response.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
                        return;
                    }

                    // Controle du statut de l'entreprise a chaque requete : la
                    // suspension invalide immediatement les jetons deja emis.
                    // Un SUPER_ADMIN (claim entrepriseId absent) n'est pas concerne.
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
                    // IMPORTANT: un token présent mais invalide/expiré doit être rejeté
                    SecurityContextHolder.clearContext();
                    response.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
                    return;
                }
            }
        } catch (Exception e) {
            log.debug("Erreur validation JWT: {}", e.getMessage());
            SecurityContextHolder.clearContext();
            response.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
            return;
        }

        filterChain.doFilter(request, response);
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

