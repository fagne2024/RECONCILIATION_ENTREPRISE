package com.reconciliation.entity;

import jakarta.persistence.*;
import java.time.LocalDate;
import java.time.LocalDateTime;

@Entity
@jakarta.persistence.EntityListeners(com.reconciliation.tenant.TenantGuardEntityListener.class)
@Table(name = "releve_bancaire")
public class ReleveBancaireEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** Entreprise proprietaire (isolation multi-entreprise, colonne technique). */
    @org.hibernate.annotations.TenantId
    @jakarta.persistence.Column(name = "entreprise_id", nullable = false)
    @com.fasterxml.jackson.annotation.JsonIgnore
    private Long entrepriseId;

    @Column(name = "numero_compte")
    private String numeroCompte;

    @Column(name = "nom_compte")
    private String nomCompte;

    @Column(name = "date_comptable")
    private LocalDate dateComptable;

    @Column(name = "date_valeur")
    private LocalDate dateValeur;

    @Column(name = "libelle", length = 2000)
    private String libelle;

    @Column(name = "debit")
    private Double debit;

    @Column(name = "credit")
    private Double credit;

    @Column(name = "montant")
    private Double montant;

    @Column(name = "numero_cheque")
    private String numeroCheque;

    @Column(name = "devise")
    private String devise;

    @Column(name = "solde_courant")
    private Double soldeCourant;

    @Column(name = "solde_disponible_cloture")
    private Double soldeDisponibleCloture;

    @Column(name = "solde_disponible_ouverture")
    private Double soldeDisponibleOuverture;

    @Column(name = "solde_comptable_ouverture")
    private Double soldeComptableOuverture;

    @Column(name = "solde_comptable_cloture")
    private Double soldeComptableCloture;

    @Column(name = "depot_total")
    private Double depotTotal;

    @Column(name = "total_retraits")
    private Double totalRetraits;

    @Column(name = "banque")
    private String banque;

    @Column(name = "source_filename")
    private String sourceFilename;

    @Column(name = "uploaded_at")
    private LocalDateTime uploadedAt;

    @Column(name = "batch_id")
    private String batchId;

    @Column(name = "recon_status")
    private String reconStatus; // OK/KO/null

    @Column(name = "dedup_key", unique = true)
    private String dedupKey;

    @Column(name = "commentaire", length = 1000)
    private String commentaire;

    @Column(name = "numero_serie")
    private String numeroSerie;

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public String getNumeroCompte() { return numeroCompte; }
    public void setNumeroCompte(String numeroCompte) { this.numeroCompte = numeroCompte; }
    public String getNomCompte() { return nomCompte; }
    public void setNomCompte(String nomCompte) { this.nomCompte = nomCompte; }
    public LocalDate getDateComptable() { return dateComptable; }
    public void setDateComptable(LocalDate dateComptable) { this.dateComptable = dateComptable; }
    public LocalDate getDateValeur() { return dateValeur; }
    public void setDateValeur(LocalDate dateValeur) { this.dateValeur = dateValeur; }
    public String getLibelle() { return libelle; }
    public void setLibelle(String libelle) { this.libelle = libelle; }
    public Double getDebit() { return debit; }
    public void setDebit(Double debit) { this.debit = debit; }
    public Double getCredit() { return credit; }
    public void setCredit(Double credit) { this.credit = credit; }
    public Double getMontant() { return montant; }
    public void setMontant(Double montant) { this.montant = montant; }
    public String getNumeroCheque() { return numeroCheque; }
    public void setNumeroCheque(String numeroCheque) { this.numeroCheque = numeroCheque; }
    public String getDevise() { return devise; }
    public void setDevise(String devise) { this.devise = devise; }
    public Double getSoldeCourant() { return soldeCourant; }
    public void setSoldeCourant(Double soldeCourant) { this.soldeCourant = soldeCourant; }
    public Double getSoldeDisponibleCloture() { return soldeDisponibleCloture; }
    public void setSoldeDisponibleCloture(Double soldeDisponibleCloture) { this.soldeDisponibleCloture = soldeDisponibleCloture; }
    public Double getSoldeDisponibleOuverture() { return soldeDisponibleOuverture; }
    public void setSoldeDisponibleOuverture(Double soldeDisponibleOuverture) { this.soldeDisponibleOuverture = soldeDisponibleOuverture; }
    public Double getSoldeComptableOuverture() { return soldeComptableOuverture; }
    public void setSoldeComptableOuverture(Double soldeComptableOuverture) { this.soldeComptableOuverture = soldeComptableOuverture; }
    public Double getSoldeComptableCloture() { return soldeComptableCloture; }
    public void setSoldeComptableCloture(Double soldeComptableCloture) { this.soldeComptableCloture = soldeComptableCloture; }
    public Double getDepotTotal() { return depotTotal; }
    public void setDepotTotal(Double depotTotal) { this.depotTotal = depotTotal; }
    public Double getTotalRetraits() { return totalRetraits; }
    public void setTotalRetraits(Double totalRetraits) { this.totalRetraits = totalRetraits; }
    public String getBanque() { return banque; }
    public void setBanque(String banque) { this.banque = banque; }
    public String getSourceFilename() { return sourceFilename; }
    public void setSourceFilename(String sourceFilename) { this.sourceFilename = sourceFilename; }
    public LocalDateTime getUploadedAt() { return uploadedAt; }
    public void setUploadedAt(LocalDateTime uploadedAt) { this.uploadedAt = uploadedAt; }
    public String getBatchId() { return batchId; }
    public void setBatchId(String batchId) { this.batchId = batchId; }

    public String getReconStatus() { return reconStatus; }
    public void setReconStatus(String reconStatus) { this.reconStatus = reconStatus; }

    public String getDedupKey() { return dedupKey; }
    public void setDedupKey(String dedupKey) { this.dedupKey = dedupKey; }

    public String getCommentaire() { return commentaire; }
    public void setCommentaire(String commentaire) { this.commentaire = commentaire; }
    public String getNumeroSerie() { return numeroSerie; }
    public void setNumeroSerie(String numeroSerie) { this.numeroSerie = numeroSerie; }
}


