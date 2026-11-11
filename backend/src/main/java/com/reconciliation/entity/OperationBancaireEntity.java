package com.reconciliation.entity;

import jakarta.persistence.*;
import java.time.LocalDateTime;

@Entity
@jakarta.persistence.EntityListeners(com.reconciliation.tenant.TenantGuardEntityListener.class)
@Table(name = "operation_bancaire")
public class OperationBancaireEntity {
    
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** Entreprise proprietaire (isolation multi-entreprise, colonne technique). */
    @org.hibernate.annotations.TenantId
    @jakarta.persistence.Column(name = "entreprise_id", nullable = false)
    @com.fasterxml.jackson.annotation.JsonIgnore
    private Long entrepriseId;
    
    @Column(name = "pays", nullable = false)
    private String pays;
    
    @Column(name = "code_pays")
    private String codePays;
    
    @Column(name = "mois")
    private String mois;
    
    @Column(name = "date_operation", nullable = false)
    private LocalDateTime dateOperation;
    
    @Column(name = "agence", nullable = false)
    private String agence;
    
    @Column(name = "type_operation", nullable = false)
    private String typeOperation;
    
    @Column(name = "nom_beneficiaire")
    private String nomBeneficiaire;
    
    @Column(name = "compte_a_debiter")
    private String compteADebiter;
    
    @Column(name = "montant", nullable = false)
    private Double montant;
    
    @Column(name = "mode_paiement")
    private String modePaiement;
    
    @Column(name = "reference")
    private String reference;
    
    @Column(name = "id_glpi")
    private String idGlpi;
    
    @Column(name = "bo")
    private String bo;

    @Column(name = "banque_corrigee")
    private String banqueCorrigee;

    @Column(name = "demandeur")
    private String demandeur;

    @Column(name = "valideur")
    private String valideur;

    
    @Column(name = "statut", nullable = false)
    private String statut;

    @Column(name = "recon_status")
    private String reconStatus; // OK/KO/null
    
    @Column(name = "operation_id")
    private Long operationId;
    
    @Column(name = "impact_applique", nullable = false)
    private Boolean impactApplique = false; // Flag pour éviter le double impact
    
    @Column(name = "traitement")
    private String traitement;

    @Column(name = "commentaire", length = 1000)
    private String commentaire;

    public String getCommentaire() { return commentaire; }
    public void setCommentaire(String commentaire) { this.commentaire = commentaire; }
    
    // Constructeurs
    public OperationBancaireEntity() {}
    
    public OperationBancaireEntity(String pays, String codePays, String mois, LocalDateTime dateOperation,
                                   String agence, String typeOperation, String nomBeneficiaire,
                                   String compteADebiter, Double montant, String modePaiement,
                                   String reference, String idGlpi, String bo, String statut, Long operationId) {
        this.pays = pays;
        this.codePays = codePays;
        this.mois = mois;
        this.dateOperation = dateOperation;
        this.agence = agence;
        this.typeOperation = typeOperation;
        this.nomBeneficiaire = nomBeneficiaire;
        this.compteADebiter = compteADebiter;
        this.montant = montant;
        this.modePaiement = modePaiement;
        this.reference = reference;
        this.idGlpi = idGlpi;
        this.bo = bo;
        this.statut = statut;
        this.operationId = operationId;
    }
    
    // Getters et Setters
    public Long getId() {
        return id;
    }
    
    public void setId(Long id) {
        this.id = id;
    }
    
    public String getPays() {
        return pays;
    }
    
    public void setPays(String pays) {
        this.pays = pays;
    }
    
    public String getCodePays() {
        return codePays;
    }
    
    public void setCodePays(String codePays) {
        this.codePays = codePays;
    }
    
    public String getMois() {
        return mois;
    }
    
    public void setMois(String mois) {
        this.mois = mois;
    }
    
    public LocalDateTime getDateOperation() {
        return dateOperation;
    }
    
    public void setDateOperation(LocalDateTime dateOperation) {
        this.dateOperation = dateOperation;
    }
    
    public String getAgence() {
        return agence;
    }
    
    public void setAgence(String agence) {
        this.agence = agence;
    }
    
    public String getTypeOperation() {
        return typeOperation;
    }
    
    public void setTypeOperation(String typeOperation) {
        this.typeOperation = typeOperation;
    }
    
    public String getNomBeneficiaire() {
        return nomBeneficiaire;
    }
    
    public void setNomBeneficiaire(String nomBeneficiaire) {
        this.nomBeneficiaire = nomBeneficiaire;
    }
    
    public String getCompteADebiter() {
        return compteADebiter;
    }
    
    public void setCompteADebiter(String compteADebiter) {
        this.compteADebiter = compteADebiter;
    }
    
    public Double getMontant() {
        return montant;
    }
    
    public void setMontant(Double montant) {
        this.montant = montant;
    }
    
    public String getModePaiement() {
        return modePaiement;
    }
    
    public void setModePaiement(String modePaiement) {
        this.modePaiement = modePaiement;
    }
    
    public String getReference() {
        return reference;
    }
    
    public void setReference(String reference) {
        this.reference = reference;
    }
    
    public String getIdGlpi() {
        return idGlpi;
    }
    
    public void setIdGlpi(String idGlpi) {
        this.idGlpi = idGlpi;
    }
    
    public String getBo() {
        return bo;
    }
    
    public void setBo(String bo) {
        this.bo = bo;
    }

    public String getBanqueCorrigee() {
        return banqueCorrigee;
    }

    public void setBanqueCorrigee(String banqueCorrigee) {
        this.banqueCorrigee = banqueCorrigee;
    }

    public String getDemandeur() {
        return demandeur;
    }

    public void setDemandeur(String demandeur) {
        this.demandeur = demandeur;
    }

    public String getValideur() {
        return valideur;
    }

    public void setValideur(String valideur) {
        this.valideur = valideur;
    }

    
    public String getStatut() {
        return statut;
    }
    
    public void setStatut(String statut) {
        this.statut = statut;
    }

    public String getReconStatus() {
        return reconStatus;
    }

    public void setReconStatus(String reconStatus) {
        this.reconStatus = reconStatus;
    }
    
    public Long getOperationId() {
        return operationId;
    }
    
    public void setOperationId(Long operationId) {
        this.operationId = operationId;
    }
    
    public Boolean getImpactApplique() {
        return impactApplique;
    }
    
    public void setImpactApplique(Boolean impactApplique) {
        this.impactApplique = impactApplique;
    }
    
    public String getTraitement() {
        return traitement;
    }
    
    public void setTraitement(String traitement) {
        this.traitement = traitement;
    }

    @Column(name = "dedup_key")
    private String dedupKey;

    /** Vrai une fois la correspondance validée par le check : la ligne n'est plus proposée. */
    // Colonne NOT NULL DEFAULT FALSE (V27) : Hibernate insère la valeur du champ et ignore le DEFAULT,
    // d'où l'initialisation à false (sinon « Column 'check_valide' cannot be null » à chaque création).
    @Column(name = "check_valide", nullable = false)
    private Boolean checkValide = false;

    public Boolean getCheckValide() { return checkValide; }
    public void setCheckValide(Boolean checkValide) { this.checkValide = Boolean.TRUE.equals(checkValide); }

    public String getDedupKey() { return dedupKey; }
    public void setDedupKey(String dedupKey) { this.dedupKey = dedupKey; }
}
