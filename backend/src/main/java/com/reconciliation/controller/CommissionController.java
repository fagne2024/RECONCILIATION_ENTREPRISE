package com.reconciliation.controller;

import com.reconciliation.dto.CommissionRequest;
import com.reconciliation.entity.CommissionEntity;
import com.reconciliation.service.CommissionService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

/**
 * API de configuration des commissions (versement de commission) par couple service + agence.
 * Alignée sur {@code /api/frais-transaction}.
 */
@RestController
@RequestMapping("/api/commission")
@CrossOrigin(origins = {"http://localhost:4200", "http://172.214.108.8:4200"})
public class CommissionController {

    @Autowired
    private CommissionService commissionService;

    @PostMapping
    public ResponseEntity<?> createCommission(@RequestBody CommissionRequest request) {
        try {
            CommissionEntity commission = commissionService.createCommission(request);
            return ResponseEntity.ok(commission);
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(errorResponse(e.getMessage()));
        } catch (Exception e) {
            return ResponseEntity.badRequest().body(errorResponse("Erreur lors de la création de la commission: " + e.getMessage()));
        }
    }

    @PutMapping("/{id}")
    public ResponseEntity<?> updateCommission(@PathVariable Long id, @RequestBody CommissionRequest request) {
        try {
            CommissionEntity commission = commissionService.updateCommission(id, request);
            return ResponseEntity.ok(commission);
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(errorResponse(e.getMessage()));
        } catch (Exception e) {
            return ResponseEntity.badRequest().body(errorResponse("Erreur lors de la mise à jour de la commission: " + e.getMessage()));
        }
    }

    @GetMapping
    public ResponseEntity<List<CommissionEntity>> getAllCommissions() {
        return ResponseEntity.ok(commissionService.getAllCommissions());
    }

    @GetMapping("/actifs")
    public ResponseEntity<List<CommissionEntity>> getAllCommissionsActifs() {
        return ResponseEntity.ok(commissionService.getAllCommissionsActifs());
    }

    @GetMapping("/{id}")
    public ResponseEntity<CommissionEntity> getCommissionById(@PathVariable Long id) {
        Optional<CommissionEntity> commission = commissionService.getCommissionById(id);
        return commission.map(ResponseEntity::ok).orElse(ResponseEntity.notFound().build());
    }

    @GetMapping("/service/{service}")
    public ResponseEntity<List<CommissionEntity>> getCommissionsByService(@PathVariable String service) {
        return ResponseEntity.ok(commissionService.getCommissionsByService(service));
    }

    @GetMapping("/agence/{agence}")
    public ResponseEntity<List<CommissionEntity>> getCommissionsByAgence(@PathVariable String agence) {
        return ResponseEntity.ok(commissionService.getCommissionsByAgence(agence));
    }

    @GetMapping("/applicable")
    public ResponseEntity<CommissionEntity> getCommissionApplicable(
            @RequestParam String service,
            @RequestParam String agence) {
        Optional<CommissionEntity> commission = commissionService.getCommissionApplicable(service, agence);
        return commission.map(ResponseEntity::ok).orElse(ResponseEntity.notFound().build());
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Boolean> deleteCommission(@PathVariable Long id) {
        return commissionService.deleteCommission(id) ? ResponseEntity.ok(true) : ResponseEntity.notFound().build();
    }

    @PutMapping("/{id}/toggle")
    public ResponseEntity<Boolean> toggleCommission(@PathVariable Long id) {
        return commissionService.toggleCommission(id) ? ResponseEntity.ok(true) : ResponseEntity.notFound().build();
    }

    private Map<String, String> errorResponse(String message) {
        Map<String, String> errorResponse = new HashMap<>();
        errorResponse.put("error", message);
        return errorResponse;
    }
}
