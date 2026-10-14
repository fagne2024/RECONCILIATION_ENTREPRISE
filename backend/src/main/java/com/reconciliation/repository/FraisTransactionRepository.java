package com.reconciliation.repository;

import com.reconciliation.entity.FraisTransactionEntity;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface FraisTransactionRepository extends JpaRepository<FraisTransactionEntity, Long> {
    
    // Trouver par service et agence
    Optional<FraisTransactionEntity> findByServiceAndAgenceAndActifTrue(String service, String agence);
    
    // Trouver tous les frais actifs par service
    List<FraisTransactionEntity> findByServiceAndActifTrue(String service);
    
    // Trouver tous les frais actifs par agence
    List<FraisTransactionEntity> findByAgenceAndActifTrue(String agence);
    
    // Trouver tous les frais actifs
    List<FraisTransactionEntity> findByActifTrue();
    
    // Trouver par service (tous, actifs et inactifs)
    List<FraisTransactionEntity> findByService(String service);
    
    // Trouver par agence (tous, actifs et inactifs)
    List<FraisTransactionEntity> findByAgence(String agence);
    
    // Nouvelles méthodes avec tri par date de modification décroissante
    @Query("SELECT ft FROM FraisTransactionEntity ft WHERE ft.actif = true ORDER BY ft.dateModification DESC")
    List<FraisTransactionEntity> findByActifTrueOrderByDateModificationDesc();
    
    @Query("SELECT ft FROM FraisTransactionEntity ft ORDER BY ft.dateModification DESC")
    List<FraisTransactionEntity> findAllOrderByDateModificationDesc();
    
    @Query("SELECT ft FROM FraisTransactionEntity ft WHERE ft.service = :service AND ft.actif = true ORDER BY ft.dateModification DESC")
    List<FraisTransactionEntity> findByServiceAndActifTrueOrderByDateModificationDesc(@Param("service") String service);
    
    @Query("SELECT ft FROM FraisTransactionEntity ft WHERE ft.agence = :agence AND ft.actif = true ORDER BY ft.dateModification DESC")
    List<FraisTransactionEntity> findByAgenceAndActifTrueOrderByDateModificationDesc(@Param("agence") String agence);
    
    // Requête personnalisée pour trouver le frais applicable
    @Query("SELECT ft FROM FraisTransactionEntity ft WHERE ft.service = :service AND ft.agence = :agence AND ft.actif = true")
    Optional<FraisTransactionEntity> findFraisApplicable(@Param("service") String service, @Param("agence") String agence);
    
    // Trouver tous les services uniques
    @Query("SELECT DISTINCT ft.service FROM FraisTransactionEntity ft WHERE ft.actif = true")
    List<String> findDistinctServices();
    
    // Trouver toutes les agences uniques
    @Query("SELECT DISTINCT ft.agence FROM FraisTransactionEntity ft WHERE ft.actif = true")
    List<String> findDistinctAgences();
    
    // Calculer le total des frais de transaction avec filtres de dates
    @Query("SELECT COALESCE(SUM(ft.montantFrais), 0) FROM FraisTransactionEntity ft WHERE (:agency IS NULL OR ft.agence = :agency) AND (:service IS NULL OR ft.service = :service) AND (:startDate IS NULL OR ft.dateCreation >= :startDate) AND (:endDate IS NULL OR ft.dateCreation <= :endDate)")
    Double calculateTotalFeesWithDateRange(
        @Param("agency") String agency,
        @Param("service") String service,
        @Param("startDate") String startDate,
        @Param("endDate") String endDate
    );
    
    // Compter le nombre de jours avec des frais de transaction
    @Query("SELECT COUNT(DISTINCT ft.dateCreation) FROM FraisTransactionEntity ft WHERE (:agency IS NULL OR ft.agence = :agency) AND (:service IS NULL OR ft.service = :service) AND (:startDate IS NULL OR ft.dateCreation >= :startDate) AND (:endDate IS NULL OR ft.dateCreation <= :endDate)")
    long countDaysWithFees(
        @Param("agency") String agency,
        @Param("service") String service,
        @Param("startDate") String startDate,
        @Param("endDate") String endDate
    );
    
    // Trouver la date minimale des frais de transaction
    @Query("SELECT MIN(ft.dateCreation) FROM FraisTransactionEntity ft")
    String findMinFeeDate();
    
    // Trouver la date maximale des frais de transaction
    @Query("SELECT MAX(ft.dateCreation) FROM FraisTransactionEntity ft")
    String findMaxFeeDate();
} 