package com.reconciliation.controller;

import com.reconciliation.dto.TopUsersConfigDto;
import com.reconciliation.service.TopUsersConfigService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.CrossOrigin;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Sous-module Configuration &gt; Top utilisateurs.
 *
 * <p>Reglages (par entreprise, via {@code @TenantId}) du bloc « Top des
 * utilisateurs » affiche en tete de l'ecran « État des réconciliations ».</p>
 */
@RestController
@RequestMapping("/api/configuration/top-users")
@CrossOrigin(origins = {"http://localhost:4200", "https://reconciliation.intouchgroup.net:4200"})
public class TopUsersConfigController {

    @Autowired
    private TopUsersConfigService service;

    @GetMapping
    public ResponseEntity<TopUsersConfigDto> get() {
        return ResponseEntity.ok(service.get());
    }

    @PutMapping
    public ResponseEntity<TopUsersConfigDto> save(@RequestBody TopUsersConfigDto config) {
        return ResponseEntity.ok(service.save(config));
    }
}
