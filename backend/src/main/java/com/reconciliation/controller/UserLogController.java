package com.reconciliation.controller;

import com.reconciliation.entity.UserLogEntity;
import com.reconciliation.service.UserLogService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/log-utilisateur")
@CrossOrigin(origins = {"http://localhost:4200", "http://172.214.108.8:4200"})
public class UserLogController {

    @Autowired
    private UserLogService userLogService;

    /**
     * Récupérer tous les logs avec filtres optionnels
     */
    @GetMapping
    public ResponseEntity<List<UserLogEntity>> getLogs(
            @RequestParam(required = false) String username,
            @RequestParam(required = false) String module,
            @RequestParam(required = false) String permission,
            @RequestParam(required = false) String dateDebut,
            @RequestParam(required = false) String dateFin) {
        
        try {
            List<UserLogEntity> logs = userLogService.getLogsWithFilters(username, module, permission, dateDebut, dateFin);
            return ResponseEntity.ok(logs);
        } catch (Exception e) {
            return ResponseEntity.internalServerError().build();
        }
    }

    /**
     * Enregistrer une activité utilisateur (connexion, déconnexion, vue de page)
     * Appelé directement par le frontend.
     */
    @PostMapping("/log-activity")
    public ResponseEntity<?> logActivity(@RequestBody Map<String, String> payload) {
        try {
            String permission = payload.get("permission");
            String module = payload.get("module");
            String username = payload.get("username");
            String details = payload.get("details");

            if (permission == null || module == null || username == null) {
                return ResponseEntity.badRequest().body(Map.of("error", "permission, module et nom d'utilisateur sont requis"));
            }

            userLogService.saveLog(permission, module, username, details);
            return ResponseEntity.ok(Map.of("status", "ok"));
        } catch (Exception e) {
            return ResponseEntity.internalServerError().body(Map.of("error", e.getMessage()));
        }
    }

    /**
     * Récupérer un log par ID
     */
    @GetMapping("/{id}")
    public ResponseEntity<UserLogEntity> getLogById(@PathVariable Long id) {
        try {
            return userLogService.getAllLogs().stream()
                    .filter(log -> log.getId().equals(id))
                    .findFirst()
                    .map(ResponseEntity::ok)
                    .orElse(ResponseEntity.notFound().build());
        } catch (Exception e) {
            return ResponseEntity.internalServerError().build();
        }
    }
}

