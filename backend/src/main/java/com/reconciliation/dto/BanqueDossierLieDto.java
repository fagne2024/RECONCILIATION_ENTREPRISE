package com.reconciliation.dto;

import com.reconciliation.entity.OperationBancaireEntity;
import com.reconciliation.entity.ReleveBancaireEntity;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

/** Échanges de l'API des dossiers liés de la page Banque. */
public final class BanqueDossierLieDto {

    private BanqueDossierLieDto() {}

    /** Ligne d'un dossier : OPERATION/RELEVE + identifiant + rôle. */
    public record Ligne(String typeLigne, Long ligneId, String role) {}

    /** Création / modification : les lignes envoyées remplacent celles du dossier. */
    public record SaveRequest(String libelle, String commentaire, List<Ligne> lignes, Boolean deplacer) {}

    /** Dossier avec ses lignes (sans le détail des opérations), pour marquer les lignes liées dans les tableaux. */
    public record Resume(Long id, String libelle, String commentaire, String createdBy, LocalDateTime createdAt,
                         String updatedBy, LocalDateTime updatedAt, List<Ligne> lignes) {}

    /** Ligne détaillée : l'opération bancaire ou la ligne de relevé complète (null si supprimée depuis). */
    public record LigneDetail(String typeLigne, Long ligneId, String role, Double montant,
                              OperationBancaireEntity operation, ReleveBancaireEntity releve) {}

    /** Détail complet d'un dossier : toutes les lignes, montants par rôle et synthèse. */
    public record Detail(Resume dossier, List<LigneDetail> lignes, Map<String, Double> totauxParRole,
                         Synthese synthese) {}

    /**
     * Synthèse d'un préfinancement : appro, frais, remboursement du reliquat et écarts avec les contreparties.
     * Montants en valeur absolue. {@code totalFrais} = frais sur le montant utilisé (seuls frais retenus) ;
     * {@code fraisAppro} = frais prévus sur tout le préfinancement ; {@code ecartFrais} = prévus − retenus.
     */
    public record Synthese(double appro, double approContrepartie, double ecartAppro,
                           double fraisAppro, double remboursement, double remboursementContrepartie,
                           double ecartRemboursement, double fraisRemboursement, double totalFrais,
                           double ecartFrais, double montantUtilise, double autres) {}
}
