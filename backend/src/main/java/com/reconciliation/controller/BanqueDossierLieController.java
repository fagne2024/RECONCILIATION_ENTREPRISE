package com.reconciliation.controller;

import com.reconciliation.dto.BanqueDossierLieDto;
import com.reconciliation.service.BanqueDossierLieService;
import com.reconciliation.util.RequestContextUtil;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/**
 * Dossiers liés de la page Banque (opérations bancaires + lignes de relevé d'une même opération métier).
 * Sous /api/releve-bancaire : mêmes droits que le relevé bancaire (module BANQUE).
 */
@RestController
@RequestMapping("/api/releve-bancaire/dossiers-lies")
public class BanqueDossierLieController {

    private final BanqueDossierLieService service;

    public BanqueDossierLieController(BanqueDossierLieService service) {
        this.service = service;
    }

    @GetMapping
    public List<BanqueDossierLieDto.Resume> list() {
        return service.list();
    }

    @GetMapping("/{id}")
    public BanqueDossierLieDto.Detail detail(@PathVariable("id") Long id) {
        return service.detail(id);
    }

    @PostMapping
    public BanqueDossierLieDto.Resume create(@RequestBody BanqueDossierLieDto.SaveRequest req) {
        return service.save(null, req, RequestContextUtil.getUsernameFromRequest());
    }

    @PutMapping("/{id}")
    public BanqueDossierLieDto.Resume update(@PathVariable("id") Long id, @RequestBody BanqueDossierLieDto.SaveRequest req) {
        return service.save(id, req, RequestContextUtil.getUsernameFromRequest());
    }

    /** Suppression en POST, comme pour les lignes de relevé ({@code POST /api/releve-bancaire/{id}/delete}). */
    @PostMapping("/{id}/delete")
    public ResponseEntity<Void> delete(@PathVariable("id") Long id) {
        service.delete(id);
        return ResponseEntity.noContent().build();
    }
}
