package com.reconciliation.entity;

import jakarta.persistence.*;

/** Ligne d'un dossier lié : une opération bancaire (OPERATION) ou une ligne de relevé (RELEVE) avec son rôle. */
@Entity
@EntityListeners(com.reconciliation.tenant.TenantGuardEntityListener.class)
@Table(name = "banque_dossier_lie_ligne")
public class BanqueDossierLieLigneEntity {

    public static final String TYPE_OPERATION = "OPERATION";
    public static final String TYPE_RELEVE = "RELEVE";

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** Entreprise proprietaire (isolation multi-entreprise, colonne technique). */
    @org.hibernate.annotations.TenantId
    @Column(name = "entreprise_id", nullable = false)
    @com.fasterxml.jackson.annotation.JsonIgnore
    private Long entrepriseId;

    @Column(name = "dossier_id", nullable = false)
    private Long dossierId;

    /** OPERATION ou RELEVE. */
    @Column(name = "type_ligne", nullable = false, length = 16)
    private String typeLigne;

    /** Identifiant de l'opération bancaire ou de la ligne de relevé. */
    @Column(name = "ligne_id", nullable = false)
    private Long ligneId;

    /** Rôle dans le dossier, voir {@code BanqueDossierLieService#ROLES}. */
    @Column(name = "role", nullable = false, length = 32)
    private String role;

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public Long getEntrepriseId() { return entrepriseId; }
    public void setEntrepriseId(Long entrepriseId) { this.entrepriseId = entrepriseId; }
    public Long getDossierId() { return dossierId; }
    public void setDossierId(Long dossierId) { this.dossierId = dossierId; }
    public String getTypeLigne() { return typeLigne; }
    public void setTypeLigne(String typeLigne) { this.typeLigne = typeLigne; }
    public Long getLigneId() { return ligneId; }
    public void setLigneId(Long ligneId) { this.ligneId = ligneId; }
    public String getRole() { return role; }
    public void setRole(String role) { this.role = role; }
}
