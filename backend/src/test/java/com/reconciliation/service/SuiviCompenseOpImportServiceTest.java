package com.reconciliation.service;

import com.reconciliation.entity.SuiviCompenseOpEntity;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockMultipartFile;

import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

class SuiviCompenseOpImportServiceTest {

    private final SuiviCompenseOpImportService service = new SuiviCompenseOpImportService();

    @Test
    void parsesTabSeparatedFileWithLongHeaderNames() throws Exception {
        String content = String.join("\n",
                "Date\tCode Agence\tBanque\tCompte bancaire\tMontant\tMode de paiement\tRéférence (Libellé Transactions)\tID TICKET\tService\tRéseau",
                "26/01/2026\tMEETG0010\tORABANK TOGO\t141126000000\t365 000\tVirement\tMEETG001-26012CB1\t2407244851\tTG_SEND_CB_TP2\tBET",
                "02/02/2026\tMTPTG0024\tSITUATION CB MYTP\t\t1 222 981\tRegularisation\tMTPTG002-02022SCB\t2407245756\tTG_SEND_CB_TP4\tHT");
        MockMultipartFile file = new MockMultipartFile("file", "suivi.csv", "text/csv", content.getBytes(StandardCharsets.UTF_8));

        List<SuiviCompenseOpEntity> rows = service.parse(file);

        assertEquals(2, rows.size());
        SuiviCompenseOpEntity first = rows.get(0);
        assertEquals(LocalDate.of(2026, 1, 26), first.getDateOperation());
        assertEquals("MEETG0010", first.getCodeAgence());
        assertEquals("ORABANK TOGO", first.getBanque());
        assertEquals("141126000000", first.getCompteBancaire());
        assertEquals(365000.0, first.getMontant());
        assertEquals("Virement", first.getModePaiement());
        assertEquals("MEETG001-26012CB1", first.getReference());
        assertEquals("2407244851", first.getIdTicket());
        assertEquals("TG_SEND_CB_TP2", first.getService());
        assertEquals("BET", first.getReseau());

        SuiviCompenseOpEntity second = rows.get(1);
        assertNull(second.getCompteBancaire());
        assertEquals(1222981.0, second.getMontant());
        assertEquals("Regularisation", second.getModePaiement());
        assertEquals("TG_SEND_CB_TP4", second.getService());
        assertEquals("HT", second.getReseau());
    }

    @Test
    void findsHeaderBelowTitleLinesAndDetectsSemicolons() throws Exception {
        String content = String.join("\n",
                "Suivi des compenses OP - janvier 2026",
                "",
                "Date;Code agence;Banque;Compte bancaire;Montant;Mode de paiement;Référence;ID ticket;Service;Réseau",
                "15/01/2026;MTPTG0024;SITUATION CB MYTP;;1 224 945;Virement;MTPTG002-15012SCB;;TG_SEND_CB_TP1;HT");
        MockMultipartFile file = new MockMultipartFile("file", "suivi.csv", "text/csv", content.getBytes(StandardCharsets.UTF_8));

        List<SuiviCompenseOpEntity> rows = service.parse(file);

        assertEquals(1, rows.size());
        assertEquals(LocalDate.of(2026, 1, 15), rows.get(0).getDateOperation());
        assertEquals(1224945.0, rows.get(0).getMontant());
        assertEquals("MTPTG002-15012SCB", rows.get(0).getReference());
        assertEquals("TG_SEND_CB_TP1", rows.get(0).getService());
        assertEquals("HT", rows.get(0).getReseau());
    }

    @Test
    void agenceEtServiceSontFacultatifsEtExclusifs() throws Exception {
        String content = String.join("\n",
                "Date;Code agence;Banque;Montant;Référence;Service;Réseau",
                "15/01/2026;MTPTG0024;SITUATION CB MYTP;1 000 000;REF-DIST;;HT",
                "15/01/2026;;UBA ML;2 000 000;REF-FOUR;TG_SEND_CB_TP1;HT");
        MockMultipartFile file = new MockMultipartFile("file", "suivi.csv", "text/csv", content.getBytes(StandardCharsets.UTF_8));

        List<SuiviCompenseOpEntity> rows = service.parse(file);

        assertEquals(2, rows.size());
        // Distributeur : agence renseignée, service vide
        assertEquals("MTPTG0024", rows.get(0).getCodeAgence());
        assertNull(rows.get(0).getService());
        assertEquals("MTPTG0024", SuiviCompenseOpImportService.agenceOuService(rows.get(0)));
        // Fournisseur : service renseigné, agence vide
        assertNull(rows.get(1).getCodeAgence());
        assertEquals("TG_SEND_CB_TP1", rows.get(1).getService());
        assertEquals("TG_SEND_CB_TP1", SuiviCompenseOpImportService.agenceOuService(rows.get(1)));
    }

    @Test
    void importSansColonneAgenceNiService() throws Exception {
        String content = String.join("\n",
                "Date;Banque;Compte bancaire;Montant;Référence",
                "15/01/2026;UBA ML;123;500 000;REF-1");
        MockMultipartFile file = new MockMultipartFile("file", "suivi.csv", "text/csv", content.getBytes(StandardCharsets.UTF_8));

        List<SuiviCompenseOpEntity> rows = service.parse(file);

        assertEquals(1, rows.size());
        assertNull(SuiviCompenseOpImportService.agenceOuService(rows.get(0)));
    }

