package com.reconciliation.service;

import com.reconciliation.util.BankingDedupKey;
import org.junit.jupiter.api.Test;

import java.time.LocalDate;

import static org.junit.jupiter.api.Assertions.*;

/** Contrôle de doublon : libellé pour le relevé, référence normalisée pour opérations et suivi. */
class ReleveLibelleDedupTest {

    private static String composite(String compte, String libelle, double montant) {
        return ReleveBancaireImportService.buildDedupKey(compte, LocalDate.of(2026, 11, 11),
                LocalDate.of(2026, 11, 11), libelle, montant);
    }

    @Test
    void memeLibelleDonneLaMemeCleMemeSiLeResteDiffere() {
        String a = ReleveBancaireImportService.libelleDedupKey("VIREMENT RECU 123", composite("A1", "VIREMENT RECU 123", 100));
        String b = ReleveBancaireImportService.libelleDedupKey("  virement   recu 123 ", composite("B2", "virement recu 123", 999));
        assertEquals(a, b);
    }

    @Test
    void lesAccentsEtLaCasseNeCreentPasDeFauxDoublons() {
        String a = ReleveBancaireImportService.libelleDedupKey("Règlement facture", "x");
        String b = ReleveBancaireImportService.libelleDedupKey("REGLEMENT FACTURE", "x");
        assertEquals(a, b);
    }

    @Test
    void libellesDifferentsSontDistincts() {
        assertNotEquals(
                ReleveBancaireImportService.libelleDedupKey("VIREMENT 1", "x"),
                ReleveBancaireImportService.libelleDedupKey("VIREMENT 2", "x"));
    }

    @Test
    void sansLibelleOnRetombeSurLaCleDeRepli() {
        assertEquals("repli", ReleveBancaireImportService.libelleDedupKey(null, "repli"));
        assertEquals("repli", ReleveBancaireImportService.libelleDedupKey("   ", "repli"));
    }

    @Test
    void normalisationDesReferences() {
        assertEquals("ref-1", BankingDedupKey.normalizeText("  REF-1 "));
        assertEquals("ref 1", BankingDedupKey.normalizeText("Ref   1"));
        assertEquals("", BankingDedupKey.normalizeText(null));
    }
}
