package com.reconciliation.repository;

import com.reconciliation.entity.OperationEntity;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.LocalDateTime;
import java.util.List;

@Repository
public interface OperationRepository extends JpaRepository<OperationEntity, Long> {
    
    @Query("SELECT o FROM OperationEntity o WHERE o.compte.id = :compteId " +
           "AND o.typeOperation NOT LIKE 'annulation_%' " +
           "AND (o.statut IS NULL OR o.statut != 'Annulée')")
    List<OperationEntity> findByCompteId(@Param("compteId") Long compteId);
    
    List<OperationEntity> findByTypeOperation(String typeOperation);
    
    List<OperationEntity> findByPays(String pays);
    
    List<OperationEntity> findByStatut(String statut);
    
    List<OperationEntity> findByBanque(String banque);
    
    List<OperationEntity> findByService(String service);
    
    @Query("SELECT o FROM OperationEntity o WHERE o.dateOperation BETWEEN :dateDebut AND :dateFin")
    List<OperationEntity> findByDateOperationBetween(@Param("dateDebut") LocalDateTime dateDebut, 
                                                    @Param("dateFin") LocalDateTime dateFin);

    @Query("SELECT o FROM OperationEntity o WHERE o.typeOperation = 'FRAIS_TRANSACTION' " +
           "AND (:dateDebut IS NULL OR o.dateOperation >= :dateDebut) " +
           "AND (:dateFin IS NULL OR o.dateOperation <= :dateFin)")
    List<OperationEntity> findFraisTransactionsByDateRange(
        @Param("dateDebut") LocalDateTime dateDebut,
        @Param("dateFin") LocalDateTime dateFin
    );
    
    @Query("SELECT o FROM OperationEntity o WHERE o.montant > :montantMin")
    List<OperationEntity> findByMontantSuperieurA(@Param("montantMin") Double montantMin);
    
    @Query("SELECT o FROM OperationEntity o WHERE o.codeProprietaire = :codeProprietaire")
    List<OperationEntity> findByCodeProprietaire(@Param("codeProprietaire") String codeProprietaire);
    
    @Query("SELECT o FROM OperationEntity o WHERE LOWER(o.nomBordereau) LIKE CONCAT('%', LOWER(:nomBordereau), '%')")
    List<OperationEntity> findByNomBordereauContaining(@Param("nomBordereau") String nomBordereau);
    
    @Query("SELECT DISTINCT o.codeProprietaire FROM OperationEntity o WHERE o.codeProprietaire IS NOT NULL AND o.codeProprietaire != '' ORDER BY o.codeProprietaire")
    List<String> findDistinctCodeProprietaire();
    
    @Query("SELECT DISTINCT o.banque FROM OperationEntity o WHERE o.banque IS NOT NULL AND o.banque != '' ORDER BY o.banque")
    List<String> findDistinctBanque();
    
    @Query("SELECT DISTINCT o.service FROM OperationEntity o WHERE o.service IS NOT NULL AND o.service != '' ORDER BY o.service")
    List<String> findDistinctService();
    
    @Query("SELECT DISTINCT o.service FROM OperationEntity o WHERE o.codeProprietaire = :codeProprietaire AND o.service IS NOT NULL AND o.service != '' ORDER BY o.service")
    List<String> findDistinctServiceByCodeProprietaire(@Param("codeProprietaire") String codeProprietaire);
    
    @Query("SELECT o FROM OperationEntity o ORDER BY o.dateOperation DESC")
    List<OperationEntity> findAllOrderByDateOperationDesc();
    
    @Query("SELECT o FROM OperationEntity o WHERE o.compte.id = :compteId " +
           "AND o.typeOperation NOT LIKE 'annulation_%' " +
           "AND (o.statut IS NULL OR o.statut != 'Annulée') " +
           "ORDER BY o.dateOperation DESC")
    List<OperationEntity> findByCompteIdOrderByDateOperationDesc(@Param("compteId") Long compteId);
    
    @Query("SELECT o FROM OperationEntity o WHERE o.compte.numeroCompte = :numeroCompte " +
           "AND (:dateDebut IS NULL OR o.dateOperation >= :dateDebut) " +
           "AND (:dateFin IS NULL OR o.dateOperation <= :dateFin) " +
           "AND (:typeOperation IS NULL OR o.typeOperation = :typeOperation) " +
           "ORDER BY o.dateOperation DESC")
    List<OperationEntity> findByCompteNumeroCompteAndFiltersOrderByDateOperationDesc(
            @Param("numeroCompte") String numeroCompte,
            @Param("dateDebut") LocalDateTime dateDebut,
            @Param("dateFin") LocalDateTime dateFin,
            @Param("typeOperation") String typeOperation);
    
