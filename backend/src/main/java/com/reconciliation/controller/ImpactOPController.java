package com.reconciliation.controller;

import com.reconciliation.entity.ImpactOPEntity;
import com.reconciliation.service.ImpactOPService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/impact-op")
public class ImpactOPController {

    @Autowired
    private ImpactOPService impactOPService;

    /**
     * Récupérer tous les impacts OP avec filtres optionnels
     */
    @GetMapping
    public ResponseEntity<List<ImpactOPEntity>> getImpactOPs(
            @RequestParam(required = false) String codeProprietaire,
            @RequestParam(required = false) String typeOperation,
            @RequestParam(required = false) String groupeReseau,
            @RequestParam(required = false) String numeroTransGu,
            @RequestParam(required = false) String statut,
            @RequestParam(required = false) String dateDebut,
            @RequestParam(required = false) String dateFin,
            @RequestParam(required = false) Double montantMin,
            @RequestParam(required = false) Double montantMax) {
        
        try {
            List<ImpactOPEntity> impacts = impactOPService.getImpactOPs(
                codeProprietaire, typeOperation, groupeReseau, numeroTransGu, statut,
                dateDebut, dateFin, montantMin, montantMax);
            return ResponseEntity.ok(impacts);
        } catch (Exception e) {
            return ResponseEntity.internalServerError().build();
        }
    }

    /**
     * Récupérer un impact OP par ID
     */
    @GetMapping("/{id}")
    public ResponseEntity<ImpactOPEntity> getImpactOP(@PathVariable Long id) {
        try {
            ImpactOPEntity impact = impactOPService.getImpactOP(id);
            if (impact != null) {
                return ResponseEntity.ok(impact);
            } else {
                return ResponseEntity.notFound().build();
            }
        } catch (Exception e) {
            return ResponseEntity.internalServerError().build();
        }
    }

