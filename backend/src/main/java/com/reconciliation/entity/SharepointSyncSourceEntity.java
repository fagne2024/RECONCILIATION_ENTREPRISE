package com.reconciliation.entity;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;

import java.time.LocalDateTime;

/**
 * Lien SharePoint scanné par la synchronisation : page, dossier ou fichier du site, motif du
 * nom de fichier (le plus récent est retenu) et feuilles à lire.
 *
 * <p>Curseur : {@code lastFileId} + dernière ligne chargée (index 0-based) par feuille.
 * Quand le dernier fichier change (nouveau mois), les curseurs repartent de l'en-tête.</p>
 */
@Entity
@EntityListeners(com.reconciliation.tenant.TenantGuardEntityListener.class)
@Table(name = "sharepoint_sync_source")
@Getter
@Setter
public class SharepointSyncSourceEntity {

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

    /** Lien de la page, du dossier ou d'un fichier du site SharePoint. */
    @Column(name = "url", nullable = false, length = 2000)
    private String url;

    /** Texte contenu dans le nom du fichier (ex. « SN_SUIVI_OPS »). */
    @Column(name = "file_pattern", length = 200)
    private String filePattern;

    @Column(name = "sheet_client", length = 150)
    private String sheetClient;

    @Column(name = "sheet_fournisseur", length = 150)
    private String sheetFournisseur;

    @Column(name = "enabled", nullable = false)
    private Boolean enabled = true;

    @Column(name = "last_file_id")
    private String lastFileId;

    @Column(name = "last_file_name", length = 500)
    private String lastFileName;

    /** Dernière ligne (index Excel 0-based) chargée dans la feuille « Compense client ». */
    @Column(name = "last_row_client")
    private Integer lastRowClient;

    /** Dernière ligne (index Excel 0-based) chargée dans la feuille « Compense fournisseur ». */
    @Column(name = "last_row_fournisseur")
    private Integer lastRowFournisseur;

    /** Clé de doublon de la dernière ligne chargée (feuille client) : contrôle que le curseur est toujours valable. */
    @Column(name = "last_row_key_client", length = 500)
    private String lastRowKeyClient;

    /** Clé de doublon de la dernière ligne chargée (feuille fournisseur). */
    @Column(name = "last_row_key_fournisseur", length = 500)
    private String lastRowKeyFournisseur;

    @Column(name = "last_run_at")
    private LocalDateTime lastRunAt;

    @Column(name = "last_status", length = 20)
    private String lastStatus;

    @Column(name = "last_message", length = 2000)
    private String lastMessage;

    @Column(name = "created_at")
    private LocalDateTime createdAt;

    @Column(name = "updated_at")
    private LocalDateTime updatedAt;
}
