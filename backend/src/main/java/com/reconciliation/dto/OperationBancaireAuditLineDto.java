package com.reconciliation.dto;

/** Ligne utile du classement banque : utilisateur, opération traitée et son montant. */
public record OperationBancaireAuditLineDto(String username, Long operationId, Double montant) {}
