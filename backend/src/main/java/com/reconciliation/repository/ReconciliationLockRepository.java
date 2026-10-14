package com.reconciliation.repository;

import com.reconciliation.entity.ReconciliationLock;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

/**
 * Repository pour gérer les verrous de réconciliation
 */
@Repository
public interface ReconciliationLockRepository extends JpaRepository<ReconciliationLock, Long> {
    
    /**
     * Trouve un verrou par sa clé et son type
     */
    Optional<ReconciliationLock> findByLockKeyAndLockType(String lockKey, String lockType);
    
    /**
     * Trouve tous les verrous expirés
     */
    @Query("SELECT l FROM ReconciliationLock l WHERE l.expiresAt < :now")
    List<ReconciliationLock> findExpiredLocks(@Param("now") LocalDateTime now);
    
    /**
     * Trouve tous les verrous actifs (non expirés) pour un type donné
     */
    @Query("SELECT l FROM ReconciliationLock l WHERE l.lockType = :lockType AND l.expiresAt > :now")
    List<ReconciliationLock> findActiveLocksByType(@Param("lockType") String lockType, @Param("now") LocalDateTime now);
    
    /**
     * Trouve un verrou actif par clé et type
     */
    @Query("SELECT l FROM ReconciliationLock l WHERE l.lockKey = :lockKey AND l.lockType = :lockType AND l.expiresAt > :now")
    Optional<ReconciliationLock> findActiveLock(@Param("lockKey") String lockKey, 
                                                @Param("lockType") String lockType, 
                                                @Param("now") LocalDateTime now);
    
    /**
     * Supprime tous les verrous expirés
     */
    @Modifying(clearAutomatically = true, flushAutomatically = false)
    @Query("DELETE FROM ReconciliationLock l WHERE l.expiresAt < :now")
    int deleteExpiredLocks(@Param("now") LocalDateTime now);
    
    /**
     * Supprime un verrou par sa clé et son type
     */
    @Modifying(clearAutomatically = true, flushAutomatically = false)
    @Query("DELETE FROM ReconciliationLock l WHERE l.lockKey = :lockKey AND l.lockType = :lockType")
    int deleteByLockKeyAndLockType(@Param("lockKey") String lockKey, @Param("lockType") String lockType);
    
    /**
     * Trouve tous les verrous pour un utilisateur donné
     */
    @Query("SELECT l FROM ReconciliationLock l WHERE l.userId = :userId AND l.expiresAt > :now")
    List<ReconciliationLock> findActiveLocksByUserId(@Param("userId") String userId, @Param("now") LocalDateTime now);
}

