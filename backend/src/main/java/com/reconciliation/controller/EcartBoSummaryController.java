package com.reconciliation.controller;

import com.reconciliation.model.EcartBoSummary;
import com.reconciliation.model.EcartBoSummaryDTO;
import com.reconciliation.model.EcartBoSummaryStatusLinkUpdateDTO;
import com.reconciliation.service.EcartBoSummaryService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;
import java.util.HashMap;

@RestController
@RequestMapping("/api/ecart-bo-summary")
public class EcartBoSummaryController {
    
    @Autowired
    private EcartBoSummaryService ecartBoSummaryService;
    
    @GetMapping
    public ResponseEntity<List<EcartBoSummary>> getEcartBoSummaries(
            @RequestParam(required = false) String agence,
            @RequestParam(required = false) String service,
            @RequestParam(required = false) String pays,
            @RequestParam(required = false) String statut,
            @RequestParam(required = false) String token,
            @RequestParam(required = false) String startDate,
            @RequestParam(required = false) String endDate,
            @RequestParam(required = false) String env,
            @RequestParam(required = false) String platform) {
        try {
            List<EcartBoSummary> summaries = ecartBoSummaryService.getEcartBoSummaries(
                    agence, service, pays, statut, token, startDate, endDate, env, platform);
            return ResponseEntity.ok(summaries);
        } catch (Exception e) {
            System.err.println("=== ERREUR getEcartBoSummaries (Controller) ===");
            System.err.println("DEBUG: Exception: " + e.getMessage());
            e.printStackTrace();
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).build();
        }
    }
    
    @GetMapping("/{id}")
    public ResponseEntity<EcartBoSummary> getEcartBoSummaryById(@PathVariable Long id) {
        return ecartBoSummaryService.getEcartBoSummaryById(id)
                .map(ResponseEntity::ok)
                .orElse(ResponseEntity.notFound().build());
    }
    
    @GetMapping("/agences")
    public ResponseEntity<List<String>> getDistinctAgences() {
        List<String> agences = ecartBoSummaryService.getDistinctAgences();
        return ResponseEntity.ok(agences);
    }
    
    @GetMapping("/services")
    public ResponseEntity<List<String>> getDistinctServices() {
        List<String> services = ecartBoSummaryService.getDistinctServices();
        return ResponseEntity.ok(services);
    }
    
    @GetMapping("/pays")
    public ResponseEntity<List<String>> getDistinctPays() {
        List<String> pays = ecartBoSummaryService.getDistinctPays();
        return ResponseEntity.ok(pays);
    }
    
    @PostMapping
    public ResponseEntity<Map<String, Object>> saveEcartBoSummary(@RequestBody List<EcartBoSummaryDTO> summaryData) {
        try {
            System.out.println("=== DÉBUT saveEcartBoSummary (Controller) ===");
            System.out.println("DEBUG: Nombre de résumés reçus: " + summaryData.size());
            
            Map<String, Object> result = ecartBoSummaryService.saveEcartBoSummary(summaryData);
            int count = (Integer) result.get("count");
            int duplicates = (Integer) result.get("duplicates");
            @SuppressWarnings("unchecked")
            List<Map<String, Object>> duplicateRecords = (List<Map<String, Object>>) result.get("duplicateRecords");
            
            System.out.println("DEBUG: Résultats finaux:");
            System.out.println("  - Résumés reçus: " + summaryData.size());
            System.out.println("  - Enregistrements créés: " + count);
            System.out.println("  - Doublons détectés: " + duplicates);
            System.out.println("=== FIN saveEcartBoSummary (Controller) ===");
            
            Map<String, Object> response = new HashMap<>();
            response.put("message", duplicates > 0 
                ? String.format("Sauvegarde terminée: %d créé(s), %d doublon(s) détecté(s)", count, duplicates)
                : "Résumés sauvegardés avec succès");
            response.put("count", count);
            response.put("totalReceived", summaryData.size());
            response.put("duplicates", duplicates);
            if (duplicates > 0) {
                response.put("duplicateRecords", duplicateRecords);
            }
            
            return ResponseEntity.status(HttpStatus.CREATED).body(response);
        } catch (Exception e) {
            System.err.println("=== ERREUR saveEcartBoSummary (Controller) ===");
            System.err.println("DEBUG: Exception: " + e.getMessage());
            e.printStackTrace();
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body(Map.of("error", "Erreur lors de la sauvegarde des résumés: " + e.getMessage()));
        }
    }
    
    @PutMapping("/{id:[0-9]+}")
    public ResponseEntity<?> updateEcartBoSummary(@PathVariable Long id, @RequestBody EcartBoSummary ecartBoSummary) {
        try {
            EcartBoSummary updated = ecartBoSummaryService.updateEcartBoSummary(id, ecartBoSummary);
            return ResponseEntity.ok(updated);
        } catch (IllegalArgumentException e) {
            Map<String, String> error = new HashMap<>();
            error.put("error", "Requête invalide");
            error.put("message", e.getMessage() != null ? e.getMessage() : "Requête invalide");
            return ResponseEntity.badRequest().body(error);
        } catch (RuntimeException e) {
            if (e.getMessage() != null && e.getMessage().contains("non trouvé")) {
                return ResponseEntity.notFound().build();
            }
            throw e;
        }
    }

    @PostMapping("/batch/status-links/apply")
    public ResponseEntity<Map<String, Object>> updateStatusLinks(
            @RequestBody(required = false) List<EcartBoSummaryStatusLinkUpdateDTO> updates) {
        if (updates == null || updates.isEmpty()) {
            Map<String, Object> empty = new HashMap<>();
            empty.put("updated", 0);
            empty.put("skipped", 0);
            return ResponseEntity.ok(empty);
        }
        Map<String, Object> result = ecartBoSummaryService.updateStatusLinks(updates);
        return ResponseEntity.ok(result);
    }
    
    @DeleteMapping("/{id}")
    public ResponseEntity<Void> deleteEcartBoSummary(@PathVariable Long id) {
        boolean deleted = ecartBoSummaryService.deleteEcartBoSummary(id);
        if (deleted) {
            return ResponseEntity.noContent().build();
        } else {
            return ResponseEntity.notFound().build();
        }
    }
}
