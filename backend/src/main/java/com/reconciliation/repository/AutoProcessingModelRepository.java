package com.reconciliation.repository;

import com.reconciliation.entity.AutoProcessingModel;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface AutoProcessingModelRepository extends JpaRepository<AutoProcessingModel, Long> {
    
    Optional<AutoProcessingModel> findByModelId(String modelId);
    
    Optional<AutoProcessingModel> findByName(String name);
    
    boolean existsByModelId(String modelId);
    
    boolean existsByName(String name);
    
    // Charger tous les modèles avec leurs règles en une seule requête (optimisation N+1)
    @Query("SELECT DISTINCT m FROM AutoProcessingModel m LEFT JOIN FETCH m.columnProcessingRules ORDER BY m.id")
    List<AutoProcessingModel> findAllWithRules();
} 