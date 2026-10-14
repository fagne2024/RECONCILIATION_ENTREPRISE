package com.reconciliation.entity;

import jakarta.persistence.*;

@Entity
@jakarta.persistence.EntityListeners(com.reconciliation.tenant.TenantGuardEntityListener.class)
public class AgencySummaryEntity {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** Entreprise proprietaire (isolation multi-entreprise, colonne technique). */
    @org.hibernate.annotations.TenantId
    @jakarta.persistence.Column(name = "entreprise_id", nullable = false)
    @com.fasterxml.jackson.annotation.JsonIgnore
    private Long entrepriseId;
    private String agency;
    private String service;
    private String country;
    private String date;
    private double totalVolume;
    private int recordCount;
    private String timestamp;

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public String getAgency() { return agency; }
    public void setAgency(String agency) { this.agency = agency; }
    public String getService() { return service; }
    public void setService(String service) { this.service = service; }
    public String getCountry() { return country; }
    public void setCountry(String country) { this.country = country; }
    public String getDate() { return date; }
    public void setDate(String date) { this.date = date; }
    public double getTotalVolume() { return totalVolume; }
    public void setTotalVolume(double totalVolume) { this.totalVolume = totalVolume; }
    public int getRecordCount() { return recordCount; }
    public void setRecordCount(int recordCount) { this.recordCount = recordCount; }
    public String getTimestamp() { return timestamp; }
    public void setTimestamp(String timestamp) { this.timestamp = timestamp; }
} 