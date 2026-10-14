package com.reconciliation.controller;

import com.reconciliation.model.Operation;
import com.reconciliation.service.OperationService;
import com.reconciliation.service.OperationBusinessService;
import com.reconciliation.dto.OperationUpdateRequest;
import com.reconciliation.dto.OperationCreateRequest;
import com.reconciliation.dto.FormOperationCreateRequest;
import com.reconciliation.dto.DeleteOperationsRequest;
import com.reconciliation.dto.DeleteOperationsResponse;
import com.reconciliation.util.RequestContextUtil;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.http.HttpStatus;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.HashMap;
import java.util.ArrayList;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/api/operations")
@CrossOrigin(origins = {"http://localhost:4200", "http://172.214.108.8:4200"})
public class OperationController {
    
    private static final Logger logger = LoggerFactory.getLogger(OperationController.class);
    
    @Autowired
    private OperationService operationService;
    
    @Autowired
    private OperationBusinessService operationBusinessService;

    @Autowired
    private com.reconciliation.service.OperationImportService operationImportService;

    @Autowired
    private com.reconciliation.repository.CompteRepository compteRepository;
    
    @GetMapping
    public ResponseEntity<List<Operation>> getAllOperations() {
        try {
            String username = RequestContextUtil.getUsernameFromRequest();
            List<Operation> operations = operationService.getAllOperations(username);
            return ResponseEntity.ok(operations);
        } catch (Exception e) {
            logger.error("[API] Erreur dans /operations: {}", e.getMessage(), e);
            e.printStackTrace();
            return ResponseEntity.internalServerError().build();
        }
    }
    
    @GetMapping("/with-frais")
    public ResponseEntity<List<Operation>> getAllOperationsWithFrais() {
        try {
            String username = RequestContextUtil.getUsernameFromRequest();
            List<Operation> operations = operationService.getAllOperationsWithFrais(username);
            return ResponseEntity.ok(operations);
        } catch (Exception e) {
            logger.error("[API] Erreur dans /operations/with-frais: {}", e.getMessage(), e);
            return ResponseEntity.badRequest().build();
        }
    }

    // Import Excel/CSV d'opérations (transaction_cree / annulation_bo)
    @PostMapping(value = "/upload", consumes = {"multipart/form-data"})
    public ResponseEntity<java.util.Map<String, Object>> upload(@RequestParam("file") MultipartFile file) {
        try {
            var res = operationImportService.importFile(file);
            java.util.Map<String, Object> payload = new java.util.HashMap<>();
            payload.put("totalRead", res.totalRead);
            payload.put("saved", res.saved);
            payload.put("errors", res.errors);
            return ResponseEntity.ok(payload);
        } catch (Exception e) {
            return ResponseEntity.status(HttpStatus.BAD_REQUEST).build();
        }
    }

