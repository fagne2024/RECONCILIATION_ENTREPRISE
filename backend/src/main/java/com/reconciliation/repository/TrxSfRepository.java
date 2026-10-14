package com.reconciliation.repository;

import com.reconciliation.entity.TrxSfEntity;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.LocalDateTime;
import java.util.List;

@Repository
public interface TrxSfRepository extends JpaRepository<TrxSfEntity, Long> {
    
    List<TrxSfEntity> findByAgence(String agence);
    
    List<TrxSfEntity> findByService(String service);
    
    List<TrxSfEntity> findByPays(String pays);
    
    List<TrxSfEntity> findByStatut(String statut);
    
    List<TrxSfEntity> findByDateTransactionBetween(LocalDateTime dateDebut, LocalDateTime dateFin);
    
    List<TrxSfEntity> findByDateImportBetween(LocalDateTime dateDebut, LocalDateTime dateFin);
    
    @Query("SELECT t FROM TrxSfEntity t WHERE t.agence = :agence AND t.dateTransaction BETWEEN :dateDebut AND :dateFin")
    List<TrxSfEntity> findByAgenceAndDateTransactionBetween(
            @Param("agence") String agence, 
            @Param("dateDebut") LocalDateTime dateDebut, 
            @Param("dateFin") LocalDateTime dateFin);
    
    @Query("SELECT t FROM TrxSfEntity t WHERE t.service = :service AND t.dateTransaction BETWEEN :dateDebut AND :dateFin")
    List<TrxSfEntity> findByServiceAndDateTransactionBetween(
            @Param("service") String service, 
            @Param("dateDebut") LocalDateTime dateDebut, 
            @Param("dateFin") LocalDateTime dateFin);
    
    @Query("SELECT t FROM TrxSfEntity t WHERE t.pays = :pays AND t.dateTransaction BETWEEN :dateDebut AND :dateFin")
    List<TrxSfEntity> findByPaysAndDateTransactionBetween(
            @Param("pays") String pays, 
            @Param("dateDebut") LocalDateTime dateDebut, 
            @Param("dateFin") LocalDateTime dateFin);
    
    @Query("SELECT t FROM TrxSfEntity t WHERE t.statut = :statut AND t.dateTransaction BETWEEN :dateDebut AND :dateFin")
    List<TrxSfEntity> findByStatutAndDateTransactionBetween(
            @Param("statut") String statut, 
            @Param("dateDebut") LocalDateTime dateDebut, 
            @Param("dateFin") LocalDateTime dateFin);
    
    @Query("SELECT DISTINCT t.agence FROM TrxSfEntity t WHERE t.agence IS NOT NULL AND t.agence != '' ORDER BY t.agence")
    List<String> findDistinctAgence();
    
    @Query("SELECT DISTINCT t.service FROM TrxSfEntity t WHERE t.service IS NOT NULL AND t.service != '' ORDER BY t.service")
    List<String> findDistinctService();
    
    @Query("SELECT DISTINCT t.pays FROM TrxSfEntity t WHERE t.pays IS NOT NULL AND t.pays != '' ORDER BY t.pays")
    List<String> findDistinctPays();
    
    @Query("SELECT DISTINCT t.numeroTransGu FROM TrxSfEntity t WHERE t.numeroTransGu IS NOT NULL AND t.numeroTransGu != '' ORDER BY t.numeroTransGu")
    List<String> findDistinctNumeroTransGu();
    
    /**
     * Rechercher les transactions par agence et numéro Trans GU
     */
    @Query("SELECT t FROM TrxSfEntity t WHERE t.agence = :agence AND t.numeroTransGu = :numeroTransGu")
    List<TrxSfEntity> findByAgenceAndNumeroTransGu(@Param("agence") String agence, @Param("numeroTransGu") String numeroTransGu);
    
    @Query("SELECT t FROM TrxSfEntity t ORDER BY t.dateTransaction DESC")
    List<TrxSfEntity> findAllOrderByDateTransactionDesc();
    
    @Query("SELECT t FROM TrxSfEntity t ORDER BY t.dateImport DESC")
    List<TrxSfEntity> findAllOrderByDateImportDesc();
    
    boolean existsByIdTransaction(String idTransaction);
    
    @Query("SELECT COUNT(t) FROM TrxSfEntity t WHERE t.statut = :statut")
    Long countByStatut(@Param("statut") String statut);
    
    @Query("SELECT SUM(t.montant) FROM TrxSfEntity t WHERE t.statut = :statut")
    Double sumMontantByStatut(@Param("statut") String statut);
    
    @Query("SELECT SUM(t.frais) FROM TrxSfEntity t WHERE t.statut = :statut")
    Double sumFraisByStatut(@Param("statut") String statut);
    
