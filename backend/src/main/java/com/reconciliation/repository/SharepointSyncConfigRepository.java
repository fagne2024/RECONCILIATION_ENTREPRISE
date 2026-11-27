package com.reconciliation.repository;

import com.reconciliation.entity.SharepointSyncConfigEntity;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface SharepointSyncConfigRepository extends JpaRepository<SharepointSyncConfigEntity, Long> {
    /** Configuration de l entreprise courante (filtrée par le tenant Hibernate). */
    Optional<SharepointSyncConfigEntity> findFirstByOrderByIdAsc();
}
