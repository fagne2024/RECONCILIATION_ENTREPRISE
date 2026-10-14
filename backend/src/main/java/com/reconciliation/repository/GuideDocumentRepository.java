package com.reconciliation.repository;

import com.reconciliation.entity.GuideDocumentEntity;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.Optional;

@Repository
public interface GuideDocumentRepository extends JpaRepository<GuideDocumentEntity, Long> {
    
    Optional<GuideDocumentEntity> findByNodeIdAndOptionType(String nodeId, String optionType);
    
    boolean existsByNodeIdAndOptionType(String nodeId, String optionType);
}
