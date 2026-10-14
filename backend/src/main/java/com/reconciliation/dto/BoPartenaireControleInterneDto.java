package com.reconciliation.dto;

public class BoPartenaireControleInterneDto {

    private Long id;
    private String monthYyyyMm;
    private String country;
    private String env;
    private String service;
    private String statut;
    private String validatedBy;
    private String validatedAt;

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }

    public String getMonthYyyyMm() { return monthYyyyMm; }
    public void setMonthYyyyMm(String monthYyyyMm) { this.monthYyyyMm = monthYyyyMm; }

    public String getCountry() { return country; }
    public void setCountry(String country) { this.country = country; }

    public String getEnv() { return env; }
    public void setEnv(String env) { this.env = env; }

    public String getService() { return service; }
    public void setService(String service) { this.service = service; }

    public String getStatut() { return statut; }
    public void setStatut(String statut) { this.statut = statut; }

    public String getValidatedBy() { return validatedBy; }
    public void setValidatedBy(String validatedBy) { this.validatedBy = validatedBy; }

    public String getValidatedAt() { return validatedAt; }
    public void setValidatedAt(String validatedAt) { this.validatedAt = validatedAt; }
}
