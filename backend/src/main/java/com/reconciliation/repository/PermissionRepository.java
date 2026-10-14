package com.reconciliation.repository;

import com.reconciliation.entity.PermissionEntity;
import org.springframework.data.jpa.repository.JpaRepository;

public interface PermissionRepository extends JpaRepository<PermissionEntity, Long> {
    boolean existsByNom(String nom);
    PermissionEntity findByNom(String nom);
} 