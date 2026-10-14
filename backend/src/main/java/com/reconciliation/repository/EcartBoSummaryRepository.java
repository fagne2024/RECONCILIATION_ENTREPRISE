package com.reconciliation.repository;

import com.reconciliation.entity.EcartBoSummaryEntity;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.LocalDateTime;
import java.util.List;

@Repository
public interface EcartBoSummaryRepository extends JpaRepository<EcartBoSummaryEntity, Long> {
    
    List<EcartBoSummaryEntity> findByAgence(String agence);
    
    List<EcartBoSummaryEntity> findByService(String service);
    
    List<EcartBoSummaryEntity> findByPays(String pays);
    
    List<EcartBoSummaryEntity> findByStatut(String statut);
    
    List<EcartBoSummaryEntity> findByAgenceAndServiceAndPays(String agence, String service, String pays);
    
    List<EcartBoSummaryEntity> findByDateTransactionBetween(LocalDateTime dateDebut, LocalDateTime dateFin);
    
    @Query("SELECT DISTINCT e.agence FROM EcartBoSummaryEntity e WHERE e.agence IS NOT NULL ORDER BY e.agence")
    List<String> findDistinctAgence();
    
    @Query("SELECT DISTINCT e.service FROM EcartBoSummaryEntity e WHERE e.service IS NOT NULL ORDER BY e.service")
    List<String> findDistinctService();
    
    @Query("SELECT DISTINCT e.pays FROM EcartBoSummaryEntity e WHERE e.pays IS NOT NULL ORDER BY e.pays")
    List<String> findDistinctPays();
    
    @Query("SELECT e FROM EcartBoSummaryEntity e ORDER BY e.dateImport DESC")
    List<EcartBoSummaryEntity> findAllOrderByDateImportDesc();

    List<EcartBoSummaryEntity> findByToken(String token);

    @Query("SELECT e FROM EcartBoSummaryEntity e WHERE e.token IS NOT NULL AND LOWER(e.token) LIKE LOWER(CONCAT('%', :token, '%')) ORDER BY e.dateImport DESC")
    List<EcartBoSummaryEntity> findByTokenContaining(@Param("token") String token);

    @Query("""
        SELECT e FROM EcartBoSummaryEntity e
        WHERE (:agence IS NULL OR e.agence = :agence)
          AND (:service IS NULL OR e.service = :service)
          AND (
              :paysVariants IS NULL
              OR LOWER(TRIM(e.pays)) IN :paysVariants
          )
          AND (:statut IS NULL OR e.statut = :statut)
          AND (:platform IS NULL OR UPPER(e.env) = UPPER(:platform))
          AND (:startDate IS NULL OR e.dateTransaction >= :startDate)
          AND (:endDate IS NULL OR e.dateTransaction <= :endDate)
          AND (
              :env IS NULL
              OR UPPER(COALESCE(e.envCode, '')) = UPPER(:env)
              OR (:env = 'T-E' AND (e.envCode IS NULL OR TRIM(e.envCode) = '' OR UPPER(e.envCode) = 'TOTAL'))
          )
        ORDER BY e.dateImport DESC
    """)
    List<EcartBoSummaryEntity> findByFilters(
            @Param("agence") String agence,
            @Param("service") String service,
            @Param("paysVariants") List<String> paysVariants,
            @Param("statut") String statut,
            @Param("platform") String platform,
            @Param("startDate") LocalDateTime startDate,
            @Param("endDate") LocalDateTime endDate,
            @Param("env") String env
    );
}
