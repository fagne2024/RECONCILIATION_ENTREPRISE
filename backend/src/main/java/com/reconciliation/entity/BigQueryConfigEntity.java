package com.reconciliation.entity;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;

import java.time.LocalDateTime;

/**
 * Configuration > BigQuery : compte de service Google, projet, heures de préparation
 * automatique des extractions et sous-dossier des fichiers partenaires (une ligne par entreprise).
 *
 * <p>La clé JSON du compte de service est chiffrée
 * ({@link com.reconciliation.service.sharepoint.SecretCipher}) et n'est jamais renvoyée.</p>
 */
@Entity
@EntityListeners(com.reconciliation.tenant.TenantGuardEntityListener.class)
@Table(name = "bigquery_config",
        uniqueConstraints = @UniqueConstraint(name = "uk_bigquery_config_tenant", columnNames = "entreprise_id"))
@Getter
@Setter
public class BigQueryConfigEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** Entreprise proprietaire (isolation multi-entreprise, colonne technique). */
    @org.hibernate.annotations.TenantId
    @Column(name = "entreprise_id", nullable = false)
    @com.fasterxml.jackson.annotation.JsonIgnore
    private Long entrepriseId;

    /** Préparation automatique active. */
    @Column(name = "enabled", nullable = false)
    private Boolean enabled = false;

    /** Heures de préparation HH:mm séparées par des virgules. */
    @Column(name = "heures_execution", nullable = false, length = 200)
    private String heuresExecution = "06:00";

    /** Projet Google Cloud qui exécute (et facture) les requêtes. */
    @Column(name = "project_id", length = 200)
    private String projectId;

    /** Région des jeux de données (ex. EU, US, europe-west1) ; vide = défaut BigQuery. */
    @Column(name = "location", length = 100)
    private String location;

    /** Adresse du compte de service (affichage). */
    @Column(name = "service_account_email", length = 320)
    private String serviceAccountEmail;

    /** Clé JSON du compte de service, chiffrée. */
    @Column(name = "service_account_enc", columnDefinition = "TEXT")
    private String serviceAccountEnc;

    /** Sous-dossier du dossier surveillé contenant les fichiers partenaires. */
    @Column(name = "partner_subfolder", nullable = false, length = 100)
    private String partnerSubfolder = "partenaires";

    /** Nombre maximal de lignes par extraction. */
    @Column(name = "max_rows", nullable = false)
    private Integer maxRows = 1_000_000;

    @Column(name = "last_auto_run_at")
    private LocalDateTime lastAutoRunAt;

    @Column(name = "updated_at")
    private LocalDateTime updatedAt;

    @Column(name = "updated_by")
    private String updatedBy;
}
