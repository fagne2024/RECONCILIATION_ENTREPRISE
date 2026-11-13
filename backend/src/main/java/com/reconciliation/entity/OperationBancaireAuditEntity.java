package com.reconciliation.entity;

import jakarta.persistence.*;

import java.time.LocalDateTime;

/** Action effectuée sur une opération bancaire (historique par ligne). */
@Entity
@jakarta.persistence.EntityListeners(com.reconciliation.tenant.TenantGuardEntityListener.class)
@Table(name = "operation_bancaire_audit")
public class OperationBancaireAuditEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** Entreprise proprietaire (isolation multi-entreprise, colonne technique). */
    @org.hibernate.annotations.TenantId
    @jakarta.persistence.Column(name = "entreprise_id", nullable = false)
    @com.fasterxml.jackson.annotation.JsonIgnore
    private Long entrepriseId;

    @Column(name = "operation_id", nullable = false)
    private Long operationId;

    /** CREATION, CHANGEMENT_STATUT, CLOTURE, CHANGEMENT_TRAITEMENT, VALIDATION_TERMINE, COMMENTAIRE, BANQUE_CORRIGEE, STATUT_RECONCILIATION, MODIFICATION, CONTROLE_BANQUE */
    @Column(name = "action_type", nullable = false, length = 64)
    private String actionType;

    @Column(length = 255)
    private String username;

    @Column(name = "statut_snapshot", length = 64)
    private String statutSnapshot;

    @Column(name = "traitement_snapshot", length = 255)
    private String traitementSnapshot;

    @Column(columnDefinition = "TEXT")
    private String detail;

    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt;

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }

    public Long getOperationId() { return operationId; }
    public void setOperationId(Long operationId) { this.operationId = operationId; }

    public String getActionType() { return actionType; }
    public void setActionType(String actionType) { this.actionType = actionType; }

    public String getUsername() { return username; }
    public void setUsername(String username) { this.username = username; }

    public String getStatutSnapshot() { return statutSnapshot; }
    public void setStatutSnapshot(String statutSnapshot) { this.statutSnapshot = statutSnapshot; }

    public String getTraitementSnapshot() { return traitementSnapshot; }
    public void setTraitementSnapshot(String traitementSnapshot) { this.traitementSnapshot = traitementSnapshot; }

    public String getDetail() { return detail; }
    public void setDetail(String detail) { this.detail = detail; }

    public LocalDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(LocalDateTime createdAt) { this.createdAt = createdAt; }
}
