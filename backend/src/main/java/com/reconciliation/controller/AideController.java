package com.reconciliation.controller;

import com.reconciliation.entity.ModuleEntity;
import com.reconciliation.repository.ModuleRepository;
import jakarta.annotation.PostConstruct;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.Map;

/**
 * Contrôleur pour le module AIDE
 */
@RestController
@RequestMapping("/api/aide")
@CrossOrigin(origins = {"http://localhost:4200", "http://172.214.108.8:4200", "https://reconciliation.intouchgroup.net:4200"})
public class AideController {

    @Autowired
    private ModuleRepository moduleRepository;

    /**
     * Initialise le module AIDE dans la base de données s'il n'existe pas
     */
    @PostConstruct
    public void initializeAideModule() {
        try {
            ModuleEntity aideModule = moduleRepository.findByNom("AIDE");
            if (aideModule == null) {
                aideModule = new ModuleEntity();
                aideModule.setNom("AIDE");
                moduleRepository.save(aideModule);
                System.out.println("✅ Module AIDE créé automatiquement dans la base de données");
            } else {
                System.out.println("ℹ️ Module AIDE existe déjà dans la base de données");
            }
        } catch (Exception e) {
            System.err.println("❌ Erreur lors de l'initialisation du module AIDE: " + e.getMessage());
        }
    }

    /**
     * Endpoint de test pour vérifier la connectivité du module AIDE
     */
    @GetMapping("/test")
    public ResponseEntity<Map<String, Object>> test() {
        Map<String, Object> response = new HashMap<>();
        response.put("status", "OK");
        response.put("message", "Module AIDE disponible");
        response.put("timestamp", LocalDateTime.now());
        return ResponseEntity.ok(response);
    }

    /**
     * Récupère les informations du module AIDE
     */
    @GetMapping
    public ResponseEntity<Map<String, Object>> getAideInfo() {
        Map<String, Object> response = new HashMap<>();
        response.put("module", "AIDE");
        response.put("description", "Module d'aide et de support");
        response.put("timestamp", LocalDateTime.now());
        return ResponseEntity.ok(response);
    }
}

