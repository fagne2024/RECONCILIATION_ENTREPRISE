package com.reconciliation.controller;

import com.reconciliation.dto.*;
import com.reconciliation.service.SupplyPredictionService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/**
 * Contrôleur pour le système de prédiction d'approvisionnement
 * Inspiré du modèle de prédiction d'approvisionnement
 */
@RestController
@RequestMapping("/api/supply")
@CrossOrigin(origins = {"http://localhost:4200", "http://172.214.108.8:4200"}, allowCredentials = "true")
public class SupplyPredictionController {
    private static final Logger logger = LoggerFactory.getLogger(SupplyPredictionController.class);

    @Autowired
    private SupplyPredictionService supplyPredictionService;

    /**
     * Configure le système de prédiction
     * POST /api/supply/configure
     */
    @PostMapping("/configure")
    public ResponseEntity<?> configure(@RequestBody SupplyPredictionConfig config) {
        logger.info("⚙️ Configuration du système de prédiction");
        try {
            supplyPredictionService.configure(config);
            java.util.Map<String, String> response = new java.util.HashMap<>();
            response.put("message", "Configuration mise à jour avec succès");
            return ResponseEntity.ok().body(response);
        } catch (Exception e) {
            logger.error("❌ Erreur lors de la configuration: {}", e.getMessage(), e);
            return ResponseEntity.status(500).body("Erreur lors de la configuration: " + e.getMessage());
        }
    }

    /**
     * Obtient les recommandations d'approvisionnement
     * GET /api/supply/recommendations?typeOperation=Appro_client&pays=CI&periodeAnalyseJours=90
     */
    @GetMapping("/recommendations")
    public ResponseEntity<?> getRecommendations(
            @RequestParam(required = false) String typeOperation,
            @RequestParam(required = false) String pays,
            @RequestParam(required = false) Integer periodeAnalyseJours) {
        
        logger.info("📊 Récupération des recommandations: type={}, pays={}, période={}", 
            typeOperation, pays, periodeAnalyseJours);
        
        try {
            if (typeOperation == null || typeOperation.isEmpty()) {
                return ResponseEntity.badRequest().body("Le paramètre typeOperation est requis");
            }
            
            List<SupplyRecommendation> recommendations = supplyPredictionService.getSupplyRecommendations(
                typeOperation, pays, periodeAnalyseJours != null ? periodeAnalyseJours : 90);
            
            logger.info("✅ {} recommandations retournées", recommendations.size());
            return ResponseEntity.ok(recommendations);
        } catch (Exception e) {
            logger.error("❌ Erreur lors de la récupération des recommandations: {}", e.getMessage(), e);
            return ResponseEntity.status(500).body("Erreur: " + e.getMessage());
        }
    }

    /**
     * Obtient le calendrier prédictif
     * GET /api/supply/calendar?typeOperation=Appro_client&days=30&pays=CI
     */
    @GetMapping("/calendar")
    public ResponseEntity<?> getCalendar(
            @RequestParam(required = false) String typeOperation,
            @RequestParam(required = false) Integer days,
            @RequestParam(required = false) String pays) {
        
        logger.info("📅 Génération du calendrier: type={}, days={}, pays={}", typeOperation, days, pays);
        
        try {
            if (typeOperation == null || typeOperation.isEmpty()) {
                return ResponseEntity.badRequest().body("Le paramètre typeOperation est requis");
            }
            
            SupplyCalendar calendar = supplyPredictionService.getSupplyCalendar(
                typeOperation, days != null ? days : 30, pays);
            
            logger.info("✅ Calendrier généré: {} événements", 
                calendar.getEvents() != null ? calendar.getEvents().size() : 0);
            return ResponseEntity.ok(calendar);
        } catch (Exception e) {
            logger.error("❌ Erreur lors de la génération du calendrier: {}", e.getMessage(), e);
            return ResponseEntity.status(500).body("Erreur: " + e.getMessage());
        }
    }

