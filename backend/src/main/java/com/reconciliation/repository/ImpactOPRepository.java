package com.reconciliation.repository;

import com.reconciliation.entity.ImpactOPEntity;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.LocalDateTime;
import java.util.List;

@Repository
public interface ImpactOPRepository extends JpaRepository<ImpactOPEntity, Long> {

    /**
     * Rechercher les impacts OP avec filtres
     */
    @Query("SELECT i FROM ImpactOPEntity i WHERE " +
           "(:codeProprietaire IS NULL OR LOWER(i.codeProprietaire) = LOWER(:codeProprietaire)) AND " +
           "(:typeOperation IS NULL OR LOWER(i.typeOperation) = LOWER(:typeOperation)) AND " +
           "(:groupeReseau IS NULL OR LOWER(i.groupeReseau) = LOWER(:groupeReseau)) AND " +
           "(:numeroTransGU IS NULL OR LOWER(i.numeroTransGU) = LOWER(:numeroTransGU)) AND " +
           "(:statut IS NULL OR i.statut = :statut) AND " +
           "(:dateDebut IS NULL OR i.dateOperation >= :dateDebut) AND " +
           "(:dateFin IS NULL OR i.dateOperation <= :dateFin) AND " +
           "(:montantMin IS NULL OR i.montant >= :montantMin) AND " +
           "(:montantMax IS NULL OR i.montant <= :montantMax) " +
           "ORDER BY i.dateOperation DESC")
    List<ImpactOPEntity> findWithFilters(
            @Param("codeProprietaire") String codeProprietaire,
            @Param("typeOperation") String typeOperation,
            @Param("groupeReseau") String groupeReseau,
            @Param("numeroTransGU") String numeroTransGU,
            @Param("statut") ImpactOPEntity.Statut statut,
            @Param("dateDebut") LocalDateTime dateDebut,
            @Param("dateFin") LocalDateTime dateFin,
            @Param("montantMin") Double montantMin,
            @Param("montantMax") Double montantMax);

    /**
     * Trouver par code propriétaire
     */
    List<ImpactOPEntity> findByCodeProprietaire(String codeProprietaire);

    /**
     * Trouver par type d'opération
     */
    List<ImpactOPEntity> findByTypeOperation(String typeOperation);

    /**
     * Trouver par groupe réseau
     */
    List<ImpactOPEntity> findByGroupeReseau(String groupeReseau);

    /**
     * Trouver par statut
     */
    List<ImpactOPEntity> findByStatut(ImpactOPEntity.Statut statut);

    /**
     * Trouver par numéro de transaction GU
     */
    List<ImpactOPEntity> findByNumeroTransGU(String numeroTransGU);

    /**
     * Compter par statut
     */
    long countByStatut(ImpactOPEntity.Statut statut);

    /**
     * Trouver les codes propriétaires distincts
     */
    @Query("SELECT DISTINCT i.codeProprietaire FROM ImpactOPEntity i ORDER BY i.codeProprietaire")
    List<String> findDistinctCodeProprietaires();

    /**
     * Trouver les types d'opération distincts
     */
    @Query("SELECT DISTINCT i.typeOperation FROM ImpactOPEntity i ORDER BY i.typeOperation")
    List<String> findDistinctTypeOperations();

    /**
     * Trouver les groupes réseau distincts
     */
    @Query("SELECT DISTINCT i.groupeReseau FROM ImpactOPEntity i ORDER BY i.groupeReseau")
    List<String> findDistinctGroupeReseaux();
    
    /**
     * Trouver les numéros de transaction GU distincts
     */
    @Query("SELECT DISTINCT i.numeroTransGU FROM ImpactOPEntity i WHERE i.numeroTransGU IS NOT NULL AND i.numeroTransGU != '' ORDER BY i.numeroTransGU")
    List<String> findDistinctNumeroTransGU();

    /**
     * Calculer la somme des montants par statut
     */
    @Query("SELECT SUM(i.montant) FROM ImpactOPEntity i WHERE i.statut = :statut")
    Double sumMontantByStatut(@Param("statut") ImpactOPEntity.Statut statut);

    /**
     * Calculer la somme totale des montants
     */
    @Query("SELECT SUM(i.montant) FROM ImpactOPEntity i")
    Double sumTotalMontant();

    /**
     * Vérifier si un impact existe déjà (pour éviter les doublons)
     */
    boolean existsByCodeProprietaireAndNumeroTransGUAndDateOperation(
            String codeProprietaire, String numeroTransGU, LocalDateTime dateOperation);

    /**
     * Trouver les impacts OP par code propriétaire et période de dates
     */
    List<ImpactOPEntity> findByCodeProprietaireAndDateOperationBetween(
            String codeProprietaire, LocalDateTime dateDebut, LocalDateTime dateFin);
} 