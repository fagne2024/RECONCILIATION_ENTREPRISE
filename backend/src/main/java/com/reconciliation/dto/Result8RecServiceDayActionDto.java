package com.reconciliation.dto;

/**
 * Action d'audit result8rec rattachée à son service × jour (« Top des utilisateurs » de
 * l'État des réconciliations, comptage par services).
 *
 * <p>{@code serviceDayKey} identifie la case de la grille (date|service|pays|ENV) ;
 * {@code serviceDayLevel} est le niveau de traitement ACTUEL de ce service-jour, c'est-à-dire
 * celui de sa ligne la moins avancée : support, cdo (en cours de validation), group
 * (en cours de clôture), termine ou none.</p>
 */
public record Result8RecServiceDayActionDto(
        String username,
        String actionType,
        String traitementSnapshot,
        String serviceDayKey,
        String serviceDayLevel
) {}
