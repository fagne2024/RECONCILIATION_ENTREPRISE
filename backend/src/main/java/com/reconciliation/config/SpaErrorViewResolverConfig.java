package com.reconciliation.config;

import jakarta.servlet.RequestDispatcher;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.boot.autoconfigure.web.servlet.error.ErrorViewResolver;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpStatus;
import org.springframework.web.servlet.ModelAndView;

import java.util.Map;

/**
 * Fallback SPA pour Angular:
 * - Sur un refresh direct d'une route front (ex: /reconciliation-report), le backend renvoie 404.
 * - On intercepte uniquement les 404 HTML et on forward vers /index.html.
 *
 * On exclut:
 * - les endpoints /api/** (doivent rester 404/401/etc normalement)
 * - les chemins de ressources (contiennent un '.': js, css, png, ...)
 */
@Configuration
public class SpaErrorViewResolverConfig {

    @Bean
    public ErrorViewResolver spaErrorViewResolver() {
        return (HttpServletRequest request, HttpStatus status, Map<String, Object> model) -> {
            if (status != HttpStatus.NOT_FOUND) {
                return null;
            }

            Object uriObj = request.getAttribute(RequestDispatcher.ERROR_REQUEST_URI);
            String path = uriObj == null ? null : uriObj.toString();
            if (path == null || path.isBlank()) {
                return null;
            }

            // Ne pas interférer avec l'API
            if (path.startsWith("/api/") || path.equals("/api")) {
                return null;
            }

            // Ne pas interférer avec les ressources statiques
            if (path.contains(".")) {
                return null;
            }

            return new ModelAndView("forward:/index.html");
        };
    }
}

