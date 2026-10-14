package com.reconciliation.controller;

import com.reconciliation.entity.CompteEntity;
import com.reconciliation.service.ServiceBalanceService;
import com.reconciliation.service.CompteRegroupementService;
import com.reconciliation.service.ServiceBalanceService.FusionResult;
import com.reconciliation.service.JwtService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import jakarta.servlet.http.HttpServletRequest;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/service-balance")
public class ServiceBalanceController {
    
    private static final Logger logger = LoggerFactory.getLogger(ServiceBalanceController.class);
    
    @Autowired
    private ServiceBalanceService serviceBalanceService;
    
    @Autowired
    private CompteRegroupementService compteRegroupementService;
    
    @Autowired
    private JwtService jwtService;
    
    /**
     * Endpoint de test pour vérifier la connectivité
     */
    @GetMapping("/test")
    public ResponseEntity<Map<String, String>> test() {
        try {
            logger.info("🧪 Test de l'API Service Balance");
            Map<String, String> response = Map.of(
                "status", "OK",
                "message", "Service Balance API is working",
                "timestamp", java.time.LocalDateTime.now().toString()
            );
            return ResponseEntity.ok(response);
        } catch (Exception e) {
            logger.error("❌ Erreur dans l'endpoint test: {}", e.getMessage(), e);
            return ResponseEntity.status(500).body(Map.of(
                "status", "ERROR",
                "message", e.getMessage(),
                "timestamp", java.time.LocalDateTime.now().toString()
            ));
        }
    }

    /**
     * Récupère tous les comptes service
     */
    @GetMapping("/comptes")
    public ResponseEntity<List<CompteEntity>> getServiceComptes() {
        try {
            logger.info("🔍 Récupération des comptes service");
            List<CompteEntity> comptes = serviceBalanceService.getServiceComptes();
            logger.info("✅ {} comptes service récupérés", comptes.size());
            return ResponseEntity.ok(comptes);
        } catch (Exception e) {
            logger.error("❌ Erreur lors de la récupération des comptes service: {}", e.getMessage(), e);
            return ResponseEntity.badRequest().body(null);
        }
    }
    
    /**
     * Récupère tous les comptes (pour debug)
     */
    @GetMapping("/comptes/all")
    public ResponseEntity<List<CompteEntity>> getAllComptes() {
        try {
            logger.info("🔍 Récupération de tous les comptes");
            List<CompteEntity> comptes = serviceBalanceService.getAllComptes();
            logger.info("✅ {} comptes au total récupérés", comptes.size());
            return ResponseEntity.ok(comptes);
        } catch (Exception e) {
            logger.error("❌ Erreur lors de la récupération de tous les comptes: {}", e.getMessage(), e);
            return ResponseEntity.badRequest().body(null);
        }
    }
    
    /**
     * Fusionne plusieurs comptes service en un nouveau compte
     */
    @PostMapping("/merge")
    public ResponseEntity<FusionResult> mergeServiceComptes(@RequestBody MergeRequest request) {
        try {
            logger.info("🔧 Fusion des comptes service - Nom: {}, Pays: {}, Comptes: {}", 
                       request.getNouveauNomCompte(), request.getPays(), request.getCompteIds());
            
            FusionResult result = serviceBalanceService.mergeServiceComptes(
                request.getCompteIds(),
                request.getNouveauNomCompte(),
                request.getPays()
            );
            
            logger.info("✅ Fusion réussie - Nouveau compte ID: {}, Solde total: {}", 
                       result.getNouveauCompteId(), result.getTotalSolde());
            
            return ResponseEntity.ok(result);
        } catch (Exception e) {
            logger.error("❌ Erreur lors de la fusion des comptes service: {}", e.getMessage(), e);
            return ResponseEntity.badRequest().body(null);
        }
    }
    
    /**
     * Classe de requête pour la fusion
     */
    public static class MergeRequest {
        private List<Long> compteIds;
        private String nouveauNomCompte;
        private String pays;
        
        // Constructeurs
        public MergeRequest() {}
        
        public MergeRequest(List<Long> compteIds, String nouveauNomCompte, String pays) {
            this.compteIds = compteIds;
            this.nouveauNomCompte = nouveauNomCompte;
            this.pays = pays;
        }
        
        // Getters et Setters
        public List<Long> getCompteIds() { return compteIds; }
        public void setCompteIds(List<Long> compteIds) { this.compteIds = compteIds; }
        
        public String getNouveauNomCompte() { return nouveauNomCompte; }
        public void setNouveauNomCompte(String nouveauNomCompte) { this.nouveauNomCompte = nouveauNomCompte; }
        
        public String getPays() { return pays; }
        public void setPays(String pays) { this.pays = pays;         }
    }
    
