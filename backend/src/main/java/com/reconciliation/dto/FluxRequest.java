package com.reconciliation.dto;

import java.time.LocalDate;

public class FluxRequest {
    private String agence;
    private LocalDate dateDebut;
    private LocalDate dateFin;
    private Double totalMises;
    private Double totalGains;
    private Double totalBonus;
    private Double payin;
    private Double payout;
    private Double retenueSurGains;

    public String getAgence() { return agence; }
    public void setAgence(String agence) { this.agence = agence; }
    public LocalDate getDateDebut() { return dateDebut; }
    public void setDateDebut(LocalDate d) { this.dateDebut = d; }
    public LocalDate getDateFin() { return dateFin; }
    public void setDateFin(LocalDate d) { this.dateFin = d; }
    public Double getTotalMises() { return totalMises; }
    public void setTotalMises(Double v) { this.totalMises = v; }
    public Double getTotalGains() { return totalGains; }
    public void setTotalGains(Double v) { this.totalGains = v; }
    public Double getTotalBonus() { return totalBonus; }
    public void setTotalBonus(Double v) { this.totalBonus = v; }
    public Double getPayin() { return payin; }
    public void setPayin(Double v) { this.payin = v; }
    public Double getPayout() { return payout; }
    public void setPayout(Double v) { this.payout = v; }
    public Double getRetenueSurGains() { return retenueSurGains; }
    public void setRetenueSurGains(Double v) { this.retenueSurGains = v; }
}
