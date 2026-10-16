package com.reconciliation.config;

import com.reconciliation.filter.JwtAuthenticationFilter;
import com.reconciliation.filter.RateLimitingFilter;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.env.Environment;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.config.annotation.authentication.configuration.AuthenticationConfiguration;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.HttpStatusEntryPoint;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import org.springframework.security.web.header.writers.ReferrerPolicyHeaderWriter;
import org.springframework.security.web.header.writers.XXssProtectionHeaderWriter;

/**
 * Configuration Spring Security
 * Protection des endpoints avec JWT (JSON Web Tokens)
 */
@Configuration
@EnableWebSecurity
@EnableMethodSecurity
public class SecurityConfig {

    @Autowired
    private JwtAuthenticationFilter jwtAuthenticationFilter;

    @Autowired
    private RateLimitingFilter rateLimitingFilter;

    @Autowired
    private Environment environment;

    /**
     * Configuration du PasswordEncoder avec BCrypt
     * BCrypt est un algorithme de hashage sécurisé pour les mots de passe
     */
    @Bean
    public PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder();
    }

    /**
     * Configuration de l'AuthenticationManager
     */
    @Bean
    public AuthenticationManager authenticationManager(AuthenticationConfiguration config) throws Exception {
        return config.getAuthenticationManager();
    }

    /**
     * Configuration de la chaîne de filtres de sécurité
     * Protection des endpoints avec JWT
     */
    @Bean
    public SecurityFilterChain securityFilterChain(HttpSecurity http) throws Exception {
        http
            // Désactiver CSRF pour les API REST (JWT le remplace)
            .csrf(csrf -> csrf.disable())

            // Pas de formLogin/httpBasic : l'authentification se fait par JWT
            .formLogin(form -> form.disable())
            .httpBasic(basic -> basic.disable())

            // Renvoyer 401 (et non une redirection) aux requêtes non authentifiées
            .exceptionHandling(ex -> ex
                .authenticationEntryPoint(new HttpStatusEntryPoint(HttpStatus.UNAUTHORIZED))
            )

            // Configuration de l'autorisation : seuls les endpoints nécessaires avant
            // connexion sont publics, tout le reste exige un JWT valide.
            .authorizeHttpRequests(auth -> auth
                .requestMatchers(HttpMethod.OPTIONS, "/**").permitAll()
                .requestMatchers("/", "/health", "/error").permitAll()
                // Authentification (pré-connexion)
                .requestMatchers(HttpMethod.POST, "/api/auth/login", "/api/auth/verify-2fa").permitAll()
                // Entreprise d'un identifiant, AVANT connexion (page de connexion) :
                // ne renvoie que le code d'entreprise (nom inconnu => null).
                .requestMatchers(HttpMethod.GET, "/api/auth/entreprise").permitAll()
                .requestMatchers(HttpMethod.POST, "/api/users/forgot-password", "/api/users/reset-password").permitAll()
                .requestMatchers(HttpMethod.POST, "/api/users/activate").permitAll()
                .requestMatchers(HttpMethod.GET, "/api/users/check-admin").permitAll()
                // Paramétrage d'affichage de l'écran de connexion (non sensible)
                .requestMatchers(HttpMethod.GET,
                    "/api/configuration/logo",
                    "/api/configuration/theme",
                    "/api/configuration/navigation-labels").permitAll()
                // Administration de la plateforme (entreprises, modules, audit) :
                // reservee au compte SUPER_ADMIN (entreprise_id NULL).
                .requestMatchers("/api/platform/**").hasRole("SUPER_ADMIN")
                .anyRequest().authenticated()
            )
            
            // Configuration des sessions (stateless pour REST API avec JWT)
            .sessionManagement(session -> 
                session.sessionCreationPolicy(SessionCreationPolicy.STATELESS)
            )
            
            // Configuration des en-têtes de sécurité HTTP
            .headers(headers -> headers
                // Protection contre le clickjacking
                .frameOptions(frameOptions -> frameOptions.deny())
                
                // Protection contre le MIME type sniffing
                .contentTypeOptions(contentTypeOptions -> {})
                
                // Protection XSS
                .xssProtection(xssProtection -> xssProtection
                    .headerValue(XXssProtectionHeaderWriter.HeaderValue.ENABLED_MODE_BLOCK)
                )
                
                // Strict Transport Security (HSTS) - Force HTTPS
                .httpStrictTransportSecurity(hsts -> hsts
                    .maxAgeInSeconds(31536000) // 1 an
                )
                
                // Referrer Policy - Contrôle des informations de référent
                .referrerPolicy(referrerPolicy -> referrerPolicy
                    .policy(ReferrerPolicyHeaderWriter.ReferrerPolicy.STRICT_ORIGIN_WHEN_CROSS_ORIGIN)
                )
                
                // Content Security Policy - Protection contre les attaques XSS et injection
                .contentSecurityPolicy(csp -> csp
                    .policyDirectives(contentSecurityPolicy())
                )
                
                // Permissions Policy - Contrôle des fonctionnalités du navigateur
                .permissionsPolicy(permissionsPolicy -> permissionsPolicy
                    .policy("geolocation=(), " +
                        "microphone=(), " +
                        "camera=(), " +
                        "payment=(), " +
                        "usb=(), " +
                        "magnetometer=(), " +
                        "gyroscope=(), " +
                        "fullscreen=(self), " +
                        "sync-xhr=()")
                )
            )
            
            // Ajouter le filtre de rate limiting en premier (avant l'authentification)
            .addFilterBefore(rateLimitingFilter, UsernamePasswordAuthenticationFilter.class)
            
            // Ajouter le filtre JWT avant le filtre d'authentification par défaut
            .addFilterBefore(jwtAuthenticationFilter, UsernamePasswordAuthenticationFilter.class);

        return http.build();
    }

    /**
     * Angular 14 en JIT (dev) a encore besoin de {@code unsafe-eval}.
     * En prod (AOT) on le retire.
     */
    private String contentSecurityPolicy() {
        boolean prod = environment != null && environment.matchesProfiles("prod");
        String scriptSrc = prod
            ? "script-src 'self' 'unsafe-inline'; "
            : "script-src 'self' 'unsafe-inline' 'unsafe-eval'; ";
        return "default-src 'self'; " +
            scriptSrc +
            "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdnjs.cloudflare.com; " +
            "img-src 'self' data: https:; " +
            "font-src 'self' data: https://fonts.gstatic.com https://cdnjs.cloudflare.com; " +
            "connect-src 'self'; " +
            "frame-ancestors 'none'; " +
            "base-uri 'self'; " +
            "form-action 'self'; " +
            "object-src 'none'";
    }
}

