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
                // Doublon : la référence ; sans référence, date + agence (ou service) + montant + banque
                String ref = e.getReference();
                e.setDedupKey(ref != null && !ref.isBlank()
                        ? com.reconciliation.util.BankingDedupKey.of("REF", ref)
                        : com.reconciliation.util.BankingDedupKey.of("AMT", e.getDateOperation(),
                                com.reconciliation.service.SuiviCompenseOpImportService.agenceOuService(e),
                                e.getMontant(), e.getBanque()));
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
            // Références déjà enregistrées : une même référence ne doit pas exister deux fois
            java.util.Set<String> fileReferences = new java.util.LinkedHashSet<>();
            for (SuiviCompenseOpEntity e : candidates.values()) {
                if (e.getReference() != null && !e.getReference().isBlank()) fileReferences.add(e.getReference().trim());
            }
            java.util.Set<String> knownRefs = new java.util.HashSet<>();
            java.util.List<String> refList = new java.util.ArrayList<>(fileReferences);
            for (int i = 0; i < refList.size(); i += 1000) {
                for (SuiviCompenseOpEntity ex : repository.findByReferenceIn(refList.subList(i, Math.min(i + 1000, refList.size())))) {
                    knownRefs.add(com.reconciliation.util.BankingDedupKey.normalizeText(ex.getReference()));
                }
            }
            List<SuiviCompenseOpEntity> toSave = new java.util.ArrayList<>();
            for (var entry : candidates.entrySet()) {
                SuiviCompenseOpEntity e = entry.getValue();
                boolean hasRef = e.getReference() != null && !e.getReference().isBlank();
                if (known.contains(entry.getKey())
                        || (hasRef && !knownRefs.add(com.reconciliation.util.BankingDedupKey.normalizeText(e.getReference())))) {
                    duplicates++;
                } else {
                    toSave.add(e);
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
