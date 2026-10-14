package com.reconciliation.entity;

import jakarta.persistence.*;
import java.math.BigDecimal;
import java.time.LocalDateTime;

@Entity
@jakarta.persistence.EntityListeners(com.reconciliation.tenant.TenantGuardEntityListener.class)
@Table(name = "impact_op")
public class ImpactOPEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** Entreprise proprietaire (isolation multi-entreprise, colonne technique). */
    @org.hibernate.annotations.TenantId
    @jakarta.persistence.Column(name = "entreprise_id", nullable = false)
    @com.fasterxml.jackson.annotation.JsonIgnore
    private Long entrepriseId;

    @Column(name = "type_operation", nullable = false)
    private String typeOperation;

    @Column(name = "montant", nullable = false, precision = 15, scale = 3)
    private BigDecimal montant;

    @Column(name = "solde_avant", nullable = false, precision = 15, scale = 3)
    private BigDecimal soldeAvant;

    @Column(name = "solde_apres", nullable = false, precision = 15, scale = 3)
    private BigDecimal soldeApres;

    @Column(name = "code_proprietaire", nullable = false, length = 50)
    private String codeProprietaire;

    @Column(name = "date_operation", nullable = false)
    private LocalDateTime dateOperation;

    @Column(name = "numero_trans_gu", nullable = false, length = 50)
    private String numeroTransGU;

    @Column(name = "groupe_reseau", nullable = false, length = 10)
    private String groupeReseau;

    @Enumerated(EnumType.STRING)
    @Column(name = "statut", length = 20)
    private Statut statut = Statut.EN_ATTENTE;

    @Column(name = "commentaire", columnDefinition = "TEXT")
    private String commentaire;

    @Column(name = "created_at")
    private LocalDateTime createdAt;

    @Column(name = "updated_at")
    private LocalDateTime updatedAt;

    public enum Statut {
        EN_ATTENTE,
        TRAITE,
        ERREUR
    }

    // Constructeurs
    public ImpactOPEntity() {
        this.createdAt = LocalDateTime.now();
        this.updatedAt = LocalDateTime.now();
    }

    public ImpactOPEntity(String typeOperation, BigDecimal montant, BigDecimal soldeAvant, 
                         BigDecimal soldeApres, String codeProprietaire, LocalDateTime dateOperation,
                         String numeroTransGU, String groupeReseau) {
        this();
        this.typeOperation = typeOperation;
        this.montant = montant;
        this.soldeAvant = soldeAvant;
        this.soldeApres = soldeApres;
        this.codeProprietaire = codeProprietaire;
        this.dateOperation = dateOperation;
        this.numeroTransGU = numeroTransGU;
        this.groupeReseau = groupeReseau;
    }

    // Getters et Setters
    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public String getTypeOperation() {
        return typeOperation;
    }

    public void setTypeOperation(String typeOperation) {
        this.typeOperation = typeOperation;
    }

    public BigDecimal getMontant() {
        return montant;
    }

    public void setMontant(BigDecimal montant) {
        this.montant = montant;
    }

    public BigDecimal getSoldeAvant() {
        return soldeAvant;
    }

    public void setSoldeAvant(BigDecimal soldeAvant) {
        this.soldeAvant = soldeAvant;
    }

    public BigDecimal getSoldeApres() {
        return soldeApres;
    }

    public void setSoldeApres(BigDecimal soldeApres) {
        this.soldeApres = soldeApres;
    }

    public String getCodeProprietaire() {
        return codeProprietaire;
    }

    public void setCodeProprietaire(String codeProprietaire) {
        this.codeProprietaire = codeProprietaire;
    }

    public LocalDateTime getDateOperation() {
        return dateOperation;
    }

    public void setDateOperation(LocalDateTime dateOperation) {
        this.dateOperation = dateOperation;
    }

    public String getNumeroTransGU() {
        return numeroTransGU;
    }

    public void setNumeroTransGU(String numeroTransGU) {
        this.numeroTransGU = numeroTransGU;
    }

    public String getGroupeReseau() {
        return groupeReseau;
    }

    public void setGroupeReseau(String groupeReseau) {
        this.groupeReseau = groupeReseau;
    }

    public Statut getStatut() {
        return statut;
    }

    public void setStatut(Statut statut) {
        this.statut = statut;
    }

    public String getCommentaire() {
        return commentaire;
    }

    public void setCommentaire(String commentaire) {
        this.commentaire = commentaire;
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

    @PreUpdate
    public void preUpdate() {
        this.updatedAt = LocalDateTime.now();
    }

    @Override
    public String toString() {
        return "ImpactOPEntity{" +
                "id=" + id +
                ", typeOperation='" + typeOperation + '\'' +
                ", montant=" + montant +
                ", soldeAvant=" + soldeAvant +
                ", soldeApres=" + soldeApres +
                ", codeProprietaire='" + codeProprietaire + '\'' +
                ", dateOperation=" + dateOperation +
                ", numeroTransGU='" + numeroTransGU + '\'' +
                ", groupeReseau='" + groupeReseau + '\'' +
                ", statut=" + statut +
                ", commentaire='" + commentaire + '\'' +
                ", createdAt=" + createdAt +
                ", updatedAt=" + updatedAt +
                '}';
    }
} 