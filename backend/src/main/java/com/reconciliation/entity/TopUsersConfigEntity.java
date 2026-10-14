package com.reconciliation.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EntityListeners;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;

import java.time.LocalDateTime;

/**
 * Configuration du bloc « Top des utilisateurs » affiche en tete de l'ecran
 * « État des réconciliations ».
 *
 * <p>Une ligne par entreprise ({@code @TenantId} sur {@code entrepriseId}) :
 * hydratee automatiquement par Hibernate, protegee en lecture par
 * {@link com.reconciliation.tenant.TenantGuardEntityListener}.</p>
 *
 * <p>La liste des categories (libres et ordonnees) est stockee serialisee en
 * JSON dans {@code categories_json} (colonne {@code TEXT}). La
 * (de)serialisation est faite par
 * {@link com.reconciliation.service.TopUsersConfigService}.</p>
 */
@Entity
@EntityListeners(com.reconciliation.tenant.TenantGuardEntityListener.class)
@Table(name = "top_users_config",
        uniqueConstraints = @UniqueConstraint(name = "uk_top_users_config_tenant", columnNames = "entreprise_id"))
public class TopUsersConfigEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** Entreprise proprietaire (isolation multi-entreprise, colonne technique). */
    @org.hibernate.annotations.TenantId
    @Column(name = "entreprise_id", nullable = false)
    @com.fasterxml.jackson.annotation.JsonIgnore
    private Long entrepriseId;

    /** Afficher (true) ou masquer (false) la section. */
    @Column(name = "enabled", nullable = false)
    private Boolean enabled = true;

    /** Nombre d'utilisateurs affiches par categorie. */
    @Column(name = "top_n", nullable = false)
    private Integer topN = 3;

    /** Afficher la variation (delta) par rapport a la periode precedente. */
    @Column(name = "show_delta", nullable = false)
    private Boolean showDelta = true;

    /** Categories (liste ordonnee) serialisee en JSON. */
    @Column(name = "categories_json", columnDefinition = "TEXT")
    private String categoriesJson;

    @Column(name = "updated_at")
    private LocalDateTime updatedAt;

    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public Long getEntrepriseId() {
        return entrepriseId;
    }

    public void setEntrepriseId(Long entrepriseId) {
        this.entrepriseId = entrepriseId;
    }

    public Boolean getEnabled() {
        return enabled;
    }

    public void setEnabled(Boolean enabled) {
        this.enabled = enabled;
    }

    public Integer getTopN() {
        return topN;
    }

    public void setTopN(Integer topN) {
        this.topN = topN;
    }

    public Boolean getShowDelta() {
        return showDelta;
    }

    public void setShowDelta(Boolean showDelta) {
        this.showDelta = showDelta;
    }

    public String getCategoriesJson() {
        return categoriesJson;
    }

    public void setCategoriesJson(String categoriesJson) {
        this.categoriesJson = categoriesJson;
    }

    public LocalDateTime getUpdatedAt() {
        return updatedAt;
    }

    public void setUpdatedAt(LocalDateTime updatedAt) {
        this.updatedAt = updatedAt;
    }

    @PreUpdate
    public void preUpdate() {
        this.updatedAt = LocalDateTime.now();
    }
}
