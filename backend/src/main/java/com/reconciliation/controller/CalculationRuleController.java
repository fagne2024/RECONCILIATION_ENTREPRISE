package com.reconciliation.controller;

import com.reconciliation.entity.CalculationRuleEntity;
import com.reconciliation.service.CalculationRuleService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/**
 * Sous-module Configuration &gt; Calcul : gestion des règles de calcul configurables.
 */
@RestController
@RequestMapping("/api/configuration/calcul")
@CrossOrigin(origins = {"http://localhost:4200", "https://reconciliation.intouchgroup.net:4200"})
public class CalculationRuleController {

    @Autowired
    private CalculationRuleService calculationRuleService;

    @GetMapping
    public ResponseEntity<List<CalculationRuleEntity>> list(@RequestParam(required = false) String module) {
        if (module != null && !module.isBlank()) {
            return ResponseEntity.ok(calculationRuleService.findByModule(module));
        }
        return ResponseEntity.ok(calculationRuleService.findAll());
    }

    @GetMapping("/{id}")
    public ResponseEntity<CalculationRuleEntity> get(@PathVariable Long id) {
        return ResponseEntity.ok(calculationRuleService.findById(id));
    }

    @PostMapping
    public ResponseEntity<CalculationRuleEntity> create(@RequestBody CalculationRuleEntity rule) {
        return ResponseEntity.ok(calculationRuleService.create(rule));
    }

    @PutMapping("/{id}")
    public ResponseEntity<CalculationRuleEntity> update(@PathVariable Long id,
                                                        @RequestBody CalculationRuleEntity changes) {
        return ResponseEntity.ok(calculationRuleService.update(id, changes));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable Long id) {
        calculationRuleService.delete(id);
        return ResponseEntity.noContent().build();
    }
}
