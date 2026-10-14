package com.reconciliation.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.PositiveOrZero;
import java.time.LocalDateTime;

public class CompteDTO {
    private Long id;

    @NotBlank(message = "Le numéro de compte est obligatoire")
    private String numeroCompte;

    @NotNull(message = "Le solde est obligatoire")
    @PositiveOrZero(message = "Le solde doit être positif ou zéro")
    private Double solde;

    private LocalDateTime dateDerniereMaj;

    @NotBlank(message = "Le pays est obligatoire")
    private String pays;

    private String codeProprietaire;
    private String agence;
    private String type;
    private String categorie;

    public CompteDTO() {}

    public CompteDTO(String numeroCompte, Double solde, LocalDateTime dateDerniereMaj, String pays) {
        this.numeroCompte = numeroCompte;
        this.solde = solde;
        this.dateDerniereMaj = dateDerniereMaj;
        this.pays = pays;
    }

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
}