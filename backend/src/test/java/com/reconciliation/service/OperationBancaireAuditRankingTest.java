package com.reconciliation.service;

import com.reconciliation.dto.OperationBancaireAuditLineDto;
import com.reconciliation.dto.OperationBancaireAuditStatDto;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/** Classement banque par lignes utiles : nombre de lignes distinctes et volume par utilisateur. */
class OperationBancaireAuditRankingTest {

    @Test
    void compteLesLignesDistinctesEtSommeLeursMontantsEnValeurAbsolue() {
        List<OperationBancaireAuditStatDto> res = OperationBancaireAuditService.aggregateLines("agents", List.of(
                new OperationBancaireAuditLineDto("a.agent", 1L, 1000d),
                new OperationBancaireAuditLineDto("a.agent", 2L, -500d),
                // même ligne revue par le même utilisateur : comptée une seule fois
                new OperationBancaireAuditLineDto(" a.agent ", 1L, 1000d),
                new OperationBancaireAuditLineDto("b.agent", 1L, 1000d),
                new OperationBancaireAuditLineDto("b.agent", 3L, null)));

        assertThat(res).containsExactly(
                new OperationBancaireAuditStatDto("a.agent", "agents", 2, 1500d),
                new OperationBancaireAuditStatDto("b.agent", "agents", 2, 1000d));
    }

    @Test
    void ignoreLesLignesSansUtilisateurNiOperation() {
        List<OperationBancaireAuditStatDto> res = OperationBancaireAuditService.aggregateLines("clotures", List.of(
                new OperationBancaireAuditLineDto("", 1L, 10d),
                new OperationBancaireAuditLineDto(null, 2L, 10d),
                new OperationBancaireAuditLineDto("c.user", null, 10d)));

        assertThat(res).isEmpty();
        assertThat(OperationBancaireAuditService.aggregateLines("clotures", null)).isEmpty();
    }
}