    /**
     * Créer un nouvel impact OP
     */
    @PostMapping
    public ResponseEntity<?> createImpactOP(@RequestBody ImpactOPEntity impactOP) {
        try {
            ImpactOPEntity created = impactOPService.createImpactOP(impactOP);
            return ResponseEntity.ok(created);
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Map.of("message", e.getMessage()));
        } catch (Exception e) {
            return ResponseEntity.internalServerError().build();
        }
    }

    /**
     * Créer plusieurs impacts OP en une requête (évite 429 Too Many Requests).
     */
    @PostMapping("/batch")
    public ResponseEntity<Map<String, Object>> createImpactOPBatch(@RequestBody List<ImpactOPEntity> impacts) {
        try {
            Map<String, Object> result = impactOPService.createImpactOPBatch(impacts);
            return ResponseEntity.ok(result);
        } catch (Exception e) {
            return ResponseEntity.internalServerError().build();
        }
    }

    /**
     * Mettre à jour un impact OP
     */
    @PutMapping("/{id}")
    public ResponseEntity<ImpactOPEntity> updateImpactOP(@PathVariable Long id, @RequestBody ImpactOPEntity impactOP) {
        try {
            impactOP.setId(id);
            ImpactOPEntity updated = impactOPService.updateImpactOP(impactOP);
            return ResponseEntity.ok(updated);
        } catch (Exception e) {
            return ResponseEntity.internalServerError().build();
        }
    }

    /**
     * Supprimer un impact OP
     */
    @DeleteMapping("/{id}")
    public ResponseEntity<Void> deleteImpactOP(@PathVariable Long id) {
        try {
            boolean deleted = impactOPService.deleteImpactOP(id);
            if (deleted) {
                return ResponseEntity.ok().build();
            } else {
                return ResponseEntity.notFound().build();
            }
        } catch (Exception e) {
            return ResponseEntity.internalServerError().build();
        }
    }

    /**
     * Suppression en masse d'impacts OP
     */
    @PostMapping("/delete-batch")
    @CrossOrigin(origins = {"http://localhost:4200", "http://172.214.108.8:4200"}, methods = {RequestMethod.POST, RequestMethod.OPTIONS})
    public ResponseEntity<Map<String, Object>> deleteImpactOPs(@RequestBody Map<String, List<Long>> request) {
        try {
            List<Long> ids = request.get("ids");
            Map<String, Object> result = impactOPService.deleteImpactOPs(ids);
            return ResponseEntity.ok(result);
        } catch (Exception e) {
            return ResponseEntity.internalServerError().build();
        }
    }

    /**
     * Valider un fichier d'impacts OP
     */
    @PostMapping("/validate")
    public ResponseEntity<Map<String, Object>> validateFile(@RequestParam("file") MultipartFile file) {
        try {
            Map<String, Object> validationResult = impactOPService.validateFile(file);
            return ResponseEntity.ok(validationResult);
        } catch (Exception e) {
            return ResponseEntity.internalServerError().build();
        }
    }

    /**
     * Uploader un fichier d'impacts OP
     */
    @PostMapping("/upload")
    public ResponseEntity<Map<String, Object>> uploadFile(@RequestParam("file") MultipartFile file) {
        try {
            Map<String, Object> uploadResult = impactOPService.uploadFile(file);
            return ResponseEntity.ok(uploadResult);
        } catch (Exception e) {
            return ResponseEntity.internalServerError().build();
        }
    }

    /**
     * Mettre à jour le statut d'un impact OP
     */
    @PatchMapping("/{id}/statut")
    public ResponseEntity<ImpactOPEntity> updateStatut(
            @PathVariable Long id,
            @RequestBody Map<String, String> request) {
        try {
            String statut = request.get("statut");
            String commentaire = request.get("commentaire");
            
            ImpactOPEntity updated = impactOPService.updateStatut(id, statut, commentaire);
            return ResponseEntity.ok(updated);
        } catch (Exception e) {
            return ResponseEntity.internalServerError().build();
        }
    }

    /**
     * Récupérer les options de filtres
     */
    @GetMapping("/filter-options")
    public ResponseEntity<Map<String, List<String>>> getFilterOptions() {
        try {
            Map<String, List<String>> options = impactOPService.getFilterOptions();
            return ResponseEntity.ok(options);
        } catch (Exception e) {
            return ResponseEntity.internalServerError().build();
        }
    }

    /**
     * Exporter les impacts OP
     */
    @GetMapping("/export")
    public ResponseEntity<ByteArrayResource> exportImpactOPs(
            @RequestParam(required = false) String codeProprietaire,
            @RequestParam(required = false) String typeOperation,
            @RequestParam(required = false) String groupeReseau,
            @RequestParam(required = false) String numeroTransGu,
            @RequestParam(required = false) String statut,
            @RequestParam(required = false) String dateDebut,
            @RequestParam(required = false) String dateFin,
            @RequestParam(required = false) Double montantMin,
            @RequestParam(required = false) Double montantMax) {
        
        try {
            byte[] excelData = impactOPService.exportToExcel(
                codeProprietaire, typeOperation, groupeReseau, numeroTransGu, statut,
                dateDebut, dateFin, montantMin, montantMax);
            
            ByteArrayResource resource = new ByteArrayResource(excelData);
            
            return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=impacts-op.xlsx")
                .contentType(MediaType.parseMediaType("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"))
                .contentLength(excelData.length)
                .body(resource);
        } catch (Exception e) {
            return ResponseEntity.internalServerError().build();
        }
    }

    /**
     * Récupérer les statistiques des impacts OP
     */
    @GetMapping("/stats")
    public ResponseEntity<Map<String, Object>> getStats() {
        try {
            Map<String, Object> stats = impactOPService.getStats();
            return ResponseEntity.ok(stats);
        } catch (Exception e) {
            return ResponseEntity.internalServerError().build();
        }
    }

    /**
     * Mettre à jour tous les commentaires des impacts OP existants
     */
    @PostMapping("/update-comments")
    public ResponseEntity<Map<String, Object>> updateAllComments() {
        try {
            Map<String, Object> result = impactOPService.updateAllComments();
            return ResponseEntity.ok(result);
        } catch (Exception e) {
            return ResponseEntity.internalServerError().build();
        }
    }

    /**
     * Récupérer la somme des impacts OP pour une date et un code propriétaire donnés
     */
    @GetMapping("/sum-for-date")
    public ResponseEntity<Map<String, Double>> getSumForDate(
            @RequestParam String date,
            @RequestParam String codeProprietaire) {
        try {
            Double sum = impactOPService.getSumForDate(date, codeProprietaire);
            return ResponseEntity.ok(Map.of("sum", sum));
        } catch (Exception e) {
            return ResponseEntity.internalServerError().build();
        }
    }
} 