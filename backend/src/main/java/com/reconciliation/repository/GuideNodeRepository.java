package com.reconciliation.repository;

import com.reconciliation.entity.GuideNodeEntity;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface GuideNodeRepository extends JpaRepository<GuideNodeEntity, Long> {
    
    Optional<GuideNodeEntity> findByNodeId(String nodeId);
    
    List<GuideNodeEntity> findByParentIsNullOrderByDisplayOrderAsc();
    
    List<GuideNodeEntity> findByParentIdOrderByDisplayOrderAsc(Long parentId);
    
    List<GuideNodeEntity> findByParentOrderByDisplayOrderAsc(GuideNodeEntity parent);
    
    boolean existsByNodeId(String nodeId);
    
    void deleteByNodeId(String nodeId);
}
