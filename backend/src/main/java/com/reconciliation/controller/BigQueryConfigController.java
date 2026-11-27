package com.reconciliation.controller;

import com.reconciliation.entity.BigQueryExtractEntity;
import com.reconciliation.entity.BigQueryQueryEntity;
import com.reconciliation.service.bigquery.BigQueryClient;
import com.reconciliation.service.bigquery.BigQueryReconciliationService;
import com.reconciliation.service.bigquery.BigQueryReconciliationService.ConfigRequest;
import com.reconciliation.service.bigquery.BigQueryReconciliationService.ConfigView;
import com.reconciliation.service.bigquery.BigQueryReconciliationService.QueryRequest;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.NoSuchElementException;
import java.util.function.Supplier;

/**
 * Configuration &gt; BigQuery : compte de service, projet, heures de préparation automatique,
 * requêtes (source BO du Lanceur) et historique des extractions. Réservé aux administrateurs.
 */
@RestController
@RequestMapping("/api/configuration/bigquery")
@PreAuthorize("hasRole('ADMIN')")
public class BigQueryConfigController {

    private final BigQueryReconciliationService service;

    public BigQueryConfigController(BigQueryReconciliationService service) {
        this.service = service;
    }

    @GetMapping
    public ConfigView getConfig() {
        return service.getConfig();
    }

    @PutMapping
    public ResponseEntity<?> saveConfig(@RequestBody ConfigRequest req) {
        return handle(() -> service.saveConfig(req, currentUser()), HttpStatus.OK);
    }

    @PostMapping("/test-connexion")
    public ResponseEntity<?> testConnexion() {
        return handle(() -> {
            service.testConnexion();
            return Map.of("message", "Connexion Google BigQuery réussie.");
        }, HttpStatus.OK);
    }

    @GetMapping("/requetes")
    public List<BigQueryQueryEntity> listQueries() {
        return service.listQueries();
    }

    @PostMapping("/requetes")
    public ResponseEntity<?> createQuery(@RequestBody QueryRequest req) {
        return handle(() -> service.createQuery(req), HttpStatus.CREATED);
    }

    @PutMapping("/requetes/{id}")
    public ResponseEntity<?> updateQuery(@PathVariable Long id, @RequestBody QueryRequest req) {
        return handle(() -> service.updateQuery(id, req), HttpStatus.OK);
    }

    @DeleteMapping("/requetes/{id}")
    public ResponseEntity<?> deleteQuery(@PathVariable Long id) {
        return handle(() -> {
            service.deleteQuery(id);
            return Map.of("deleted", true);
        }, HttpStatus.OK);
    }

    /** Vérification à blanc (gratuite) : colonnes et volume lu. */
    @PostMapping("/requetes/{id}/verifier")
    public ResponseEntity<?> dryRun(@PathVariable Long id,
                                    @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date) {
        return handle(() -> service.dryRun(id, date), HttpStatus.OK);
    }

    @GetMapping("/historique")
    public List<BigQueryExtractEntity> history() {
        return service.history();
    }

    static ResponseEntity<?> handle(Supplier<?> action, HttpStatus okStatus) {
        try {
            return ResponseEntity.status(okStatus).body(action.get());
        } catch (NoSuchElementException e) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("error", e.getMessage()));
        } catch (IllegalArgumentException | BigQueryClient.BigQueryException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        } catch (IllegalStateException e) {
            return ResponseEntity.status(HttpStatus.CONFLICT).body(Map.of("error", e.getMessage()));
        }
    }

    static String currentUser() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        return auth == null ? null : auth.getName();
    }
}
