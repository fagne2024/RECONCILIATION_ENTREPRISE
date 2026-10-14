package com.reconciliation.dto;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;

public class PredictionResponse {
    private String typeOperation;
    private LocalDate dateDebutPrediction;
    private LocalDate dateFinPrediction;
    private Integer horizonJours;
    private String methodePrediction;
    
    // Prédictions par jour
    private List<PredictionJour> predictionsParJour;
    
    // Statistiques globales
    private Double montantTotalPrediction;
    private Double montantMoyenParJour;
    private Double montantMin;
    private Double montantMax;
    private Integer nombreOperationsPredites;
    private Double frequenceMoyenneParJour;
    
    // Statistiques historiques utilisées pour la prédiction
    private Map<String, Object> statistiquesHistoriques;
    
    // Métadonnées
    private Double confiance; // Score de confiance (0-1)
    private String message;
    
    // Getters et Setters
    public String getTypeOperation() {
        return typeOperation;
    }
    
    public void setTypeOperation(String typeOperation) {
        this.typeOperation = typeOperation;
    }
    
    public LocalDate getDateDebutPrediction() {
        return dateDebutPrediction;
    }
    
    public void setDateDebutPrediction(LocalDate dateDebutPrediction) {
        this.dateDebutPrediction = dateDebutPrediction;
    }
    
    public LocalDate getDateFinPrediction() {
        return dateFinPrediction;
    }
    
    public void setDateFinPrediction(LocalDate dateFinPrediction) {
        this.dateFinPrediction = dateFinPrediction;
    }
    
    public Integer getHorizonJours() {
        return horizonJours;
    }
    
    public void setHorizonJours(Integer horizonJours) {
        this.horizonJours = horizonJours;
    }
    
    public String getMethodePrediction() {
        return methodePrediction;
    }
    
    public void setMethodePrediction(String methodePrediction) {
        this.methodePrediction = methodePrediction;
    }
    
    public List<PredictionJour> getPredictionsParJour() {
        return predictionsParJour;
    }
    
    public void setPredictionsParJour(List<PredictionJour> predictionsParJour) {
        this.predictionsParJour = predictionsParJour;
    }
    
    public Double getMontantTotalPrediction() {
        return montantTotalPrediction;
    }
    
    public void setMontantTotalPrediction(Double montantTotalPrediction) {
        this.montantTotalPrediction = montantTotalPrediction;
    }
    
    public Double getMontantMoyenParJour() {
        return montantMoyenParJour;
    }
    
    public void setMontantMoyenParJour(Double montantMoyenParJour) {
        this.montantMoyenParJour = montantMoyenParJour;
    }
    
    public Double getMontantMin() {
        return montantMin;
    }
    
    public void setMontantMin(Double montantMin) {
        this.montantMin = montantMin;
    }
    
    public Double getMontantMax() {
        return montantMax;
    }
    
    public void setMontantMax(Double montantMax) {
        this.montantMax = montantMax;
    }
    
    public Integer getNombreOperationsPredites() {
        return nombreOperationsPredites;
    }
    
    public void setNombreOperationsPredites(Integer nombreOperationsPredites) {
        this.nombreOperationsPredites = nombreOperationsPredites;
    }
    
    public Double getFrequenceMoyenneParJour() {
        return frequenceMoyenneParJour;
    }
    
    public void setFrequenceMoyenneParJour(Double frequenceMoyenneParJour) {
        this.frequenceMoyenneParJour = frequenceMoyenneParJour;
    }
    
    public Map<String, Object> getStatistiquesHistoriques() {
        return statistiquesHistoriques;
    }
    
    public void setStatistiquesHistoriques(Map<String, Object> statistiquesHistoriques) {
        this.statistiquesHistoriques = statistiquesHistoriques;
    }
    
    public Double getConfiance() {
        return confiance;
    }
    
    public void setConfiance(Double confiance) {
        this.confiance = confiance;
    }
    
    public String getMessage() {
        return message;
    }
    
    public void setMessage(String message) {
        this.message = message;
    }
    
    // Classe interne pour les prédictions par jour
    public static class PredictionJour {
        private LocalDate date;
        private Double montantPrediction;
        private Integer nombreOperationsPredites;
        private Double confiance; // Confiance pour cette journée spécifique
        private String jourSemaine;
        private Double soldeAvantPrediction; // Solde avant les opérations du jour
        private Double soldeApresPrediction; // Solde après les opérations du jour
        
        public PredictionJour() {}
        
        public PredictionJour(LocalDate date, Double montantPrediction, Integer nombreOperationsPredites, Double confiance) {
            this.date = date;
            this.montantPrediction = montantPrediction;
            this.nombreOperationsPredites = nombreOperationsPredites;
            this.confiance = confiance;
            this.jourSemaine = date.getDayOfWeek().toString();
        }
        
        public PredictionJour(LocalDate date, Double montantPrediction, Integer nombreOperationsPredites, Double confiance, 
                              Double soldeAvantPrediction, Double soldeApresPrediction) {
            this.date = date;
            this.montantPrediction = montantPrediction;
            this.nombreOperationsPredites = nombreOperationsPredites;
            this.confiance = confiance;
            this.jourSemaine = date.getDayOfWeek().toString();
            this.soldeAvantPrediction = soldeAvantPrediction;
            this.soldeApresPrediction = soldeApresPrediction;
        }
        
        // Getters et Setters
        public LocalDate getDate() {
            return date;
        }
        
        public void setDate(LocalDate date) {
            this.date = date;
        }
        
        public Double getMontantPrediction() {
            return montantPrediction;
        }
        
        public void setMontantPrediction(Double montantPrediction) {
            this.montantPrediction = montantPrediction;
        }
        
        public Integer getNombreOperationsPredites() {
            return nombreOperationsPredites;
        }
        
        public void setNombreOperationsPredites(Integer nombreOperationsPredites) {
            this.nombreOperationsPredites = nombreOperationsPredites;
        }
        
        public Double getConfiance() {
            return confiance;
        }
        
        public void setConfiance(Double confiance) {
            this.confiance = confiance;
        }
        
        public String getJourSemaine() {
            return jourSemaine;
        }
        
        public void setJourSemaine(String jourSemaine) {
            this.jourSemaine = jourSemaine;
        }
        
        public Double getSoldeAvantPrediction() {
            return soldeAvantPrediction;
        }
        
        public void setSoldeAvantPrediction(Double soldeAvantPrediction) {
            this.soldeAvantPrediction = soldeAvantPrediction;
        }
        
        public Double getSoldeApresPrediction() {
            return soldeApresPrediction;
        }
        
        public void setSoldeApresPrediction(Double soldeApresPrediction) {
            this.soldeApresPrediction = soldeApresPrediction;
        }
    }
}

