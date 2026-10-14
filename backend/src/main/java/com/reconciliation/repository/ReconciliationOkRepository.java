package com.reconciliation.repository;

import com.reconciliation.entity.ReconciliationOkEntity;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.Optional;

@Repository
public interface ReconciliationOkRepository extends JpaRepository<ReconciliationOkEntity, Long> {
    Optional<ReconciliationOkEntity> findByKeyValue(String keyValue);
    boolean existsByKeyValue(String keyValue);
    void deleteByKeyValue(String keyValue);
}


