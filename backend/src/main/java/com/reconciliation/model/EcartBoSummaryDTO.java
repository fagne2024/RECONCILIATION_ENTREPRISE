package com.reconciliation.model;

public class EcartBoSummaryDTO {
    private String agence;
    private String service;
    private String pays;
    private Double montant;
    private String date;
    private String statut;
    private Integer nombreTransactions;
    private String commentaire;
    private String env;
    private String envCode;
    private String token;

    // Constructeurs
    public EcartBoSummaryDTO() {}

    public EcartBoSummaryDTO(String agence, String service, String pays, Double montant, String date, String statut, Integer nombreTransactions) {
        this.agence = agence;
        this.service = service;
        this.pays = pays;
        this.montant = montant;
        this.date = date;
        this.statut = statut;
        this.nombreTransactions = nombreTransactions;
    }
    
    public String getAgence() {
        return agence;
    }
    
    public void setAgence(String agence) {
        this.agence = agence;
    }

    // Getters et Setters
    public String getService() {
        return service;
    }

    public void setService(String service) {
        this.service = service;
    }

    public String getPays() {
        return pays;
    }

    public void setPays(String pays) {
        this.pays = pays;
    }

    public Double getMontant() {
        return montant;
    }

    public void setMontant(Double montant) {
        this.montant = montant;
    }

    public String getDate() {
        return date;
    }

    public void setDate(String date) {
        this.date = date;
    }

    public String getStatut() {
        return statut;
    }

    public void setStatut(String statut) {
        this.statut = statut;
    }

    public Integer getNombreTransactions() {
        return nombreTransactions;
    }

    public void setNombreTransactions(Integer nombreTransactions) {
        this.nombreTransactions = nombreTransactions;
    }

    public String getCommentaire() {
        return commentaire;
    }

    public void setCommentaire(String commentaire) {
        this.commentaire = commentaire;
    }
    
    public String getEnv() {
        return env;
    }
    
    public void setEnv(String env) {
        this.env = env;
    }

    public String getEnvCode() {
        return envCode;
    }

    public void setEnvCode(String envCode) {
        this.envCode = envCode;
    }

    public String getToken() {
        return token;
    }

    public void setToken(String token) {
        this.token = token;
    }
}
