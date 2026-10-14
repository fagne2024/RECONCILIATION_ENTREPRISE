package com.reconciliation.dto;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;

public class SeuilAnalyseResponse {
    private String codeProprietaire;
    private String typeOperation;
    private LocalDate dateDebut;
    private LocalDate dateFin;
    private Integer nombreOperationsAnalysees;
    
    // Évolution du solde
    private List<EvolutionSolde> evolutionSolde;
    
    // Analyse des seuils
    private SeuilStatistiques seuils;
    
    // Opérations analysées avec leurs soldes avant
    private List<OperationAvecSolde> operationsAnalysees;
    
    // Statistiques générales
    private Map<String, Object> statistiques;
    
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
    
    public Integer getNombreOperationsAnalysees() {
        return nombreOperationsAnalysees;
    }
    
    public void setNombreOperationsAnalysees(Integer nombreOperationsAnalysees) {
        this.nombreOperationsAnalysees = nombreOperationsAnalysees;
    }
    
    public List<EvolutionSolde> getEvolutionSolde() {
        return evolutionSolde;
    }
    
    public void setEvolutionSolde(List<EvolutionSolde> evolutionSolde) {
        this.evolutionSolde = evolutionSolde;
    }
    
    public SeuilStatistiques getSeuils() {
        return seuils;
    }
    
    public void setSeuils(SeuilStatistiques seuils) {
        this.seuils = seuils;
    }
    
    public List<OperationAvecSolde> getOperationsAnalysees() {
        return operationsAnalysees;
    }
    
    public void setOperationsAnalysees(List<OperationAvecSolde> operationsAnalysees) {
        this.operationsAnalysees = operationsAnalysees;
    }
    
    public Map<String, Object> getStatistiques() {
        return statistiques;
    }
    
    public void setStatistiques(Map<String, Object> statistiques) {
        this.statistiques = statistiques;
    }
    
    // Classe pour l'évolution du solde
    public static class EvolutionSolde {
        private LocalDate date;
        private Double soldeAvant;
        private Double soldeApres;
        private String typeOperation;
        private Double montant;
        private String operationId;
        
        public EvolutionSolde() {}
        
        public EvolutionSolde(LocalDate date, Double soldeAvant, Double soldeApres, String typeOperation, Double montant, String operationId) {
            this.date = date;
            this.soldeAvant = soldeAvant;
            this.soldeApres = soldeApres;
            this.typeOperation = typeOperation;
            this.montant = montant;
            this.operationId = operationId;
        }
        
        // Getters et Setters
        public LocalDate getDate() { return date; }
        public void setDate(LocalDate date) { this.date = date; }
        
        public Double getSoldeAvant() { return soldeAvant; }
        public void setSoldeAvant(Double soldeAvant) { this.soldeAvant = soldeAvant; }
        
        public Double getSoldeApres() { return soldeApres; }
        public void setSoldeApres(Double soldeApres) { this.soldeApres = soldeApres; }
        
        public String getTypeOperation() { return typeOperation; }
        public void setTypeOperation(String typeOperation) { this.typeOperation = typeOperation; }
        
        public Double getMontant() { return montant; }
        public void setMontant(Double montant) { this.montant = montant; }
        
        public String getOperationId() { return operationId; }
        public void setOperationId(String operationId) { this.operationId = operationId; }
    }
    
    // Classe pour les statistiques de seuils
    public static class SeuilStatistiques {
        private Double soldeMoyenAvantOperation;
        private Double soldeMinAvantOperation;
        private Double soldeMaxAvantOperation;
        private Double soldeMedianAvantOperation;
        private Double ecartTypeSoldeAvant;
        
        // Seuils identifiés (groupes de valeurs similaires)
        private List<SeuilGroupe> seuilsIdentifies;
        
        // Recommandation de seuil
        private Double seuilRecommandé;
        private String raisonSeuilRecommandé;
        
        public SeuilStatistiques() {}
        
        // Getters et Setters
        public Double getSoldeMoyenAvantOperation() { return soldeMoyenAvantOperation; }
        public void setSoldeMoyenAvantOperation(Double soldeMoyenAvantOperation) { this.soldeMoyenAvantOperation = soldeMoyenAvantOperation; }
        
        public Double getSoldeMinAvantOperation() { return soldeMinAvantOperation; }
        public void setSoldeMinAvantOperation(Double soldeMinAvantOperation) { this.soldeMinAvantOperation = soldeMinAvantOperation; }
        
