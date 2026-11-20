package com.reconciliation.service;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Extraction de données des règles de traitement des colonnes (formatType « extract:… ») :
 * mêmes résultats que le frontend (utils/column-extraction.util.spec.ts).
 */
class ColumnProcessingExtractionTest {

    @Test
    void extraitAGaucheADroiteEtLeDomaineEmail() {
        assertThat(ColumnProcessingService.applyExtraction("ABCDEFGH", "extract:firstChars:1:3")).isEqualTo("ABC");
        assertThat(ColumnProcessingService.applyExtraction("ABCDEFGH", "extract:firstChars:3:2")).isEqualTo("CD");
        assertThat(ColumnProcessingService.applyExtraction("ABCDEFGH", "extract:lastChars:1:3")).isEqualTo("FGH");
        assertThat(ColumnProcessingService.applyExtraction("ABCDEFGH", "extract:lastChars:2:3")).isEqualTo("EFG");
        assertThat(ColumnProcessingService.applyExtraction("ABC", "extract:lastChars:2:5")).isEqualTo("ABC");
        assertThat(ColumnProcessingService.applyExtraction("jean@intouch.sn", "extract:emailDomain")).isEqualTo("intouch.sn");
        assertThat(ColumnProcessingService.applyExtraction("sans-arobase", "extract:emailDomain")).isEmpty();
    }

    @Test
    void positionAuDelaDeLaValeurDonneUneChaineVide() {
        assertThat(ColumnProcessingService.applyExtraction("AB", "extract:firstChars:5:2")).isEmpty();
        assertThat(ColumnProcessingService.applyExtraction(null, "extract:firstChars:1:2")).isEmpty();
    }
}
