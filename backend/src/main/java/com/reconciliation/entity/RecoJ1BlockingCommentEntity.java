package com.reconciliation.entity;

import jakarta.persistence.*;
import java.time.LocalDateTime;

@Entity
@jakarta.persistence.EntityListeners(com.reconciliation.tenant.TenantGuardEntityListener.class)
@Table(
    name = "reco_j1_blocking_comment",
    uniqueConstraints = @UniqueConstraint(
        name = "uk_reco_j1_blocking_scope",
        columnNames = {"reco_date", "service", "country", "env"}
    )
)
public class RecoJ1BlockingCommentEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** Entreprise proprietaire (isolation multi-entreprise, colonne technique). */
    @org.hibernate.annotations.TenantId
    @jakarta.persistence.Column(name = "entreprise_id", nullable = false)
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

    @Column(name = "comment_text", nullable = false, columnDefinition = "TEXT")
    private String commentText;

    @Column(name = "updated_by", length = 128)
    private String updatedBy;

    @Column(name = "updated_at")
    private LocalDateTime updatedAt;

    @PrePersist
    @PreUpdate
    public void touchUpdatedAt() {
        updatedAt = LocalDateTime.now();
    }

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }

    public String getRecoDate() { return recoDate; }
    public void setRecoDate(String recoDate) { this.recoDate = recoDate; }

    public String getService() { return service; }
    public void setService(String service) { this.service = service; }

    public String getCountry() { return country; }
    public void setCountry(String country) { this.country = country; }

    public String getEnv() { return env; }
    public void setEnv(String env) { this.env = env; }

    public String getCommentText() { return commentText; }
    public void setCommentText(String commentText) { this.commentText = commentText; }

    public String getUpdatedBy() { return updatedBy; }
    public void setUpdatedBy(String updatedBy) { this.updatedBy = updatedBy; }

    public LocalDateTime getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(LocalDateTime updatedAt) { this.updatedAt = updatedAt; }
}
