package com.reconciliation.service.traitement;

import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.junit.jupiter.api.Test;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.util.ArrayList;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

class ExcelLecteurFluxTest {

    private static byte[] classeur() throws IOException {
        try (XSSFWorkbook wb = new XSSFWorkbook(); ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            var feuille = wb.createSheet("Feuille1");
            var entete = feuille.createRow(0);
            entete.createCell(0).setCellValue("Reference");
            entete.createCell(1).setCellValue("Montant");
            entete.createCell(2).setCellValue("Statut");
            var l1 = feuille.createRow(1);
            l1.createCell(0).setCellValue("R1");
            l1.createCell(1).setCellValue(1500.5);
            l1.createCell(2).setCellValue("OK");
            // Ligne 2 : cellule du milieu absente, la colonne C doit rester à sa place.
            var l2 = feuille.createRow(2);
            l2.createCell(0).setCellValue("R2");
            l2.createCell(2).setCellValue("KO");
            wb.write(out);
            return out.toByteArray();
        }
    }

    @Test
    void lisLesLignesDeLaPremiereFeuille() throws IOException {
        List<List<String>> lignes = new ArrayList<>();
        ExcelLecteurFlux.lire(new ByteArrayInputStream(classeur()), lignes::add);

        assertThat(lignes).hasSize(3);
        assertThat(lignes.get(0)).containsExactly("Reference", "Montant", "Statut");
        assertThat(lignes.get(1).get(0)).isEqualTo("R1");
        assertThat(lignes.get(1).get(2)).isEqualTo("OK");
    }

    @Test
    void comblelesCellulesAbsentesParDesChainesVides() throws IOException {
        List<List<String>> lignes = new ArrayList<>();
        ExcelLecteurFlux.lire(new ByteArrayInputStream(classeur()), lignes::add);

        assertThat(lignes.get(2)).containsExactly("R2", "", "KO");
    }

    @Test
    void fichierNonExcelLeveUneErreurExplicite() {
        byte[] pasDuXlsx = "ceci n'est pas un classeur".getBytes();
        org.assertj.core.api.Assertions.assertThatThrownBy(() ->
                        ExcelLecteurFlux.lire(new ByteArrayInputStream(pasDuXlsx), ligne -> { }))
                .isInstanceOf(IOException.class)
                .hasMessageContaining("Fichier Excel illisible");
    }
}
