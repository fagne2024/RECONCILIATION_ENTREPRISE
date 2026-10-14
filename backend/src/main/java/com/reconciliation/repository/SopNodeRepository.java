package com.reconciliation.repository;

import com.reconciliation.entity.SopNodeEntity;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface SopNodeRepository extends JpaRepository<SopNodeEntity, Long> {
    
    Optional<SopNodeEntity> findByNodeId(String nodeId);
    
    List<SopNodeEntity> findByParentIsNullOrderByDisplayOrderAsc();
    
    List<SopNodeEntity> findByParentIdOrderByDisplayOrderAsc(Long parentId);
    
    List<SopNodeEntity> findByParentOrderByDisplayOrderAsc(SopNodeEntity parent);
    
    boolean existsByNodeId(String nodeId);
    
    void deleteByNodeId(String nodeId);
}

