package com.reconciliation.repository;

import com.reconciliation.entity.NavigationLabelAuditEntity;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface NavigationLabelAuditRepository extends JpaRepository<NavigationLabelAuditEntity, Long> {
    List<NavigationLabelAuditEntity> findByLabelIdOrderByCreatedAtAsc(String labelId);
    List<NavigationLabelAuditEntity> findByGroupKeyOrderByCreatedAtAsc(String groupKey);
    List<NavigationLabelAuditEntity> findByUsernameOrderByCreatedAtAsc(String username);
    List<NavigationLabelAuditEntity> findAllByOrderByCreatedAtDesc();
}