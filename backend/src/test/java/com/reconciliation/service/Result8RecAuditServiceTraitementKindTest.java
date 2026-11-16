package com.reconciliation.service;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;

/**
 * Niveau de traitement d'une ligne rapport (comptage du « Top des utilisateurs » par services) :
 * doit rester identique à resolveTraitementKind (frontend, result8rec-audit-display.ts).
 */
class Result8RecAuditServiceTraitementKindTest {

    @Test
    void niveauxReconnus() {
        assertEquals("termine", Result8RecAuditService.traitementKind("Terminé"));
        assertEquals("cdo", Result8RecAuditService.traitementKind("En cours de validation"));
        assertEquals("group", Result8RecAuditService.traitementKind("En cours de clôture"));
        assertEquals("group", Result8RecAuditService.traitementKind("Niveau Group"));
        assertEquals("support", Result8RecAuditService.traitementKind("Niveau Support"));
        assertEquals("support", Result8RecAuditService.traitementKind("En cours de traitement"));
        assertEquals("cdo", Result8RecAuditService.traitementKind("Responsable CDO"));
    }

    @Test
    void valeursVidesOuInconnues() {
        assertEquals("none", Result8RecAuditService.traitementKind(null));
        assertEquals("none", Result8RecAuditService.traitementKind("  "));
        assertEquals("none", Result8RecAuditService.traitementKind("—"));
        assertEquals("none", Result8RecAuditService.traitementKind("Autre"));
    }
}
