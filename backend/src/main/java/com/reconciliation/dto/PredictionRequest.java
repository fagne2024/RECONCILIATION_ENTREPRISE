package com.reconciliation.dto;

import java.util.List;

public class PredictionRequest {
    private String typeOperation; // Appro_client, Appro_fournisseur, Compense_client, Compense_fournisseur, nivellement
    private Integer horizonJours; // Nombre de jours à prédire (par défaut: 30)
    private String codeProprietaire; // Optionnel: filtrer par agence
    private String service; // Optionnel: filtrer par service
    private String pays; // Optionnel: filtrer par pays
    private Integer periodeAnalyseJours; // Nombre de jours d'historique à analyser (par défaut: 90)
    private String methodePrediction; // "moyenne", "tendance", "saisonnier" (par défaut: "tendance")
    
    // Constructeurs
    public PredictionRequest() {
        this.horizonJours = 30;
        this.periodeAnalyseJours = 90;
        this.methodePrediction = "tendance";
    }
    
    // Getters et Setters
    public String getTypeOperation() {
        return typeOperation;
    }
    
    public void setTypeOperation(String typeOperation) {
        this.typeOperation = typeOperation;
    }
    
    public Integer getHorizonJours() {
        return horizonJours;
    }
    
    public void setHorizonJours(Integer horizonJours) {
        this.horizonJours = horizonJours;
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
    
    public String getPays() {
        return pays;
    }
    
    public void setPays(String pays) {
        this.pays = pays;
    }
    
    public Integer getPeriodeAnalyseJours() {
        return periodeAnalyseJours;
    }
    
    public void setPeriodeAnalyseJours(Integer periodeAnalyseJours) {
        this.periodeAnalyseJours = periodeAnalyseJours;
    }
    
    public String getMethodePrediction() {
        return methodePrediction;
    }
    
    public void setMethodePrediction(String methodePrediction) {
        this.methodePrediction = methodePrediction;
    }
}

