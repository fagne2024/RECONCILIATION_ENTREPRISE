package com.reconciliation.entity;

import jakarta.persistence.*;
import java.time.LocalDateTime;

@Entity
@jakarta.persistence.EntityListeners(com.reconciliation.tenant.TenantGuardEntityListener.class)
@Table(name = "ecart_bo_summary")
public class EcartBoSummaryEntity {
    
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** Entreprise proprietaire (isolation multi-entreprise, colonne technique). */
    @org.hibernate.annotations.TenantId
    @jakarta.persistence.Column(name = "entreprise_id", nullable = false)
    @com.fasterxml.jackson.annotation.JsonIgnore
    private Long entrepriseId;
    
    @Column(name = "date_transaction", nullable = false)
    private LocalDateTime dateTransaction;
    
    @Column(name = "agence")
    private String agence;
    
    @Column(name = "service")
    private String service;
    
    @Column(name = "pays")
    private String pays;
    
    @Column(name = "nombre_transactions", nullable = false)
    private Integer nombreTransactions = 0;
    
    @Column(name = "montant_total", nullable = false)
    private Double montantTotal = 0.0;
    
    @Column(name = "statut")
    private String statut = "EN_COURS"; // EN_COURS, OK
    
    @Column(name = "date_import")
    private LocalDateTime dateImport = LocalDateTime.now();
    
    @Column(name = "commentaire", columnDefinition = "TEXT")
    private String commentaire;
    
    @Column(name = "env", length = 20)
    private String env = "BO";

    /** Environnement technique (BET, HT, PROD, etc.) */
    @Column(name = "env_code", length = 32)
    private String envCode;

    @Column(name = "token", length = 64)
    private String token;

    // Constructeurs
    public EcartBoSummaryEntity() {}
    
    public EcartBoSummaryEntity(LocalDateTime dateTransaction, String agence, String service, 
                               String pays, Integer nombreTransactions, Double montantTotal, 
                               String statut) {
        this.dateTransaction = dateTransaction;
        this.agence = agence;
        this.service = service;
        this.pays = pays;
        this.nombreTransactions = nombreTransactions;
        this.montantTotal = montantTotal;
        this.statut = statut;
    }
    
    // Getters et Setters
    public Long getId() {
        return id;
    }
    
    public void setId(Long id) {
        this.id = id;
    }
    
    public LocalDateTime getDateTransaction() {
        return dateTransaction;
    }
    
    public void setDateTransaction(LocalDateTime dateTransaction) {
        this.dateTransaction = dateTransaction;
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
    
    public Integer getNombreTransactions() {
        return nombreTransactions;
    }
    
    public void setNombreTransactions(Integer nombreTransactions) {
        this.nombreTransactions = nombreTransactions;
    }
    
    public Double getMontantTotal() {
        return montantTotal;
    }
    
    public void setMontantTotal(Double montantTotal) {
        this.montantTotal = montantTotal;
    }
    
    public String getStatut() {
        return statut;
    }
    
    public void setStatut(String statut) {
        this.statut = statut;
    }
    
    public LocalDateTime getDateImport() {
        return dateImport;
    }
    
    public void setDateImport(LocalDateTime dateImport) {
        this.dateImport = dateImport;
    }
    
    public String getCommentaire() {
        return commentaire;
    }
    
    public void setCommentaire(String commentaire) {
        this.commentaire = commentaire;
    }
    
    public String getEnv() {
        return env;
    }
    
    public void setEnv(String env) {
        this.env = env;
    }

    public String getEnvCode() {
        return envCode;
    }

    public void setEnvCode(String envCode) {
        this.envCode = envCode;
    }

    public String getToken() {
        return token;
    }

    public void setToken(String token) {
        this.token = token;
    }
}
