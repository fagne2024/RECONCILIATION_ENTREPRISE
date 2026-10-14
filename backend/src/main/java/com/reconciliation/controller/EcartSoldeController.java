package com.reconciliation.controller;

import com.reconciliation.model.EcartSolde;
import com.reconciliation.model.EcartBoSummaryDTO;
import com.reconciliation.entity.EcartSoldeEntity;
import com.reconciliation.service.EcartSoldeService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.HashMap;

@RestController
@RequestMapping("/api/ecart-solde")
public class EcartSoldeController {
    
    @Autowired
    private EcartSoldeService ecartSoldeService;
    
    @GetMapping
    public ResponseEntity<List<EcartSoldeEntity>> getEcartSoldes(
            @RequestParam(required = false) String agence,
            @RequestParam(required = false) String service,
            @RequestParam(required = false) String pays,
            @RequestParam(required = false) String numeroTransGu,
            @RequestParam(required = false) String statut,
            @RequestParam(required = false) String dateDebut,
            @RequestParam(required = false) String dateFin) {
        
        try {
            List<EcartSoldeEntity> ecartSoldes = ecartSoldeService.getEcartSoldes(
                agence, service, pays, numeroTransGu, statut, dateDebut, dateFin);
            return ResponseEntity.ok(ecartSoldes);
        } catch (Exception e) {
            return ResponseEntity.internalServerError().build();
        }
    }
    
    @GetMapping("/{id}")
    public ResponseEntity<EcartSolde> getEcartSoldeById(@PathVariable Long id) {
        return ecartSoldeService.getEcartSoldeById(id)
                .map(ResponseEntity::ok)
                .orElse(ResponseEntity.notFound().build());
    }
    
    @GetMapping("/agence/{agence}")
    public ResponseEntity<List<EcartSolde>> getEcartSoldesByAgence(@PathVariable String agence) {
        List<EcartSolde> ecartSoldes = ecartSoldeService.getEcartSoldesByAgence(agence);
        return ResponseEntity.ok(ecartSoldes);
    }
    
    @GetMapping("/service/{service}")
    public ResponseEntity<List<EcartSolde>> getEcartSoldesByService(@PathVariable String service) {
        List<EcartSolde> ecartSoldes = ecartSoldeService.getEcartSoldesByService(service);
        return ResponseEntity.ok(ecartSoldes);
    }
    
    @GetMapping("/pays/{pays}")
    public ResponseEntity<List<EcartSolde>> getEcartSoldesByPays(@PathVariable String pays) {
        List<EcartSolde> ecartSoldes = ecartSoldeService.getEcartSoldesByPays(pays);
        return ResponseEntity.ok(ecartSoldes);
    }
    
    @GetMapping("/statut/{statut}")
    public ResponseEntity<List<EcartSolde>> getEcartSoldesByStatut(@PathVariable String statut) {
        List<EcartSolde> ecartSoldes = ecartSoldeService.getEcartSoldesByStatut(statut);
        return ResponseEntity.ok(ecartSoldes);
    }
    
