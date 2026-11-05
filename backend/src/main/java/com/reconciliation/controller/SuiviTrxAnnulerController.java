package com.reconciliation.controller;

import com.reconciliation.model.SuiviTrxAnnuler;
import com.reconciliation.service.SuiviTrxAnnulerService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/suivi-trx-a-annuler")
public class SuiviTrxAnnulerController {

    private final SuiviTrxAnnulerService service;

    public SuiviTrxAnnulerController(SuiviTrxAnnulerService service) {
        this.service = service;
    }

    @GetMapping
    public ResponseEntity<List<SuiviTrxAnnuler>> getAll() {
        return ResponseEntity.ok(service.getAll());
    }

    @GetMapping("/{id}")
    public ResponseEntity<SuiviTrxAnnuler> getById(@PathVariable Long id) {
        return service.getById(id)
                .map(ResponseEntity::ok)
                .orElse(ResponseEntity.notFound().build());
    }

    /**
     * Creation ou mise a jour (upsert par id, sinon par matchKey) : permet
     * d'enregistrer la ligne depuis /matches puis de la completer avec l'ID
     * Annulation sans creer de doublon.
     */
    @PostMapping
    public ResponseEntity<SuiviTrxAnnuler> save(@RequestBody SuiviTrxAnnuler dto) {
        return ResponseEntity.ok(service.save(dto));
    }

    @PutMapping("/{id}")
    public ResponseEntity<SuiviTrxAnnuler> update(@PathVariable Long id, @RequestBody SuiviTrxAnnuler dto) {
        try {
            return ResponseEntity.ok(service.update(id, dto));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.notFound().build();
        }
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable Long id) {
        service.delete(id);
        return ResponseEntity.noContent().build();
    }
}
