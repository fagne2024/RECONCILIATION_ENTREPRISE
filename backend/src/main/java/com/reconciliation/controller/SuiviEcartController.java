package com.reconciliation.controller;

import com.reconciliation.model.SuiviEcart;
import com.reconciliation.service.SuiviEcartService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/suivi-ecart")
public class SuiviEcartController {
    
    @Autowired
    private SuiviEcartService suiviEcartService;
    
    @GetMapping
    public ResponseEntity<List<SuiviEcart>> getAll() {
        try {
            List<SuiviEcart> suiviEcarts = suiviEcartService.getAll();
            return ResponseEntity.ok(suiviEcarts);
        } catch (Exception e) {
            return ResponseEntity.internalServerError().build();
        }
    }
    
    @GetMapping("/{id}")
    public ResponseEntity<SuiviEcart> getById(@PathVariable Long id) {
        return suiviEcartService.getById(id)
                .map(ResponseEntity::ok)
                .orElse(ResponseEntity.notFound().build());
    }
    
    @PostMapping
    public ResponseEntity<SuiviEcart> create(@RequestBody SuiviEcart suiviEcart) {
        try {
            SuiviEcart created = suiviEcartService.create(suiviEcart);
            return ResponseEntity.status(HttpStatus.CREATED).body(created);
        } catch (Exception e) {
            return ResponseEntity.badRequest().build();
        }
    }
    
    @PutMapping("/{id}")
    public ResponseEntity<SuiviEcart> update(@PathVariable Long id, @RequestBody SuiviEcart suiviEcart) {
        try {
            SuiviEcart updated = suiviEcartService.update(id, suiviEcart);
            return ResponseEntity.ok(updated);
        } catch (RuntimeException e) {
            return ResponseEntity.notFound().build();
        } catch (Exception e) {
            return ResponseEntity.badRequest().build();
        }
    }
    
    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable Long id) {
        try {
            suiviEcartService.delete(id);
            return ResponseEntity.noContent().build();
        } catch (Exception e) {
            return ResponseEntity.notFound().build();
        }
    }
    
    @PostMapping("/upload")
    public ResponseEntity<Map<String, Object>> uploadFile(@RequestParam("file") MultipartFile file) {
        if (file == null || file.isEmpty()) {
            return ResponseEntity.badRequest()
                    .body(Map.of("error", "Le fichier est vide"));
        }
        
        String originalFilename = file.getOriginalFilename();
        String fileName = originalFilename != null ? originalFilename.toLowerCase() : "";
        if (fileName.isEmpty() || (!fileName.endsWith(".csv") && !fileName.endsWith(".xlsx") && !fileName.endsWith(".xls"))) {
            return ResponseEntity.badRequest()
                    .body(Map.of("error", "Le fichier doit être au format CSV, XLSX ou XLS"));
        }
        
        try {
            SuiviEcartService.UploadResult uploadResult = suiviEcartService.uploadFile(file);
            Map<String, Object> response = new HashMap<>();
            response.put("message", "Fichier uploadé avec succès");
            response.put("count", uploadResult.getSavedCount());
            response.put("duplicates", uploadResult.getDuplicatesCount());
            response.put("total", uploadResult.getTotalCount());
            response.put("data", uploadResult.getSavedItems());
            
            String message = "Fichier uploadé avec succès. " + uploadResult.getSavedCount() + 
                           " enregistrement(s) ajouté(s).";
            if (uploadResult.getDuplicatesCount() > 0) {
                message += " " + uploadResult.getDuplicatesCount() + " doublon(s) ignoré(s).";
            }
            response.put("message", message);
            
            return ResponseEntity.ok(response);
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest()
                    .body(Map.of("error", e.getMessage()));
        } catch (IOException e) {
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body(Map.of("error", "Erreur lors de la lecture du fichier: " + e.getMessage()));
        } catch (Exception e) {
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body(Map.of("error", "Erreur lors du traitement du fichier: " + e.getMessage()));
        }
    }
}

