package com.reconciliation.filter;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;

/**
 * Filtre pour forcer l'encodage UTF-8 sur toutes les réponses HTTP
 * Cela garantit que les caractères spéciaux (accents français, etc.) sont correctement affichés
 */
@Component
@Order(1)
public class CustomCharacterEncodingFilter extends OncePerRequestFilter {

    @Override
    protected void doFilterInternal(@org.springframework.lang.NonNull HttpServletRequest request, 
                                    @org.springframework.lang.NonNull HttpServletResponse response, 
                                    @org.springframework.lang.NonNull FilterChain filterChain) throws ServletException, IOException {
        
        // Forcer l'encodage UTF-8 pour les requêtes
        request.setCharacterEncoding("UTF-8");
        
        // Forcer l'encodage UTF-8 pour les réponses
        response.setCharacterEncoding("UTF-8");
        
        // Définir le Content-Type avec charset pour les réponses JSON
        String contentType = response.getContentType();
        if (contentType != null && contentType.contains("application/json")) {
            if (!contentType.contains("charset")) {
                response.setContentType("application/json;charset=UTF-8");
            }
        } else if (contentType != null && contentType.contains("text/")) {
            if (!contentType.contains("charset")) {
                response.setContentType(contentType + ";charset=UTF-8");
            }
        }
        
        // Ajouter le header charset si pas déjà présent
        if (response.getHeader("Content-Type") != null && 
            !response.getHeader("Content-Type").contains("charset")) {
            String currentContentType = response.getContentType();
            if (currentContentType != null) {
                response.setContentType(currentContentType + ";charset=UTF-8");
            }
        }
        
        filterChain.doFilter(request, response);
    }
}