    @Query("SELECT o FROM OperationEntity o WHERE o.compte.numeroCompte = :numeroCompte " +
           "AND (:dateDebut IS NULL OR o.dateOperation >= :dateDebut) " +
           "AND (:dateFin IS NULL OR o.dateOperation <= :dateFin) " +
           "AND (:typeOperation IS NULL OR o.typeOperation = :typeOperation) " +
           "ORDER BY o.dateOperation ASC")
    List<OperationEntity> findByCompteNumeroCompteAndFiltersOrderByDateOperationAsc(
            @Param("numeroCompte") String numeroCompte,
            @Param("dateDebut") LocalDateTime dateDebut,
            @Param("dateFin") LocalDateTime dateFin,
            @Param("typeOperation") String typeOperation);

    @Query("SELECT o FROM OperationEntity o WHERE o.compte.numeroCompte IN :numeros " +
           "AND (:dateDebut IS NULL OR o.dateOperation >= :dateDebut) " +
           "AND (:dateFin IS NULL OR o.dateOperation <= :dateFin) " +
           "AND (:typeOperation IS NULL OR o.typeOperation = :typeOperation) " +
           "ORDER BY o.dateOperation DESC")
    List<OperationEntity> findByCompteNumeroInAndFiltersOrderByDateOperationDesc(
            @Param("numeros") List<String> numeros,
            @Param("dateDebut") LocalDateTime dateDebut,
            @Param("dateFin") LocalDateTime dateFin,
            @Param("typeOperation") String typeOperation);

    @Query("SELECT o FROM OperationEntity o WHERE o.compte.numeroCompte IN :numeros " +
           "AND (:dateDebut IS NULL OR o.dateOperation >= :dateDebut) " +
           "AND (:dateFin IS NULL OR o.dateOperation <= :dateFin) " +
           "AND (:typeOperation IS NULL OR o.typeOperation = :typeOperation) " +
           "ORDER BY o.dateOperation ASC")
    List<OperationEntity> findByCompteNumeroInAndFiltersOrderByDateOperationAsc(
            @Param("numeros") List<String> numeros,
            @Param("dateDebut") LocalDateTime dateDebut,
            @Param("dateFin") LocalDateTime dateFin,
            @Param("typeOperation") String typeOperation);
    
    @Query("SELECT o FROM OperationEntity o WHERE o.typeOperation = :typeOperation ORDER BY o.dateOperation DESC")
    List<OperationEntity> findByTypeOperationOrderByDateOperationDesc(@Param("typeOperation") String typeOperation);
    
    @Query("SELECT o FROM OperationEntity o WHERE o.pays = :pays ORDER BY o.dateOperation DESC")
    List<OperationEntity> findByPaysOrderByDateOperationDesc(@Param("pays") String pays);
    
    @Query("SELECT o FROM OperationEntity o WHERE o.pays IN :paysCodes ORDER BY o.dateOperation DESC")
    List<OperationEntity> findByPaysInOrderByDateOperationDesc(@Param("paysCodes") List<String> paysCodes);
    
    @Query("SELECT o FROM OperationEntity o WHERE o.statut = :statut ORDER BY o.dateOperation DESC")
    List<OperationEntity> findByStatutOrderByDateOperationDesc(@Param("statut") String statut);
    
    @Query("SELECT o FROM OperationEntity o WHERE o.banque = :banque ORDER BY o.dateOperation DESC")
    List<OperationEntity> findByBanqueOrderByDateOperationDesc(@Param("banque") String banque);
    
    @Query("SELECT o FROM OperationEntity o WHERE o.service = :service ORDER BY o.dateOperation DESC")
    List<OperationEntity> findByServiceOrderByDateOperationDesc(@Param("service") String service);
    
    @Query("SELECT o FROM OperationEntity o WHERE o.montant > :montantMin ORDER BY o.dateOperation DESC")
    List<OperationEntity> findByMontantSuperieurAOrderByDateOperationDesc(@Param("montantMin") Double montantMin);
    
    @Query("SELECT o FROM OperationEntity o WHERE o.codeProprietaire = :codeProprietaire ORDER BY o.dateOperation DESC")
    List<OperationEntity> findByCodeProprietaireOrderByDateOperationDesc(@Param("codeProprietaire") String codeProprietaire);
    
    @Query("SELECT o FROM OperationEntity o WHERE o.nomBordereau LIKE %:nomBordereau% ORDER BY o.dateOperation DESC")
    List<OperationEntity> findByNomBordereauContainingOrderByDateOperationDesc(@Param("nomBordereau") String nomBordereau);
    
