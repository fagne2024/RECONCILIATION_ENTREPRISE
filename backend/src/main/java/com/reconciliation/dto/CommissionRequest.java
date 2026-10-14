package com.reconciliation.dto;

public class CommissionRequest {

    private String service;
    private String agence;
    private Double montantCommission;
    private String typeCalcul; // NOMINAL ou POURCENTAGE
    private Double pourcentage;
    private String description;
    private Boolean actif;

    public CommissionRequest() {}

    public String getService() {
        return service;
    }

    public void setService(String service) {
        this.service = service;
    }

    public String getAgence() {
        return agence;
    }

    public void setAgence(String agence) {
        this.agence = agence;
    }

    public Double getMontantCommission() {
        return montantCommission;
    }

    public void setMontantCommission(Double montantCommission) {
        this.montantCommission = montantCommission;
    }

    public String getTypeCalcul() {
        return typeCalcul;
    }

    public void setTypeCalcul(String typeCalcul) {
        this.typeCalcul = typeCalcul;
    }

    public Double getPourcentage() {
        return pourcentage;
    }

    public void setPourcentage(Double pourcentage) {
        this.pourcentage = pourcentage;
    }

    public String getDescription() {
        return description;
    }

    public void setDescription(String description) {
        this.description = description;
    }

    public Boolean getActif() {
        return actif;
    }

    public void setActif(Boolean actif) {
        this.actif = actif;
    }
}
