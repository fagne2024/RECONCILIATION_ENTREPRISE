package com.reconciliation.service.traitement;

import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

class TraitementTransformationsTest {

    @Test
    void parseFloatJsConvertitLesMontantsCommeLeClient() {
        assertThat(TraitementTransformations.parseFloatJs("1 500,75")).isEqualTo(1500.75);
        assertThat(TraitementTransformations.parseFloatJs("12abc")).isEqualTo(12.0);
        assertThat(TraitementTransformations.parseFloatJs("-3.5")).isEqualTo(-3.5);
        assertThat(TraitementTransformations.parseFloatJs("1,2,3")).isEqualTo(1.2);
        assertThat(TraitementTransformations.parseFloatJs("abc")).isNull();
        assertThat(TraitementTransformations.parseFloatJs("")).isNull();
    }

    @Test
    void convertirNombreGardeLaValeurSiNonNumerique() {
        assertThat(TraitementTransformations.convertirNombre("2 000")).isEqualTo(2000.0);
        assertThat(TraitementTransformations.convertirNombre("REF-A")).isEqualTo("REF-A");
        assertThat(TraitementTransformations.convertirNombre("")).isEqualTo("");
        assertThat(TraitementTransformations.convertirNombre(null)).isNull();
    }

    @Test
    void convertirDateIsoAvecFormatParDefaut() {
        assertThat(TraitementTransformations.convertirDate("2025-01-15", null)).isEqualTo("2025-01-15");
        assertThat(TraitementTransformations.convertirDate("2025-01-15 10:30:00", "yyyy-MM-dd")).isEqualTo("2025-01-15");
        assertThat(TraitementTransformations.convertirDate("2025-01-15T10:30", "dd/MM/yyyy HH:mm")).isEqualTo("15/01/2025 10:30");
    }

    @Test
    void convertirDateRetireLeSuffixeZeroEtGardeLesValeursNonIso() {
        assertThat(TraitementTransformations.convertirDate("2025-01-15.0", "dd/MM/yyyy")).isEqualTo("15/01/2025");
        // Format non ISO : le client ne le convertit pas (new Date("15/01/2025") est invalide).
        assertThat(TraitementTransformations.convertirDate("15/01/2025", "yyyy-MM-dd")).isEqualTo("15/01/2025");
    }

    @Test
    void cleDedoublonnageIgnoreLesEspacesEtLaCasse() {
        Map<String, Object> a = Map.of("ref", " AB12 ", "montant", "10");
        Map<String, Object> b = Map.of("ref", "ab12", "montant", "10");
        Map<String, Object> c = Map.of("ref", "ab12", "montant", "11");
        List<String> cols = List.of("ref", "montant");

        assertThat(TraitementTransformations.cleDedoublonnage(cols, a))
                .isEqualTo(TraitementTransformations.cleDedoublonnage(cols, b));
        assertThat(TraitementTransformations.cleDedoublonnage(cols, a))
                .isNotEqualTo(TraitementTransformations.cleDedoublonnage(cols, c));
    }

    @Test
    void appartientCompareLesValeursCommeDesTextes() {
        assertThat(TraitementTransformations.appartient("OK", List.of("OK", "KO"))).isTrue();
        assertThat(TraitementTransformations.appartient("10", List.of("10"))).isTrue();
        assertThat(TraitementTransformations.appartient(null, List.of(""))).isTrue();
        assertThat(TraitementTransformations.appartient("AUTRE", List.of("OK"))).isFalse();
    }
}
