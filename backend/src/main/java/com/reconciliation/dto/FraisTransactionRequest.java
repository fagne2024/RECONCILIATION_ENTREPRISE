package com.reconciliation.dto;

public class FraisTransactionRequest {
    
    private String service;
    private String agence;
    private Double montantFrais;
    private String typeCalcul; // NOMINAL ou POURCENTAGE
    private Double pourcentage;
    private String description;
    private Boolean actif;
    
    // Constructeurs
    public FraisTransactionRequest() {}
    
    public FraisTransactionRequest(String service, String agence, Double montantFrais, String description) {
        this.service = service;
        this.agence = agence;
        this.montantFrais = montantFrais;
        this.description = description;
        this.actif = true;
        this.typeCalcul = "NOMINAL";
    }
    
    // Getters et Setters
    public String getService() {
        return service;
    }
    
    public void setService(String service) {
        this.service = service;
    }
    
    public String getAgence() {
        return agence;
    }
    
    public void setAgence(String agence) {
        this.agence = agence;
    }
    
    public Double getMontantFrais() {
        return montantFrais;
    }
    
    public void setMontantFrais(Double montantFrais) {
        this.montantFrais = montantFrais;
    }
    
    public String getTypeCalcul() {
        return typeCalcul;
    }
    
    public void setTypeCalcul(String typeCalcul) {
        this.typeCalcul = typeCalcul;
    }
    
    public Double getPourcentage() {
        return pourcentage;
    }
    
    public void setPourcentage(Double pourcentage) {
        this.pourcentage = pourcentage;
    }
    
    public String getDescription() {
        return description;
    }
    
    public void setDescription(String description) {
        this.description = description;
    }
    
    public Boolean getActif() {
        return actif;
    }
    
    public void setActif(Boolean actif) {
        this.actif = actif;
    }
} 