    /**
     * Obtient les analytiques détaillées pour une agence
     * GET /api/supply/agency/{codeProprietaire}?typeOperation=Appro_client&periodeAnalyseJours=90
     */
    @GetMapping("/agency/{codeProprietaire}")
    public ResponseEntity<?> getAgencyAnalytics(
            @PathVariable String codeProprietaire,
            @RequestParam(required = false) String typeOperation,
            @RequestParam(required = false) Integer periodeAnalyseJours) {
        
        logger.info("🔍 Analyse de l'agence: {}, type={}", codeProprietaire, typeOperation);
        
        try {
            if (typeOperation == null || typeOperation.isEmpty()) {
                return ResponseEntity.badRequest().body("Le paramètre typeOperation est requis");
            }
            
            AgencyAnalytics analytics = supplyPredictionService.getAgencyAnalytics(
                codeProprietaire, typeOperation, periodeAnalyseJours != null ? periodeAnalyseJours : 90);
            
            if (analytics == null) {
                return ResponseEntity.notFound().build();
            }
            
            logger.info("✅ Analytiques générées pour {}", codeProprietaire);
            return ResponseEntity.ok(analytics);
        } catch (Exception e) {
            logger.error("❌ Erreur lors de l'analyse: {}", e.getMessage(), e);
            return ResponseEntity.status(500).body("Erreur: " + e.getMessage());
        }
    }

    /**
     * Obtient les métriques globales
     * GET /api/supply/metrics?typeOperation=Appro_client&pays=CI
     */
    @GetMapping("/metrics")
    public ResponseEntity<?> getMetrics(
            @RequestParam(required = false) String typeOperation,
            @RequestParam(required = false) String pays) {
        
        logger.info("📊 Calcul des métriques: type={}, pays={}", typeOperation, pays);
        
        try {
            if (typeOperation == null || typeOperation.isEmpty()) {
                return ResponseEntity.badRequest().body("Le paramètre typeOperation est requis");
            }
            
            SupplyMetrics metrics = supplyPredictionService.getSupplyMetrics(typeOperation, pays);
            
            logger.info("✅ Métriques calculées");
            return ResponseEntity.ok(metrics);
        } catch (Exception e) {
            logger.error("❌ Erreur lors du calcul des métriques: {}", e.getMessage(), e);
            return ResponseEntity.status(500).body("Erreur: " + e.getMessage());
        }
    }

    /**
     * Analyse la fréquence d'approvisionnement pour une agence
     * GET /api/supply/frequency/{codeProprietaire}?typeOperation=Appro_client&periodeAnalyseJours=90
     */
    @GetMapping("/frequency/{codeProprietaire}")
    public ResponseEntity<?> getSupplyFrequency(
            @PathVariable String codeProprietaire,
            @RequestParam(required = false) String typeOperation,
            @RequestParam(required = false) Integer periodeAnalyseJours) {
        
        logger.info("📊 Analyse de fréquence pour l'agence: {}, type={}", codeProprietaire, typeOperation);
        
        try {
            if (typeOperation == null || typeOperation.isEmpty()) {
                return ResponseEntity.badRequest().body("Le paramètre typeOperation est requis");
            }
            
            java.util.Map<String, Object> frequency = supplyPredictionService.analyzeSupplyFrequency(
                codeProprietaire, typeOperation, periodeAnalyseJours != null ? periodeAnalyseJours : 90);
            
            logger.info("✅ Analyse de fréquence générée pour {}", codeProprietaire);
            return ResponseEntity.ok(frequency);
        } catch (Exception e) {
            logger.error("❌ Erreur lors de l'analyse de fréquence: {}", e.getMessage(), e);
            return ResponseEntity.status(500).body("Erreur: " + e.getMessage());
        }
    }

    /**
     * Crée une commande d'approvisionnement (placeholder)
     * POST /api/supply/order
     */
    @PostMapping("/order")
    public ResponseEntity<?> createOrder(@RequestBody java.util.Map<String, Object> orderRequest) {
        logger.info("📦 Création d'une commande d'approvisionnement");
        
        try {
            // TODO: Implémenter la création de commande
            // Pour l'instant, on retourne juste un message de succès
            java.util.Map<String, Object> response = new java.util.HashMap<>();
            response.put("message", "Commande créée avec succès");
            response.put("orderId", "ORDER_" + System.currentTimeMillis());
            return ResponseEntity.ok(response);
        } catch (Exception e) {
            logger.error("❌ Erreur lors de la création de la commande: {}", e.getMessage(), e);
            return ResponseEntity.status(500).body("Erreur: " + e.getMessage());
        }
    }

