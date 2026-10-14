package com.reconciliation.model;

import java.time.LocalDateTime;

public class Compte {
    private Long id;
    private String numeroCompte;
    private Double solde;
    private LocalDateTime dateDerniereMaj;
    private String pays;
    private String codeProprietaire;
    private String agence;
    private String type;
    private String categorie;
    private Boolean consolide;
    private Boolean regroupe;
    
    // Constructeurs
    public Compte() {}
    
    public Compte(Long id, String numeroCompte, Double solde, LocalDateTime dateDerniereMaj, String pays) {
        this.id = id;
        this.numeroCompte = numeroCompte;
        this.solde = solde;
        this.dateDerniereMaj = dateDerniereMaj;
        this.pays = pays;
    }
    
    public Compte(Long id, String numeroCompte, Double solde, LocalDateTime dateDerniereMaj, String pays, String codeProprietaire) {
        this.id = id;
        this.numeroCompte = numeroCompte;
        this.solde = solde;
        this.dateDerniereMaj = dateDerniereMaj;
        this.pays = pays;
        this.codeProprietaire = codeProprietaire;
    }
    
    // Getters et Setters
    public Long getId() {
        return id;
    }
    
    public void setId(Long id) {
        this.id = id;
    }
    
    public String getNumeroCompte() {
        return numeroCompte;
    }
    
    public void setNumeroCompte(String numeroCompte) {
        this.numeroCompte = numeroCompte;
    }
    
    public Double getSolde() {
        return solde;
    }
    
    public void setSolde(Double solde) {
        this.solde = solde;
    }
    
    public LocalDateTime getDateDerniereMaj() {
        return dateDerniereMaj;
    }
    
    public void setDateDerniereMaj(LocalDateTime dateDerniereMaj) {
        this.dateDerniereMaj = dateDerniereMaj;
    }
    
    public String getPays() {
        return pays;
    }
    
    public void setPays(String pays) {
        this.pays = pays;
    }
    
    public String getCodeProprietaire() {
        return codeProprietaire;
    }
    
    public void setCodeProprietaire(String codeProprietaire) {
        this.codeProprietaire = codeProprietaire;
    }
    
    public String getAgence() {
        return agence;
    }
    
    public void setAgence(String agence) {
        this.agence = agence;
    }

    public String getType() {
        return type;
    }
    public void setType(String type) {
        this.type = type;
    }
    
    public String getCategorie() {
        return categorie;
    }
    
    public void setCategorie(String categorie) {
        this.categorie = categorie;
    }
    
    public Boolean getConsolide() {
        return consolide;
    }
    
    public void setConsolide(Boolean consolide) {
        this.consolide = consolide;
    }
    
    public Boolean getRegroupe() {
        return regroupe;
    }
    
    public void setRegroupe(Boolean regroupe) {
        this.regroupe = regroupe;
    }
    
    @Override
    public String toString() {
        return "Compte{" +
                "id=" + id +
                ", numeroCompte='" + numeroCompte + '\'' +
                ", solde=" + solde +
                ", dateDerniereMaj=" + dateDerniereMaj +
                ", pays='" + pays + '\'' +
                ", codeProprietaire='" + codeProprietaire + '\'' +
                ", agence='" + agence + '\'' +
                ", type='" + type + '\'' +
                ", categorie='" + categorie + '\'' +
                ", consolide=" + consolide +
                ", regroupe=" + regroupe +
                '}';
    }
} 