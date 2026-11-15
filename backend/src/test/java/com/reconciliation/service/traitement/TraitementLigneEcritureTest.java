package com.reconciliation.service.traitement;

import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.TransactionStatus;
import org.springframework.transaction.support.TransactionCallback;
import org.springframework.transaction.support.TransactionTemplate;

import java.util.ArrayList;
import java.util.List;
import java.util.function.Consumer;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;

class TraitementLigneEcritureTest {

    @Test
    void requeteMultiLignes() {
        assertThat(TraitementLigneEcriture.requete(2)).isEqualTo(
                "INSERT INTO traitement_ligne (entreprise_id, lot_id, fichier_id, numero, valeurs_json) "
                        + "VALUES (?, ?, ?, ?, ?), (?, ?, ?, ?, ?)");
    }

    @Test
    void aplatirConserveLOrdreDesParametres() {
        Object[] p = TraitementLigneEcriture.aplatir(List.of(
                new Object[]{1L, 2L, 3L, 1L, "{\"a\":1}"},
                new Object[]{1L, 2L, 3L, 2L, "{\"a\":2}"}));
        assertThat(p).containsExactly(1L, 2L, 3L, 1L, "{\"a\":1}", 1L, 2L, 3L, 2L, "{\"a\":2}");
    }

    @Test
    void aplatirRefuseUneLigneMalFormee() {
        List<Object[]> tranche = new ArrayList<>();
        tranche.add(new Object[]{1L, 2L});
        assertThatThrownBy(() -> TraitementLigneEcriture.aplatir(tranche))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void blocDecoupeEnRequetesDansUneSeuleTransaction() {
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        TransactionTemplate tx = mock(TransactionTemplate.class);
        doAnswer(inv -> {
            Consumer<TransactionStatus> action = inv.getArgument(0);
            action.accept(null);
            return null;
        }).when(tx).executeWithoutResult(any());
        TraitementLigneEcriture ecriture = new TraitementLigneEcriture(jdbc, tx);

        List<Object[]> bloc = new ArrayList<>();
        for (int i = 0; i < 1001; i++) {
            bloc.add(new Object[]{1L, 2L, 3L, (long) i, "{}"});
        }
        ecriture.inserer(bloc);

        verify(tx, times(1)).executeWithoutResult(any());
        // 1001 lignes -> 500 + 500 + 1
        verify(jdbc, times(3)).update(anyString(), any(Object[].class));
        assertThat(bloc).isEmpty();
    }

    @Test
    void blocVideSansTransaction() {
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        TransactionTemplate tx = mock(TransactionTemplate.class);
        new TraitementLigneEcriture(jdbc, tx).inserer(new ArrayList<>());
        verify(tx, never()).executeWithoutResult(any());
        verify(tx, never()).execute(any(TransactionCallback.class));
    }
}
