package com.reconciliation.dto;

public class FormOperationCreateRequest {
    private String numeroCompte;
    private String nomCompte;
    private String banque;
    private String dateComptable; // yyyy-MM-dd
    private String dateValeur;    // optionnel
    private String typeOperation;
    private Double montant;
    private String libelle;
    private String devise;
    private String commentaire;

    public String getNumeroCompte() { return numeroCompte; }
    public void setNumeroCompte(String numeroCompte) { this.numeroCompte = numeroCompte; }

    public String getNomCompte() { return nomCompte; }
    public void setNomCompte(String nomCompte) { this.nomCompte = nomCompte; }

    public String getBanque() { return banque; }
    public void setBanque(String banque) { this.banque = banque; }

    public String getDateComptable() { return dateComptable; }
    public void setDateComptable(String dateComptable) { this.dateComptable = dateComptable; }

    public String getDateValeur() { return dateValeur; }
    public void setDateValeur(String dateValeur) { this.dateValeur = dateValeur; }

    public String getTypeOperation() { return typeOperation; }
    public void setTypeOperation(String typeOperation) { this.typeOperation = typeOperation; }

    public Double getMontant() { return montant; }
    public void setMontant(Double montant) { this.montant = montant; }

    public String getLibelle() { return libelle; }
    public void setLibelle(String libelle) { this.libelle = libelle; }

    public String getDevise() { return devise; }
    public void setDevise(String devise) { this.devise = devise; }

    public String getCommentaire() { return commentaire; }
    public void setCommentaire(String commentaire) { this.commentaire = commentaire; }
}