    // ============================================
    // ENDPOINTS POUR LES COMPENSATIONS
    // ============================================

    /**
     * Obtient les métriques de compensation
     * GET /api/supply/compensation/metrics?typeOperation=Compense_client&thresholdAmount=5000000&pays=CI
     */
    @GetMapping("/compensation/metrics")
    public ResponseEntity<?> getCompensationMetrics(
            @RequestParam(required = false) String typeOperation,
            @RequestParam(required = false) Double thresholdAmount,
            @RequestParam(required = false) String pays) {
        
        logger.info("💰 Calcul des métriques de compensation: type={}, threshold={}, pays={}", 
            typeOperation, thresholdAmount, pays);
        
        try {
            if (typeOperation == null || typeOperation.isEmpty()) {
                return ResponseEntity.badRequest().body("Le paramètre typeOperation est requis");
            }
            
            if (thresholdAmount == null || thresholdAmount <= 0) {
                return ResponseEntity.badRequest().body("Le paramètre thresholdAmount est requis et doit être > 0");
            }
            
            CompensationMetrics metrics = supplyPredictionService.getCompensationMetrics(
                typeOperation, thresholdAmount, pays);
            
            logger.info("✅ Métriques de compensation calculées");
            return ResponseEntity.ok(metrics);
        } catch (Exception e) {
            logger.error("❌ Erreur lors du calcul des métriques de compensation: {}", e.getMessage(), e);
            return ResponseEntity.status(500).body("Erreur: " + e.getMessage());
        }
    }

    /**
     * Obtient les recommandations de compensation
     * GET /api/supply/compensation/recommendations?typeOperation=Compense_client&thresholdAmount=5000000&pays=CI&periodeAnalyseJours=90
     */
    @GetMapping("/compensation/recommendations")
    public ResponseEntity<?> getCompensationRecommendations(
            @RequestParam(required = false) String typeOperation,
            @RequestParam(required = false) Double thresholdAmount,
            @RequestParam(required = false) String pays,
            @RequestParam(required = false) Integer periodeAnalyseJours) {
        
        logger.info("📋 Récupération des recommandations de compensation: type={}, threshold={}, pays={}, période={}", 
            typeOperation, thresholdAmount, pays, periodeAnalyseJours);
        
        try {
            if (typeOperation == null || typeOperation.isEmpty()) {
                return ResponseEntity.badRequest().body("Le paramètre typeOperation est requis");
            }
            
            if (thresholdAmount == null || thresholdAmount <= 0) {
                return ResponseEntity.badRequest().body("Le paramètre thresholdAmount est requis et doit être > 0");
            }
            
            List<CompensationRecommendation> recommendations = supplyPredictionService.getCompensationRecommendations(
                typeOperation, thresholdAmount, pays, 
                periodeAnalyseJours != null ? periodeAnalyseJours : 90);
            
            logger.info("✅ {} recommandations de compensation retournées", recommendations.size());
            return ResponseEntity.ok(recommendations);
        } catch (Exception e) {
            logger.error("❌ Erreur lors de la récupération des recommandations de compensation: {}", e.getMessage(), e);
            return ResponseEntity.status(500).body("Erreur: " + e.getMessage());
        }
    }

