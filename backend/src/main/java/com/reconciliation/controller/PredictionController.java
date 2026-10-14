package com.reconciliation.controller;

import com.reconciliation.dto.PredictionRequest;
import com.reconciliation.dto.PredictionResponse;
import com.reconciliation.service.PredictionService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import jakarta.servlet.http.HttpServletRequest;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/predictions")
@CrossOrigin(origins = {"http://localhost:4200", "http://172.214.108.8:4200"}, allowCredentials = "true")
public class PredictionController {
    private static final Logger logger = LoggerFactory.getLogger(PredictionController.class);

    @Autowired
    private PredictionService predictionService;

    /**
     * Génère des prédictions pour un type d'opération
     * POST /api/predictions
     */
    @PostMapping
    public ResponseEntity<?> predict(@RequestBody PredictionRequest request, HttpServletRequest httpRequest) {
        logger.info("=== PREDICTION REQUEST RECEIVED ===");
        logger.info("Type d'opération: {}", request.getTypeOperation());
        logger.info("Horizon: {} jours", request.getHorizonJours());
        logger.info("Méthode: {}", request.getMethodePrediction());
        
        try {
            // Validation
            if (request.getTypeOperation() == null || request.getTypeOperation().isEmpty()) {
                return ResponseEntity.badRequest()
                    .body("Le type d'opération est requis (Appro_client, Appro_fournisseur, Compense_client, Compense_fournisseur, nivellement)");
            }
            
            // Valeurs par défaut
            if (request.getHorizonJours() == null || request.getHorizonJours() <= 0) {
                request.setHorizonJours(30);
            }
            
            if (request.getPeriodeAnalyseJours() == null || request.getPeriodeAnalyseJours() <= 0) {
                request.setPeriodeAnalyseJours(90);
            }
            
            if (request.getMethodePrediction() == null || request.getMethodePrediction().isEmpty()) {
                request.setMethodePrediction("tendance");
            }
            
            // Générer la prédiction
            PredictionResponse response = predictionService.predict(request);
            
            logger.info("✅ Prédiction générée avec succès");
            return ResponseEntity.ok(response);
            
        } catch (IllegalArgumentException e) {
            logger.error("❌ Erreur de validation: {}", e.getMessage());
            return ResponseEntity.badRequest().body("Erreur: " + e.getMessage());
        } catch (Exception e) {
            logger.error("❌ Erreur lors de la génération de la prédiction: {}", e.getMessage(), e);
            return ResponseEntity.status(500)
                .body("Erreur lors de la génération de la prédiction: " + e.getMessage());
        }
    }

    /**
     * Génère des prédictions pour plusieurs types d'opérations en une seule requête
     * POST /api/predictions/batch
     */
    @PostMapping("/batch")
    public ResponseEntity<?> predictBatch(@RequestBody java.util.List<PredictionRequest> requests, HttpServletRequest httpRequest) {
        logger.info("=== BATCH PREDICTION REQUEST RECEIVED ===");
        logger.info("Nombre de prédictions: {}", requests.size());
        
        try {
            java.util.List<PredictionResponse> responses = new java.util.ArrayList<>();
            
            for (PredictionRequest request : requests) {
                try {
                    // Valeurs par défaut
                    if (request.getHorizonJours() == null || request.getHorizonJours() <= 0) {
                        request.setHorizonJours(30);
                    }
                    
                    if (request.getPeriodeAnalyseJours() == null || request.getPeriodeAnalyseJours() <= 0) {
                        request.setPeriodeAnalyseJours(90);
                    }
                    
                    if (request.getMethodePrediction() == null || request.getMethodePrediction().isEmpty()) {
                        request.setMethodePrediction("tendance");
                    }
                    
                    PredictionResponse response = predictionService.predict(request);
                    responses.add(response);
                } catch (Exception e) {
                    logger.warn("⚠️ Erreur pour la prédiction de type {}: {}", 
                        request.getTypeOperation(), e.getMessage());
                    // Continuer avec les autres prédictions
                }
            }
            
            logger.info("✅ {} prédictions générées avec succès", responses.size());
            return ResponseEntity.ok(responses);
            
        } catch (Exception e) {
            logger.error("❌ Erreur lors de la génération des prédictions batch: {}", e.getMessage(), e);
            return ResponseEntity.status(500)
                .body("Erreur lors de la génération des prédictions: " + e.getMessage());
        }
    }

    /**
     * Récupère les types d'opérations disponibles pour les prédictions
     * GET /api/predictions/types
     */
    @GetMapping("/types")
    public ResponseEntity<?> getAvailableTypes() {
        logger.info("=== GET AVAILABLE PREDICTION TYPES ===");
        
        try {
            List<Map<String, String>> types = new ArrayList<>();
            
            Map<String, String> type1 = new HashMap<>();
            type1.put("value", "Appro_client");
            type1.put("label", "Approvisionnement Client");
            types.add(type1);
            
            Map<String, String> type2 = new HashMap<>();
            type2.put("value", "Appro_fournisseur");
            type2.put("label", "Approvisionnement Fournisseur");
            types.add(type2);
            
            Map<String, String> type3 = new HashMap<>();
            type3.put("value", "Compense_client");
            type3.put("label", "Compensation Client");
            types.add(type3);
            
            Map<String, String> type4 = new HashMap<>();
            type4.put("value", "Compense_fournisseur");
            type4.put("label", "Compensation Fournisseur");
            types.add(type4);
            
            Map<String, String> type5 = new HashMap<>();
            type5.put("value", "nivellement");
            type5.put("label", "Nivellement");
            types.add(type5);
            
            logger.info("✅ Retour de {} types d'opérations", types.size());
            return ResponseEntity.ok(types);
        } catch (Exception e) {
            logger.error("❌ Erreur lors de la récupération des types: {}", e.getMessage(), e);
            return ResponseEntity.status(500).body("Erreur lors de la récupération des types");
        }
    }
}

