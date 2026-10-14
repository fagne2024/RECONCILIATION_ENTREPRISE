package com.reconciliation.entity;

import jakarta.persistence.*;
import java.time.LocalDateTime;

@Entity
@jakarta.persistence.EntityListeners(com.reconciliation.tenant.TenantGuardEntityListener.class)
@Table(name = "compte_regroupement")
public class CompteRegroupementEntity {
    
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** Entreprise proprietaire (isolation multi-entreprise, colonne technique). */
    @org.hibernate.annotations.TenantId
    @jakarta.persistence.Column(name = "entreprise_id", nullable = false)
    @com.fasterxml.jackson.annotation.JsonIgnore
    private Long entrepriseId;
    
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "compte_regroupe_id", nullable = false)
    private CompteEntity compteRegroupe; // Le compte consolidé
    
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "compte_original_id", nullable = false)
    private CompteEntity compteOriginal; // Le compte original
    
    @Column(name = "date_creation", nullable = false)
    private LocalDateTime dateCreation;
    
    @Column(name = "actif", nullable = false)
    private Boolean actif = true;
    
    // Constructeurs
    public CompteRegroupementEntity() {}
    
    public CompteRegroupementEntity(CompteEntity compteRegroupe, CompteEntity compteOriginal) {
        this.compteRegroupe = compteRegroupe;
        this.compteOriginal = compteOriginal;
        this.dateCreation = LocalDateTime.now();
        this.actif = true;
    }
    
    // Getters et Setters
    public Long getId() {
        return id;
    }
    
    public void setId(Long id) {
        this.id = id;
    }
    
    public CompteEntity getCompteRegroupe() {
        return compteRegroupe;
    }
    
    public void setCompteRegroupe(CompteEntity compteRegroupe) {
        this.compteRegroupe = compteRegroupe;
    }
    
    public CompteEntity getCompteOriginal() {
        return compteOriginal;
    }
    
    public void setCompteOriginal(CompteEntity compteOriginal) {
        this.compteOriginal = compteOriginal;
    }
    
    public LocalDateTime getDateCreation() {
        return dateCreation;
    }
    
    public void setDateCreation(LocalDateTime dateCreation) {
        this.dateCreation = dateCreation;
    }
    
    public Boolean getActif() {
        return actif;
    }
    
    public void setActif(Boolean actif) {
        this.actif = actif;
    }
}
