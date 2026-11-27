package com.reconciliation.repository;

import com.reconciliation.entity.BigQueryQueryEntity;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface BigQueryQueryRepository extends JpaRepository<BigQueryQueryEntity, Long> {
    List<BigQueryQueryEntity> findAllByOrderByIdAsc();

    List<BigQueryQueryEntity> findByEnabledTrueOrderByIdAsc();
}
