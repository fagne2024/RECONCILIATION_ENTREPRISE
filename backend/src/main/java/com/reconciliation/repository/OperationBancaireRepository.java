package com.reconciliation.repository;

import com.reconciliation.entity.OperationBancaireEntity;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

@Repository
public interface OperationBancaireRepository extends JpaRepository<OperationBancaireEntity, Long> {
    
    // Récupérer toutes les opérations bancaires triées par date décroissante
    @Query("SELECT o FROM OperationBancaireEntity o ORDER BY o.dateOperation DESC")
    List<OperationBancaireEntity> findAllOrderByDateOperationDesc();
    
    // Récupérer les opérations bancaires par pays
    @Query("SELECT o FROM OperationBancaireEntity o WHERE o.pays = :pays ORDER BY o.dateOperation DESC")
    List<OperationBancaireEntity> findByPaysOrderByDateOperationDesc(@Param("pays") String pays);
    
    // Récupérer les opérations bancaires par plusieurs pays
    @Query("SELECT o FROM OperationBancaireEntity o WHERE o.pays IN :paysCodes ORDER BY o.dateOperation DESC")
    List<OperationBancaireEntity> findByPaysInOrderByDateOperationDesc(@Param("paysCodes") List<String> paysCodes);
    
    // Récupérer les opérations bancaires par agence
    @Query("SELECT o FROM OperationBancaireEntity o WHERE o.agence = :agence ORDER BY o.dateOperation DESC")
    List<OperationBancaireEntity> findByAgenceOrderByDateOperationDesc(@Param("agence") String agence);
    
    // Récupérer les opérations bancaires par statut
    @Query("SELECT o FROM OperationBancaireEntity o WHERE o.statut = :statut ORDER BY o.dateOperation DESC")
    List<OperationBancaireEntity> findByStatutOrderByDateOperationDesc(@Param("statut") String statut);
    
    // Récupérer les opérations bancaires par type d'opération
    @Query("SELECT o FROM OperationBancaireEntity o WHERE o.typeOperation = :typeOperation ORDER BY o.dateOperation DESC")
    List<OperationBancaireEntity> findByTypeOperationOrderByDateOperationDesc(@Param("typeOperation") String typeOperation);
    
    // Récupérer les opérations bancaires par plage de dates
    @Query("SELECT o FROM OperationBancaireEntity o WHERE o.dateOperation BETWEEN :dateDebut AND :dateFin ORDER BY o.dateOperation DESC")
    List<OperationBancaireEntity> findByDateOperationBetween(@Param("dateDebut") LocalDateTime dateDebut, 
                                                             @Param("dateFin") LocalDateTime dateFin);
    
    // Récupérer les opérations bancaires par référence
    Optional<OperationBancaireEntity> findByReference(String reference);
    
    // Récupérer les opérations bancaires par ID d'opération liée
    @Query("SELECT o FROM OperationBancaireEntity o WHERE o.operationId = :operationId ORDER BY o.dateOperation DESC")
    List<OperationBancaireEntity> findByOperationId(@Param("operationId") Long operationId);
    
    // Filtrer les opérations bancaires avec plusieurs critères
    @Query("SELECT o FROM OperationBancaireEntity o WHERE " +
           "(:pays IS NULL OR o.pays = :pays) AND " +
           "(:codePays IS NULL OR o.codePays = :codePays) AND " +
           "(:mois IS NULL OR o.mois = :mois) AND " +
           "(:agence IS NULL OR o.agence = :agence) AND " +
           "(:typeOperation IS NULL OR o.typeOperation = :typeOperation) AND " +
           "(:statut IS NULL OR o.statut = :statut) AND " +
           "(:dateDebut IS NULL OR o.dateOperation >= :dateDebut) AND " +
           "(:dateFin IS NULL OR o.dateOperation <= :dateFin) AND " +
           "(:reference IS NULL OR o.reference LIKE %:reference%) " +
           "ORDER BY o.dateOperation DESC")
    List<OperationBancaireEntity> findFilteredOperationsOrderByDateOperationDesc(
            @Param("pays") String pays,
            @Param("codePays") String codePays,
            @Param("mois") String mois,
            @Param("agence") String agence,
            @Param("typeOperation") String typeOperation,
            @Param("statut") String statut,
            @Param("dateDebut") LocalDateTime dateDebut,
            @Param("dateFin") LocalDateTime dateFin,
            @Param("reference") String reference);
    
    // Récupérer les pays distincts
    @Query("SELECT DISTINCT o.pays FROM OperationBancaireEntity o WHERE o.pays IS NOT NULL ORDER BY o.pays")
    List<String> findDistinctPays();
    
    // Récupérer les agences distinctes
    @Query("SELECT DISTINCT o.agence FROM OperationBancaireEntity o WHERE o.agence IS NOT NULL ORDER BY o.agence")
    List<String> findDistinctAgences();
    
    // Récupérer les types d'opération distincts
    @Query("SELECT DISTINCT o.typeOperation FROM OperationBancaireEntity o WHERE o.typeOperation IS NOT NULL ORDER BY o.typeOperation")
    List<String> findDistinctTypesOperation();
    
    // Récupérer les statuts distincts
    @Query("SELECT DISTINCT o.statut FROM OperationBancaireEntity o WHERE o.statut IS NOT NULL ORDER BY o.statut")
    List<String> findDistinctStatuts();
}

