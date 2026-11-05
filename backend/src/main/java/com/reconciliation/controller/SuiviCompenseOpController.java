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
            for (SuiviCompenseOpEntity e : rows) {
                e.setSourceFilename(file.getOriginalFilename());
                e.setUploadedAt(now);
            }
            repository.saveAll(rows);
            return ResponseEntity.ok(Map.of("totalRead", rows.size(), "saved", rows.size()));
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
