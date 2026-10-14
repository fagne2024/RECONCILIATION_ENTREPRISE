package com.reconciliation.repository;

import com.reconciliation.entity.AgencyThresholdEntity;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface AgencyThresholdRepository extends JpaRepository<AgencyThresholdEntity, Long> {
    
    /**
     * Trouve le seuil pour une agence et un type d'opération spécifique
     */
    Optional<AgencyThresholdEntity> findByCodeProprietaireAndTypeOperation(String codeProprietaire, String typeOperation);
    
    /**
     * Trouve tous les seuils pour un type d'opération
     */
    List<AgencyThresholdEntity> findByTypeOperation(String typeOperation);
    
    /**
     * Trouve tous les seuils pour une agence
     */
    List<AgencyThresholdEntity> findByCodeProprietaire(String codeProprietaire);
    
    /**
     * Vérifie si un seuil existe pour une agence et un type d'opération
     */
    boolean existsByCodeProprietaireAndTypeOperation(String codeProprietaire, String typeOperation);
}

