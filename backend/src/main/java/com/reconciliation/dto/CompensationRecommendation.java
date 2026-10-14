package com.reconciliation.dto;

import java.time.LocalDate;

/**
 * Recommandation de compensation
 */
public class CompensationRecommendation {
    private String codeProprietaire;
    private String agence;
    private Double currentBalance;
    private Double thresholdAmount;
    private LocalDate predictedDate;
    private Double recommendedAmount;
    private Double averageCompensationAmount;
    private Double compensationFrequencyDays;
    private LocalDate lastCompensationDate;
    private Integer daysSinceLastCompensation;
    private String alertLevel; // 'urgent' | 'normal' | 'low'
    private Double confidenceLevel;
    private String compensationPattern; // 'regular' | 'irregular' | 'seasonal'

    // Constructeurs
    public CompensationRecommendation() {}

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

    public Double getThresholdAmount() {
        return thresholdAmount;
    }

    public void setThresholdAmount(Double thresholdAmount) {
        this.thresholdAmount = thresholdAmount;
    }

    public LocalDate getPredictedDate() {
        return predictedDate;
    }

    public void setPredictedDate(LocalDate predictedDate) {
        this.predictedDate = predictedDate;
    }

    public Double getRecommendedAmount() {
        return recommendedAmount;
    }

    public void setRecommendedAmount(Double recommendedAmount) {
        this.recommendedAmount = recommendedAmount;
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

    public String getAlertLevel() {
        return alertLevel;
    }

    public void setAlertLevel(String alertLevel) {
        this.alertLevel = alertLevel;
    }

    public Double getConfidenceLevel() {
        return confidenceLevel;
    }

    public void setConfidenceLevel(Double confidenceLevel) {
        this.confidenceLevel = confidenceLevel;
    }

    public String getCompensationPattern() {
        return compensationPattern;
    }

    public void setCompensationPattern(String compensationPattern) {
        this.compensationPattern = compensationPattern;
    }
}

