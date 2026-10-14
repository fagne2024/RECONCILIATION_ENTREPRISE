package com.reconciliation.model;

public class SuiviEcart {
    private Long id;
    private String date;
    private String agence;
    private String service;
    private String pays;
    private Double montant;
    private String token;
    private String idPartenaire;
    private String statut;
    private String traitement;
    private String username;
    private String glpiId;
    private String telephone;
    private String commentaire;
    
    // Constructeurs
    public SuiviEcart() {}
    
    public SuiviEcart(Long id, String date, String agence, String service, String pays,
                     Double montant, String token, String idPartenaire,
                     String statut, String traitement, String username, String glpiId,
                     String telephone, String commentaire) {
        this.id = id;
        this.date = date;
        this.agence = agence;
        this.service = service;
        this.pays = pays;
        this.montant = montant;
        this.token = token;
        this.idPartenaire = idPartenaire;
        this.statut = statut;
        this.traitement = traitement;
        this.username = username;
        this.glpiId = glpiId;
        this.telephone = telephone;
        this.commentaire = commentaire;
    }
    
    // Getters et Setters
    public Long getId() {
        return id;
    }
    
    public void setId(Long id) {
        this.id = id;
    }
    
    public String getDate() {
        return date;
    }
    
    public void setDate(String date) {
        this.date = date;
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
    
    public Double getMontant() {
        return montant;
    }
    
    public void setMontant(Double montant) {
        this.montant = montant;
    }
    
    public String getToken() {
        return token;
    }
    
    public void setToken(String token) {
        this.token = token;
    }
    
    public String getIdPartenaire() {
        return idPartenaire;
    }
    
    public void setIdPartenaire(String idPartenaire) {
        this.idPartenaire = idPartenaire;
    }
    
    public String getStatut() {
        return statut;
    }
    
    public void setStatut(String statut) {
        this.statut = statut;
    }
    
    public String getTraitement() {
        return traitement;
    }
    
    public void setTraitement(String traitement) {
        this.traitement = traitement;
    }
    
    public String getUsername() {
        return username;
    }
    
    public void setUsername(String username) {
        this.username = username;
    }
    
    public String getGlpiId() {
        return glpiId;
    }
    
    public void setGlpiId(String glpiId) {
        this.glpiId = glpiId;
    }
    
    public String getTelephone() {
        return telephone;
    }
    
    public void setTelephone(String telephone) {
        this.telephone = telephone;
    }
    
    public String getCommentaire() {
        return commentaire;
    }
    
    public void setCommentaire(String commentaire) {
        this.commentaire = commentaire;
    }
}