    /**
     * Obtient le calendrier de compensation
     * GET /api/supply/compensation/calendar?typeOperation=Compense_client&thresholdAmount=5000000&days=30&pays=CI
     */
    @GetMapping("/compensation/calendar")
    public ResponseEntity<?> getCompensationCalendar(
            @RequestParam(required = false) String typeOperation,
            @RequestParam(required = false) Double thresholdAmount,
            @RequestParam(required = false) Integer days,
            @RequestParam(required = false) String pays) {
        
        logger.info("📅 Génération du calendrier de compensation: type={}, threshold={}, days={}, pays={}", 
            typeOperation, thresholdAmount, days, pays);
        
        try {
            if (typeOperation == null || typeOperation.isEmpty()) {
                return ResponseEntity.badRequest().body("Le paramètre typeOperation est requis");
            }
            
            if (thresholdAmount == null || thresholdAmount <= 0) {
                return ResponseEntity.badRequest().body("Le paramètre thresholdAmount est requis et doit être > 0");
            }
            
            SupplyCalendar calendar = supplyPredictionService.getCompensationCalendar(
                typeOperation, thresholdAmount, days != null ? days : 30, pays);
            
            logger.info("✅ Calendrier de compensation généré: {} événements", 
                calendar.getEvents() != null ? calendar.getEvents().size() : 0);
            return ResponseEntity.ok(calendar);
        } catch (Exception e) {
            logger.error("❌ Erreur lors de la génération du calendrier de compensation: {}", e.getMessage(), e);
            return ResponseEntity.status(500).body("Erreur: " + e.getMessage());
        }
    }

    /**
     * Obtient les analytiques de compensation pour une agence
     * GET /api/supply/compensation/analytics/{codeProprietaire}?typeOperation=Compense_client&thresholdAmount=5000000&periodeAnalyseJours=90
     */
    @GetMapping("/compensation/analytics/{codeProprietaire}")
    public ResponseEntity<?> getCompensationAnalytics(
            @PathVariable String codeProprietaire,
            @RequestParam(required = false) String typeOperation,
            @RequestParam(required = false) Double thresholdAmount,
            @RequestParam(required = false) Integer periodeAnalyseJours) {
        
        logger.info("🔍 Analyse de compensation pour l'agence: {}, type={}, threshold={}", 
            codeProprietaire, typeOperation, thresholdAmount);
        
        try {
            if (typeOperation == null || typeOperation.isEmpty()) {
                return ResponseEntity.badRequest().body("Le paramètre typeOperation est requis");
            }
            
            if (thresholdAmount == null || thresholdAmount <= 0) {
                return ResponseEntity.badRequest().body("Le paramètre thresholdAmount est requis et doit être > 0");
            }
            
            CompensationAnalytics analytics = supplyPredictionService.getCompensationAnalytics(
                codeProprietaire, typeOperation, thresholdAmount, 
                periodeAnalyseJours != null ? periodeAnalyseJours : 90);
            
            if (analytics == null) {
                return ResponseEntity.notFound().build();
            }
            
            logger.info("✅ Analytiques de compensation générées pour {}", codeProprietaire);
            return ResponseEntity.ok(analytics);
        } catch (Exception e) {
            logger.error("❌ Erreur lors de l'analyse de compensation: {}", e.getMessage(), e);
            return ResponseEntity.status(500).body("Erreur: " + e.getMessage());
        }
    }

    // ============================================
    // ENDPOINTS POUR LA GESTION DES SEUILS PAR AGENCE
    // ============================================

    /**
     * Obtient tous les seuils personnalisés pour un type d'opération
     * GET /api/supply/compensation/thresholds?typeOperation=Compense_client
     */
    @GetMapping("/compensation/thresholds")
    public ResponseEntity<?> getAgencyThresholds(
            @RequestParam(required = false) String typeOperation) {
        
        logger.info("📋 Récupération des seuils personnalisés: type={}", typeOperation);
        
        try {
            List<AgencyThresholdResponse> thresholds = supplyPredictionService.getAgencyThresholds(typeOperation);
            
            logger.info("✅ {} seuils personnalisés retournés", thresholds.size());
            return ResponseEntity.ok(thresholds);
        } catch (Exception e) {
            logger.error("❌ Erreur lors de la récupération des seuils: {}", e.getMessage(), e);
            return ResponseEntity.status(500).body("Erreur: " + e.getMessage());
        }
    }

