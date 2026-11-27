package com.reconciliation.service;

import com.reconciliation.dto.BanqueDossierLieDto;
import com.reconciliation.dto.BanqueDossierLieDto.LigneDetail;
import com.reconciliation.entity.OperationBancaireEntity;
import com.reconciliation.entity.ReleveBancaireEntity;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/** Calculs des dossiers liés : montants des lignes, totaux par rôle et synthèse du préfinancement. */
class BanqueDossierLieServiceTest {

    @Test
    void montantReleveDebitSinonCreditSinonMontantEnValeurAbsolue() {
        ReleveBancaireEntity r = new ReleveBancaireEntity();
        r.setDebit(-1500d);
        assertThat(BanqueDossierLieService.montantReleve(r)).isEqualTo(1500d);
        r.setDebit(0d);
        r.setCredit(200d);
        assertThat(BanqueDossierLieService.montantReleve(r)).isEqualTo(200d);
        r.setCredit(null);
        r.setMontant(-30d);
        assertThat(BanqueDossierLieService.montantReleve(r)).isEqualTo(30d);

        OperationBancaireEntity op = new OperationBancaireEntity();
        op.setMontant(-1000d);
        assertThat(BanqueDossierLieService.montantOperation(op)).isEqualTo(1000d);
    }

    @Test
    void syntheseDuPrefinancementAvecRemboursementDuReliquatEtFrais() {
        List<LigneDetail> lignes = List.of(
                ligne("OPERATION", BanqueDossierLieService.APPRO, 1_000_000d),
                ligne("RELEVE", BanqueDossierLieService.APPRO_CONTREPARTIE, 1_000_000d),
                ligne("OPERATION", BanqueDossierLieService.FRAIS_APPRO, 5_000d),
                ligne("OPERATION", BanqueDossierLieService.REMBOURSEMENT, 300_000d),
                ligne("RELEVE", BanqueDossierLieService.REMBOURSEMENT_CONTREPARTIE, 299_000d),
                ligne("RELEVE", BanqueDossierLieService.FRAIS_REMBOURSEMENT, 1_000d),
                // ligne supprimée depuis : ignorée
                ligne("RELEVE", BanqueDossierLieService.AUTRE, null));

        Map<String, Double> totaux = BanqueDossierLieService.totauxParRole(lignes);
        assertThat(totaux).containsEntry(BanqueDossierLieService.APPRO, 1_000_000d)
                .containsEntry(BanqueDossierLieService.AUTRE, 0d);

        BanqueDossierLieDto.Synthese s = BanqueDossierLieService.synthese(totaux);
        assertThat(s.ecartAppro()).isZero();
        assertThat(s.ecartRemboursement()).isEqualTo(1_000d);
        // Total des frais = frais sur le montant utilisé ; différence avec les frais prévus de l'appro
        assertThat(s.totalFrais()).isEqualTo(1_000d);
        assertThat(s.fraisAppro()).isEqualTo(5_000d);
        assertThat(s.ecartFrais()).isEqualTo(4_000d);
        assertThat(s.montantUtilise()).isEqualTo(700_000d);
    }

    private static LigneDetail ligne(String type, String role, Double montant) {
        return new LigneDetail(type, 1L, role, montant, null, null);
    }
}
