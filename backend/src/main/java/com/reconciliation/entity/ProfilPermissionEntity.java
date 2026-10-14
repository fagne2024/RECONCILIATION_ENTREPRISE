package com.reconciliation.entity;

import jakarta.persistence.*;
import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

@Entity
@jakarta.persistence.EntityListeners(com.reconciliation.tenant.TenantGuardEntityListener.class)
@Table(name = "profil_permission")
public class ProfilPermissionEntity {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** Entreprise proprietaire (isolation multi-entreprise, colonne technique). */
    @org.hibernate.annotations.TenantId
    @jakarta.persistence.Column(name = "entreprise_id", nullable = false)
    @com.fasterxml.jackson.annotation.JsonIgnore
    private Long entrepriseId;

    @ManyToOne(fetch = FetchType.EAGER)
    @JoinColumn(name = "profil_id", nullable = false)
    @JsonIgnoreProperties({"permissions"})
    private ProfilEntity profil;

    @ManyToOne(fetch = FetchType.EAGER)
    @JoinColumn(name = "module_id", nullable = false)
    @JsonIgnoreProperties({"permissions"})
    private ModuleEntity module;

    @ManyToOne(fetch = FetchType.EAGER)
    @JoinColumn(name = "permission_id", nullable = false)
    @JsonIgnoreProperties({"profilPermissions"})
    private PermissionEntity permission;

    // Getters et setters
    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public ProfilEntity getProfil() { return profil; }
    public void setProfil(ProfilEntity profil) { this.profil = profil; }
    public ModuleEntity getModule() { return module; }
    public void setModule(ModuleEntity module) { this.module = module; }
    public PermissionEntity getPermission() { return permission; }
    public void setPermission(PermissionEntity permission) { this.permission = permission; }
} 