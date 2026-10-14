package com.reconciliation.entity;

import jakarta.persistence.*;
import java.time.LocalDate;

@Entity
@jakarta.persistence.EntityListeners(com.reconciliation.tenant.TenantGuardEntityListener.class)
@Table(name = "suivi_ecart")
public class SuiviEcartEntity {
    
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** Entreprise proprietaire (isolation multi-entreprise, colonne technique). */
    @org.hibernate.annotations.TenantId
    @jakarta.persistence.Column(name = "entreprise_id", nullable = false)
    @com.fasterxml.jackson.annotation.JsonIgnore
    private Long entrepriseId;
    
    @Column(name = "date", nullable = false)
    private LocalDate date;
    
    @Column(name = "agence", nullable = false)
    private String agence;
    
    @Column(name = "service", nullable = false)
    private String service;
    
    @Column(name = "pays", nullable = false)
    private String pays;
    
    @Column(name = "montant", nullable = false)
    private Double montant;
    
    @Column(name = "token", nullable = false)
    private String token;
    
    @Column(name = "id_partenaire", nullable = false)
    private String idPartenaire;
    
    @Column(name = "statut", nullable = false)
    private String statut;
    
    @Column(name = "traitement")
    private String traitement;
    
    @Column(name = "username")
    private String username;
    
    @Column(name = "glpi_id")
    private String glpiId;
    
    @Column(name = "telephone")
    private String telephone;
    
    @Column(name = "commentaire", columnDefinition = "TEXT")
    private String commentaire;
    
    // Constructeurs
    public SuiviEcartEntity() {}
    
    public SuiviEcartEntity(LocalDate date, String agence, String service, String pays,
                           Double montant, String token, String idPartenaire,
                           String statut, String traitement, String username, String glpiId,
                           String telephone, String commentaire) {
        this.date = date;
        this.agence = agence;
        this.service = service;
        this.pays = pays;
        this.montant = montant;
        this.token = token;
        this.idPartenaire = idPartenaire;
        this.statut = statut;
        this.traitement = traitement;
        this.username = username;
        this.glpiId = glpiId;
        this.telephone = telephone;
        this.commentaire = commentaire;
    }
    
    // Getters et Setters
    public Long getId() {
        return id;
    }
    
    public void setId(Long id) {
        this.id = id;
    }
    
    public LocalDate getDate() {
        return date;
    }
    
    public void setDate(LocalDate date) {
        this.date = date;
    }
    
    public String getAgence() {
        return agence;
    }
    
    public void setAgence(String agence) {
        this.agence = agence;
    }
    
    public String getService() {
        return service;
    }
    
    public void setService(String service) {
        this.service = service;
    }
    
    public String getPays() {
        return pays;
    }
    
    public void setPays(String pays) {
        this.pays = pays;
    }
    
    public Double getMontant() {
        return montant;
    }
    
    public void setMontant(Double montant) {
        this.montant = montant;
    }
    
    public String getToken() {
        return token;
    }
    
    public void setToken(String token) {
        this.token = token;
    }
    
    public String getIdPartenaire() {
        return idPartenaire;
    }
    
    public void setIdPartenaire(String idPartenaire) {
        this.idPartenaire = idPartenaire;
    }
    
    public String getStatut() {
        return statut;
    }
    
    public void setStatut(String statut) {
        this.statut = statut;
    }
    
    public String getTraitement() {
        return traitement;
    }
    
    public void setTraitement(String traitement) {
        this.traitement = traitement;
    }
    
    public String getUsername() {
        return username;
    }
    
    public void setUsername(String username) {
        this.username = username;
    }
    
    public String getGlpiId() {
        return glpiId;
    }
    
    public void setGlpiId(String glpiId) {
        this.glpiId = glpiId;
    }
    
    public String getTelephone() {
        return telephone;
    }
    
    public void setTelephone(String telephone) {
        this.telephone = telephone;
    }
    
    public String getCommentaire() {
        return commentaire;
    }
    
    public void setCommentaire(String commentaire) {
        this.commentaire = commentaire;
    }
}

