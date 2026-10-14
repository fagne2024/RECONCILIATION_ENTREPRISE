package com.reconciliation.dto;

public class RedevanceParamRequest {
    private String agence;
    private Double retenueSurGainsPourcentage;
    private Double retenueSurGainsSeuil;
    private Double taxeJeuxHasardPourcentage;
    private Double tauxRedevancePourcentage;

    public String getAgence() { return agence; }
    public void setAgence(String agence) { this.agence = agence; }
    public Double getRetenueSurGainsPourcentage() { return retenueSurGainsPourcentage; }
    public void setRetenueSurGainsPourcentage(Double v) { this.retenueSurGainsPourcentage = v; }
    public Double getRetenueSurGainsSeuil() { return retenueSurGainsSeuil; }
    public void setRetenueSurGainsSeuil(Double v) { this.retenueSurGainsSeuil = v; }
    public Double getTaxeJeuxHasardPourcentage() { return taxeJeuxHasardPourcentage; }
    public void setTaxeJeuxHasardPourcentage(Double v) { this.taxeJeuxHasardPourcentage = v; }
    public Double getTauxRedevancePourcentage() { return tauxRedevancePourcentage; }
    public void setTauxRedevancePourcentage(Double v) { this.tauxRedevancePourcentage = v; }
}
