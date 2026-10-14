package com.reconciliation.entity;

import jakarta.persistence.*;
import com.fasterxml.jackson.annotation.JsonIgnore;
import java.util.Set;
import com.reconciliation.entity.ProfilPermissionEntity;

@Entity
@Table(name = "permission")
public class PermissionEntity {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, unique = true)
    private String nom;

    @OneToMany(mappedBy = "permission")
    @JsonIgnore
    private Set<ProfilPermissionEntity> profilPermissions;

    // Getters et setters
    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public String getNom() { return nom; }
    public void setNom(String nom) { this.nom = nom; }
    public Set<ProfilPermissionEntity> getProfilPermissions() { return profilPermissions; }
    public void setProfilPermissions(Set<ProfilPermissionEntity> profilPermissions) { this.profilPermissions = profilPermissions; }
} 