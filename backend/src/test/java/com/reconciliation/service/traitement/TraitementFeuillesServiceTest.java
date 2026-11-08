package com.reconciliation.service.traitement;

import org.apache.poi.ss.usermodel.Workbook;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockMultipartFile;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;

import static org.assertj.core.api.Assertions.assertThat;

class TraitementFeuillesServiceTest {

    private final TraitementFeuillesService service = new TraitementFeuillesService();

    private static byte[] classeurDeuxFeuilles() throws Exception {
        try (XSSFWorkbook classeur = new XSSFWorkbook(); ByteArrayOutputStream sortie = new ByteArrayOutputStream()) {
            var premiere = classeur.createSheet("Janv 2026");
            premiere.createRow(0).createCell(0).setCellValue("donnee");
            premiere.createRow(1).createCell(0).setCellValue(42);
            var seconde = classeur.createSheet("Fév");
            seconde.createRow(0).createCell(0).setCellValue("a");
            seconde.createRow(1).createCell(0).setCellValue("b");
            classeur.write(sortie);
            return sortie.toByteArray();
        }
    }

    private static Map<String, byte[]> lireZip(byte[] zip) throws Exception {
        Map<String, byte[]> entrees = new HashMap<>();
        try (ZipInputStream zis = new ZipInputStream(new ByteArrayInputStream(zip))) {
            ZipEntry e;
            while ((e = zis.getNextEntry()) != null) {
                entrees.put(e.getName(), zis.readAllBytes());
            }
        }
        return entrees;
    }

    @Test
    void separeChaqueFeuilleEtInsereLEntetePartirDeLaSeconde() throws Exception {
        MockMultipartFile fichier = new MockMultipartFile("file", "source.xlsx", null, classeurDeuxFeuilles());
        Workbook classeur = service.charger(fichier);
        ByteArrayOutputStream sortie = new ByteArrayOutputStream();

        int nombre = service.ecrire(classeur,
                new TraitementFeuillesService.Options(List.of("H1", "H2"), true, List.of(20.0)), sortie);

        assertThat(nombre).isEqualTo(2);
        Map<String, byte[]> entrees = lireZip(sortie.toByteArray());
        assertThat(entrees).containsOnlyKeys("Janv 2026.xlsx", "Fév.xlsx");

        // première feuille : pas d'en-tête inséré
        try (XSSFWorkbook premiere = new XSSFWorkbook(new ByteArrayInputStream(entrees.get("Janv 2026.xlsx")))) {
            assertThat(premiere.getSheetAt(0).getRow(0).getCell(0).getStringCellValue()).isEqualTo("donnee");
            assertThat(premiere.getSheetAt(0).getRow(1).getCell(0).getNumericCellValue()).isEqualTo(42.0);
        }
        // seconde feuille : en-tête en ligne 1, données décalées d'une ligne
        try (XSSFWorkbook seconde = new XSSFWorkbook(new ByteArrayInputStream(entrees.get("Fév.xlsx")))) {
            assertThat(seconde.getSheetAt(0).getRow(0).getCell(0).getStringCellValue()).isEqualTo("H1");
            assertThat(seconde.getSheetAt(0).getRow(1).getCell(0).getStringCellValue()).isEqualTo("a");
            assertThat(seconde.getSheetAt(0).getRow(2).getCell(0).getStringCellValue()).isEqualTo("b");
        }
        classeur.close();
    }

