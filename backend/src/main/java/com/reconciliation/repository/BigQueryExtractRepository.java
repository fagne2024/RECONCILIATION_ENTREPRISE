package com.reconciliation.repository;

import com.reconciliation.entity.BigQueryExtractEntity;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface BigQueryExtractRepository extends JpaRepository<BigQueryExtractEntity, Long> {
    List<BigQueryExtractEntity> findTop50ByOrderByStartedAtDescIdDesc();

    /** Extractions réussies d une requête, de la plus récente à la plus ancienne. */
    List<BigQueryExtractEntity> findByQueryIdAndStatusOrderByStartedAtDescIdDesc(Long queryId, String status);
}
