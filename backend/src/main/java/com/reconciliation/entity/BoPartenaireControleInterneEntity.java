package com.reconciliation.entity;

import jakarta.persistence.*;
import java.time.LocalDateTime;

@Entity
@jakarta.persistence.EntityListeners(com.reconciliation.tenant.TenantGuardEntityListener.class)
@Table(
    name = "bo_partenaire_controle_interne",
    uniqueConstraints = @UniqueConstraint(
        name = "uk_bpci_month_country_env_service",
        columnNames = {"month_yyyy_mm", "country", "env", "service"}
    )
)
public class BoPartenaireControleInterneEntity {

    public static final String STATUT_EN_COURS = "EN_COURS_VALIDATION";
    public static final String STATUT_VALIDE = "VALIDE";

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** Entreprise proprietaire (isolation multi-entreprise, colonne technique). */
    @org.hibernate.annotations.TenantId
    @jakarta.persistence.Column(name = "entreprise_id", nullable = false)
    @com.fasterxml.jackson.annotation.JsonIgnore
    private Long entrepriseId;

    @Column(name = "month_yyyy_mm", nullable = false, length = 7)
    private String monthYyyyMm;

    @Column(name = "country", nullable = false, length = 64)
    private String country;

    @Column(name = "env", nullable = false, length = 32)
    private String env;

    @Column(name = "service", nullable = false, length = 255)
    private String service;

    @Column(name = "statut", nullable = false, length = 32)
    private String statut = STATUT_EN_COURS;

    @Column(name = "validated_by", length = 128)
    private String validatedBy;

    @Column(name = "validated_at")
    private LocalDateTime validatedAt;

    @Column(name = "created_at")
    private LocalDateTime createdAt;

    @Column(name = "updated_at")
    private LocalDateTime updatedAt;

    @PrePersist
    public void prePersist() {
        LocalDateTime now = LocalDateTime.now();
        if (createdAt == null) {
            createdAt = now;
        }
        updatedAt = now;
        if (statut == null || statut.isBlank()) {
            statut = STATUT_EN_COURS;
        }
    }

    @PreUpdate
    public void preUpdate() {
        updatedAt = LocalDateTime.now();
    }

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }

    public String getMonthYyyyMm() { return monthYyyyMm; }
    public void setMonthYyyyMm(String monthYyyyMm) { this.monthYyyyMm = monthYyyyMm; }

    public String getCountry() { return country; }
    public void setCountry(String country) { this.country = country; }

    public String getEnv() { return env; }
    public void setEnv(String env) { this.env = env; }

    public String getService() { return service; }
    public void setService(String service) { this.service = service; }

    public String getStatut() { return statut; }
    public void setStatut(String statut) { this.statut = statut; }

    public String getValidatedBy() { return validatedBy; }
    public void setValidatedBy(String validatedBy) { this.validatedBy = validatedBy; }

    public LocalDateTime getValidatedAt() { return validatedAt; }
    public void setValidatedAt(LocalDateTime validatedAt) { this.validatedAt = validatedAt; }

    public LocalDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(LocalDateTime createdAt) { this.createdAt = createdAt; }

    public LocalDateTime getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(LocalDateTime updatedAt) { this.updatedAt = updatedAt; }
}
