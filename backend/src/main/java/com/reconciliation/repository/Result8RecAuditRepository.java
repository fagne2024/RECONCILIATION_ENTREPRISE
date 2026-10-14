package com.reconciliation.repository;

import com.reconciliation.entity.Result8RecAuditEntity;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDateTime;
import java.util.List;

public interface Result8RecAuditRepository extends JpaRepository<Result8RecAuditEntity, Long> {
    List<Result8RecAuditEntity> findByResult8recIdOrderByCreatedAtAsc(Long result8recId);

    /**
     * Agrégat des actions d'audit par utilisateur / type d'action / niveau de traitement,
     * détaillé par pays et environnement de la ligne rapport (filtres pays / ENV appliqués
     * ensuite en mémoire pour rester alignés sur la logique stricte du frontend).
     *
     * <p>Les entités {@code Result8RecAuditEntity} et {@code Result8RecEntity} portent
     * {@code @TenantId} : l'isolation multi-entreprise est donc appliquée automatiquement
     * par Hibernate sur cette requête JPQL.</p>
     *
     * @param start         date-heure de début (inclusive)
     * @param endExclusive  date-heure de fin (exclusive)
     * @param service       nom de service exact, ou {@code null} pour ne pas filtrer
     */
    @Query("""
        SELECT a.username, a.actionType, a.traitementSnapshot, r.country, r.env, COUNT(a)
        FROM Result8RecAuditEntity a, Result8RecEntity r
        WHERE a.result8recId = r.id
          AND a.createdAt >= :start
          AND a.createdAt < :endExclusive
          AND (:service IS NULL OR r.service = :service)
        GROUP BY a.username, a.actionType, a.traitementSnapshot, r.country, r.env
        """)
    List<Object[]> aggregateActionsByUserAndCountry(
            @Param("start") LocalDateTime start,
            @Param("endExclusive") LocalDateTime endExclusive,
            @Param("service") String service
    );
}
