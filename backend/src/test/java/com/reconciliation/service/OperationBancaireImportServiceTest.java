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
                "Type,Montant,Statut,Date Opération,Agence,Pays",
                "APPRO_DISTRIBUTEUR,1000,OK,2026-11-02,ONUF6873,CI",
                ",2000,OK,2026-11-02,ONUF6873,CI");
        OperationBancaireImportService.ImportResult result = service.importFile(
                new MockMultipartFile("file", "ops.csv", "text/csv", csv.getBytes(StandardCharsets.UTF_8)));

        assertEquals(2, result.totalRead);
        assertEquals(1, result.saved);
        assertEquals(1, result.errors.size());

        ArgumentCaptor<List<OperationBancaireEntity>> captor = ArgumentCaptor.forClass(List.class);
        verify(repo).saveAll(captor.capture());
        assertEquals("APPRO_DISTRIBUTEUR", captor.getValue().get(0).getTypeOperation());
    }

    @Test
    void importsBoExportWithGroupedAmountsTimestampsAndLiteralNull() throws Exception {
        OperationBancaireRepository repo = mock(OperationBancaireRepository.class);
        when(repo.findByReferenceStartingWith(anyString())).thenReturn(List.of());

        OperationBancaireImportService service = new OperationBancaireImportService();
        ReflectionTestUtils.setField(service, "repository", repo);

        // Extrait de l'export BO qui faisait échouer tout l'import (montants « 2,000,000 », banque « null »)
        String tsv = String.join("\n",
                "Type Opération\tMontant\tStatut\tDate opération\tBanque\tDemandeur\tValideur\tAgence\tPays",
                "APPROVISIONNEMENT_DISTRIBUTEUR\t367\tREJETER_APPRO\t2026-11-05 16:46:30.0\tUBASN\tabdoukarim.diop\tseny.sall\tSNVDMG18013\tSN",
                "APPROVISIONNEMENT_DISTRIBUTEUR\t2,000,000\tOK\t2026-11-05 20:06:34.0\tUBASN\tabdoukarim.diop\tseny.sall\tSNVFDG0153\tSN",
                "APPROVISIONNEMENT_DISTRIBUTEUR\t199,8\tOK\t2026-11-05 15:54:14.0\tCBAO\tabdoukarim.diop\tseny.sall\tSNBAZG0645\tSN",
                "COMPENSE\t-5,500,000\tOK\t2026-11-05 16:38:34.0\tnull\tseny.sall\tngoye.kane\tGRACE\tCM",
                "COMPENSE\t-1,409,508\tOK\t2026-11-05 12:27:36.0\tnull\tamadou.sy\tclaude.coly2\tZAPCM12009\tCM");
        OperationBancaireImportService.ImportResult result = service.importFile(
                new MockMultipartFile("file", "ops.csv", "text/csv", tsv.getBytes(StandardCharsets.UTF_8)));

        assertEquals(5, result.totalRead, result.errors.toString());
        assertEquals(5, result.saved, result.errors.toString());
        ArgumentCaptor<List<OperationBancaireEntity>> captor = ArgumentCaptor.forClass(List.class);
        verify(repo).saveAll(captor.capture());
        List<OperationBancaireEntity> saved = captor.getValue();

        assertEquals(367d, saved.get(0).getMontant());
        assertEquals(java.time.LocalDateTime.of(2026, 11, 5, 16, 46, 30), saved.get(0).getDateOperation());
        assertEquals(2_000_000d, saved.get(1).getMontant());
        assertEquals(199.8d, saved.get(2).getMontant());
        assertEquals(-5_500_000d, saved.get(3).getMontant());
        assertNull(saved.get(3).getBo(), "« null » littéral = banque absente");
        assertEquals(-1_409_508d, saved.get(4).getMontant());
        // Colonnes NOT NULL sans valeur dans le fichier : jamais insérées à NULL
        for (OperationBancaireEntity e : saved) {
            assertEquals(Boolean.FALSE, e.getCheckValide(), "check_valide NOT NULL (V27)");
            assertEquals(Boolean.FALSE, e.getImpactApplique());
        }
    }

    @Test
    void rejectsOnlyRowsWithUnreadableAmountDateOrMissingCountry() throws Exception {
        OperationBancaireRepository repo = mock(OperationBancaireRepository.class);
        when(repo.findByReferenceStartingWith(anyString())).thenReturn(List.of());

        OperationBancaireImportService service = new OperationBancaireImportService();
        ReflectionTestUtils.setField(service, "repository", repo);

        String csv = String.join("\n",
                "Type;Montant;Date Opération;Agence;Pays",
                "APPRO_DISTRIBUTEUR;1000;2026-11-02;A1;SN",
                "APPRO_DISTRIBUTEUR;abc;2026-11-02;A1;SN",
                "APPRO_DISTRIBUTEUR;2000;pas une date;A1;SN",
                "APPRO_DISTRIBUTEUR;3000;2026-11-02;A1;");
        OperationBancaireImportService.ImportResult result = service.importFile(
                new MockMultipartFile("file", "ops.csv", "text/csv", csv.getBytes(StandardCharsets.UTF_8)));

        assertEquals(4, result.totalRead);
        assertEquals(1, result.saved);
        assertEquals(3, result.errors.size(), result.errors.toString());
    }

    @Test
    void parsesAmountFormats() {
        assertEquals(2_000_000d, OperationBancaireImportService.parseAmount("2,000,000"));
        assertEquals(2_000_000d, OperationBancaireImportService.parseAmount("2.000.000"));
        assertEquals(2_000_000d, OperationBancaireImportService.parseAmount("2 000 000"));
        assertEquals(1234.56d, OperationBancaireImportService.parseAmount("1,234.56"));
        assertEquals(1234.56d, OperationBancaireImportService.parseAmount("1.234,56"));
        assertEquals(199.8d, OperationBancaireImportService.parseAmount("199,8"));
        assertEquals(1.5d, OperationBancaireImportService.parseAmount("1.5"));
        assertNull(OperationBancaireImportService.parseAmount("null"));
        assertNull(OperationBancaireImportService.parseAmount("abc"));
    }
}
