package com.reconciliation.repository;

import com.reconciliation.entity.ProfilPermissionEntity;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

public interface ProfilPermissionRepository extends JpaRepository<ProfilPermissionEntity, Long> {
    List<ProfilPermissionEntity> findByProfilId(Long profilId);
    List<ProfilPermissionEntity> findByModuleId(Long moduleId);
    List<ProfilPermissionEntity> findByPermissionId(Long permissionId);
    List<ProfilPermissionEntity> findByProfilIdAndModuleId(Long profilId, Long moduleId);
    Optional<ProfilPermissionEntity> findByProfilIdAndModuleIdAndPermissionId(Long profilId, Long moduleId, Long permissionId);

    @Modifying
    @Query("DELETE FROM ProfilPermissionEntity pp WHERE pp.profil.id = :profilId")
    void deleteByProfilId(@Param("profilId") Long profilId);
} 