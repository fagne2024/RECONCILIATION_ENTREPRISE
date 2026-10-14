package com.reconciliation.entity;

import com.fasterxml.jackson.annotation.JsonIgnore;
import jakarta.persistence.*;
import java.util.List;

@Entity
@jakarta.persistence.EntityListeners(com.reconciliation.tenant.TenantGuardEntityListener.class)
@Table(
    name = "pays",
    // Cle UNIQUE metier par entreprise (alignee sur la migration V3 : uk_pays_tenant).
    uniqueConstraints = @UniqueConstraint(name = "uk_pays_tenant", columnNames = {"entreprise_id", "code"})
)
public class PaysEntity {
    
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** Entreprise proprietaire (isolation multi-entreprise, colonne technique). */
    @org.hibernate.annotations.TenantId
    @jakarta.persistence.Column(name = "entreprise_id", nullable = false)
    @com.fasterxml.jackson.annotation.JsonIgnore
    private Long entrepriseId;
    
    @Column(name = "code", nullable = false, length = 10)
    private String code;
    
    @Column(name = "nom", nullable = false, length = 100)
    private String nom;
    
    @OneToMany(mappedBy = "pays", cascade = CascadeType.ALL, orphanRemoval = true)
    @JsonIgnore
    private List<ProfilPaysEntity> profilPays;
    
    // Constructeurs
    public PaysEntity() {}
    
    public PaysEntity(String code, String nom) {
        this.code = code;
        this.nom = nom;
    }
    
    // Getters et Setters
    public Long getId() {
        return id;
    }
    
    public void setId(Long id) {
        this.id = id;
    }
    
    public String getCode() {
        return code;
    }
    
    public void setCode(String code) {
        this.code = code;
    }
    
    public String getNom() {
        return nom;
    }
    
    public void setNom(String nom) {
        this.nom = nom;
    }
    
    public List<ProfilPaysEntity> getProfilPays() {
        return profilPays;
    }
    
    public void setProfilPays(List<ProfilPaysEntity> profilPays) {
        this.profilPays = profilPays;
    }
}

