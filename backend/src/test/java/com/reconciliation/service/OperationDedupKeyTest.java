package com.reconciliation.service;

import org.junit.jupiter.api.Test;

import java.time.LocalDateTime;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotEquals;

class OperationDedupKeyTest {

    private static final LocalDateTime D1 = LocalDateTime.of(2026, 11, 6, 9, 0);
    private static final LocalDateTime D1_LATER = LocalDateTime.of(2026, 11, 6, 17, 30);

    @Test
    void referenceDuplicateIsDetectedWhateverTheOtherColumns() {
        String a = OperationBancaireImportService.operationDedupKey("REF-1", "AG1", "Virement", D1, 100.0);
        String b = OperationBancaireImportService.operationDedupKey(" ref-1 ", "AG2", "Paiement", D1_LATER, 999.0);
        assertEquals(a, b);
    }

    @Test
    void compensationWithoutReferenceUsesAgenceDateMontant() {
        String a = OperationBancaireImportService.operationDedupKey(null, "AG1", "Compensation Client", D1, 5000.0);
        String b = OperationBancaireImportService.operationDedupKey("", "ag1", "Compensation Client", D1_LATER, 5000.0);
        assertEquals(a, b, "même agence, même jour, même montant : doublon");
    }

    @Test
    void compensationWithDifferentAmountIsNotDuplicate() {
        String a = OperationBancaireImportService.operationDedupKey(null, "AG1", "Compensation Client", D1, 5000.0);
        String b = OperationBancaireImportService.operationDedupKey(null, "AG1", "Compensation Client", D1, 5001.0);
        assertNotEquals(a, b);
    }

    @Test
    void compensationWithDifferentAgenceIsNotDuplicate() {
        String a = OperationBancaireImportService.operationDedupKey(null, "AG1", "Compensation Client", D1, 5000.0);
        String b = OperationBancaireImportService.operationDedupKey(null, "AG2", "Compensation Client", D1, 5000.0);
        assertNotEquals(a, b);
    }
}
