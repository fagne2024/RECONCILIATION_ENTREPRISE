package com.reconciliation.controller;

import com.reconciliation.dto.RecoBlockingCommentMailAlertRequest;
import com.reconciliation.dto.RecoJ1BlockingCommentDto;
import com.reconciliation.dto.RecoJ1BlockingCommentSaveRequest;
import com.reconciliation.entity.RecoBlockingCommentMailAlertEntity;
import com.reconciliation.service.RecoBlockingCommentMailAlertService;
import com.reconciliation.service.RecoJ1BlockingCommentService;
import com.reconciliation.util.RequestContextUtil;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.CrossOrigin;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import jakarta.annotation.PostConstruct;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/reco-j1-blocking-comments")
@CrossOrigin(origins = {"http://localhost:4200", "http://172.214.108.8:4200"})
@RequiredArgsConstructor
@Slf4j
public class RecoJ1BlockingCommentController {

    private final RecoJ1BlockingCommentService j1BlockingCommentService;
    private final RecoBlockingCommentMailAlertService mailAlertService;

    @PostConstruct
    void logRegistration() {
        log.info("API commentaires J+1 active : GET/PUT /api/reco-j1-blocking-comments");
    }

    @GetMapping
    public ResponseEntity<?> list(
            @RequestParam String startDate,
            @RequestParam String endDate) {
        String start = blankToNull(startDate);
        String end = blankToNull(endDate);
        if (start == null || end == null) {
            return ResponseEntity.badRequest().build();
        }
        try {
            List<RecoJ1BlockingCommentDto> out = j1BlockingCommentService.listBetween(start, end);
            return ResponseEntity.ok(out);
        } catch (IllegalStateException ex) {
            log.error("GET j1-blocking-comments: {}", ex.getMessage(), ex);
            return internalError("Table des commentaires J+1 indisponible. Redémarrez le backend ou contactez l'administrateur.");
        } catch (Exception ex) {
            log.error("GET j1-blocking-comments: {}", ex.getMessage(), ex);
            return internalError("Erreur lors du chargement des commentaires J+1.");
        }
    }

    @PutMapping
    public ResponseEntity<?> save(@RequestBody RecoJ1BlockingCommentSaveRequest body) {
        try {
            String username = RequestContextUtil.getUsernameFromRequest();
            RecoJ1BlockingCommentDto saved = j1BlockingCommentService.save(body, username);
            return ResponseEntity.ok(saved);
        } catch (IllegalArgumentException ex) {
            Map<String, String> err = new HashMap<>();
            err.put("message", ex.getMessage());
            return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(err);
        } catch (IllegalStateException ex) {
            log.error("PUT j1-blocking-comments: {}", ex.getMessage(), ex);
            return internalError("Table des commentaires J+1 indisponible. Redémarrez le backend ou contactez l'administrateur.");
        } catch (Exception ex) {
            log.error("PUT j1-blocking-comments: {}", ex.getMessage(), ex);
            return internalError("Erreur lors de l'enregistrement du commentaire J+1.");
        }
    }

    /** Envoie l'e-mail tout de suite puis active la relance quotidienne (tant que le statut ne change pas). */
    @PutMapping("/mail-alert")
    public ResponseEntity<?> activateMailAlert(@RequestBody RecoBlockingCommentMailAlertRequest body) {
        try {
            RecoBlockingCommentMailAlertEntity alert = mailAlertService.activate(body, RequestContextUtil.getUsernameFromRequest());
            return ResponseEntity.ok(commentForAlert(alert));
        } catch (IllegalArgumentException ex) {
            return error(HttpStatus.BAD_REQUEST, ex.getMessage());
        } catch (RecoBlockingCommentMailAlertService.MailAlertSendException ex) {
            return error(HttpStatus.BAD_GATEWAY, "L'e-mail n'a pas pu être envoyé : " + ex.getMessage());
        } catch (Exception ex) {
            log.error("PUT j1-blocking-comments/mail-alert: {}", ex.getMessage(), ex);
            return internalError("Erreur lors de l'activation de la relance par e-mail.");
        }
    }

    @PutMapping("/mail-alert/stop")
    public ResponseEntity<?> stopMailAlert(@RequestBody RecoBlockingCommentMailAlertRequest body) {
        try {
            RecoBlockingCommentMailAlertEntity alert = mailAlertService.stop(body, RequestContextUtil.getUsernameFromRequest());
            return ResponseEntity.ok(commentForAlert(alert));
        } catch (IllegalArgumentException ex) {
            return error(HttpStatus.BAD_REQUEST, ex.getMessage());
        } catch (Exception ex) {
            log.error("PUT j1-blocking-comments/mail-alert/stop: {}", ex.getMessage(), ex);
            return internalError("Erreur lors de l'arrêt de la relance par e-mail.");
        }
    }

    private RecoJ1BlockingCommentDto commentForAlert(RecoBlockingCommentMailAlertEntity alert) {
        return j1BlockingCommentService.get(alert.getRecoDate(), alert.getService(), alert.getCountry(), alert.getEnv());
    }

    private static ResponseEntity<Map<String, String>> error(HttpStatus status, String message) {
        Map<String, String> err = new HashMap<>();
        err.put("message", message);
        return ResponseEntity.status(status).body(err);
    }

    private static ResponseEntity<Map<String, String>> internalError(String message) {
        Map<String, String> err = new HashMap<>();
        err.put("message", message);
        return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(err);
    }

    private static String blankToNull(String value) {
        if (value == null) {
            return null;
        }
        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }
}
