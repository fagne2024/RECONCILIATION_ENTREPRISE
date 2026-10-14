package com.reconciliation.config;

import com.reconciliation.tenant.TenantAccessException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import java.util.Map;

/**
 * Traduit une violation d'isolation multi-entreprise en reponse 404 : une
 * ressource appartenant a une autre entreprise ne doit pas etre distinguable
 * d'une ressource inexistante.
 */
@RestControllerAdvice
public class TenantExceptionHandler {

    @ExceptionHandler(TenantAccessException.class)
    public ResponseEntity<Map<String, Object>> handleTenantAccess(TenantAccessException ex) {
        return ResponseEntity.status(HttpStatus.NOT_FOUND)
                .body(Map.of("error", "Ressource introuvable"));
    }
}
