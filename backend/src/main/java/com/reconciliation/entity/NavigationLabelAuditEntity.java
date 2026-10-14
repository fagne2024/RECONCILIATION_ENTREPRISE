package com.reconciliation.entity;

import jakarta.persistence.*;

import java.time.LocalDateTime;

@Entity
@jakarta.persistence.EntityListeners(com.reconciliation.tenant.TenantGuardEntityListener.class)
@Table(name = "navigation_label_audit")
public class NavigationLabelAuditEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** Entreprise proprietaire (isolation multi-entreprise, colonne technique). */
    @org.hibernate.annotations.TenantId
    @jakarta.persistence.Column(name = "entreprise_id", nullable = false)
    @com.fasterxml.jackson.annotation.JsonIgnore
    private Long entrepriseId;

    @Column(name = "label_id", nullable = false, length = 255)
    private String labelId;

    @Column(name = "label_type", nullable = false, length = 32)
    private String labelType;

    @Column(name = "group_key", nullable = false, length = 128)
    private String groupKey;

    @Column(name = "submenu_key", length = 128)
    private String submenuKey;

    @Column(name = "nested_key", length = 128)
    private String nestedKey;

    @Column(name = "old_label", length = 500)
    private String oldLabel;

    @Column(name = "new_label", length = 500)
    private String newLabel;

    @Column(length = 255)
    private String username;

    @Column(name = "action_type", nullable = false, length = 32)
    private String actionType;

    @Column(columnDefinition = "TEXT")
    private String detail;

    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt;

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }

    public String getLabelId() { return labelId; }
    public void setLabelId(String labelId) { this.labelId = labelId; }

    public String getLabelType() { return labelType; }
    public void setLabelType(String labelType) { this.labelType = labelType; }

    public String getGroupKey() { return groupKey; }
    public void setGroupKey(String groupKey) { this.groupKey = groupKey; }

    public String getSubmenuKey() { return submenuKey; }
    public void setSubmenuKey(String submenuKey) { this.submenuKey = submenuKey; }

    public String getNestedKey() { return nestedKey; }
    public void setNestedKey(String nestedKey) { this.nestedKey = nestedKey; }

    public String getOldLabel() { return oldLabel; }
    public void setOldLabel(String oldLabel) { this.oldLabel = oldLabel; }

    public String getNewLabel() { return newLabel; }
    public void setNewLabel(String newLabel) { this.newLabel = newLabel; }

    public String getUsername() { return username; }
    public void setUsername(String username) { this.username = username; }

    public String getActionType() { return actionType; }
    public void setActionType(String actionType) { this.actionType = actionType; }

    public String getDetail() { return detail; }
    public void setDetail(String detail) { this.detail = detail; }

    public LocalDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(LocalDateTime createdAt) { this.createdAt = createdAt; }
}