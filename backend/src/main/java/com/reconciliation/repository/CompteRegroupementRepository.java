package com.reconciliation.repository;

import com.reconciliation.entity.CompteRegroupementEntity;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface CompteRegroupementRepository extends JpaRepository<CompteRegroupementEntity, Long> {
    
    /**
     * Trouve tous les comptes regroupés pour un compte original donné
     */
    @Query("SELECT cr.compteRegroupe FROM CompteRegroupementEntity cr WHERE cr.compteOriginal.id = :compteOriginalId AND cr.actif = true")
    List<CompteRegroupementEntity> findComptesRegroupesByCompteOriginal(@Param("compteOriginalId") Long compteOriginalId);
    
    /**
     * Trouve tous les comptes originaux pour un compte regroupé donné
     */
    @Query("SELECT cr.compteOriginal FROM CompteRegroupementEntity cr WHERE cr.compteRegroupe.id = :compteRegroupeId AND cr.actif = true")
    List<CompteRegroupementEntity> findComptesOriginauxByCompteRegroupe(@Param("compteRegroupeId") Long compteRegroupeId);
    
    /**
     * Vérifie si un compte est regroupé
     */
    @Query("SELECT COUNT(cr) > 0 FROM CompteRegroupementEntity cr WHERE cr.compteOriginal.id = :compteId AND cr.actif = true")
    boolean isCompteRegroupe(@Param("compteId") Long compteId);
    
    /**
     * Vérifie si un compte est un compte consolidé
     */
    @Query("SELECT COUNT(cr) > 0 FROM CompteRegroupementEntity cr WHERE cr.compteRegroupe.id = :compteId AND cr.actif = true")
    boolean isCompteConsolide(@Param("compteId") Long compteId);
    
    /**
     * Trouve toutes les relations de regroupement actives
     */
    @Query("SELECT cr FROM CompteRegroupementEntity cr WHERE cr.actif = true")
    List<CompteRegroupementEntity> findAllActives();
    
    /**
     * Trouve les relations de regroupement pour un compte original
     */
    List<CompteRegroupementEntity> findByCompteOriginalIdAndActifTrue(Long compteOriginalId);
    
    /**
     * Trouve les relations de regroupement pour un compte consolidé
     */
    List<CompteRegroupementEntity> findByCompteRegroupeIdAndActifTrue(Long compteRegroupeId);
}
