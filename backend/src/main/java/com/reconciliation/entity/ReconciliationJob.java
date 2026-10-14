package com.reconciliation.entity;

import com.reconciliation.dto.ProgressUpdate;
import com.reconciliation.dto.ReconciliationConfig;
import com.reconciliation.dto.ReconciliationResponse;
import jakarta.persistence.*;
import lombok.Data;
import lombok.NoArgsConstructor;
import lombok.AllArgsConstructor;
import java.time.LocalDateTime;

@Entity
@jakarta.persistence.EntityListeners(com.reconciliation.tenant.TenantGuardEntityListener.class)
@Table(name = "reconciliation_jobs")
@Data
@NoArgsConstructor
@AllArgsConstructor
public class ReconciliationJob {
    
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** Entreprise proprietaire (isolation multi-entreprise, colonne technique). */
    @org.hibernate.annotations.TenantId
    @jakarta.persistence.Column(name = "entreprise_id", nullable = false)
    @com.fasterxml.jackson.annotation.JsonIgnore
    private Long entrepriseId;
    
    @Column(name = "job_id", unique = true, nullable = false)
    private String jobId;
    
    @Column(name = "status", nullable = false)
    @Enumerated(EnumType.STRING)
    private JobStatus status;
    
    @Column(name = "bo_file_path")
    private String boFilePath;
    
    @Column(name = "partner_file_path")
    private String partnerFilePath;
    
    @Column(name = "config_json", columnDefinition = "TEXT")
    private String configJson;
    
    @Column(name = "progress_json", columnDefinition = "TEXT")
    private String progressJson;
    
    @Column(name = "result_json", columnDefinition = "TEXT")
    private String resultJson;
    
    @Column(name = "error_message")
    private String errorMessage;
    
    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt;
    
    @Column(name = "updated_at")
    private LocalDateTime updatedAt;
    
    @Column(name = "completed_at")
    private LocalDateTime completedAt;
    
    @Column(name = "client_id")
    private String clientId;
    
    public enum JobStatus {
        PENDING,
        PREPARING,
        PROCESSING,
        COMPLETED,
        FAILED,
        CANCELLED
    }
    
    @PrePersist
    protected void onCreate() {
        createdAt = LocalDateTime.now();
        updatedAt = LocalDateTime.now();
    }
    
    @PreUpdate
    protected void onUpdate() {
        updatedAt = LocalDateTime.now();
    }
}
