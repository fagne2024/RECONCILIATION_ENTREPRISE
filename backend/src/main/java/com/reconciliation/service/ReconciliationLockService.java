package com.reconciliation.service;

import com.reconciliation.entity.ReconciliationLock;
import com.reconciliation.repository.ReconciliationLockRepository;
import jakarta.persistence.EntityManager;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;
import java.util.concurrent.TimeUnit;

/**
 * Service pour gérer les verrous de réconciliation
 * Permet de gérer la concurrence lors de réconciliations simultanées
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class ReconciliationLockService {
    
    private final ReconciliationLockRepository lockRepository;
    private final EntityManager entityManager;
    private final com.reconciliation.repository.EntrepriseRepository entrepriseRepository;
    private final org.springframework.transaction.PlatformTransactionManager transactionManager;
    
    // Types de verrous disponibles
    public static final String LOCK_TYPE_GLOBAL = "GLOBAL";
    public static final String LOCK_TYPE_USER = "USER";
    public static final String LOCK_TYPE_JOB = "JOB";
    public static final String LOCK_TYPE_UPLOAD = "UPLOAD";
    
    // Durée par défaut d'un verrou (30 minutes)
    private static final long DEFAULT_LOCK_DURATION_MINUTES = 30;
    
    /**
     * Tente d'acquérir un verrou
     * 
     * @param lockKey Clé du verrou
     * @param lockType Type du verrou
     * @param userId Identifiant de l'utilisateur
     * @param jobId Identifiant du job (optionnel)
     * @param durationMinutes Durée du verrou en minutes
     * @return true si le verrou a été acquis, false sinon
     */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public boolean acquireLock(String lockKey, String lockType, String userId, String jobId, long durationMinutes) {
        try {
            // Nettoyer les verrous expirés avant d'essayer d'acquérir un nouveau verrou
            cleanupExpiredLocks();
            
            // Vérifier si un verrou actif existe déjà
            Optional<ReconciliationLock> existingLock = lockRepository.findActiveLock(
                lockKey, lockType, LocalDateTime.now());
            
            if (existingLock.isPresent()) {
                ReconciliationLock lock = existingLock.get();
                log.warn("⚠️ Verrou déjà existant pour key={}, type={}, détenu par userId={}, jobId={}", 
                    lockKey, lockType, lock.getUserId(), lock.getJobId());
                return false;
            }
            
            // Créer un nouveau verrou
            ReconciliationLock lock = new ReconciliationLock();
            lock.setLockKey(lockKey);
            lock.setLockType(lockType);
            lock.setUserId(userId);
            lock.setJobId(jobId);
            lock.setExpiresAt(LocalDateTime.now().plusMinutes(durationMinutes));
            
            lockRepository.save(lock);
            
            log.info("✅ Verrou acquis avec succès: key={}, type={}, userId={}, jobId={}, expiresAt={}", 
                lockKey, lockType, userId, jobId, lock.getExpiresAt());
            
            return true;
            
        } catch (Exception e) {
            log.error("❌ Erreur lors de l'acquisition du verrou: key={}, type={}, error={}", 
                lockKey, lockType, e.getMessage(), e);
            return false;
        }
    }
    
    /**
     * Tente d'acquérir un verrou avec durée par défaut
     */
    public boolean acquireLock(String lockKey, String lockType, String userId, String jobId) {
        return acquireLock(lockKey, lockType, userId, jobId, DEFAULT_LOCK_DURATION_MINUTES);
    }
    
    /**
     * Libère un verrou
     * 
     * @param lockKey Clé du verrou
     * @param lockType Type du verrou
     * @return true si le verrou a été libéré, false sinon
     */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public boolean releaseLock(String lockKey, String lockType) {
        try {
            // Nettoyer le contexte de persistance avant la suppression pour éviter les conflits
            entityManager.clear();
            
            int deleted = lockRepository.deleteByLockKeyAndLockType(lockKey, lockType);
            
            if (deleted > 0) {
                log.info("✅ Verrou libéré: key={}, type={}", lockKey, lockType);
                return true;
            } else {
                log.warn("⚠️ Aucun verrou trouvé à libérer: key={}, type={}", lockKey, lockType);
                return false;
            }
            
        } catch (Exception e) {
            log.error("❌ Erreur lors de la libération du verrou: key={}, type={}, error={}", 
                lockKey, lockType, e.getMessage(), e);
            // Ne pas propager l'erreur pour éviter de faire échouer la transaction principale
            return false;
        }
    }
    
    /**
     * Vérifie si un verrou existe et est actif
     * 
     * @param lockKey Clé du verrou
     * @param lockType Type du verrou
     * @return true si un verrou actif existe, false sinon
     */
    public boolean isLocked(String lockKey, String lockType) {
        Optional<ReconciliationLock> lock = lockRepository.findActiveLock(
            lockKey, lockType, LocalDateTime.now());
        return lock.isPresent();
    }
    
    /**
     * Prolonge un verrou existant
     * 
     * @param lockKey Clé du verrou
     * @param lockType Type du verrou
     * @param additionalMinutes Minutes supplémentaires à ajouter
     * @return true si le verrou a été prolongé, false sinon
     */
    @Transactional
    public boolean extendLock(String lockKey, String lockType, long additionalMinutes) {
        try {
            Optional<ReconciliationLock> lockOpt = lockRepository.findActiveLock(
                lockKey, lockType, LocalDateTime.now());
            
            if (lockOpt.isPresent()) {
                ReconciliationLock lock = lockOpt.get();
                lock.setExpiresAt(lock.getExpiresAt().plusMinutes(additionalMinutes));
                lockRepository.save(lock);
                
                log.info("✅ Verrou prolongé: key={}, type={}, nouvelle expiration={}", 
                    lockKey, lockType, lock.getExpiresAt());
                return true;
            } else {
                log.warn("⚠️ Aucun verrou actif trouvé pour prolongation: key={}, type={}", 
                    lockKey, lockType);
                return false;
            }
            
        } catch (Exception e) {
            log.error("❌ Erreur lors de la prolongation du verrou: key={}, type={}, error={}", 
                lockKey, lockType, e.getMessage(), e);
            return false;
        }
    }
    
    /**
     * Nettoie les verrous expirés
     */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void cleanupExpiredLocks() {
        try {
            int deleted = lockRepository.deleteExpiredLocks(LocalDateTime.now());
            if (deleted > 0) {
                log.info("🧹 {} verrous expirés supprimés", deleted);
            }
        } catch (Exception e) {
            log.error("❌ Erreur lors du nettoyage des verrous expirés: {}", e.getMessage(), e);
        }
    }
    
    /**
     * Nettoyage automatique des verrous expirés toutes les 5 minutes.
     *
     * <p>Tache planifiee hors requete : aucun contexte entreprise n'est defini.
     * On parcourt donc les entreprises et on nettoie leurs verrous une par une
     * (le filtrage {@code @TenantId} s'applique dans chaque contexte).</p>
     */
    @Scheduled(fixedRate = 5, timeUnit = TimeUnit.MINUTES)
    public void scheduledCleanup() {
        List<Long> entrepriseIds = entrepriseRepository.findAll().stream()
                .map(com.reconciliation.entity.EntrepriseEntity::getId)
                .toList();
        for (Long entrepriseId : entrepriseIds) {
            com.reconciliation.tenant.TenantContext.runAs(entrepriseId, () -> {
                try {
                    new org.springframework.transaction.support.TransactionTemplate(transactionManager)
                        .executeWithoutResult(status ->
                            lockRepository.deleteExpiredLocks(LocalDateTime.now()));
                } catch (Exception e) {
                    log.error("❌ Erreur nettoyage des verrous pour l'entreprise {}: {}",
                            entrepriseId, e.getMessage(), e);
                }
            });
        }
    }
    
    /**
     * Libère tous les verrous d'un utilisateur
     * 
     * @param userId Identifiant de l'utilisateur
     * @return Nombre de verrous libérés
     */
    @Transactional
    public int releaseAllUserLocks(String userId) {
        try {
            List<ReconciliationLock> userLocks = lockRepository.findActiveLocksByUserId(
                userId, LocalDateTime.now());
            
            int count = 0;
            for (ReconciliationLock lock : userLocks) {
                lockRepository.delete(lock);
                count++;
            }
            
            if (count > 0) {
                log.info("✅ {} verrous libérés pour l'utilisateur: {}", count, userId);
            }
            
            return count;
            
        } catch (Exception e) {
            log.error("❌ Erreur lors de la libération des verrous utilisateur: userId={}, error={}", 
                userId, e.getMessage(), e);
            return 0;
        }
    }
    
    /**
     * Libère un verrou par jobId
     * 
     * @param jobId Identifiant du job
     * @return true si le verrou a été libéré, false sinon
     */
    @Transactional
    public boolean releaseLockByJobId(String jobId) {
        try {
            Optional<ReconciliationLock> lockOpt = lockRepository.findAll().stream()
                .filter(lock -> jobId.equals(lock.getJobId()) && !lock.isExpired())
                .findFirst();
            
            if (lockOpt.isPresent()) {
                ReconciliationLock lock = lockOpt.get();
                lockRepository.delete(lock);
                log.info("✅ Verrou libéré par jobId: {}", jobId);
                return true;
            } else {
                log.warn("⚠️ Aucun verrou actif trouvé pour jobId: {}", jobId);
                return false;
            }
            
        } catch (Exception e) {
            log.error("❌ Erreur lors de la libération du verrou par jobId: jobId={}, error={}", 
                jobId, e.getMessage(), e);
            return false;
        }
    }
}

