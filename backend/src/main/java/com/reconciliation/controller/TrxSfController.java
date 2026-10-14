package com.reconciliation.controller;

import com.reconciliation.entity.TrxSfEntity;
import com.reconciliation.service.TrxSfService;
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
import java.util.Arrays;

@RestController
@RequestMapping("/api/trx-sf")
public class TrxSfController {
    
    @Autowired
    private TrxSfService trxSfService;
    
    @GetMapping
    public ResponseEntity<List<TrxSfEntity>> getTrxSfs(
            @RequestParam(required = false) String agence,
            @RequestParam(required = false) String service,
            @RequestParam(required = false) String pays,
            @RequestParam(required = false) String numeroTransGu,
            @RequestParam(required = false) String statut,
            @RequestParam(required = false) String dateDebut,
            @RequestParam(required = false) String dateFin) {
        
        try {
            System.out.println("[TRX_SF][GET] params agence=" + agence + 
                ", service=" + service + ", pays=" + pays + ", numeroTransGu=" + numeroTransGu +
                ", statut=" + statut + ", dateDebut=" + dateDebut + ", dateFin=" + dateFin);
            List<TrxSfEntity> trxSfList = trxSfService.getTrxSfs(
                agence, service, pays, numeroTransGu, statut, dateDebut, dateFin);
            System.out.println("[TRX_SF][GET] result size=" + (trxSfList != null ? trxSfList.size() : 0));
            return ResponseEntity.ok(trxSfList);
        } catch (Exception e) {
            System.err.println("[TRX_SF][GET][ERR] " + e.getMessage());
            return ResponseEntity.internalServerError().build();
        }
    }
    
    @GetMapping("/{id}")
    public ResponseEntity<TrxSfEntity> getTrxSfById(@PathVariable Long id) {
        return trxSfService.getTrxSfById(id)
                .map(ResponseEntity::ok)
                .orElse(ResponseEntity.notFound().build());
    }
    
    @GetMapping("/agence/{agence}")
    public ResponseEntity<List<TrxSfEntity>> getTrxSfByAgence(@PathVariable String agence) {
        List<TrxSfEntity> trxSfList = trxSfService.getTrxSfByAgence(agence);
        return ResponseEntity.ok(trxSfList);
    }
    
    @GetMapping("/service/{service}")
    public ResponseEntity<List<TrxSfEntity>> getTrxSfByService(@PathVariable String service) {
        List<TrxSfEntity> trxSfList = trxSfService.getTrxSfByService(service);
        return ResponseEntity.ok(trxSfList);
    }
    
    @GetMapping("/pays/{pays}")
    public ResponseEntity<List<TrxSfEntity>> getTrxSfByPays(@PathVariable String pays) {
        List<TrxSfEntity> trxSfList = trxSfService.getTrxSfByPays(pays);
        return ResponseEntity.ok(trxSfList);
    }
    
    @GetMapping("/statut/{statut}")
    public ResponseEntity<List<TrxSfEntity>> getTrxSfByStatut(@PathVariable String statut) {
        List<TrxSfEntity> trxSfList = trxSfService.getTrxSfByStatut(statut);
        return ResponseEntity.ok(trxSfList);
    }
    
