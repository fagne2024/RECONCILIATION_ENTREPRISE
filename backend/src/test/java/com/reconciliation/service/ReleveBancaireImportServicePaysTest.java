package com.reconciliation.service;

import com.reconciliation.dto.ReleveBancaireRow;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockMultipartFile;

import java.nio.charset.StandardCharsets;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

/** Colonne « Pays » du modèle de relevé bancaire. */
class ReleveBancaireImportServicePaysTest {

    private final ReleveBancaireImportService service = new ReleveBancaireImportService();

    @Test
    void litLaColonnePaysDuModele() throws Exception {
        String content = String.join("\n",
                "Numero de compte;Nom du compte;Banque;Pays;Date comptable;Date de valeur;Libelle;Debit;Credit;Montant;Devise",
                "0012345;COMPTE ML;UBA ML;ML;2026-11-11;2026-11-11;VIREMENT;;1000;1000;XOF");
        MockMultipartFile file = new MockMultipartFile("file", "releve.csv", "text/csv",
                content.getBytes(StandardCharsets.UTF_8));

        List<ReleveBancaireRow> rows = service.parseFileWithAlerts(file).rows;

        assertEquals(1, rows.size());
        assertEquals("ML", rows.get(0).pays);
        assertEquals("UBA ML", rows.get(0).banque);
    }

    @Test
    void reconnaitLesEntetesPaysAlternatifs() throws Exception {
        String content = String.join("\n",
                "Numero de compte;Banque;Country;Date comptable;Libelle;Debit;Credit",
                "0012345;UBA SN;SN;2026-11-11;VIREMENT;;500");
        MockMultipartFile file = new MockMultipartFile("file", "releve.csv", "text/csv",
                content.getBytes(StandardCharsets.UTF_8));

        var result = service.parseFileWithAlerts(file);

        assertEquals("SN", result.rows.get(0).pays);
        assertFalse(result.unmappedHeaders.contains("Country"));
    }
}