    @Query("SELECT o FROM OperationEntity o WHERE " +
           "(:compteId IS NULL OR o.compte.id = :compteId) AND " +
           "(:typeOperation IS NULL OR LOWER(o.typeOperation) = LOWER(:typeOperation)) AND " +
           "(:pays IS NULL OR LOWER(o.pays) = LOWER(:pays)) AND " +
           "(:statut IS NULL OR LOWER(o.statut) = LOWER(:statut)) AND " +
           "(:banque IS NULL OR LOWER(o.banque) = LOWER(:banque)) AND " +
           "(:codeProprietaire IS NULL OR LOWER(o.codeProprietaire) = LOWER(:codeProprietaire)) AND " +
           "(:service IS NULL OR LOWER(o.service) = LOWER(:service)) AND " +
           "(:nomBordereau IS NULL OR LOWER(o.nomBordereau) LIKE CONCAT('%', LOWER(:nomBordereau), '%')) AND " +
           "(:dateDebut IS NULL OR o.dateOperation >= :dateDebut) AND " +
           "(:dateFin IS NULL OR o.dateOperation <= :dateFin) " +
           "ORDER BY o.dateOperation DESC")
    List<OperationEntity> findFilteredOperationsOrderByDateOperationDesc(
            @Param("compteId") Long compteId,
            @Param("typeOperation") String typeOperation,
            @Param("pays") String pays,
            @Param("statut") String statut,
            @Param("banque") String banque,
            @Param("codeProprietaire") String codeProprietaire,
            @Param("service") String service,
            @Param("nomBordereau") String nomBordereau,
            @Param("dateDebut") LocalDateTime dateDebut,
            @Param("dateFin") LocalDateTime dateFin);
    
    List<OperationEntity> findByCompteIdAndDateOperationAfterOrderByDateOperationAsc(Long compteId, LocalDateTime dateOperation);

    List<OperationEntity> findByCompteIdAndTypeOperationContainingIgnoreCaseOrderByDateOperationDesc(Long compteId, String typeOperation);
    List<OperationEntity> findByCompteIdAndBanqueContainingIgnoreCaseOrderByDateOperationDesc(Long compteId, String banque);
    List<OperationEntity> findByCompteIdAndCodeProprietaireContainingIgnoreCaseOrderByDateOperationDesc(Long compteId, String codeProprietaire);
    List<OperationEntity> findByCompteIdAndServiceContainingIgnoreCaseOrderByDateOperationDesc(Long compteId, String service);
    
    @Query("SELECT DISTINCT o.codeProprietaire FROM OperationEntity o WHERE o.codeProprietaire IS NOT NULL ORDER BY o.codeProprietaire")
    List<String> findDistinctAgency();

    @Query("SELECT DISTINCT o.typeOperation FROM OperationEntity o WHERE o.typeOperation IS NOT NULL AND o.typeOperation != '' ORDER BY o.typeOperation")
    List<String> findDistinctTypeOperation();

    @Query("SELECT DISTINCT o.pays FROM OperationEntity o WHERE o.pays IS NOT NULL AND o.pays != '' ORDER BY o.pays")
    List<String> findDistinctPays();

    @Query("SELECT DISTINCT o.statut FROM OperationEntity o WHERE o.statut IS NOT NULL AND o.statut != '' ORDER BY o.statut")
    List<String> findDistinctStatut();

    @Query("SELECT o.typeOperation, COUNT(o), COALESCE(SUM(o.montant), 0), COALESCE(AVG(o.montant), 0) FROM OperationEntity o WHERE (:services IS NULL OR o.service IN :services) AND (:pays IS NULL OR o.pays IN :pays) AND (:startDate IS NULL OR o.dateOperation >= :startDate) AND (:endDate IS NULL OR o.dateOperation <= :endDate) AND (o.typeOperation NOT LIKE 'annulation_%' OR o.typeOperation = 'annulation_bo') GROUP BY o.typeOperation")
    List<Object[]> getOperationTypeStatisticsWithDateRange(
        @Param("services") List<String> services,
        @Param("pays") List<String> pays,
        @Param("startDate") LocalDateTime startDate,
        @Param("endDate") LocalDateTime endDate
    );

