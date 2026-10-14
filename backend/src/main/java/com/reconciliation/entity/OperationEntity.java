package com.reconciliation.entity;

import jakarta.persistence.*;
import java.time.LocalDateTime;

@Entity
@jakarta.persistence.EntityListeners(com.reconciliation.tenant.TenantGuardEntityListener.class)
@Table(name = "operation")
public class OperationEntity {
    
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
    
    @Column(name = "date_operation", nullable = false)
    private LocalDateTime dateOperation;
    
    @Column(name = "code_proprietaire", nullable = false)
    private String codeProprietaire;
    
    @Column(name = "service")
    private String service;
    
    @Column(name = "montant", nullable = false)
    private Double montant;
    
    @Column(name = "solde_avant", nullable = false)
    private Double soldeAvant;
    
    @Column(name = "solde_apres", nullable = false)
    private Double soldeApres;
    
    @Column(name = "nom_bordereau")
    private String nomBordereau;
    
    @Column(name = "banque")
    private String banque;
    
    @Column(name = "statut", nullable = false)
    private String statut;
    
    @Column(name = "pays", nullable = false)
    private String pays;
    
    @Column(name = "record_count")
    private Integer recordCount;
    
    @Column(name = "parent_operation_id")
    private Long parentOperationId;
    
    @Column(name = "reference")
    private String reference;
    
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "compte_id")
    private CompteEntity compte;
    
    // Constructeurs
    public OperationEntity() {}
    
    public OperationEntity(String typeOperation, LocalDateTime dateOperation, String codeProprietaire, 
                         String service, Double montant, Double soldeAvant, Double soldeApres, 
                         String nomBordereau, String banque, String statut, String pays, CompteEntity compte) {
        this.typeOperation = typeOperation;
        this.dateOperation = dateOperation;
        this.codeProprietaire = codeProprietaire;
        this.service = service;
        this.montant = montant;
        this.soldeAvant = soldeAvant;
        this.soldeApres = soldeApres;
        this.nomBordereau = nomBordereau;
        this.banque = banque;
        this.statut = statut;
        this.pays = pays;
        this.compte = compte;
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
    
    public LocalDateTime getDateOperation() {
        return dateOperation;
    }
    
    public void setDateOperation(LocalDateTime dateOperation) {
        this.dateOperation = dateOperation;
    }
    
    public String getCodeProprietaire() {
        return codeProprietaire;
    }
    
    public void setCodeProprietaire(String codeProprietaire) {
        this.codeProprietaire = codeProprietaire;
    }
    
    public String getService() {
        return service;
    }
    
    public void setService(String service) {
        this.service = service;
    }
    
    public Double getMontant() {
        return montant;
    }
    
    public void setMontant(Double montant) {
        this.montant = montant;
    }
    
    public Double getSoldeAvant() {
        return soldeAvant;
    }
    
    public void setSoldeAvant(Double soldeAvant) {
        this.soldeAvant = soldeAvant;
    }
    
    public Double getSoldeApres() {
        return soldeApres;
    }
    
    public void setSoldeApres(Double soldeApres) {
        this.soldeApres = soldeApres;
    }
    
    public String getNomBordereau() {
        return nomBordereau;
    }
    
    public void setNomBordereau(String nomBordereau) {
        this.nomBordereau = nomBordereau;
    }
    
    public String getBanque() {
        return banque;
    }
    
    public void setBanque(String banque) {
        this.banque = banque;
    }
    
    public String getStatut() {
        return statut;
    }
    
    public void setStatut(String statut) {
        this.statut = statut;
    }
    
    public String getPays() {
        return pays;
    }
    
    public void setPays(String pays) {
        this.pays = pays;
    }
    
    public Integer getRecordCount() {
        return recordCount;
    }
    
    public void setRecordCount(Integer recordCount) {
        this.recordCount = recordCount;
    }
    
    public Long getParentOperationId() {
        return parentOperationId;
    }

    public void setParentOperationId(Long parentOperationId) {
        this.parentOperationId = parentOperationId;
    }
    
    public String getReference() {
        return reference;
    }

    public void setReference(String reference) {
        this.reference = reference;
    }
    
    public CompteEntity getCompte() {
        return compte;
    }
    
    public void setCompte(CompteEntity compte) {
        this.compte = compte;
    }
} 