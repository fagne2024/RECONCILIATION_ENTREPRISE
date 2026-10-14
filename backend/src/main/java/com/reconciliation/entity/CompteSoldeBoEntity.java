package com.reconciliation.entity;

import jakarta.persistence.*;
import java.time.LocalDate;
import java.time.LocalDateTime;

@Entity
@jakarta.persistence.EntityListeners(com.reconciliation.tenant.TenantGuardEntityListener.class)
@Table(name = "compte_solde_bo", uniqueConstraints = @UniqueConstraint(columnNames = {"numero_compte", "date_solde"}))
public class CompteSoldeBoEntity {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** Entreprise proprietaire (isolation multi-entreprise, colonne technique). */
    @org.hibernate.annotations.TenantId
    @jakarta.persistence.Column(name = "entreprise_id", nullable = false)
    @com.fasterxml.jackson.annotation.JsonIgnore
    private Long entrepriseId;

    @Column(name = "numero_compte", nullable = false)
    private String numeroCompte;

    @Column(name = "date_solde", nullable = false)
    private LocalDate dateSolde;

    @Column(name = "solde_bo", nullable = false)
    private Double soldeBo;

    @Column(name = "created_at")
    private LocalDateTime createdAt = LocalDateTime.now();

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public String getNumeroCompte() { return numeroCompte; }
    public void setNumeroCompte(String numeroCompte) { this.numeroCompte = numeroCompte; }
    public LocalDate getDateSolde() { return dateSolde; }
    public void setDateSolde(LocalDate dateSolde) { this.dateSolde = dateSolde; }
    public Double getSoldeBo() { return soldeBo; }
    public void setSoldeBo(Double soldeBo) { this.soldeBo = soldeBo; }
    public LocalDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(LocalDateTime createdAt) { this.createdAt = createdAt; }
} 