    /**
     * Obtient le seuil personnalisé pour une agence spécifique
     * GET /api/supply/compensation/thresholds/{codeProprietaire}?typeOperation=Compense_client
     */
    @GetMapping("/compensation/thresholds/{codeProprietaire}")
    public ResponseEntity<?> getAgencyThreshold(
            @PathVariable String codeProprietaire,
            @RequestParam(required = false) String typeOperation) {
        
        logger.info("📋 Récupération du seuil pour l'agence: {}, type={}", codeProprietaire, typeOperation);
        
        try {
            if (typeOperation == null || typeOperation.isEmpty()) {
                return ResponseEntity.badRequest().body("Le paramètre typeOperation est requis");
            }
            
            AgencyThresholdResponse threshold = supplyPredictionService.getAgencyThreshold(codeProprietaire, typeOperation);
            
            if (threshold == null) {
                return ResponseEntity.notFound().build();
            }
            
            logger.info("✅ Seuil trouvé pour {}", codeProprietaire);
            return ResponseEntity.ok(threshold);
        } catch (Exception e) {
            logger.error("❌ Erreur lors de la récupération du seuil: {}", e.getMessage(), e);
            return ResponseEntity.status(500).body("Erreur: " + e.getMessage());
        }
    }

    /**
     * Crée ou met à jour un seuil personnalisé pour une agence
     * POST /api/supply/compensation/thresholds
     */
    @PostMapping("/compensation/thresholds")
    public ResponseEntity<?> saveAgencyThreshold(@RequestBody AgencyThresholdRequest request) {
        
        logger.info("💾 Sauvegarde du seuil pour l'agence: {}, type={}, threshold={}", 
            request.getCodeProprietaire(), request.getTypeOperation(), request.getThresholdAmount());
        
        try {
            if (request.getCodeProprietaire() == null || request.getCodeProprietaire().isEmpty()) {
                return ResponseEntity.badRequest().body("Le codeProprietaire est requis");
            }
            
            if (request.getTypeOperation() == null || request.getTypeOperation().isEmpty()) {
                return ResponseEntity.badRequest().body("Le typeOperation est requis");
            }
            
            if (request.getThresholdAmount() == null || request.getThresholdAmount() <= 0) {
                return ResponseEntity.badRequest().body("Le thresholdAmount est requis et doit être > 0");
            }
            
            AgencyThresholdResponse saved = supplyPredictionService.saveAgencyThreshold(request);
            
            logger.info("✅ Seuil sauvegardé avec succès");
            return ResponseEntity.ok(saved);
        } catch (Exception e) {
            logger.error("❌ Erreur lors de la sauvegarde du seuil: {}", e.getMessage(), e);
            return ResponseEntity.status(500).body("Erreur: " + e.getMessage());
        }
    }

    /**
     * Supprime un seuil personnalisé pour une agence
     * DELETE /api/supply/compensation/thresholds/{codeProprietaire}?typeOperation=Compense_client
     */
    @DeleteMapping("/compensation/thresholds/{codeProprietaire}")
    public ResponseEntity<?> deleteAgencyThreshold(
            @PathVariable String codeProprietaire,
            @RequestParam(required = false) String typeOperation) {
        
        logger.info("🗑️ Suppression du seuil pour l'agence: {}, type={}", codeProprietaire, typeOperation);
        
        try {
            if (typeOperation == null || typeOperation.isEmpty()) {
                return ResponseEntity.badRequest().body("Le paramètre typeOperation est requis");
            }
            
            boolean deleted = supplyPredictionService.deleteAgencyThreshold(codeProprietaire, typeOperation);
            
            if (!deleted) {
                return ResponseEntity.notFound().build();
            }
            
            logger.info("✅ Seuil supprimé avec succès");
            java.util.Map<String, String> response = new java.util.HashMap<>();
            response.put("message", "Seuil supprimé avec succès");
            return ResponseEntity.ok(response);
        } catch (Exception e) {
            logger.error("❌ Erreur lors de la suppression du seuil: {}", e.getMessage(), e);
            return ResponseEntity.status(500).body("Erreur: " + e.getMessage());
        }
    }
}

