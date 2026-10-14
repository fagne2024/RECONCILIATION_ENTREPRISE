package com.reconciliation.dto;

import java.util.Map;

/**
 * Analytiques détaillées pour une agence
 */
public class AgencyAnalytics {
    private String codeProprietaire;
    private String agence;
    private String typeOperation;
    
    // Consommation
    private Double averageConsumptionDaily;
    private Double averageConsumptionWeekly;
    private Double averageConsumptionMonthly;
    private Double consumptionStdDev;
    private String consumptionTrend; // "increasing" | "decreasing" | "stable"
    
    // Stock
    private Double currentStock;
    private Double averageStock; // Stock seuil compensation = moyenne des compensations + solde actuel
    private Integer stockDays; // Jours de stock actuel
    
    // Rotation et performance
    private Double turnoverRate; // Taux de rotation
    private Integer stockoutRisk; // Risque de rupture (0-100)
    private Boolean isCritical; // Agence critique
    private Boolean isOverstocked; // Surstock
    private Boolean isInactive; // Inactive
    
    // Historique
    private Map<String, Object> historicalStats;
    
    // Constructeurs
    public AgencyAnalytics() {}
    
    public AgencyAnalytics(String codeProprietaire, String typeOperation) {
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
    
    public Double getAverageConsumptionDaily() {
        return averageConsumptionDaily;
    }
    
    public void setAverageConsumptionDaily(Double averageConsumptionDaily) {
        this.averageConsumptionDaily = averageConsumptionDaily;
    }
    
    public Double getAverageConsumptionWeekly() {
        return averageConsumptionWeekly;
    }
    
    public void setAverageConsumptionWeekly(Double averageConsumptionWeekly) {
        this.averageConsumptionWeekly = averageConsumptionWeekly;
    }
    
    public Double getAverageConsumptionMonthly() {
        return averageConsumptionMonthly;
    }
    
    public void setAverageConsumptionMonthly(Double averageConsumptionMonthly) {
        this.averageConsumptionMonthly = averageConsumptionMonthly;
    }
    
    public Double getConsumptionStdDev() {
        return consumptionStdDev;
    }
    
    public void setConsumptionStdDev(Double consumptionStdDev) {
        this.consumptionStdDev = consumptionStdDev;
    }
    
    public String getConsumptionTrend() {
        return consumptionTrend;
    }
    
    public void setConsumptionTrend(String consumptionTrend) {
        this.consumptionTrend = consumptionTrend;
    }
    
    public Double getCurrentStock() {
        return currentStock;
    }
    
    public void setCurrentStock(Double currentStock) {
        this.currentStock = currentStock;
    }
    
    public Double getAverageStock() {
        return averageStock;
    }
    
    public void setAverageStock(Double averageStock) {
        this.averageStock = averageStock;
    }
    
    public Integer getStockDays() {
        return stockDays;
    }
    
    public void setStockDays(Integer stockDays) {
        this.stockDays = stockDays;
    }
    
    public Double getTurnoverRate() {
        return turnoverRate;
    }
    
    public void setTurnoverRate(Double turnoverRate) {
        this.turnoverRate = turnoverRate;
    }
    
    public Integer getStockoutRisk() {
        return stockoutRisk;
    }
    
    public void setStockoutRisk(Integer stockoutRisk) {
        this.stockoutRisk = stockoutRisk;
    }
    
    public Boolean getIsCritical() {
        return isCritical;
    }
    
    public void setIsCritical(Boolean isCritical) {
        this.isCritical = isCritical;
    }
    
    public Boolean getIsOverstocked() {
        return isOverstocked;
    }
    
    public void setIsOverstocked(Boolean isOverstocked) {
        this.isOverstocked = isOverstocked;
    }
    
    public Boolean getIsInactive() {
        return isInactive;
    }
    
    public void setIsInactive(Boolean isInactive) {
        this.isInactive = isInactive;
    }
    
    public Map<String, Object> getHistoricalStats() {
        return historicalStats;
    }
    
    public void setHistoricalStats(Map<String, Object> historicalStats) {
        this.historicalStats = historicalStats;
    }
}

