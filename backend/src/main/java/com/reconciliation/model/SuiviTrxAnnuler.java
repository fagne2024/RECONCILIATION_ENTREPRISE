package com.reconciliation.model;

import java.time.LocalDateTime;

/**
 * DTO d'une ligne de suivi des transactions a annuler.
 * Les valeurs BO / Partenaire sont textuelles (cf. SuiviTrxAnnulerEntity).
 */
public class SuiviTrxAnnuler {

    private Long id;
    private String matchKey;
    private String boDate;
    private String boAgence;
    private String boService;
    private String boMontant;
    private String boToken;
    private String boPays;
    private String boEnv;
    private String boTelephone;
    private String boStatut;
    private String partnerTransactionId;
    private String partnerDate;
    private String partnerMontant;
    private String idAnnulation;
    private String partnerTelephone;
    private String statut;
    private String statutPart;
    private String createdBy;
    private String updatedBy;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;

    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public String getMatchKey() {
        return matchKey;
    }

    public void setMatchKey(String matchKey) {
        this.matchKey = matchKey;
    }

    public String getBoDate() {
        return boDate;
    }

    public void setBoDate(String boDate) {
        this.boDate = boDate;
    }

    public String getBoAgence() {
        return boAgence;
    }

    public void setBoAgence(String boAgence) {
        this.boAgence = boAgence;
    }

    public String getBoService() {
        return boService;
    }

    public void setBoService(String boService) {
        this.boService = boService;
    }

    public String getBoMontant() {
        return boMontant;
    }

    public void setBoMontant(String boMontant) {
        this.boMontant = boMontant;
    }

    public String getBoToken() {
        return boToken;
    }

    public void setBoToken(String boToken) {
        this.boToken = boToken;
    }

    public String getBoPays() {
        return boPays;
    }

    public void setBoPays(String boPays) {
        this.boPays = boPays;
    }

    public String getBoEnv() {
        return boEnv;
    }

    public void setBoEnv(String boEnv) {
        this.boEnv = boEnv;
    }

    public String getBoTelephone() {
        return boTelephone;
    }

    public void setBoTelephone(String boTelephone) {
        this.boTelephone = boTelephone;
    }

    public String getBoStatut() {
        return boStatut;
    }

    public void setBoStatut(String boStatut) {
        this.boStatut = boStatut;
    }

    public String getPartnerTransactionId() {
        return partnerTransactionId;
    }

    public void setPartnerTransactionId(String partnerTransactionId) {
        this.partnerTransactionId = partnerTransactionId;
    }

    public String getPartnerDate() {
        return partnerDate;
    }

    public void setPartnerDate(String partnerDate) {
        this.partnerDate = partnerDate;
    }

    public String getPartnerMontant() {
        return partnerMontant;
    }

    public void setPartnerMontant(String partnerMontant) {
        this.partnerMontant = partnerMontant;
    }

    public String getIdAnnulation() {
        return idAnnulation;
    }

    public void setIdAnnulation(String idAnnulation) {
        this.idAnnulation = idAnnulation;
    }

    public String getPartnerTelephone() {
        return partnerTelephone;
    }

    public void setPartnerTelephone(String partnerTelephone) {
        this.partnerTelephone = partnerTelephone;
    }

    public String getStatut() {
        return statut;
    }

    public void setStatut(String statut) {
        this.statut = statut;
    }

    public String getStatutPart() {
        return statutPart;
    }

    public void setStatutPart(String statutPart) {
        this.statutPart = statutPart;
    }

    public String getCreatedBy() {
        return createdBy;
    }

    public void setCreatedBy(String createdBy) {
        this.createdBy = createdBy;
    }

    public String getUpdatedBy() {
        return updatedBy;
    }

    public void setUpdatedBy(String updatedBy) {
        this.updatedBy = updatedBy;
    }

    public LocalDateTime getCreatedAt() {
        return createdAt;
    }

    public void setCreatedAt(LocalDateTime createdAt) {
        this.createdAt = createdAt;
    }

    public LocalDateTime getUpdatedAt() {
        return updatedAt;
    }

    public void setUpdatedAt(LocalDateTime updatedAt) {
        this.updatedAt = updatedAt;
    }
}
