package com.reconciliation.controller;

import com.reconciliation.dto.DeleteOperationsRequest;
import com.reconciliation.dto.DeleteOperationsResponse;
import com.reconciliation.dto.ServiceReferenceImportBatchRequest;
import com.reconciliation.dto.ServiceReferenceImportBatchResponse;
import com.reconciliation.dto.ServiceReferenceDashboardDto;
import com.reconciliation.dto.ServiceCountryVolumeDto;
import com.reconciliation.entity.ServiceReferenceEntity;
import com.reconciliation.service.ServiceReferenceService;
import com.reconciliation.util.RequestContextUtil;
import jakarta.persistence.EntityNotFoundException;
import jakarta.validation.Valid;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Set;

@RestController
@RequestMapping("/api/service-references")
@CrossOrigin(origins = {"http://localhost:4200", "http://172.214.108.8:4200"})
public class ServiceReferenceController {

    @Autowired
    private ServiceReferenceService serviceReferenceService;

    @GetMapping
    public ResponseEntity<?> listAll() {
        String username = RequestContextUtil.getUsernameFromRequest();
        try {
            return ResponseEntity.ok(serviceReferenceService.getAll(username));
        } catch (Exception e) {
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body("Impossible de charger les références service: " + e.getMessage());
        }
    }

    /**
     * Codes RECO déjà en base (unicité globale), pour filtrer l’import même si la liste filtrée par pays est partielle.
     */
    @GetMapping("/used-code-recos")
    public ResponseEntity<Set<String>> listUsedCodeRecos() {
        RequestContextUtil.getUsernameFromRequest();
        return ResponseEntity.ok(serviceReferenceService.getAllUsedCodeRecosNormalized());
    }

    @GetMapping("/used-code-services")
    public ResponseEntity<Set<String>> listUsedCodeServices() {
        RequestContextUtil.getUsernameFromRequest();
        return ResponseEntity.ok(serviceReferenceService.getAllUsedCodeServicesNormalized());
    }

    /** Paires pays|service présentes dans result8rec / rapport de réconciliation (statut ACTIF). */
    @GetMapping("/active-in-agency")
    public ResponseEntity<?> listActiveInAgency(
            @RequestParam(required = false) String startDate,
            @RequestParam(required = false) String endDate,
            @RequestParam(required = false, defaultValue = "3") Integer periodMonths) {
        String username = RequestContextUtil.getUsernameFromRequest();
        try {
            return ResponseEntity.ok(serviceReferenceService.getActiveCountryServiceKeys(
                    username, startDate, endDate, periodMonths));
        } catch (Exception e) {
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body("Impossible de charger les services actifs: " + e.getMessage());
        }
    }

    @GetMapping("/{id}")
    public ResponseEntity<ServiceReferenceEntity> getById(@PathVariable Long id) {
        String username = RequestContextUtil.getUsernameFromRequest();
        return serviceReferenceService.getById(id, username)
                .map(ResponseEntity::ok)
                .orElse(ResponseEntity.notFound().build());
    }

    @GetMapping("/pays/{pays}")
    public ResponseEntity<List<ServiceReferenceEntity>> getByPays(@PathVariable String pays) {
        String username = RequestContextUtil.getUsernameFromRequest();
        return ResponseEntity.ok(serviceReferenceService.getByPays(pays, username));
    }

    @GetMapping("/code-reco/{codeReco}")
    public ResponseEntity<ServiceReferenceEntity> getByCodeReco(@PathVariable String codeReco) {
        String username = RequestContextUtil.getUsernameFromRequest();
        return serviceReferenceService.getByCodeReco(codeReco, username)
                .map(ResponseEntity::ok)
                .orElse(ResponseEntity.notFound().build());
    }

    @PostMapping
    public ResponseEntity<?> create(@Valid @RequestBody ServiceReferenceEntity payload) {
        String username = RequestContextUtil.getUsernameFromRequest();
        ServiceReferenceEntity created = serviceReferenceService.create(payload, username);
        return ResponseEntity.status(HttpStatus.CREATED).body(created);
    }

    /**
     * Import fichier : plusieurs lignes en une requête (évite 429 sur le rate limiting).
     */
    @PostMapping("/import-batch")
    public ResponseEntity<ServiceReferenceImportBatchResponse> importBatch(
            @RequestBody ServiceReferenceImportBatchRequest request,
            @RequestParam(required = false, defaultValue = "false") boolean upsert) {
        String username = RequestContextUtil.getUsernameFromRequest();
        if (request == null || request.getItems() == null || request.getItems().isEmpty()) {
            return ResponseEntity.badRequest().build();
        }
        ServiceReferenceImportBatchResponse result =
                serviceReferenceService.importBatch(request.getItems(), username, upsert);
        return ResponseEntity.ok(result);
    }

    @PutMapping("/{id}")
    public ResponseEntity<?> update(@PathVariable Long id, @Valid @RequestBody ServiceReferenceEntity payload) {
        String username = RequestContextUtil.getUsernameFromRequest();
        ServiceReferenceEntity updated = serviceReferenceService.update(id, payload, username);
        return ResponseEntity.ok(updated);
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<?> delete(@PathVariable Long id) {
        String username = RequestContextUtil.getUsernameFromRequest();
        serviceReferenceService.delete(id, username);
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/delete-batch")
    public ResponseEntity<DeleteOperationsResponse> deleteBatch(@RequestBody DeleteOperationsRequest request) {
        String username = RequestContextUtil.getUsernameFromRequest();
        if (request.getIds() == null || request.getIds().isEmpty()) {
            return ResponseEntity.badRequest().build();
        }
        DeleteOperationsResponse result = serviceReferenceService.deleteBatch(request.getIds(), username);
        return ResponseEntity.ok(result);
    }

    @GetMapping("/dashboard")
    public ResponseEntity<?> getDashboardStats(
            @RequestParam(required = false) String startDate,
            @RequestParam(required = false) String endDate,
            @RequestParam(required = false, defaultValue = "3") Integer periodMonths) {
        String username = RequestContextUtil.getUsernameFromRequest();
        try {
            List<ServiceReferenceDashboardDto> stats = serviceReferenceService.getDashboardStats(
                    username, startDate, endDate, periodMonths);
            return ResponseEntity.ok(stats);
        } catch (Exception e) {
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body("Impossible de récupérer le dashboard: " + e.getMessage());
        }
    }

    @GetMapping("/dashboard/service-volumes")
    public ResponseEntity<List<ServiceCountryVolumeDto>> getDashboardServiceVolumes(
            @RequestParam(required = false) String startDate,
            @RequestParam(required = false) String endDate,
            @RequestParam(required = false, defaultValue = "3") Integer periodMonths) {
        String username = RequestContextUtil.getUsernameFromRequest();
        return ResponseEntity.ok(serviceReferenceService.getDashboardServiceVolumes(
                username, startDate, endDate, periodMonths));
    }
}

