package com.reconciliation.entity;

import jakarta.persistence.*;
import java.time.LocalDateTime;

/**
 * Ligne de suivi d'une transaction a annuler (page /suivi-trx-a-annuler).
 *
 * <p>Les champs BO / Partenaire sont stockes en texte : ils proviennent des
 * fichiers de reconciliation et doivent etre restitues tels quels (montants
 * formates, dates heterogenes).</p>
 */
@Entity
@jakarta.persistence.EntityListeners(com.reconciliation.tenant.TenantGuardEntityListener.class)
@Table(name = "suivi_trx_annuler")
public class SuiviTrxAnnulerEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** Entreprise proprietaire (isolation multi-entreprise, colonne technique). */
    @org.hibernate.annotations.TenantId
    @jakarta.persistence.Column(name = "entreprise_id", nullable = false)
    @com.fasterxml.jackson.annotation.JsonIgnore
    private Long entrepriseId;

    @Column(name = "match_key", length = 512)
    private String matchKey;

    @Column(name = "bo_date", length = 64)
    private String boDate;

    @Column(name = "bo_agence", length = 255)
    private String boAgence;

    @Column(name = "bo_service", length = 255)
    private String boService;

    @Column(name = "bo_montant", length = 128)
    private String boMontant;

    @Column(name = "bo_token", length = 255)
    private String boToken;

    @Column(name = "bo_pays", length = 128)
    private String boPays;

    @Column(name = "bo_env", length = 64)
    private String boEnv;

    @Column(name = "bo_telephone", length = 64)
    private String boTelephone;

    /** Statut metier BO : Echec ou Annulee (liste fermee cote interface). */
    @Column(name = "bo_statut", length = 32)
    private String boStatut;

    @Column(name = "partner_transaction_id", length = 255)
    private String partnerTransactionId;

    @Column(name = "partner_date", length = 64)
    private String partnerDate;

    @Column(name = "partner_montant", length = 128)
    private String partnerMontant;

    @Column(name = "id_annulation", length = 255)
    private String idAnnulation;

    @Column(name = "partner_telephone", length = 64)
    private String partnerTelephone;

    @Column(name = "statut", nullable = false, length = 32)
    private String statut = "En cours";

    /** Statut partenaire : Succes ou Annulee (liste fermee cote interface). */
    @Column(name = "statut_part", length = 32)
    private String statutPart;

    @Column(name = "created_by", length = 128)
    private String createdBy;

    @Column(name = "updated_by", length = 128)
    private String updatedBy;

    @Column(name = "created_at")
    private LocalDateTime createdAt;

    @Column(name = "updated_at")
    private LocalDateTime updatedAt;

    @PrePersist
    void onCreate() {
        createdAt = LocalDateTime.now();
        updatedAt = createdAt;
    }

    @PreUpdate
    void onUpdate() {
        updatedAt = LocalDateTime.now();
    }

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

    public LocalDateTime getUpdatedAt() {
        return updatedAt;
    }
}