    @GetMapping("/date-range")
    public ResponseEntity<List<TrxSfEntity>> getTrxSfByDateRange(
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) LocalDateTime dateDebut,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) LocalDateTime dateFin) {
        List<TrxSfEntity> trxSfList = trxSfService.getTrxSfByDateRange(dateDebut, dateFin);
        return ResponseEntity.ok(trxSfList);
    }
    
    @GetMapping("/agences")
    public ResponseEntity<List<String>> getDistinctAgences() {
        List<String> agences = trxSfService.getDistinctAgences();
        return ResponseEntity.ok(agences);
    }
    
    @GetMapping("/services")
    public ResponseEntity<List<String>> getDistinctServices() {
        List<String> services = trxSfService.getDistinctServices();
        return ResponseEntity.ok(services);
    }
    
    @GetMapping("/pays")
    public ResponseEntity<List<String>> getDistinctPays() {
        List<String> pays = trxSfService.getDistinctPays();
        return ResponseEntity.ok(pays);
    }
    
    @GetMapping("/numero-trans-gu")
    public ResponseEntity<List<String>> getDistinctNumeroTransGu() {
        List<String> numeroTransGu = trxSfService.getDistinctNumeroTransGu();
        return ResponseEntity.ok(numeroTransGu);
    }
    
    @PostMapping("/change-statut")
    public ResponseEntity<Map<String, Object>> changeStatutFromFile(@RequestParam("file") MultipartFile file) {
        try {
            Map<String, Object> result = trxSfService.processStatutChangeFile(file);
            return ResponseEntity.ok(result);
        } catch (Exception e) {
            Map<String, Object> errorResult = new HashMap<>();
            errorResult.put("success", false);
            errorResult.put("error", e.getMessage());
            errorResult.put("totalLines", 0);
            errorResult.put("processedLines", 0);
            errorResult.put("updatedLines", 0);
            errorResult.put("errorLines", 1);
            errorResult.put("errors", Arrays.asList(e.getMessage()));
            
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body(errorResult);
        }
    }
    
    @GetMapping("/statistics")
    public ResponseEntity<Map<String, Object>> getStatistics() {
        Map<String, Object> stats = trxSfService.getStatistics();
        return ResponseEntity.ok(stats);
    }
    
    @GetMapping("/frais/{agence}/{date}")
    public ResponseEntity<Map<String, Object>> getFraisByAgenceAndDate(
            @PathVariable String agence,
            @PathVariable String date) {
        Double frais = trxSfService.getFraisByAgenceAndDate(agence, date);
        Map<String, Object> response = Map.of(
            "agence", agence,
            "date", date,
            "frais", frais
        );
        return ResponseEntity.ok(response);
    }
    
    @GetMapping("/frais-en-attente/{agence}/{date}")
    public ResponseEntity<Map<String, Object>> getFraisByAgenceAndDateEnAttente(
            @PathVariable String agence,
            @PathVariable String date) {
        Double frais = trxSfService.getFraisByAgenceAndDateEnAttente(agence, date);
        Map<String, Object> response = Map.of(
            "agence", agence,
            "date", date,
            "frais", frais
        );
        return ResponseEntity.ok(response);
    }

    @GetMapping("/frais/{agence}/{date}/{service}")
    public ResponseEntity<Map<String, Object>> getFraisByAgenceAndDateAndService(
            @PathVariable String agence,
            @PathVariable String date,
            @PathVariable String service) {
        Double frais = trxSfService.getFraisByAgenceAndDateAndService(agence, date, service);
        Map<String, Object> response = Map.of(
            "agence", agence,
            "date", date,
            "service", service,
            "frais", frais
        );
        return ResponseEntity.ok(response);
    }

    @GetMapping("/frais-en-attente/{agence}/{date}/{service}")
    public ResponseEntity<Map<String, Object>> getFraisByAgenceAndDateAndServiceEnAttente(
            @PathVariable String agence,
            @PathVariable String date,
            @PathVariable String service) {
        Double frais = trxSfService.getFraisByAgenceAndDateAndServiceEnAttente(agence, date, service);
        Map<String, Object> response = Map.of(
            "agence", agence,
            "date", date,
            "service", service,
            "frais", frais
        );
        return ResponseEntity.ok(response);
    }
    
    @GetMapping("/frais-config/{service}")
    public ResponseEntity<Map<String, Object>> getFraisConfigByService(@PathVariable String service) {
        Map<String, Object> fraisConfig = trxSfService.getFraisConfigByService(service);
        return ResponseEntity.ok(fraisConfig);
    }
    
    @GetMapping("/duplicates")
    public ResponseEntity<List<TrxSfEntity>> getDuplicates() {
        List<TrxSfEntity> duplicates = trxSfService.findDuplicates();
        return ResponseEntity.ok(duplicates);
    }
    
    @DeleteMapping("/duplicates")
    public ResponseEntity<Map<String, Object>> removeDuplicates() {
        // Utiliser l'approche manuelle qui est plus fiable
        int removedCount = trxSfService.removeDuplicatesManually();
        Map<String, Object> response = Map.of(
            "message", "Doublons supprimés avec succès",
            "removedCount", removedCount
        );
        return ResponseEntity.ok(response);
    }
    
    @DeleteMapping("/duplicates/sql")
    public ResponseEntity<Map<String, Object>> removeDuplicatesSQL() {
        // Approche SQL directe (pour test)
        int removedCount = trxSfService.removeDuplicates();
        Map<String, Object> response = Map.of(
            "message", "Doublons supprimés avec succès (SQL)",
            "removedCount", removedCount
        );
        return ResponseEntity.ok(response);
    }
    
    @GetMapping("/check-duplicate/{idTransaction}/{agence}/{dateTransaction}")
    public ResponseEntity<Map<String, Object>> checkDuplicate(
            @PathVariable String idTransaction,
            @PathVariable String agence,
            @PathVariable String dateTransaction) {
        boolean exists = trxSfService.existsByTransactionDetails(idTransaction, agence, dateTransaction);
        Map<String, Object> response = Map.of(
            "idTransaction", idTransaction,
            "agence", agence,
            "dateTransaction", dateTransaction,
            "exists", exists
        );
        return ResponseEntity.ok(response);
    }
    
    @PostMapping
    public ResponseEntity<TrxSfEntity> createTrxSf(@RequestBody TrxSfEntity trxSf) {
        TrxSfEntity createdTrxSf = trxSfService.createTrxSf(trxSf);
        return ResponseEntity.status(HttpStatus.CREATED).body(createdTrxSf);
    }
    
    @PostMapping("/batch")
    public ResponseEntity<Map<String, Object>> createMultipleTrxSf(@RequestBody List<TrxSfEntity> trxSfList) {
        try {
            System.out.println("=== DÉBUT createMultipleTrxSf (Controller) ===");
            System.out.println("DEBUG: Nombre de transactions SF reçues: " + trxSfList.size());
            
            List<TrxSfEntity> createdTrxSfList = trxSfService.createMultipleTrxSf(trxSfList);
            
            Map<String, Object> response = Map.of(
                "message", "Transactions SF créées avec succès",
                "count", createdTrxSfList.size(),
                "data", createdTrxSfList
            );
            
            System.out.println("DEBUG: Nombre de transactions SF créées: " + createdTrxSfList.size());
            System.out.println("=== FIN createMultipleTrxSf (Controller) ===");
            
            return ResponseEntity.status(HttpStatus.CREATED).body(response);
        } catch (Exception e) {
            System.err.println("ERREUR lors de la création multiple: " + e.getMessage());
            e.printStackTrace();
            
            Map<String, Object> errorResponse = Map.of(
                "error", "Erreur lors de la création des transactions SF",
                "message", e.getMessage()
            );
            
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(errorResponse);
        }
    }
    
    @PutMapping("/{id}")
    public ResponseEntity<TrxSfEntity> updateTrxSf(@PathVariable Long id, @RequestBody TrxSfEntity trxSf) {
        TrxSfEntity updatedTrxSf = trxSfService.updateTrxSf(id, trxSf);
        if (updatedTrxSf != null) {
            return ResponseEntity.ok(updatedTrxSf);
        } else {
            return ResponseEntity.notFound().build();
        }
    }
    
    @DeleteMapping("/{id}")
    public ResponseEntity<Void> deleteTrxSf(@PathVariable Long id) {
        boolean deleted = trxSfService.deleteTrxSf(id);
        if (deleted) {
            return ResponseEntity.noContent().build();
        } else {
            return ResponseEntity.notFound().build();
        }
    }
    
    @PatchMapping("/{id}/statut")
    public ResponseEntity<Map<String, String>> updateStatut(@PathVariable Long id, @RequestBody Map<String, String> request) {
        String nouveauStatut = request.get("statut");
        String commentaire = request.get("commentaire");
        
        if (nouveauStatut == null) {
            return ResponseEntity.badRequest().body(Map.of("error", "Le statut est requis"));
        }
        
        boolean updated;
        if (commentaire != null && !commentaire.trim().isEmpty()) {
            updated = trxSfService.updateStatutWithComment(id, nouveauStatut, commentaire);
        } else {
            updated = trxSfService.updateStatut(id, nouveauStatut);
        }
        
        if (updated) {
            return ResponseEntity.ok(Map.of(
                "message", "Statut mis à jour avec succès",
                "statut", nouveauStatut
            ));
        } else {
            return ResponseEntity.notFound().build();
        }
    }
    
    @PutMapping("/{id}/statut")
    public ResponseEntity<Map<String, String>> updateStatutPut(@PathVariable Long id, @RequestBody Map<String, String> request) {
        String nouveauStatut = request.get("statut");
        String commentaire = request.get("commentaire");
        
        if (nouveauStatut == null) {
            return ResponseEntity.badRequest().body(Map.of("error", "Le statut est requis"));
        }
        
        boolean updated;
        if (commentaire != null && !commentaire.trim().isEmpty()) {
            updated = trxSfService.updateStatutWithComment(id, nouveauStatut, commentaire);
        } else {
            updated = trxSfService.updateStatut(id, nouveauStatut);
        }
        
        if (updated) {
            return ResponseEntity.ok(Map.of(
                "message", "Statut mis à jour avec succès",
                "statut", nouveauStatut
            ));
        } else {
            return ResponseEntity.notFound().build();
        }
    }
    
    @PostMapping("/{id}/statut")
    public ResponseEntity<Map<String, String>> updateStatutPost(@PathVariable Long id, 
                                                              @RequestParam String statut,
                                                              @RequestParam(required = false) String commentaire) {
        if (statut == null || statut.trim().isEmpty()) {
            return ResponseEntity.badRequest().body(Map.of("error", "Le statut est requis"));
        }
        
        boolean updated;
        if (commentaire != null && !commentaire.trim().isEmpty()) {
            updated = trxSfService.updateStatutWithComment(id, statut, commentaire);
        } else {
            updated = trxSfService.updateStatut(id, statut);
        }
        
        if (updated) {
            return ResponseEntity.ok(Map.of(
                "message", "Statut mis à jour avec succès",
                "statut", statut
            ));
        } else {
            return ResponseEntity.notFound().build();
        }
    }
    
    @PostMapping("/upload")
    public ResponseEntity<Map<String, Object>> uploadFile(@RequestParam("file") MultipartFile file) {
        try {
            System.out.println("=== DÉBUT uploadFile (Controller) ===");
            System.out.println("DEBUG: Nom du fichier: " + file.getOriginalFilename());
            System.out.println("DEBUG: Taille du fichier: " + file.getSize() + " bytes");
            
            List<TrxSfEntity> uploadedTrxSfList;
            
            String originalFileName = file.getOriginalFilename();
            String fileName = originalFileName != null ? originalFileName.toLowerCase() : "";
            
            if (fileName.endsWith(".csv")) {
                uploadedTrxSfList = trxSfService.uploadCsvFile(file);
            } else {
                uploadedTrxSfList = trxSfService.uploadExcelFile(file);
            }
            
            Map<String, Object> response = Map.of(
                "message", "Fichier uploadé avec succès",
                "count", uploadedTrxSfList.size(),
                "data", uploadedTrxSfList
            );
            
            System.out.println("DEBUG: Nombre de transactions SF uploadées: " + uploadedTrxSfList.size());
            System.out.println("=== FIN uploadFile (Controller) ===");
            
            return ResponseEntity.status(HttpStatus.CREATED).body(response);
        } catch (IOException e) {
            System.err.println("ERREUR lors de l'upload: " + e.getMessage());
            e.printStackTrace();
            
            Map<String, Object> errorResponse = Map.of(
                "error", "Erreur lors de l'upload du fichier",
                "message", e.getMessage()
            );
            
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(errorResponse);
        }
    }
    
    @PostMapping("/validate")
    public ResponseEntity<Map<String, Object>> validateFile(@RequestParam("file") MultipartFile file) {
        try {
            System.out.println("=== DÉBUT validateFile (Controller) ===");
            System.out.println("DEBUG: Nom du fichier: " + file.getOriginalFilename());
            System.out.println("DEBUG: Taille du fichier: " + file.getSize() + " bytes");
            
            Map<String, Object> validationResult = trxSfService.validateFile(file);
            
            System.out.println("DEBUG: Résultat de validation: " + validationResult);
            System.out.println("=== FIN validateFile (Controller) ===");
            
            return ResponseEntity.ok(validationResult);
        } catch (IOException e) {
            System.err.println("ERREUR lors de la validation: " + e.getMessage());
            e.printStackTrace();
            
            Map<String, Object> errorResponse = Map.of(
                "error", "Erreur lors de la validation du fichier",
                "message", e.getMessage()
            );
            
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(errorResponse);
        }
    }
}
