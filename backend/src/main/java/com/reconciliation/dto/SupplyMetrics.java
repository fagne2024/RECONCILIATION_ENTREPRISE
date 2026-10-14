package com.reconciliation.dto;

import java.util.List;

/**
 * Métriques globales de santé du système
 */
public class SupplyMetrics {
    // Métriques globales
    private Integer totalAgencies;
    private Integer criticalAgencies; // Agences critiques
    private Integer overstockedAgencies; // Agences en surstock
    private Integer inactiveAgencies; // Agences inactives
    
    // Performance
    private Double averageTurnoverRate; // Taux de rotation moyen
    private Double averageStockoutRisk; // Risque de rupture moyen
    private Double averageConfidenceLevel; // Niveau de confiance moyen
    
    // Urgences
    private Integer urgentOrders; // Commandes urgentes
    private Integer normalOrders; // Commandes normales
    private Integer lowPriorityOrders; // Commandes faible priorité
    
    // Top agences
    private List<AgencySummary> topCriticalAgencies; // Top agences critiques
    private List<AgencySummary> topTurnoverAgencies; // Top rotation
    
    // Constructeurs
    public SupplyMetrics() {}
    
    // Getters et Setters
    public Integer getTotalAgencies() {
        return totalAgencies;
    }
    
    public void setTotalAgencies(Integer totalAgencies) {
        this.totalAgencies = totalAgencies;
    }
    
    public Integer getCriticalAgencies() {
        return criticalAgencies;
    }
    
    public void setCriticalAgencies(Integer criticalAgencies) {
        this.criticalAgencies = criticalAgencies;
    }
    
    public Integer getOverstockedAgencies() {
        return overstockedAgencies;
    }
    
    public void setOverstockedAgencies(Integer overstockedAgencies) {
        this.overstockedAgencies = overstockedAgencies;
    }
    
    public Integer getInactiveAgencies() {
        return inactiveAgencies;
    }
    
    public void setInactiveAgencies(Integer inactiveAgencies) {
        this.inactiveAgencies = inactiveAgencies;
    }
    
    public Double getAverageTurnoverRate() {
        return averageTurnoverRate;
    }
    
    public void setAverageTurnoverRate(Double averageTurnoverRate) {
        this.averageTurnoverRate = averageTurnoverRate;
    }
    
    public Double getAverageStockoutRisk() {
        return averageStockoutRisk;
    }
    
    public void setAverageStockoutRisk(Double averageStockoutRisk) {
        this.averageStockoutRisk = averageStockoutRisk;
    }
    
    public Double getAverageConfidenceLevel() {
        return averageConfidenceLevel;
    }
    
    public void setAverageConfidenceLevel(Double averageConfidenceLevel) {
        this.averageConfidenceLevel = averageConfidenceLevel;
    }
    
    public Integer getUrgentOrders() {
        return urgentOrders;
    }
    
    public void setUrgentOrders(Integer urgentOrders) {
        this.urgentOrders = urgentOrders;
    }
    
    public Integer getNormalOrders() {
        return normalOrders;
    }
    
    public void setNormalOrders(Integer normalOrders) {
        this.normalOrders = normalOrders;
    }
    
    public Integer getLowPriorityOrders() {
        return lowPriorityOrders;
    }
    
    public void setLowPriorityOrders(Integer lowPriorityOrders) {
        this.lowPriorityOrders = lowPriorityOrders;
    }
    
    public List<AgencySummary> getTopCriticalAgencies() {
        return topCriticalAgencies;
    }
    
    public void setTopCriticalAgencies(List<AgencySummary> topCriticalAgencies) {
        this.topCriticalAgencies = topCriticalAgencies;
    }
    
    public List<AgencySummary> getTopTurnoverAgencies() {
        return topTurnoverAgencies;
    }
    
    public void setTopTurnoverAgencies(List<AgencySummary> topTurnoverAgencies) {
        this.topTurnoverAgencies = topTurnoverAgencies;
    }
    
    // Classe interne pour résumé d'agence
    public static class AgencySummary {
        private String codeProprietaire;
        private String agence;
        private Double value; // Valeur du critère (risque, rotation, etc.)
        private String typeOperation;
        
        public AgencySummary() {}
        
        public AgencySummary(String codeProprietaire, String agence, Double value, String typeOperation) {
            this.codeProprietaire = codeProprietaire;
            this.agence = agence;
            this.value = value;
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
        
        public Double getValue() {
            return value;
        }
        
        public void setValue(Double value) {
            this.value = value;
        }
        
        public String getTypeOperation() {
            return typeOperation;
        }
        
        public void setTypeOperation(String typeOperation) {
            this.typeOperation = typeOperation;
        }
    }
}

