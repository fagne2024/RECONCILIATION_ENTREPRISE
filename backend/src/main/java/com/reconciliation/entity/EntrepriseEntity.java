package com.reconciliation.entity;

import jakarta.persistence.*;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.LocalDateTime;

/**
 * Entreprise (tenant) de la plateforme.
 *
 * L'entreprise historique « Intouch » (id = 1) a ete creee par la migration V2
 * et recoit toutes les donnees existantes (V3). L'acces SUPER_ADMIN
 * a {@code entrepriseId = null} en base reduit le perimetre : aucune entreprise_id
 * n'est liee aux comptes SUPER_ADMIN (la colonne n'existe pas ici).
 */
@Entity
@Table(name = "entreprise")
public class EntrepriseEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, unique = true, length = 64)
    private String code;

    @Column(nullable = false, length = 255)
    private String nom;

    // Force le stockage VARCHAR (et non le type natif enum de MySQL)
    // pour rester compatible avec le DDL de la migration V2.
    @Enumerated(EnumType.STRING)
    @JdbcTypeCode(SqlTypes.VARCHAR)
    @Column(nullable = false, length = 32)
    private EntrepriseStatut statut = EntrepriseStatut.ACTIVE;

    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @Column(name = "updated_at")
    private LocalDateTime updatedAt;

    @PrePersist
    protected void onCreate() {
        if (createdAt == null) {
            createdAt = LocalDateTime.now();
        }
    }

    @PreUpdate
    protected void onUpdate() {
        updatedAt = LocalDateTime.now();
    }

    // Getters et setters
    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public String getCode() { return code; }
    public void setCode(String code) { this.code = code; }
    public String getNom() { return nom; }
    public void setNom(String nom) { this.nom = nom; }
    public EntrepriseStatut getStatut() { return statut; }
    public void setStatut(EntrepriseStatut statut) { this.statut = statut; }
    public LocalDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(LocalDateTime createdAt) { this.createdAt = createdAt; }
    public LocalDateTime getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(LocalDateTime updatedAt) { this.updatedAt = updatedAt; }
}