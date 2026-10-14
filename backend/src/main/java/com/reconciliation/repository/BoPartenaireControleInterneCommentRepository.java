package com.reconciliation.repository;

import com.reconciliation.entity.BoPartenaireControleInterneCommentEntity;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface BoPartenaireControleInterneCommentRepository
    extends JpaRepository<BoPartenaireControleInterneCommentEntity, Long> {

    Optional<BoPartenaireControleInterneCommentEntity> findByMonthYyyyMmAndCountryAndEnv(
        String monthYyyyMm,
        String country,
        String env
    );
}
