package com.reconciliation.controller;

import com.reconciliation.model.OperationBancaire;
import com.reconciliation.service.OperationBancaireService;
import com.reconciliation.dto.OperationBancaireCreateRequest;
import com.reconciliation.dto.OperationBancaireUpdateRequest;
import com.reconciliation.util.RequestContextUtil;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

@RestController
@RequestMapping("/api/operations-bancaires")
@CrossOrigin(origins = {"http://localhost:4200", "http://172.214.108.8:4200"})
public class OperationBancaireController {
    
    @Autowired
    private OperationBancaireService operationBancaireService;
    @Autowired
    private com.reconciliation.service.OperationBancaireImportService importService;
    @Autowired
    private com.reconciliation.repository.OperationBancaireRepository operationBancaireRepository;
    
    
    // Récupérer toutes les opérations bancaires
    @GetMapping
    public ResponseEntity<List<OperationBancaire>> getAllOperationsBancaires() {
        String username = RequestContextUtil.getUsernameFromRequest();
        List<OperationBancaire> operations = operationBancaireService.getAllOperationsBancaires(username);
        // Log pour déboguer le traitement
        operations.stream()
            .filter(op -> op.getTraitement() != null)
            .forEach(op -> System.out.println("🔍 Opération ID: " + op.getId() + " - Traitement: " + op.getTraitement()));
        return ResponseEntity.ok(operations);
    }

    // Mise à jour en lot des statuts
    @PutMapping("/bulk-statut")
    public ResponseEntity<Integer> bulkUpdateStatut(@RequestBody com.reconciliation.dto.BulkUpdateStatutRequest request) {
        int updated = operationBancaireService.bulkUpdateStatut(request.getIds(), request.getStatut());
        return ResponseEntity.ok(updated);
    }
    
    // Récupérer une opération bancaire par ID
    @GetMapping("/{id}")
    public ResponseEntity<OperationBancaire> getOperationBancaireById(@PathVariable Long id) {
        Optional<OperationBancaire> operation = operationBancaireService.getOperationBancaireById(id);
        return operation.map(ResponseEntity::ok)
                .orElse(ResponseEntity.notFound().build());
    }
    
    // Récupérer les opérations bancaires par pays
    @GetMapping("/pays/{pays}")
    public ResponseEntity<List<OperationBancaire>> getOperationsBancairesByPays(@PathVariable String pays) {
        String username = RequestContextUtil.getUsernameFromRequest();
        List<OperationBancaire> operations = operationBancaireService.getOperationsBancairesByPays(pays, username);
        return ResponseEntity.ok(operations);
    }
    
    // Récupérer les opérations bancaires par agence
    @GetMapping("/agence/{agence}")
    public ResponseEntity<List<OperationBancaire>> getOperationsBancairesByAgence(@PathVariable String agence) {
        String username = RequestContextUtil.getUsernameFromRequest();
        List<OperationBancaire> operations = operationBancaireService.getOperationsBancairesByAgence(agence, username);
        return ResponseEntity.ok(operations);
    }
    
    // Récupérer les opérations bancaires par statut
    @GetMapping("/statut/{statut}")
    public ResponseEntity<List<OperationBancaire>> getOperationsBancairesByStatut(@PathVariable String statut) {
        String username = RequestContextUtil.getUsernameFromRequest();
        List<OperationBancaire> operations = operationBancaireService.getOperationsBancairesByStatut(statut, username);
        return ResponseEntity.ok(operations);
    }
    
    // Récupérer les opérations bancaires par plage de dates
    @GetMapping("/date-range")
    public ResponseEntity<List<OperationBancaire>> getOperationsBancairesByDateRange(
            @RequestParam String dateDebut,
            @RequestParam String dateFin) {
        String username = RequestContextUtil.getUsernameFromRequest();
        LocalDateTime debut = LocalDateTime.parse(dateDebut);
        LocalDateTime fin = LocalDateTime.parse(dateFin);
        List<OperationBancaire> operations = operationBancaireService.getOperationsBancairesByDateRange(debut, fin, username);
        return ResponseEntity.ok(operations);
    }
    
    // Filtrer les opérations bancaires
    @GetMapping("/filter")
    public ResponseEntity<List<OperationBancaire>> filterOperationsBancaires(
            @RequestParam(required = false) String pays,
            @RequestParam(required = false) String codePays,
            @RequestParam(required = false) String mois,
            @RequestParam(required = false) String agence,
            @RequestParam(required = false) String typeOperation,
            @RequestParam(required = false) String statut,
            @RequestParam(required = false) String dateDebut,
            @RequestParam(required = false) String dateFin,
            @RequestParam(required = false) String reference) {
        
        String username = RequestContextUtil.getUsernameFromRequest();
        
        LocalDateTime debut = null;
        LocalDateTime fin = null;
        
        if (dateDebut != null && !dateDebut.isEmpty()) {
            debut = LocalDateTime.parse(dateDebut);
        }
        if (dateFin != null && !dateFin.isEmpty()) {
            fin = LocalDateTime.parse(dateFin);
        }
        
        List<OperationBancaire> operations = operationBancaireService.filterOperationsBancaires(
                pays, codePays, mois, agence, typeOperation, statut, debut, fin, reference, username);
        return ResponseEntity.ok(operations);
    }
    
