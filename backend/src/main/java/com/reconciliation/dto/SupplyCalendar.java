package com.reconciliation.dto;

import java.time.LocalDate;
import java.util.List;

/**
 * Calendrier prédictif des approvisionnements
 */
public class SupplyCalendar {
    private LocalDate startDate;
    private LocalDate endDate;
    private Integer totalDays;
    private List<CalendarEvent> events; // Événements groupés par jour/semaine
    
    // Métriques globales
    private Integer totalOrders; // Nombre total de commandes prévues
    private Integer urgentOrders; // Commandes urgentes
    private Integer normalOrders; // Commandes normales
    private Integer lowPriorityOrders; // Commandes faible priorité
    
    // Constructeurs
    public SupplyCalendar() {}
    
    public SupplyCalendar(LocalDate startDate, LocalDate endDate) {
        this.startDate = startDate;
        this.endDate = endDate;
        this.totalDays = (int) java.time.temporal.ChronoUnit.DAYS.between(startDate, endDate) + 1;
    }
    
    // Getters et Setters
    public LocalDate getStartDate() {
        return startDate;
    }
    
    public void setStartDate(LocalDate startDate) {
        this.startDate = startDate;
    }
    
    public LocalDate getEndDate() {
        return endDate;
    }
    
    public void setEndDate(LocalDate endDate) {
        this.endDate = endDate;
    }
    
    public Integer getTotalDays() {
        return totalDays;
    }
    
    public void setTotalDays(Integer totalDays) {
        this.totalDays = totalDays;
    }
    
    public List<CalendarEvent> getEvents() {
        return events;
    }
    
    public void setEvents(List<CalendarEvent> events) {
        this.events = events;
    }
    
    public Integer getTotalOrders() {
        return totalOrders;
    }
    
    public void setTotalOrders(Integer totalOrders) {
        this.totalOrders = totalOrders;
    }
    
    public Integer getUrgentOrders() {
        return urgentOrders;
    }
    
    public void setUrgentOrders(Integer urgentOrders) {
        this.urgentOrders = urgentOrders;
    }
    
    public Integer getNormalOrders() {
        return normalOrders;
    }
    
    public void setNormalOrders(Integer normalOrders) {
        this.normalOrders = normalOrders;
    }
    
    public Integer getLowPriorityOrders() {
        return lowPriorityOrders;
    }
    
    public void setLowPriorityOrders(Integer lowPriorityOrders) {
        this.lowPriorityOrders = lowPriorityOrders;
    }
    
    // Classe interne pour les événements du calendrier
    public static class CalendarEvent {
        private LocalDate date;
        private String codeProprietaire;
        private String agence;
        private String typeOperation;
        private Double recommendedAmount; // Pour les compensations
        private Double recommendedQuantity; // Ancien champ (pour compatibilité)
        private Double recommendedBalance; // Nouveau champ (solde recommandé)
        private String alertLevel; // urgent | normal | low
        private Integer numberOfAgencies; // Nombre d'agences concernées ce jour
        
        public CalendarEvent() {}
        
        public CalendarEvent(LocalDate date, String codeProprietaire, String agence, 
                            String typeOperation, Double recommendedQuantity, String alertLevel) {
            this.date = date;
            this.codeProprietaire = codeProprietaire;
            this.agence = agence;
            this.typeOperation = typeOperation;
            this.recommendedQuantity = recommendedQuantity;
            this.recommendedBalance = recommendedQuantity; // Par défaut, utiliser recommendedQuantity
            this.alertLevel = alertLevel;
        }
        
        // Getters et Setters
        public LocalDate getDate() {
            return date;
        }
        
        public void setDate(LocalDate date) {
            this.date = date;
        }

        // Pour compatibilité avec String (JSON)
        public void setDate(String date) {
            if (date != null && !date.isEmpty()) {
                this.date = LocalDate.parse(date);
            }
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
        
        public String getTypeOperation() {
            return typeOperation;
        }
        
        public void setTypeOperation(String typeOperation) {
            this.typeOperation = typeOperation;
        }
        
        public Double getRecommendedQuantity() {
            return recommendedQuantity;
        }
        
        public void setRecommendedQuantity(Double recommendedQuantity) {
            this.recommendedQuantity = recommendedQuantity;
        }
        
        public Double getRecommendedBalance() {
            return recommendedBalance;
        }
        
        public void setRecommendedBalance(Double recommendedBalance) {
            this.recommendedBalance = recommendedBalance;
        }

        public Double getRecommendedAmount() {
            return recommendedAmount;
        }

        public void setRecommendedAmount(Double recommendedAmount) {
            this.recommendedAmount = recommendedAmount;
        }
        
        public String getAlertLevel() {
            return alertLevel;
        }
        
        public void setAlertLevel(String alertLevel) {
            this.alertLevel = alertLevel;
        }
        
        public Integer getNumberOfAgencies() {
            return numberOfAgencies;
        }
        
        public void setNumberOfAgencies(Integer numberOfAgencies) {
            this.numberOfAgencies = numberOfAgencies;
        }
    }
}

