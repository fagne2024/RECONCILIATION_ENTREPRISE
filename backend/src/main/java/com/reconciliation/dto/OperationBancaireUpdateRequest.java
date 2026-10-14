package com.reconciliation.dto;

public class OperationBancaireUpdateRequest {
    private String pays;
    private String codePays;
    private String mois;
    private String dateOperation;
    private String agence;
    private String typeOperation;
    private String nomBeneficiaire;
    private String compteADebiter;
    private Double montant;
    private String modePaiement;
    private String reference;
    private String idGlpi;
    private String bo;
    private String statut;
    private Long operationId;
    private String traitement;
    
    // Constructeurs
    public OperationBancaireUpdateRequest() {}
    
    // Getters et Setters
    public String getPays() {
        return pays;
    }
    
    public void setPays(String pays) {
        this.pays = pays;
    }
    
    public String getCodePays() {
        return codePays;
    }
    
    public void setCodePays(String codePays) {
        this.codePays = codePays;
    }
    
    public String getMois() {
        return mois;
    }
    
    public void setMois(String mois) {
        this.mois = mois;
    }
    
    public String getDateOperation() {
        return dateOperation;
    }
    
    public void setDateOperation(String dateOperation) {
        this.dateOperation = dateOperation;
    }
    
    public String getAgence() {
        return agence;
    }
    
    public void setAgence(String agence) {
        this.agence = agence;
    }
    
    public String getTypeOperation() {
        return typeOperation;
    }
    
    public void setTypeOperation(String typeOperation) {
        this.typeOperation = typeOperation;
    }
    
    public String getNomBeneficiaire() {
        return nomBeneficiaire;
    }
    
    public void setNomBeneficiaire(String nomBeneficiaire) {
        this.nomBeneficiaire = nomBeneficiaire;
    }
    
    public String getCompteADebiter() {
        return compteADebiter;
    }
    
    public void setCompteADebiter(String compteADebiter) {
        this.compteADebiter = compteADebiter;
    }
    
    public Double getMontant() {
        return montant;
    }
    
    public void setMontant(Double montant) {
        this.montant = montant;
    }
    
    public String getModePaiement() {
        return modePaiement;
    }
    
    public void setModePaiement(String modePaiement) {
        this.modePaiement = modePaiement;
    }
    
    public String getReference() {
        return reference;
    }
    
    public void setReference(String reference) {
        this.reference = reference;
    }
    
    public String getIdGlpi() {
        return idGlpi;
    }
    
    public void setIdGlpi(String idGlpi) {
        this.idGlpi = idGlpi;
    }
    
    public String getBo() {
        return bo;
    }
    
    public void setBo(String bo) {
        this.bo = bo;
    }
    
    public String getStatut() {
        return statut;
    }
    
    public void setStatut(String statut) {
        this.statut = statut;
    }
    
    public Long getOperationId() {
        return operationId;
    }
    
    public void setOperationId(Long operationId) {
        this.operationId = operationId;
    }
    
    public String getTraitement() {
        return traitement;
    }
    
    public void setTraitement(String traitement) {
        this.traitement = traitement;
    }
}

