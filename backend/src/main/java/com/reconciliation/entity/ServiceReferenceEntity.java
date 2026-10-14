package com.reconciliation.entity;

import jakarta.persistence.*;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.time.LocalDateTime;

@Entity
@jakarta.persistence.EntityListeners(com.reconciliation.tenant.TenantGuardEntityListener.class)
@Table(name = "service_reference")
public class ServiceReferenceEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** Entreprise proprietaire (isolation multi-entreprise, colonne technique). */
    @org.hibernate.annotations.TenantId
    @Column(name = "entreprise_id", nullable = false)
    @com.fasterxml.jackson.annotation.JsonIgnore
    private Long entrepriseId;

    @NotNull(message = "Le pays ne peut pas être nul")
    @NotBlank(message = "Le pays ne peut pas être vide")
    @Size(max = 10, message = "Le pays ne peut pas dépasser 10 caractères")
    @Column(name = "pays", nullable = false, length = 10)
    private String pays;

    @NotNull(message = "Le code service ne peut pas être nul")
    @NotBlank(message = "Le code service ne peut pas être vide")
    @Size(max = 150, message = "Le code service ne peut pas dépasser 150 caractères")
    @Column(name = "code_service", nullable = false, length = 150)
    private String codeService;

    @NotNull(message = "Le libellé du service ne peut pas être nul")
    @NotBlank(message = "Le libellé du service ne peut pas être vide")
    @Size(max = 150, message = "Le libellé du service ne peut pas dépasser 150 caractères")
    @Column(name = "service_label", nullable = false, length = 150)
    private String serviceLabel;

    @NotNull(message = "Le code RECO ne peut pas être nul")
    @NotBlank(message = "Le code RECO ne peut pas être vide")
    @Size(max = 150, message = "Le code RECO ne peut pas dépasser 150 caractères")
    @Column(name = "code_reco", nullable = false, length = 150, unique = true)
    private String codeReco;

    @Size(max = 100, message = "Le type de service ne peut pas dépasser 100 caractères")
    @Column(name = "service_type", length = 100)
    private String serviceType;

    @Size(max = 100, message = "L'opérateur ne peut pas dépasser 100 caractères")
    @Column(name = "operateur", length = 100)
    private String operateur;

    @Size(max = 50, message = "Le réseau ne peut pas dépasser 50 caractères")
    @Column(name = "reseau", length = 50)
    private String reseau;

    @NotNull(message = "Le champ 'réconciliable' ne peut pas être nul")
    @Column(name = "reconciliable", nullable = false)
    private Boolean reconciliable = Boolean.TRUE;

    @Size(max = 255, message = "Le motif ne peut pas dépasser 255 caractères")
    @Column(name = "motif", length = 255)
    private String motif;

    @Size(max = 255, message = "Le retenu opérateur ne peut pas dépasser 255 caractères")
    @Column(name = "retenu_operateur", length = 255)
    private String retenuOperateur;

    @NotNull(message = "Le statut ne peut pas être nul")
    @NotBlank(message = "Le statut ne peut pas être vide")
    @Size(max = 20, message = "Le statut ne peut pas dépasser 20 caractères")
    @Column(name = "status", nullable = false, length = 20)
    private String status = "ACTIF";

    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt;

    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt;

    @PrePersist
    protected void onCreate() {
        LocalDateTime now = LocalDateTime.now();
        this.createdAt = now;
        this.updatedAt = now;
        if (this.status == null || this.status.isBlank()) {
            this.status = "ACTIF";
        }
    }

    @PreUpdate
    protected void onUpdate() {
        this.updatedAt = LocalDateTime.now();
        if (this.status == null || this.status.isBlank()) {
            this.status = "ACTIF";
        }
    }

    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public Long getEntrepriseId() {
        return entrepriseId;
    }

    public void setEntrepriseId(Long entrepriseId) {
        this.entrepriseId = entrepriseId;
    }

    public String getPays() {
        return pays;
    }

    public void setPays(String pays) {
        this.pays = pays;
    }

    public String getCodeService() {
        return codeService;
    }

    public void setCodeService(String codeService) {
        this.codeService = codeService;
    }

    public String getServiceLabel() {
        return serviceLabel;
    }

    public void setServiceLabel(String serviceLabel) {
        this.serviceLabel = serviceLabel;
    }

    public String getCodeReco() {
        return codeReco;
    }

    public void setCodeReco(String codeReco) {
        this.codeReco = codeReco;
    }

    public String getServiceType() {
        return serviceType;
    }

    public void setServiceType(String serviceType) {
        this.serviceType = serviceType;
    }

    public String getOperateur() {
        return operateur;
    }

    public void setOperateur(String operateur) {
        this.operateur = operateur;
    }

    public String getReseau() {
        return reseau;
    }

    public void setReseau(String reseau) {
        this.reseau = reseau;
    }

    public Boolean getReconciliable() {
        return reconciliable;
    }

    public void setReconciliable(Boolean reconciliable) {
        this.reconciliable = reconciliable;
    }

    public String getMotif() {
        return motif;
    }

    public void setMotif(String motif) {
        this.motif = motif;
    }

    public String getRetenuOperateur() {
        return retenuOperateur;
    }

    public void setRetenuOperateur(String retenuOperateur) {
        this.retenuOperateur = retenuOperateur;
    }

    public String getStatus() {
        return status;
    }

    public void setStatus(String status) {
        this.status = status;
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

