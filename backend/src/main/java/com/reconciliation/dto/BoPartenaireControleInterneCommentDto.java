package com.reconciliation.dto;

public class BoPartenaireControleInterneCommentDto {

    private String monthYyyyMm;
    private String country;
    private String env;
    private String commentaire;
    private String updatedBy;
    private String updatedAt;
    private String lastEmailedAt;
    private String lastEmailedBy;

    public String getMonthYyyyMm() { return monthYyyyMm; }
    public void setMonthYyyyMm(String monthYyyyMm) { this.monthYyyyMm = monthYyyyMm; }

    public String getCountry() { return country; }
    public void setCountry(String country) { this.country = country; }

    public String getEnv() { return env; }
    public void setEnv(String env) { this.env = env; }

    public String getCommentaire() { return commentaire; }
    public void setCommentaire(String commentaire) { this.commentaire = commentaire; }

    public String getUpdatedBy() { return updatedBy; }
    public void setUpdatedBy(String updatedBy) { this.updatedBy = updatedBy; }

    public String getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(String updatedAt) { this.updatedAt = updatedAt; }

    public String getLastEmailedAt() { return lastEmailedAt; }
    public void setLastEmailedAt(String lastEmailedAt) { this.lastEmailedAt = lastEmailedAt; }

    public String getLastEmailedBy() { return lastEmailedBy; }
    public void setLastEmailedBy(String lastEmailedBy) { this.lastEmailedBy = lastEmailedBy; }
}
