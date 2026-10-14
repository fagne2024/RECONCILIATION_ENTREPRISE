package com.reconciliation.entity;

import jakarta.persistence.*;
import java.time.LocalDateTime;

/**
 * Entité pour stocker les seuils de compensation personnalisés par agence
 */
@Entity
@jakarta.persistence.EntityListeners(com.reconciliation.tenant.TenantGuardEntityListener.class)
@Table(name = "agency_threshold", uniqueConstraints = {
    @UniqueConstraint(columnNames = {"code_proprietaire", "type_operation"})
})
public class AgencyThresholdEntity {
    
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** Entreprise proprietaire (isolation multi-entreprise, colonne technique). */
    @org.hibernate.annotations.TenantId
    @jakarta.persistence.Column(name = "entreprise_id", nullable = false)
    @com.fasterxml.jackson.annotation.JsonIgnore
    private Long entrepriseId;
    
    @Column(name = "code_proprietaire", nullable = false)
    private String codeProprietaire;
    
    @Column(name = "type_operation", nullable = false)
    private String typeOperation;
    
    @Column(name = "threshold_amount", nullable = false)
    private Double thresholdAmount;
    
    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt;
    
    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt;
    
    // Constructeurs
    public AgencyThresholdEntity() {
        this.createdAt = LocalDateTime.now();
        this.updatedAt = LocalDateTime.now();
    }
    
    public AgencyThresholdEntity(String codeProprietaire, String typeOperation, Double thresholdAmount) {
        this();
        this.codeProprietaire = codeProprietaire;
        this.typeOperation = typeOperation;
        this.thresholdAmount = thresholdAmount;
    }
    
    @PreUpdate
    public void preUpdate() {
        this.updatedAt = LocalDateTime.now();
    }
    
    // Getters et Setters
    public Long getId() {
        return id;
    }
    
    public void setId(Long id) {
        this.id = id;
    }
    
    public String getCodeProprietaire() {
        return codeProprietaire;
    }
    
    public void setCodeProprietaire(String codeProprietaire) {
        this.codeProprietaire = codeProprietaire;
    }
    
    public String getTypeOperation() {
        return typeOperation;
    }
    
    public void setTypeOperation(String typeOperation) {
        this.typeOperation = typeOperation;
    }
    
    public Double getThresholdAmount() {
        return thresholdAmount;
    }
    
    public void setThresholdAmount(Double thresholdAmount) {
        this.thresholdAmount = thresholdAmount;
    }
    
    public LocalDateTime getCreatedAt() {
        return createdAt;
    }
    
    public void setCreatedAt(LocalDateTime createdAt) {
        this.createdAt = createdAt;
    }
    
    public LocalDateTime getUpdatedAt() {
        return updatedAt;
    }
    
    public void setUpdatedAt(LocalDateTime updatedAt) {
        this.updatedAt = updatedAt;
    }
}

