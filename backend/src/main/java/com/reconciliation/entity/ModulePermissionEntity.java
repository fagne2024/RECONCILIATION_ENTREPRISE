package com.reconciliation.entity;

import jakarta.persistence.*;

@Entity
@Table(name = "module_permission")
public class ModulePermissionEntity {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne
    @JoinColumn(name = "module_id", nullable = false)
    private ModuleEntity module;

    @ManyToOne
    @JoinColumn(name = "permission_id", nullable = false)
    private PermissionEntity permission;

    // Getters et setters
    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public ModuleEntity getModule() { return module; }
    public void setModule(ModuleEntity module) { this.module = module; }
    public PermissionEntity getPermission() { return permission; }
    public void setPermission(PermissionEntity permission) { this.permission = permission; }
} 