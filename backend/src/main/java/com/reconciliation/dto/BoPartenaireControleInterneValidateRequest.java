package com.reconciliation.dto;

public class BoPartenaireControleInterneValidateRequest {

    private String monthYyyyMm;
    private String country;
    private String env;
    private String service;

    public String getMonthYyyyMm() { return monthYyyyMm; }
    public void setMonthYyyyMm(String monthYyyyMm) { this.monthYyyyMm = monthYyyyMm; }

    public String getCountry() { return country; }
    public void setCountry(String country) { this.country = country; }

    public String getEnv() { return env; }
    public void setEnv(String env) { this.env = env; }

    public String getService() { return service; }
    public void setService(String service) { this.service = service; }
}
