package com.reconciliation.service;

import com.reconciliation.dto.ReleveBancaireRow;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockMultipartFile;

import java.nio.charset.StandardCharsets;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

/** Relevé avec la seule colonne « Montant » : négatif = débit, positif = crédit. */
class ReleveBancaireImportServiceMontantTest {

    private final ReleveBancaireImportService service = new ReleveBancaireImportService();

    private List<ReleveBancaireRow> parse(String... lines) throws Exception {
        MockMultipartFile file = new MockMultipartFile("file", "releve.csv", "text/csv",
                String.join("\n", lines).getBytes(StandardCharsets.UTF_8));
        return service.parseFileWithAlerts(file).rows;
    }

    @Test
    void montantSeulReporteSurDebitOuCredit() throws Exception {
        List<ReleveBancaireRow> rows = parse(
                "Numero de compte;Date comptable;Libelle;Montant",
                "0012345;2026-11-11;RETRAIT;-2500",
                "0012345;2026-11-12;VERSEMENT;4000");

        assertEquals(2, rows.size());
        assertEquals(2500d, rows.get(0).debit);
        assertNull(rows.get(0).credit);
        assertEquals(-2500d, rows.get(0).montant);
        assertEquals(4000d, rows.get(1).credit);
        assertNull(rows.get(1).debit);
        assertEquals(4000d, rows.get(1).montant);
    }

    @Test
    void laReferencePrimeSurLeLibelle() throws Exception {
        List<ReleveBancaireRow> rows = parse(
                "Numero de compte;Date comptable;Référence;Libelle;Debit;Credit",
                "0012345;2026-11-11;REF-001;VIREMENT RECU;;1000",
                "0012345;2026-11-12;;FRAIS DE TENUE;200;");

        assertEquals("REF-001", rows.get(0).libelle);
        assertEquals("FRAIS DE TENUE", rows.get(1).libelle);
    }

    @Test
    void dateSansAnneeCompleteeAvecLAnneeEnCours() throws Exception {
        List<ReleveBancaireRow> rows = parse(
                "Numero de compte;Date comptable;Date de valeur;Libelle;Debit;Credit",
                "0012345;01/06;24/06;VERSEMENT;;200000");

        int annee = java.time.LocalDate.now().getYear();
        assertEquals(java.time.LocalDate.of(annee, 6, 1), rows.get(0).dateComptable);
        assertEquals(java.time.LocalDate.of(annee, 6, 24), rows.get(0).dateValeur);
    }

    @Test
    void reconnaitLesEntetesCourtsDUnExtraitDeCompte() throws Exception {
        List<ReleveBancaireRow> rows = parse(
                "Date;Libelle operation;Val.;Debit;Credit",
                "01/06/2026;VERS DEPLACHEICK O SAMAKE;01/06/2026;;200.000",
                "25/06/2026;FACT.SERV ABONT.;24/06/2026;2.340;");

        assertEquals(2, rows.size());
        assertEquals(java.time.LocalDate.of(2026, 6, 1), rows.get(0).dateComptable);
        assertEquals(java.time.LocalDate.of(2026, 6, 1), rows.get(0).dateValeur);
        assertEquals("VERS DEPLACHEICK O SAMAKE", rows.get(0).libelle);
        assertEquals(200000d, rows.get(0).credit);
        assertEquals(java.time.LocalDate.of(2026, 6, 24), rows.get(1).dateValeur);
        assertEquals(2340d, rows.get(1).debit);
    }

    @Test
    void debitCreditDuFichierNeSontPasEcrases() throws Exception {
        List<ReleveBancaireRow> rows = parse(
                "Numero de compte;Date comptable;Libelle;Debit;Credit;Montant",
                "0012345;2026-11-11;RETRAIT;2500;;-2500");

        assertEquals(2500d, rows.get(0).debit);
        assertNull(rows.get(0).credit);
        assertEquals(-2500d, rows.get(0).montant);
    }
}
