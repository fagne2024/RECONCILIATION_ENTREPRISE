package com.reconciliation.controller;

import com.reconciliation.dto.BoPartenaireControleInterneCommentDto;
import com.reconciliation.dto.BoPartenaireControleInterneCommentSaveRequest;
import com.reconciliation.dto.BoPartenaireControleInterneSendEmailRequest;
import com.reconciliation.dto.BoPartenaireControleInterneDto;
import com.reconciliation.dto.BoPartenaireControleInterneValidateRequest;
import com.reconciliation.exception.ControleInterneAccessDeniedException;
import com.reconciliation.service.BoPartenaireControleInterneService;
import com.reconciliation.util.RequestContextUtil;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/bo-partenaire-controle-interne")
@CrossOrigin(origins = {"http://localhost:4200", "http://172.214.108.8:4200"})
public class BoPartenaireControleInterneController {

    private final BoPartenaireControleInterneService service;

    public BoPartenaireControleInterneController(BoPartenaireControleInterneService service) {
        this.service = service;
    }

    @GetMapping
    public ResponseEntity<List<BoPartenaireControleInterneDto>> list(
        @RequestParam String country,
        @RequestParam(defaultValue = "ALL") String env,
        @RequestParam String startMonth,
        @RequestParam String endMonth
    ) {
        try {
            return ResponseEntity.ok(service.list(country, env, startMonth, endMonth));
        } catch (Exception e) {
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).build();
        }
    }

    @PostMapping("/validate")
    public ResponseEntity<?> validate(@RequestBody BoPartenaireControleInterneValidateRequest body) {
        try {
            String username = RequestContextUtil.getUsernameFromRequest();
            BoPartenaireControleInterneDto saved = service.validate(body, username);
            return ResponseEntity.ok(saved);
        } catch (IllegalArgumentException ex) {
            return ResponseEntity.badRequest().body(Map.of("message", ex.getMessage()));
        } catch (ControleInterneAccessDeniedException ex) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body(Map.of("message", ex.getMessage()));
        } catch (Exception e) {
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                .body(Map.of("message", "Erreur lors de la validation"));
        }
    }

    @PostMapping("/revoke")
    public ResponseEntity<?> revoke(@RequestBody BoPartenaireControleInterneValidateRequest body) {
        try {
            String username = RequestContextUtil.getUsernameFromRequest();
            BoPartenaireControleInterneDto saved = service.revoke(body, username);
            return ResponseEntity.ok(saved);
        } catch (IllegalArgumentException ex) {
            return ResponseEntity.badRequest().body(Map.of("message", ex.getMessage()));
        } catch (ControleInterneAccessDeniedException ex) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body(Map.of("message", ex.getMessage()));
        } catch (Exception e) {
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                .body(Map.of("message", "Erreur lors de l'annulation de la validation"));
        }
    }

    @GetMapping("/comment")
    public ResponseEntity<?> getComment(
        @RequestParam String country,
        @RequestParam(defaultValue = "ALL") String env,
        @RequestParam String monthYyyyMm
    ) {
        try {
            return ResponseEntity.ok(service.getComment(country, env, monthYyyyMm));
        } catch (Exception e) {
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                .body(Map.of("message", "Impossible de charger le commentaire"));
        }
    }

    @PutMapping("/comment")
    public ResponseEntity<?> saveComment(@RequestBody BoPartenaireControleInterneCommentSaveRequest body) {
        try {
            String username = RequestContextUtil.getUsernameFromRequest();
            return ResponseEntity.ok(service.saveComment(body, username));
        } catch (IllegalArgumentException ex) {
            return ResponseEntity.badRequest().body(Map.of("message", ex.getMessage()));
        } catch (ControleInterneAccessDeniedException ex) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body(Map.of("message", ex.getMessage()));
        } catch (Exception e) {
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                .body(Map.of("message", "Erreur lors de l'enregistrement du commentaire"));
        }
    }

    @PostMapping("/send-email")
    public ResponseEntity<?> sendCommentEmail(@RequestBody BoPartenaireControleInterneSendEmailRequest body) {
        try {
            String username = RequestContextUtil.getUsernameFromRequest();
            BoPartenaireControleInterneCommentDto saved = service.sendCommentEmail(body, username);
            return ResponseEntity.ok(Map.of(
                "message", "E-mail envoyé avec succès",
                "comment", saved
            ));
        } catch (IllegalArgumentException ex) {
            return ResponseEntity.badRequest().body(Map.of("message", ex.getMessage()));
        } catch (ControleInterneAccessDeniedException ex) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body(Map.of("message", ex.getMessage()));
        } catch (Exception e) {
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                .body(Map.of("message", e.getMessage() != null ? e.getMessage() : "Erreur lors de l'envoi de l'e-mail"));
        }
    }
}
