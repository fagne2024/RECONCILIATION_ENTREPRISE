package com.reconciliation.repository;

import com.reconciliation.entity.SharepointSyncSourceEntity;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface SharepointSyncSourceRepository extends JpaRepository<SharepointSyncSourceEntity, Long> {
    List<SharepointSyncSourceEntity> findAllByOrderByIdAsc();

    List<SharepointSyncSourceEntity> findByEnabledTrueOrderByIdAsc();
}