    /**
     * Synchronise manuellement tous les comptes consolidés
     */
    @PostMapping("/synchroniser")
    public ResponseEntity<Map<String, String>> synchroniserComptesConsolides() {
        try {
            logger.info("🔄 Synchronisation manuelle de tous les comptes consolidés");
            compteRegroupementService.synchroniserTousLesComptesConsolides();
            
            Map<String, String> response = Map.of(
                "status", "OK",
                "message", "Synchronisation des comptes consolidés terminée avec succès",
                "timestamp", java.time.LocalDateTime.now().toString()
            );
            return ResponseEntity.ok(response);
        } catch (Exception e) {
            logger.error("❌ Erreur lors de la synchronisation: {}", e.getMessage(), e);
            return ResponseEntity.status(500).body(Map.of(
                "status", "ERROR",
                "message", "Erreur lors de la synchronisation: " + e.getMessage(),
                "timestamp", java.time.LocalDateTime.now().toString()
            ));
        }
    }
    
    /**
     * Synchronise un compte consolidé spécifique
     */
    @PostMapping("/synchroniser/{compteId}")
    public ResponseEntity<Map<String, String>> synchroniserCompteConsolide(@PathVariable Long compteId) {
        try {
            logger.info("🔄 Synchronisation du compte consolidé ID: {}", compteId);
            compteRegroupementService.synchroniserSoldeCompteConsolide(compteId);
            
            Map<String, String> response = Map.of(
                "status", "OK",
                "message", "Synchronisation du compte consolidé terminée avec succès",
                "compteId", compteId.toString(),
                "timestamp", java.time.LocalDateTime.now().toString()
            );
            return ResponseEntity.ok(response);
        } catch (Exception e) {
            logger.error("❌ Erreur lors de la synchronisation du compte {}: {}", compteId, e.getMessage(), e);
            return ResponseEntity.status(500).body(Map.of(
                "status", "ERROR",
                "message", "Erreur lors de la synchronisation: " + e.getMessage(),
                "compteId", compteId.toString(),
                "timestamp", java.time.LocalDateTime.now().toString()
            ));
        }
    }
    
    /**
     * Rejette un compte service avec un titre et un commentaire
     */
    @PostMapping("/reject/{compteId}")
    public ResponseEntity<Map<String, String>> rejectServiceCompte(
            @PathVariable Long compteId,
            @RequestBody RejectRequest request,
            HttpServletRequest httpRequest) {
        try {
            String username = extractUsernameFromRequest(httpRequest);
            if (username == null) {
                return ResponseEntity.status(401).body(Map.of(
                    "status", "ERROR",
                    "message", "Non authentifié"
                ));
            }
            
            logger.info("❌ Rejet du compte service ID: {} par utilisateur: {}", compteId, username);
            
            boolean success = serviceBalanceService.rejectServiceCompte(
                compteId,
                request.getTitre(),
                request.getCommentaire(),
                username
            );
            
            if (success) {
                logger.info("✅ Rejet réussi pour le compte ID: {}", compteId);
                return ResponseEntity.ok(Map.of(
                    "status", "OK",
                    "message", "Compte rejeté avec succès",
                    "timestamp", java.time.LocalDateTime.now().toString()
                ));
            } else {
                logger.error("❌ Échec du rejet pour le compte ID: {}", compteId);
                return ResponseEntity.badRequest().body(Map.of(
                    "status", "ERROR",
                    "message", "Échec du rejet du compte",
                    "timestamp", java.time.LocalDateTime.now().toString()
                ));
            }
        } catch (Exception e) {
            logger.error("❌ Erreur lors du rejet du compte service: {}", e.getMessage(), e);
            return ResponseEntity.status(500).body(Map.of(
                "status", "ERROR",
                "message", "Erreur lors du rejet: " + e.getMessage(),
                "timestamp", java.time.LocalDateTime.now().toString()
            ));
        }
    }
    
    /**
     * Classe de requête pour le rejet
     */
    public static class RejectRequest {
        private String titre;
        private String commentaire;
        
        public RejectRequest() {}
        
        public String getTitre() { return titre; }
        public void setTitre(String titre) { this.titre = titre; }
        
        public String getCommentaire() { return commentaire; }
        public void setCommentaire(String commentaire) { this.commentaire = commentaire; }
    }
    
    /**
     * Extrait le username depuis le token JWT dans la requête
     */
    private String extractUsernameFromRequest(HttpServletRequest request) {
        String authHeader = request.getHeader("Authorization");
        if (authHeader != null && authHeader.startsWith("Bearer ")) {
            try {
                String token = authHeader.substring(7);
                return jwtService.extractUsername(token);
            } catch (Exception e) {
                return null;
            }
        }
        return null;
    }
}
