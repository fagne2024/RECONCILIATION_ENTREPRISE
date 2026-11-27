package com.reconciliation.controller;

import com.reconciliation.entity.SharepointSyncRunEntity;
import com.reconciliation.entity.SharepointSyncSourceEntity;
import com.reconciliation.service.sharepoint.GraphClient;
import com.reconciliation.service.sharepoint.SharepointSyncService;
import com.reconciliation.service.sharepoint.SharepointSyncService.ConfigRequest;
import com.reconciliation.service.sharepoint.SharepointSyncService.ConfigView;
import com.reconciliation.service.sharepoint.SharepointSyncService.SourceReport;
import com.reconciliation.service.sharepoint.SharepointSyncService.SourceRequest;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;
import java.util.NoSuchElementException;
import java.util.function.Supplier;

/**
 * Configuration &gt; Synchronisation SharePoint : connexion Microsoft Graph, heures du job,
 * liens SharePoint scannés, lancement manuel et historique. Les lignes sont chargées dans le
 * suivi des compenses OP (module BANQUE, voir ApiModuleMapping). Réservé aux administrateurs
 * de l'entreprise.
 */
@RestController
@RequestMapping("/api/configuration/sharepoint-sync")
@PreAuthorize("hasRole('ADMIN')")
public class SharepointSyncController {

    private final SharepointSyncService service;

    public SharepointSyncController(SharepointSyncService service) {
        this.service = service;
    }

    @GetMapping
    public ConfigView getConfig() {
        return service.getConfig();
    }

    @PutMapping
    public ResponseEntity<?> saveConfig(@RequestBody ConfigRequest req) {
        return handle(() -> service.saveConfig(req, currentUser()));
    }

    @PostMapping("/test-connexion")
    public ResponseEntity<?> testConnexion() {
        return handle(() -> {
            service.testConnexion();
            return Map.of("message", "Connexion Microsoft réussie.");
        });
    }

    @GetMapping("/sources")
    public List<SharepointSyncSourceEntity> listSources() {
        return service.listSources();
    }

    @PostMapping("/sources")
    public ResponseEntity<?> createSource(@RequestBody SourceRequest req) {
        return handle(() -> service.createSource(req), HttpStatus.CREATED);
    }

    @PutMapping("/sources/{id}")
    public ResponseEntity<?> updateSource(@PathVariable Long id, @RequestBody SourceRequest req) {
        return handle(() -> service.updateSource(id, req));
    }

    @DeleteMapping("/sources/{id}")
    public ResponseEntity<?> deleteSource(@PathVariable Long id) {
        return handle(() -> {
            service.deleteSource(id);
            return Map.of("deleted", true);
        });
    }

    @PostMapping("/sources/{id}/reset-curseur")
    public ResponseEntity<?> resetCursor(@PathVariable Long id) {
        return handle(() -> service.resetCursor(id));
    }

    /** Test à blanc : dernier fichier trouvé et lignes qui seraient chargées. */
    @PostMapping("/sources/{id}/tester")
    public ResponseEntity<?> testSource(@PathVariable Long id) {
        return handle(() -> service.test(id));
    }

    @PostMapping("/sources/{id}/executer")
    public ResponseEntity<?> runSource(@PathVariable Long id) {
        return handle(() -> service.runNow(id, currentUser()));
    }

    /** Lance tous les liens actifs. */
    @PostMapping("/executer")
    public ResponseEntity<?> runAll() {
        return handle(() -> service.runNow(null, currentUser()));
    }

    @GetMapping("/historique")
    public List<SharepointSyncRunEntity> history() {
        return service.history();
    }

    private ResponseEntity<?> handle(Supplier<?> action) {
        return handle(action, HttpStatus.OK);
    }

    private ResponseEntity<?> handle(Supplier<?> action, HttpStatus okStatus) {
        try {
            return ResponseEntity.status(okStatus).body(action.get());
        } catch (NoSuchElementException e) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("error", e.getMessage()));
        } catch (IllegalArgumentException | GraphClient.GraphException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        } catch (IllegalStateException e) {
            return ResponseEntity.status(HttpStatus.CONFLICT).body(Map.of("error", e.getMessage()));
        }
    }

    private static String currentUser() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        return auth == null ? null : auth.getName();
    }
}
