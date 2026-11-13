package com.reconciliation.controller;

import com.reconciliation.dto.ClientVolumeAlertRequest;
import com.reconciliation.service.ClientVolumeAlertService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

/**
 * Envoi par e-mail de l'alerte « volume par client » depuis le pop-up du chargement de fichier.
 * Chemin sous /api/reconciliation : rattaché au module Réconciliation (permission lancer_reconciliation).
 */
@Slf4j
@RestController
@RequestMapping("/api/reconciliation/client-volume-alert")
public class ClientVolumeAlertController {

    private final ClientVolumeAlertService alertService;

    public ClientVolumeAlertController(ClientVolumeAlertService alertService) {
        this.alertService = alertService;
    }

    @PostMapping
    public ResponseEntity<Map<String, Object>> send(@RequestBody ClientVolumeAlertRequest request) {
        try {
            int recipients = alertService.send(request);
            return ResponseEntity.ok(Map.of("success", true, "recipients", recipients));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Map.of("success", false, "message", e.getMessage()));
        } catch (Exception e) {
            log.error("Échec d'envoi de l'alerte volume par client", e);
            return ResponseEntity.status(HttpStatus.BAD_GATEWAY)
                .body(Map.of("success", false, "message", "L'e-mail n'a pas pu être envoyé (configuration SMTP ou service de messagerie indisponible)."));
        }
    }
}
