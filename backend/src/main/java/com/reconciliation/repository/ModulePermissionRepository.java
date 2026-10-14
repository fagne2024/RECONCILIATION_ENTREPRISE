package com.reconciliation.repository;

import com.reconciliation.entity.ModulePermissionEntity;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;

public interface ModulePermissionRepository extends JpaRepository<ModulePermissionEntity, Long> {
    List<ModulePermissionEntity> findByModuleId(Long moduleId);
} 