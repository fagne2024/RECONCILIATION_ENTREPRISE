package com.reconciliation.dto;

import java.time.LocalDateTime;

/** Données d'une ligne d'historique result8rec pour le frontend */
public record Result8RecAuditDto(
        Long id,
        String actionType,
        String username,
        String traitementSnapshot,
        String statusSnapshot,
        String detail,
        LocalDateTime createdAt
) {}
