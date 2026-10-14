package com.reconciliation.dto;

import java.time.LocalDateTime;

public class OperationDTO {
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
    private Integer recordCount;
    private Long parentOperationId;
    private String reference;
    private Long compteId;
    private String compteNumero;

    public OperationDTO() {}

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

    public Long getCompteId() {
        return compteId;
    }

    public void setCompteId(Long compteId) {
        this.compteId = compteId;
    }

    public String getCompteNumero() {
        return compteNumero;
    }

    public void setCompteNumero(String compteNumero) {
        this.compteNumero = compteNumero;
    }
}