package com.reconciliation.dto;

import java.util.List;
import java.util.Map;

public class PilotReportDto {
    public String title;
    public String subtitle;
    public String generatedAtIso;

    public Map<String, Object> filters;

    public Summary summary;
    public List<MonthlyReconciliationKpiDto> monthly;

    public List<String> methodologyBullets;
    public List<String> benefitsBullets;
    public List<String> notesBullets;

    public static class Summary {
        public String periodStartYm;
        public String periodEndYm;

        public long totalTransactions;
        public double totalVolume;
        public long totalEcartsTraites;
        public double tauxCorrespondance;

        public int servicesDistinct;
        public int countriesDistinct;
        public int agenciesDistinct;

        public Summary() {}
    }
}

