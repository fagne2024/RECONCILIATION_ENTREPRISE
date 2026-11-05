package com.reconciliation.dto;

import com.reconciliation.entity.CertificationSoldeResultatEntity;

import java.time.LocalDate;
import java.time.LocalDateTime;

/** Ligne de liste d'une certification enregistrée (sans les tableaux de détail). */
public record CertificationSoldeResultatSummary(
        Long id,
        String numeroCompte,
        LocalDate dateDebut,
        LocalDate dateFin,
        String env,
        String pays,
        String titre,
        Double soldeOuverture,
        Double soldeCloture,
        Double ecartMouvement,
        Double ecartCertification,
        Double soldeClotureTheorique,
        String commentaire,
        String createdBy,
        String updatedBy,
        LocalDateTime createdAt,
        LocalDateTime updatedAt
) {
    public static CertificationSoldeResultatSummary of(CertificationSoldeResultatEntity e) {
        return new CertificationSoldeResultatSummary(
                e.getId(),
                e.getNumeroCompte(),
                e.getDateDebut(),
                e.getDateFin(),
                e.getEnv(),
                e.getPays(),
                e.getTitre(),
                e.getSoldeOuverture(),
                e.getSoldeCloture(),
                e.getEcartMouvement(),
                e.getEcartCertification(),
                e.getSoldeClotureTheorique(),
                e.getCommentaire(),
                e.getCreatedBy(),
                e.getUpdatedBy(),
                e.getCreatedAt(),
                e.getUpdatedAt()
        );
    }
}
