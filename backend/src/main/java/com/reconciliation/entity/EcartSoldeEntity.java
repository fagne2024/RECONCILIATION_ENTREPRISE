package com.reconciliation.entity;

import jakarta.persistence.*;
import java.time.LocalDateTime;

@Entity
@jakarta.persistence.EntityListeners(com.reconciliation.tenant.TenantGuardEntityListener.class)
@Table(name = "ecart_solde")
public class EcartSoldeEntity {
    
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** Entreprise proprietaire (isolation multi-entreprise, colonne technique). */
    @org.hibernate.annotations.TenantId
    @jakarta.persistence.Column(name = "entreprise_id", nullable = false)
    @com.fasterxml.jackson.annotation.JsonIgnore
    private Long entrepriseId;
    
    @Column(name = "id_transaction", nullable = false)
    private String idTransaction;
    
    @Column(name = "telephone_client")
    private String telephoneClient;
    
    @Column(name = "montant", nullable = false)
    private Double montant;
    
    @Column(name = "service")
    private String service;
    
    @Column(name = "agence")
    private String agence;
    
    @Column(name = "date_transaction", nullable = false)
    private LocalDateTime dateTransaction;
    
    @Column(name = "numero_trans_gu")
    private String numeroTransGu;
    
    @Column(name = "pays")
    private String pays;
    
    @Column(name = "date_import")
    private LocalDateTime dateImport = LocalDateTime.now();
    
    @Column(name = "statut")
    private String statut = "EN_ATTENTE"; // EN_ATTENTE, TRAITE, ERREUR
    
    @Column(name = "commentaire")
    private String commentaire;
    
    // Constructeurs
    public EcartSoldeEntity() {}
    
    public EcartSoldeEntity(String idTransaction, String telephoneClient, Double montant, 
                           String service, String agence, LocalDateTime dateTransaction, 
                           String numeroTransGu, String pays) {
        this.idTransaction = idTransaction;
        this.telephoneClient = telephoneClient;
        this.montant = montant;
        this.service = service;
        this.agence = agence;
        this.dateTransaction = dateTransaction;
        this.numeroTransGu = numeroTransGu;
        this.pays = pays;
    }
    
    // Getters et Setters
    public Long getId() {
        return id;
    }
    
    public void setId(Long id) {
        this.id = id;
    }
    
    public String getIdTransaction() {
        return idTransaction;
    }
    
    public void setIdTransaction(String idTransaction) {
        this.idTransaction = idTransaction;
    }
    
    public String getTelephoneClient() {
        return telephoneClient;
    }
    
    public void setTelephoneClient(String telephoneClient) {
        this.telephoneClient = telephoneClient;
    }
    
    public Double getMontant() {
        return montant;
    }
    
    public void setMontant(Double montant) {
        this.montant = montant;
    }
    
    public String getService() {
        return service;
    }
    
    public void setService(String service) {
        this.service = service;
    }
    
    public String getAgence() {
        return agence;
    }
    
    public void setAgence(String agence) {
        this.agence = agence;
    }
    
    public LocalDateTime getDateTransaction() {
        return dateTransaction;
    }
    
    public void setDateTransaction(LocalDateTime dateTransaction) {
        this.dateTransaction = dateTransaction;
    }
    
    public String getNumeroTransGu() {
        return numeroTransGu;
    }
    
    public void setNumeroTransGu(String numeroTransGu) {
        this.numeroTransGu = numeroTransGu;
    }
    
    public String getPays() {
        return pays;
    }
    
    public void setPays(String pays) {
        this.pays = pays;
    }
    
    public LocalDateTime getDateImport() {
        return dateImport;
    }
    
    public void setDateImport(LocalDateTime dateImport) {
        this.dateImport = dateImport;
    }
    
    public String getStatut() {
        return statut;
    }
    
    public void setStatut(String statut) {
        this.statut = statut;
    }
    
    public String getCommentaire() {
        return commentaire;
    }
    
    public void setCommentaire(String commentaire) {
        this.commentaire = commentaire;
    }
} 