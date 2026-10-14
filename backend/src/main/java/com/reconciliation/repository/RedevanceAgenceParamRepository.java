package com.reconciliation.repository;

import com.reconciliation.entity.RedevanceAgenceParamEntity;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface RedevanceAgenceParamRepository extends JpaRepository<RedevanceAgenceParamEntity, Long> {
    Optional<RedevanceAgenceParamEntity> findByAgence(String agence);
}
