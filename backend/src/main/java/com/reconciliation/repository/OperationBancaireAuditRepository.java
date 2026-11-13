package com.reconciliation.repository;

import com.reconciliation.entity.OperationBancaireAuditEntity;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
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
}
