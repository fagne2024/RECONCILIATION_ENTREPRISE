package com.reconciliation.service;

import com.reconciliation.entity.OperationBancaireEntity;
import com.reconciliation.repository.OperationBancaireRepository;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.util.ReflectionTestUtils;

import java.nio.charset.StandardCharsets;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;

class OperationBancaireImportServiceTest {

    private static final String HEADER =
            "Type Opération,Montant,Statut,Date Opération,Agence,Référence,ID GLPI,Banque,Banque Corrigée,Mode de Paiement,Demandeur,Valideur,Traitement,Pays";

    @Test
    void generatesReferencesWithCounterContinuingFromDatabaseAndKeepsOtherColumns() throws Exception {
        OperationBancaireRepository repo = mock(OperationBancaireRepository.class);
        // La base contient déjà APFR1 à APFR4 pour cette agence et cette date
        OperationBancaireEntity existing = new OperationBancaireEntity();
        existing.setReference("ONUF6873-20261102APFR4");
        when(repo.findByReferenceStartingWith("ONUF6873-20261102APFR")).thenReturn(List.of(existing));

        OperationBancaireImportService service = new OperationBancaireImportService();
        ReflectionTestUtils.setField(service, "repository", repo);

        String csv = String.join("\n",
                HEADER,
                "APPRO_FOURNISSEUR,1000,OK,2026-11-02,ONUF6873,,12345,MEMO-CI,MEMO-CC,Virement,armand,papebassirou,TRAIT1,CITCH",
                "APPRO_FOURNISSEUR,2000,OK,2026-11-02,ONUF6873,,,MEMO-CI,,Virement,,,,CITCH",
                "APPRO_DISTRIBUTEUR,3000,OK,2026-11-02,ONUF6873,,,MEMO-CI,,Virement,,,,CITCH",
                "COMPENSATION_CLIENT,4000,OK,2026-11-02,ONUF6873,,,MEMO-CI,,Virement,,,,CITCH",
                "APPRO_FOURNISSEUR,5000,OK,2026-11-02,ONUF6873,MY-REF,,MEMO-CI,,Virement,,,,CITCH");
        MockMultipartFile file = new MockMultipartFile("file", "ops.csv", "text/csv", csv.getBytes(StandardCharsets.UTF_8));

        OperationBancaireImportService.ImportResult result = service.importFile(file);
        assertEquals(5, result.totalRead);
        assertEquals(5, result.saved);

        ArgumentCaptor<List<OperationBancaireEntity>> captor = ArgumentCaptor.forClass(List.class);
        verify(repo).saveAll(captor.capture());
        List<OperationBancaireEntity> saved = captor.getValue();

        assertEquals("ONUF6873-20261102APFR5", saved.get(0).getReference());
        assertEquals("ONUF6873-20261102APFR6", saved.get(1).getReference());
        assertEquals("ONUF6873-20261102AP1", saved.get(2).getReference());
        assertNull(saved.get(3).getReference(), "une compensation sans référence reste vide");
        assertEquals("MY-REF", saved.get(4).getReference(), "une référence fournie est conservée");

        OperationBancaireEntity first = saved.get(0);
        assertEquals("12345", first.getIdGlpi());
        assertEquals("MEMO-CI", first.getBo());
        assertEquals("MEMO-CC", first.getBanqueCorrigee());
        assertEquals("Virement", first.getModePaiement());
        assertEquals("armand", first.getDemandeur());
        assertEquals("papebassirou", first.getValideur());
        assertEquals("TRAIT1", first.getTraitement());
        assertEquals("CITCH", first.getPays());
    }

    @Test
    void startsAtOneWhenDatabaseHasNoMatchingReference() throws Exception {
        OperationBancaireRepository repo = mock(OperationBancaireRepository.class);
        when(repo.findByReferenceStartingWith(eq("ONUF6873-20261102APFR"))).thenReturn(List.of());

        OperationBancaireImportService service = new OperationBancaireImportService();
        ReflectionTestUtils.setField(service, "repository", repo);

        String csv = String.join("\n",
                HEADER,
                "APPRO_FOURNISSEUR,1000,OK,2026-11-02,ONUF6873,,,MEMO-CI,,Virement,,,,CITCH");
        service.importFile(new MockMultipartFile("file", "ops.csv", "text/csv", csv.getBytes(StandardCharsets.UTF_8)));

        ArgumentCaptor<List<OperationBancaireEntity>> captor = ArgumentCaptor.forClass(List.class);
        verify(repo).saveAll(captor.capture());
        assertEquals("ONUF6873-20261102APFR1", captor.getValue().get(0).getReference());
        verify(repo, never()).findByReferenceStartingWith(eq("ONUF6873-20261102AP"));
        verify(repo, atLeastOnce()).saveAll(anyList());
    }

    @Test
    void importsTreatedFileWithFrontendHeaderNames() throws Exception {
        OperationBancaireRepository repo = mock(OperationBancaireRepository.class);
        when(repo.findByReferenceStartingWith(anyString())).thenReturn(List.of());

        OperationBancaireImportService service = new OperationBancaireImportService();
        ReflectionTestUtils.setField(service, "repository", repo);

        // En-têtes tels que produits par buildTreatedRowsFile (après alias)
        String csv = String.join("\n",
                "Type Opération,Montant,Statut,Référence,Date Opération,Agence,Banque,Demandeur,Valideur,Pays",
                "APPROVISIONNEMENT_DISTRIBUTEUR,2455108,OK,20261102-ONUF6-2455108,2026-11-03 17:33:24.0,ONUF6873,MEMO-CI,armandfara.diop,Papebassirou.Ly,CITCH");
        OperationBancaireImportService.ImportResult result = service.importFile(
                new MockMultipartFile("file", "ops.csv", "text/csv", csv.getBytes(StandardCharsets.UTF_8)));

        assertEquals(1, result.totalRead, result.errors.toString());
        assertEquals(1, result.saved, result.errors.toString());
        ArgumentCaptor<List<OperationBancaireEntity>> captor = ArgumentCaptor.forClass(List.class);
        verify(repo).saveAll(captor.capture());
        assertEquals("APPROVISIONNEMENT_DISTRIBUTEUR", captor.getValue().get(0).getTypeOperation());
    }

    @Test
    void acceptsTypeHeaderFromTreatmentAndRejectsOnlyRowsWithoutType() throws Exception {
        OperationBancaireRepository repo = mock(OperationBancaireRepository.class);
        when(repo.findByReferenceStartingWith(anyString())).thenReturn(List.of());

        OperationBancaireImportService service = new OperationBancaireImportService();
        ReflectionTestUtils.setField(service, "repository", repo);

        String csv = String.join("\n",
                "Type,Montant,Statut,Date Opération,Agence",
                "APPRO_DISTRIBUTEUR,1000,OK,2026-11-02,ONUF6873",
                ",2000,OK,2026-11-02,ONUF6873");
        OperationBancaireImportService.ImportResult result = service.importFile(
                new MockMultipartFile("file", "ops.csv", "text/csv", csv.getBytes(StandardCharsets.UTF_8)));

        assertEquals(2, result.totalRead);
        assertEquals(1, result.saved);
        assertEquals(1, result.errors.size());

        ArgumentCaptor<List<OperationBancaireEntity>> captor = ArgumentCaptor.forClass(List.class);
        verify(repo).saveAll(captor.capture());
        assertEquals("APPRO_DISTRIBUTEUR", captor.getValue().get(0).getTypeOperation());
    }
}
