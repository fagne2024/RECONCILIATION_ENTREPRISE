package com.reconciliation.controller;

import com.reconciliation.dto.CertificationSoldeResultatSummary;
import com.reconciliation.entity.CertificationSoldeResultatEntity;
import com.reconciliation.service.CertificationSoldeResultatService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.domain.Page;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.util.LinkedHashMap;
import java.util.Map;

@RestController
@RequestMapping("/api/certification-solde-resultats")
public class CertificationSoldeResultatController {

    @Autowired
    private CertificationSoldeResultatService service;

    @PostMapping
    public ResponseEntity<?> save(@RequestBody CertificationSoldeResultatEntity payload) {
        try {
            return ResponseEntity.ok(service.saveOrUpdate(payload));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Map.of("success", false, "message", e.getMessage()));
        }
    }

    @GetMapping
    public ResponseEntity<Map<String, Object>> list(
            @RequestParam(required = false) String numeroCompte,
            @RequestParam(required = false) String env,
            @RequestParam(required = false) String pays,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate dateDebut,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate dateFin,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {
        Page<CertificationSoldeResultatSummary> p = service.list(numeroCompte, env, pays, dateDebut, dateFin, page, size);
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("content", p.getContent());
        body.put("totalElements", p.getTotalElements());
        body.put("totalPages", p.getTotalPages());
        body.put("size", p.getSize());
        body.put("number", p.getNumber());
        return ResponseEntity.ok(body);
    }

    @GetMapping("/{id}")
    public ResponseEntity<CertificationSoldeResultatEntity> get(@PathVariable Long id) {
        return service.get(id)
                .map(ResponseEntity::ok)
                .orElse(ResponseEntity.notFound().build());
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Map<String, Object>> delete(@PathVariable Long id) {
        boolean deleted = service.delete(id);
        return ResponseEntity.ok(Map.of(
                "success", deleted,
                "message", deleted ? "Certification supprimée" : "Aucune certification à supprimer"
        ));
    }

    /** Met à jour le pays d'une certification enregistrée (chaîne vide pour retirer le pays). */
    @PutMapping("/{id}/pays")
    public ResponseEntity<?> updatePays(@PathVariable Long id, @RequestBody Map<String, String> payload) {
        return service.updatePays(id, payload == null ? null : payload.get("pays"))
                .<ResponseEntity<?>>map(ResponseEntity::ok)
                .orElseGet(() -> ResponseEntity.notFound().build());
    }
}
