package com.reconciliation.service.reconciliation;

import com.reconciliation.dto.ReconciliationRequest;
import com.reconciliation.dto.ReconciliationResponse;
import com.reconciliation.service.ConfigurableReconciliationService;
import com.reconciliation.service.TrxboOppartConfig;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class SpecialRatioReconciliationServiceTest {

    private static final String KEY = "1767049337475";

    private final SpecialRatioReconciliationService service = buildService(TrxboOppartConfig.defaults());

    private static SpecialRatioReconciliationService buildService(TrxboOppartConfig trxboOppartConfig) {
        ConfigurableReconciliationService configurableService = mock(ConfigurableReconciliationService.class);
        when(configurableService.getCorrespondenceRules(org.mockito.ArgumentMatchers.any()))
                .thenReturn(new ArrayList<>());
        when(configurableService.getConfiguredReconciliationType(org.mockito.ArgumentMatchers.any()))
                .thenReturn(null);
        when(configurableService.getTrxboOppartConfig(org.mockito.ArgumentMatchers.any()))
                .thenReturn(trxboOppartConfig);
        return new SpecialRatioReconciliationService(configurableService);
    }

    private static Map<String, String> partner(String type) {
        Map<String, String> record = new LinkedHashMap<>();
        record.put("numeroTransGU", KEY);
        record.put("Type", type);
        record.put("Montant", "1000");
        return record;
    }

    private static List<Map<String, String>> group(String... types) {
        List<Map<String, String>> records = new ArrayList<>();
        for (String type : types) {
            records.add(partner(type));
        }
        return records;
    }

    private ReconciliationResponse runRatio(List<Map<String, String>> partnerRows, String reconciliationType) {
        return runRatioWith(service, partnerRows, reconciliationType);
    }

    private ReconciliationResponse runRatioWith(SpecialRatioReconciliationService targetService,
                                               List<Map<String, String>> partnerRows,
                                               String reconciliationType) {
        Map<String, String> boRecord = new LinkedHashMap<>();
        boRecord.put("numeroTransGU", KEY);
        boRecord.put("montant", "1000");

        ReconciliationRequest request = new ReconciliationRequest();
        request.setBoKeyColumn("numeroTransGU");
        request.setPartnerKeyColumn("numeroTransGU");
        request.setReconciliationType(reconciliationType);
        List<Map<String, String>> boContent = new ArrayList<>();
        boContent.add(boRecord);
        request.setBoFileContent(boContent);
        request.setPartnerFileContent(new ArrayList<>(partnerRows));
        return targetService.reconcile(request, System.currentTimeMillis());
    }

    private String commentOf(Map<String, String> record) {
        return record.get("Commentaire");
    }

    private void assertCommentaire(List<Map<String, String>> records, String expected) {
        for (Map<String, String> record : records) {
            assertEquals(expected, commentOf(record));
        }
    }

    @Test
    @DisplayName("Ratio 1:2 - deux opérations : correspondance")
    void twoPartnerRowsForRatioTwo() {
        ReconciliationResponse response = runRatio(group("IMPACT_COMPTE_GENERAL", "FRAIS_TRANSACTION"), "1-2");
        assertEquals(1, response.getMatches().size());
        assertEquals(0, response.getBoOnly().size());
        assertEquals(0, response.getPartnerOnly().size());
    }

    @Test
    @DisplayName("Ratio 1:2 - une seule IMPACT_COMPTE_GENERAL : TRXSF des deux côtés")
    void singleImpactForRatioTwo() {
        ReconciliationResponse response = runRatio(group("IMPACT_COMPTE_GENERAL"), "1-2");
        assertEquals(0, response.getMatches().size());
        assertCommentaire(response.getBoOnly(), "TRXSF");
        assertCommentaire(response.getPartnerOnly(), "TRXSF");
    }

    @Test
    @DisplayName("Ratio 1:2 - une seule FRAIS_TRANSACTION : RGFRAIS côté partenaire")
    void singleFraisForRatioTwo() {
        ReconciliationResponse response = runRatio(group("FRAIS_TRANSACTION"), "1-2");
        assertEquals(0, response.getMatches().size());
        assertEquals(1, response.getBoOnly().size());
        assertNull(response.getBoOnly().get(0).get("Commentaire"));
        assertCommentaire(response.getPartnerOnly(), "RGFRAIS");
    }

    @Test
    @DisplayName("Aucune opération partenaire : TSOP côté BO")
    void noPartnerRow() {
        ReconciliationResponse response = runRatio(new ArrayList<>(), "1-2");
        assertEquals(1, response.getBoOnly().size());
        assertCommentaire(response.getBoOnly(), "TSOP");
    }

    @Test
    @DisplayName("Ratio 1:3 - trio complet IMPACT + FRAIS + VERSEMENT_COMMISSION : correspondance sans commentaire")
    void completeCommissionGroupForRatioThree() {
        ReconciliationResponse response = runRatio(
                group("IMPACT_COMPTE_GENERAL", "FRAIS_TRANSACTION", "VERSEMENT_COMMISSION"), "1-3");
        assertEquals(1, response.getMatches().size());
        assertEquals(0, response.getBoOnly().size());
        assertEquals(0, response.getPartnerOnly().size());
    }

    @Test
    @DisplayName("Ratio 1:3 - IMPACT_COMPTE_GENERAL seule : TRXSF & TRXSVC sur le BO et sur le partenaire")
    void singleImpactForRatioThree() {
        ReconciliationResponse response = runRatio(group("IMPACT_COMPTE_GENERAL"), "1-3");
        assertEquals(0, response.getMatches().size());
        assertEquals(1, response.getBoOnly().size());
        assertCommentaire(response.getBoOnly(), "TRXSF & TRXSVC");
        assertEquals(1, response.getPartnerOnly().size());
        assertCommentaire(response.getPartnerOnly(), "TRXSF & TRXSVC");
    }

    @Test
    @DisplayName("Ratio 1:3 - IMPACT + VERSEMENT_COMMISSION : TRXSF des deux côtés")
    void impactAndCommissionForRatioThree() {
        ReconciliationResponse response = runRatio(group("IMPACT_COMPTE_GENERAL", "VERSEMENT_COMMISSION"), "1-3");
        assertEquals(0, response.getMatches().size());
        assertCommentaire(response.getBoOnly(), "TRXSF");
        assertEquals(2, response.getPartnerOnly().size());
        assertCommentaire(response.getPartnerOnly(), "TRXSF");
    }

    @Test
    @DisplayName("Ratio 1:3 - IMPACT + FRAIS_TRANSACTION : TRXSC des deux côtés")
    void impactAndFraisForRatioThree() {
        ReconciliationResponse response = runRatio(group("IMPACT_COMPTE_GENERAL", "FRAIS_TRANSACTION"), "1-3");
        assertEquals(0, response.getMatches().size());
        assertCommentaire(response.getBoOnly(), "TRXSC");
        assertEquals(2, response.getPartnerOnly().size());
        assertCommentaire(response.getPartnerOnly(), "TRXSC");
    }

    @Test
    @DisplayName("Ratio 1:3 - commission sans IMPACT : REGCOM côté partenaire uniquement")
    void commissionWithoutImpactForRatioThree() {
        ReconciliationResponse response = runRatio(group("VERSEMENT_COMMISSION", "VERSEMENT_COMMISSION"), "1-3");
        assertEquals(0, response.getMatches().size());
        assertEquals(1, response.getBoOnly().size());
        assertNull(response.getBoOnly().get(0).get("Commentaire"));
        assertEquals(2, response.getPartnerOnly().size());
        assertCommentaire(response.getPartnerOnly(), "REGCOM");
    }

    @Test
    @DisplayName("Frais sans IMPACT : BO Ecart et RGFRAIS côté partenaire, quel que soit le nombre de lignes")
    void feesWithoutImpactAlwaysRgFrais() {
        for (List<Map<String, String>> rows : java.util.Arrays.asList(
                group("FRAIS_TRANSACTION"),
                group("FRAIS_TRANSACTION", "FRAIS_TRANSACTION"))) {
            ReconciliationResponse response = runRatio(rows, "1-3");
            assertEquals(0, response.getMatches().size());
            assertEquals(1, response.getBoOnly().size());
            assertNull(response.getBoOnly().get(0).get("Commentaire"));
            assertCommentaire(response.getPartnerOnly(), "RGFRAIS");
        }
    }

    @Test
    @DisplayName("Frais et commission sans IMPACT : RGFRAIS & REGCOM des deux côtés")
    void feesAndCommissionWithoutImpactCombinedComment() {
        ReconciliationResponse response = runRatio(group("FRAIS_TRANSACTION", "VERSEMENT_COMMISSION"), "1-3");
        assertEquals(0, response.getMismatches().size());
        assertCommentaire(response.getBoOnly(), "RGFRAIS & REGCOM");
        assertCommentaire(response.getPartnerOnly(), "RGFRAIS & REGCOM");
    }

    @Test
    @DisplayName("Lignes partenaire sans aucune BO : toujours le commentaire Ecart")
    void partnerWithoutBoIsAlwaysEcart() {
        Map<String, String> orphanFrais = partner("FRAIS_TRANSACTION");
        orphanFrais.put("numeroTransGU", "INCONNU");
        List<Map<String, String>> partnerContent = new ArrayList<>();
        partnerContent.add(orphanFrais);

        Map<String, String> boRecord = new LinkedHashMap<>();
        boRecord.put("numeroTransGU", KEY);
        boRecord.put("montant", "1000");
        List<Map<String, String>> boContent = new ArrayList<>();
        boContent.add(boRecord);

        ReconciliationRequest request = new ReconciliationRequest();
        request.setBoKeyColumn("numeroTransGU");
        request.setPartnerKeyColumn("numeroTransGU");
        request.setReconciliationType("1-3");
        request.setBoFileContent(boContent);
        request.setPartnerFileContent(partnerContent);

        ReconciliationResponse response = service.reconcile(request, System.currentTimeMillis());
        assertEquals(1, response.getPartnerOnly().size());
        assertEquals("Ecart", response.getPartnerOnly().get(0).get("Commentaire"));
    }

    @Test
    @DisplayName("Configuration modèle - libellés d'opérations et commentaires personnalisés")
    void modelConfigurationPrimesOverCodeDefaults() {
        TrxboOppartConfig customConfig = TrxboOppartConfig.defaults();
        customConfig.setImpactType("CREDIT_TPE");
        customConfig.setFeesType("COMMISSION_DEBIT");
        customConfig.setCommissionType("VIREMENT_PARTENAIRE");
        customConfig.setCommentTrxsf("A_TRXSF");
        customConfig.setCommentTrxsvc("B_TRXSVC");
        customConfig.setCommentFraisSansCommission("D_FRAIS_SANS_COMMISSION");
        customConfig.setCommentFraisEtCommission("E_FRAIS_ET_COMMISSION");
        customConfig.setCommentTrxsfTrxsvc("A_TRXSF + B_TRXSVC");
        customConfig.setCommentTsop("Z_TSOP");
        customConfig.setCommentEcart("Z_ECART");
        customConfig.setCommentRgfrais("C_RGFRAIS");
        customConfig.setCommentPartnerOnly("Z_PARTNER_ONLY");
        SpecialRatioReconciliationService customService = buildService(customConfig);

        ReconciliationResponse impactOnly = runRatioWith(customService, group("CREDIT_TPE"), "1-3");
        assertEquals(0, impactOnly.getMatches().size());
        assertCommentaire(impactOnly.getBoOnly(), "A_TRXSF + B_TRXSVC");
        assertCommentaire(impactOnly.getPartnerOnly(), "A_TRXSF + B_TRXSVC");

        ReconciliationResponse impactAndCommission = runRatioWith(customService, group("CREDIT_TPE", "VIREMENT_PARTENAIRE"), "1-3");
        assertCommentaire(impactAndCommission.getBoOnly(), "A_TRXSF");
        assertCommentaire(impactAndCommission.getPartnerOnly(), "A_TRXSF");

        ReconciliationResponse impactAndFees = runRatioWith(customService, group("CREDIT_TPE", "COMMISSION_DEBIT"), "1-3");
        assertCommentaire(impactAndFees.getBoOnly(), "D_FRAIS_SANS_COMMISSION");
        assertCommentaire(impactAndFees.getPartnerOnly(), "D_FRAIS_SANS_COMMISSION");

        ReconciliationResponse feesAndCommission = runRatioWith(customService, group("COMMISSION_DEBIT", "VIREMENT_PARTENAIRE"), "1-3");
        assertCommentaire(feesAndCommission.getBoOnly(), "E_FRAIS_ET_COMMISSION");
        assertCommentaire(feesAndCommission.getPartnerOnly(), "E_FRAIS_ET_COMMISSION");

        ReconciliationResponse feesOnly = runRatioWith(customService, group("COMMISSION_DEBIT"), "1-2");
        assertEquals(1, feesOnly.getBoOnly().size());
        assertNull(feesOnly.getBoOnly().get(0).get("Commentaire"));
        assertCommentaire(feesOnly.getPartnerOnly(), "C_RGFRAIS");

        ReconciliationResponse noPartner = runRatioWith(customService, new ArrayList<>(), "1-3");
        assertCommentaire(noPartner.getBoOnly(), "Z_TSOP");

        List<Map<String, String>> orphanRows = new ArrayList<>();
        Map<String, String> orphan = partner("COMMISSION_DEBIT");
        orphan.put("numeroTransGU", "INCONNU");
        orphanRows.add(orphan);
        ReconciliationResponse orphanResponse = runRatioWith(customService, orphanRows, "1-3");
        assertEquals(1, orphanResponse.getPartnerOnly().size());
        assertCommentaire(orphanResponse.getPartnerOnly(), "Z_PARTNER_ONLY");
    }

    @Test
    @DisplayName("Types d'opération supplémentaires : commentaires propres, dans l'ordre de déclaration")
    void additionalOperationTypes() {
        TrxboOppartConfig config = TrxboOppartConfig.defaults();
        config.addAdditionalOperationType(new TrxboOppartConfig.AdditionalOperationType("TRANSFERT_PARTENAIRE", "", "TRXTRF"));
        config.addAdditionalOperationType(new TrxboOppartConfig.AdditionalOperationType("PRELEVEMENT", "F_PRELEVEMENT", ""));
        SpecialRatioReconciliationService additionalService = buildService(config);

        ReconciliationResponse transfert = runRatioWith(additionalService, group("TRANSFERT_PARTENAIRE"), "1-3");
        assertEquals(0, transfert.getMatches().size());
        assertEquals(1, transfert.getBoOnly().size());
        assertNull(transfert.getBoOnly().get(0).get("Commentaire"));
        assertCommentaire(transfert.getPartnerOnly(), "TRXTRF");

        ReconciliationResponse prelevement = runRatioWith(additionalService, group("PRELEVEMENT", "PRELEVEMENT"), "1-3");
        assertEquals(0, prelevement.getMatches().size());
        assertCommentaire(prelevement.getBoOnly(), "F_PRELEVEMENT");
        assertEquals(2, prelevement.getPartnerOnly().size());
        assertNull(prelevement.getPartnerOnly().get(0).get("Commentaire"));

        // Un type supplémentaire ne s'applique pas si le groupe contient un des trois types principaux
        ReconciliationResponse transfertAndImpact = runRatioWith(additionalService, group("TRANSFERT_PARTENAIRE", "IMPACT_COMPTE_GENERAL"), "1-3");
        assertCommentaire(transfertAndImpact.getBoOnly(), "TRXSF & TRXSVC");

        // Sans déclaration correspondante, on retombe sur le comportement historique
        ReconciliationResponse inconnu = runRatioWith(additionalService, group("TYPE_INCONNU"), "1-3");
        assertCommentaire(inconnu.getBoOnly(), "TRXSF");
        assertCommentaire(inconnu.getPartnerOnly(), "TRXSF");

        assertEquals("MARK_AS_ADDITIONAL_OPERATION_TYPE", additionalService.determineTRXBOAction(
                group("TRANSFERT_PARTENAIRE"), 1, 3, config));
    }

    @Test
    @DisplayName("Types d'opération supplémentaires : lecture et écriture dans la configuration")
    void additionalOperationTypesConfiguration() {
        TrxboOppartConfig config = new TrxboOppartConfig();
        config.addAdditionalOperationType(new TrxboOppartConfig.AdditionalOperationType("VIREMENT", "A_BO", "A_PARTNER"));

        Map<String, Object> serialized = config.toMap();
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> rawTypes = (List<Map<String, Object>>) serialized.get("additionalOperationTypes");
        assertEquals(1, rawTypes.size());
        assertEquals("VIREMENT", rawTypes.get(0).get("label"));
        assertEquals("A_BO", rawTypes.get(0).get("commentBo"));
        assertEquals("A_PARTNER", rawTypes.get(0).get("commentPartner"));

        TrxboOppartConfig reloaded = TrxboOppartConfig.fromMap(serialized);
        assertEquals(1, reloaded.getAdditionalOperationTypes().size());
        assertEquals("VIREMENT", reloaded.getAdditionalOperationTypes().get(0).getLabel());
        assertEquals("A_BO", reloaded.getAdditionalOperationTypes().get(0).getCommentBo());
        assertEquals("A_PARTNER", reloaded.getAdditionalOperationTypes().get(0).getCommentPartner());
        assertTrue(reloaded.isCustomized());

        TrxboOppartConfig withoutTypes = TrxboOppartConfig.fromMap(new HashMap<String, Object>());
        assertTrue(withoutTypes.getAdditionalOperationTypes().isEmpty());
        assertFalse(withoutTypes.toMap().containsKey("additionalOperationTypes"));
    }

    @Test
    @DisplayName("Classification - actions attendues sur le ratio effectif")
    void classificationActions() {
        assertEquals("MARK_AS_MATCH", service.determineTRXBOAction(
                group("IMPACT_COMPTE_GENERAL", "FRAIS_TRANSACTION", "VERSEMENT_COMMISSION"), 3, 3, TrxboOppartConfig.defaults()));
        assertEquals("MARK_AS_MISMATCH_TRXSF_TRXSVC", service.determineTRXBOAction(group("IMPACT_COMPTE_GENERAL"), 1, 3, TrxboOppartConfig.defaults()));
        assertEquals("MARK_AS_MISMATCH_TRXSF", service.determineTRXBOAction(
                group("IMPACT_COMPTE_GENERAL", "VERSEMENT_COMMISSION"), 2, 3, TrxboOppartConfig.defaults()));
        assertEquals("MARK_AS_MISMATCH_FRAIS_SANS_COMMISSION", service.determineTRXBOAction(
                group("IMPACT_COMPTE_GENERAL", "FRAIS_TRANSACTION"), 2, 3, TrxboOppartConfig.defaults()));
        assertEquals("MARK_AS_MISMATCH_FRAIS_ET_COMMISSION", service.determineTRXBOAction(
                group("VERSEMENT_COMMISSION", "FRAIS_TRANSACTION"), 2, 3, TrxboOppartConfig.defaults()));
        assertEquals("MARK_AS_PARTNER_ONLY_REGCOM", service.determineTRXBOAction(
                group("VERSEMENT_COMMISSION"), 1, 2, TrxboOppartConfig.defaults()));
        assertEquals("MARK_AS_PARTNER_ONLY_RGFRAIS", service.determineTRXBOAction(
                group("FRAIS_TRANSACTION", "FRAIS_TRANSACTION"), 2, 3, TrxboOppartConfig.defaults()));
        assertEquals("MARK_AS_MISMATCH_TRXSF", service.determineTRXBOAction(group("IMPACT_COMPTE_GENERAL"), 1, 2, TrxboOppartConfig.defaults()));
        assertEquals("MARK_AS_PARTNER_ONLY_RGFRAIS", service.determineTRXBOAction(group("FRAIS_TRANSACTION"), 1, 2, TrxboOppartConfig.defaults()));
        assertEquals("MARK_AS_BO_ONLY_TSOP", service.determineTRXBOAction(new ArrayList<>(), 0, 3, TrxboOppartConfig.defaults()));
        assertEquals("MARK_AS_MISMATCH_TRXSF_TRXSVC", service.determineTRXBOAction(
                group("IMPACT_COMPTE_GENERAL", "IMPACT_COMPTE_GENERAL"), 2, 3, TrxboOppartConfig.defaults()));
        assertEquals("MARK_AS_MATCH", service.determineTRXBOAction(
                group("IMPACT_COMPTE_GENERAL", "FRAIS_TRANSACTION", "VERSEMENT_COMMISSION", "IMPACT_COMPTE_GENERAL"), 4, 4, TrxboOppartConfig.defaults()));
    }
}
