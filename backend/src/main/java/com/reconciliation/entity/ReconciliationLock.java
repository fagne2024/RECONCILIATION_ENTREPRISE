package com.reconciliation.entity;

import jakarta.persistence.*;
import lombok.Data;
import lombok.NoArgsConstructor;
import lombok.AllArgsConstructor;
import java.time.LocalDateTime;

/**
 * Entité pour gérer les verrous de réconciliation
 * Permet d'éviter les conflits lors de réconciliations simultanées
 */
@Entity
@jakarta.persistence.EntityListeners(com.reconciliation.tenant.TenantGuardEntityListener.class)
@Table(name = "reconciliation_locks", 
       uniqueConstraints = @UniqueConstraint(columnNames = {"lock_key", "lock_type"}))
@Data
@NoArgsConstructor
@AllArgsConstructor
public class ReconciliationLock {
    
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** Entreprise proprietaire (isolation multi-entreprise, colonne technique). */
    @org.hibernate.annotations.TenantId
    @jakarta.persistence.Column(name = "entreprise_id", nullable = false)
    @com.fasterxml.jackson.annotation.JsonIgnore
    private Long entrepriseId;
    
    /**
     * Clé du verrou (ex: jobId, userId, etc.)
     */
    @Column(name = "lock_key", nullable = false, length = 255)
    private String lockKey;
    
    /**
     * Type de verrou (GLOBAL, USER, JOB, etc.)
     */
    @Column(name = "lock_type", nullable = false, length = 50)
    private String lockType;
    
    /**
     * Identifiant de l'utilisateur qui détient le verrou
     */
    @Column(name = "user_id", length = 255)
    private String userId;
    
    /**
     * Identifiant du job associé
     */
    @Column(name = "job_id", length = 255)
    private String jobId;
    
    /**
     * Date d'expiration du verrou
     */
    @Column(name = "expires_at", nullable = false)
    private LocalDateTime expiresAt;
    
    /**
     * Date de création du verrou
     */
    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt;
    
    /**
     * Date de dernière mise à jour
     */
    @Column(name = "updated_at")
    private LocalDateTime updatedAt;
    
    @PrePersist
    protected void onCreate() {
        createdAt = LocalDateTime.now();
        updatedAt = LocalDateTime.now();
    }
    
    @PreUpdate
    protected void onUpdate() {
        updatedAt = LocalDateTime.now();
    }
    
    /**
     * Vérifie si le verrou est expiré
     */
    public boolean isExpired() {
        return expiresAt != null && LocalDateTime.now().isAfter(expiresAt);
    }
}