    @GetMapping("/date-range")
    public ResponseEntity<List<EcartSolde>> getEcartSoldesByDateRange(
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) LocalDateTime dateDebut,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) LocalDateTime dateFin) {
        List<EcartSolde> ecartSoldes = ecartSoldeService.getEcartSoldesByDateRange(dateDebut, dateFin);
        return ResponseEntity.ok(ecartSoldes);
    }
    
    @GetMapping("/agences")
    public ResponseEntity<List<String>> getDistinctAgences() {
        List<String> agences = ecartSoldeService.getDistinctAgences();
        return ResponseEntity.ok(agences);
    }
    
    @GetMapping("/services")
    public ResponseEntity<List<String>> getDistinctServices() {
        List<String> services = ecartSoldeService.getDistinctServices();
        return ResponseEntity.ok(services);
    }
    
    @GetMapping("/pays")
    public ResponseEntity<List<String>> getDistinctPays() {
        List<String> pays = ecartSoldeService.getDistinctPays();
        return ResponseEntity.ok(pays);
    }
    
    @GetMapping("/numero-trans-gu")
    public ResponseEntity<List<String>> getDistinctNumeroTransGu() {
        List<String> numeroTransGu = ecartSoldeService.getDistinctNumeroTransGu();
        return ResponseEntity.ok(numeroTransGu);
    }
    
    @PostMapping
    public ResponseEntity<EcartSolde> createEcartSolde(@RequestBody EcartSolde ecartSolde) {
        EcartSolde createdEcartSolde = ecartSoldeService.createEcartSolde(ecartSolde);
        return ResponseEntity.status(HttpStatus.CREATED).body(createdEcartSolde);
    }
    
    @GetMapping("/summary")
    public ResponseEntity<List<Map<String, Object>>> getEcartBoSummary(
            @RequestParam(required = false) String service,
            @RequestParam(required = false) String pays,
            @RequestParam(required = false) String statut) {
        try {
            List<EcartSoldeEntity> ecartSoldes = ecartSoldeService.getEcartSoldes(
                null, service, pays, null, statut, null, null);
            
            // Grouper par service et pays pour créer les résumés
            Map<String, Map<String, Object>> grouped = new java.util.HashMap<>();
            
            for (EcartSoldeEntity ecart : ecartSoldes) {
                // Filtrer seulement les écarts BO regroupés (ceux qui commencent par ECART_BO_)
                if (ecart.getIdTransaction() != null && ecart.getIdTransaction().startsWith("ECART_BO_")) {
                    String key = (ecart.getService() != null ? ecart.getService() : "") + "|" + 
                                (ecart.getPays() != null ? ecart.getPays() : "");
                    
                    if (!grouped.containsKey(key)) {
                        Map<String, Object> summary = new java.util.HashMap<>();
                        summary.put("service", ecart.getService());
                        summary.put("pays", ecart.getPays());
                        summary.put("date", ecart.getDateTransaction() != null ? 
                            ecart.getDateTransaction().toString() : "");
                        summary.put("montant", ecart.getMontant());
                        summary.put("statut", ecart.getStatut());
                        summary.put("nombre", extractNombreFromCommentaire(ecart.getCommentaire()));
                        summary.put("id", ecart.getId());
                        grouped.put(key, summary);
                    }
                }
            }
            
            return ResponseEntity.ok(new java.util.ArrayList<>(grouped.values()));
        } catch (Exception e) {
            System.err.println("=== ERREUR getEcartBoSummary (Controller) ===");
            System.err.println("DEBUG: Exception: " + e.getMessage());
            e.printStackTrace();
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).build();
        }
    }
    
    private int extractNombreFromCommentaire(String commentaire) {
        if (commentaire == null || commentaire.isEmpty()) {
            return 0;
        }
        // Extraire le nombre de transactions du commentaire
        // Format: "Écart BO regroupé - X transaction(s) - Service: ..."
        try {
            java.util.regex.Pattern pattern = java.util.regex.Pattern.compile("(\\d+)\\s+transaction");
            java.util.regex.Matcher matcher = pattern.matcher(commentaire);
            if (matcher.find()) {
                return Integer.parseInt(matcher.group(1));
            }
        } catch (Exception e) {
            // Ignorer les erreurs de parsing
        }
        return 0;
    }

    @PostMapping("/summary")
    public ResponseEntity<Map<String, Object>> saveEcartBoSummary(@RequestBody List<EcartBoSummaryDTO> summaryData) {
        try {
            System.out.println("=== DÉBUT saveEcartBoSummary (Controller) ===");
            System.out.println("DEBUG: Nombre de résumés reçus: " + summaryData.size());
            
            int count = ecartSoldeService.saveEcartBoSummary(summaryData);
            
            System.out.println("DEBUG: Résultats finaux:");
            System.out.println("  - Résumés reçus: " + summaryData.size());
            System.out.println("  - Enregistrements créés: " + count);
            System.out.println("=== FIN saveEcartBoSummary (Controller) ===");
            
            return ResponseEntity.status(HttpStatus.CREATED).body(Map.of(
                "message", "Résumés sauvegardés avec succès",
                "count", count,
                "totalReceived", summaryData.size()
            ));
        } catch (Exception e) {
            System.err.println("=== ERREUR saveEcartBoSummary (Controller) ===");
            System.err.println("DEBUG: Exception: " + e.getMessage());
            e.printStackTrace();
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body(Map.of("error", "Erreur lors de la sauvegarde des résumés: " + e.getMessage()));
        }
    }

    @PostMapping("/batch")
    public ResponseEntity<Map<String, Object>> createMultipleEcartSoldes(@RequestBody List<EcartSolde> ecartSoldes) {
        try {
            System.out.println("=== DÉBUT createMultipleEcartSoldes (Controller) ===");
            System.out.println("DEBUG: Nombre d'écarts de solde reçus: " + ecartSoldes.size());
            
            List<EcartSolde> createdEcartSoldes = ecartSoldeService.createMultipleEcartSoldes(ecartSoldes);
            
            int duplicatesCount = ecartSoldes.size() - createdEcartSoldes.size();
            
            System.out.println("DEBUG: Résultats finaux:");
            System.out.println("  - Enregistrements reçus: " + ecartSoldes.size());
            System.out.println("  - Doublons ignorés: " + duplicatesCount);
            System.out.println("  - Nouveaux enregistrements créés: " + createdEcartSoldes.size());
            System.out.println("=== FIN createMultipleEcartSoldes (Controller) ===");
            
            return ResponseEntity.status(HttpStatus.CREATED).body(Map.of(
                "message", "Enregistrements créés avec succès",
                "count", createdEcartSoldes.size(),
                "duplicates", duplicatesCount,
                "totalReceived", ecartSoldes.size(),
                "data", createdEcartSoldes
            ));
        } catch (Exception e) {
            System.err.println("=== ERREUR createMultipleEcartSoldes (Controller) ===");
            System.err.println("DEBUG: Exception: " + e.getMessage());
            e.printStackTrace();
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body(Map.of("error", "Erreur lors de la création des enregistrements: " + e.getMessage()));
        }
    }
    
    @PutMapping("/{id}")
    public ResponseEntity<EcartSolde> updateEcartSolde(@PathVariable Long id, @RequestBody EcartSolde ecartSolde) {
        try {
            EcartSolde updatedEcartSolde = ecartSoldeService.updateEcartSolde(id, ecartSolde);
            return ResponseEntity.ok(updatedEcartSolde);
        } catch (RuntimeException e) {
            return ResponseEntity.notFound().build();
        }
    }
    
    @DeleteMapping("/{id}")
    public ResponseEntity<Void> deleteEcartSolde(@PathVariable Long id) {
        boolean deleted = ecartSoldeService.deleteEcartSolde(id);
        if (deleted) {
            return ResponseEntity.noContent().build();
        } else {
            return ResponseEntity.notFound().build();
        }
    }

    /**
     * Suppression en lot d'écarts de solde (sélection multiple).
     */
    @PostMapping("/delete-batch")
    public ResponseEntity<Map<String, Object>> deleteEcartSoldes(@RequestBody Map<String, List<Long>> request) {
        List<Long> ids = request != null ? request.get("ids") : null;
        Map<String, Object> result = ecartSoldeService.deleteEcartSoldes(ids);
        return ResponseEntity.ok(result);
    }
    
    @PatchMapping("/{id}/statut")
    public ResponseEntity<Map<String, String>> updateStatut(@PathVariable Long id, @RequestBody Map<String, String> request) {
        System.out.println("=== DÉBUT updateStatut Controller ===");
        System.out.println("DEBUG: ID reçu: " + id);
        System.out.println("DEBUG: Request body: " + request);
        
        String nouveauStatut = request.get("statut");
        System.out.println("DEBUG: Nouveau statut extrait: " + nouveauStatut);
        
        if (nouveauStatut == null) {
            System.out.println("DEBUG: Statut manquant dans la requête");
            return ResponseEntity.badRequest().body(Map.of("error", "Le statut est requis"));
        }
        
        try {
            System.out.println("DEBUG: Appel du service updateStatut...");
            boolean updated = ecartSoldeService.updateStatut(id, nouveauStatut);
            System.out.println("DEBUG: Résultat du service: " + updated);
            
            if (updated) {
                System.out.println("=== FIN updateStatut Controller - SUCCÈS ===");
                return ResponseEntity.ok(Map.of("message", "Statut mis à jour avec succès"));
            } else {
                System.out.println("=== FIN updateStatut Controller - ÉCHEC ===");
                return ResponseEntity.notFound().build();
            }
        } catch (RuntimeException e) {
            System.out.println("=== ERREUR updateStatut Controller ===");
            System.out.println("DEBUG: Exception: " + e.getMessage());
            e.printStackTrace();
            return ResponseEntity.notFound().build();
        }
    }
    
    @PutMapping("/{id}/statut")
    public ResponseEntity<Map<String, String>> updateStatutPut(@PathVariable Long id, @RequestBody Map<String, String> request) {
        System.out.println("=== DÉBUT updateStatutPut Controller ===");
        System.out.println("DEBUG: ID reçu: " + id);
        System.out.println("DEBUG: Request body: " + request);
        
        String nouveauStatut = request.get("statut");
        System.out.println("DEBUG: Nouveau statut extrait: " + nouveauStatut);
        
        if (nouveauStatut == null) {
            System.out.println("DEBUG: Statut manquant dans la requête");
            return ResponseEntity.badRequest().body(Map.of("error", "Le statut est requis"));
        }
        
        try {
            System.out.println("DEBUG: Appel du service updateStatut...");
            boolean updated = ecartSoldeService.updateStatut(id, nouveauStatut);
            System.out.println("DEBUG: Résultat du service: " + updated);
            
            if (updated) {
                System.out.println("=== FIN updateStatutPut Controller - SUCCÈS ===");
                return ResponseEntity.ok(Map.of("message", "Statut mis à jour avec succès"));
            } else {
                System.out.println("=== FIN updateStatutPut Controller - ÉCHEC ===");
                return ResponseEntity.notFound().build();
            }
        } catch (RuntimeException e) {
            System.out.println("=== ERREUR updateStatutPut Controller ===");
            System.out.println("DEBUG: Exception: " + e.getMessage());
            e.printStackTrace();
            return ResponseEntity.notFound().build();
        }
    }
    
    @PostMapping("/{id}/statut")
    public ResponseEntity<Map<String, String>> updateStatutPost(@PathVariable Long id, 
                                                               @RequestParam String statut,
                                                               @RequestParam(required = false) String commentaire) {
        System.out.println("=== DÉBUT updateStatutPost Controller ===");
        System.out.println("DEBUG: ID reçu: " + id);
        System.out.println("DEBUG: Statut reçu: " + statut);
        System.out.println("DEBUG: Commentaire reçu: " + commentaire);
        
        if (statut == null || statut.trim().isEmpty()) {
            System.out.println("DEBUG: Statut manquant dans la requête");
            return ResponseEntity.badRequest().body(Map.of("error", "Le statut est requis"));
        }
        
        try {
            System.out.println("DEBUG: Appel du service updateStatut...");
            boolean updated = ecartSoldeService.updateStatutWithComment(id, statut, commentaire);
            System.out.println("DEBUG: Résultat du service: " + updated);
            
            if (updated) {
                System.out.println("=== FIN updateStatutPost Controller - SUCCÈS ===");
                return ResponseEntity.ok(Map.of("message", "Statut mis à jour avec succès"));
            } else {
                System.out.println("=== FIN updateStatutPost Controller - ÉCHEC ===");
                return ResponseEntity.notFound().build();
            }
        } catch (RuntimeException e) {
            System.out.println("=== ERREUR updateStatutPost Controller ===");
            System.out.println("DEBUG: Exception: " + e.getMessage());
            e.printStackTrace();
            return ResponseEntity.notFound().build();
        }
    }
    
    @PostMapping("/upload")
    public ResponseEntity<Map<String, Object>> uploadCsvFile(@RequestParam("file") MultipartFile file) {
        if (file.isEmpty()) {
            return ResponseEntity.badRequest().body(Map.of("error", "Le fichier est vide"));
        }
        
        String fileName = file.getOriginalFilename().toLowerCase();
        if (!fileName.endsWith(".csv") && !fileName.endsWith(".xlsx") && !fileName.endsWith(".xls")) {
            return ResponseEntity.badRequest().body(Map.of("error", "Le fichier doit être au format CSV, XLSX ou XLS"));
        }
        
        try {
            System.out.println("=== DÉBUT uploadCsvFile (Controller) ===");
            System.out.println("DEBUG: Nom du fichier: " + fileName);
            System.out.println("DEBUG: Taille du fichier: " + file.getSize() + " bytes");
            
            List<EcartSolde> uploadedEcartSoldes = ecartSoldeService.uploadCsvFile(file);
            
            // Note: Le nombre de doublons est géré dans le service et affiché dans les logs
            // Ici on retourne seulement les enregistrements effectivement sauvegardés
            
            System.out.println("DEBUG: Résultats finaux:");
            System.out.println("  - Enregistrements sauvegardés: " + uploadedEcartSoldes.size());
            System.out.println("=== FIN uploadCsvFile (Controller) ===");
            
            return ResponseEntity.ok(Map.of(
                "message", "Fichier uploadé avec succès",
                "count", uploadedEcartSoldes.size(),
                "data", uploadedEcartSoldes
            ));
        } catch (IOException e) {
            System.err.println("=== ERREUR uploadCsvFile (Controller) - IOException ===");
            System.err.println("DEBUG: Exception: " + e.getMessage());
            e.printStackTrace();
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body(Map.of("error", "Erreur lors de la lecture du fichier: " + e.getMessage()));
        } catch (Exception e) {
            System.err.println("=== ERREUR uploadCsvFile (Controller) - Exception générale ===");
            System.err.println("DEBUG: Exception: " + e.getMessage());
            e.printStackTrace();
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body(Map.of("error", "Erreur lors du traitement du fichier: " + e.getMessage()));
        }
    }
    
    @PostMapping("/validate")
    public ResponseEntity<Map<String, Object>> validateFile(@RequestParam("file") MultipartFile file) {
        if (file.isEmpty()) {
            return ResponseEntity.badRequest().body(Map.of("error", "Le fichier est vide"));
        }
        
        String fileName = file.getOriginalFilename().toLowerCase();
        if (!fileName.endsWith(".csv") && !fileName.endsWith(".xlsx") && !fileName.endsWith(".xls")) {
            return ResponseEntity.badRequest().body(Map.of("error", "Le fichier doit être au format CSV, XLSX ou XLS"));
        }
        
        try {
            Map<String, Object> validationResult = ecartSoldeService.validateFile(file);
            return ResponseEntity.ok(validationResult);
        } catch (IOException e) {
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body(Map.of("error", "Erreur lors de la lecture du fichier: " + e.getMessage()));
        } catch (Exception e) {
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body(Map.of("error", "Erreur lors de la validation du fichier: " + e.getMessage()));
        }
    }
} 