package com.reconciliation.entity;

import jakarta.persistence.*;

@Entity
@jakarta.persistence.EntityListeners(com.reconciliation.tenant.TenantGuardEntityListener.class)
@Table(name = "result8rec")
public class Result8RecEntity {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** Entreprise proprietaire (isolation multi-entreprise, colonne technique). */
    @org.hibernate.annotations.TenantId
    @jakarta.persistence.Column(name = "entreprise_id", nullable = false)
    @com.fasterxml.jackson.annotation.JsonIgnore
    private Long entrepriseId;

    private String date;
    private String agency;
    private String service;
    private String country;
    // Nouvel environnement (BET, HT, HUBAO, TOP20, GU3, TOTAL, ...)
    private String env;

    private int totalTransactions;
    private double totalVolume;
    private int matches;
    private int boOnly;
    private int partnerOnly;
    private int mismatches;
    private double matchRate;

    private String status;
    private String comment;
    private String traitement;
    private String username;

    private String glpiId;

    private String createdAt;

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }

    public String getDate() { return date; }
    public void setDate(String date) { this.date = date; }

    public String getAgency() { return agency; }
    public void setAgency(String agency) { this.agency = agency; }

    public String getService() { return service; }
    public void setService(String service) { this.service = service; }

    public String getCountry() { return country; }
    public void setCountry(String country) { this.country = country; }

    public String getEnv() { return env; }
    public void setEnv(String env) { this.env = env; }

    public int getTotalTransactions() { return totalTransactions; }
    public void setTotalTransactions(int totalTransactions) { this.totalTransactions = totalTransactions; }

    public double getTotalVolume() { return totalVolume; }
    public void setTotalVolume(double totalVolume) { this.totalVolume = totalVolume; }

    public int getMatches() { return matches; }
    public void setMatches(int matches) { this.matches = matches; }

    public int getBoOnly() { return boOnly; }
    public void setBoOnly(int boOnly) { this.boOnly = boOnly; }

    public int getPartnerOnly() { return partnerOnly; }
    public void setPartnerOnly(int partnerOnly) { this.partnerOnly = partnerOnly; }

    public int getMismatches() { return mismatches; }
    public void setMismatches(int mismatches) { this.mismatches = mismatches; }

    public double getMatchRate() { return matchRate; }
    public void setMatchRate(double matchRate) { this.matchRate = matchRate; }

    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }

    public String getComment() { return comment; }
    public void setComment(String comment) { this.comment = comment; }

    public String getTraitement() { return traitement; }
    public void setTraitement(String traitement) { this.traitement = traitement; }

    public String getUsername() { return username; }
    public void setUsername(String username) { this.username = username; }

    public String getGlpiId() { return glpiId; }
    public void setGlpiId(String glpiId) { this.glpiId = glpiId; }

    public String getCreatedAt() { return createdAt; }
    public void setCreatedAt(String createdAt) { this.createdAt = createdAt; }
}


