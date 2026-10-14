package com.reconciliation.dto;

/**
 * Configuration du système de prédiction d'approvisionnement
 */
public class SupplyPredictionConfig {
    private Integer leadTimeDays = 7; // Délai de livraison (jours)
    private Double safetyFactor = 1.5; // Facteur de sécurité
    private Integer minStockDays = 14; // Stock minimum souhaité (jours)
    private Integer maxStockDays = 60; // Stock maximum toléré (jours)
    private Integer urgentThresholdDays = 2; // Seuil urgent (< X jours)
    private Integer normalThresholdDays = 4; // Seuil normal (< X jours)
    
    // Constructeurs
    public SupplyPredictionConfig() {}
    
    public SupplyPredictionConfig(Integer leadTimeDays, Double safetyFactor, 
                                 Integer minStockDays, Integer maxStockDays) {
        this.leadTimeDays = leadTimeDays;
        this.safetyFactor = safetyFactor;
        this.minStockDays = minStockDays;
        this.maxStockDays = maxStockDays;
    }
    
    // Getters et Setters
    public Integer getLeadTimeDays() {
        return leadTimeDays;
    }
    
    public void setLeadTimeDays(Integer leadTimeDays) {
        this.leadTimeDays = leadTimeDays;
    }
    
    public Double getSafetyFactor() {
        return safetyFactor;
    }
    
    public void setSafetyFactor(Double safetyFactor) {
        this.safetyFactor = safetyFactor;
    }
    
    public Integer getMinStockDays() {
        return minStockDays;
    }
    
    public void setMinStockDays(Integer minStockDays) {
        this.minStockDays = minStockDays;
    }
    
    public Integer getMaxStockDays() {
        return maxStockDays;
    }
    
    public void setMaxStockDays(Integer maxStockDays) {
        this.maxStockDays = maxStockDays;
    }
    
    public Integer getUrgentThresholdDays() {
        return urgentThresholdDays;
    }
    
    public void setUrgentThresholdDays(Integer urgentThresholdDays) {
        this.urgentThresholdDays = urgentThresholdDays;
    }
    
    public Integer getNormalThresholdDays() {
        return normalThresholdDays;
    }
    
    public void setNormalThresholdDays(Integer normalThresholdDays) {
        this.normalThresholdDays = normalThresholdDays;
    }
}

