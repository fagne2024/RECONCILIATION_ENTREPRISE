package com.reconciliation.entity;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;

import java.time.LocalDate;
import java.time.LocalDateTime;

/** Extraction BigQuery (exécution d'une requête) et fichier CSV produit côté serveur. */
@Entity
@EntityListeners(com.reconciliation.tenant.TenantGuardEntityListener.class)
@Table(name = "bigquery_extract")
@Getter
@Setter
public class BigQueryExtractEntity {

    public static final String STATUS_OK = "OK";
    public static final String STATUS_ERREUR = "ERREUR";
    public static final String STATUS_EN_COURS = "EN_COURS";

    public static final String DECLENCHEUR_AUTO = "AUTO";
    public static final String DECLENCHEUR_MANUEL = "MANUEL";

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** Entreprise proprietaire (isolation multi-entreprise, colonne technique). */
    @org.hibernate.annotations.TenantId
    @Column(name = "entreprise_id", nullable = false)
    @com.fasterxml.jackson.annotation.JsonIgnore
    private Long entrepriseId;

    @Column(name = "query_id")
    private Long queryId;

    @Column(name = "query_libelle", length = 150)
    private String queryLibelle;

    /** Valeur du paramètre @date (date des opérations extraites). */
    @Column(name = "date_param")
    private LocalDate dateParam;

    @Column(name = "declencheur", nullable = false, length = 20)
    private String declencheur;

    @Column(name = "utilisateur")
    private String utilisateur;

    @Column(name = "started_at", nullable = false)
    private LocalDateTime startedAt;

    @Column(name = "ended_at")
    private LocalDateTime endedAt;

    @Column(name = "status", nullable = false, length = 20)
    private String status;

    @Column(name = "row_count", nullable = false)
    private Long rowCount = 0L;

    @Column(name = "file_name")
    private String fileName;

    @Column(name = "file_bytes")
    private Long fileBytes;

    @Column(name = "message", length = 4000)
    private String message;
}
