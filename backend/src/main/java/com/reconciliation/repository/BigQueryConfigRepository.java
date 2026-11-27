package com.reconciliation.repository;

import com.reconciliation.entity.BigQueryConfigEntity;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface BigQueryConfigRepository extends JpaRepository<BigQueryConfigEntity, Long> {
    Optional<BigQueryConfigEntity> findFirstByOrderByIdAsc();
}
