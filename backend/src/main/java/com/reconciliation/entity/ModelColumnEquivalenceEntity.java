package com.reconciliation.entity;

import jakarta.persistence.*;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;

/**
 * Configuration &gt; Normalisation modèle : en-têtes équivalents d'une colonne par défaut
 * d'un modèle de traitement (ex. « Numéro Trans GU » ↔ « Num Trans GU », « ID »).
 */
@Entity
@EntityListeners(com.reconciliation.tenant.TenantGuardEntityListener.class)
@Table(name = "model_column_equivalence",
        uniqueConstraints = @UniqueConstraint(name = "uk_model_column_equivalence",
                columnNames = {"entreprise_id", "model_id", "column_name"}))
public class ModelColumnEquivalenceEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** Entreprise propriétaire (isolation multi-entreprise, colonne technique). */
    @org.hibernate.annotations.TenantId
    @Column(name = "entreprise_id", nullable = false)
    @com.fasterxml.jackson.annotation.JsonIgnore
    private Long entrepriseId;

    /** Identifiant fonctionnel du modèle (auto_processing_models.model_id). */
    @Column(name = "model_id", nullable = false, length = 255)
    private String modelId;

    /** Colonne par défaut du modèle. */
    @Column(name = "column_name", nullable = false, length = 255)
    private String columnName;

    /** En-têtes équivalents (JSON). */
    @Convert(converter = StringArrayConverter.class)
    @Column(name = "equivalents", columnDefinition = "TEXT")
    private List<String> equivalents = new ArrayList<>();

    @Column(name = "date_creation")
    private LocalDateTime dateCreation;

    @Column(name = "date_modification")
    private LocalDateTime dateModification;

    @PrePersist
    void onCreate() {
        dateCreation = LocalDateTime.now();
        dateModification = dateCreation;
    }

    @PreUpdate
    void onUpdate() {
        dateModification = LocalDateTime.now();
    }

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }

    public Long getEntrepriseId() { return entrepriseId; }
    public void setEntrepriseId(Long entrepriseId) { this.entrepriseId = entrepriseId; }

    public String getModelId() { return modelId; }
    public void setModelId(String modelId) { this.modelId = modelId; }

    public String getColumnName() { return columnName; }
    public void setColumnName(String columnName) { this.columnName = columnName; }

    public List<String> getEquivalents() { return equivalents == null ? new ArrayList<>() : equivalents; }
    public void setEquivalents(List<String> equivalents) { this.equivalents = equivalents; }

    public LocalDateTime getDateCreation() { return dateCreation; }
    public LocalDateTime getDateModification() { return dateModification; }
}
