package com.reconciliation.dto;

import com.reconciliation.entity.Result8RecEntity;

/**
 * Projection légère pour les rapports BO / Partenaire (moins de champs que l'entité complète).
 */
public class Result8RecReportDto {
    private Long id;
    private String date;
    private String service;
    private String country;
    private String env;
    private int totalTransactions;
    private double totalVolume;
    private String traitement;
    private String glpiId;

    public static Result8RecReportDto fromEntity(Result8RecEntity entity) {
        Result8RecReportDto dto = new Result8RecReportDto();
        dto.id = entity.getId();
        dto.date = entity.getDate();
        dto.service = entity.getService();
        dto.country = entity.getCountry();
        dto.env = entity.getEnv();
        dto.totalTransactions = entity.getTotalTransactions();
        dto.totalVolume = entity.getTotalVolume();
        dto.traitement = entity.getTraitement();
        dto.glpiId = entity.getGlpiId();
        return dto;
    }

    public Long getId() { return id; }
    public String getDate() { return date; }
    public String getService() { return service; }
    public String getCountry() { return country; }
    public String getEnv() { return env; }
    public int getTotalTransactions() { return totalTransactions; }
    public double getTotalVolume() { return totalVolume; }
    public String getTraitement() { return traitement; }
    public String getGlpiId() { return glpiId; }
}
