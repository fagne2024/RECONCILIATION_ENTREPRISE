package com.reconciliation.entity;

import jakarta.persistence.*;

import java.time.LocalDate;
import java.time.LocalDateTime;

@Entity
@jakarta.persistence.EntityListeners(com.reconciliation.tenant.TenantGuardEntityListener.class)
@Table(name = "flux", uniqueConstraints = @UniqueConstraint(columnNames = {"agence", "dateDebut", "dateFin"}))
public class FluxEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** Entreprise proprietaire (isolation multi-entreprise, colonne technique). */
    @org.hibernate.annotations.TenantId
    @jakarta.persistence.Column(name = "entreprise_id", nullable = false)
    @com.fasterxml.jackson.annotation.JsonIgnore
    private Long entrepriseId;

    @Column(name = "agence", nullable = false)
    private String agence;

    @Column(name = "date_debut", nullable = false)
    private LocalDate dateDebut;

    @Column(name = "date_fin", nullable = false)
    private LocalDate dateFin;

    @Column(name = "total_mises")
    private Double totalMises = 0.0;

    @Column(name = "total_gains")
    private Double totalGains = 0.0;

    @Column(name = "total_bonus")
    private Double totalBonus = 0.0;

    @Column(name = "payin")
    private Double payin = 0.0;

    @Column(name = "payout")
    private Double payout = 0.0;

    @Column(name = "retenue_sur_gains")
    private Double retenueSurGains = 0.0;

    @Column(name = "date_creation")
    private LocalDateTime dateCreation;

    @Column(name = "date_modification")
    private LocalDateTime dateModification;

    @PrePersist
    public void prePersist() {
        this.dateCreation = LocalDateTime.now();
        this.dateModification = LocalDateTime.now();
    }

    @PreUpdate
    public void preUpdate() {
        this.dateModification = LocalDateTime.now();
    }

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public String getAgence() { return agence; }
    public void setAgence(String agence) { this.agence = agence; }
    public LocalDate getDateDebut() { return dateDebut; }
    public void setDateDebut(LocalDate d) { this.dateDebut = d; }
    public LocalDate getDateFin() { return dateFin; }
    public void setDateFin(LocalDate d) { this.dateFin = d; }
    public Double getTotalMises() { return totalMises; }
    public void setTotalMises(Double v) { this.totalMises = v; }
    public Double getTotalGains() { return totalGains; }
    public void setTotalGains(Double v) { this.totalGains = v; }
    public Double getTotalBonus() { return totalBonus; }
    public void setTotalBonus(Double v) { this.totalBonus = v; }
    public Double getPayin() { return payin; }
    public void setPayin(Double v) { this.payin = v; }
    public Double getPayout() { return payout; }
    public void setPayout(Double v) { this.payout = v; }
    public Double getRetenueSurGains() { return retenueSurGains; }
    public void setRetenueSurGains(Double v) { this.retenueSurGains = v != null ? v : 0.0; }
    public LocalDateTime getDateCreation() { return dateCreation; }
    public void setDateCreation(LocalDateTime d) { this.dateCreation = d; }
    public LocalDateTime getDateModification() { return dateModification; }
    public void setDateModification(LocalDateTime d) { this.dateModification = d; }
}
