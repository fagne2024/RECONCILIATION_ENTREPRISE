package com.reconciliation.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.reconciliation.entity.CalculationRuleEntity;
import com.reconciliation.repository.CalculationRuleRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

import java.util.List;
import java.util.Map;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/**
 * Priorité des règles de calcul configurées (Configuration &gt; Calcul)
 * sur les valeurs par défaut codées en dur dans les moteurs de calcul.
 *
 * <p>Règle configurée et active => elle s'applique.
 * Règle absente ou désactivée => le code conserve sa valeur par défaut.</p>
 */
class CalculationRuleServicePrioriteTest {

    private CalculationRuleRepository repository;
    private CalculationRuleService service;

    @BeforeEach
    void setUp() {
        repository = mock(CalculationRuleRepository.class);
        service = new CalculationRuleService();
        ReflectionTestUtils.setField(service, "repository", repository);
        ReflectionTestUtils.setField(service, "objectMapper", new ObjectMapper());
    }

    private CalculationRuleEntity rule(String code, String type, boolean actif) {
        CalculationRuleEntity rule = new CalculationRuleEntity();
        rule.setId(1L);
        rule.setCode(code);
        rule.setType(type);
        rule.setActif(actif);
        rule.setLibelle(code);
        rule.setModule("TEST");
        return rule;
    }

    private void ruleExists(CalculationRuleEntity rule) {
        when(repository.findByCode(rule.getCode())).thenReturn(Optional.of(rule));
    }

    @Test
    @DisplayName("PARAMETRE : la règle active est prioritaire sur la valeur par défaut du code")
    void parametreActifEstPrioritaire() {
        CalculationRuleEntity rule = rule("COMPTES.SEUIL_CRITICITE_TRES", "PARAMETRE", true);
        rule.setValeur(0.15);
        ruleExists(rule);

        assertEquals(0.15, service.getNumber("COMPTES.SEUIL_CRITICITE_TRES", 0.3));
    }

    @Test
    @DisplayName("PARAMETRE : sans règle, le code conserve sa valeur par défaut")
    void parametreSansRegleReplieSurLeCode() {
        when(repository.findByCode(anyString())).thenReturn(Optional.empty());

        assertEquals(0.3, service.getNumber("COMPTES.SEUIL_CRITICITE_TRES", 0.3));
    }

    @Test
    @DisplayName("PARAMETRE : règle désactivée, le code conserve sa valeur par défaut")
    void parametreDesactiveReplieSurLeCode() {
        CalculationRuleEntity rule = rule("COMPTES.SEUIL_CRITICITE_TRES", "PARAMETRE", false);
        rule.setValeur(0.15);
        ruleExists(rule);

        assertEquals(0.3, service.getNumber("COMPTES.SEUIL_CRITICITE_TRES", 0.3));
    }

    @Test
    @DisplayName("LISTE : la règle active remplace les mots-clés codés en dur")
    void listeActiveRemplaceLesMotsClesDuCode() throws Exception {
        CalculationRuleEntity rule = rule("BANQUE.TYPES_APPROVISIONNEMENT", "LISTE", true);
        rule.setValeurs("[\"CREDIT\"]");
        ruleExists(rule);

        assertTrue(service.matchesAny("Operation CREDIT", "BANQUE.TYPES_APPROVISIONNEMENT",
                CalculationRuleService.DEFAULT_TYPES_APPROVISIONNEMENT));
        assertFalse(service.matchesAny("Operation appro", "BANQUE.TYPES_APPROVISIONNEMENT",
                CalculationRuleService.DEFAULT_TYPES_APPROVISIONNEMENT));
    }

    @Test
    @DisplayName("LISTE : sans règle, les mots-clés codés en dur s'appliquent")
    void listeSansRegleReplieSurLesMotsClesDuCode() {
        when(repository.findByCode(anyString())).thenReturn(Optional.empty());

        assertTrue(service.matchesAny("Approvisionnement client", "BANQUE.TYPES_APPROVISIONNEMENT",
                CalculationRuleService.DEFAULT_TYPES_APPROVISIONNEMENT));
        assertTrue(service.matchesAny("Compense_client", "BANQUE.TYPES_COMPENSATION",
                CalculationRuleService.DEFAULT_TYPES_COMPENSATION));
        assertFalse(service.matchesAny("Nivellement", "BANQUE.TYPES_APPROVISIONNEMENT",
                CalculationRuleService.DEFAULT_TYPES_APPROVISIONNEMENT));
    }

    @Test
    @DisplayName("LISTE : la comparaison ignore la casse et les accents")
    void listeIgnoreCasseEtAccents() {
        when(repository.findByCode(anyString())).thenReturn(Optional.empty());

        assertTrue(service.matchesAny("COMPENSATION_client", "BANQUE.TYPES_COMPENSATION",
                CalculationRuleService.DEFAULT_TYPES_COMPENSATION));
        assertTrue(service.matchesAny("Nivellement", "BANQUE.TYPES_NIVELLEMENT",
                CalculationRuleService.DEFAULT_TYPES_NIVELLEMENT));
    }

    @Test
    @DisplayName("FORMULE : la règle active est prioritaire sur la formule du code")
    void formuleActiveEstPrioritaire() throws Exception {
        CalculationRuleEntity rule = rule("CERTIF.ECART_FRAIS", "FORMULE", true);
        rule.setExpression("[{\"signe\":\"+\",\"coefficient\":1,\"variable\":\"FRAIS_FACTURE\",\"absolue\":true},"
                + "{\"signe\":\"-\",\"coefficient\":1,\"variable\":\"FRAIS_ATTENDU\",\"absolue\":true}]");
        ruleExists(rule);

        // Facturé 100, attendu 40 => 100 - 40 = 60 (la règle inversée l'emporte sur le code).
        assertEquals(60.0, service.evaluate("CERTIF.ECART_FRAIS",
                Map.of("FRAIS_FACTURE", 100.0, "FRAIS_ATTENDU", 40.0),
                Math.abs(40.0) - Math.abs(100.0)));
    }

    @Test
    @DisplayName("FORMULE : sans règle, le code conserve sa formule par défaut")
    void formuleSansRegleReplieSurLeCode() {
        when(repository.findByCode(anyString())).thenReturn(Optional.empty());

        assertEquals(-60.0, service.evaluate("CERTIF.ECART_FRAIS",
                Map.of("FRAIS_FACTURE", 100.0, "FRAIS_ATTENDU", 40.0),
                Math.abs(40.0) - Math.abs(100.0)));
    }

    @Test
    @DisplayName("LISTE : les mots-clés normalisés sont exposés sans accents")
    void motsClesNormalises() {
        when(repository.findByCode(anyString())).thenReturn(Optional.empty());

        assertEquals(List.of("CASHIN", "SEND", "AIRTIME"),
                service.getKeywordList("CERTIF.SERVICES_TSOP_NEGATIFS",
                        CalculationRuleService.DEFAULT_SERVICES_TSOP_NEGATIFS));
    }
}
