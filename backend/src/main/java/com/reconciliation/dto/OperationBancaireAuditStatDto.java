package com.reconciliation.dto;

/** Nombre d'actions par utilisateur et type d'action (classement « Top des utilisateurs » banque). */
public record OperationBancaireAuditStatDto(String username, String actionType, long count) {}
