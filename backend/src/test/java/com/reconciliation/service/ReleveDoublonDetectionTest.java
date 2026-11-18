package com.reconciliation.service;

import com.reconciliation.dto.DoublonImportLigne;
import com.reconciliation.entity.ReleveBancaireEntity;
import com.reconciliation.repository.ReleveBancaireRepository;
import org.junit.jupiter.api.Test;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.anySet;
import static org.mockito.Mockito.*;

/** Relevé : lignes déjà présentes en base proposées à l'utilisateur avant le chargement. */
class ReleveDoublonDetectionTest {

    private static ReleveBancaireEntity ligne(String libelle, double montant) {
        ReleveBancaireEntity e = new ReleveBancaireEntity();
        e.setNumeroCompte("C1");
        e.setDateComptable(LocalDate.of(2026, 11, 10));
        e.setDateValeur(LocalDate.of(2026, 11, 10));
        e.setLibelle(libelle);
        e.setMontant(montant);
        e.setDedupKey(ReleveBancaireImportService.libelleDedupKey(libelle,
                ReleveBancaireImportService.buildDedupKey("C1", e.getDateComptable(), e.getDateValeur(), libelle, montant)));
        return e;
    }

    @Test
    void detecteLibelleConnuEtCleConnueMaisPasLesLignesNouvelles() {
        ReleveBancaireEntity sansLibelle = ligne(null, 500);
        ReleveBancaireRepository repo = mock(ReleveBancaireRepository.class);
        when(repo.findAllLibelles()).thenReturn(List.of("Virement   reçu 42"));
        ReleveBancaireEntity existante = new ReleveBancaireEntity();
        existante.setDedupKey(sansLibelle.getDedupKey());
        when(repo.findByDedupKeyIn(anySet())).thenReturn(List.of(existante));

        Map<Integer, String> motifs = ReleveBancaireImportService.detecterDoublons(
                List.of(ligne("VIREMENT RECU 42", 100), ligne("NOUVEAU", 200), sansLibelle), repo);

        assertEquals(Map.of(0, DoublonImportLigne.MOTIF_LIBELLE, 2, DoublonImportLigne.MOTIF_CLE), motifs);
    }

    @Test
    void decisionAbsenteVideOuPartielle() {
        assertNull(DoublonImportLigne.parseDecision(null, "1,2"));
        assertNull(DoublonImportLigne.parseDecision(false, "1,2"));
        assertEquals(Set.of(), DoublonImportLigne.parseDecision(true, ""));
        assertEquals(Set.of(), DoublonImportLigne.parseDecision(true, null));
        assertEquals(Set.of(3, 7), DoublonImportLigne.parseDecision(true, "3, 7,x"));
    }
}
