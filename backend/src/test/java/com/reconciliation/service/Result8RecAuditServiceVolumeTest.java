package com.reconciliation.service;

import com.reconciliation.dto.Result8RecServiceDayActionDto;
import com.reconciliation.repository.Result8RecAuditRepository;
import org.junit.jupiter.api.Test;

import java.time.LocalDateTime;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyCollection;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/**
 * État des réconciliations, « Top des utilisateurs » par volume : chaque action porte le volume
 * de son service-jour (somme des volumes de ses lignes rapport).
 */
class Result8RecAuditServiceVolumeTest {

    @Test
    void volumeDuServiceJourEgalSommeDesLignes() {
        Result8RecAuditRepository repo = mock(Result8RecAuditRepository.class);
        List<Object[]> actions = List.of(
                new Object[]{"agent.a", "CREATION", "Support", "CASHIN WAVE", "SN", "PROD", "2026-11-20"},
                new Object[]{"agent.b", "CREATION", "Support", "CASHOUT WAVE", "SN", "PROD", "2026-11-20"}
        );
        List<Object[]> lignes = List.of(
                new Object[]{"CASHIN WAVE", "SN", "PROD", "2026-11-20", "Terminé", 1_000d},
                new Object[]{"CASHIN WAVE", "SN", "PROD", "2026-11-20", "Terminé", 500d},
                new Object[]{"CASHOUT WAVE", "SN", "PROD", "2026-11-20", "Terminé", 250d}
        );
        when(repo.findActionsWithServiceDay(any(), any(), any())).thenReturn(actions);
        when(repo.findTraitementsForDates(anyCollection(), any())).thenReturn(lignes);

        List<Result8RecServiceDayActionDto> out = new Result8RecAuditService(repo).serviceDayActions(
                LocalDateTime.of(2026, 11, 16, 0, 0), LocalDateTime.of(2026, 11, 24, 0, 0),
                null, null, null, null);

        assertThat(out).hasSize(2);
        assertThat(out).filteredOn(d -> d.username().equals("agent.a"))
                .singleElement().extracting(Result8RecServiceDayActionDto::serviceDayVolume).isEqualTo(1_500d);
        assertThat(out).filteredOn(d -> d.username().equals("agent.b"))
                .singleElement().extracting(Result8RecServiceDayActionDto::serviceDayVolume).isEqualTo(250d);
    }
}
