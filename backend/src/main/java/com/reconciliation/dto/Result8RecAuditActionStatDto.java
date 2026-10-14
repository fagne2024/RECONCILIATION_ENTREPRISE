package com.reconciliation.dto;

/**
 * Agrégat d'actions d'audit result8rec pour le « Top 3 des utilisateurs »
 * de l'État des réconciliations.
 *
 * <p>Chaque entrée correspond à un couple utilisateur / type d'action / niveau
 * de traitement avec le nombre d'occurrences sur la période et périmètre demandés.
 * La catégorisation métier (Agent / Responsable / Validateur) est appliquée côté
 * frontend à partir de {@code actionType} et {@code traitementSnapshot}.</p>
 */
public record Result8RecAuditActionStatDto(
        String username,
        String actionType,
        String traitementSnapshot,
        long count
) {}