    @Query("SELECT o.typeOperation, COUNT(o) FROM OperationEntity o WHERE (:services IS NULL OR o.service IN :services) AND (:pays IS NULL OR o.pays IN :pays) AND (:startDate IS NULL OR o.dateOperation >= :startDate) AND (:endDate IS NULL OR o.dateOperation <= :endDate) AND (o.typeOperation NOT LIKE 'annulation_%' OR o.typeOperation = 'annulation_bo') GROUP BY o.typeOperation ORDER BY COUNT(o) DESC")
    List<Object[]> getOperationFrequencyWithDateRange(
        @Param("services") List<String> services,
        @Param("pays") List<String> pays,
        @Param("startDate") LocalDateTime startDate,
        @Param("endDate") LocalDateTime endDate
    );

    List<OperationEntity> findByCompteIdOrderByDateOperationAsc(Long compteId);
    
    // Trouver les opérations de frais liées à une opération nominale
    @Query("SELECT o FROM OperationEntity o WHERE o.parentOperationId = :parentOperationId AND o.typeOperation = 'FRAIS_TRANSACTION'")
    List<OperationEntity> findFraisByParentOperationId(@Param("parentOperationId") Long parentOperationId);

    @Query("SELECT SUM(o.montant) FROM OperationEntity o WHERE o.typeOperation = :typeOperation"
         + " AND (:agence IS NULL OR o.codeProprietaire = :agence)"
         + " AND (:service IS NULL OR o.service = :service)"
         + " AND (:pays IS NULL OR o.pays = :pays)"
         + " AND (:startDate IS NULL OR o.dateOperation >= :startDate)"
         + " AND (:endDate IS NULL OR o.dateOperation <= :endDate)")
    Double sumMontantByTypeOperationWithFilters(
        @Param("typeOperation") String typeOperation,
        @Param("agence") String agence,
        @Param("service") String service,
        @Param("pays") String pays,
        @Param("startDate") LocalDateTime startDate,
        @Param("endDate") LocalDateTime endDate
    );

    @Query("SELECT COUNT(o) FROM OperationEntity o WHERE o.typeOperation = 'Compense_client' " +
           "AND o.codeProprietaire = :codeProprietaire " +
           "AND DATE(o.dateOperation) = DATE(:dateOperation)")
    Long countCompenseOperationsByCodeProprietaireAndDate(
        @Param("codeProprietaire") String codeProprietaire,
        @Param("dateOperation") LocalDateTime dateOperation
    );

    @Query("SELECT COUNT(o) FROM OperationEntity o WHERE o.typeOperation = 'Compense_client' " +
           "AND o.codeProprietaire = :codeProprietaire " +
           "AND DATE(o.dateOperation) = DATE(:dateOperation) " +
           "AND o.id != :operationIdToExclude")
    Long countCompenseOperationsByCodeProprietaireAndDateExcludingId(
        @Param("codeProprietaire") String codeProprietaire,
        @Param("dateOperation") LocalDateTime dateOperation,
        @Param("operationIdToExclude") Long operationIdToExclude
    );

    @Query("SELECT COUNT(o) FROM OperationEntity o WHERE o.typeOperation = 'Appro_client' " +
           "AND o.codeProprietaire = :codeProprietaire " +
           "AND DATE(o.dateOperation) = DATE(:dateOperation)")
    Long countApprovisionnementOperationsByCodeProprietaireAndDate(
        @Param("codeProprietaire") String codeProprietaire,
        @Param("dateOperation") LocalDateTime dateOperation
    );

    @Query("SELECT COUNT(o) FROM OperationEntity o WHERE o.typeOperation = 'Appro_client' " +
           "AND o.codeProprietaire = :codeProprietaire " +
           "AND DATE(o.dateOperation) = DATE(:dateOperation)")
    Long countApproClientOperationsByCodeProprietaireAndDate(
        @Param("codeProprietaire") String codeProprietaire,
        @Param("dateOperation") LocalDateTime dateOperation
    );

    @Query("SELECT COUNT(o) FROM OperationEntity o WHERE o.typeOperation = 'Appro_client' " +
           "AND o.codeProprietaire = :codeProprietaire " +
           "AND DATE(o.dateOperation) = DATE(:dateOperation) " +
           "AND o.id != :operationIdToExclude")
    Long countApproClientOperationsByCodeProprietaireAndDateExcludingId(
        @Param("codeProprietaire") String codeProprietaire,
        @Param("dateOperation") LocalDateTime dateOperation,
        @Param("operationIdToExclude") Long operationIdToExclude
    );

    @Query("SELECT COUNT(o) FROM OperationEntity o WHERE o.typeOperation = 'Appro_fournisseur' " +
           "AND o.codeProprietaire = :codeProprietaire " +
           "AND DATE(o.dateOperation) = DATE(:dateOperation)")
    Long countApproFournisseurOperationsByCodeProprietaireAndDate(
        @Param("codeProprietaire") String codeProprietaire,
        @Param("dateOperation") LocalDateTime dateOperation
    );

