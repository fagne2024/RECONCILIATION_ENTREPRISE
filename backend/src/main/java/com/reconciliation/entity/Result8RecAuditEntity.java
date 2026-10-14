package com.reconciliation.entity;

import jakarta.persistence.*;

import java.time.LocalDateTime;

@Entity
@jakarta.persistence.EntityListeners(com.reconciliation.tenant.TenantGuardEntityListener.class)
@Table(name = "result8rec_audit")
public class Result8RecAuditEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** Entreprise proprietaire (isolation multi-entreprise, colonne technique). */
    @org.hibernate.annotations.TenantId
    @jakarta.persistence.Column(name = "entreprise_id", nullable = false)
    @com.fasterxml.jackson.annotation.JsonIgnore
    private Long entrepriseId;

    @Column(name = "result8rec_id", nullable = false)
    private Long result8recId;

    /** SAUVEGARDE_RESULTAT, STATUT_OK, CHANGEMENT_STATUT, VALIDATION_TERMINÉ, CHANGEMENT_TRAITEMENT, CREATION */
    @Column(name = "action_type", nullable = false, length = 64)
    private String actionType;

    @Column(length = 255)
    private String username;

    @Column(name = "traitement_snapshot", length = 255)
    private String traitementSnapshot;

    @Column(name = "status_snapshot", length = 64)
    private String statusSnapshot;

    @Column(columnDefinition = "TEXT")
    private String detail;

    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt;

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }

    public Long getResult8recId() { return result8recId; }
    public void setResult8recId(Long result8recId) { this.result8recId = result8recId; }

    public String getActionType() { return actionType; }
    public void setActionType(String actionType) { this.actionType = actionType; }

    public String getUsername() { return username; }
    public void setUsername(String username) { this.username = username; }

    public String getTraitementSnapshot() { return traitementSnapshot; }
    public void setTraitementSnapshot(String traitementSnapshot) { this.traitementSnapshot = traitementSnapshot; }

    public String getStatusSnapshot() { return statusSnapshot; }
    public void setStatusSnapshot(String statusSnapshot) { this.statusSnapshot = statusSnapshot; }

    public String getDetail() { return detail; }
    public void setDetail(String detail) { this.detail = detail; }

    public LocalDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(LocalDateTime createdAt) { this.createdAt = createdAt; }
}
