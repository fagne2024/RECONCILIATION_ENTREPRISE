package com.reconciliation.model;

import com.fasterxml.jackson.databind.annotation.JsonDeserialize;
import com.reconciliation.json.FlexibleLocalDateTimeDeserializer;

import java.time.LocalDateTime;

public class EcartBoSummary {
    private Long id;
    @JsonDeserialize(using = FlexibleLocalDateTimeDeserializer.class)
    private LocalDateTime dateTransaction;
    private String agence;
    private String service;
    private String pays;
    private Integer nombreTransactions;
    private Double montantTotal;
    private String statut;
    private LocalDateTime dateImport;
    private String commentaire;
    private String env;
    private String envCode;
    private String token;

    // Constructeurs
    public EcartBoSummary() {}
    
    public EcartBoSummary(Long id, LocalDateTime dateTransaction, String agence, String service, 
                         String pays, Integer nombreTransactions, Double montantTotal, 
                         String statut, LocalDateTime dateImport, String commentaire) {
        this.id = id;
        this.dateTransaction = dateTransaction;
        this.agence = agence;
        this.service = service;
        this.pays = pays;
        this.nombreTransactions = nombreTransactions;
        this.montantTotal = montantTotal;
        this.statut = statut;
        this.dateImport = dateImport;
        this.commentaire = commentaire;
    }
    
    // Getters et Setters
    public Long getId() {
        return id;
    }
    
    public void setId(Long id) {
        this.id = id;
    }
    
    public LocalDateTime getDateTransaction() {
        return dateTransaction;
    }
    
    public void setDateTransaction(LocalDateTime dateTransaction) {
        this.dateTransaction = dateTransaction;
    }
    
    public String getAgence() {
        return agence;
    }
    
    public void setAgence(String agence) {
        this.agence = agence;
    }
    
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
    
    public Integer getNombreTransactions() {
        return nombreTransactions;
    }
    
    public void setNombreTransactions(Integer nombreTransactions) {
        this.nombreTransactions = nombreTransactions;
    }
    
    public Double getMontantTotal() {
        return montantTotal;
    }
    
    public void setMontantTotal(Double montantTotal) {
        this.montantTotal = montantTotal;
    }
    
    public String getStatut() {
        return statut;
    }
    
    public void setStatut(String statut) {
        this.statut = statut;
    }
    
    public LocalDateTime getDateImport() {
        return dateImport;
    }
    
    public void setDateImport(LocalDateTime dateImport) {
        this.dateImport = dateImport;
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
