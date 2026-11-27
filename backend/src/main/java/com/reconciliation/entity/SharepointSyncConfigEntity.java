package com.reconciliation.entity;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;

import java.time.LocalDateTime;

/**
 * Configuration > Synchronisation SharePoint : compte applicatif Microsoft Graph et
 * heures de lancement du job (une ligne par entreprise).
 *
 * <p>Le secret client est chiffré (AES-GCM, {@link com.reconciliation.service.sharepoint.SecretCipher})
 * et n'est jamais renvoyé au navigateur.</p>
 */
@Entity
@EntityListeners(com.reconciliation.tenant.TenantGuardEntityListener.class)
@Table(name = "sharepoint_sync_config",
        uniqueConstraints = @UniqueConstraint(name = "uk_sharepoint_sync_config_tenant", columnNames = "entreprise_id"))
@Getter
@Setter
public class SharepointSyncConfigEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** Entreprise proprietaire (isolation multi-entreprise, colonne technique). */
    @org.hibernate.annotations.TenantId
    @Column(name = "entreprise_id", nullable = false)
    @com.fasterxml.jackson.annotation.JsonIgnore
    private Long entrepriseId;

    /** Job automatique actif. */
    @Column(name = "enabled", nullable = false)
    private Boolean enabled = false;

    /** Heures de lancement HH:mm séparées par des virgules (ex. « 08:00,14:00 »). */
    @Column(name = "heures_execution", nullable = false, length = 200)
    private String heuresExecution = "08:00";

    /** Identifiant de l'annuaire Entra ID (tenant Microsoft 365). */
    @Column(name = "azure_tenant_id", length = 100)
    private String azureTenantId;

    /** Identifiant de l'application (client) enregistrée dans Entra ID. */
    @Column(name = "client_id", length = 100)
    private String clientId;

    /** Secret client chiffré. */
    @Column(name = "client_secret_enc", length = 2000)
    private String clientSecretEnc;

    /** Dernier lancement automatique (sert aussi de verrou entre instances partageant la base). */
    @Column(name = "last_auto_run_at")
    private LocalDateTime lastAutoRunAt;

    @Column(name = "updated_at")
    private LocalDateTime updatedAt;

    @Column(name = "updated_by")
    private String updatedBy;
}
