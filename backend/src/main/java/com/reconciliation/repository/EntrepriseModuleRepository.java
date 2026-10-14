package com.reconciliation.repository;

import com.reconciliation.entity.EntrepriseModuleEntity;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface EntrepriseModuleRepository extends JpaRepository<EntrepriseModuleEntity, Long> {
    List<EntrepriseModuleEntity> findByEntrepriseId(Long entrepriseId);
    List<EntrepriseModuleEntity> findByEntrepriseIdAndActifTrue(Long entrepriseId);
    Optional<EntrepriseModuleEntity> findByEntrepriseIdAndModuleId(Long entrepriseId, Long moduleId);
    boolean existsByEntrepriseIdAndModuleIdAndActifTrue(Long entrepriseId, Long moduleId);
}