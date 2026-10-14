package com.reconciliation.repository;

import com.reconciliation.entity.ColumnProcessingRule;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Repository
public interface ColumnProcessingRuleRepository extends JpaRepository<ColumnProcessingRule, Long> {
    
    List<ColumnProcessingRule> findByAutoProcessingModelIdOrderByRuleOrderAsc(Long modelId);
    
    @Query("SELECT cpr FROM ColumnProcessingRule cpr WHERE cpr.autoProcessingModel.modelId = :modelId ORDER BY cpr.ruleOrder ASC")
    List<ColumnProcessingRule> findByAutoProcessingModelModelIdOrderByRuleOrderAsc(@Param("modelId") String modelId);
    
    void deleteByAutoProcessingModelId(Long modelId);
    
    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Transactional
    @Query("DELETE FROM ColumnProcessingRule cpr WHERE cpr.autoProcessingModel.modelId = :modelId")
    void deleteByAutoProcessingModelModelId(@Param("modelId") String modelId);
}
