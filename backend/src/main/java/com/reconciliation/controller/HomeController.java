package com.reconciliation.controller;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.Map;

/**
 * Contrôleur pour la page d'accueil de l'API
 */
@RestController
public class HomeController {

    @GetMapping("/")
    public ResponseEntity<Map<String, Object>> home() {
        Map<String, Object> response = new HashMap<>();
        response.put("message", "API de Réconciliation - Backend Spring Boot");
        response.put("version", "1.0.0");
        response.put("timestamp", LocalDateTime.now());
        response.put("status", "running");
        response.put("documentation", "Cette API REST expose les endpoints sous /api/**");
        response.put("frontend", "L'application frontend Angular est disponible sur http://localhost:4200");
        response.put("endpoints", Map.of(
            "auth", "/api/auth",
            "users", "/api/users",
            "operations", "/api/operations",
            "accounts", "/api/accounts",
            "rankings", "/api/rankings"
        ));
        
        return ResponseEntity.ok(response);
    }

    @GetMapping("/health")
    public ResponseEntity<Map<String, Object>> health() {
        Map<String, Object> response = new HashMap<>();
        response.put("status", "UP");
        response.put("timestamp", LocalDateTime.now());
        return ResponseEntity.ok(response);
    }
}

