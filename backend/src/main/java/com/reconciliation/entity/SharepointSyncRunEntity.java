package com.reconciliation.entity;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;

import java.time.LocalDateTime;

/** Historique d'une exécution de la synchronisation SharePoint pour un lien. */
@Entity
@EntityListeners(com.reconciliation.tenant.TenantGuardEntityListener.class)
@Table(name = "sharepoint_sync_run")
@Getter
@Setter
public class SharepointSyncRunEntity {

    public static final String STATUS_OK = "OK";
    public static final String STATUS_ERREUR = "ERREUR";

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

    @Column(name = "source_id")
    private Long sourceId;

    @Column(name = "source_libelle", length = 150)
    private String sourceLibelle;

    @Column(name = "declencheur", nullable = false, length = 20)
    private String declencheur;

    @Column(name = "utilisateur")
    private String utilisateur;

    @Column(name = "started_at", nullable = false)
    private LocalDateTime startedAt;

    @Column(name = "ended_at")
    private LocalDateTime endedAt;

    @Column(name = "file_name", length = 500)
    private String fileName;

    @Column(name = "status", nullable = false, length = 20)
    private String status;

    @Column(name = "lignes_lues", nullable = false)
    private Integer lignesLues = 0;

    @Column(name = "lignes_chargees", nullable = false)
    private Integer lignesChargees = 0;

    @Column(name = "doublons", nullable = false)
    private Integer doublons = 0;

    /** Lignes lues mais datées d'un autre mois que le mois en cours (non chargées). */
    @Column(name = "hors_mois", nullable = false)
    private Integer horsMois = 0;

    @Column(name = "message", length = 4000)
    private String message;
}
