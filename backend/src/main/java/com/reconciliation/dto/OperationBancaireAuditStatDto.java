package com.reconciliation.dto;

/**
 * Classement « Top des utilisateurs » banque : par utilisateur et type d'action (ou catégorie),
 * nombre (actions ou lignes distinctes) et volume (somme des montants des lignes, en valeur absolue ;
 * renseigné par le classement par lignes utiles, 0 sinon).
 */
public record OperationBancaireAuditStatDto(String username, String actionType, long count, double volume) {

    /** Nombre seul (requêtes JPQL d'agrégation des actions). */
    public OperationBancaireAuditStatDto(String username, String actionType, long count) {
        this(username, actionType, count, 0d);
    }
}
