package com.reconciliation.repository;

import com.reconciliation.entity.OperationBancaireAuditEntity;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import com.reconciliation.dto.OperationBancaireAuditLineDto;
import com.reconciliation.dto.OperationBancaireAuditStatDto;
import java.time.LocalDateTime;

import java.util.List;

public interface OperationBancaireAuditRepository extends JpaRepository<OperationBancaireAuditEntity, Long> {
    List<OperationBancaireAuditEntity> findByOperationIdOrderByCreatedAtAsc(Long operationId);

    /** Actions par utilisateur et type sur [debut, fin[ (le tenant est appliqué automatiquement). */
    @Query("select new com.reconciliation.dto.OperationBancaireAuditStatDto(a.username, a.actionType, count(a)) "
            + "from OperationBancaireAuditEntity a "
            + "where a.createdAt >= :debut and a.createdAt < :fin and a.username is not null and a.username <> '' "
            + "group by a.username, a.actionType")
    List<OperationBancaireAuditStatDto> summarize(@Param("debut") LocalDateTime debut, @Param("fin") LocalDateTime fin);

    /*
     * Classement « lignes utiles » (Top des utilisateurs banque) : on compte des LIGNES distinctes
     * effectivement traitées, pas des actions. Une ligne importée puis laissée non traitée ne compte pas.
     * Chaque requête renvoie les couples (utilisateur, ligne, montant) distincts ; le nombre de lignes
     * et le volume par utilisateur sont agrégés dans OperationBancaireAuditService#rankUsefulLines.
     */

    /** Agents : lignes créées / importées par l'utilisateur sur la période et dont la réconciliation est OK. */
    @Query("select distinct new com.reconciliation.dto.OperationBancaireAuditLineDto(a.username, o.id, o.montant) "
            + "from OperationBancaireAuditEntity a, OperationBancaireEntity o "
            + "where o.id = a.operationId and a.actionType = 'CREATION' "
            + "and a.createdAt >= :debut and a.createdAt < :fin and a.username is not null and a.username <> '' "
            + "and (upper(trim(o.reconStatus)) = 'OK' or trim(o.traitement) in ('Niveau Group', 'Terminé'))")
    List<OperationBancaireAuditLineDto> findAgentLignesReconciliees(@Param("debut") LocalDateTime debut,
                                                                      @Param("fin") LocalDateTime fin);

    /**
     * Responsables : lignes validées par l'utilisateur sur la période (passage à « Niveau Group »,
     * ou contrôle banque validé) et toujours validées aujourd'hui (non rétrogradées).
     */
    @Query("select distinct new com.reconciliation.dto.OperationBancaireAuditLineDto(a.username, o.id, o.montant) "
            + "from OperationBancaireAuditEntity a, OperationBancaireEntity o "
            + "where o.id = a.operationId "
            + "and a.createdAt >= :debut and a.createdAt < :fin and a.username is not null and a.username <> '' "
            + "and ((a.actionType in ('STATUT_RECONCILIATION', 'CHANGEMENT_TRAITEMENT') "
            + "      and trim(a.traitementSnapshot) = 'Niveau Group' "
            + "      and trim(o.traitement) in ('Niveau Group', 'Terminé')) "
            + "  or (a.actionType = 'CONTROLE_BANQUE' and o.checkValide = true))")
    List<OperationBancaireAuditLineDto> findLignesValidees(@Param("debut") LocalDateTime debut,
                                                            @Param("fin") LocalDateTime fin);

    /** Clôtures : lignes clôturées par l'utilisateur sur la période et toujours clôturées aujourd'hui. */
    @Query("select distinct new com.reconciliation.dto.OperationBancaireAuditLineDto(a.username, o.id, o.montant) "
            + "from OperationBancaireAuditEntity a, OperationBancaireEntity o "
            + "where o.id = a.operationId and a.actionType in ('CLOTURE', 'VALIDATION_TERMINE') "
            + "and a.createdAt >= :debut and a.createdAt < :fin and a.username is not null and a.username <> '' "
            + "and (trim(o.traitement) = 'Terminé' or trim(o.statut) = 'Clôturée')")
    List<OperationBancaireAuditLineDto> findLignesCloturees(@Param("debut") LocalDateTime debut,
                                                             @Param("fin") LocalDateTime fin);
}
