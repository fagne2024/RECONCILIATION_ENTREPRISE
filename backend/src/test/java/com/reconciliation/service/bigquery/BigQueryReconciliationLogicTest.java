package com.reconciliation.service.bigquery;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.reconciliation.entity.BigQueryQueryEntity;
import org.apache.poi.ss.usermodel.Row;
import org.apache.poi.ss.usermodel.Sheet;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.junit.jupiter.api.Test;

import java.io.StringWriter;
import java.time.LocalDate;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class BigQueryReconciliationLogicTest {

    @Test
    void requete_lectureSeule() {
        assertThatCode(() -> BigQueryReconciliationService.checkReadOnly(
                "-- transactions de la veille\nSELECT * FROM `p.d.t` WHERE DATE(created) = @date;"))
                .doesNotThrowAnyException();
        assertThatCode(() -> BigQueryReconciliationService.checkReadOnly("/* cte */ WITH x AS (SELECT 1) SELECT * FROM x"))
                .doesNotThrowAnyException();
        assertThatThrownBy(() -> BigQueryReconciliationService.checkReadOnly("DELETE FROM `p.d.t` WHERE true"))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> BigQueryReconciliationService.checkReadOnly("SELECT 1; DROP TABLE `p.d.t`"))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void nomDuFichierBo_reconnuParLeModele() {
        BigQueryQueryEntity q = new BigQueryQueryEntity();
        q.setBoFilePrefix("TRXBO");
        assertThat(BigQueryReconciliationService.fileName(q, LocalDate.of(2026, 11, 26))).isEqualTo("TRXBO_BQ_20261126.csv");
    }

    @Test
    void csv_sansSeparateurNiRetourDansLesValeurs() throws Exception {
        StringWriter out = new StringWriter();
        BigQueryReconciliationService.CsvSink sink = new BigQueryReconciliationService.CsvSink(out);
        sink.header(List.of("ID", "Libellé"));
        sink.row(List.of("1", "Paiement; \"marchand\"\nligne 2"));
        assertThat(out.toString()).isEqualTo("ID;Libellé\n1;Paiement   marchand  ligne 2\n");
    }

    @Test
    void conversionDesValeursBigQuery() throws Exception {
        JsonNode cells = new ObjectMapper().readTree(
                "[{\"v\":\"1764151200000000\"},{\"v\":\"2026-11-26T10:00:00\"},{\"v\":null},{\"v\":\"12.5\"},{\"v\":[{\"v\":\"a\"}]}]");
        List<String> values = BigQueryClient.convert(cells, List.of("TIMESTAMP", "DATETIME", "STRING", "NUMERIC", "REPEATED"));
        assertThat(values).containsExactly("2025-11-26 10:00:00", "2026-11-26 10:00:00", "", "12.5", "[{\"v\":\"a\"}]");
    }

    @Test
    void cleDeCompteDeService_controlee() {
        BigQueryClient client = new BigQueryClient();
        String json = "{\"type\":\"service_account\",\"project_id\":\"mon-projet\",\"private_key_id\":\"k1\","
                + "\"private_key\":\"-----BEGIN PRIVATE KEY-----\\nAAAA\\n-----END PRIVATE KEY-----\\n\","
                + "\"client_email\":\"reco@mon-projet.iam.gserviceaccount.com\",\"token_uri\":\"https://oauth2.googleapis.com/token\"}";
        BigQueryClient.ServiceAccount sa = client.parseServiceAccount(json);
        assertThat(sa.clientEmail()).isEqualTo("reco@mon-projet.iam.gserviceaccount.com");
        assertThat(sa.projectId()).isEqualTo("mon-projet");
        assertThatThrownBy(() -> client.parseServiceAccount("{\"type\":\"authorized_user\"}"))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> client.parseServiceAccount(json.replace("https://oauth2.googleapis.com/token", "https://exemple.com/t")))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void fichierPartenaireExcel_convertiEnCsv() throws Exception {
        try (XSSFWorkbook wb = new XSSFWorkbook()) {
            Sheet sh = wb.createSheet("Data");
            Row h = sh.createRow(0);
            h.createCell(0).setCellValue("Reference");
            h.createCell(1).setCellValue("Montant");
            Row r = sh.createRow(1);
            r.createCell(0).setCellValue("TX;1");
            r.createCell(1).setCellValue(1500);
            sh.createRow(2); // ligne vide ignorée
            assertThat(BigQueryReconciliationService.sheetToCsv(wb)).isEqualTo("Reference;Montant\nTX 1;1500\n");
        }
    }
}
