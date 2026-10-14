package com.reconciliation.repository;

import com.reconciliation.entity.SopDocumentEntity;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.Optional;

@Repository
public interface SopDocumentRepository extends JpaRepository<SopDocumentEntity, Long> {
    
    Optional<SopDocumentEntity> findByNodeIdAndOptionType(String nodeId, String optionType);
    
    boolean existsByNodeIdAndOptionType(String nodeId, String optionType);
}


