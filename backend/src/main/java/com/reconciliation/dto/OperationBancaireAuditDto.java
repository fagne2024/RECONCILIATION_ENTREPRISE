package com.reconciliation.dto;

import java.time.LocalDateTime;

/** Ligne d'historique d'une opération bancaire pour le frontend. */
public record OperationBancaireAuditDto(
        Long id,
        String actionType,
        String username,
        String statutSnapshot,
        String traitementSnapshot,
        String detail,
        LocalDateTime createdAt
) {}
