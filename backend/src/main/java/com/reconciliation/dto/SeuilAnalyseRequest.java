package com.reconciliation.dto;

import java.time.LocalDate;

public class SeuilAnalyseRequest {
    private String codeProprietaire; // Agence (obligatoire)
    private String typeOperation; // "Compense_client", "Compense_fournisseur", "Appro_client", "Appro_fournisseur" (optionnel)
    private LocalDate dateDebut; // Date de début de l'analyse
    private LocalDate dateFin; // Date de fin de l'analyse
    private Integer nombreSeuils; // Nombre de seuils à identifier (défaut: 5)
    
    // Constructeurs
    public SeuilAnalyseRequest() {
        this.nombreSeuils = 5;
    }
    
    // Getters et Setters
    public String getCodeProprietaire() {
        return codeProprietaire;
    }
    
    public void setCodeProprietaire(String codeProprietaire) {
        this.codeProprietaire = codeProprietaire;
    }
    
    public String getTypeOperation() {
        return typeOperation;
    }
    
    public void setTypeOperation(String typeOperation) {
        this.typeOperation = typeOperation;
    }
    
    public LocalDate getDateDebut() {
        return dateDebut;
    }
    
    public void setDateDebut(LocalDate dateDebut) {
        this.dateDebut = dateDebut;
    }
    
    public LocalDate getDateFin() {
        return dateFin;
    }
    
    public void setDateFin(LocalDate dateFin) {
        this.dateFin = dateFin;
    }
    
    public Integer getNombreSeuils() {
        return nombreSeuils;
    }
    
    public void setNombreSeuils(Integer nombreSeuils) {
        this.nombreSeuils = nombreSeuils;
    }
}