    // Requetes natives : le filtre @TenantId de Hibernate ne s'applique pas,
    // la condition d'entreprise doit donc etre explicite (isolation).
    @Query(value = "SELECT SUM(frais) FROM trx_sf WHERE entreprise_id = :tenantId AND agence = :agence AND DATE(date_transaction) = :date", nativeQuery = true)
    Double sumFraisByAgenceAndDate(@Param("tenantId") Long tenantId, @Param("agence") String agence, @Param("date") String date);
    
    @Query(value = "SELECT SUM(frais) FROM trx_sf WHERE entreprise_id = :tenantId AND agence = :agence AND DATE(date_transaction) = :date AND statut = 'EN_ATTENTE'", nativeQuery = true)
    Double sumFraisByAgenceAndDateAndStatutEnAttente(@Param("tenantId") Long tenantId, @Param("agence") String agence, @Param("date") String date);

    @Query(value = "SELECT SUM(frais) FROM trx_sf WHERE entreprise_id = :tenantId AND agence = :agence AND DATE(date_transaction) = :date AND service = :service", nativeQuery = true)
    Double sumFraisByAgenceAndDateAndService(@Param("tenantId") Long tenantId, @Param("agence") String agence, @Param("date") String date, @Param("service") String service);

    @Query(value = "SELECT SUM(frais) FROM trx_sf WHERE entreprise_id = :tenantId AND agence = :agence AND DATE(date_transaction) = :date AND service = :service AND statut = 'EN_ATTENTE'", nativeQuery = true)
    Double sumFraisByAgenceAndDateAndServiceAndStatutEnAttente(@Param("tenantId") Long tenantId, @Param("agence") String agence, @Param("date") String date, @Param("service") String service);
    
    /**
     * Rechercher les transactions SF avec filtres
     */
    @Query("SELECT t FROM TrxSfEntity t WHERE " +
           "(:agence IS NULL OR t.agence = :agence) AND " +
           "(:service IS NULL OR t.service = :service) AND " +
           "(:pays IS NULL OR t.pays = :pays) AND " +
           "(:numeroTransGu IS NULL OR t.numeroTransGu = :numeroTransGu) AND " +
           "(:statut IS NULL OR t.statut = :statut) AND " +
           "(:dateDebut IS NULL OR t.dateTransaction >= :dateDebut) AND " +
           "(:dateFin IS NULL OR t.dateTransaction <= :dateFin) " +
           "ORDER BY t.dateTransaction DESC")
    List<TrxSfEntity> findWithFilters(
            @Param("agence") String agence,
            @Param("service") String service,
            @Param("pays") String pays,
            @Param("numeroTransGu") String numeroTransGu,
            @Param("statut") String statut,
            @Param("dateDebut") LocalDateTime dateDebut,
            @Param("dateFin") LocalDateTime dateFin);
    
    /**
     * Vérifier si une transaction existe déjà
     */
    @Query(value = "SELECT COUNT(*) FROM trx_sf WHERE entreprise_id = :tenantId AND id_transaction = :idTransaction AND agence = :agence AND DATE(date_transaction) = DATE(:dateTransaction)", nativeQuery = true)
    Long countByTransactionDetails(@Param("tenantId") Long tenantId, @Param("idTransaction") String idTransaction, @Param("agence") String agence, @Param("dateTransaction") String dateTransaction);
    
    /**
     * Trouver les transactions en doublon
     */
    @Query(value = """
        SELECT t1.* FROM trx_sf t1
        INNER JOIN (
            SELECT id_transaction, agence, DATE(date_transaction) as transaction_date, COUNT(*) as count
            FROM trx_sf
            WHERE entreprise_id = :tenantId
            GROUP BY id_transaction, agence, DATE(date_transaction)
            HAVING COUNT(*) > 1
        ) t2 ON t1.id_transaction = t2.id_transaction 
            AND t1.agence = t2.agence 
            AND DATE(t1.date_transaction) = t2.transaction_date
        WHERE t1.entreprise_id = :tenantId
        ORDER BY t1.id_transaction, t1.date_transaction
        """, nativeQuery = true)
    List<TrxSfEntity> findDuplicates(@Param("tenantId") Long tenantId);
    
    /**
     * Supprimer les doublons en gardant la plus récente
     */
    @Modifying
    @Query(value = """
        DELETE t1 FROM trx_sf t1
        INNER JOIN trx_sf t2 ON t1.id_transaction = t2.id_transaction 
            AND t1.agence = t2.agence 
            AND DATE(t1.date_transaction) = DATE(t2.date_transaction)
            AND t1.id < t2.id
        WHERE t1.entreprise_id = :tenantId AND t2.entreprise_id = :tenantId
        """, nativeQuery = true)
    int removeDuplicates(@Param("tenantId") Long tenantId);
}