        public Double getSoldeMaxAvantOperation() { return soldeMaxAvantOperation; }
        public void setSoldeMaxAvantOperation(Double soldeMaxAvantOperation) { this.soldeMaxAvantOperation = soldeMaxAvantOperation; }
        
        public Double getSoldeMedianAvantOperation() { return soldeMedianAvantOperation; }
        public void setSoldeMedianAvantOperation(Double soldeMedianAvantOperation) { this.soldeMedianAvantOperation = soldeMedianAvantOperation; }
        
        public Double getEcartTypeSoldeAvant() { return ecartTypeSoldeAvant; }
        public void setEcartTypeSoldeAvant(Double ecartTypeSoldeAvant) { this.ecartTypeSoldeAvant = ecartTypeSoldeAvant; }
        
        public List<SeuilGroupe> getSeuilsIdentifies() { return seuilsIdentifies; }
        public void setSeuilsIdentifies(List<SeuilGroupe> seuilsIdentifies) { this.seuilsIdentifies = seuilsIdentifies; }
        
        public Double getSeuilRecommandé() { return seuilRecommandé; }
        public void setSeuilRecommandé(Double seuilRecommandé) { this.seuilRecommandé = seuilRecommandé; }
        
        public String getRaisonSeuilRecommandé() { return raisonSeuilRecommandé; }
        public void setRaisonSeuilRecommandé(String raisonSeuilRecommandé) { this.raisonSeuilRecommandé = raisonSeuilRecommandé; }
    }
    
    // Classe pour un groupe de seuils similaires
    public static class SeuilGroupe {
        private Double seuilMin;
        private Double seuilMax;
        private Double seuilMoyen;
        private Integer nombreOperations;
        private Double pourcentage;
        
        public SeuilGroupe() {}
        
        public SeuilGroupe(Double seuilMin, Double seuilMax, Double seuilMoyen, Integer nombreOperations, Double pourcentage) {
            this.seuilMin = seuilMin;
            this.seuilMax = seuilMax;
            this.seuilMoyen = seuilMoyen;
            this.nombreOperations = nombreOperations;
            this.pourcentage = pourcentage;
        }
        
        // Getters et Setters
        public Double getSeuilMin() { return seuilMin; }
        public void setSeuilMin(Double seuilMin) { this.seuilMin = seuilMin; }
        
        public Double getSeuilMax() { return seuilMax; }
        public void setSeuilMax(Double seuilMax) { this.seuilMax = seuilMax; }
        
        public Double getSeuilMoyen() { return seuilMoyen; }
        public void setSeuilMoyen(Double seuilMoyen) { this.seuilMoyen = seuilMoyen; }
        
        public Integer getNombreOperations() { return nombreOperations; }
        public void setNombreOperations(Integer nombreOperations) { this.nombreOperations = nombreOperations; }
        
        public Double getPourcentage() { return pourcentage; }
        public void setPourcentage(Double pourcentage) { this.pourcentage = pourcentage; }
    }
    
    // Classe pour une opération avec son solde avant
    public static class OperationAvecSolde {
        private Long operationId;
        private LocalDate dateOperation;
        private String typeOperation;
        private Double montant;
        private Double soldeAvant;
        private Double soldeApres;
        private String service;
        
        public OperationAvecSolde() {}
        
        public OperationAvecSolde(Long operationId, LocalDate dateOperation, String typeOperation, 
                                  Double montant, Double soldeAvant, Double soldeApres, String service) {
            this.operationId = operationId;
            this.dateOperation = dateOperation;
            this.typeOperation = typeOperation;
            this.montant = montant;
            this.soldeAvant = soldeAvant;
            this.soldeApres = soldeApres;
            this.service = service;
        }
        
        // Getters et Setters
        public Long getOperationId() { return operationId; }
        public void setOperationId(Long operationId) { this.operationId = operationId; }
        
        public LocalDate getDateOperation() { return dateOperation; }
        public void setDateOperation(LocalDate dateOperation) { this.dateOperation = dateOperation; }
        
        public String getTypeOperation() { return typeOperation; }
        public void setTypeOperation(String typeOperation) { this.typeOperation = typeOperation; }
        
        public Double getMontant() { return montant; }
        public void setMontant(Double montant) { this.montant = montant; }
        
        public Double getSoldeAvant() { return soldeAvant; }
        public void setSoldeAvant(Double soldeAvant) { this.soldeAvant = soldeAvant; }
        
        public Double getSoldeApres() { return soldeApres; }
        public void setSoldeApres(Double soldeApres) { this.soldeApres = soldeApres; }
        
        public String getService() { return service; }
        public void setService(String service) { this.service = service; }
    }
}

