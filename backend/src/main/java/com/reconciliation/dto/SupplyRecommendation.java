package com.reconciliation.dto;

import java.time.LocalDate;

/**
 * Recommandation d'approvisionnement pour une agence
 * Inspiré du modèle de prédiction d'approvisionnement
 */
public class SupplyRecommendation {
    private String codeProprietaire; // Identifiant de l'agence
    private String agence; // Nom de l'agence
    private String typeOperation; // Type d'opération (Appro_client, Appro_fournisseur, etc.)
    
    // Prédiction
    private LocalDate predictedDate; // Date recommandée (J ou J+1)
    private Double recommendedQuantity; // Quantité à commander (ancien, pour compatibilité)
    private Double recommendedBalance; // Solde recommandé (moyenne des soldes sur la période)
    private Double currentStock; // Solde actuel de l'agence (ancien, pour compatibilité)
    private Double currentBalance; // Solde actuel de l'agence
    
    // Analyse de consommation
    private Double averageConsumption; // Consommation journalière moyenne (ancien, pour compatibilité)
    private Double averageConsumptionDaily; // Consommation moyenne/jour (moyenne des variations journalières)
    private Double consumptionStdDev; // Écart-type de la consommation
    private Double trend; // Tendance (croissante/décroissante)
    
    // Paramètres de calcul
    private Integer leadTimeDays; // Délai de livraison (jours)
    private Double safetyStock; // Stock de sécurité calculé
    private Double reorderPoint; // Point de réapprovisionnement (ROP)
    private Double economicOrderQuantity; // Quantité économique (EOQ)
    
    // Métadonnées
    private Double confidenceLevel; // Niveau de confiance (0-1)
    private String alertLevel; // urgent | normal | low
    private Integer daysUntilStockout; // Jours restants avant rupture
    private Integer stockDays; // Nombre de jours de stock actuel
    
    // Constructeurs
    public SupplyRecommendation() {}
    
    public SupplyRecommendation(String codeProprietaire, String typeOperation) {
        this.codeProprietaire = codeProprietaire;
        this.typeOperation = typeOperation;
    }
    
    // Getters et Setters
    public String getCodeProprietaire() {
        return codeProprietaire;
    }
    
    public void setCodeProprietaire(String codeProprietaire) {
        this.codeProprietaire = codeProprietaire;
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
    
    public LocalDate getPredictedDate() {
        return predictedDate;
    }
    
    public void setPredictedDate(LocalDate predictedDate) {
        this.predictedDate = predictedDate;
    }
    
    public Double getRecommendedQuantity() {
        return recommendedQuantity;
    }
    
    public void setRecommendedQuantity(Double recommendedQuantity) {
        this.recommendedQuantity = recommendedQuantity;
    }
    
    public Double getRecommendedBalance() {
        return recommendedBalance;
    }
    
    public void setRecommendedBalance(Double recommendedBalance) {
        this.recommendedBalance = recommendedBalance;
    }
    
    public Double getCurrentStock() {
        return currentStock;
    }
    
    public void setCurrentStock(Double currentStock) {
        this.currentStock = currentStock;
    }
    
    public Double getCurrentBalance() {
        return currentBalance;
    }
    
    public void setCurrentBalance(Double currentBalance) {
        this.currentBalance = currentBalance;
    }
    
    public Double getAverageConsumption() {
        return averageConsumption;
    }
    
    public void setAverageConsumption(Double averageConsumption) {
        this.averageConsumption = averageConsumption;
    }
    
    public Double getAverageConsumptionDaily() {
        return averageConsumptionDaily;
    }
    
    public void setAverageConsumptionDaily(Double averageConsumptionDaily) {
        this.averageConsumptionDaily = averageConsumptionDaily;
    }
    
    public Double getConsumptionStdDev() {
        return consumptionStdDev;
    }
    
    public void setConsumptionStdDev(Double consumptionStdDev) {
        this.consumptionStdDev = consumptionStdDev;
    }
    
    public Double getTrend() {
        return trend;
    }
    
    public void setTrend(Double trend) {
        this.trend = trend;
    }
    
    public Integer getLeadTimeDays() {
        return leadTimeDays;
    }
    
    public void setLeadTimeDays(Integer leadTimeDays) {
        this.leadTimeDays = leadTimeDays;
    }
    
    public Double getSafetyStock() {
        return safetyStock;
    }
    
    public void setSafetyStock(Double safetyStock) {
        this.safetyStock = safetyStock;
    }
    
    public Double getReorderPoint() {
        return reorderPoint;
    }
    
    public void setReorderPoint(Double reorderPoint) {
        this.reorderPoint = reorderPoint;
    }
    
    public Double getEconomicOrderQuantity() {
        return economicOrderQuantity;
    }
    
    public void setEconomicOrderQuantity(Double economicOrderQuantity) {
        this.economicOrderQuantity = economicOrderQuantity;
    }
    
    public Double getConfidenceLevel() {
        return confidenceLevel;
    }
    
    public void setConfidenceLevel(Double confidenceLevel) {
        this.confidenceLevel = confidenceLevel;
    }
    
    public String getAlertLevel() {
        return alertLevel;
    }
    
    public void setAlertLevel(String alertLevel) {
        this.alertLevel = alertLevel;
    }
    
    public Integer getDaysUntilStockout() {
        return daysUntilStockout;
    }
    
    public void setDaysUntilStockout(Integer daysUntilStockout) {
        this.daysUntilStockout = daysUntilStockout;
    }
    
    public Integer getStockDays() {
        return stockDays;
    }
    
    public void setStockDays(Integer stockDays) {
        this.stockDays = stockDays;
    }
}

