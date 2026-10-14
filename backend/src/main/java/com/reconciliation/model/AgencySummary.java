package com.reconciliation.model;

public class AgencySummary {
    private Long id;
    private String agency;
    private String service;
    private String country;
    private String date;
    private double totalVolume;
    private int recordCount;

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
} 