package com.reconciliation.repository;

import com.reconciliation.entity.ReconciliationStatusEntity;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.Optional;

@Repository
public interface ReconciliationStatusRepository extends JpaRepository<ReconciliationStatusEntity, Long> {
    Optional<ReconciliationStatusEntity> findByKeyValue(String keyValue);
}


