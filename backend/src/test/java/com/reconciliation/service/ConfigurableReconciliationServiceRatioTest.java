package com.reconciliation.service;

import com.reconciliation.dto.ReconciliationRequest;
import com.reconciliation.entity.AutoProcessingModel;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class ConfigurableReconciliationServiceRatioTest {

    private ConfigurableReconciliationService serviceWithRatio(String expectedRatio) {
        AutoProcessingService autoProcessingService = mock(AutoProcessingService.class);
        ColumnProcessingRuleService columnProcessingRuleService = mock(ColumnProcessingRuleService.class);

        AutoProcessingModel model = new AutoProcessingModel();
        model.setModelId("mod_oppart");
        model.setName("Modèle OPPART");
        model.setFileType(AutoProcessingModel.FileType.PARTNER);
        model.setFilePattern("*OPPART*.csv");
        model.setTemplateFile("OPPART.xls");

        Map<String, Object> parameters = new HashMap<>();
        parameters.put("expectedRatio", expectedRatio);
        parameters.put("tolerance", 0);
        Map<String, Object> reconciliationLogic = new HashMap<>();
        reconciliationLogic.put("type", "SPECIAL_RATIO");
        reconciliationLogic.put("parameters", parameters);
        model.setReconciliationLogic(reconciliationLogic);

        when(autoProcessingService.getAllModels()).thenReturn(new ArrayList<>(Collections.singletonList(model)));
        when(columnProcessingRuleService.getRulesByModelId(anyString())).thenReturn(new ArrayList<>());

        return new ConfigurableReconciliationService(autoProcessingService, columnProcessingRuleService);
    }

    private ReconciliationRequest oppartRequest() {
        Map<String, String> partnerRecord = new LinkedHashMap<>();
        partnerRecord.put("numeroTransGU", "1767049337475");
        partnerRecord.put("Agence", "CELCM0001");
        partnerRecord.put("Type", "IMPACT_COMPTE_GENERAL");
        partnerRecord.put("Montant", "226000");

        Map<String, String> boRecord = new LinkedHashMap<>();
        boRecord.put("numeroTransGU", "1767049337475");
        boRecord.put("montant", "226000");

        ReconciliationRequest request = new ReconciliationRequest();
        List<Map<String, String>> partnerContent = new ArrayList<>();
        partnerContent.add(partnerRecord);
        request.setPartnerFileContent(partnerContent);
        List<Map<String, String>> boContent = new ArrayList<>();
        boContent.add(boRecord);
        request.setBoFileContent(boContent);
        return request;
    }

    @Test
    @DisplayName("Ratio configuré 1:3 sur un modèle OPPART détecté par colonnes")
    void configuredRatioIsReadFromModel() {
        assertEquals("1-3", serviceWithRatio("1:3").getConfiguredReconciliationType(oppartRequest()));
    }

    @Test
    @DisplayName("Ratio configuré 1:2 sur un modèle STANDARD")
    void configuredRatioOnStandardModel() {
        assertEquals("1-2", serviceWithRatio("1:2").getConfiguredReconciliationType(oppartRequest()));
    }

    @Test
    @DisplayName("Ratio 1:1 : aucun ratio paramétrable à appliquer")
    void standardRatioIsNotParametric() {
        assertEquals("1-1", serviceWithRatio("1:1").getConfiguredReconciliationType(oppartRequest()));
    }

    @Test
    @DisplayName("Ratio non supporté (2:1) : ignoré avec avertissement")
    void unsupportedRatioIsIgnored() {
        assertNull(serviceWithRatio("2:1").getConfiguredReconciliationType(oppartRequest()));
    }

    @Test
    @DisplayName("Ratio configuré 1:3 : la logique paramétrique prime sur la détection TRXBO/OPPART")
    void configuredRatioDrivesLogicType() {
        ReconciliationRequest request = oppartRequest();
        assertEquals(
                ConfigurableReconciliationService.ReconciliationLogicType.SPECIAL_RATIO,
                serviceWithRatio("1:3").determineReconciliationLogic(request));
    }
}
