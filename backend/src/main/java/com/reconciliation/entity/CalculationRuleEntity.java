package com.reconciliation.entity;

import jakarta.persistence.*;

/**
 * Règle de calcul configurable.
 * Permet de rendre paramétrable un calcul (formule), une liste de valeurs ou un paramètre
 * utilisé par les moteurs de calcul de l'application (regroupés par module / sous-module).
 */
@Entity
@jakarta.persistence.EntityListeners(com.reconciliation.tenant.TenantGuardEntityListener.class)
@Table(name = "calculation_rule",
        uniqueConstraints = @UniqueConstraint(name = "uk_calculation_rule_code", columnNames = "code"))
public class CalculationRuleEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** Entreprise proprietaire (isolation multi-entreprise, colonne technique). */
    @org.hibernate.annotations.TenantId
    @jakarta.persistence.Column(name = "entreprise_id", nullable = false)
    @com.fasterxml.jackson.annotation.JsonIgnore
    private Long entrepriseId;

    /** Code technique unique et stable (ex: CERTIF.ECART_MOUVEMENT). */
    @Column(name = "code", nullable = false, length = 150)
    private String code;

    /** Module métier (ex: CERTIFICATION_SOLDE). */
    @Column(name = "module", nullable = false, length = 100)
    private String module;

    /** Sous-module / groupe fonctionnel (ex: ECART_MOUVEMENT). */
    @Column(name = "sous_module", length = 120)
    private String sousModule;

    /** Libellé affiché (modifiable). */
    @Column(name = "libelle", nullable = false, length = 255)
    private String libelle;

    @Column(name = "description", columnDefinition = "TEXT")
    private String description;

    /** FORMULE | LISTE | PARAMETRE */
    @Column(name = "type", nullable = false, length = 20)
    private String type = "FORMULE";

    /** JSON structuré pour les FORMULE (liste de termes). */
    @Column(name = "expression", columnDefinition = "TEXT")
    private String expression;

    /** JSON (tableau) pour les LISTE. */
    @Column(name = "valeurs", columnDefinition = "TEXT")
    private String valeurs;

    /** Valeur numérique pour les PARAMETRE. */
    @Column(name = "valeur")
    private Double valeur;

    @Column(name = "unite", length = 30)
    private String unite;

    @Column(name = "ordre")
    private Integer ordre = 0;

    @Column(name = "actif", nullable = false)
    private Boolean actif = true;

    /** Règle fournie par le système (ne peut pas être supprimée). */
    @Column(name = "systeme", nullable = false)
    private Boolean systeme = false;

    @Column(name = "date_creation")
    private java.time.LocalDateTime dateCreation;

    @Column(name = "date_modification")
    private java.time.LocalDateTime dateModification;

    public CalculationRuleEntity() {
        this.dateCreation = java.time.LocalDateTime.now();
        this.dateModification = java.time.LocalDateTime.now();
    }

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

    public String getModule() {
        return module;
    }

    public void setModule(String module) {
        this.module = module;
    }

    public String getSousModule() {
        return sousModule;
    }

    public void setSousModule(String sousModule) {
        this.sousModule = sousModule;
    }

    public String getLibelle() {
        return libelle;
    }

    public void setLibelle(String libelle) {
        this.libelle = libelle;
    }

    public String getDescription() {
        return description;
    }

    public void setDescription(String description) {
        this.description = description;
    }

    public String getType() {
        return type;
    }

    public void setType(String type) {
        this.type = type;
    }

    public String getExpression() {
        return expression;
    }

    public void setExpression(String expression) {
        this.expression = expression;
    }

    public String getValeurs() {
        return valeurs;
    }

    public void setValeurs(String valeurs) {
        this.valeurs = valeurs;
    }

    public Double getValeur() {
        return valeur;
    }

    public void setValeur(Double valeur) {
        this.valeur = valeur;
    }

    public String getUnite() {
        return unite;
    }

    public void setUnite(String unite) {
        this.unite = unite;
    }

    public Integer getOrdre() {
        return ordre;
    }

    public void setOrdre(Integer ordre) {
        this.ordre = ordre;
    }

    public Boolean getActif() {
        return actif;
    }

    public void setActif(Boolean actif) {
        this.actif = actif;
    }

    public Boolean getSysteme() {
        return systeme;
    }

    public void setSysteme(Boolean systeme) {
        this.systeme = systeme;
    }

    public java.time.LocalDateTime getDateCreation() {
        return dateCreation;
    }

    public void setDateCreation(java.time.LocalDateTime dateCreation) {
        this.dateCreation = dateCreation;
    }

    public java.time.LocalDateTime getDateModification() {
        return dateModification;
    }

    public void setDateModification(java.time.LocalDateTime dateModification) {
        this.dateModification = dateModification;
    }

    @PreUpdate
    public void preUpdate() {
        this.dateModification = java.time.LocalDateTime.now();
    }
}
