package com.reconciliation.controller;

import com.reconciliation.dto.FluxRequest;
import com.reconciliation.entity.FluxEntity;
import com.reconciliation.service.FluxService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.util.Optional;

@RestController
@RequestMapping("/api/flux")
@CrossOrigin(origins = {"http://localhost:4200", "https://reconciliation.intouchgroup.net:4200"})
public class FluxController {

    @Autowired
    private FluxService fluxService;

    @GetMapping
    public ResponseEntity<FluxEntity> getFlux(
            @RequestParam String agence,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate dateDebut,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate dateFin) {
        Optional<FluxEntity> flux = fluxService.findByAgenceAndPeriod(agence, dateDebut, dateFin);
        return flux.map(ResponseEntity::ok).orElse(ResponseEntity.noContent().build());
    }

    @PostMapping
    public ResponseEntity<FluxEntity> saveFlux(@RequestBody FluxRequest request) {
        FluxEntity saved = fluxService.saveOrUpdate(request);
        return ResponseEntity.ok(saved);
    }

    @PutMapping
    public ResponseEntity<FluxEntity> updateFlux(@RequestBody FluxRequest request) {
        FluxEntity saved = fluxService.saveOrUpdate(request);
        return ResponseEntity.ok(saved);
    }
}