    @Query("SELECT COUNT(o) FROM OperationEntity o WHERE o.typeOperation = 'Appro_fournisseur' " +
           "AND o.codeProprietaire = :codeProprietaire " +
           "AND DATE(o.dateOperation) = DATE(:dateOperation) " +
           "AND o.id != :operationIdToExclude")
    Long countApproFournisseurOperationsByCodeProprietaireAndDateExcludingId(
        @Param("codeProprietaire") String codeProprietaire,
        @Param("dateOperation") LocalDateTime dateOperation,
        @Param("operationIdToExclude") Long operationIdToExclude
    );

    @Query("SELECT COUNT(o) FROM OperationEntity o WHERE o.typeOperation = 'Compense_fournisseur' " +
           "AND o.codeProprietaire = :codeProprietaire " +
           "AND DATE(o.dateOperation) = DATE(:dateOperation)")
    Long countCompenseFournisseurOperationsByCodeProprietaireAndDate(
        @Param("codeProprietaire") String codeProprietaire,
        @Param("dateOperation") LocalDateTime dateOperation
    );

    @Query("SELECT COUNT(o) FROM OperationEntity o WHERE o.typeOperation = 'Compense_fournisseur' " +
           "AND o.codeProprietaire = :codeProprietaire " +
           "AND DATE(o.dateOperation) = DATE(:dateOperation) " +
           "AND o.id != :operationIdToExclude")
    Long countCompenseFournisseurOperationsByCodeProprietaireAndDateExcludingId(
        @Param("codeProprietaire") String codeProprietaire,
        @Param("dateOperation") LocalDateTime dateOperation,
        @Param("operationIdToExclude") Long operationIdToExclude
    );

    @Query("SELECT COUNT(o) FROM OperationEntity o WHERE o.typeOperation = 'nivellement' " +
           "AND DATE(o.dateOperation) = DATE(:dateOperation)")
    Long countNivellementOperationsByDate(
        @Param("dateOperation") LocalDateTime dateOperation
    );

    @Query("SELECT COUNT(o) FROM OperationEntity o WHERE o.typeOperation = 'nivellement' " +
           "AND DATE(o.dateOperation) = DATE(:dateOperation) " +
           "AND o.id != :operationIdToExclude")
    Long countNivellementOperationsByDateExcludingId(
        @Param("dateOperation") LocalDateTime dateOperation,
        @Param("operationIdToExclude") Long operationIdToExclude
    );

    @Query("SELECT COUNT(o) FROM OperationEntity o WHERE o.typeOperation = 'nivellement' " +
           "AND o.codeProprietaire = :codeProprietaire " +
           "AND DATE(o.dateOperation) = DATE(:dateOperation)")
    Long countNivellementOperationsByCodeProprietaireAndDate(
        @Param("codeProprietaire") String codeProprietaire,
        @Param("dateOperation") LocalDateTime dateOperation
    );

    @Query("SELECT COUNT(o) FROM OperationEntity o WHERE o.typeOperation = 'nivellement' " +
           "AND o.codeProprietaire = :codeProprietaire " +
           "AND DATE(o.dateOperation) = DATE(:dateOperation) " +
           "AND o.id != :operationIdToExclude")
    Long countNivellementOperationsByCodeProprietaireAndDateExcludingId(
        @Param("codeProprietaire") String codeProprietaire,
        @Param("dateOperation") LocalDateTime dateOperation,
        @Param("operationIdToExclude") Long operationIdToExclude
    );

    // Méthode pour récupérer les opérations valides (non annulées) d'un compte triées par date décroissante
    @Query("SELECT o FROM OperationEntity o WHERE o.compte.id = :compteId AND o.statut != :statutExclu ORDER BY o.dateOperation DESC")
    List<OperationEntity> findByCompteIdAndStatutNotOrderByDateOperationDesc(
        @Param("compteId") Long compteId, 
        @Param("statutExclu") String statutExclu
    );

    // Méthode pour détecter les doublons lors de l'import
    @Query("SELECT o FROM OperationEntity o WHERE o.compte.id = :compteId " +
           "AND o.typeOperation = :typeOperation " +
           "AND o.montant = :montant " +
           "AND o.service = :service " +
           "AND o.dateOperation = :dateOperation")
    List<OperationEntity> findByCompteIdAndTypeOperationAndMontantAndServiceAndDateOperation(
        @Param("compteId") Long compteId,
        @Param("typeOperation") String typeOperation,
        @Param("montant") Double montant,
        @Param("service") String service,
        @Param("dateOperation") LocalDateTime dateOperation
    );
} 