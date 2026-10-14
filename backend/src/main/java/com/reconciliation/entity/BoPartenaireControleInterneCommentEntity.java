package com.reconciliation.entity;

import jakarta.persistence.*;
import java.time.LocalDateTime;

@Entity
@jakarta.persistence.EntityListeners(com.reconciliation.tenant.TenantGuardEntityListener.class)
@Table(
    name = "bo_partenaire_controle_interne_comment",
    uniqueConstraints = @UniqueConstraint(
        name = "uk_bpci_comment_scope",
        columnNames = {"month_yyyy_mm", "country", "env"}
    )
)
public class BoPartenaireControleInterneCommentEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** Entreprise proprietaire (isolation multi-entreprise, colonne technique). */
    @org.hibernate.annotations.TenantId
    @jakarta.persistence.Column(name = "entreprise_id", nullable = false)
    @com.fasterxml.jackson.annotation.JsonIgnore
    private Long entrepriseId;

    @Column(name = "month_yyyy_mm", nullable = false, length = 10)
    private String monthYyyyMm;

    @Column(name = "country", nullable = false, length = 64)
    private String country;

    @Column(name = "env", nullable = false, length = 32)
    private String env;

    @Column(name = "commentaire", columnDefinition = "TEXT")
    private String commentaire;

    @Column(name = "updated_by", length = 128)
    private String updatedBy;

    @Column(name = "updated_at")
    private LocalDateTime updatedAt;

    @Column(name = "last_emailed_at")
    private LocalDateTime lastEmailedAt;

    @Column(name = "last_emailed_by", length = 128)
    private String lastEmailedBy;

    @PrePersist
    @PreUpdate
    public void touchUpdatedAt() {
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

    public String getCommentaire() { return commentaire; }
    public void setCommentaire(String commentaire) { this.commentaire = commentaire; }

    public String getUpdatedBy() { return updatedBy; }
    public void setUpdatedBy(String updatedBy) { this.updatedBy = updatedBy; }

    public LocalDateTime getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(LocalDateTime updatedAt) { this.updatedAt = updatedAt; }

    public LocalDateTime getLastEmailedAt() { return lastEmailedAt; }
    public void setLastEmailedAt(LocalDateTime lastEmailedAt) { this.lastEmailedAt = lastEmailedAt; }

    public String getLastEmailedBy() { return lastEmailedBy; }
    public void setLastEmailedBy(String lastEmailedBy) { this.lastEmailedBy = lastEmailedBy; }
}
