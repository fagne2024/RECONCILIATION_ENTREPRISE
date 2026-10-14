package com.reconciliation.model;

import java.time.LocalDateTime;

public class EcartSolde {
    private Long id;
    private String idTransaction;
    private String telephoneClient;
    private Double montant;
    private String service;
    private String agence;
    private LocalDateTime dateTransaction;
    private String numeroTransGu;
    private String pays;
    private LocalDateTime dateImport;
    private String statut;
    private String commentaire;
    
    // Constructeurs
    public EcartSolde() {}
    
    public EcartSolde(Long id, String idTransaction, String telephoneClient, Double montant, 
                      String service, String agence, LocalDateTime dateTransaction, 
                      String numeroTransGu, String pays, LocalDateTime dateImport, 
                      String statut, String commentaire) {
        this.id = id;
        this.idTransaction = idTransaction;
        this.telephoneClient = telephoneClient;
        this.montant = montant;
        this.service = service;
        this.agence = agence;
        this.dateTransaction = dateTransaction;
        this.numeroTransGu = numeroTransGu;
        this.pays = pays;
        this.dateImport = dateImport;
        this.statut = statut;
        this.commentaire = commentaire;
    }
    
    // Getters et Setters
    public Long getId() {
        return id;
    }
    
    public void setId(Long id) {
        this.id = id;
    }
    
    public String getIdTransaction() {
        return idTransaction;
    }
    
    public void setIdTransaction(String idTransaction) {
        this.idTransaction = idTransaction;
    }
    
    public String getTelephoneClient() {
        return telephoneClient;
    }
    
    public void setTelephoneClient(String telephoneClient) {
        this.telephoneClient = telephoneClient;
    }
    
    public Double getMontant() {
        return montant;
    }
    
    public void setMontant(Double montant) {
        this.montant = montant;
    }
    
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
    
    public LocalDateTime getDateTransaction() {
        return dateTransaction;
    }
    
    public void setDateTransaction(LocalDateTime dateTransaction) {
        this.dateTransaction = dateTransaction;
    }
    
    public String getNumeroTransGu() {
        return numeroTransGu;
    }
    
    public void setNumeroTransGu(String numeroTransGu) {
        this.numeroTransGu = numeroTransGu;
    }
    
    public String getPays() {
        return pays;
    }
    
    public void setPays(String pays) {
        this.pays = pays;
    }
    
    public LocalDateTime getDateImport() {
        return dateImport;
    }
    
    public void setDateImport(LocalDateTime dateImport) {
        this.dateImport = dateImport;
    }
    
    public String getStatut() {
        return statut;
    }
    
    public void setStatut(String statut) {
        this.statut = statut;
    }
    
    public String getCommentaire() {
        return commentaire;
    }
    
    public void setCommentaire(String commentaire) {
        this.commentaire = commentaire;
    }
} 