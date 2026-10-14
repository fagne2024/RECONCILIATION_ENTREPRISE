package com.reconciliation.model;

import java.time.LocalDateTime;

public class Operation {
    private Long id;
    private String typeOperation;
    private LocalDateTime dateOperation;
    private String codeProprietaire;
    private String service;
    private Double montant;
    private Double soldeAvant;
    private Double soldeApres;
    private String nomBordereau;
    private String banque;
    private String statut;
    private String pays;
    private Long compteId;
    private Integer recordCount;
    private Long parentOperationId;
    private String reference;
    
    // Champs pour les frais de transaction
    private Double montantFrais;
    private String typeCalculFrais;
    private Double pourcentageFrais;
    private String descriptionFrais;
    private Boolean fraisApplicable;
    
    // Constructeurs
    public Operation() {}
    
    public Operation(Long id, String typeOperation, LocalDateTime dateOperation, String codeProprietaire, 
                    String service, Double montant, Double soldeAvant, Double soldeApres, String nomBordereau, 
                    String banque, String statut, String pays, Long compteId, Integer recordCount) {
        this.id = id;
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
        this.compteId = compteId;
        this.recordCount = recordCount;
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
    
    public Long getCompteId() {
        return compteId;
    }
    
    public void setCompteId(Long compteId) {
        this.compteId = compteId;
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
    
    // Getters et Setters pour les frais
    public Double getMontantFrais() {
        return montantFrais;
    }
    
    public void setMontantFrais(Double montantFrais) {
        this.montantFrais = montantFrais;
    }
    
    public String getTypeCalculFrais() {
        return typeCalculFrais;
    }
    
    public void setTypeCalculFrais(String typeCalculFrais) {
        this.typeCalculFrais = typeCalculFrais;
    }
    
    public Double getPourcentageFrais() {
        return pourcentageFrais;
    }
    
    public void setPourcentageFrais(Double pourcentageFrais) {
        this.pourcentageFrais = pourcentageFrais;
    }
    
    public String getDescriptionFrais() {
        return descriptionFrais;
    }
    
    public void setDescriptionFrais(String descriptionFrais) {
        this.descriptionFrais = descriptionFrais;
    }
    
    public Boolean getFraisApplicable() {
        return fraisApplicable;
    }
    
    public void setFraisApplicable(Boolean fraisApplicable) {
        this.fraisApplicable = fraisApplicable;
    }
    
    public Integer getRecordCount() {
        return recordCount;
    }
    
    public void setRecordCount(Integer recordCount) {
        this.recordCount = recordCount;
    }
} 