package com.reconciliation.controller;

import com.reconciliation.entity.SuiviCompenseOpEntity;
import com.reconciliation.repository.SuiviCompenseOpRepository;
import com.reconciliation.service.SuiviCompenseOpImportService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/banque/suivi-compense-op")
public class SuiviCompenseOpController {

    @Autowired
    private SuiviCompenseOpRepository repository;
    @Autowired
    private SuiviCompenseOpImportService importService;

    @GetMapping
    public List<SuiviCompenseOpEntity> list() {
        return repository.findAllByOrderByDateOperationDescIdDesc();
    }

    @PostMapping(value = "/upload", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<Map<String, Object>> upload(@RequestParam("file") MultipartFile file) {
        try {
            List<SuiviCompenseOpEntity> rows = importService.parse(file);
            LocalDateTime now = LocalDateTime.now();
            // Doublons : clé métier déjà en base, ou répétée dans le même fichier
            java.util.Map<String, SuiviCompenseOpEntity> candidates = new java.util.LinkedHashMap<>();
            int duplicates = 0;
            for (SuiviCompenseOpEntity e : rows) {
                e.setSourceFilename(file.getOriginalFilename());
                e.setUploadedAt(now);
                e.setDedupKey(com.reconciliation.util.BankingDedupKey.of(
                        e.getDateOperation(), e.getCodeAgence(), e.getBanque(), e.getCompteBancaire(),
                        e.getMontant(), e.getModePaiement(), e.getReference(), e.getIdTicket(),
                        e.getService(), e.getReseau()));
                if (candidates.putIfAbsent(e.getDedupKey(), e) != null) {
                    duplicates++;
                }
            }
            java.util.Set<String> known = new java.util.HashSet<>();
            if (!candidates.isEmpty()) {
                for (SuiviCompenseOpEntity ex : repository.findByDedupKeyIn(candidates.keySet())) {
                    known.add(ex.getDedupKey());
                }
            }
            List<SuiviCompenseOpEntity> toSave = new java.util.ArrayList<>();
            for (var entry : candidates.entrySet()) {
                if (known.contains(entry.getKey())) {
                    duplicates++;
                } else {
                    toSave.add(entry.getValue());
                }
            }
            repository.saveAll(toSave);
            return ResponseEntity.ok(Map.of(
                    "totalRead", rows.size(),
                    "saved", toSave.size(),
                    "duplicatesIgnored", duplicates));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        } catch (Exception e) {
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(Map.of("error", "Import impossible"));
        }
    }

    @GetMapping(value = "/template", produces = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
    public ResponseEntity<byte[]> template() {
        try {
            return ResponseEntity.ok()
                    .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=modele-suivi-compense-op.xlsx")
                    .body(importService.generateTemplate());
        } catch (Exception e) {
            return ResponseEntity.internalServerError().build();
        }
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable Long id) {
        if (!repository.existsById(id)) return ResponseEntity.notFound().build();
        repository.deleteById(id);
        return ResponseEntity.ok().build();
    }
}
