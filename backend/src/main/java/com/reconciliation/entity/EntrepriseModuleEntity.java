package com.reconciliation.entity;

import jakarta.persistence.*;

/**
 * Activation d'un module POUR une entreprise.
 *
 * Un module doit etre actif pour l'entreprise de l'utilisateur connecte, sinon
 * l'acces est refuse (403 cote backend). Le catalogue `module` reste global ;
 * c'est cette table qui porte l'activation par tenant.
 */
@Entity
@Table(
    name = "entreprise_module",
    uniqueConstraints = @UniqueConstraint(
        name = "uk_entreprise_module",
        columnNames = {"entreprise_id", "module_id"}
    )
)
public class EntrepriseModuleEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "entreprise_id", nullable = false)
    private Long entrepriseId;

    @Column(name = "module_id", nullable = false)
    private Long moduleId;

    @Column(nullable = false)
    private Boolean actif = true;

    // Getters et setters
    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public Long getEntrepriseId() { return entrepriseId; }
    public void setEntrepriseId(Long entrepriseId) { this.entrepriseId = entrepriseId; }
    public Long getModuleId() { return moduleId; }
    public void setModuleId(Long moduleId) { this.moduleId = moduleId; }
    public Boolean getActif() { return actif; }
    public void setActif(Boolean actif) { this.actif = actif; }
}