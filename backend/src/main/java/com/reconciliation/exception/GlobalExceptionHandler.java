package com.reconciliation.exception;

import jakarta.persistence.EntityNotFoundException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.ConstraintViolation;
import jakarta.validation.ConstraintViolationException;
import org.apache.catalina.connector.ClientAbortException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.validation.FieldError;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ControllerAdvice;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.ResponseStatus;

import java.io.IOException;
import java.net.SocketTimeoutException;
import java.util.HashMap;
import java.util.Map;
import java.util.stream.Collectors;

@ControllerAdvice
public class GlobalExceptionHandler {

    private static final Logger log = LoggerFactory.getLogger(GlobalExceptionHandler.class);

    /**
     * Handle JSON deserialization errors (malformed JSON, type mismatches, etc.)
     */
    @ExceptionHandler(HttpMessageNotReadableException.class)
    @ResponseStatus(HttpStatus.BAD_REQUEST)
    public ResponseEntity<Map<String, String>> handleHttpMessageNotReadableException(
            HttpMessageNotReadableException ex) {
        log.error("Erreur de désérialisation JSON", ex);
        
        String message = ex.getMessage();
        if (message != null && message.contains("JSON parse error")) {
            message = "Format JSON invalide. Vérifiez la structure de la requête.";
        } else if (message != null && message.contains("Required request body is missing")) {
            message = "Le corps de la requête est requis.";
        } else {
            message = "Erreur lors de la lecture de la requête: " + (message != null ? message : "Format invalide");
        }
        
        Map<String, String> error = new HashMap<>();
        error.put("error", "Requête invalide");
        error.put("message", message);
        return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(error);
    }

    /**
     * Handle validation errors from @Valid annotations
     */
    @ExceptionHandler(MethodArgumentNotValidException.class)
    @ResponseStatus(HttpStatus.BAD_REQUEST)
    public ResponseEntity<Map<String, Object>> handleMethodArgumentNotValidException(
            MethodArgumentNotValidException ex) {
        log.error("Erreur de validation", ex);
        
        Map<String, String> fieldErrors = new HashMap<>();
        ex.getBindingResult().getAllErrors().forEach(error -> {
            String fieldName = ((FieldError) error).getField();
            String errorMessage = error.getDefaultMessage();
            fieldErrors.put(fieldName, errorMessage != null ? errorMessage : "Valeur invalide");
        });
        
        Map<String, Object> error = new HashMap<>();
        error.put("error", "Erreur de validation");
        error.put("message", "Erreurs de validation des champs");
        error.put("fieldErrors", fieldErrors);
        
        return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(error);
    }

    /**
     * Handle constraint violation errors
     */
    @ExceptionHandler(ConstraintViolationException.class)
    @ResponseStatus(HttpStatus.BAD_REQUEST)
    public ResponseEntity<Map<String, Object>> handleConstraintViolationException(
            ConstraintViolationException ex) {
        log.error("Erreur de contrainte", ex);
        
        Map<String, String> violations = ex.getConstraintViolations().stream()
                .collect(Collectors.toMap(
                        violation -> violation.getPropertyPath().toString(),
                        ConstraintViolation::getMessage,
                        (existing, replacement) -> existing
                ));
        
        Map<String, Object> error = new HashMap<>();
        error.put("error", "Violation de contrainte");
        error.put("message", "Violation des contraintes de validation");
        error.put("violations", violations);
        
        return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(error);
    }

    /**
     * Handle IllegalArgumentException (e.g., duplicate codeReco)
     */
    @ExceptionHandler(IllegalArgumentException.class)
    @ResponseStatus(HttpStatus.BAD_REQUEST)
    public ResponseEntity<Map<String, String>> handleIllegalArgumentException(
            IllegalArgumentException ex) {
        // Règle métier attendue (ex. code RECO déjà pris) — pas une panne serveur : WARN sans pile.
        log.warn("Requête refusée (règle métier): {}", ex.getMessage());
        
        Map<String, String> error = new HashMap<>();
        error.put("error", "Requête invalide");
        error.put("message", ex.getMessage() != null ? ex.getMessage() : "Argument invalide");
        
        return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(error);
    }

    /**
     * Handle EntityNotFoundException (e.g., resource not found)
     */
    @ExceptionHandler(EntityNotFoundException.class)
    @ResponseStatus(HttpStatus.NOT_FOUND)
    public ResponseEntity<Map<String, String>> handleEntityNotFoundException(
            EntityNotFoundException ex) {
        log.error("Entité introuvable", ex);
        
        Map<String, String> error = new HashMap<>();
        error.put("error", "Ressource introuvable");
        error.put("message", ex.getMessage() != null ? ex.getMessage() : "Ressource introuvable");
        
        return ResponseEntity.status(HttpStatus.NOT_FOUND).body(error);
    }

    /**
     * Accès refusé (ex. pays non autorisé pour l'utilisateur) — évite un 500 générique.
     */
    @ExceptionHandler(SecurityException.class)
    @ResponseStatus(HttpStatus.FORBIDDEN)
    public ResponseEntity<Map<String, String>> handleSecurityException(SecurityException ex) {
        log.warn("Accès refusé: {}", ex.getMessage());
        Map<String, String> error = new HashMap<>();
        error.put("error", "Accès refusé");
        error.put("message", ex.getMessage() != null ? ex.getMessage() : "Accès refusé");
        return ResponseEntity.status(HttpStatus.FORBIDDEN).body(error);
    }

