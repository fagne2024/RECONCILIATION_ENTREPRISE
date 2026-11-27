package com.reconciliation.controller;

import com.reconciliation.service.bigquery.BigQueryReconciliationService;
import com.reconciliation.service.bigquery.BigQueryReconciliationService.Download;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.NoSuchElementException;

/**
 * Lanceur &gt; source BigQuery : extractions prêtes (préparées automatiquement), extraction à
 * l'instant T, téléchargement du fichier BO et des fichiers partenaires du dossier surveillé.
 * Accès : droit « Réconciliation · Lanceur » (préfixe /api/reconciliation-launcher).
 */
@RestController
@RequestMapping("/api/reconciliation-launcher/bigquery")
public class BigQueryLauncherController {

    private final BigQueryReconciliationService service;

    public BigQueryLauncherController(BigQueryReconciliationService service) {
        this.service = service;
    }

    /** Requêtes actives (sans le SQL). */
    @GetMapping("/requetes")
    public List<Map<String, Object>> queries() {
        return service.listQueries().stream()
                .filter(q -> Boolean.TRUE.equals(q.getEnabled()))
                .map(q -> Map.<String, Object>of("id", q.getId(), "libelle", q.getLibelle(),
                        "boFilePrefix", q.getBoFilePrefix()))
                .toList();
    }

    @GetMapping("/extractions")
    public List<BigQueryReconciliationService.ReadyExtract> readyExtracts() {
        return service.readyExtracts();
    }

    /** Extraction à l'instant T (date des opérations ; la veille par défaut). */
    @PostMapping("/requetes/{id}/extraire")
    public ResponseEntity<?> extractNow(@PathVariable Long id,
                                        @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date) {
        return BigQueryConfigController.handle(
                () -> service.extractNow(id, date, BigQueryConfigController.currentUser()), HttpStatus.OK);
    }

    @GetMapping("/extractions/{id}/fichier")
    public ResponseEntity<?> downloadExtract(@PathVariable Long id) {
        try {
            return file(service.downloadExtract(id));
        } catch (NoSuchElementException e) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("error", e.getMessage()));
        } catch (IOException e) {
            return ResponseEntity.internalServerError().body(Map.of("error", "Lecture du fichier impossible."));
        }
    }

    @GetMapping("/partenaires")
    public ResponseEntity<?> partnerFiles() {
        try {
            return ResponseEntity.ok(service.partnerFiles());
        } catch (IOException | IllegalStateException e) {
            return ResponseEntity.badRequest().body(Map.of("error", "Dossier des fichiers partenaires inaccessible."));
        }
    }

    /** Fichier partenaire (converti en CSV s'il s'agit d'un classeur Excel). */
    @GetMapping("/partenaires/fichier")
    public ResponseEntity<?> partnerFile(@RequestParam("nom") String nom) {
        try {
            return file(service.partnerFileAsCsv(nom));
        } catch (NoSuchElementException e) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("error", e.getMessage()));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        } catch (Exception e) {
            return ResponseEntity.internalServerError().body(Map.of("error", "Lecture du fichier impossible."));
        }
    }

    private static ResponseEntity<byte[]> file(Download d) {
        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION,
                        ContentDisposition.attachment().filename(d.fileName(), StandardCharsets.UTF_8).build().toString())
                .contentType(new MediaType("text", "csv", StandardCharsets.UTF_8))
                .body(d.content());
    }
}