    // Créer une nouvelle opération bancaire
    @PostMapping
    public ResponseEntity<OperationBancaire> createOperationBancaire(@RequestBody OperationBancaireCreateRequest request) {
        try {
            OperationBancaire operation = operationBancaireService.createOperationBancaire(request);
            return ResponseEntity.status(HttpStatus.CREATED).body(operation);
        } catch (Exception e) {
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).build();
        }
    }
    
    // Mettre à jour une opération bancaire
    @PutMapping("/{id}")
    public ResponseEntity<OperationBancaire> updateOperationBancaire(
            @PathVariable Long id,
            @RequestBody OperationBancaireUpdateRequest request) {
        try {
            OperationBancaire operation = operationBancaireService.updateOperationBancaire(id, request);
            return ResponseEntity.ok(operation);
        } catch (IllegalArgumentException e) {
            return ResponseEntity.notFound().build();
        } catch (Exception e) {
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).build();
        }
    }
    
    // Supprimer une opération bancaire
    @DeleteMapping("/{id}")
    public ResponseEntity<Boolean> deleteOperationBancaire(@PathVariable Long id) {
        boolean deleted = operationBancaireService.deleteOperationBancaire(id);
        if (deleted) {
            return ResponseEntity.ok(true);
        }
        return ResponseEntity.notFound().build();
    }
    
    // Récupérer les opérations bancaires récentes
    @GetMapping("/recent")
    public ResponseEntity<List<OperationBancaire>> getRecentOperationsBancaires(
            @RequestParam(defaultValue = "10") int limit) {
        String username = RequestContextUtil.getUsernameFromRequest();
        List<OperationBancaire> operations = operationBancaireService.getAllOperationsBancaires(username);
        if (operations.size() > limit) {
            operations = operations.subList(0, limit);
        }
        return ResponseEntity.ok(operations);
    }
    
    // Récupérer la liste des pays distincts
    @GetMapping("/pays/list")
    public ResponseEntity<List<String>> getDistinctPays() {
        String username = RequestContextUtil.getUsernameFromRequest();
        List<String> pays = operationBancaireService.getDistinctPays(username);
        return ResponseEntity.ok(pays);
    }
    
    // Récupérer la liste des agences distinctes
    @GetMapping("/agence/list")
    public ResponseEntity<List<String>> getDistinctAgences() {
        String username = RequestContextUtil.getUsernameFromRequest();
        List<String> agences = operationBancaireService.getDistinctAgences(username);
        return ResponseEntity.ok(agences);
    }
    
    // Récupérer la liste des types d'opération distincts
    @GetMapping("/type-operation/list")
    public ResponseEntity<List<String>> getDistinctTypesOperation() {
        String username = RequestContextUtil.getUsernameFromRequest();
        List<String> types = operationBancaireService.getDistinctTypesOperation(username);
        return ResponseEntity.ok(types);
    }

    // Récupérer la liste des banques (colonne bo) déjà présentes
    @GetMapping("/bo/list")
    public ResponseEntity<List<String>> getDistinctBanques(
            @RequestParam(value = "pays", required = false) List<String> pays) {
        return ResponseEntity.ok(operationBancaireService.getDistinctBanques(pays));
    }

    // Mettre à jour le recon_status (OK/KO)
    @PutMapping("/{id}/recon-status")
    public ResponseEntity<?> updateReconStatus(@PathVariable Long id, @RequestParam("status") String status) {
        return operationBancaireRepository.findById(id)
                .map(entity -> {
                    entity.setReconStatus(status);
                    operationBancaireRepository.save(entity);
                    return ResponseEntity.ok().build();
                })
                .orElse(ResponseEntity.notFound().build());
    }
    // Import Excel/CSV d'opérations bancaires
    @Autowired
    private com.reconciliation.service.OperationBancaireCheckService checkService;

    /** Check des opérations d'un type : compensation (suivi compense) ou contrôle relevé. */
    @GetMapping("/check")
    public ResponseEntity<com.reconciliation.service.OperationBancaireCheckService.CheckResult> check(@RequestParam("type") String type) {
        return ResponseEntity.ok(checkService.check(type));
    }

    /** Validation des seules correspondances de compensation : banque et référence reportées. */
    @PostMapping("/check/apply")
    public ResponseEntity<java.util.Map<String, Object>> applyCheck(
            @RequestBody List<com.reconciliation.service.OperationBancaireCheckService.ApplyItem> items) {
        int updated = checkService.apply(items);
        return ResponseEntity.ok(java.util.Map.of("updated", updated));
    }

    @PostMapping(value = "/upload", consumes = {"multipart/form-data"})
    public ResponseEntity<java.util.Map<String, Object>> upload(@RequestParam("file") MultipartFile file) {
        try {
            var res = importService.importFile(file);
            java.util.Map<String, Object> payload = new java.util.HashMap<>();
            payload.put("totalRead", res.totalRead);
            payload.put("saved", res.saved);
            payload.put("errors", res.errors);
            return ResponseEntity.ok(payload);
        } catch (Exception e) {
            String message = e.getMessage() != null ? e.getMessage() : e.getClass().getSimpleName();
            System.err.println("❌ Échec de l'import des opérations bancaires : " + message);
            java.util.Map<String, Object> payload = new java.util.HashMap<>();
            payload.put("error", message);
            payload.put("message", "Import des opérations bancaires échoué : " + message);
            return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(payload);
        }
    }

    // Télécharger le modèle Excel à utiliser
    @GetMapping(value = "/template", produces = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
    public ResponseEntity<byte[]> downloadTemplate(@RequestParam(required = false, defaultValue = "operation") String fileType) {
        try {
            byte[] bytes = importService.generateTemplate(fileType);
            return ResponseEntity.ok()
                    .header(org.springframework.http.HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=modele-operations-bancaires.xlsx")
                    .body(bytes);
        } catch (Exception e) {
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).build();
        }
    }
}

