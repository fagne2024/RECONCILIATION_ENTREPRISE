package com.reconciliation.repository;

import com.reconciliation.entity.EcartSoldeEntity;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.LocalDateTime;
import java.util.List;

@Repository
public interface EcartSoldeRepository extends JpaRepository<EcartSoldeEntity, Long> {
    
    List<EcartSoldeEntity> findByAgence(String agence);
    
    List<EcartSoldeEntity> findByService(String service);
    
    List<EcartSoldeEntity> findByPays(String pays);
    
    List<EcartSoldeEntity> findByStatut(String statut);
    
    List<EcartSoldeEntity> findByDateTransactionBetween(LocalDateTime dateDebut, LocalDateTime dateFin);
    
    List<EcartSoldeEntity> findByDateImportBetween(LocalDateTime dateDebut, LocalDateTime dateFin);
    
    @Query("SELECT e FROM EcartSoldeEntity e WHERE e.agence = :agence AND e.dateTransaction BETWEEN :dateDebut AND :dateFin")
    List<EcartSoldeEntity> findByAgenceAndDateTransactionBetween(
            @Param("agence") String agence, 
            @Param("dateDebut") LocalDateTime dateDebut, 
            @Param("dateFin") LocalDateTime dateFin);
    
    @Query("SELECT e FROM EcartSoldeEntity e WHERE e.service = :service AND e.dateTransaction BETWEEN :dateDebut AND :dateFin")
    List<EcartSoldeEntity> findByServiceAndDateTransactionBetween(
            @Param("service") String service, 
            @Param("dateDebut") LocalDateTime dateDebut, 
            @Param("dateFin") LocalDateTime dateFin);
    
    @Query("SELECT e FROM EcartSoldeEntity e WHERE e.pays = :pays AND e.dateTransaction BETWEEN :dateDebut AND :dateFin")
    List<EcartSoldeEntity> findByPaysAndDateTransactionBetween(
            @Param("pays") String pays, 
            @Param("dateDebut") LocalDateTime dateDebut, 
            @Param("dateFin") LocalDateTime dateFin);
    
    @Query("SELECT e FROM EcartSoldeEntity e WHERE e.statut = :statut AND e.dateTransaction BETWEEN :dateDebut AND :dateFin")
    List<EcartSoldeEntity> findByStatutAndDateTransactionBetween(
            @Param("statut") String statut, 
            @Param("dateDebut") LocalDateTime dateDebut, 
            @Param("dateFin") LocalDateTime dateFin);
    
    @Query("SELECT DISTINCT e.agence FROM EcartSoldeEntity e WHERE e.agence IS NOT NULL AND e.agence != '' ORDER BY e.agence")
    List<String> findDistinctAgence();
    
    @Query("SELECT DISTINCT e.service FROM EcartSoldeEntity e WHERE e.service IS NOT NULL AND e.service != '' ORDER BY e.service")
    List<String> findDistinctService();
    
    @Query("SELECT DISTINCT e.pays FROM EcartSoldeEntity e WHERE e.pays IS NOT NULL AND e.pays != '' ORDER BY e.pays")
    List<String> findDistinctPays();
    
    @Query("SELECT DISTINCT e.numeroTransGu FROM EcartSoldeEntity e WHERE e.numeroTransGu IS NOT NULL AND e.numeroTransGu != '' ORDER BY e.numeroTransGu")
    List<String> findDistinctNumeroTransGu();
    
    @Query("SELECT e FROM EcartSoldeEntity e ORDER BY e.dateTransaction DESC")
    List<EcartSoldeEntity> findAllOrderByDateTransactionDesc();
    
    @Query("SELECT e FROM EcartSoldeEntity e ORDER BY e.dateImport DESC")
    List<EcartSoldeEntity> findAllOrderByDateImportDesc();
    
    /**
     * Rechercher les écarts de solde avec filtres
     */
    @Query("SELECT e FROM EcartSoldeEntity e WHERE " +
           "(:agence IS NULL OR e.agence = :agence) AND " +
           "(:service IS NULL OR e.service = :service) AND " +
           "(:pays IS NULL OR e.pays = :pays) AND " +
           "(:numeroTransGu IS NULL OR e.numeroTransGu = :numeroTransGu) AND " +
           "(:statut IS NULL OR e.statut = :statut) AND " +
           "(:dateDebut IS NULL OR e.dateTransaction >= :dateDebut) AND " +
           "(:dateFin IS NULL OR e.dateTransaction <= :dateFin) " +
           "ORDER BY e.dateTransaction DESC")
    List<EcartSoldeEntity> findWithFilters(
            @Param("agence") String agence,
            @Param("service") String service,
            @Param("pays") String pays,
            @Param("numeroTransGu") String numeroTransGu,
            @Param("statut") String statut,
            @Param("dateDebut") LocalDateTime dateDebut,
            @Param("dateFin") LocalDateTime dateFin);
    
    boolean existsByIdTransaction(String idTransaction);
} 