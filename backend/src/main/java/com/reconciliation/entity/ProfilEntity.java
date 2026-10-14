package com.reconciliation.entity;

import jakarta.persistence.*;
import com.fasterxml.jackson.annotation.JsonIgnore;
import java.util.Set;
import com.reconciliation.entity.ProfilPermissionEntity;

@Entity
@jakarta.persistence.EntityListeners(com.reconciliation.tenant.TenantGuardEntityListener.class)
@Table(
    name = "profil",
    // Cle UNIQUE metier par entreprise (alignee sur la migration V3 : uk_profil_tenant).
    // Deux entreprises peuvent donc avoir chacune un profil « ADMINISTRATEUR ».
    uniqueConstraints = @UniqueConstraint(name = "uk_profil_tenant", columnNames = {"entreprise_id", "nom"})
)
public class ProfilEntity {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** Entreprise proprietaire (isolation multi-entreprise, colonne technique). */
    @org.hibernate.annotations.TenantId
    @jakarta.persistence.Column(name = "entreprise_id", nullable = false)
    @com.fasterxml.jackson.annotation.JsonIgnore
    private Long entrepriseId;

    @Column(nullable = false)
    private String nom;

    @Column(columnDefinition = "TEXT")
    private String description;

    @OneToMany(mappedBy = "profil")
    private Set<ProfilPermissionEntity> permissions;

    // Getters et setters
    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public String getNom() { return nom; }
    public void setNom(String nom) { this.nom = nom; }
    public String getDescription() { return description; }
    public void setDescription(String description) { this.description = description; }
    @JsonIgnore
    public Set<ProfilPermissionEntity> getPermissions() { return permissions; }
    public void setPermissions(Set<ProfilPermissionEntity> permissions) { this.permissions = permissions; }
} 