    // Télécharger le modèle Excel à utiliser pour l'upload
    @GetMapping(value = "/template", produces = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
    public ResponseEntity<byte[]> downloadTemplate() {
        try {
            byte[] bytes = operationImportService.generateTemplate();
            return ResponseEntity.ok()
                    .header(org.springframework.http.HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=modele-operations.xlsx")
                    .body(bytes);
        } catch (Exception e) {
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).build();
        }
    }
    
    @GetMapping("/{id}")
    public ResponseEntity<Operation> getOperationById(@PathVariable Long id) {
        Optional<Operation> operation = operationService.getOperationById(id);
        return operation.map(ResponseEntity::ok)
                .orElse(ResponseEntity.notFound().build());
    }
    
    @GetMapping("/{id}/with-frais")
    public ResponseEntity<Operation> getOperationByIdWithFrais(@PathVariable Long id) {
        try {
            Optional<Operation> operation = operationService.getOperationByIdWithFrais(id);
            return operation.map(ResponseEntity::ok)
                    .orElse(ResponseEntity.notFound().build());
        } catch (Exception e) {
            logger.error("[API] Erreur dans /operations/{}/with-frais: {}", id, e.getMessage(), e);
            return ResponseEntity.badRequest().build();
        }
    }
    
    @GetMapping("/compte/{compteId}")
    public ResponseEntity<List<Operation>> getOperationsByCompteId(@PathVariable Long compteId) {
        List<Operation> operations = operationService.getOperationsByCompteId(compteId);
        return ResponseEntity.ok(operations);
    }
    
    @GetMapping("/compte/numero")
    public ResponseEntity<List<Operation>> getOperationsByCompte(
            @RequestParam String numeroCompte,
            @RequestParam(required = false) String dateDebut,
            @RequestParam(required = false) String dateFin,
            @RequestParam(required = false) String typeOperation) {
        try {
            logger.info("[API] /operations/compte/numero appelée avec numeroCompte={}, dateDebut={}, dateFin={}, typeOperation={}", 
                       numeroCompte, dateDebut, dateFin, typeOperation);
            
            LocalDateTime debut = null;
            LocalDateTime fin = null;
            
            if (dateDebut != null && !dateDebut.isEmpty()) {
                debut = LocalDateTime.parse(dateDebut + (dateDebut.length() == 10 ? "T00:00:00" : ""));
            }
            if (dateFin != null && !dateFin.isEmpty()) {
                fin = LocalDateTime.parse(dateFin + (dateFin.length() == 10 ? "T23:59:59" : ""));
            }
            
            List<Operation> operations = operationService.getOperationsByCompte(numeroCompte, debut, fin, typeOperation);
            logger.info("[API] /operations/compte/numero retourne {} opérations", operations.size());
            return ResponseEntity.ok(operations);
        } catch (Exception e) {
            logger.error("[API] Erreur dans /operations/compte/numero: {}", e.getMessage(), e);
            return ResponseEntity.badRequest().build();
        }
    }
    
    @GetMapping("/compte/numero/releve")
    public ResponseEntity<List<Operation>> getOperationsByCompteForReleve(
            @RequestParam String numeroCompte,
            @RequestParam(required = false) String dateDebut,
            @RequestParam(required = false) String dateFin,
            @RequestParam(required = false) String typeOperation) {
        try {
            logger.info("[API] /operations/compte/numero/releve appelée avec numeroCompte={}, dateDebut={}, dateFin={}, typeOperation={}", 
                       numeroCompte, dateDebut, dateFin, typeOperation);
            
            LocalDateTime debut = null;
            LocalDateTime fin = null;
            
            if (dateDebut != null && !dateDebut.isEmpty()) {
                debut = LocalDateTime.parse(dateDebut + (dateDebut.length() == 10 ? "T00:00:00" : ""));
            }
            if (dateFin != null && !dateFin.isEmpty()) {
                fin = LocalDateTime.parse(dateFin + (dateFin.length() == 10 ? "T23:59:59" : ""));
            }
            
            List<Operation> operations = operationService.getOperationsByCompteForReleve(numeroCompte, debut, fin, typeOperation);
            logger.info("[API] /operations/compte/numero/releve retourne {} opérations", operations.size());
            
            
            return ResponseEntity.ok(operations);
        } catch (Exception e) {
            logger.error("[API] Erreur dans /operations/compte/numero/releve: {}", e.getMessage(), e);
            return ResponseEntity.badRequest().build();
        }
    }
    
    @GetMapping("/type/{typeOperation}")
    public ResponseEntity<List<Operation>> getOperationsByType(@PathVariable String typeOperation) {
        List<Operation> operations = operationService.getOperationsByType(typeOperation);
        return ResponseEntity.ok(operations);
    }
    
    @GetMapping("/pays/{pays}")
    public ResponseEntity<List<Operation>> getOperationsByPays(@PathVariable String pays) {
        List<Operation> operations = operationService.getOperationsByPays(pays);
        return ResponseEntity.ok(operations);
    }
    
    @GetMapping("/statut/{statut}")
    public ResponseEntity<List<Operation>> getOperationsByStatut(@PathVariable String statut) {
        List<Operation> operations = operationService.getOperationsByStatut(statut);
        return ResponseEntity.ok(operations);
    }
    
    @GetMapping("/banque/{banque}")
    public ResponseEntity<List<Operation>> getOperationsByBanque(@PathVariable String banque) {
        List<Operation> operations = operationService.getOperationsByBanque(banque);
        return ResponseEntity.ok(operations);
    }
    
    @GetMapping("/service/{service}")
    public ResponseEntity<List<Operation>> getOperationsByService(@PathVariable String service) {
        List<Operation> operations = operationService.getOperationsByService(service);
        return ResponseEntity.ok(operations);
    }
    
    @GetMapping("/montant/{montantMin}")
    public ResponseEntity<List<Operation>> getOperationsByMontantSuperieurA(@PathVariable Double montantMin) {
        List<Operation> operations = operationService.getOperationsByMontantSuperieurA(montantMin);
        return ResponseEntity.ok(operations);
    }
    
    @GetMapping("/proprietaire/{codeProprietaire}")
    public ResponseEntity<List<Operation>> getOperationsByCodeProprietaire(@PathVariable String codeProprietaire) {
        List<Operation> operations = operationService.getOperationsByCodeProprietaire(codeProprietaire);
        return ResponseEntity.ok(operations);
    }
    
    @GetMapping("/bordereau/{nomBordereau}")
    public ResponseEntity<List<Operation>> getOperationsByNomBordereau(@PathVariable String nomBordereau) {
        List<Operation> operations = operationService.getOperationsByNomBordereau(nomBordereau);
        return ResponseEntity.ok(operations);
    }
    
    @GetMapping("/date-range")
    public ResponseEntity<List<Operation>> getOperationsByDateRange(
            @RequestParam String dateDebut, 
            @RequestParam String dateFin) {
        try {
            logger.info("[API] /operations/date-range appelée avec dateDebut={} et dateFin={}", dateDebut, dateFin);
            LocalDateTime debut = LocalDateTime.parse(dateDebut + (dateDebut.length() == 10 ? "T00:00:00" : ""));
            LocalDateTime fin = LocalDateTime.parse(dateFin + (dateFin.length() == 10 ? "T23:59:59" : ""));
            logger.info("[API] dateDebut convertie: {} | dateFin convertie: {}", debut, fin);
            List<Operation> operations = operationService.getOperationsByDateRange(debut, fin);
            logger.info("[API] /operations/date-range retourne {} opérations", operations.size());
            return ResponseEntity.ok(operations);
        } catch (Exception e) {
            logger.error("[API] Erreur dans /operations/date-range: {}", e.getMessage(), e);
            return ResponseEntity.badRequest().build();
        }
    }
    
    @PostMapping
    public ResponseEntity<Operation> createOperation(@RequestBody OperationCreateRequest request) {
        try {
            Operation savedOperation = operationService.createOperation(request);
            return ResponseEntity.ok(savedOperation);
        } catch (Exception e) {
            return ResponseEntity.badRequest().body(null);
        }
    }

    // Création simple depuis le formulaire (sélection par numéro de compte)
    @PostMapping("/manual-from-form")
    public ResponseEntity<?> createOperationFromForm(@RequestBody FormOperationCreateRequest form) {
        try {
            if (form.getNumeroCompte() == null || form.getNumeroCompte().trim().isEmpty()) {
                return ResponseEntity.badRequest().body("numeroCompte requis");
            }
            var compteOpt = compteRepository.findByNumeroCompte(form.getNumeroCompte().trim());
            if (compteOpt.isEmpty()) {
                return ResponseEntity.status(HttpStatus.NOT_FOUND).body("Compte introuvable: " + form.getNumeroCompte());
            }

            OperationCreateRequest req = new OperationCreateRequest();
            req.setCompteId(compteOpt.get().getId());
            req.setTypeOperation(form.getTypeOperation());
            req.setMontant(form.getMontant());
            req.setBanque(form.getBanque());
            req.setNomBordereau(form.getLibelle());
            req.setService(null);
            req.setDateOperation(form.getDateComptable());
            req.setRecordCount(1);

            Operation created = operationService.createSingleOperation(req);
            return ResponseEntity.ok(created);
        } catch (Exception e) {
            logger.error("[API] Erreur createOperationFromForm: {}", e.getMessage(), e);
            return ResponseEntity.badRequest().body(e.getMessage());
        }
    }
    
    @PostMapping("/manual-with-four-operations")
    public ResponseEntity<Operation> createOperationWithFourOperations(@RequestBody OperationCreateRequest request) {
        try {
            logger.info("🔧 Création manuelle avec logique des 4 opérations - Type: {}, Service: {}", 
                       request.getTypeOperation(), request.getService());
            Operation savedOperation = operationService.createOperationWithFourOperations(request);
            return ResponseEntity.ok(savedOperation);
        } catch (Exception e) {
            logger.error("❌ Erreur lors de la création manuelle avec 4 opérations: {}", e.getMessage(), e);
            return ResponseEntity.badRequest().body(null);
        }
    }
    
    @PutMapping("/{id}")
    public ResponseEntity<Operation> updateOperation(@PathVariable Long id, @RequestBody OperationUpdateRequest request) {
        try {
            Operation updatedOperation = operationService.updateOperation(id, request);
            return ResponseEntity.ok(updatedOperation);
        } catch (IllegalArgumentException e) {
            return ResponseEntity.notFound().build();
        } catch (IllegalStateException e) {
            return ResponseEntity.badRequest().build();
        }
    }
    
    @PutMapping("/{id}/statut")
    public ResponseEntity<Boolean> updateOperationStatut(@PathVariable Long id, @RequestBody String nouveauStatut) {
        boolean updated = operationService.updateOperationStatut(id, nouveauStatut);
        return updated ? ResponseEntity.ok(true) : ResponseEntity.notFound().build();
    }
    
    // Mise à jour en lot des statuts d'opérations
    @PutMapping("/bulk-statut")
    public ResponseEntity<Integer> bulkUpdateOperationStatut(@RequestBody com.reconciliation.dto.BulkUpdateStatutRequest request) {
        int updated = operationService.bulkUpdateOperationStatut(request.getIds(), request.getStatut());
        return ResponseEntity.ok(updated);
    }
    
    @PutMapping("/{id}/validate")
    public ResponseEntity<Boolean> validateOperation(@PathVariable Long id) {
        boolean validated = operationBusinessService.validateOperation(id);
        return validated ? ResponseEntity.ok(true) : ResponseEntity.notFound().build();
    }
    
    @PutMapping("/{id}/reject")
    public ResponseEntity<Boolean> rejectOperation(@PathVariable Long id) {
        boolean rejected = operationBusinessService.rejectOperation(id);
        return rejected ? ResponseEntity.ok(true) : ResponseEntity.notFound().build();
    }
    
    @PutMapping("/{id}/cancel")
    public ResponseEntity<Boolean> cancelOperation(@PathVariable Long id) {
        try {
            logger.info("🔧 Tentative d'annulation de l'opération ID: {}", id);
            boolean cancelled = operationBusinessService.cancelOperation(id);
            if (cancelled) {
                logger.info("✅ Opération ID: {} annulée avec succès", id);
                return ResponseEntity.ok(true);
            } else {
                logger.warn("⚠️ Impossible d'annuler l'opération ID: {}", id);
                return ResponseEntity.notFound().build();
            }
        } catch (Exception e) {
            logger.error("❌ Erreur lors de l'annulation de l'opération ID: {}: {}", id, e.getMessage(), e);
            return ResponseEntity.status(500).body(false);
        }
    }
    
    @DeleteMapping("/{id}")
    public ResponseEntity<Boolean> deleteOperation(@PathVariable Long id) {
        boolean deleted = operationService.deleteOperation(id);
        return deleted ? ResponseEntity.ok(true) : ResponseEntity.notFound().build();
    }

    @RequestMapping(value = "/delete-batch", method = RequestMethod.OPTIONS)
    @CrossOrigin(origins = {"http://localhost:4200", "http://172.214.108.8:4200"})
    public ResponseEntity<?> handleDeleteBatchOptions() {
        return ResponseEntity.ok().build();
    }

    @PostMapping("/delete-batch")
    @CrossOrigin(origins = {"http://localhost:4200", "http://172.214.108.8:4200"}, methods = {RequestMethod.POST, RequestMethod.OPTIONS})
    public ResponseEntity<DeleteOperationsResponse> deleteOperations(@RequestBody DeleteOperationsRequest request) {
        try {
            logger.info("🔧 Suppression en lot de {} opérations", request.getIds().size());
            
            List<String> errors = new ArrayList<>();
            int deletedCount = 0;
            
            for (Long id : request.getIds()) {
                try {
                    boolean deleted = operationService.deleteOperation(id);
                    if (deleted) {
                        deletedCount++;
                        logger.info("✅ Opération ID: {} supprimée avec succès", id);
                    } else {
                        errors.add("Opération ID " + id + " non trouvée");
                        logger.warn("⚠️ Opération ID: {} non trouvée", id);
                    }
                } catch (Exception e) {
                    String error = "Erreur lors de la suppression de l'opération ID " + id + ": " + e.getMessage();
                    errors.add(error);
                    logger.error("❌ Erreur lors de la suppression de l'opération ID: {}: {}", id, e.getMessage(), e);
                }
            }
            
            boolean success = errors.isEmpty() || deletedCount > 0;
            DeleteOperationsResponse response = new DeleteOperationsResponse(success, deletedCount, errors);
            
            logger.info("✅ Suppression en lot terminée: {} supprimées, {} erreurs", deletedCount, errors.size());
            return ResponseEntity.ok(response);
            
        } catch (Exception e) {
            logger.error("❌ Erreur lors de la suppression en lot: {}", e.getMessage(), e);
            DeleteOperationsResponse response = new DeleteOperationsResponse(false, 0, List.of("Erreur générale: " + e.getMessage()));
            return ResponseEntity.status(500).body(response);
        }
    }
    
    @GetMapping("/{id}/can-process")
    public ResponseEntity<Boolean> canProcessOperation(
            @PathVariable Long id,
            @RequestParam String typeOperation,
            @RequestParam Double montant) {
        boolean canProcess = operationBusinessService.canProcessOperation(id, typeOperation, montant);
        return ResponseEntity.ok(canProcess);
    }
    
    @GetMapping("/{id}/solde-impact")
    public ResponseEntity<Double> getSoldeImpact(
            @PathVariable Long id,
            @RequestParam String typeOperation,
            @RequestParam Double montant) {
        double impact = operationBusinessService.calculateSoldeImpact(typeOperation, montant);
        return ResponseEntity.ok(impact);
    }
    
    @GetMapping("/stats/by-type")
    public ResponseEntity<Map<String, Object>> getStatsByType() {
        try {
            Map<String, Object> stats = operationService.getStatsByType();
            return ResponseEntity.ok(stats);
        } catch (Exception e) {
            return ResponseEntity.badRequest().build();
        }
    }
    
    @GetMapping("/stats/by-type/filtered")
    public ResponseEntity<Map<String, Object>> getStatsByTypeWithFilters(
            @RequestParam(required = false) String pays,
            @RequestParam(required = false) Long compteId) {
        try {
            Map<String, Object> stats = operationService.getStatsByTypeWithFilters(pays, compteId);
            return ResponseEntity.ok(stats);
        } catch (Exception e) {
            return ResponseEntity.badRequest().build();
        }
    }
    
    @PostMapping("/correct-frais-parent")
    public ResponseEntity<Map<String, Object>> correctFraisParentOperationId() {
        try {
            int correctedCount = operationService.correctFraisParentOperationId();
            Map<String, Object> response = new HashMap<>();
            response.put("correctedCount", correctedCount);
            response.put("message", correctedCount + " frais ont été corrigés avec succès.");
            return ResponseEntity.ok(response);
        } catch (Exception e) {
            Map<String, Object> errorResponse = new HashMap<>();
            errorResponse.put("error", "Erreur lors de la correction des frais: " + e.getMessage());
            return ResponseEntity.badRequest().body(errorResponse);
        }
    }
    
    @GetMapping("/code-proprietaire/list")
    public ResponseEntity<List<String>> getDistinctCodeProprietaire() {
        List<String> codes = operationService.getDistinctCodeProprietaire();
        return ResponseEntity.ok(codes);
    }
    
    @GetMapping("/banque/list")
    public ResponseEntity<List<String>> getDistinctBanque() {
        List<String> banques = operationService.getDistinctBanque();
        return ResponseEntity.ok(banques);
    }
    
    @GetMapping("/service/list")
    public ResponseEntity<List<String>> getDistinctService() {
        List<String> services = operationService.getDistinctService();
        return ResponseEntity.ok(services);
    }
    
    @GetMapping("/service/list/{codeProprietaire}")
    public ResponseEntity<List<String>> getDistinctServiceByCodeProprietaire(@PathVariable String codeProprietaire) {
        List<String> services = operationService.getDistinctServiceByCodeProprietaire(codeProprietaire);
        return ResponseEntity.ok(services);
    }
    
    @GetMapping("/filter")
    public ResponseEntity<List<Operation>> filterOperations(
            @RequestParam(required = false) Long compteId,
            @RequestParam(required = false) String typeOperation,
            @RequestParam(required = false) String pays,
            @RequestParam(required = false) String statut,
            @RequestParam(required = false) String banque,
            @RequestParam(required = false) String codeProprietaire,
            @RequestParam(required = false) String service,
            @RequestParam(required = false) String nomBordereau,
            @RequestParam(required = false) String dateDebut,
            @RequestParam(required = false) String dateFin) {
        
        LocalDateTime debut = null;
        LocalDateTime fin = null;
        
        try {
            if (dateDebut != null && !dateDebut.isEmpty()) {
                debut = LocalDateTime.parse(dateDebut);
            }
            if (dateFin != null && !dateFin.isEmpty()) {
                fin = LocalDateTime.parse(dateFin);
            }
        } catch (Exception e) {
            return ResponseEntity.badRequest().build();
        }
        
        List<Operation> operations = operationService.filterOperations(
                compteId, typeOperation, pays, statut, banque, codeProprietaire, service, nomBordereau, debut, fin);
        return ResponseEntity.ok(operations);
    }
    
    @PostMapping("/test-create-operation")
    public ResponseEntity<Map<String, Object>> testCreateOperation(@RequestBody OperationCreateRequest request) {
        try {
            System.out.println("=== TEST CREATE OPERATION ===");
            System.out.println("Request: " + request);
            
            Operation createdOperation = operationService.createOperation(request);
            
            Map<String, Object> response = new HashMap<>();
            response.put("success", true);
            response.put("operation", createdOperation);
            response.put("message", "Opération créée avec succès");
            
            // Check if a fee operation was created
            List<Operation> feeOperations = operationService.getOperationsByType("FRAIS_TRANSACTION");
            List<Operation> recentFeeOperations = feeOperations.stream()
                .filter(op -> op.getNomBordereau() != null && op.getNomBordereau().contains("FEES_SUMMARY"))
                .filter(op -> op.getDateOperation().equals(createdOperation.getDateOperation()))
                .collect(Collectors.toList());
            
            response.put("feeOperationsCreated", recentFeeOperations.size());
            response.put("feeOperations", recentFeeOperations);
            
            return ResponseEntity.ok(response);
            
        } catch (Exception e) {
            System.out.println("ERROR in test-create-operation: " + e.getMessage());
            e.printStackTrace();
            
            Map<String, Object> response = new HashMap<>();
            response.put("success", false);
            response.put("error", e.getMessage());
            return ResponseEntity.badRequest().body(response);
        }
    }
    
    @GetMapping("/compte/{compteId}/with-frais")
    public ResponseEntity<List<Operation>> getOperationsByCompteIdWithFrais(@PathVariable Long compteId) {
        try {
            List<Operation> operations = operationService.getOperationsByCompteIdWithFrais(compteId);
            return ResponseEntity.ok(operations);
        } catch (Exception e) {
            logger.error("[API] Erreur dans /operations/compte/{}/with-frais: {}", compteId, e.getMessage(), e);
            return ResponseEntity.badRequest().build();
        }
    }
    
    /**
     * Synchronise les soldes de clôture de tous les comptes
     */
    @PostMapping("/synchronize-closing-balances")
    public ResponseEntity<Map<String, Object>> synchronizeClosingBalances() {
        try {
            logger.info("Demande de synchronisation des soldes de clôture");
            
            operationService.synchroniserSoldesClotureQuotidiens();
            
            Map<String, Object> response = new HashMap<>();
            response.put("success", true);
            response.put("message", "Synchronisation des soldes de clôture terminée avec succès");
            response.put("timestamp", LocalDateTime.now());
            
            return ResponseEntity.ok(response);
        } catch (Exception e) {
            logger.error("Erreur lors de la synchronisation des soldes de clôture: {}", e.getMessage(), e);
            
            Map<String, Object> response = new HashMap<>();
            response.put("success", false);
            response.put("message", "Erreur lors de la synchronisation: " + e.getMessage());
            response.put("timestamp", LocalDateTime.now());
            
            return ResponseEntity.badRequest().body(response);
        }
    }
    
    /**
     * Recalcule le solde de clôture d'un compte spécifique
     */
    @PostMapping("/recalculate-closing-balance/{compteId}")
    public ResponseEntity<Map<String, Object>> recalculateClosingBalance(@PathVariable Long compteId) {
        try {
            logger.info("Demande de recalcul du solde de clôture pour le compte {}", compteId);
            
            // Note: Le recalcul automatique du solde est désactivé pour éviter d'écraser les soldes corrects
            // operationService.recalculerSoldeClotureCompte(compteId);
            
            Map<String, Object> response = new HashMap<>();
            response.put("success", true);
            response.put("message", "Solde de clôture recalculé avec succès pour le compte " + compteId);
            response.put("compteId", compteId);
            response.put("timestamp", LocalDateTime.now());
            
            return ResponseEntity.ok(response);
        } catch (Exception e) {
            logger.error("Erreur lors du recalcul du solde de clôture pour le compte {}: {}", compteId, e.getMessage(), e);
            
            Map<String, Object> response = new HashMap<>();
            response.put("success", false);
            response.put("message", "Erreur lors du recalcul: " + e.getMessage());
            response.put("compteId", compteId);
            response.put("timestamp", LocalDateTime.now());
            
            return ResponseEntity.badRequest().body(response);
        }
    }

} 