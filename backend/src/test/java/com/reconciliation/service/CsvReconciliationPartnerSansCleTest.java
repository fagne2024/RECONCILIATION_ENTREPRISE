package com.reconciliation.service;

import com.reconciliation.dto.ReconciliationRequest;
import com.reconciliation.dto.ReconciliationResponse;
import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;

/**
 * Lignes partenaire dont la clé est vide (ex. Wave api_payout sans « ID PARTENAIRE PM ») :
 * elles ne peuvent pas être rapprochées mais ne doivent jamais disparaître du résultat.
 */
class CsvReconciliationPartnerSansCleTest {

    private final CsvReconciliationService service = new CsvReconciliationService(
            mock(ConfigurableReconciliationService.class),
            mock(ColumnProcessingService.class),
            mock(ReconciliationProgressService.class));

    private static Map<String, String> ligne(String cle, String service, String montant) {
        Map<String, String> m = new LinkedHashMap<>();
        m.put("CLE", cle);
        m.put("SERVICE", service);
        m.put("Montant", montant);
        return m;
    }

    private ReconciliationRequest requete(String type) {
        List<Map<String, String>> bo = new ArrayList<>();
        bo.add(ligne("cos-1", "api_checkout", "100"));
        bo.add(ligne("cos-2", "api_checkout", "200"));

        List<Map<String, String>> partenaire = new ArrayList<>();
        partenaire.add(ligne("cos-1", "api_checkout", "100"));
        partenaire.add(ligne("cos-2", "api_checkout", "200"));
        partenaire.add(ligne("", "api_payout", "-300"));
        partenaire.add(ligne("  ", "api_payout", "-400"));
        partenaire.add(ligne(null, "api_payout", "-500"));

        ReconciliationRequest r = new ReconciliationRequest();
        r.setBoFileContent(bo);
        r.setPartnerFileContent(partenaire);
        r.setBoKeyColumn("CLE");
        r.setPartnerKeyColumn("CLE");
        r.setComparisonColumns(List.of());
        r.setReconciliationType(type);
        return r;
    }

    @Test
    void standard_lignesSansCleEnUniquementPartenaire() {
        ReconciliationResponse res = service.reconcile(requete("1-1"));

        assertThat(res.getMatches()).hasSize(2);
        assertThat(res.getPartnerOnly()).hasSize(3)
                .allSatisfy(l -> assertThat(l.get("SERVICE")).isEqualTo("api_payout"));
        assertThat(res.getTotalPartnerOnly()).isEqualTo(3);
        assertThat(res.getTotalMatches() + res.getTotalPartnerOnly()).isEqualTo(res.getTotalPartnerRecords());
    }

    @Test
    void ratioParametrable_lignesSansCleEnUniquementPartenaire() {
        ReconciliationResponse res = service.reconcile(requete("1-2"));

        assertThat(res.getPartnerOnly())
                .filteredOn(l -> "api_payout".equals(l.get("SERVICE")))
                .hasSize(3);
    }
}
