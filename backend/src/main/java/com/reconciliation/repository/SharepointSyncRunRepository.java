package com.reconciliation.repository;

import com.reconciliation.entity.SharepointSyncRunEntity;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface SharepointSyncRunRepository extends JpaRepository<SharepointSyncRunEntity, Long> {
    List<SharepointSyncRunEntity> findTop50ByOrderByStartedAtDescIdDesc();
}
