package com.reconciliation.dto;

public class MonthlyReconciliationKpiDto {
    public String yearMonth; // YYYY-MM
    public long totalTransactions;
    public double totalVolume;
    public long matches;
    public long ecartsTraites;
    public double tauxCorrespondance; // 0..100

    public MonthlyReconciliationKpiDto() {}

    public MonthlyReconciliationKpiDto(
            String yearMonth,
            long totalTransactions,
            double totalVolume,
            long matches,
            long ecartsTraites,
            double tauxCorrespondance
    ) {
        this.yearMonth = yearMonth;
        this.totalTransactions = totalTransactions;
        this.totalVolume = totalVolume;
        this.matches = matches;
        this.ecartsTraites = ecartsTraites;
        this.tauxCorrespondance = tauxCorrespondance;
    }
}

