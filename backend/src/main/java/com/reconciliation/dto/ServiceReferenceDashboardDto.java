package com.reconciliation.dto;

public class ServiceReferenceDashboardDto {
    private String country;
    private double trxReconBrut;
    private double trxReconNet;
    private double totalVolume;
    private double reconcilableVolume;
    private double nonReconcilableVolume;
    private long totalTransactions;
    private long reconcilableTransactions;
    private long nonReconcilableTransactions;
    /** Nombre de services distincts (agency_summary), un service = une seule fois par pays. */
    private long totalServiceCount;
    private long reconcilableServiceCount;

    public String getCountry() {
        return country;
    }

    public void setCountry(String country) {
        this.country = country;
    }

    public double getTrxReconBrut() {
        return trxReconBrut;
    }

    public void setTrxReconBrut(double trxReconBrut) {
        this.trxReconBrut = trxReconBrut;
    }

    public double getTrxReconNet() {
        return trxReconNet;
    }

    public void setTrxReconNet(double trxReconNet) {
        this.trxReconNet = trxReconNet;
    }

    public double getTotalVolume() {
        return totalVolume;
    }

    public void setTotalVolume(double totalVolume) {
        this.totalVolume = totalVolume;
    }

    public double getReconcilableVolume() {
        return reconcilableVolume;
    }

    public void setReconcilableVolume(double reconcilableVolume) {
        this.reconcilableVolume = reconcilableVolume;
    }

    public long getTotalTransactions() {
        return totalTransactions;
    }

    public void setTotalTransactions(long totalTransactions) {
        this.totalTransactions = totalTransactions;
    }

    public long getReconcilableTransactions() {
        return reconcilableTransactions;
    }

    public void setReconcilableTransactions(long reconcilableTransactions) {
        this.reconcilableTransactions = reconcilableTransactions;
    }

    public double getNonReconcilableVolume() {
        return nonReconcilableVolume;
    }

    public void setNonReconcilableVolume(double nonReconcilableVolume) {
        this.nonReconcilableVolume = nonReconcilableVolume;
    }

    public long getNonReconcilableTransactions() {
        return nonReconcilableTransactions;
    }

    public void setNonReconcilableTransactions(long nonReconcilableTransactions) {
        this.nonReconcilableTransactions = nonReconcilableTransactions;
    }

    public long getTotalServiceCount() {
        return totalServiceCount;
    }

    public void setTotalServiceCount(long totalServiceCount) {
        this.totalServiceCount = totalServiceCount;
    }

    public long getReconcilableServiceCount() {
        return reconcilableServiceCount;
    }

    public void setReconcilableServiceCount(long reconcilableServiceCount) {
        this.reconcilableServiceCount = reconcilableServiceCount;
    }
}

