package com.reconciliation.dto;

/**
 * DTO pour créer ou mettre à jour un seuil personnalisé par agence
 */
public class AgencyThresholdRequest {
    private String codeProprietaire;
    private String typeOperation;
    private Double thresholdAmount;

    // Constructeurs
    public AgencyThresholdRequest() {}

    public AgencyThresholdRequest(String codeProprietaire, String typeOperation, Double thresholdAmount) {
        this.codeProprietaire = codeProprietaire;
        this.typeOperation = typeOperation;
        this.thresholdAmount = thresholdAmount;
    }

    // Getters et Setters
    public String getCodeProprietaire() {
        return codeProprietaire;
    }

    public void setCodeProprietaire(String codeProprietaire) {
        this.codeProprietaire = codeProprietaire;
    }

    public String getTypeOperation() {
        return typeOperation;
    }

    public void setTypeOperation(String typeOperation) {
        this.typeOperation = typeOperation;
    }

    public Double getThresholdAmount() {
        return thresholdAmount;
    }

    public void setThresholdAmount(Double thresholdAmount) {
        this.thresholdAmount = thresholdAmount;
    }
}

