package com.reconciliation.entity;

import jakarta.persistence.*;
import java.time.LocalDate;
import java.time.LocalDateTime;

@Entity
@jakarta.persistence.EntityListeners(com.reconciliation.tenant.TenantGuardEntityListener.class)
@Table(name = "suivi_compense_op")
public class SuiviCompenseOpEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** Entreprise proprietaire (isolation multi-entreprise, colonne technique). */
    @org.hibernate.annotations.TenantId
    @Column(name = "entreprise_id", nullable = false)
    @com.fasterxml.jackson.annotation.JsonIgnore
    private Long entrepriseId;

    @Column(name = "date_operation")
    private LocalDate dateOperation;

    @Column(name = "code_agence")
    private String codeAgence;

    @Column(name = "banque")
    private String banque;

    @Column(name = "compte_bancaire")
    private String compteBancaire;

    @Column(name = "montant")
    private Double montant;

    @Column(name = "mode_paiement")
    private String modePaiement;

    @Column(name = "reference")
    private String reference;

    @Column(name = "id_ticket")
    private String idTicket;

    @Column(name = "service")
    private String service;

    @Column(name = "reseau")
    private String reseau;

    @Column(name = "source_filename")
    private String sourceFilename;

    @Column(name = "uploaded_at")
    private LocalDateTime uploadedAt;

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public Long getEntrepriseId() { return entrepriseId; }
    public void setEntrepriseId(Long entrepriseId) { this.entrepriseId = entrepriseId; }
    public LocalDate getDateOperation() { return dateOperation; }
    public void setDateOperation(LocalDate dateOperation) { this.dateOperation = dateOperation; }
    public String getCodeAgence() { return codeAgence; }
    public void setCodeAgence(String codeAgence) { this.codeAgence = codeAgence; }
    public String getBanque() { return banque; }
    public void setBanque(String banque) { this.banque = banque; }
    public String getCompteBancaire() { return compteBancaire; }
    public void setCompteBancaire(String compteBancaire) { this.compteBancaire = compteBancaire; }
    public Double getMontant() { return montant; }
    public void setMontant(Double montant) { this.montant = montant; }
    public String getModePaiement() { return modePaiement; }
    public void setModePaiement(String modePaiement) { this.modePaiement = modePaiement; }
    public String getReference() { return reference; }
    public void setReference(String reference) { this.reference = reference; }
    public String getIdTicket() { return idTicket; }
    public void setIdTicket(String idTicket) { this.idTicket = idTicket; }
    public String getService() { return service; }
    public void setService(String service) { this.service = service; }
    public String getReseau() { return reseau; }
    public void setReseau(String reseau) { this.reseau = reseau; }
    public String getSourceFilename() { return sourceFilename; }
    public void setSourceFilename(String sourceFilename) { this.sourceFilename = sourceFilename; }
    public LocalDateTime getUploadedAt() { return uploadedAt; }
    public void setUploadedAt(LocalDateTime uploadedAt) { this.uploadedAt = uploadedAt; }

    @Column(name = "dedup_key")
    private String dedupKey;

    public String getDedupKey() { return dedupKey; }
    public void setDedupKey(String dedupKey) { this.dedupKey = dedupKey; }
}
