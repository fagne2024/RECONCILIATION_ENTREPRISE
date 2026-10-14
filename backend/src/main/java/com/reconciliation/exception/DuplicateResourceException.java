package com.reconciliation.exception;

/**
 * Conflit de ressource (doublon de code d'entreprise, d'identifiant ou
 * d'adresse email). Converti en HTTP 409 par le gestionnaire global.
 */
public class DuplicateResourceException extends RuntimeException {

    public DuplicateResourceException(String message) {
        super(message);
    }
}
