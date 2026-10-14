package com.reconciliation.repository;

import com.reconciliation.entity.PlatformAuditLogEntity;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface PlatformAuditLogRepository extends JpaRepository<PlatformAuditLogEntity, Long> {

    /** Journal du plus recent au plus ancien (limite fournie par l'appelant). */
    org.springframework.data.domain.Page<PlatformAuditLogEntity> findAllByOrderByCreatedAtDesc(Pageable pageable);

    @Query("SELECT a FROM PlatformAuditLogEntity a " +
            "WHERE (:action IS NULL OR :action = '' OR LOWER(a.action) = LOWER(:action)) " +
            "AND (:q IS NULL OR :q = '' OR " +
            "LOWER(a.actorUsername) LIKE LOWER(CONCAT('%', :q, '%')) OR " +
            "LOWER(a.action) LIKE LOWER(CONCAT('%', :q, '%')) OR " +
            "LOWER(a.targetType) LIKE LOWER(CONCAT('%', :q, '%')) OR " +
            "LOWER(COALESCE(a.targetId,'')) LIKE LOWER(CONCAT('%', :q, '%')) OR " +
            "LOWER(COALESCE(a.details,'')) LIKE LOWER(CONCAT('%', :q, '%')))" +
            "ORDER BY a.createdAt DESC")
    Page<PlatformAuditLogEntity> search(@Param("action") String action,
                                        @Param("q") String search,
                                        Pageable pageable);
}
