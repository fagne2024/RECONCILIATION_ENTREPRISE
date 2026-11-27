package com.reconciliation.entity;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;

import java.time.LocalDateTime;

/**
 * Requête BigQuery dont le résultat sert de fichier BO dans le Lanceur.
 *
 * <p>Le paramètre nommé {@code @date} (type DATE) reçoit la date de la réconciliation
 * (la veille par défaut). Le fichier produit s'appelle {@code <boFilePrefix>_BQ_<aaaammjj>.csv}
 * pour être reconnu par le modèle BO dont le motif contient ce préfixe (ex. *TRXBO*.csv).</p>
 */
@Entity
@EntityListeners(com.reconciliation.tenant.TenantGuardEntityListener.class)
@Table(name = "bigquery_query")
@Getter
@Setter
public class BigQueryQueryEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** Entreprise proprietaire (isolation multi-entreprise, colonne technique). */
    @org.hibernate.annotations.TenantId
    @Column(name = "entreprise_id", nullable = false)
    @com.fasterxml.jackson.annotation.JsonIgnore
    private Long entrepriseId;

    @Column(name = "libelle", nullable = false, length = 150)
    private String libelle;

    @Column(name = "sql_text", nullable = false, columnDefinition = "TEXT")
    private String sqlText;

    @Column(name = "bo_file_prefix", nullable = false, length = 100)
    private String boFilePrefix;

    @Column(name = "enabled", nullable = false)
    private Boolean enabled = true;

    @Column(name = "created_at")
    private LocalDateTime createdAt;

    @Column(name = "updated_at")
    private LocalDateTime updatedAt;
}
