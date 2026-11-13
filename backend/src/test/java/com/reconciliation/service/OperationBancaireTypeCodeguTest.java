package com.reconciliation.service;

import static org.junit.jupiter.api.Assertions.assertEquals;

import org.junit.jupiter.api.Test;

class OperationBancaireTypeCodeguTest {

    @Test
    void codeguCompenseDevientCompenseFournisseur() {
        assertEquals("COMPENSE_FOURNISSEUR",
                OperationBancaireImportService.resolveTypeOperation("CODEGU", "COMPENSE"));
        assertEquals("COMPENSE_FOURNISSEUR",
                OperationBancaireImportService.resolveTypeOperation(" codegu ", "Compense "));
    }

    @Test
    void autresCasInchanges() {
        assertEquals("COMPENSE", OperationBancaireImportService.resolveTypeOperation("GRACE", "COMPENSE"));
        assertEquals("Appro fournisseur",
                OperationBancaireImportService.resolveTypeOperation("CODEGU", "Appro fournisseur"));
        assertEquals("COMPENSE", OperationBancaireImportService.resolveTypeOperation(null, "COMPENSE"));
    }

    @Test
    void referenceNonGenereePourCompenseFournisseur() {
        assertEquals("", OperationBancaireImportService.referenceCode("COMPENSE_FOURNISSEUR"));
    }
}
