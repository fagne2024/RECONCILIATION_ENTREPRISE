package com.reconciliation.entity;

import com.fasterxml.jackson.databind.annotation.JsonDeserialize;
import com.reconciliation.json.FlexibleLocalDateTimeDeserializer;
import jakarta.persistence.*;
import java.math.BigDecimal;
import java.time.LocalDateTime;

@Entity
@jakarta.persistence.EntityListeners(com.reconciliation.tenant.TenantGuardEntityListener.class)
@Table(name = "oppart")
public class OPPARTEntity {

    public static final String STATUT_EN_COURS = "EN_COURS";
    public static final String STATUT_OK = "OK";

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** Entreprise proprietaire (isolation multi-entreprise, colonne technique). */
    @org.hibernate.annotations.TenantId
    @jakarta.persistence.Column(name = "entreprise_id", nullable = false)
    @com.fasterxml.jackson.annotation.JsonIgnore
    private Long entrepriseId;

    @Column(name = "client", length = 255)
    private String client;

    @Column(name = "type_op", length = 100)
    private String typeOp;

    @Column(name = "montant", precision = 15, scale = 3)
    private BigDecimal montant;

    @JsonDeserialize(using = FlexibleLocalDateTimeDeserializer.class)
    @Column(name = "date_operation")
    private LocalDateTime dateOperation;

    /** Date d'opération côté partenaire (la date BO reste dans dateOperation). */
    @JsonDeserialize(using = FlexibleLocalDateTimeDeserializer.class)
    @Column(name = "date_operation_part")
    private LocalDateTime dateOperationPart;

    /** Date de la demande / initiation à l'origine de l'opération. */
    @JsonDeserialize(using = FlexibleLocalDateTimeDeserializer.class)
    @Column(name = "date_demande")
    private LocalDateTime dateDemande;

    @Column(name = "id_transaction", length = 100)
    private String idTransaction;

    @Column(name = "pays", length = 128)
    private String pays;

    @Column(name = "source", length = 50)
    private String source;

    /** Statut de traitement de la ligne : EN_COURS (défaut) ou OK. */
    @Column(name = "statut", length = 20, nullable = false)
    private String statut = STATUT_EN_COURS;

    /** Token partagé par les 2 lignes d'une correspondance. */
    @Column(name = "token", length = 64)
    private String token;

    @Column(name = "created_at")
    private LocalDateTime createdAt;

    @Column(name = "updated_at")
    private LocalDateTime updatedAt;

    public OPPARTEntity() {
        this.createdAt = LocalDateTime.now();
        this.updatedAt = LocalDateTime.now();
    }

    public OPPARTEntity(String client, String typeOp, BigDecimal montant, LocalDateTime dateOperation,
                        String idTransaction, String pays, String source) {
        this();
        this.client = client;
        this.typeOp = typeOp;
        this.montant = montant;
        this.dateOperation = dateOperation;
        this.idTransaction = idTransaction;
        this.pays = pays;
        this.source = source;
    }

    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public String getClient() {
        return client;
    }

    public void setClient(String client) {
        this.client = client;
    }

    public String getTypeOp() {
        return typeOp;
    }

    public void setTypeOp(String typeOp) {
        this.typeOp = typeOp;
    }

    public BigDecimal getMontant() {
        return montant;
    }

    public void setMontant(BigDecimal montant) {
        this.montant = montant;
    }

    public LocalDateTime getDateOperation() {
        return dateOperation;
    }

    public void setDateOperation(LocalDateTime dateOperation) {
        this.dateOperation = dateOperation;
    }

    public LocalDateTime getDateOperationPart() {
        return dateOperationPart;
    }

    public void setDateOperationPart(LocalDateTime dateOperationPart) {
        this.dateOperationPart = dateOperationPart;
    }

    public LocalDateTime getDateDemande() {
        return dateDemande;
    }

    public void setDateDemande(LocalDateTime dateDemande) {
        this.dateDemande = dateDemande;
    }

    public String getIdTransaction() {
        return idTransaction;
    }

    public void setIdTransaction(String idTransaction) {
        this.idTransaction = idTransaction;
    }

    public String getPays() {
        return pays;
    }

    public void setPays(String pays) {
        this.pays = pays;
    }

    public String getSource() {
        return source;
    }

    public void setSource(String source) {
        this.source = source;
    }

    public String getStatut() {
        return statut;
    }

    public void setStatut(String statut) {
        if (statut == null || statut.isBlank()) {
            this.statut = STATUT_EN_COURS;
            return;
        }
        String v = statut.trim().toUpperCase().replaceAll("\\s+", "_");
        this.statut = v.equals("EN_COURS") || v.equals("ENCOURS") ? STATUT_EN_COURS : v;
    }

    public String getToken() {
        return token;
    }

    public void setToken(String token) {
        this.token = (token == null || token.isBlank()) ? null : token.trim();
    }

    public LocalDateTime getCreatedAt() {
        return createdAt;
    }

    public void setCreatedAt(LocalDateTime createdAt) {
        this.createdAt = createdAt;
    }

    public LocalDateTime getUpdatedAt() {
        return updatedAt;
    }

    public void setUpdatedAt(LocalDateTime updatedAt) {
        this.updatedAt = updatedAt;
    }

    @PreUpdate
    public void preUpdate() {
        this.updatedAt = LocalDateTime.now();
    }

    @Override
    public String toString() {
        return "OPPARTEntity{" +
                "id=" + id +
                ", client='" + client + '\'' +
                ", typeOp='" + typeOp + '\'' +
                ", montant=" + montant +
                ", dateOperation=" + dateOperation +
                ", dateOperationPart=" + dateOperationPart +
                ", dateDemande=" + dateDemande +
                ", idTransaction='" + idTransaction + '\'' +
                ", pays='" + pays + '\'' +
                ", source='" + source + '\'' +
                ", statut='" + statut + '\'' +
                ", token='" + token + '\'' +
                ", createdAt=" + createdAt +
                ", updatedAt=" + updatedAt +
                '}';
    }
}