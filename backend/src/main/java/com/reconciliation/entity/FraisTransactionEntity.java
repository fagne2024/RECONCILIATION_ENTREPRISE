package com.reconciliation.entity;

import jakarta.persistence.*;

@Entity
@jakarta.persistence.EntityListeners(com.reconciliation.tenant.TenantGuardEntityListener.class)
@Table(name = "frais_transaction")
public class FraisTransactionEntity {
    
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** Entreprise proprietaire (isolation multi-entreprise, colonne technique). */
    @org.hibernate.annotations.TenantId
    @jakarta.persistence.Column(name = "entreprise_id", nullable = false)
    @com.fasterxml.jackson.annotation.JsonIgnore
    private Long entrepriseId;
    
    @Column(name = "service", nullable = false)
    private String service;
    
    @Column(name = "agence", nullable = false)
    private String agence;
    
    @Column(name = "montant_frais", nullable = false)
    private Double montantFrais;
    
    @Column(name = "type_calcul")
    private String typeCalcul = "NOMINAL"; // NOMINAL ou POURCENTAGE
    
    @Column(name = "pourcentage")
    private Double pourcentage;
    
    @Column(name = "description")
    private String description;
    
    @Column(name = "actif", nullable = false)
    private Boolean actif = true;
    
    @Column(name = "date_creation")
    private java.time.LocalDateTime dateCreation;
    
    @Column(name = "date_modification")
    private java.time.LocalDateTime dateModification;
    
    // Constructeurs
    public FraisTransactionEntity() {
        this.dateCreation = java.time.LocalDateTime.now();
        this.dateModification = java.time.LocalDateTime.now();
    }
    
    public FraisTransactionEntity(String service, String agence, Double montantFrais, String description) {
        this();
        this.service = service;
        this.agence = agence;
        this.montantFrais = montantFrais;
        this.description = description;
    }
    
    // Getters et Setters
    public Long getId() {
        return id;
    }
    
    public void setId(Long id) {
        this.id = id;
    }
    
    public String getService() {
        return service;
    }
    
    public void setService(String service) {
        this.service = service;
    }
    
    public String getAgence() {
        return agence;
    }
    
    public void setAgence(String agence) {
        this.agence = agence;
    }
    
    public Double getMontantFrais() {
        return montantFrais;
    }
    
    public void setMontantFrais(Double montantFrais) {
        this.montantFrais = montantFrais;
    }
    
    public String getTypeCalcul() {
        return typeCalcul;
    }
    
    public void setTypeCalcul(String typeCalcul) {
        this.typeCalcul = typeCalcul;
    }
    
    public Double getPourcentage() {
        return pourcentage;
    }
    
    public void setPourcentage(Double pourcentage) {
        this.pourcentage = pourcentage;
    }
    
    public String getDescription() {
        return description;
    }
    
    public void setDescription(String description) {
        this.description = description;
    }
    
    public Boolean getActif() {
        return actif;
    }
    
    public void setActif(Boolean actif) {
        this.actif = actif;
    }
    
    public java.time.LocalDateTime getDateCreation() {
        return dateCreation;
    }
    
    public void setDateCreation(java.time.LocalDateTime dateCreation) {
        this.dateCreation = dateCreation;
    }
    
    public java.time.LocalDateTime getDateModification() {
        return dateModification;
    }
    
    public void setDateModification(java.time.LocalDateTime dateModification) {
        this.dateModification = dateModification;
    }
    
    @PreUpdate
    public void preUpdate() {
        this.dateModification = java.time.LocalDateTime.now();
    }
} 