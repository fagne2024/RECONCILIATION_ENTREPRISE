package com.reconciliation.dto;

public class OperationCreateRequest {
    private Long compteId;
    private String typeOperation;
    private Double montant;
    private String banque;
    private String nomBordereau;
    private String service;
    private String dateOperation;
    private Integer recordCount;
    private Long parentOperationId;
    private String referenceType; // "STANDARD" ou "CROSS_BORDER"
    
    // Constructeurs
    public OperationCreateRequest() {}
    
    public OperationCreateRequest(Long compteId, String typeOperation, Double montant, String banque, String nomBordereau, String service, String dateOperation, Integer recordCount) {
        this.compteId = compteId;
        this.typeOperation = typeOperation;
        this.montant = montant;
        this.banque = banque;
        this.nomBordereau = nomBordereau;
        this.service = service;
        this.dateOperation = dateOperation;
        this.recordCount = recordCount;
    }
    
    // Getters et Setters
    public Long getCompteId() {
        return compteId;
    }
    
    public void setCompteId(Long compteId) {
        this.compteId = compteId;
    }
    
    public String getTypeOperation() {
        return typeOperation;
    }
    
    public void setTypeOperation(String typeOperation) {
        this.typeOperation = typeOperation;
    }
    
    public Double getMontant() {
        return montant;
    }
    
    public void setMontant(Double montant) {
        this.montant = montant;
    }
    
    public String getBanque() {
        return banque;
    }
    
    public void setBanque(String banque) {
        this.banque = banque;
    }
    
    public String getNomBordereau() {
        return nomBordereau;
    }
    
    public void setNomBordereau(String nomBordereau) {
        this.nomBordereau = nomBordereau;
    }
    
    public String getService() {
        return service;
    }
    
    public void setService(String service) {
        this.service = service;
    }
    
    public String getDateOperation() {
        return dateOperation;
    }
    
    public void setDateOperation(String dateOperation) {
        this.dateOperation = dateOperation;
    }
    
    public Integer getRecordCount() {
        return recordCount;
    }
    
    public void setRecordCount(Integer recordCount) {
        this.recordCount = recordCount;
    }

    public Long getParentOperationId() {
        return parentOperationId;
    }

    public void setParentOperationId(Long parentOperationId) {
        this.parentOperationId = parentOperationId;
    }

    public String getReferenceType() {
        return referenceType;
    }

    public void setReferenceType(String referenceType) {
        this.referenceType = referenceType;
    }
} 