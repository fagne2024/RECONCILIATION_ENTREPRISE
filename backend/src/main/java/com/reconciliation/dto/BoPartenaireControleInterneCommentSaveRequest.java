package com.reconciliation.dto;

public class BoPartenaireControleInterneCommentSaveRequest {

    private String monthYyyyMm;
    private String country;
    private String env;
    private String commentaire;

    public String getMonthYyyyMm() { return monthYyyyMm; }
    public void setMonthYyyyMm(String monthYyyyMm) { this.monthYyyyMm = monthYyyyMm; }

    public String getCountry() { return country; }
    public void setCountry(String country) { this.country = country; }

    public String getEnv() { return env; }
    public void setEnv(String env) { this.env = env; }

    public String getCommentaire() { return commentaire; }
    public void setCommentaire(String commentaire) { this.commentaire = commentaire; }
}
