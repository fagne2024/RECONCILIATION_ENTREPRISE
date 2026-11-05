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
    void rejectsFileWithoutRecognisableHeader() {
        MockMultipartFile file = new MockMultipartFile("file", "x.csv", "text/csv",
                "a;b;c\n1;2;3".getBytes(StandardCharsets.UTF_8));
        assertThrows(IllegalArgumentException.class, () -> service.parse(file));
    }
}