    /**
     * Doublon ou contrainte SQL (ex. code_reco unique) — renvoie 400 avec message lisible au lieu de 500.
     */
    @ExceptionHandler(DataIntegrityViolationException.class)
    @ResponseStatus(HttpStatus.BAD_REQUEST)
    public ResponseEntity<Map<String, String>> handleDataIntegrityViolation(DataIntegrityViolationException ex) {
        Throwable cause = ex.getMostSpecificCause();
        String detail = cause != null ? cause.getMessage() : ex.getMessage();
        log.warn("Violation d'intégrité: {}", detail);

        String message = "Cette référence entre en conflit avec des données existantes (doublon en base).";
        if (detail != null) {
            String lower = detail.toLowerCase();
            if (lower.contains("code_reco") || lower.contains("idx_service_reference_code_reco")) {
                message = "Ce code RECO est déjà utilisé par une autre ligne.";
            }
            if (lower.contains("duplicate") || lower.contains("unique")) {
                message = "Doublon : une contrainte d'unicité en base a été violée.";
            }
        }

        Map<String, String> error = new HashMap<>();
        error.put("error", "Requête invalide");
        error.put("message", message);
        return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(error);
    }

    /**
     * Doublon explicite (code d'entreprise, identifiant ou email deja pris) -> 409.
     */
    @ExceptionHandler(DuplicateResourceException.class)
    @ResponseStatus(HttpStatus.CONFLICT)
    public ResponseEntity<Map<String, String>> handleDuplicateResource(DuplicateResourceException ex) {
        log.warn("Conflit de ressource: {}", ex.getMessage());
        Map<String, String> error = new HashMap<>();
        error.put("error", "Conflit");
        error.put("message", ex.getMessage() != null ? ex.getMessage() : "Cette ressource existe deja.");
        return ResponseEntity.status(HttpStatus.CONFLICT).body(error);
    }

    /**
     * Etat incompatible avec l'operation demandee (ex. compte administrateur
     * absent pour un renvoi de lien) -> 409.
     */
    @ExceptionHandler(IllegalStateException.class)
    @ResponseStatus(HttpStatus.CONFLICT)
    public ResponseEntity<Map<String, String>> handleIllegalState(IllegalStateException ex) {
        log.warn("Operation impossible (etat): {}", ex.getMessage());
        Map<String, String> error = new HashMap<>();
        error.put("error", "Conflit");
        error.put("message", ex.getMessage() != null ? ex.getMessage() : "Operation impossible dans l'etat actuel.");
        return ResponseEntity.status(HttpStatus.CONFLICT).body(error);
    }

    /**
     * Client (navigateur / proxy) ferme la connexion avant la fin de l'envoi JSON.
     * Frequent sur /api/result8rec quand la reponse est volumineuse — pas une panne serveur.
     */
    @ExceptionHandler(ClientAbortException.class)
    public void handleClientAbortException(ClientAbortException ex, HttpServletRequest request) {
        log.warn(
            "Client deconnecte avant fin de reponse ({} {}) — {}",
            request.getMethod(),
            request.getRequestURI(),
            rootCauseMessage(ex)
        );
    }

    /**
     * Handle generic exceptions that weren't caught by specific handlers
     */
    @ExceptionHandler(Exception.class)
    @ResponseStatus(HttpStatus.INTERNAL_SERVER_ERROR)
    public ResponseEntity<Map<String, String>> handleGenericException(Exception ex, HttpServletRequest request) {
        if (isClientDisconnect(ex)) {
            log.warn(
                "Client deconnecte avant fin de reponse ({} {}) — {}",
                request.getMethod(),
                request.getRequestURI(),
                rootCauseMessage(ex)
            );
            return ResponseEntity.status(HttpStatus.NO_CONTENT).build();
        }

        log.error("Erreur interne non gérée", ex);
        
        Map<String, String> error = new HashMap<>();
        error.put("error", "Erreur interne du serveur");
        error.put("message", "Une erreur inattendue s'est produite. Veuillez contacter l'administrateur.");
        
        // In production, you might want to hide the actual exception message
        // For debugging, you can include it:
        if (log.isDebugEnabled()) {
            error.put("details", ex.getMessage());
        }
        
        return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(error);
    }

    private static boolean isClientDisconnect(Throwable ex) {
        for (Throwable current = ex; current != null; current = current.getCause()) {
            if (current instanceof ClientAbortException) {
                return true;
            }
            if (current instanceof SocketTimeoutException) {
                return true;
            }
            if (current instanceof IOException) {
                String message = current.getMessage();
                if (message != null) {
                    String lower = message.toLowerCase();
                    if (lower.contains("broken pipe") || lower.contains("connection reset")) {
                        return true;
                    }
                }
            }
        }
        return false;
    }

    private static String rootCauseMessage(Throwable ex) {
        Throwable root = ex;
        while (root.getCause() != null) {
            root = root.getCause();
        }
        return root.getClass().getSimpleName()
            + (root.getMessage() != null ? " — " + root.getMessage() : "");
    }
}