    @Test
    void lectureEnFluxConserveLesTypesEtLEntete() throws Exception {
        java.nio.file.Path source = java.nio.file.Files.createTempFile("test-feuilles", ".xlsx");
        try {
            try (XSSFWorkbook classeur = new XSSFWorkbook()) {
                var styleDate = classeur.createCellStyle();
                styleDate.setDataFormat(classeur.createDataFormat().getFormat("dd/mm/yyyy"));
                var premiere = classeur.createSheet("Janv");
                var r0 = premiere.createRow(0);
                r0.createCell(0).setCellValue("texte");
                r0.createCell(1).setCellValue(3.5);
                r0.createCell(2).setCellValue(true);
                var r1 = premiere.createRow(1);
                var cellDate = r1.createCell(0);
                cellDate.setCellValue(new java.util.GregorianCalendar(2026, 10, 7).getTime());
                cellDate.setCellStyle(styleDate);
                var seconde = classeur.createSheet("Fev");
                seconde.createRow(0).createCell(0).setCellValue("a");
                try (var out = java.nio.file.Files.newOutputStream(source)) {
                    classeur.write(out);
                }
            }

            ByteArrayOutputStream sortie = new ByteArrayOutputStream();
            try (org.apache.poi.openxml4j.opc.OPCPackage paquet = service.ouvrirXlsx(source.toFile())) {
                assertThat(service.compterFeuillesXlsx(paquet)).isEqualTo(2);
                int nombre = service.ecrireXlsx(paquet,
                        new TraitementFeuillesService.Options(List.of("H1"), true, List.of()), sortie);
                assertThat(nombre).isEqualTo(2);
            }

            Map<String, byte[]> entrees = lireZip(sortie.toByteArray());
            assertThat(entrees).containsOnlyKeys("Janv.xlsx", "Fev.xlsx");
            // première feuille : pas d'en-tête, types conservés
            try (XSSFWorkbook p = new XSSFWorkbook(new ByteArrayInputStream(entrees.get("Janv.xlsx")))) {
                var feuille = p.getSheetAt(0);
                assertThat(feuille.getRow(0).getCell(0).getStringCellValue()).isEqualTo("texte");
                assertThat(feuille.getRow(0).getCell(1).getNumericCellValue()).isEqualTo(3.5);
                assertThat(feuille.getRow(0).getCell(2).getBooleanCellValue()).isTrue();
                assertThat(feuille.getRow(1).getCell(0).getDateCellValue())
                        .isEqualTo(new java.util.GregorianCalendar(2026, 10, 7).getTime());
            }
            // seconde feuille : en-tête en ligne 1, données décalées
            try (XSSFWorkbook s = new XSSFWorkbook(new ByteArrayInputStream(entrees.get("Fev.xlsx")))) {
                assertThat(s.getSheetAt(0).getRow(0).getCell(0).getStringCellValue()).isEqualTo("H1");
                assertThat(s.getSheetAt(0).getRow(1).getCell(0).getStringCellValue()).isEqualTo("a");
            }
        } finally {
            java.nio.file.Files.deleteIfExists(source);
        }
    }

    @Test
    void lectureXlsEnFluxConserveLesTypesEtLEntete() throws Exception {
        ByteArrayOutputStream binaire = new ByteArrayOutputStream();
        try (org.apache.poi.hssf.usermodel.HSSFWorkbook classeur = new org.apache.poi.hssf.usermodel.HSSFWorkbook()) {
            var styleDate = classeur.createCellStyle();
            styleDate.setDataFormat(classeur.createDataFormat().getFormat("dd/mm/yyyy"));
            var premiere = classeur.createSheet("Janv");
            var r0 = premiere.createRow(0);
            r0.createCell(0).setCellValue("texte");
            r0.createCell(1).setCellValue(3.5);
            r0.createCell(2).setCellValue(true);
            var r1 = premiere.createRow(1);
            var cellDate = r1.createCell(0);
            cellDate.setCellValue(new java.util.GregorianCalendar(2026, 10, 7).getTime());
            cellDate.setCellStyle(styleDate);
            var seconde = classeur.createSheet("Fev");
            seconde.createRow(0).createCell(0).setCellValue("a");
            classeur.write(binaire);
        }
        MockMultipartFile fichier = new MockMultipartFile("file", "source.xls", null, binaire.toByteArray());

        try (org.apache.poi.poifs.filesystem.POIFSFileSystem fs = service.ouvrirXls(fichier)) {
            assertThat(service.compterFeuillesXls(fs)).isEqualTo(2);
            ByteArrayOutputStream sortie = new ByteArrayOutputStream();
            int nombre = service.ecrireXls(fs, new TraitementFeuillesService.Options(List.of("H1"), true, List.of()), sortie);
            assertThat(nombre).isEqualTo(2);

            Map<String, byte[]> entrees = lireZip(sortie.toByteArray());
            assertThat(entrees).containsOnlyKeys("Janv.xlsx", "Fev.xlsx");
            try (XSSFWorkbook p = new XSSFWorkbook(new ByteArrayInputStream(entrees.get("Janv.xlsx")))) {
                var feuille = p.getSheetAt(0);
                assertThat(feuille.getRow(0).getCell(0).getStringCellValue()).isEqualTo("texte");
                assertThat(feuille.getRow(0).getCell(1).getNumericCellValue()).isEqualTo(3.5);
                assertThat(feuille.getRow(0).getCell(2).getBooleanCellValue()).isTrue();
                assertThat(feuille.getRow(1).getCell(0).getDateCellValue())
                        .isEqualTo(new java.util.GregorianCalendar(2026, 10, 7).getTime());
            }
            try (XSSFWorkbook s = new XSSFWorkbook(new ByteArrayInputStream(entrees.get("Fev.xlsx")))) {
                assertThat(s.getSheetAt(0).getRow(0).getCell(0).getStringCellValue()).isEqualTo("H1");
                assertThat(s.getSheetAt(0).getRow(1).getCell(0).getStringCellValue()).isEqualTo("a");
            }
        }
    }

    @Test
    void refuseUnFichierQuiNEstPasUnClasseur() {
        MockMultipartFile fichier = new MockMultipartFile("file", "texte.xlsx", null, "pas un excel".getBytes());
        org.assertj.core.api.Assertions.assertThatThrownBy(() -> service.charger(fichier))
                .isInstanceOf(java.io.IOException.class)
                .hasMessageContaining("Fichier Excel illisible");
    }
}
