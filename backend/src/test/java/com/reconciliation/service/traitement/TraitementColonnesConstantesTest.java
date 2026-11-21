package com.reconciliation.service.traitement;

import org.junit.jupiter.api.Test;

import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class TraitementColonnesConstantesTest {

    private static TraitementOperationService.Operation operation(Map<String, String> constantes) {
        return new TraitementOperationService.Operation(null, null, null, null, null, null, null, null, constantes);
    }

    @Test
    void sansColonneConstante() {
        assertTrue(TraitementOperationService.colonnesConstantes(operation(null)).isEmpty());
    }

    @Test
    void nomEtValeurSurUneLigne() {
        Map<String, String> in = new LinkedHashMap<>();
        in.put(" PAYS ", "CI\r\n");
        Map<String, String> out = TraitementOperationService.colonnesConstantes(operation(in));
        assertEquals(Map.of("PAYS", "CI"), out);
    }

    @Test
    void refuseUnNomVide() {
        Map<String, String> in = new HashMap<>();
        in.put("  ", "CI");
        assertThrows(IllegalArgumentException.class, () -> TraitementOperationService.colonnesConstantes(operation(in)));
    }
}
