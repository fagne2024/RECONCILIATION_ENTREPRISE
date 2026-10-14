package com.reconciliation.config;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.web.servlet.FilterRegistrationBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.Ordered;
import org.springframework.lang.NonNull;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;
import org.springframework.web.filter.CorsFilter;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.List;

@Configuration
public class GlobalCorsConfig {

    @Value("${app.cors.allowed-origins:http://localhost:4200,https://localhost:4200,http://localhost:3000,https://localhost:3000,http://172.214.108.8:4200,https://172.214.108.8:4200,http://reconciliation.intouchgroup.net:4200,https://reconciliation.intouchgroup.net:4200,https://reconciliation.intouchgroup.net}")
    private List<String> allowedOrigins;

    @Bean
    public CorsFilter corsFilter() {
        CorsConfiguration config = new CorsConfiguration();
        config.setAllowedOrigins(allowedOrigins);
        config.setAllowedMethods(List.of("GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"));
        config.setAllowedHeaders(List.of("*"));
        config.setExposedHeaders(List.of("Content-Disposition"));
        config.setAllowCredentials(true);
        config.setMaxAge(3600L);

        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/api/**", config);
        return new CorsFilter(source);
    }

    @Bean
    public FilterRegistrationBean<OncePerRequestFilter> privateNetworkAccessFilter() {
        FilterRegistrationBean<OncePerRequestFilter> registration = new FilterRegistrationBean<>();
        registration.setFilter(new PrivateNetworkAccessFilter());
        registration.setOrder(Ordered.HIGHEST_PRECEDENCE);
        return registration;
    }

    /**
     * Filtre pour gérer l'accès au réseau privé (CORS)
     */
    private static class PrivateNetworkAccessFilter extends OncePerRequestFilter {
        @Override
        protected void doFilterInternal(@NonNull HttpServletRequest request,
                                        @NonNull HttpServletResponse response,
                                        @NonNull FilterChain filterChain) throws ServletException, IOException {
            if ("OPTIONS".equalsIgnoreCase(request.getMethod())
                    && request.getHeader("Access-Control-Request-Private-Network") != null) {
                response.setHeader("Access-Control-Allow-Private-Network", "true");
            }
            filterChain.doFilter(request, response);
        }
    }
}


