package com.reconciliation.dto;

public class OperationUpdateRequest {
    private String typeOperation;
    private Double montant;
    private String banque;
    private String nomBordereau;
    private String service;
    private String dateOperation;
    
    // Constructeurs
    public OperationUpdateRequest() {}
    
    public OperationUpdateRequest(String typeOperation, Double montant, String banque, String nomBordereau, String service, String dateOperation) {
        this.typeOperation = typeOperation;
        this.montant = montant;
        this.banque = banque;
        this.nomBordereau = nomBordereau;
        this.service = service;
        this.dateOperation = dateOperation;
    }
    
    // Getters et Setters
    public String getTypeOperation() {
        return typeOperation;
    }
    
    public void setTypeOperation(String typeOperation) {
        this.typeOperation = typeOperation;
    }
    
    public Double getMontant() {
        return montant;
    }
    
    public void setMontant(Double montant) {
        this.montant = montant;
    }
    
    public String getBanque() {
        return banque;
    }
    
    public void setBanque(String banque) {
        this.banque = banque;
    }
    
    public String getNomBordereau() {
        return nomBordereau;
    }
    
    public void setNomBordereau(String nomBordereau) {
        this.nomBordereau = nomBordereau;
    }
    
    public String getService() {
        return service;
    }
    
    public void setService(String service) {
        this.service = service;
    }
    
    public String getDateOperation() {
        return dateOperation;
    }
    
    public void setDateOperation(String dateOperation) {
        this.dateOperation = dateOperation;
    }
} 