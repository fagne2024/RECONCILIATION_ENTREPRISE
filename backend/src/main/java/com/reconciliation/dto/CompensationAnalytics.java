package com.reconciliation.dto;

import java.time.LocalDate;

/**
 * Analytiques de compensation pour une agence
 */
public class CompensationAnalytics {
    private String codeProprietaire;
    private String agence;
    private Double currentBalance;
    private Double averageCompensationAmount;
    private Double compensationFrequencyDays;
    private Integer totalCompensations;
    private LocalDate lastCompensationDate;
    private Integer daysSinceLastCompensation;
    private LocalDate predictedNextCompensation;
    private String compensationTrend; // 'increasing' | 'decreasing' | 'stable'
    private Double volatility;
    private Double seasonalityFactor;
    private String riskLevel; // 'high' | 'medium' | 'low'

    // Constructeurs
    public CompensationAnalytics() {}

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

    public Double getCurrentBalance() {
        return currentBalance;
    }

    public void setCurrentBalance(Double currentBalance) {
        this.currentBalance = currentBalance;
    }

    public Double getAverageCompensationAmount() {
        return averageCompensationAmount;
    }

    public void setAverageCompensationAmount(Double averageCompensationAmount) {
        this.averageCompensationAmount = averageCompensationAmount;
    }

    public Double getCompensationFrequencyDays() {
        return compensationFrequencyDays;
    }

    public void setCompensationFrequencyDays(Double compensationFrequencyDays) {
        this.compensationFrequencyDays = compensationFrequencyDays;
    }

    public Integer getTotalCompensations() {
        return totalCompensations;
    }

    public void setTotalCompensations(Integer totalCompensations) {
        this.totalCompensations = totalCompensations;
    }

    public LocalDate getLastCompensationDate() {
        return lastCompensationDate;
    }

    public void setLastCompensationDate(LocalDate lastCompensationDate) {
        this.lastCompensationDate = lastCompensationDate;
    }

    public Integer getDaysSinceLastCompensation() {
        return daysSinceLastCompensation;
    }

    public void setDaysSinceLastCompensation(Integer daysSinceLastCompensation) {
        this.daysSinceLastCompensation = daysSinceLastCompensation;
    }

    public LocalDate getPredictedNextCompensation() {
        return predictedNextCompensation;
    }

    public void setPredictedNextCompensation(LocalDate predictedNextCompensation) {
        this.predictedNextCompensation = predictedNextCompensation;
    }

    public String getCompensationTrend() {
        return compensationTrend;
    }

    public void setCompensationTrend(String compensationTrend) {
        this.compensationTrend = compensationTrend;
    }

    public Double getVolatility() {
        return volatility;
    }

    public void setVolatility(Double volatility) {
        this.volatility = volatility;
    }

    public Double getSeasonalityFactor() {
        return seasonalityFactor;
    }

    public void setSeasonalityFactor(Double seasonalityFactor) {
        this.seasonalityFactor = seasonalityFactor;
    }

    public String getRiskLevel() {
        return riskLevel;
    }

    public void setRiskLevel(String riskLevel) {
        this.riskLevel = riskLevel;
    }
}

