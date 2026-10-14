package com.reconciliation.entity;

import jakarta.persistence.*;

@Entity
@jakarta.persistence.EntityListeners(com.reconciliation.tenant.TenantGuardEntityListener.class)
@Table(name = "redevance_agence_param", uniqueConstraints = @UniqueConstraint(columnNames = "agence"))
public class RedevanceAgenceParamEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** Entreprise proprietaire (isolation multi-entreprise, colonne technique). */
    @org.hibernate.annotations.TenantId
    @jakarta.persistence.Column(name = "entreprise_id", nullable = false)
    @com.fasterxml.jackson.annotation.JsonIgnore
    private Long entrepriseId;

    @Column(name = "agence", nullable = false, unique = true)
    private String agence;

    @Column(name = "retenue_sur_gains_pourcentage")
    private Double retenueSurGainsPourcentage = 15.0;

    @Column(name = "retenue_sur_gains_seuil")
    private Double retenueSurGainsSeuil = 500000.0;

    @Column(name = "taxe_jeux_hasard_pourcentage")
    private Double taxeJeuxHasardPourcentage = 5.0;

    @Column(name = "taux_redevance_pourcentage")
    private Double tauxRedevancePourcentage = 50.0;

    @Column(name = "date_creation")
    private java.time.LocalDateTime dateCreation;

    @Column(name = "date_modification")
    private java.time.LocalDateTime dateModification;

    @PrePersist
    public void prePersist() {
        this.dateCreation = java.time.LocalDateTime.now();
        this.dateModification = java.time.LocalDateTime.now();
    }

    @PreUpdate
    public void preUpdate() {
        this.dateModification = java.time.LocalDateTime.now();
    }

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public String getAgence() { return agence; }
    public void setAgence(String agence) { this.agence = agence; }
    public Double getRetenueSurGainsPourcentage() { return retenueSurGainsPourcentage; }
    public void setRetenueSurGainsPourcentage(Double v) { this.retenueSurGainsPourcentage = v; }
    public Double getRetenueSurGainsSeuil() { return retenueSurGainsSeuil; }
    public void setRetenueSurGainsSeuil(Double v) { this.retenueSurGainsSeuil = v; }
    public Double getTaxeJeuxHasardPourcentage() { return taxeJeuxHasardPourcentage; }
    public void setTaxeJeuxHasardPourcentage(Double v) { this.taxeJeuxHasardPourcentage = v; }
    public Double getTauxRedevancePourcentage() { return tauxRedevancePourcentage; }
    public void setTauxRedevancePourcentage(Double v) { this.tauxRedevancePourcentage = v; }
    public java.time.LocalDateTime getDateCreation() { return dateCreation; }
    public void setDateCreation(java.time.LocalDateTime d) { this.dateCreation = d; }
    public java.time.LocalDateTime getDateModification() { return dateModification; }
    public void setDateModification(java.time.LocalDateTime d) { this.dateModification = d; }
}