    @Test
    void rejectsFileWithoutRecognisableHeader() {
        MockMultipartFile file = new MockMultipartFile("file", "x.csv", "text/csv",
                "a;b;c\n1;2;3".getBytes(StandardCharsets.UTF_8));
        assertThrows(IllegalArgumentException.class, () -> service.parse(file));
    }

    @Test
    void generatesFirstReferenceOfTheDayPerType() {
        LocalDate day = LocalDate.of(2026, 11, 6);
        assertEquals("GRACE-061126CP1", SuiviCompenseOpImportService.nextReference("GRACE", day, "COMPENSE", List.of()));
        assertEquals("GRACE-061126AP1", SuiviCompenseOpImportService.nextReference("GRACE", day, "APPRO", null));
        assertEquals("GRACE-061126CB1", SuiviCompenseOpImportService.nextReference(" GRACE ", day, "CROSS_BORDER", List.of()));
    }

    @Test
    void nextReferenceFollowsHighestExistingNumber() {
        LocalDate day = LocalDate.of(2026, 11, 6);
        // Un trou (CP2 supprimée) ne doit pas faire réutiliser un numéro ; CP3X n'est pas une référence générée.
        List<String> existing = List.of("GRACE-061126CP1", "grace-061126cp3", "GRACE-061126CP3X", "GRACE-061126AP9");
        assertEquals("GRACE-061126CP4", SuiviCompenseOpImportService.nextReference("GRACE", day, "COMPENSE", existing));
    }

    @Test
    void lesDatesSontLuesSousToutesLeursFormes() {
        LocalDate d = LocalDate.of(2026, 11, 18);
        assertEquals(d, SuiviCompenseOpImportService.parseDate("18/11/2026"));
        assertEquals(d, SuiviCompenseOpImportService.parseDate(" 18/11/2026 00:00:00 "));
        assertEquals(d, SuiviCompenseOpImportService.parseDate("18-11-26"));
        assertEquals(d, SuiviCompenseOpImportService.parseDate("18.11.2026"));
        assertEquals(LocalDate.of(2026, 11, 8), SuiviCompenseOpImportService.parseDate("8/11/2026"));
        assertEquals(d, SuiviCompenseOpImportService.parseDate("2026-11-18T00:00:00"));
        assertEquals(d, SuiviCompenseOpImportService.parseDate("20261118"));
        // Numéro de série Excel (date exportée sans format date)
        assertEquals(d, SuiviCompenseOpImportService.parseDate("46344"));
        assertEquals(d, SuiviCompenseOpImportService.parseDate("46344.0"));
        assertNull(SuiviCompenseOpImportService.parseDate("31/02/2026"));
        assertNull(SuiviCompenseOpImportService.parseDate("Virement"));
        assertNull(SuiviCompenseOpImportService.parseDate(""));
    }

    @Test
    void dateExcelNumeriqueSansFormatDate() throws Exception {
        // Fichier produit par le traitement automatique : la date est un nombre sans format date
        try (var wb = new org.apache.poi.xssf.usermodel.XSSFWorkbook()) {
            var sheet = wb.createSheet("Suivi");
            var h = sheet.createRow(0);
            String[] headers = {"Date", "Code agence", "Banque", "Montant", "Référence"};
            for (int i = 0; i < headers.length; i++) h.createCell(i).setCellValue(headers[i]);
            var r = sheet.createRow(1);
            r.createCell(0).setCellValue(46344d);
            r.createCell(1).setCellValue("CPCA27196");
            r.createCell(2).setCellValue("ECOBANK OPS");
            r.createCell(3).setCellValue(2971358d);
            r.createCell(4).setCellValue("CPCA2719-181126CP1");
            var bos = new java.io.ByteArrayOutputStream();
            wb.write(bos);
            MockMultipartFile file = new MockMultipartFile("file", "suivi.xlsx",
                    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", bos.toByteArray());

            List<SuiviCompenseOpEntity> rows = service.parse(file);

            assertEquals(1, rows.size());
            assertEquals(LocalDate.of(2026, 11, 18), rows.get(0).getDateOperation());
        }
    }

    @Test
    void fichierDuSuiviAvecEspacesEnFinDeValeur() throws Exception {
        String content = String.join("\n",
                "Date\tCode agence\tBanque\tCompte bancaire\tMontant\tMode de paiement\tRéférence\tID ticket\tService\tRéseau",
                "18/11/2026\tCPCA27196 \tECOBANK OPS\t1,0035E+11\t2 971 358\tVirement \tCPCA2719-181126CP1\tODMD1126429399\t\t");
        MockMultipartFile file = new MockMultipartFile("file", "suivi.txt", "text/plain", content.getBytes(StandardCharsets.UTF_8));

        List<SuiviCompenseOpEntity> rows = service.parse(file);

        assertEquals(1, rows.size());
        assertEquals(LocalDate.of(2026, 11, 18), rows.get(0).getDateOperation());
        assertEquals(2971358.0, rows.get(0).getMontant());
    }
}
