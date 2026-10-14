package com.reconciliation.controller;

import com.reconciliation.entity.*;
import com.reconciliation.repository.*;
import com.reconciliation.service.RenommerService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.*;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/api/renommer")
@CrossOrigin(origins = {"http://localhost:4200", "http://172.214.108.8:4200"})
public class RenommerController {

    @Autowired
    private RenommerService renommerService;

    @GetMapping("/modules")
    public ResponseEntity<List<Map<String, Object>>> getModules() {
        return ResponseEntity.ok(renommerService.getModuleConfigs());
    }

    @GetMapping("/{moduleKey}")
    public ResponseEntity<List<Map<String, Object>>> getEntities(
            @PathVariable String moduleKey,
            @RequestParam(required = false) String search) {
        return ResponseEntity.ok(renommerService.getEntities(moduleKey, search));
    }

    @GetMapping("/{moduleKey}/{id}")
    public ResponseEntity<?> getById(@PathVariable String moduleKey, @PathVariable Long id) {
        return renommerService.getById(moduleKey, id)
                .map(ResponseEntity::ok)
                .orElse(ResponseEntity.notFound().build());
    }

    @PutMapping("/{moduleKey}/{id}")
    public ResponseEntity<?> update(
            @PathVariable String moduleKey,
            @PathVariable Long id,
            @RequestBody Map<String, Object> updates) {
        try {
            Object updated = renommerService.update(moduleKey, id, updates);
            return ResponseEntity.ok(updated);
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(e.getMessage());
        } catch (Exception e) {
            return ResponseEntity.internalServerError().body("Erreur: " + e.getMessage());
        }
    }
}