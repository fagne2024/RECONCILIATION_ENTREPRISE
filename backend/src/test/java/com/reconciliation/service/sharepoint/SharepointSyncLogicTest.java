package com.reconciliation.service.sharepoint;

import com.reconciliation.entity.SuiviCompenseOpEntity;
import com.reconciliation.service.SuiviCompenseOpImportService;
import com.reconciliation.service.SuiviCompenseOpImportService.ParsedRow;
import com.reconciliation.service.SuiviCompenseOpSaveService;
import org.apache.poi.ss.usermodel.Row;
import org.apache.poi.ss.usermodel.Sheet;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.junit.jupiter.api.Test;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.OffsetDateTime;
import java.time.YearMonth;
import java.time.ZoneOffset;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class SharepointSyncLogicTest {

    // ------------------------------------------------------------ Lien SharePoint

    @Test
    void parseSite_pageEtLienDePartage() {
        SharepointLink.Site page = SharepointLink.parseSite(
                "https://intouchgroup.sharepoint.com/sites/INTRANETTEST/SitePages/OPERATION-SENEGAL.aspx");
        assertThat(page.host()).isEqualTo("intouchgroup.sharepoint.com");
        assertThat(page.sitePath()).isEqualTo("/sites/INTRANETTEST");

        SharepointLink.Site partage = SharepointLink.parseSite(
                "https://intouchgroup.sharepoint.com/:x:/r/sites/INTRANETTEST/_layouts/15/Doc.aspx?sourcedoc=%7B887CF315%7D&file=202611_SN_SUIVI_OPS.xlsx");
        assertThat(partage.sitePath()).isEqualTo("/sites/INTRANETTEST");
    }

    @Test
    void parseSite_refuseLesAutresHotes() {
        assertThatThrownBy(() -> SharepointLink.parseSite("https://exemple.com/sites/X"))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> SharepointLink.parseSite("http://intouchgroup.sharepoint.com/sites/X"))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void latest_retientLeMoisLePlusRecentPuisLaDerniereModification() {
        OffsetDateTime t = OffsetDateTime.of(2026, 11, 1, 8, 0, 0, 0, ZoneOffset.UTC);
        List<SharepointLink.FileItem> files = List.of(
                file("202610_SN_SUIVI_OPS.xlsx", t.plusDays(20)),   // modifié récemment mais mois précédent
                file("202611_SN_SUIVI_OPS.xlsx", t),
                file("202611_SN_SUIVI_OPS.docx", t.plusDays(30)),   // pas un classeur
                file("~$202612_SN_SUIVI_OPS.xlsx", t.plusDays(30)), // fichier de verrou
                file("202612_CI_SUIVI_OPS.xlsx", t.plusDays(30)));  // autre pays
        assertThat(SharepointLink.latest(files, "sn_suivi_ops")).get()
                .extracting(SharepointLink.FileItem::name).isEqualTo("202611_SN_SUIVI_OPS.xlsx");
        assertThat(SharepointLink.monthFromName("202611_SN_SUIVI_OPS.xlsx")).contains(YearMonth.of(2026, 11));
        assertThat(SharepointLink.monthFromName("SUIVI_OPS.xlsx")).isEmpty();
    }

    private static SharepointLink.FileItem file(String name, OffsetDateTime modified) {
        return new SharepointLink.FileItem("d", name, name, modified, null);
    }

    // ------------------------------------------------------------ Curseur

    private static final YearMonth NOV = YearMonth.of(2026, 11);

    private static ParsedRow row(int index, LocalDate date, Double montant, String ref) {
        SuiviCompenseOpEntity e = new SuiviCompenseOpEntity();
        e.setDateOperation(date);
        e.setMontant(montant);
        e.setReference(ref);
        e.setCodeAgence("GRACE");
        return new ParsedRow(index, e);
    }

    @Test
    void select_sansCurseur_chargeLeMoisEtAvanceLeCurseur() {
        List<ParsedRow> rows = List.of(
                row(1, LocalDate.of(2026, 10, 31), 100.0, "R0"),
                row(2, LocalDate.of(2026, 11, 2), 200.0, "R1"),
                row(3, LocalDate.of(2026, 11, 3), 300.0, "R2"));
        SheetCursor.Selection sel = SheetCursor.select(rows, null, null, NOV);
        assertThat(sel.toLoad()).extracting(SuiviCompenseOpEntity::getReference).containsExactly("R1", "R2");
        assertThat(sel.horsMois()).isEqualTo(1);
        assertThat(sel.newCursor()).isEqualTo(3);
        assertThat(sel.newCursorKey()).isEqualTo(SuiviCompenseOpSaveService.dedupKey(rows.get(2).entity()));
    }

    @Test
    void select_reprendApresLaDerniereLigneChargee() {
        List<ParsedRow> rows = List.of(
                row(1, LocalDate.of(2026, 11, 2), 200.0, "R1"),
                row(2, LocalDate.of(2026, 11, 3), 300.0, "R2"),
                row(3, LocalDate.of(2026, 11, 4), 400.0, "R3"));
        String key = SuiviCompenseOpSaveService.dedupKey(rows.get(1).entity());
        SheetCursor.Selection sel = SheetCursor.select(rows, 2, key, NOV);
        assertThat(sel.cursorReset()).isFalse();
        assertThat(sel.toLoad()).extracting(SuiviCompenseOpEntity::getReference).containsExactly("R3");
        assertThat(sel.newCursor()).isEqualTo(3);
    }

    @Test
    void select_derniereLigneDeplacee_relitToutLaFeuille() {
        List<ParsedRow> rows = List.of(
                row(1, LocalDate.of(2026, 11, 1), 50.0, "R-NEW"), // ligne insérée en tête
                row(2, LocalDate.of(2026, 11, 2), 200.0, "R1"),
                row(3, LocalDate.of(2026, 11, 3), 300.0, "R2"));
        ParsedRow ancienneDerniere = row(2, LocalDate.of(2026, 11, 3), 300.0, "R2");
        String key = SuiviCompenseOpSaveService.dedupKey(ancienneDerniere.entity());
        SheetCursor.Selection sel = SheetCursor.select(rows, 2, key, NOV);
        assertThat(sel.cursorReset()).isTrue();
        assertThat(sel.toLoad()).hasSize(3); // les doublons sont ensuite écartés à l'enregistrement
        assertThat(sel.newCursor()).isEqualTo(3);
    }

    @Test
    void select_ligneIncomplete_bloqueLeCurseurMaisChargeLaSuite() {
        List<ParsedRow> rows = List.of(
                row(1, LocalDate.of(2026, 11, 2), 200.0, "R1"),
                row(2, LocalDate.of(2026, 11, 3), null, "R2"), // montant pas encore saisi
                row(3, LocalDate.of(2026, 11, 4), 400.0, "R3"));
        SheetCursor.Selection sel = SheetCursor.select(rows, null, null, NOV);
        assertThat(sel.toLoad()).extracting(SuiviCompenseOpEntity::getReference).containsExactly("R1", "R3");
        assertThat(sel.incompletes()).isEqualTo(1);
        assertThat(sel.newCursor()).isEqualTo(1);
    }

    // ------------------------------------------------------------ Lecture de feuille

    @Test
    void parseSheet_compenseFournisseur_enTeteDecale() throws Exception {
        try (XSSFWorkbook wb = new XSSFWorkbook()) {
            Sheet sh = wb.createSheet("COMPENSE FOURNISSEUR");
            sh.createRow(0).createCell(0).setCellValue("Suivi des compenses fournisseurs");
            Row h = sh.createRow(2);
            String[] headers = {"Code pays", "Date", "Service", "Réseau", "Banque", "Compte bancaire", "Montant", "Référence", "ID TICKET"};
            for (int i = 0; i < headers.length; i++) h.createCell(i).setCellValue(headers[i]);
            Row r = sh.createRow(3);
            r.createCell(0).setCellValue("SN");
            r.createCell(1).setCellValue("05/11/2026");
            r.createCell(2).setCellValue("ORANGE_MONEY");
            r.createCell(3).setCellValue("OM");
            r.createCell(4).setCellValue("CBAO");
            r.createCell(5).setCellValue("SN012");
            r.createCell(6).setCellFormula("1000+500");
            r.createCell(7).setCellValue("OM-051126CP1");
            r.createCell(8).setCellValue(4521);
            wb.getCreationHelper().createFormulaEvaluator().evaluateAll();

            SuiviCompenseOpImportService.SheetParse parse = new SuiviCompenseOpImportService().parseSheet(sh, -1);
            assertThat(parse.headerRowIndex()).isEqualTo(2);
            assertThat(parse.rows()).hasSize(1);
            SuiviCompenseOpEntity e = parse.rows().get(0).entity();
            assertThat(e.getDateOperation()).isEqualTo(LocalDate.of(2026, 11, 5));
            assertThat(e.getService()).isEqualTo("ORANGE_MONEY");
            assertThat(e.getReseau()).isEqualTo("OM");
            assertThat(e.getBanque()).isEqualTo("CBAO");
            assertThat(e.getCompteBancaire()).isEqualTo("SN012");
            assertThat(e.getMontant()).isEqualTo(1500.0);
            assertThat(e.getIdTicket()).isEqualTo("4521");
            assertThat(e.getCodeAgence()).isNull();

            assertThat(SharepointSyncService.findSheet(wb, "Compense fournisseur")).isSameAs(sh);
            assertThat(SharepointSyncService.findSheet(wb, "Compense client")).isNull();
        }
    }

    // ------------------------------------------------------------ Planning

    @Test
    void heures_normaliseesEtTriees() {
        assertThat(SharepointSyncService.normalizeHeures("14h30; 8h, 08:00")).isEqualTo("08:00,14:30");
        assertThatThrownBy(() -> SharepointSyncService.normalizeHeures("25:00"))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> SharepointSyncService.normalizeHeures(" "))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void dueSlot_lanceUneFoisParCreneau() {
        List<LocalTime> heures = List.of(LocalTime.of(8, 0), LocalTime.of(14, 0));
        LocalDateTime now = LocalDateTime.of(2026, 11, 27, 9, 15);
        LocalDateTime slot8 = LocalDateTime.of(2026, 11, 27, 8, 0);
        assertThat(SharepointSyncService.dueSlot(heures, now, null)).isEqualTo(slot8);
        assertThat(SharepointSyncService.dueSlot(heures, now, LocalDateTime.of(2026, 11, 26, 14, 0))).isEqualTo(slot8);
        assertThat(SharepointSyncService.dueSlot(heures, now, LocalDateTime.of(2026, 11, 27, 8, 0, 30))).isNull();
        assertThat(SharepointSyncService.dueSlot(heures, LocalDateTime.of(2026, 11, 27, 7, 59), null)).isNull();
        assertThat(SharepointSyncService.nextSlot(heures, now, LocalDateTime.of(2026, 11, 27, 8, 0, 30)))
                .isEqualTo(LocalDateTime.of(2026, 11, 27, 14, 0));
    }

    // ------------------------------------------------------------ Chiffrement

    @Test
    void secret_chiffreEtDechiffre() {
        SecretCipher cipher = new SecretCipher("une-cle-de-test-suffisamment-longue");
        String enc = cipher.encrypt("s3cr3t~valeur");
        assertThat(enc).startsWith("v1:").doesNotContain("s3cr3t");
        assertThat(cipher.decrypt(enc)).isEqualTo("s3cr3t~valeur");
        assertThatThrownBy(() -> new SecretCipher("autre-cle").decrypt(enc))
                .isInstanceOf(IllegalArgumentException.class);
    }
}
