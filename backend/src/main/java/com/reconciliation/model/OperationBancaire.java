package com.reconciliation.model;

import java.time.LocalDateTime;

public class OperationBancaire {
    private Long id;
    private String pays;
    private String codePays;
    private String mois;
    private LocalDateTime dateOperation;
    private String agence;
    private String typeOperation;
    private String nomBeneficiaire;
    private String compteADebiter;
    private Double montant;
    private String modePaiement;
    private String reference;
    private String idGlpi;
    private String bo;
    private String statut;
    private String reconStatus; // OK/KO
    private Long operationId;
    private Boolean impactApplique; // Flag pour savoir si l'impact a déjà été appliqué
    private String traitement;
    
    // Constructeurs
    public OperationBancaire() {}
    
    public OperationBancaire(Long id, String pays, String codePays, String mois, LocalDateTime dateOperation,
                            String agence, String typeOperation, String nomBeneficiaire, String compteADebiter,
                            Double montant, String modePaiement, String reference, String idGlpi,
                            String bo, String statut, Long operationId) {
        this.id = id;
        this.pays = pays;
        this.codePays = codePays;
        this.mois = mois;
        this.dateOperation = dateOperation;
        this.agence = agence;
        this.typeOperation = typeOperation;
        this.nomBeneficiaire = nomBeneficiaire;
        this.compteADebiter = compteADebiter;
        this.montant = montant;
        this.modePaiement = modePaiement;
        this.reference = reference;
        this.idGlpi = idGlpi;
        this.bo = bo;
        this.statut = statut;
        this.reconStatus = null;
        this.operationId = operationId;
    }
    
    // Getters et Setters
    public Long getId() {
        return id;
    }
    
    public void setId(Long id) {
        this.id = id;
    }
    
    public String getPays() {
        return pays;
    }
    
    public void setPays(String pays) {
        this.pays = pays;
    }
    
    public String getCodePays() {
        return codePays;
    }
    
    public void setCodePays(String codePays) {
        this.codePays = codePays;
    }
    
    public String getMois() {
        return mois;
    }
    
    public void setMois(String mois) {
        this.mois = mois;
    }
    
    public LocalDateTime getDateOperation() {
        return dateOperation;
    }
    
    public void setDateOperation(LocalDateTime dateOperation) {
        this.dateOperation = dateOperation;
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
    
    public String getNomBeneficiaire() {
        return nomBeneficiaire;
    }
    
    public void setNomBeneficiaire(String nomBeneficiaire) {
        this.nomBeneficiaire = nomBeneficiaire;
    }
    
    public String getCompteADebiter() {
        return compteADebiter;
    }
    
    public void setCompteADebiter(String compteADebiter) {
        this.compteADebiter = compteADebiter;
    }
    
    public Double getMontant() {
        return montant;
    }
    
    public void setMontant(Double montant) {
        this.montant = montant;
    }
    
    public String getModePaiement() {
        return modePaiement;
    }
    
    public void setModePaiement(String modePaiement) {
        this.modePaiement = modePaiement;
    }
    
    public String getReference() {
        return reference;
    }
    
    public void setReference(String reference) {
        this.reference = reference;
    }
    
    public String getIdGlpi() {
        return idGlpi;
    }
    
    public void setIdGlpi(String idGlpi) {
        this.idGlpi = idGlpi;
    }
    
    public String getBo() {
        return bo;
    }
    
    public void setBo(String bo) {
        this.bo = bo;
    }
    
    public String getStatut() {
        return statut;
    }
    
    public void setStatut(String statut) {
        this.statut = statut;
    }

    public String getReconStatus() {
        return reconStatus;
    }

    public void setReconStatus(String reconStatus) {
        this.reconStatus = reconStatus;
    }
    
    public Long getOperationId() {
        return operationId;
    }
    
    public void setOperationId(Long operationId) {
        this.operationId = operationId;
    }
    
    public Boolean getImpactApplique() {
        return impactApplique;
    }
    
    public void setImpactApplique(Boolean impactApplique) {
        this.impactApplique = impactApplique;
    }
    
    public String getTraitement() {
        return traitement;
    }
    
    public void setTraitement(String traitement) {
        this.traitement = traitement;
    }
}

