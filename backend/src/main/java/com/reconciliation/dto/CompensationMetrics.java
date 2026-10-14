package com.reconciliation.dto;

/**
 * Métriques de compensation
 */
public class CompensationMetrics {
    private Integer totalAgencies;
    private Integer agenciesNeedingCompensation;
    private Integer urgentCompensations;
    private Double averageCompensationFrequency; // En jours
    private Double totalCompensationAmount;
    private Double averageCompensationAmount;
    private Integer agenciesAboveThreshold;
    private Integer agenciesBelowThreshold;

    // Constructeurs
    public CompensationMetrics() {}

    // Getters et Setters
    public Integer getTotalAgencies() {
        return totalAgencies;
    }

    public void setTotalAgencies(Integer totalAgencies) {
        this.totalAgencies = totalAgencies;
    }

    public Integer getAgenciesNeedingCompensation() {
        return agenciesNeedingCompensation;
    }

    public void setAgenciesNeedingCompensation(Integer agenciesNeedingCompensation) {
        this.agenciesNeedingCompensation = agenciesNeedingCompensation;
    }

    public Integer getUrgentCompensations() {
        return urgentCompensations;
    }

    public void setUrgentCompensations(Integer urgentCompensations) {
        this.urgentCompensations = urgentCompensations;
    }

    public Double getAverageCompensationFrequency() {
        return averageCompensationFrequency;
    }

    public void setAverageCompensationFrequency(Double averageCompensationFrequency) {
        this.averageCompensationFrequency = averageCompensationFrequency;
    }

    public Double getTotalCompensationAmount() {
        return totalCompensationAmount;
    }

    public void setTotalCompensationAmount(Double totalCompensationAmount) {
        this.totalCompensationAmount = totalCompensationAmount;
    }

    public Double getAverageCompensationAmount() {
        return averageCompensationAmount;
    }

    public void setAverageCompensationAmount(Double averageCompensationAmount) {
        this.averageCompensationAmount = averageCompensationAmount;
    }

    public Integer getAgenciesAboveThreshold() {
        return agenciesAboveThreshold;
    }

    public void setAgenciesAboveThreshold(Integer agenciesAboveThreshold) {
        this.agenciesAboveThreshold = agenciesAboveThreshold;
    }

    public Integer getAgenciesBelowThreshold() {
        return agenciesBelowThreshold;
    }

    public void setAgenciesBelowThreshold(Integer agenciesBelowThreshold) {
        this.agenciesBelowThreshold = agenciesBelowThreshold;
    }
}

