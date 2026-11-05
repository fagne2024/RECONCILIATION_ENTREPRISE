package com.reconciliation.controller;

import com.reconciliation.entity.SopNodeEntity;
import com.reconciliation.service.SopNodeService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.HashMap;
import java.util.Map;

@Slf4j
@RestController
@RequestMapping("/api/sop-nodes")
@CrossOrigin(origins = "*", allowedHeaders = "*")
public class SopNodeController {

    @Autowired
    private SopNodeService sopNodeService;

    @GetMapping("/structure")
    public ResponseEntity<Map<String, Object>> getStructure(@RequestParam(required = false) String rootId) {
        if (rootId != null && !rootId.isBlank() && !"root".equals(rootId)) {
            return getStructureForRoot(rootId.trim());
        }
        try {
            log.info("📋 Requête GET /api/sop-nodes/structure reçue");
            Map<String, Object> structure = sopNodeService.getStructure();
            Map<String, Object> response = new HashMap<>();
            response.put("success", true);
            response.put("structure", structure);
            log.info("✅ Structure retournée avec succès");
            return ResponseEntity.ok(response);
        } catch (Exception e) {
            log.error("❌ Erreur lors de la récupération de la structure: {}", e.getMessage(), e);
            e.printStackTrace();
            // Même en cas d'erreur, essayer de retourner la structure par défaut
            try {
                Map<String, Object> defaultStructure = sopNodeService.getDefaultStructure();
                Map<String, Object> response = new HashMap<>();
                response.put("success", true);
                response.put("structure", defaultStructure);
                response.put("warning", "Structure par défaut utilisée (base de données non disponible)");
                return ResponseEntity.ok(response);
            } catch (Exception fallbackError) {
                log.error("❌ Erreur même avec le fallback: {}", fallbackError.getMessage());
                Map<String, Object> error = new HashMap<>();
                error.put("success", false);
                error.put("error", "Erreur lors de la récupération de la structure: " + e.getMessage());
                return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(error);
            }
        }
    }

    private ResponseEntity<Map<String, Object>> getStructureForRoot(String rootId) {
        try {
            if (SopNodeService.TRX_ROOT_ID.equals(rootId)) {
                sopNodeService.ensureTrxStructure();
            }
            Map<String, Object> structure = sopNodeService.getStructure(rootId);
            Map<String, Object> response = new HashMap<>();
            if (structure == null) {
                response.put("success", false);
                response.put("error", "Racine '" + rootId + "' non trouvée");
                return ResponseEntity.status(HttpStatus.NOT_FOUND).body(response);
            }
            response.put("success", true);
            response.put("structure", structure);
            return ResponseEntity.ok(response);
        } catch (Exception e) {
            log.error("❌ Erreur lors de la récupération de la structure {}: {}", rootId, e.getMessage(), e);
            Map<String, Object> error = new HashMap<>();
            error.put("success", false);
            error.put("error", "Erreur lors de la récupération de la structure: " + e.getMessage());
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(error);
        }
    }

    @PostMapping("/create")
    public ResponseEntity<Map<String, Object>> createNode(
            @RequestParam String nodeId,
            @RequestParam String label,
            @RequestParam(required = false) String parentNodeId,
            @RequestParam(required = false) Integer displayOrder) {
        try {
            log.info("📝 Création nœud - nodeId: {}, label: {}, parentNodeId: {}", nodeId, label, parentNodeId);
            
            SopNodeEntity createdNode = sopNodeService.createNode(nodeId, label, parentNodeId, displayOrder);
            
            Map<String, Object> response = new HashMap<>();
            response.put("success", true);
            response.put("message", "Nœud créé avec succès");
            response.put("nodeId", createdNode.getNodeId());
            response.put("label", createdNode.getLabel());
            return ResponseEntity.ok(response);
        } catch (IllegalArgumentException e) {
            log.error("❌ Erreur lors de la création: {}", e.getMessage());
            Map<String, Object> error = new HashMap<>();
            error.put("success", false);
            error.put("error", e.getMessage());
            return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(error);
        } catch (Exception e) {
            log.error("❌ Erreur lors de la création: {}", e.getMessage(), e);
            Map<String, Object> error = new HashMap<>();
            error.put("success", false);
            error.put("error", "Erreur lors de la création: " + e.getMessage());
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(error);
        }
    }

    @RequestMapping(value = "/update", method = {RequestMethod.PUT, RequestMethod.POST})
    public ResponseEntity<Map<String, Object>> updateNode(
            @RequestParam String nodeId,
            @RequestParam(required = false) String label,
            @RequestParam(required = false) String route,
            @RequestParam(required = false) String description) {
        try {
            log.info("📝 Requête PUT/POST /api/sop-nodes/update reçue - nodeId: {}, label: {}", nodeId, label);
            
            if (sopNodeService == null) {
                log.error("❌ SopNodeService n'est pas injecté!");
                Map<String, Object> error = new HashMap<>();
                error.put("success", false);
                error.put("error", "Service non disponible");
                return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(error);
            }
            
            SopNodeEntity updatedNode = sopNodeService.updateNode(nodeId, label, route, description);
            
            Map<String, Object> response = new HashMap<>();
            response.put("success", true);
            response.put("message", "Nœud modifié avec succès");
            response.put("nodeId", updatedNode.getNodeId());
            response.put("label", updatedNode.getLabel());
            log.info("✅ Nœud mis à jour avec succès");
            return ResponseEntity.ok(response);
        } catch (IllegalArgumentException e) {
            log.error("❌ Erreur lors de la mise à jour: {}", e.getMessage());
            Map<String, Object> error = new HashMap<>();
            error.put("success", false);
            error.put("error", e.getMessage());
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(error);
        } catch (Exception e) {
            log.error("❌ Erreur lors de la mise à jour: {}", e.getMessage(), e);
            e.printStackTrace();
            Map<String, Object> error = new HashMap<>();
            error.put("success", false);
            error.put("error", "Erreur lors de la mise à jour: " + e.getMessage());
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(error);
        }
    }

    @DeleteMapping("/delete")
    public ResponseEntity<Map<String, Object>> deleteNode(@RequestParam String nodeId) {
        try {
            log.info("🗑️ Suppression nœud - nodeId: {}", nodeId);
            
            boolean deleted = sopNodeService.deleteNode(nodeId);
            
            Map<String, Object> response = new HashMap<>();
            if (deleted) {
                response.put("success", true);
                response.put("message", "Nœud supprimé avec succès");
                return ResponseEntity.ok(response);
            } else {
                response.put("success", false);
                response.put("error", "Nœud non trouvé");
                return ResponseEntity.status(HttpStatus.NOT_FOUND).body(response);
            }
        } catch (IllegalArgumentException e) {
            log.error("❌ Erreur lors de la suppression: {}", e.getMessage());
            Map<String, Object> error = new HashMap<>();
            error.put("success", false);
            error.put("error", e.getMessage());
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(error);
        } catch (Exception e) {
            log.error("❌ Erreur lors de la suppression: {}", e.getMessage(), e);
            Map<String, Object> error = new HashMap<>();
            error.put("success", false);
            error.put("error", "Erreur lors de la suppression: " + e.getMessage());
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(error);
        }
    }
}

