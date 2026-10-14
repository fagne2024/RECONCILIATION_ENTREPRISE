package com.reconciliation.dto;

import java.util.List;

public class BoPartenaireControleInterneSendEmailRequest {

    private String monthYyyyMm;
    private String country;
    private String env;
    private String commentaire;
    private List<String> recipients;
    private String summaryText;

    public String getMonthYyyyMm() { return monthYyyyMm; }
    public void setMonthYyyyMm(String monthYyyyMm) { this.monthYyyyMm = monthYyyyMm; }

    public String getCountry() { return country; }
    public void setCountry(String country) { this.country = country; }

    public String getEnv() { return env; }
    public void setEnv(String env) { this.env = env; }

    public String getCommentaire() { return commentaire; }
    public void setCommentaire(String commentaire) { this.commentaire = commentaire; }

    public List<String> getRecipients() { return recipients; }
    public void setRecipients(List<String> recipients) { this.recipients = recipients; }

    public String getSummaryText() { return summaryText; }
    public void setSummaryText(String summaryText) { this.summaryText = summaryText; }
}
