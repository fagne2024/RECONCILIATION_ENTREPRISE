package com.reconciliation.model;

public class ReconciliationProgress {
    private double progress; // 0-100
    private String step;
    private int currentFile;
    private int totalFiles;
    private int processedRecords;
    private int totalRecords;
    private int matchesCount;
    private int boOnlyCount;
    private int partnerRemaining;

    public ReconciliationProgress() {}

    public ReconciliationProgress(double progress, String step, int currentFile, int totalFiles) {
        this.progress = progress;
        this.step = step;
        this.currentFile = currentFile;
        this.totalFiles = totalFiles;
        this.processedRecords = currentFile;
        this.totalRecords = totalFiles;
    }

    public static ReconciliationProgress detailed(
            double progress,
            String step,
            int processedRecords,
            int totalRecords,
            int matchesCount,
            int boOnlyCount,
            int partnerRemaining) {
        ReconciliationProgress p = new ReconciliationProgress();
        p.progress = progress;
        p.step = step;
        p.processedRecords = processedRecords;
        p.totalRecords = totalRecords;
        p.currentFile = processedRecords;
        p.totalFiles = totalRecords;
        p.matchesCount = matchesCount;
        p.boOnlyCount = boOnlyCount;
        p.partnerRemaining = partnerRemaining;
        return p;
    }

    public double getProgress() { return progress; }
    public void setProgress(double progress) { this.progress = progress; }

    public String getStep() { return step; }
    public void setStep(String step) { this.step = step; }

    public int getCurrentFile() { return currentFile; }
    public void setCurrentFile(int currentFile) { this.currentFile = currentFile; }

    public int getTotalFiles() { return totalFiles; }
    public void setTotalFiles(int totalFiles) { this.totalFiles = totalFiles; }

    public int getProcessedRecords() { return processedRecords; }
    public void setProcessedRecords(int processedRecords) { this.processedRecords = processedRecords; }

    public int getTotalRecords() { return totalRecords; }
    public void setTotalRecords(int totalRecords) { this.totalRecords = totalRecords; }

    public int getMatchesCount() { return matchesCount; }
    public void setMatchesCount(int matchesCount) { this.matchesCount = matchesCount; }

    public int getBoOnlyCount() { return boOnlyCount; }
    public void setBoOnlyCount(int boOnlyCount) { this.boOnlyCount = boOnlyCount; }

    public int getPartnerRemaining() { return partnerRemaining; }
    public void setPartnerRemaining(int partnerRemaining) { this.partnerRemaining = partnerRemaining; }
}
