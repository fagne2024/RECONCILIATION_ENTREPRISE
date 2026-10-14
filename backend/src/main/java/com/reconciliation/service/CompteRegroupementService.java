package com.reconciliation.service;

import com.reconciliation.entity.CompteEntity;
import com.reconciliation.entity.CompteRegroupementEntity;
import com.reconciliation.repository.CompteRegroupementRepository;
import com.reconciliation.repository.CompteRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;

@Service
public class CompteRegroupementService {
    
    private static final Logger logger = LoggerFactory.getLogger(CompteRegroupementService.class);
    
    @Autowired
    private CompteRegroupementRepository compteRegroupementRepository;
    
    @Autowired
    private CompteRepository compteRepository;
    
    /**
     * Crée une relation de regroupement entre un compte consolidé et un compte original
     */
    @Transactional
    public CompteRegroupementEntity createRegroupementRelation(CompteEntity compteRegroupe, CompteEntity compteOriginal) {
        CompteRegroupementEntity relation = new CompteRegroupementEntity(compteRegroupe, compteOriginal);
        CompteRegroupementEntity savedRelation = compteRegroupementRepository.save(relation);
        
        logger.info("Relation de regroupement créée: compte consolidé {} -> compte original {}", 
                   compteRegroupe.getNumeroCompte(), compteOriginal.getNumeroCompte());
        
        return savedRelation;
    }
    
    /**
     * Synchronise le solde d'un compte consolidé basé sur les soldes des comptes originaux
     */
    @Transactional
    public void synchroniserSoldeCompteConsolide(Long compteConsolideId) {
        try {
            CompteEntity compteConsolide = compteRepository.findById(compteConsolideId)
                .orElseThrow(() -> new RuntimeException("Compte consolidé non trouvé: " + compteConsolideId));
            
            List<CompteRegroupementEntity> relations = compteRegroupementRepository
                .findByCompteRegroupeIdAndActifTrue(compteConsolideId);
            
            if (relations.isEmpty()) {
                logger.warn("Aucune relation de regroupement trouvée pour le compte consolidé: {}", compteConsolideId);
                return;
            }
            
            // Calculer le solde total des comptes originaux
            double soldeTotal = 0.0;
            for (CompteRegroupementEntity relation : relations) {
                CompteEntity compteOriginal = relation.getCompteOriginal();
                soldeTotal += compteOriginal.getSolde();
                logger.debug("Compte original {}: solde = {}", 
                           compteOriginal.getNumeroCompte(), compteOriginal.getSolde());
            }
            
            // Mettre à jour le solde du compte consolidé
            double ancienSolde = compteConsolide.getSolde();
            compteConsolide.setSolde(soldeTotal);
            compteConsolide.setDateDerniereMaj(LocalDateTime.now());
            compteRepository.save(compteConsolide);
            
            logger.info("Solde synchronisé pour le compte consolidé {}: {} -> {} (différence: {})", 
                       compteConsolide.getNumeroCompte(), ancienSolde, soldeTotal, 
                       soldeTotal - ancienSolde);
            
        } catch (Exception e) {
            logger.error("Erreur lors de la synchronisation du solde du compte consolidé {}: {}", 
                        compteConsolideId, e.getMessage(), e);
            throw new RuntimeException("Erreur de synchronisation: " + e.getMessage(), e);
        }
    }
    
    /**
     * Synchronise tous les comptes consolidés
     */
    @Transactional
    public void synchroniserTousLesComptesConsolides() {
        logger.info("Début de la synchronisation de tous les comptes consolidés");
        
        List<CompteRegroupementEntity> toutesLesRelations = compteRegroupementRepository.findAllActives();
        
        // Grouper par compte consolidé
        toutesLesRelations.stream()
            .map(CompteRegroupementEntity::getCompteRegroupe)
            .distinct()
            .forEach(compteConsolide -> {
                try {
                    synchroniserSoldeCompteConsolide(compteConsolide.getId());
                } catch (Exception e) {
                    logger.error("Erreur lors de la synchronisation du compte consolidé {}: {}", 
                               compteConsolide.getNumeroCompte(), e.getMessage());
                }
            });
        
        logger.info("Fin de la synchronisation de tous les comptes consolidés");
    }
    
    /**
     * Synchronise les comptes consolidés basé sur le codeProprietaire
     * Cette méthode trouve les comptes consolidés qui contiennent le service dans leur codeProprietaire
     */
    @Transactional
    public void synchroniserComptesConsolidesParCodeProprietaire(String serviceCode) {
        try {
            logger.info("Synchronisation des comptes consolidés pour le service: {}", serviceCode);
            
            // Trouver tous les comptes consolidés qui ont ce service dans leur codeProprietaire
            List<CompteEntity> comptesConsolides = compteRepository.findAll().stream()
                .filter(compte -> compte.getCodeProprietaire() != null && 
                                 compte.getCodeProprietaire().contains(serviceCode))
                .toList();
            
            logger.info("Trouvé {} comptes consolidés contenant le service {}", comptesConsolides.size(), serviceCode);
            
            for (CompteEntity compteConsolide : comptesConsolides) {
                try {
                    synchroniserSoldeCompteConsolide(compteConsolide.getId());
                    logger.info("✅ Compte consolidé synchronisé: {}", compteConsolide.getNumeroCompte());
                } catch (Exception e) {
                    logger.error("❌ Erreur lors de la synchronisation du compte consolidé {}: {}", 
                               compteConsolide.getNumeroCompte(), e.getMessage());
                }
            }
            
        } catch (Exception e) {
            logger.error("Erreur lors de la synchronisation par codeProprietaire pour le service {}: {}", 
                        serviceCode, e.getMessage(), e);
        }
    }
    
    /**
     * Trouve tous les comptes consolidés qui dépendent d'un compte original
     */
    public List<CompteEntity> getComptesConsolidesDependants(Long compteOriginalId) {
        return compteRegroupementRepository.findByCompteOriginalIdAndActifTrue(compteOriginalId)
            .stream()
            .map(CompteRegroupementEntity::getCompteRegroupe)
            .toList();
    }
    
    /**
     * Vérifie si un compte est un compte consolidé
     */
    public boolean isCompteConsolide(Long compteId) {
        return compteRegroupementRepository.isCompteConsolide(compteId);
    }
    
    /**
     * Vérifie si un compte est regroupé dans un compte consolidé
     */
    public boolean isCompteRegroupe(Long compteId) {
        return compteRegroupementRepository.isCompteRegroupe(compteId);
    }
    
    /**
     * Désactive une relation de regroupement
     */
    @Transactional
    public void desactiverRelationRegroupement(Long relationId) {
        CompteRegroupementEntity relation = compteRegroupementRepository.findById(relationId)
            .orElseThrow(() -> new RuntimeException("Relation de regroupement non trouvée: " + relationId));
        
        relation.setActif(false);
        compteRegroupementRepository.save(relation);
        
        logger.info("Relation de regroupement désactivée: {}", relationId);
    }
}
