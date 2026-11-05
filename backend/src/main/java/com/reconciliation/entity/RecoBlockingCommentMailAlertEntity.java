package com.reconciliation.entity;

import jakarta.persistence.*;
import java.time.LocalDateTime;

/**
 * Relance e-mail quotidienne d'un commentaire de blocage (page « État des réconciliations »).
 * Active tant que le statut de la réconciliation reste égal à {@link #statusSnapshot}.
 */
@Entity
@EntityListeners(com.reconciliation.tenant.TenantGuardEntityListener.class)
@Table(name = "reco_blocking_comment_mail_alert")
public class RecoBlockingCommentMailAlertEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** Entreprise proprietaire (isolation multi-entreprise, colonne technique). */
    @org.hibernate.annotations.TenantId
    @Column(name = "entreprise_id", nullable = false)
    @com.fasterxml.jackson.annotation.JsonIgnore
    private Long entrepriseId;

    @Column(name = "reco_date", nullable = false, length = 10)
    private String recoDate;

    @Column(name = "service", nullable = false, length = 255)
    private String service;

    @Column(name = "country", nullable = false, length = 128)
    private String country;

    @Column(name = "env", nullable = false, length = 32)
    private String env;

    /** Adresses séparées par des virgules. */
    @Column(name = "recipients", nullable = false, length = 2000)
    private String recipients;

    /** Personnes en copie, adresses séparées par des virgules. */
    @Column(name = "cc_recipients", length = 2000)
    private String ccRecipients;

    @Column(name = "status_snapshot", nullable = false, length = 32)
    private String statusSnapshot;

    @Column(name = "active", nullable = false)
    private boolean active;

    @Column(name = "send_count", nullable = false)
    private int sendCount;

    @Column(name = "last_sent_at")
    private LocalDateTime lastSentAt;

    @Column(name = "last_error", length = 500)
    private String lastError;

    @Column(name = "stopped_reason", length = 32)
    private String stoppedReason;

    @Column(name = "stopped_at")
    private LocalDateTime stoppedAt;

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

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }

    public Long getEntrepriseId() { return entrepriseId; }

    public String getRecoDate() { return recoDate; }
    public void setRecoDate(String recoDate) { this.recoDate = recoDate; }

    public String getService() { return service; }
    public void setService(String service) { this.service = service; }

    public String getCountry() { return country; }
    public void setCountry(String country) { this.country = country; }

    public String getEnv() { return env; }
    public void setEnv(String env) { this.env = env; }

    public String getRecipients() { return recipients; }
    public void setRecipients(String recipients) { this.recipients = recipients; }

    public String getCcRecipients() { return ccRecipients; }
    public void setCcRecipients(String ccRecipients) { this.ccRecipients = ccRecipients; }

    public String getStatusSnapshot() { return statusSnapshot; }
    public void setStatusSnapshot(String statusSnapshot) { this.statusSnapshot = statusSnapshot; }

    public boolean isActive() { return active; }
    public void setActive(boolean active) { this.active = active; }

    public int getSendCount() { return sendCount; }
    public void setSendCount(int sendCount) { this.sendCount = sendCount; }

    public LocalDateTime getLastSentAt() { return lastSentAt; }
    public void setLastSentAt(LocalDateTime lastSentAt) { this.lastSentAt = lastSentAt; }

    public String getLastError() { return lastError; }
    public void setLastError(String lastError) { this.lastError = lastError; }

    public String getStoppedReason() { return stoppedReason; }
    public void setStoppedReason(String stoppedReason) { this.stoppedReason = stoppedReason; }

    public LocalDateTime getStoppedAt() { return stoppedAt; }
    public void setStoppedAt(LocalDateTime stoppedAt) { this.stoppedAt = stoppedAt; }

    public String getCreatedBy() { return createdBy; }
    public void setCreatedBy(String createdBy) { this.createdBy = createdBy; }

    public String getUpdatedBy() { return updatedBy; }
    public void setUpdatedBy(String updatedBy) { this.updatedBy = updatedBy; }

    public LocalDateTime getCreatedAt() { return createdAt; }

    public LocalDateTime getUpdatedAt() { return updatedAt; }
}
