package com.reconciliation.repository;

import com.reconciliation.entity.ModuleEntity;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ModuleRepository extends JpaRepository<ModuleEntity, Long> {
    boolean existsByNom(String nom);
    ModuleEntity findByNom(String nom);
    ModuleEntity findByNomIgnoreCase(String nom);
} 