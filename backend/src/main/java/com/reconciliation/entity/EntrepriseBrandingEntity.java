package com.reconciliation.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.LocalDateTime;

/**
 * Marque (branding) d'une entreprise : couleurs de l'interface et logo.
 *
 * <p>Contrairement aux entites metier, cette table n'est PAS annotee
 * {@code @TenantId} et n'a PAS de {@code TenantGuardEntityListener} : la marque
 * doit pouvoir etre lue AVANT authentification (page de connexion) en resolvant
 * l'entreprise par son {@code code}. Les ecritures sont, elles, strictement
 * limitees a l'entreprise du compte connecte (voir
 * {@code ConfigurationController}).</p>
 *
 * <p>Le SUPER_ADMIN (aucune entreprise) n'a jamais de ligne ici : il conserve les
 * couleurs/logo par defaut de l'application.</p>
 */
@Entity
@Table(name = "entreprise_branding")
public class EntrepriseBrandingEntity {

    /** Cle primaire = identifiant de l'entreprise (relation 1-1). */
    @Id
    @Column(name = "entreprise_id", nullable = false)
    private Long entrepriseId;

    /** Couleurs de l'interface, serialisees en JSON. */
    @Column(name = "theme_json", columnDefinition = "TEXT")
    private String themeJson;

    /** Logo encode en data URL (peut etre volumineux). */
    @Column(name = "logo_data", columnDefinition = "LONGTEXT")
    private String logoData;

    /** Reglages d'affichage du logo, serialises en JSON. */
    @Column(name = "logo_settings_json", columnDefinition = "TEXT")
    private String logoSettingsJson;

    @Column(name = "updated_at")
    private LocalDateTime updatedAt;

    public Long getEntrepriseId() { return entrepriseId; }
    public void setEntrepriseId(Long entrepriseId) { this.entrepriseId = entrepriseId; }

    public String getThemeJson() { return themeJson; }
    public void setThemeJson(String themeJson) { this.themeJson = themeJson; }

    public String getLogoData() { return logoData; }
    public void setLogoData(String logoData) { this.logoData = logoData; }

    public String getLogoSettingsJson() { return logoSettingsJson; }
    public void setLogoSettingsJson(String logoSettingsJson) { this.logoSettingsJson = logoSettingsJson; }

    public LocalDateTime getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(LocalDateTime updatedAt) { this.updatedAt = updatedAt; }
}
