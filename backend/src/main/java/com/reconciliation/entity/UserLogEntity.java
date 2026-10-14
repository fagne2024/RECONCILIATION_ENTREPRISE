package com.reconciliation.entity;

import jakarta.persistence.*;
import java.time.LocalDateTime;

@Entity
@jakarta.persistence.EntityListeners(com.reconciliation.tenant.TenantGuardEntityListener.class)
@Table(name = "user_log")
public class UserLogEntity {
    
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** Entreprise proprietaire (isolation multi-entreprise, colonne technique). */
    @org.hibernate.annotations.TenantId
    @jakarta.persistence.Column(name = "entreprise_id", nullable = false)
    @com.fasterxml.jackson.annotation.JsonIgnore
    private Long entrepriseId;
    
    @Column(nullable = false)
    private String permission;
    
    @Column(nullable = false)
    private String module;
    
    @Column(nullable = false)
    private String username;
    
    @Column(name = "date_heure", nullable = false)
    private LocalDateTime dateHeure;
    
    @Column(name = "created_at")
    private LocalDateTime createdAt;
    
    @Column(name = "details", length = 1000)
    private String details; // Détails de la modification (ex: numéro de compte modifié, ID de l'élément, etc.)
    
    // Constructeurs
    public UserLogEntity() {
        this.createdAt = LocalDateTime.now();
    }
    
    public UserLogEntity(String permission, String module, String username, LocalDateTime dateHeure) {
        this();
        this.permission = permission;
        this.module = module;
        this.username = username;
        this.dateHeure = dateHeure;
    }
    
    public UserLogEntity(String permission, String module, String username, LocalDateTime dateHeure, String details) {
        this(permission, module, username, dateHeure);
        this.details = details;
    }
    
    // Getters et setters
    public Long getId() {
        return id;
    }
    
    public void setId(Long id) {
        this.id = id;
    }
    
    public String getPermission() {
        return permission;
    }
    
    public void setPermission(String permission) {
        this.permission = permission;
    }
    
    public String getModule() {
        return module;
    }
    
    public void setModule(String module) {
        this.module = module;
    }
    
    public String getUsername() {
        return username;
    }
    
    public void setUsername(String username) {
        this.username = username;
    }
    
    public LocalDateTime getDateHeure() {
        return dateHeure;
    }
    
    public void setDateHeure(LocalDateTime dateHeure) {
        this.dateHeure = dateHeure;
    }
    
    public LocalDateTime getCreatedAt() {
        return createdAt;
    }
    
    public void setCreatedAt(LocalDateTime createdAt) {
        this.createdAt = createdAt;
    }
    
    public String getDetails() {
        return details;
    }
    
    public void setDetails(String details) {
        this.details = details;
    }
}

